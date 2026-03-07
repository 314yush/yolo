'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from './useAvantisAPI';
import { logTradeOpen } from '@/lib/activityApi';
import type { Trade, PnLData } from '@/types';

interface TradeWithPnL {
  trade: Trade;
  pnlData?: PnLData;
}

export function useOpenTrades() {
  const { userAddress, setOpenTrades, updateActivePositions, incrementVolume, popPendingOpenTxHash } = useTradeStore();
  const { getTrades, getPnL } = useAvantisAPI();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Track which trades we've already counted for volume (by pairIndex-tradeIndex)
  const countedTradesRef = useRef<Set<string>>(new Set());
  // Track which trades we've already logged to activity API
  const loggedTradesRef = useRef<Set<string>>(new Set());

  const fetchTrades = useCallback(async () => {
    if (!userAddress) {
      return [];
    }

    try {
      // Fetch trades and PnL in parallel
      const [trades, positions] = await Promise.all([
        getTrades(userAddress),
        getPnL(userAddress),
      ]);

      // Create a map of PnL data by trade key (pairIndex + tradeIndex)
      const pnlMap = new Map<string, PnLData>();
      positions.forEach((pos) => {
        const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
        pnlMap.set(key, pos);
      });

      // Combine trades with their PnL data
      const tradesWithPnL: TradeWithPnL[] = trades.map((trade) => {
        const key = `${trade.pairIndex}-${trade.tradeIndex}`;
        return {
          trade,
          pnlData: pnlMap.get(key),
        };
      });

      // Check for new trades: increment volume and log to activity API
      trades.forEach((trade) => {
        const tradeKey = `${trade.pairIndex}-${trade.tradeIndex}`;
        if (!countedTradesRef.current.has(tradeKey)) {
          incrementVolume(trade.collateral, trade.leverage);
          countedTradesRef.current.add(tradeKey);
        }
        // Log to activity API when we have a pending open tx hash (FIFO)
        if (!loggedTradesRef.current.has(tradeKey)) {
          const txHash = popPendingOpenTxHash();
          if (txHash && userAddress) {
            loggedTradesRef.current.add(tradeKey);
            logTradeOpen({
              wallet: userAddress,
              pair: trade.pair,
              pairIndex: trade.pairIndex,
              tradeIndex: trade.tradeIndex,
              direction: trade.isLong ? 'LONG' : 'SHORT',
              leverage: trade.leverage,
              collateral: trade.collateral,
              entryPrice: trade.openPrice,
              tpPrice: trade.tp,
              liqPrice: trade.liquidationPrice || undefined,
              txHash,
            });
          }
        }
      });

      // Update store
      setOpenTrades(trades);
      updateActivePositions(trades.length);

      return tradesWithPnL;
    } catch (error) {
      console.error('[useOpenTrades] Failed to fetch trades:', error);
      return [];
    }
  }, [userAddress, getTrades, getPnL, setOpenTrades, updateActivePositions, incrementVolume, popPendingOpenTxHash]);

  // Fetch on mount and poll for updates
  useEffect(() => {
    if (!userAddress) {
      countedTradesRef.current.clear();
      loggedTradesRef.current.clear();
      return;
    }

    let isMounted = true;

    // Fetch immediately
    fetchTrades();

    // Poll every 2 seconds
    intervalRef.current = setInterval(() => {
      if (isMounted) {
        fetchTrades();
      }
    }, 2000);

    return () => {
      isMounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [userAddress, fetchTrades]); // Reset when user changes

  return { fetchTrades };
}
