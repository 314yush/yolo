/**
 * High-level v2 trade execution: local intent → sign → batched-market.
 */

import { AGGREGATOR_ORDER_TYPE, OPEN_ORDER_TYPE } from './config';
import { executeBatchedMarket, type BatchedMarketOutcome } from './batchedMarket';
import { LocalIntentBuilder, type IntentPayload } from './localIntents';
import { fetchAvantisMeta } from './meta';
import { isPnlPair, loadPairCatalog } from './pairs';
import { signIntentWithAccount, type IntentSigner } from './signIntent';
import { calculateTakeProfitMultiplier } from '@/lib/avantisTradeMath';

export type OpenTradeV2Params = {
  trader: `0x${string}`;
  /** The trader's own wallet. v2 accepts a self-signed intent, so there is no delegate. */
  signer: IntentSigner;
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
  signer: IntentSigner;
  pairIndex: number;
  tradeIndex: number;
  collateralToClose: number;
  openTimestamp: number;
  expectedPrice: number;
  /**
   * Whether the position was opened on the PnL path. Pass the `isPnl` flag the
   * positions API reports — positions carried over from v1 can be PnL trades on
   * a pair that is no longer PnL-capable, so the pair alone can't decide this.
   */
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
    // Both are cached and fetched in parallel, so this is one round trip. The
    // catalog has to be in before isPnlPair() decides how an order routes.
    builderPromise = Promise.all([fetchAvantisMeta(), loadPairCatalog()]).then(
      ([meta]) => LocalIntentBuilder.fromMeta(meta)
    );
  }
  return builderPromise;
}

/**
 * Warm the meta + pair caches so the first trade doesn't pay for them.
 * Safe to call repeatedly; callers can ignore the result.
 */
export function primeAvantisV2(): Promise<unknown> {
  return getBuilder().catch(() => undefined);
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
  const tp = params.openPrice * tpMult;

  return builder.openTrade({
    trader: params.trader,
    pairIndex: params.pairIndex,
    isLong: params.isLong,
    collateralUsdc: params.collateral,
    leverage: params.leverage,
    openPrice: params.openPrice,
    orderType: isPnlPair(params.pairIndex)
      ? OPEN_ORDER_TYPE.MARKET_PNL
      : OPEN_ORDER_TYPE.MARKET,
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
  signer: IntentSigner,
  orderType: number,
  wait: boolean
): Promise<TradeExecutionResult> {
  const signed = await signIntentWithAccount(payload, signer);

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
    params.signer,
    isPnlPair(params.pairIndex)
      ? AGGREGATOR_ORDER_TYPE.MARKET_OPEN_PNL
      : AGGREGATOR_ORDER_TYPE.MARKET_OPEN,
    params.wait !== false
  );
}

export async function executeCloseTradeV2(
  params: CloseTradeV2Params
): Promise<TradeExecutionResult> {
  const intent = await buildCloseIntent(params);
  const isPnl = params.isPnl ?? isPnlPair(params.pairIndex);
  return submitIntent(
    intent,
    params.signer,
    isPnl
      ? AGGREGATOR_ORDER_TYPE.MARKET_CLOSE_PNL
      : AGGREGATOR_ORDER_TYPE.MARKET_CLOSE,
    params.wait !== false
  );
}
