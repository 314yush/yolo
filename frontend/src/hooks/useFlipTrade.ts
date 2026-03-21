'use client';

/**
 * useFlipTrade — Optimized flip flow
 *
 * Flow:
 * 1. Use trade from UI (no getPnL API call for resolution)
 * 2. Close, read balance, open (sequential — parallel causes nonce collision)
 * 3. Use pnlData from store for logging
 * 4. Exclude old position from PnL matching for 30s to prevent entry price jump
 */

import { useCallback, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from './useDelegateWallet';
import { useTxSigner } from './useTxSigner';
import { useSound } from './useSound';
import { useUsdcBalance } from './useUsdcBalance';
import { saveClosedTrade } from '@/lib/closedTrades';
import { logTradeCloseByPosition } from '@/lib/activityApi';
import {
  buildFlipTradeTxs,
  validatePositionSize,
  AVANTIS_CONTRACTS,
} from '@/lib/avantisEncoder';
import type { Trade } from '@/types';
import { DIRECTIONS, ASSETS, LEVERAGES } from '@/lib/constants';
import { publicClient } from '@/lib/viemClient';
import { debug } from '@/lib/debug';

const BALANCE_OF_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
] as const;

async function readUsdcBalanceWithRetry(address: `0x${string}`): Promise<number> {
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

const MIN_POSITION_SIZE_USD = 100;

export function useFlipTrade() {
  const {
    userAddress,
    pnlData,
    setFlipExcludedPositionKey,
    setCurrentTrade,
    setPnLData,
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
  const { delegateAddress } = useDelegateWallet();
  const { signAndBroadcast } = useTxSigner();
  const { refetch: refetchBalance } = useUsdcBalance();
  const { playFlip } = useSound();
  const [isFlipping, setIsFlipping] = useState(false);

  const flipTrade = useCallback(
    async (trade: Trade) => {
      const { delegateStatus } = useTradeStore.getState();
      if (!delegateStatus.isSetup) {
        throw new Error('Please complete setup before trading. Enable trading in the setup flow first.');
      }

      if (!userAddress || !delegateAddress) {
        throw new Error('Missing user address or delegate address');
      }

      const excludedKey = `${trade.pairIndex}-${trade.tradeIndex}`;
      setFlipExcludedPositionKey(excludedKey);

      if (trade.pairIndex === undefined || trade.tradeIndex === undefined) {
        throw new Error(`Invalid trade data: missing pairIndex or tradeIndex. Trade: ${JSON.stringify(trade)}`);
      }

      const validation = validatePositionSize(trade.collateral, trade.leverage);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      setIsFlipping(true);
      setIsIntentionalClose(true);

      const pairToUse = trade.pair;
      const flippedIsLong = !trade.isLong;

      try {
        const currentPrice = prices[pairToUse]?.price ?? prices[`${pairToUse}/USD`]?.price;
        if (!currentPrice || currentPrice <= 0) {
          throw new Error(`No price available for ${pairToUse}. Wait for the price feed.`);
        }

        const closeTx = buildFlipTradeTxs({
          trader: userAddress,
          pairIndex: trade.pairIndex,
          tradeIndex: trade.tradeIndex,
          collateral: trade.collateral,
          leverage: trade.leverage,
          currentIsLong: trade.isLong,
          currentPrice,
          takeProfitPercent: useTradeStore.getState().settings.takeProfitPercent ?? 200,
        }).closeTx;

        debug(`[flipTrade] Close then open: ${pairToUse} ${trade.isLong ? 'LONG' : 'SHORT'} → ${flippedIsLong ? 'LONG' : 'SHORT'}`);

        const closeTxHash = await signAndBroadcast({
          to: closeTx.to,
          data: closeTx.data,
          value: closeTx.value,
          chainId: closeTx.chainId,
        });

        // Read balance immediately — signAndBroadcast already waited for confirmation
        const actualUsdcBalance = await readUsdcBalanceWithRetry(userAddress);
        const availableCollateral = Math.min(actualUsdcBalance, trade.collateral);

        const positionSizeWithAvailable = availableCollateral * trade.leverage;
        if (positionSizeWithAvailable < MIN_POSITION_SIZE_USD) {
          throw new Error(
            `Cannot flip: After closing, available balance (${actualUsdcBalance.toFixed(2)} USDC) ` +
              `is insufficient. With ${trade.leverage}x leverage, minimum is $${(MIN_POSITION_SIZE_USD / trade.leverage).toFixed(2)} USDC.`
          );
        }

        const { openTx } = buildFlipTradeTxs({
          trader: userAddress,
          pairIndex: trade.pairIndex,
          tradeIndex: trade.tradeIndex,
          collateral: availableCollateral,
          leverage: trade.leverage,
          currentIsLong: trade.isLong,
          currentPrice,
          takeProfitPercent: useTradeStore.getState().settings.takeProfitPercent ?? 200,
        });

        const openTxHash = await signAndBroadcast({
          to: openTx.to,
          data: openTx.data,
          value: openTx.value,
          chainId: openTx.chainId,
        });

        const finalPnL =
          pnlData &&
          pnlData.trade.pairIndex === trade.pairIndex &&
          pnlData.trade.tradeIndex === trade.tradeIndex
            ? pnlData
            : null;
        saveClosedTrade(userAddress, trade, finalPnL, { closeTxHash });
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: trade.pairIndex,
          tradeIndex: trade.tradeIndex,
          exitPrice: finalPnL?.currentPrice,
          pnl: finalPnL?.grossPnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });

        addPendingTradeHash(openTxHash);
        addPendingOpenTxHash(openTxHash);

        const optimisticTrade: Trade = {
          ...trade,
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

        if (selection) {
          const newDirection = DIRECTIONS.find((d) => d.isLong === flippedIsLong) || DIRECTIONS[0];
          const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex) || selection.asset;
          const leverage = LEVERAGES.find((l) => l.value === trade.leverage) || selection.leverage;
          setSelection({ asset, leverage, direction: newDirection });
        }

        incrementTotalTrades();
        incrementVolume(availableCollateral, trade.leverage);
        removePendingTradeHash(openTxHash);

        const directionText = flippedIsLong ? 'LONG' : 'SHORT';
        showToast(
          `Flip trade opened! ${pairToUse} ${directionText} at ${trade.leverage}x leverage`,
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
      delegateAddress,
      refetchBalance,
      pnlData,
      setFlipExcludedPositionKey,
      signAndBroadcast,
      setCurrentTrade,
      setPnLData,
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
    ]
  );

  return { flipTrade, isFlipping };
}
