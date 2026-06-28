'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { useTradeStore } from '@/store/tradeStore';
import {
  loadClosedPaperTrades,
  loadOpenPaperTrades,
  computePaperPnL,
} from '@/lib/paperTrades';
import { refreshPaperStats } from '@/lib/paperStats';
import type { ClosedTrade, PnLData, Trade, TradeStats } from '@/types';

export function usePaperActivityData() {
  const { guestId } = usePaperTrading();
  const prices = useTradeStore((s) => s.prices);

  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [stats, setStats] = useState<TradeStats>({ totalTrades: 0, activePositions: 0, totalVolume: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setOpenTrades(loadOpenPaperTrades(guestId));
    setClosedTrades(loadClosedPaperTrades(guestId));
    setStats(refreshPaperStats(guestId));
    setIsLoading(false);
  }, [guestId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openTradesPnL: Record<string, PnLData> = {};
  for (const trade of openTrades) {
    const price = prices[trade.pair]?.price;
    if (price) {
      const key = `${trade.pairIndex}-${trade.tradeIndex}`;
      openTradesPnL[key] = computePaperPnL(trade, price);
    }
  }

  const totalOpenPnL = Object.values(openTradesPnL).reduce((sum, p) => sum + p.pnl, 0);

  return {
    openTrades,
    closedTrades,
    stats,
    openTradesPnL,
    totalOpenPnL,
    isLoadingOpen: isLoading,
    isLoadingClosed: isLoading,
    isLoadingStats: isLoading,
    setOpenTrades,
    setClosedTrades,
    refresh,
  };
}
