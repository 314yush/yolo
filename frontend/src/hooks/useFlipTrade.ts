'use client';

/**
 * useFlipTrade — Optimized flip flow
 *
 * Flow:
 * 1. Resolve on-chain openedAt + tradeIndex before signing close
 * 2. Close, read balance, open (sequential — parallel causes nonce collision)
 * 3. Use pnlData from store for logging
 * 4. Exclude old position from PnL matching for 30s to prevent entry price jump
 */

import { useCallback, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisTradeExecution } from './useAvantisTradeExecution';
import { useSound } from './useSound';
import { useUsdcBalance } from './useUsdcBalance';
import { saveClosedTrade } from '@/lib/closedTrades';
import { logTradeCloseByPosition } from '@/lib/activityApi';
import { validatePositionSize, AVANTIS_CONTRACTS } from '@/lib/avantisTradeMath';
import type { Trade } from '@/types';
import { DIRECTIONS, LEVERAGES } from '@/lib/constants';
import { findAssetByPairIndex } from '@/lib/assetPair';
import { publicClient } from '@/lib/viemClient';
import { debug } from '@/lib/debug';
import { buildFlipExcludedPositionKey } from '@/lib/flipExcludedPosition';
import { useAvantisAPI } from './useAvantisAPI';
import {
  POSITION_NOT_READY_MESSAGE,
  resolveClosePosition,
} from '@/lib/resolveClosePosition';

const BALANCE_OF_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
] as const;

export async function readUsdcBalanceWithRetry(address: `0x${string}`): Promise<number> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const balanceBigInt = await publicClient.readContract({
        address: AVANTIS_CONTRACTS.USDC,
        abi: BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      return Number(balanceBigInt) / 1e6;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      console.warn('Failed to read USDC balance after retries:', err);
      return 0;
    }
  }
  return 0;
}

export function useFlipTrade() {
  const {
    userAddress,
    pnlData,
    setFlipExcludedPositionKey,
    setCurrentTrade,
    setPnLData,
    setPositionSource,
    setLastPositionEventAt,
    incrementTotalTrades,
    incrementVolume,
    setSelection,
    selection,
    addPendingTradeHash,
    removePendingTradeHash,
    addPendingOpenTxHash,
    showToast,
    prices,
    setIsIntentionalClose,
  } = useTradeStore();
  const { openMarket, closeMarket } = useAvantisTradeExecution();
  const { getTrades } = useAvantisAPI();
  const { refetch: refetchBalance } = useUsdcBalance();
  const { playFlip } = useSound();
  const [isFlipping, setIsFlipping] = useState(false);

  const flipTrade = useCallback(
    async (trade: Trade) => {
      const { setupStatus } = useTradeStore.getState();
      if (!setupStatus.isSetup) {
        throw new Error('Please complete setup before trading. Approve USDC in the setup flow first.');
      }

      if (!userAddress) {
        throw new Error('Missing user address');
      }

      const { positionSource } = useTradeStore.getState();
      const resolved = await resolveClosePosition({
        trade,
        positionSource,
        fetchTrades: () => getTrades(userAddress),
      });
      if (!resolved) {
        throw new Error(POSITION_NOT_READY_MESSAGE);
      }
      if (
        resolved.tradeIndex !== trade.tradeIndex ||
        resolved.openedAt !== trade.openedAt
      ) {
        setCurrentTrade(resolved);
        setPositionSource('poll');
      }

      const excludedKey = buildFlipExcludedPositionKey(resolved);
      setFlipExcludedPositionKey(excludedKey);

      if (resolved.pairIndex === undefined || resolved.tradeIndex === undefined) {
        throw new Error(`Invalid trade data: missing pairIndex or tradeIndex. Trade: ${JSON.stringify(resolved)}`);
      }

      const validation = validatePositionSize(resolved.collateral, resolved.leverage, resolved.pairIndex);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      setIsFlipping(true);
      setIsIntentionalClose(true);

      const pairToUse = resolved.pair;
      const flippedIsLong = !resolved.isLong;

      try {
        const currentPrice = prices[pairToUse]?.price;
        if (!currentPrice || currentPrice <= 0) {
          throw new Error(`No price available for ${pairToUse}. Wait for the price feed.`);
        }

        debug(`[flipTrade] Close then open: ${pairToUse} ${trade.isLong ? 'LONG' : 'SHORT'} → ${flippedIsLong ? 'LONG' : 'SHORT'}`);

        const closeTxHash = await closeMarket({
          trader: userAddress,
          pairIndex: resolved.pairIndex,
          tradeIndex: resolved.tradeIndex,
          collateralToClose: resolved.collateral,
          openTimestamp: resolved.openedAt,
          expectedPrice: currentPrice,
          isPnl: resolved.isPnl,
        });

        // Read balance immediately — close already waited for confirmation/fill
        const actualUsdcBalance = await readUsdcBalanceWithRetry(userAddress);
        const availableCollateral = Math.min(actualUsdcBalance, resolved.collateral);

        const afterClose = validatePositionSize(
          availableCollateral,
          resolved.leverage,
          resolved.pairIndex
        );
        if (!afterClose.valid) {
          throw new Error(
            `Cannot flip: After closing, available balance (${actualUsdcBalance.toFixed(2)} USDC) is insufficient. ${afterClose.error}`
          );
        }

        const openTxHash = await openMarket({
          trader: userAddress,
          pairIndex: resolved.pairIndex,
          collateral: availableCollateral,
          leverage: resolved.leverage,
          isLong: flippedIsLong,
          openPrice: currentPrice,
          takeProfitPercent: useTradeStore.getState().settings.takeProfitPercent ?? 200,
        });

        const finalPnL =
          pnlData &&
          pnlData.trade.pairIndex === resolved.pairIndex &&
          pnlData.trade.tradeIndex === resolved.tradeIndex
            ? pnlData
            : null;
        saveClosedTrade(userAddress, resolved, finalPnL, { closeTxHash });
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: resolved.pairIndex,
          tradeIndex: resolved.tradeIndex,
          exitPrice: finalPnL?.currentPrice,
          pnl: finalPnL?.grossPnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });

        addPendingTradeHash(openTxHash);
        addPendingOpenTxHash(openTxHash);

        // Check if usePositionSync already resolved the new position via Pusher
        // while we were awaiting signAndBroadcast. If so, don't overwrite with oracle price.
        const storeNow = useTradeStore.getState();
        const pusherAlreadyResolved =
          storeNow.positionSource === 'pusher' &&
          storeNow.currentTrade?.pairIndex === resolved.pairIndex &&
          storeNow.currentTrade?.tradeIndex !== 0 &&
          storeNow.currentTrade?.isLong === flippedIsLong;

        if (!pusherAlreadyResolved) {
          const optimisticTrade: Trade = {
            ...resolved,
            isLong: flippedIsLong,
            openPrice: currentPrice,
            collateral: availableCollateral,
            tradeIndex: 0,
            openedAt: Math.floor(Date.now() / 1000),
          };

          setCurrentTrade(optimisticTrade);
          setPnLData({
            trade: optimisticTrade,
            currentPrice,
            pnl: 0,
            pnlPercentage: 0,
            grossPnl: 0,
            grossPnlPercentage: 0,
          });
          setPositionSource('placeholder');
          setLastPositionEventAt(null);
        } else {
          debug('[flipTrade] Pusher already resolved the new position — skipping oracle placeholder');
        }

        if (selection) {
          const newDirection = DIRECTIONS.find((d) => d.isLong === flippedIsLong) || DIRECTIONS[0];
          const asset = findAssetByPairIndex(resolved.pairIndex) || selection.asset;
          const leverage = LEVERAGES.find((l) => l.value === resolved.leverage) || selection.leverage;
          setSelection({ asset, leverage, direction: newDirection });
        }

        incrementTotalTrades();
        incrementVolume(availableCollateral, resolved.leverage);
        removePendingTradeHash(openTxHash);

        const directionText = flippedIsLong ? 'LONG' : 'SHORT';
        showToast(
          `Flip trade opened! ${pairToUse} ${directionText} at ${resolved.leverage}x leverage`,
          'success',
          5000
        );
        playFlip();

        refetchBalance();
      } catch (error) {
        console.error('Flip trade error:', error);
        throw error;
      } finally {
        setIsFlipping(false);
        setIsIntentionalClose(false);
        setTimeout(() => setFlipExcludedPositionKey(null), 30_000);
      }
    },
    [
      userAddress,
      refetchBalance,
      pnlData,
      setFlipExcludedPositionKey,
      openMarket,
      closeMarket,
      setCurrentTrade,
      setPnLData,
      setPositionSource,
      setLastPositionEventAt,
      incrementTotalTrades,
      incrementVolume,
      setSelection,
      selection,
      addPendingTradeHash,
      removePendingTradeHash,
      addPendingOpenTxHash,
      showToast,
      prices,
      playFlip,
      setIsIntentionalClose,
      getTrades,
    ]
  );

  return { flipTrade, isFlipping };
}
