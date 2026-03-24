'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { useTradeStore } from '@/store/tradeStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useActivityData } from '@/hooks/useActivityData';
import { useActivityActions } from '@/hooks/useActivityActions';
import { usePositionSync } from '@/hooks/usePositionSync';
import { ToastContainer } from '@/components/Toast';
import { AvantisFooter } from '@/components/AvantisFooter';
import { StatsPanel } from '@/components/StatsPanel';
import { TradeList } from '@/components/TradeList';
import type { ClosedTrade } from '@/types';

const ShareBottomSheet = dynamic(
  () => import('@/components/ShareBottomSheet').then((m) => ({ default: m.ShareBottomSheet })),
  { ssr: false }
);

export default function ActivityPage() {
  const router = useRouter();
  
  // Consolidated store subscription using useShallow
  const {
    userAddress,
    toasts,
    removeToast,
    tradeStats,
    showToast,
    lastClosedTradeForShare,
    setLastClosedTradeForShare,
  } = useTradeStore(
    useShallow((s) => ({
      userAddress: s.userAddress,
      toasts: s.toasts,
      removeToast: s.removeToast,
      tradeStats: s.tradeStats,
      showToast: s.showToast,
      lastClosedTradeForShare: s.lastClosedTradeForShare,
      setLastClosedTradeForShare: s.setLastClosedTradeForShare,
    }))
  );

  const { isOnline } = useNetworkStatus();

  // Data fetching hook
  const {
    openTrades,
    closedTrades,
    stats,
    isLoadingOpen,
    isLoadingClosed,
    isLoadingStats,
    error,
    computedVolume,
    refresh,
    refetchOpenTrades,
    setClosedTrades,
    setOpenTrades,
  } = useActivityData(userAddress);

  // Pusher-driven position sync
  usePositionSync({
    enabled: !!userAddress,
    onFilled: () => {
      refetchOpenTrades();
      refresh();
    },
    onClose: (closedTrade) => {
      // Immediately inject the closed trade at the top of the list.
      // Key includes openedAt so slot-reused positions (flip scenarios) aren't deduped.
      setClosedTrades((prev) => {
        const key = closedTrade.openedAt && closedTrade.openedAt > 0
          ? `${closedTrade.pairIndex}-${closedTrade.tradeIndex}-${closedTrade.openedAt}`
          : `${closedTrade.pairIndex}-${closedTrade.tradeIndex}`;
        const toKey = (t: ClosedTrade) =>
          t.openedAt && t.openedAt > 0
            ? `${t.pairIndex}-${t.tradeIndex}-${t.openedAt}`
            : `${t.pairIndex}-${t.tradeIndex}`;
        const exists = prev.some((t) => toKey(t) === key);
        if (exists) return prev;
        return [closedTrade, ...prev];
      });
      refetchOpenTrades();
      refresh();
    },
    onCanceled: () => {
      refresh();
    },
  });

  // UI state
  const [showClosedTrades, setShowClosedTrades] = useState(false);
  const [shareTrade, setShareTrade] = useState<ClosedTrade | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Actions hook
  const {
    flip,
    close,
    flippingIndex,
    closingIndex,
  } = useActivityActions({
    openTrades,
    setOpenTrades,
    setClosedTrades,
    setShowClosedTrades,
    setShareTrade,
    setStats: () => refresh(), // Refresh stats after actions
    refresh,
  });

  // Prevent hydration mismatch by only rendering stats after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Open share modal when arriving from home after closing a trade
  useEffect(() => {
    if (!lastClosedTradeForShare) return;
    if (userAddress && isLoadingOpen) return;

    if (openTrades.length > 0) {
      setLastClosedTradeForShare(null);
      return;
    }

    const toShare = lastClosedTradeForShare;
    setShareTrade(toShare);
    setLastClosedTradeForShare(null);
    setShowClosedTrades(true);
    setClosedTrades((prev) => {
      const exists = prev.some(
        (t) => t.pairIndex === toShare.pairIndex && t.tradeIndex === toShare.tradeIndex
      );
      if (exists) return prev;
      return [toShare, ...prev];
    });
  }, [
    lastClosedTradeForShare,
    setLastClosedTradeForShare,
    userAddress,
    isLoadingOpen,
    openTrades.length,
    setClosedTrades,
  ]);

  // Scroll to top when share modal opens
  useEffect(() => {
    if (shareTrade && mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [shareTrade]);

  // Warn before closing tab/window when action is in progress
  useEffect(() => {
    const shouldWarn = flippingIndex !== null || closingIndex !== null;
    if (!shouldWarn) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flippingIndex, closingIndex]);

  // Default to OPEN tab when trades exist (only on initial load)
  useEffect(() => {
    if (!hasInitialized && openTrades.length > 0) {
      setShowClosedTrades(false);
      setHasInitialized(true);
    } else if (!hasInitialized && openTrades.length === 0 && closedTrades.length > 0) {
      setShowClosedTrades(true);
      setHasInitialized(true);
    } else if (!hasInitialized && openTrades.length === 0 && closedTrades.length === 0) {
      setHasInitialized(true);
    }
  }, [openTrades.length, closedTrades.length, hasInitialized]);

  const handleBack = useCallback(() => {
    if ((flippingIndex !== null || closingIndex !== null) && !window.confirm('A trade action is in progress. Leave this page anyway?')) {
      return;
    }
    router.back();
  }, [flippingIndex, closingIndex, router]);

  const handleRetry = useCallback(() => {
    refresh();
  }, [refresh]);

  const hasActionInProgress = flippingIndex !== null || closingIndex !== null;

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-lg mx-auto w-full">
      {/* Header */}
      <header className="w-full mb-4 sm:mb-6">
        {error && (
          <div className="mb-4 p-3 border-4 border-[#FF006E] bg-[#FF006E]/10 flex items-center justify-between gap-3">
            <p className="text-sm text-white/90">{error}</p>
            <button
              onClick={handleRetry}
              className="shrink-0 px-3 py-1.5 text-xs font-bold border-2 border-[#FF006E] bg-black text-[#FF006E] hover:bg-[#FF006E] hover:text-black transition-colors"
            >
              RETRY
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleBack}
            className="text-[#CCFF00] text-sm sm:text-base font-bold touch-manipulation min-h-[44px] flex items-center px-3 sm:px-4 py-2 border-4 border-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            style={{ boxShadow: '4px 4px 0px 0px rgba(204, 255, 0, 0.5)' }}
            aria-label="Go back"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="whitespace-nowrap">BACK</span>
          </button>
          <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-black uppercase tracking-tight">Activity</h1>
          <div className="w-16 sm:w-20" />
        </div>

        <StatsPanel
          tradesWithPnL={openTrades}
          closedTradesCount={closedTrades.length}
          showClosedTrades={showClosedTrades}
          onToggle={setShowClosedTrades}
          mounted={mounted}
          activityStats={stats}
          tradeStats={tradeStats}
          computedVolume={computedVolume}
          statsLoading={isLoadingStats}
        />
      </header>

      {/* Trades List */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6"
        aria-busy={isLoadingOpen || (showClosedTrades && isLoadingClosed && closedTrades.length === 0)}
      >
        <TradeList
          showClosedTrades={showClosedTrades}
          openTrades={openTrades}
          closedTrades={closedTrades}
          isLoadingOpen={isLoadingOpen}
          isLoadingClosed={isLoadingClosed}
          flippingIndex={flippingIndex}
          closingIndex={closingIndex}
          isOnline={isOnline}
          onFlip={flip}
          onClose={close}
          onShare={setShareTrade}
          onSwitchToOpen={() => setShowClosedTrades(false)}
          hasActionInProgress={hasActionInProgress}
        />
      </main>

      {/* Footer */}
      <AvantisFooter />

      {/* Share Bottom Sheet */}
      {shareTrade && (
        <ShareBottomSheet
          trade={shareTrade}
          onClose={() => setShareTrade(null)}
          onCopy={() => showToast('Copied to clipboard', 'success')}
          onDownload={() => showToast('Downloaded', 'success')}
          onShare={() => showToast('Shared!', 'success')}
          onShareOnX={(m) => m === 'clipboard' && showToast('Image copied — paste it in your tweet', 'info')}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
