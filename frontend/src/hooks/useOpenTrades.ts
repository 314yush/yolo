'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from './useAvantisAPI';
import type { Trade, PnLData } from '@/types';

interface TradeWithPnL {
  trade: Trade;
  pnlData?: PnLData;
}

export function useOpenTrades() {
  const { userAddress, setOpenTrades, updateActivePositions } = useTradeStore();
  const { getTrades, getPnL } = useAvantisAPI();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

      // Update store
      setOpenTrades(trades);
      updateActivePositions(trades.length);

      return tradesWithPnL;
    } catch (error) {
      console.error('[useOpenTrades] Failed to fetch trades:', error);
      return [];
    }
  }, [userAddress, getTrades, getPnL, setOpenTrades, updateActivePositions]);

  // Fetch on mount and poll for updates
  useEffect(() => {
    if (!userAddress) return;

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
  }, [userAddress]); // Only depend on userAddress, fetchTrades is stable

  return { fetchTrades };
}
