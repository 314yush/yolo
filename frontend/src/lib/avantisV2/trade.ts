/**
 * High-level v2 trade execution: local intent → sign → batched-market.
 */

import { getOrCreateDelegateWallet } from '@/lib/delegateWallet';
import { AGGREGATOR_ORDER_TYPE, OPEN_ORDER_TYPE } from './config';
import { executeBatchedMarket, type BatchedMarketOutcome } from './batchedMarket';
import { LocalIntentBuilder, type IntentPayload } from './localIntents';
import { fetchAvantisMeta } from './meta';
import { signIntentWithPrivateKey } from './signIntent';
import { calculateTakeProfitMultiplier } from '@/lib/avantisEncoder';

export type OpenTradeV2Params = {
  trader: `0x${string}`;
  pairIndex: number;
  collateral: number;
  leverage: number;
  isLong: boolean;
  openPrice: number;
  takeProfitMultiplier?: number;
  takeProfitPercent?: number;
  slippagePercent?: number;
  wait?: boolean;
};

export type CloseTradeV2Params = {
  trader: `0x${string}`;
  pairIndex: number;
  tradeIndex: number;
  collateralToClose: number;
  openTimestamp: number;
  expectedPrice: number;
  /** ZFP positions must close with MARKET_CLOSE_PNL. Default true for YOLO. */
  isPnl?: boolean;
  wait?: boolean;
};

export type TradeExecutionResult = {
  txHash: `0x${string}`;
  trackingId: string;
  orderId: number | null;
  outcome: BatchedMarketOutcome;
};

let builderPromise: Promise<LocalIntentBuilder> | null = null;

async function getBuilder(): Promise<LocalIntentBuilder> {
  if (!builderPromise) {
    builderPromise = fetchAvantisMeta().then((meta) =>
      LocalIntentBuilder.fromMeta(meta)
    );
  }
  return builderPromise;
}

export async function buildOpenIntent(
  params: OpenTradeV2Params
): Promise<IntentPayload> {
  const builder = await getBuilder();
  const tpMult =
    params.takeProfitMultiplier ??
    calculateTakeProfitMultiplier(
      params.isLong,
      params.leverage,
      params.takeProfitPercent ?? 200
    );
  const tp = params.isLong
    ? params.openPrice * tpMult
    : params.openPrice * tpMult;

  return builder.openTrade({
    trader: params.trader,
    pairIndex: params.pairIndex,
    isLong: params.isLong,
    collateralUsdc: params.collateral,
    leverage: params.leverage,
    openPrice: params.openPrice,
    orderType: OPEN_ORDER_TYPE.MARKET_PNL,
    tp,
    sl: 0,
    slippagePercent: params.slippagePercent ?? 1,
  });
}

export async function buildCloseIntent(
  params: CloseTradeV2Params
): Promise<IntentPayload> {
  const builder = await getBuilder();
  return builder.closeTrade({
    trader: params.trader,
    pairIndex: params.pairIndex,
    index: params.tradeIndex,
    openTimestamp: params.openTimestamp,
    amountUsdc: params.collateralToClose,
    wantedPrice: params.expectedPrice,
  });
}

async function submitIntent(
  payload: IntentPayload,
  orderType: number,
  wait: boolean
): Promise<TradeExecutionResult> {
  const wallet = getOrCreateDelegateWallet();
  const signed = await signIntentWithPrivateKey(
    payload,
    wallet.privateKey as `0x${string}`
  );

  const outcome = await executeBatchedMarket({
    orderType,
    userIntent: signed.payload.encodedIntent,
    userSignature: signed.signature,
    wait,
  });

  if (!outcome.txHash) {
    throw new Error(
      wait
        ? 'Trade settled without a transaction hash'
        : `Order accepted (tracking ${outcome.trackingId}) but not yet mined`
    );
  }

  return {
    txHash: outcome.txHash,
    trackingId: outcome.trackingId,
    orderId: outcome.orderId,
    outcome,
  };
}

export async function executeOpenTradeV2(
  params: OpenTradeV2Params
): Promise<TradeExecutionResult> {
  const intent = await buildOpenIntent(params);
  return submitIntent(
    intent,
    AGGREGATOR_ORDER_TYPE.MARKET_OPEN_PNL,
    params.wait !== false
  );
}

export async function executeCloseTradeV2(
  params: CloseTradeV2Params
): Promise<TradeExecutionResult> {
  const intent = await buildCloseIntent(params);
  const orderType =
    params.isPnl === false
      ? AGGREGATOR_ORDER_TYPE.MARKET_CLOSE
      : AGGREGATOR_ORDER_TYPE.MARKET_CLOSE_PNL;
  return submitIntent(intent, orderType, params.wait !== false);
}
