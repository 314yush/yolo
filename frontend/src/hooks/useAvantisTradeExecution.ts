'use client';

/**
 * Unified open/close execution for Avantis v1 (Tachyon + encoder) and v2 (intents + batched-market).
 */

import { useCallback } from 'react';
import { useTxSigner } from './useTxSigner';
import {
  AVANTIS_V2_ENABLED,
  executeOpenTradeV2,
  executeCloseTradeV2,
} from '@/lib/avantisV2';
import {
  buildOpenTradeTx,
  buildCloseTradeTx,
  calculateTakeProfitMultiplier,
} from '@/lib/avantisEncoder';
import { useTradeStore } from '@/store/tradeStore';
import { debug } from '@/lib/debug';

export type OpenExecutionParams = {
  trader: `0x${string}`;
  pairIndex: number;
  collateral: number;
  leverage: number;
  isLong: boolean;
  openPrice: number;
  takeProfitPercent?: number;
};

export type CloseExecutionParams = {
  trader: `0x${string}`;
  pairIndex: number;
  tradeIndex: number;
  collateralToClose: number;
  openTimestamp: number;
  expectedPrice: number;
  isPnl?: boolean;
};

export function useAvantisTradeExecution() {
  const { signAndBroadcast, signAndWait, isPending } = useTxSigner();

  const openMarket = useCallback(
    async (params: OpenExecutionParams): Promise<`0x${string}`> => {
      const takeProfitPercent =
        params.takeProfitPercent ??
        useTradeStore.getState().settings.takeProfitPercent ??
        200;

      if (AVANTIS_V2_ENABLED) {
        debug('[AvantisV2] openMarket via intent + batched-market');
        const result = await executeOpenTradeV2({
          ...params,
          takeProfitPercent,
        });
        return result.txHash;
      }

      const tx = buildOpenTradeTx({
        trader: params.trader,
        pairIndex: params.pairIndex,
        collateral: params.collateral,
        leverage: params.leverage,
        isLong: params.isLong,
        openPrice: params.openPrice,
        takeProfitMultiplier: calculateTakeProfitMultiplier(
          params.isLong,
          params.leverage,
          takeProfitPercent
        ),
      });
      return signAndBroadcast(tx);
    },
    [signAndBroadcast]
  );

  const closeMarket = useCallback(
    async (params: CloseExecutionParams): Promise<`0x${string}`> => {
      if (AVANTIS_V2_ENABLED) {
        debug('[AvantisV2] closeMarket via intent + batched-market');
        const result = await executeCloseTradeV2({
          trader: params.trader,
          pairIndex: params.pairIndex,
          tradeIndex: params.tradeIndex,
          collateralToClose: params.collateralToClose,
          openTimestamp: params.openTimestamp,
          expectedPrice: params.expectedPrice,
          isPnl: params.isPnl !== false,
        });
        return result.txHash;
      }

      const tx = buildCloseTradeTx({
        trader: params.trader,
        pairIndex: params.pairIndex,
        tradeIndex: params.tradeIndex,
        collateralToClose: params.collateralToClose,
      });
      const { hash } = await signAndWait(tx);
      return hash;
    },
    [signAndWait]
  );

  return {
    openMarket,
    closeMarket,
    isPending,
    isV2: AVANTIS_V2_ENABLED,
  };
}
