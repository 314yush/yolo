'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { useTradeStore } from '@/store/tradeStore';
import {
  isLiquidatedByPrice,
  isTakeProfitHitByPrice,
} from '@/lib/paperLiquidation';
import { computePaperPnL } from '@/lib/paperTrades';
import { closePaperTrade } from '@/lib/paperTradeEngine';
import { refreshPaperStats } from '@/lib/paperStats';

interface UsePaperPnLOptions {
  enabled?: boolean;
  interval?: number;
  onAutoClose?: (reason: 'liquidation' | 'takeProfit') => void;
}

export function usePaperPnL(options: UsePaperPnLOptions = {}) {
  const { enabled = true, interval = 400, onAutoClose } = options;
  const { guestId } = usePaperTrading();

  const {
    currentTrade,
    pnlData,
    setPnLData,
    setIsLiquidated,
    setIsTakeProfitHit,
    setLastClosedTradeForShare,
    stage,
    isIntentionalClose,
    prices,
    reset,
    showToast,
  } = useTradeStore();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onAutoCloseRef = useRef(onAutoClose);
  onAutoCloseRef.current = onAutoClose;

  const poll = useCallback(() => {
    if (!enabled || stage !== 'pnl' || isIntentionalClose) return;

    const trade = useTradeStore.getState().currentTrade;
    if (!trade) return;

    const livePrice = useTradeStore.getState().prices[trade.pair]?.price;
    if (!livePrice || livePrice <= 0) return;

    const nextPnL = computePaperPnL(trade, livePrice);
    setPnLData(nextPnL);

    if (isLiquidatedByPrice(livePrice, trade.liquidationPrice, trade.isLong)) {
      const { closedTrade } = closePaperTrade(guestId, trade, livePrice, { isLiquidated: true });
      refreshPaperStats(guestId);
      setIsLiquidated(true);
      setLastClosedTradeForShare(closedTrade);
      showToast('Position liquidated', 'error');
      onAutoCloseRef.current?.('liquidation');
      reset();
      return;
    }

    if (isTakeProfitHitByPrice(livePrice, trade.tp, trade.isLong)) {
      const { closedTrade } = closePaperTrade(guestId, trade, livePrice, { isTakeProfitHit: true });
      refreshPaperStats(guestId);
      setIsTakeProfitHit(true);
      setLastClosedTradeForShare(closedTrade);
      showToast('Take profit hit!', 'success');
      onAutoCloseRef.current?.('takeProfit');
      reset();
    }
  }, [
    enabled,
    stage,
    isIntentionalClose,
    guestId,
    setPnLData,
    setIsLiquidated,
    setIsTakeProfitHit,
    setLastClosedTradeForShare,
    reset,
    showToast,
  ]);

  useEffect(() => {
    if (!enabled || stage !== 'pnl') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    poll();
    intervalRef.current = setInterval(poll, interval);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, stage, interval, poll]);

  // Also update when prices change rapidly
  useEffect(() => {
    if (enabled && stage === 'pnl' && currentTrade && prices[currentTrade.pair]?.price) {
      poll();
    }
  }, [enabled, stage, currentTrade, prices, poll]);

  return { pnlData };
}
