'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTradeStore } from '@/store/tradeStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePaperActivityData } from '@/hooks/usePaperActivityData';
import { usePaperActivityActions } from '@/hooks/usePaperActivityActions';
import { ToastContainer } from '@/components/Toast';
import { StatsPanel } from '@/components/StatsPanel';
import { TradeList } from '@/components/TradeList';
import { PaperIcon } from '@/components/PaperBadge';
import type { ClosedTrade, Trade } from '@/types';

const ShareBottomSheet = dynamic(
  () => import('@/components/ShareBottomSheet').then((m) => ({ default: m.ShareBottomSheet })),
  { ssr: false }
);

export default function PaperActivityPage() {
  const router = useRouter();
  const { toasts, removeToast, showToast } = useTradeStore();
  const { isOnline } = useNetworkStatus();

  const {
    openTrades,
    closedTrades,
    stats,
    openTradesPnL,
    isLoadingOpen,
    isLoadingClosed,
    isLoadingStats,
    setOpenTrades,
    setClosedTrades,
    refresh,
  } = usePaperActivityData();

  const [showClosedTrades, setShowClosedTrades] = useState(false);
  const [shareTrade, setShareTrade] = useState<ClosedTrade | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const openShareCard = useCallback((trade: ClosedTrade) => {
    setShareTrade(trade);
  }, []);

  const { flip, close, flippingIndex, closingIndex } = usePaperActivityActions({
    openTrades,
    setOpenTrades,
    setClosedTrades,
    openShareCard,
    refresh,
  });

  const tradesWithPnL = useMemo(
    () =>
      openTrades.map((trade) => ({
        trade,
        pnlData: openTradesPnL[`${trade.pairIndex}-${trade.tradeIndex}`],
      })),
    [openTrades, openTradesPnL]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!hasInitialized && openTrades.length > 0) {
      setShowClosedTrades(false);
      setHasInitialized(true);
    } else if (!hasInitialized && openTrades.length === 0 && closedTrades.length > 0) {
      setShowClosedTrades(true);
      setHasInitialized(true);
    } else if (!hasInitialized) {
      setHasInitialized(true);
    }
  }, [openTrades.length, closedTrades.length, hasInitialized]);

  const handleBack = useCallback(() => {
    if ((flippingIndex !== null || closingIndex !== null) && !window.confirm('A trade action is in progress. Leave this page anyway?')) {
      return;
    }
    router.push('/paper');
  }, [flippingIndex, closingIndex, router]);

  const handleFlip = useCallback(
    (trade: Trade) => {
      const idx = openTrades.findIndex(
        (t) => t.pairIndex === trade.pairIndex && t.tradeIndex === trade.tradeIndex
      );
      if (idx >= 0) void flip(trade, idx);
    },
    [openTrades, flip]
  );

  const handleClose = useCallback(
    (trade: Trade) => {
      const idx = openTrades.findIndex(
        (t) => t.pairIndex === trade.pairIndex && t.tradeIndex === trade.tradeIndex
      );
      if (idx >= 0) void close(trade, idx);
    },
    [openTrades, close]
  );

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-lg mx-auto w-full">
      <header className="w-full mb-4 sm:mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleBack}
            className="text-[#CCFF00] text-sm sm:text-base font-bold touch-manipulation min-h-[44px] flex items-center px-3 sm:px-4 py-2 border-4 border-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors"
            style={{ boxShadow: '4px 4px 0px 0px rgba(204, 255, 0, 0.5)' }}
            aria-label="Go back"
          >
            BACK
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-black uppercase tracking-tight">Activity</h1>
            <PaperIcon />
          </div>
          <div className="w-16 sm:w-20" />
        </div>

        <StatsPanel
          tradesWithPnL={tradesWithPnL}
          closedTradesCount={closedTrades.length}
          showClosedTrades={showClosedTrades}
          onToggle={setShowClosedTrades}
          mounted={mounted}
          activityStats={null}
          tradeStats={stats}
          computedVolume={stats.totalVolume}
          statsLoading={isLoadingStats}
        />
      </header>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6"
      >
        <TradeList
          showClosedTrades={showClosedTrades}
          openTrades={tradesWithPnL}
          closedTrades={closedTrades}
          isLoadingOpen={isLoadingOpen}
          isLoadingClosed={isLoadingClosed}
          flippingIndex={flippingIndex}
          closingIndex={closingIndex}
          isOnline={isOnline}
          onFlip={handleFlip}
          onClose={handleClose}
          onShare={(trade) => openShareCard(trade)}
          onSwitchToOpen={() => setShowClosedTrades(false)}
          hasActionInProgress={flippingIndex !== null || closingIndex !== null}
          homePath="/paper"
        />
      </main>

      {shareTrade && (
        <ShareBottomSheet
          trade={shareTrade}
          onClose={() => setShareTrade(null)}
          onCopy={() => showToast('Copied to clipboard', 'success')}
          onDownload={() => showToast('Downloaded', 'success')}
          onShare={() => showToast('Shared!', 'success')}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
