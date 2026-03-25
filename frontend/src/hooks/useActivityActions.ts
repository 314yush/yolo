'use client';

import { useState, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { useSound } from '@/hooks/useSound';
import { vibrateMedium } from '@/lib/haptics';
import { saveClosedTrade } from '@/lib/closedTrades';
import { logTradeCloseByPosition, logTradeOpen, getActivityStats } from '@/lib/activityApi';
import { buildCloseTradeTx as buildCloseTradeTxDirect, buildOpenTradeTx as buildOpenTradeTxDirect, calculateTakeProfitMultiplier } from '@/lib/avantisEncoder';
import type { Trade, PnLData, ClosedTrade } from '@/types';

export interface UseActivityActionsProps {
  openTrades: Array<{ trade: Trade; pnlData?: PnLData }>;
  setOpenTrades: React.Dispatch<React.SetStateAction<Array<{ trade: Trade; pnlData?: PnLData }>>>;
  setClosedTrades: React.Dispatch<React.SetStateAction<ClosedTrade[]>>;
  setShowClosedTrades: (show: boolean) => void;
  setShareTrade: (trade: ClosedTrade | null) => void;
  setStats: React.Dispatch<React.SetStateAction<{ total_trades: number; total_volume: number; total_pnl: number; win_rate: number; open_trades: number } | null>>;
  refresh: () => void;
}

export interface UseActivityActionsReturn {
  flip: (trade: Trade) => Promise<void>;
  close: (trade: Trade) => Promise<void>;
  flippingIndex: number | null;
  closingIndex: number | null;
}

export function useActivityActions({
  openTrades,
  setOpenTrades,
  setClosedTrades,
  setShowClosedTrades,
  setShareTrade,
  setStats,
  refresh,
}: UseActivityActionsProps): UseActivityActionsReturn {
  const { userAddress, delegateStatus, showToast, setIsIntentionalClose, addPendingTradeHash, addPendingOpenTxHash, popPendingOpenTxHash, incrementTotalTrades, incrementVolume, updateActivePositions, prices } = useTradeStore();
  const { delegateAddress } = useDelegateWallet();
  const { getTrades, getPnL } = useAvantisAPI();
  const { signAndWait, signAndBroadcast } = useTxSigner();
  const { playWin, playLose, playFlip } = useSound();

  const [flippingIndex, setFlippingIndex] = useState<number | null>(null);
  const [closingIndex, setClosingIndex] = useState<number | null>(null);

  const flip = useCallback(async (trade: Trade) => {
    if (!delegateStatus.isSetup) {
      showToast('Please complete setup before trading. Enable trading in the setup flow first.', 'error');
      return;
    }

    if (!userAddress || !delegateAddress) return;

    const tradeWithPnL = openTrades.find((t) => 
      t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
    );
    
    if (!tradeWithPnL) {
      showToast('Trade not found. Please refresh and try again.', 'error');
      return;
    }

    const verifiedTrade = tradeWithPnL.trade;
    const tradeIndex = openTrades.findIndex((t) => 
      t.trade.pairIndex === verifiedTrade.pairIndex && t.trade.tradeIndex === verifiedTrade.tradeIndex
    );
    setFlippingIndex(tradeIndex);
    setIsIntentionalClose(true);
    vibrateMedium();
    playFlip();

    try {
      const finalPnL = tradeWithPnL.pnlData || null;

      const MIN_POSITION_SIZE_USD = 100;
      const positionSize = verifiedTrade.collateral * verifiedTrade.leverage;
      if (positionSize < MIN_POSITION_SIZE_USD) {
        const minCollateral = MIN_POSITION_SIZE_USD / verifiedTrade.leverage;
        throw new Error(
          `Cannot flip trade: Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE_USD.toFixed(2)}. ` +
          `With ${verifiedTrade.leverage}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC. ` +
          `Current collateral: $${verifiedTrade.collateral.toFixed(2)} USDC`
        );
      }

      const closeTx = buildCloseTradeTxDirect({
        trader: userAddress,
        pairIndex: verifiedTrade.pairIndex,
        tradeIndex: verifiedTrade.tradeIndex,
        collateralToClose: verifiedTrade.collateral,
      });

      const { hash: closeTxHash } = await signAndWait(closeTx);

      if (userAddress) {
        saveClosedTrade(userAddress, verifiedTrade, finalPnL, { closeTxHash });
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: verifiedTrade.pairIndex,
          tradeIndex: verifiedTrade.tradeIndex,
          exitPrice: finalPnL?.currentPrice,
          pnl: finalPnL?.grossPnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });
        refresh();
        setOpenTrades((prev) =>
          prev.filter(
            (t) =>
              !(
                t.trade.pairIndex === verifiedTrade.pairIndex &&
                t.trade.tradeIndex === verifiedTrade.tradeIndex
              )
          )
        );
        const newClosed: ClosedTrade = {
          ...verifiedTrade,
          closedAt: Date.now(),
          finalPnL: finalPnL?.grossPnl ?? 0,
          finalPnLPercentage: finalPnL?.grossPnlPercentage ?? 0,
          closePrice: finalPnL?.currentPrice ?? verifiedTrade.openPrice,
          closeTxHash: closeTxHash as `0x${string}`,
          isLiquidated: false,
        };
        setClosedTrades((prev) => [newClosed, ...prev.filter((t) => t.pairIndex !== verifiedTrade.pairIndex || t.tradeIndex !== verifiedTrade.tradeIndex)]);
      }

      const currentPrice = prices[verifiedTrade.pair]?.price;
      if (!currentPrice) {
        throw new Error(`No price available for ${verifiedTrade.pair}. Wait for the price feed.`);
      }

      const openTx = buildOpenTradeTxDirect({
        trader: userAddress,
        pairIndex: verifiedTrade.pairIndex,
        collateral: verifiedTrade.collateral,
        leverage: verifiedTrade.leverage,
        isLong: !verifiedTrade.isLong,
        openPrice: currentPrice,
        takeProfitMultiplier: calculateTakeProfitMultiplier(
          !verifiedTrade.isLong,
          verifiedTrade.leverage,
          useTradeStore.getState().settings.takeProfitPercent
        ),
      });

      const openHash = await signAndBroadcast(openTx);
      addPendingOpenTxHash(openHash);
      addPendingTradeHash(openHash);

      setTimeout(() => {
        if (!userAddress) return;
        const refreshAfterFlip = async () => {
          try {
            const [trades, positions, stats] = await Promise.all([
              getTrades(userAddress),
              getPnL(userAddress),
              getActivityStats(userAddress),
            ]);
            const pnlMap = new Map<string, PnLData>();
            positions.forEach((pos) => {
              const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
              pnlMap.set(key, pos);
            });
            const combined = trades.map((t) => {
              const key = `${t.pairIndex}-${t.tradeIndex}`;
              return { trade: t, pnlData: pnlMap.get(key) };
            });
            setOpenTrades(combined);
            updateActivePositions(trades.length);
            if (stats) setStats(stats);
            refresh();

            const newTrade = combined.find((c) => c.trade.pairIndex === verifiedTrade.pairIndex);
            if (newTrade) {
              const txHash = popPendingOpenTxHash();
              if (txHash) {
                logTradeOpen({
                  wallet: userAddress,
                  pair: newTrade.trade.pair,
                  pairIndex: newTrade.trade.pairIndex,
                  tradeIndex: newTrade.trade.tradeIndex,
                  direction: newTrade.trade.isLong ? 'LONG' : 'SHORT',
                  leverage: newTrade.trade.leverage,
                  collateral: newTrade.trade.collateral,
                  entryPrice: newTrade.trade.openPrice,
                  tpPrice: newTrade.trade.tp,
                  liqPrice: newTrade.trade.liquidationPrice ?? undefined,
                  txHash,
                });
                incrementTotalTrades();
                incrementVolume(newTrade.trade.collateral, newTrade.trade.leverage);
              }
            }
          } catch (error) {
            console.error('Failed to refresh trades:', error);
          }
        };
        refreshAfterFlip();
      }, 2000);
    } catch (error) {
      console.error('Flip trade error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to flip trade',
        'error',
        undefined,
        { label: 'RETRY', onClick: () => flip(trade) }
      );
    } finally {
      setFlippingIndex(null);
      setIsIntentionalClose(false);
    }
  }, [userAddress, delegateAddress, delegateStatus.isSetup, openTrades, prices, showToast, setIsIntentionalClose, playFlip, signAndWait, signAndBroadcast, addPendingOpenTxHash, addPendingTradeHash, popPendingOpenTxHash, incrementTotalTrades, incrementVolume, updateActivePositions, refresh, setOpenTrades, setClosedTrades, setStats, getTrades, getPnL]);

  const close = useCallback(async (trade: Trade) => {
    if (!delegateStatus.isSetup) {
      showToast('Please complete setup before closing trades. Enable trading in the setup flow first.', 'error');
      return;
    }

    if (!userAddress || !delegateAddress) return;

    const tradeIndex = openTrades.findIndex((t) => 
      t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
    );
    setClosingIndex(tradeIndex);
    setIsIntentionalClose(true);
    vibrateMedium();

    try {
      const tradeWithPnL = openTrades.find((t) => 
        t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
      );
      const finalPnL = tradeWithPnL?.pnlData || null;

      const closeTx = buildCloseTradeTxDirect({
        trader: userAddress,
        pairIndex: trade.pairIndex,
        tradeIndex: trade.tradeIndex,
        collateralToClose: trade.collateral,
      });

      const { hash: closeTxHash } = await signAndWait(closeTx);

      const netPnlPct = finalPnL?.pnlPercentage ?? 0;
      if (netPnlPct >= 0) {
        playWin();
      } else {
        playLose();
      }

      if (userAddress) {
        saveClosedTrade(userAddress, trade, finalPnL, { closeTxHash });
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: trade.pairIndex,
          tradeIndex: trade.tradeIndex,
          exitPrice: finalPnL?.currentPrice,
          pnl: finalPnL?.pnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });
        refresh();
        setOpenTrades((prev) =>
          prev.filter(
            (t) =>
              !(t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex)
          )
        );
        setShowClosedTrades(true);
        const newClosed: ClosedTrade = {
          ...trade,
          closedAt: Date.now(),
          finalPnL: finalPnL?.pnl ?? 0,
          finalPnLPercentage: finalPnL?.pnlPercentage ?? 0,
          closePrice: finalPnL?.currentPrice ?? trade.openPrice,
          closeTxHash: closeTxHash as `0x${string}`,
          isLiquidated: false,
        };
        setClosedTrades((prev) => [newClosed, ...prev.filter((t) => t.pairIndex !== trade.pairIndex || t.tradeIndex !== trade.tradeIndex)]);
      }

      const netPnl = finalPnL?.pnl ?? 0;
      const pnlStr = netPnl >= 0 ? `+$${netPnl.toFixed(2)}` : `-$${Math.abs(netPnl).toFixed(2)}`;
      const closedForShare: ClosedTrade = {
        ...trade,
        closedAt: Date.now(),
        finalPnL: finalPnL?.pnl ?? 0,
        finalPnLPercentage: finalPnL?.pnlPercentage ?? 0,
        closePrice: finalPnL?.currentPrice ?? trade.openPrice,
        closeTxHash: closeTxHash as `0x${string}`,
        isLiquidated: false,
      };
      showToast(`Closed! PnL: ${pnlStr}`, 'success', undefined, {
        label: 'SHARE',
        onClick: () => {
          setShowClosedTrades(true);
          setShareTrade(closedForShare);
        },
      });

      const refreshAfterClose = async () => {
        if (!userAddress) return;
        try {
          const [trades, positions, stats] = await Promise.all([
            getTrades(userAddress),
            getPnL(userAddress),
            getActivityStats(userAddress),
          ]);
          const pnlMap = new Map<string, PnLData>();
          positions.forEach((pos) => {
            const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
            pnlMap.set(key, pos);
          });
          const combined = trades.map((t) => {
            const key = `${t.pairIndex}-${t.tradeIndex}`;
            return { trade: t, pnlData: pnlMap.get(key) };
          });
          setOpenTrades(combined);
          updateActivePositions(trades.length);
          if (stats) setStats(stats);
        } catch (error) {
          console.error('Failed to refresh trades:', error);
        }
      };
      void refreshAfterClose();
      setTimeout(() => {
        void refreshAfterClose();
        refresh();
      }, 1200);
    } catch (error) {
      console.error('Close trade error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to close trade',
        'error',
        undefined,
        { label: 'RETRY', onClick: () => close(trade) }
      );
    } finally {
      setClosingIndex(null);
      setIsIntentionalClose(false);
    }
  }, [userAddress, delegateAddress, delegateStatus.isSetup, openTrades, showToast, setIsIntentionalClose, playWin, playLose, signAndWait, updateActivePositions, refresh, setOpenTrades, setClosedTrades, setShowClosedTrades, setShareTrade, setStats, getTrades, getPnL]);

  return {
    flip,
    close,
    flippingIndex,
    closingIndex,
  };
}
