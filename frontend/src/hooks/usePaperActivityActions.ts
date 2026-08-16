'use client';

import { useCallback, useState } from 'react';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { useTradeStore } from '@/store/tradeStore';
import { closePaperTrade, openPaperTrade } from '@/lib/paperTradeEngine';
import { computePaperPnL, loadOpenPaperTrades } from '@/lib/paperTrades';
import { refreshPaperStats } from '@/lib/paperStats';
import { ASSETS, DIRECTIONS, LEVERAGES } from '@/lib/constants';
import { findAssetByPairIndex } from '@/lib/assetPair';
import type { ClosedTrade, Trade } from '@/types';

interface UsePaperActivityActionsOptions {
  openTrades: Trade[];
  setOpenTrades: (trades: Trade[]) => void;
  setClosedTrades: React.Dispatch<React.SetStateAction<ClosedTrade[]>>;
  openShareCard: (trade: ClosedTrade) => void;
  refresh: () => void;
}

export function usePaperActivityActions({
  openTrades,
  setOpenTrades,
  setClosedTrades,
  openShareCard,
  refresh,
}: UsePaperActivityActionsOptions) {
  const { guestId } = usePaperTrading();
  const { prices, settings, showToast } = useTradeStore();
  const [flippingIndex, setFlippingIndex] = useState<number | null>(null);
  const [closingIndex, setClosingIndex] = useState<number | null>(null);

  const close = useCallback(
    async (trade: Trade, index: number) => {
      setClosingIndex(index);
      try {
        const closePrice = prices[trade.pair]?.price ?? trade.openPrice;
        const { closedTrade } = closePaperTrade(guestId, trade, closePrice);
        setOpenTrades(loadOpenPaperTrades(guestId));
        setClosedTrades((prev) => [closedTrade, ...prev]);
        refreshPaperStats(guestId);
        openShareCard(closedTrade);
        refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Close failed', 'error');
      } finally {
        setClosingIndex(null);
      }
    },
    [guestId, prices, setOpenTrades, setClosedTrades, openShareCard, refresh, showToast]
  );

  const flip = useCallback(
    async (trade: Trade, index: number) => {
      setFlippingIndex(index);
      try {
        const closePrice = prices[trade.pair]?.price ?? trade.openPrice;
        closePaperTrade(guestId, trade, closePrice);

        const asset = findAssetByPairIndex(trade.pairIndex) ?? ASSETS[0];
        const leverage = LEVERAGES.find((l) => l.value === trade.leverage) ?? LEVERAGES[0];
        const direction = trade.isLong ? DIRECTIONS[1] : DIRECTIONS[0];

        await new Promise((r) => setTimeout(r, 400));

        const newTrade = openPaperTrade({
          guestId,
          selection: { asset, leverage, direction },
          collateral: trade.collateral,
          openPrice: closePrice,
          takeProfitPercent: settings.takeProfitPercent,
        });

        if (!newTrade) {
          showToast('Insufficient balance to flip', 'error');
          return;
        }

        setOpenTrades(loadOpenPaperTrades(guestId));
        refreshPaperStats(guestId);
        refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Flip failed', 'error');
      } finally {
        setFlippingIndex(null);
      }
    },
    [guestId, prices, settings.takeProfitPercent, setOpenTrades, refresh, showToast]
  );

  return { close, flip, flippingIndex, closingIndex };
}
