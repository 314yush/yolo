'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TradeCard } from '@/components/TradeCard';
import { ActivityListSkeleton } from '@/components/ActivityListSkeleton';
import type { Trade, PnLData, ClosedTrade } from '@/types';

interface TradeListProps {
  showClosedTrades: boolean;
  openTrades: Array<{ trade: Trade; pnlData?: PnLData }>;
  closedTrades: ClosedTrade[];
  isLoadingOpen: boolean;
  isLoadingClosed: boolean;
  flippingIndex: number | null;
  closingIndex: number | null;
  isOnline: boolean;
  onFlip: (trade: Trade) => void;
  onClose: (trade: Trade) => void;
  onShare: (trade: ClosedTrade) => void;
  onSwitchToOpen: () => void;
  hasActionInProgress: boolean;
}

const EmptyOpenState = React.memo(function EmptyOpenState({
  isOnline,
  hasActionInProgress,
}: {
  isOnline: boolean;
  hasActionInProgress: boolean;
}) {
  const router = useRouter();

  const handleRollNow = useCallback(() => {
    if (hasActionInProgress && !window.confirm('A trade action is in progress. Leave this page anyway?')) {
      return;
    }
    router.push('/');
  }, [hasActionInProgress, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-6">
        <svg
          className="w-16 h-16 mx-auto text-[#CCFF00]/30 mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <div className="text-white/50 text-lg sm:text-xl font-bold mb-2">No Open Trades</div>
      <div className="text-white/30 text-sm sm:text-base mb-6 max-w-xs">
        Spin the wheel to start your first trade
      </div>
      <button
        onClick={handleRollNow}
        disabled={!isOnline}
        className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={isOnline ? 'Go to main page to roll' : 'You are offline. Reconnect to trade'}
      >
        ROLL NOW
      </button>
    </div>
  );
});

const EmptyClosedState = React.memo(function EmptyClosedState({
  onSwitchToOpen,
}: {
  onSwitchToOpen: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-6">
        <svg
          className="w-16 h-16 mx-auto text-white/20 mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9h6M9 15h6" />
        </svg>
      </div>
      <div className="text-white/50 text-lg sm:text-xl font-bold mb-2">No Closed Trades</div>
      <div className="text-white/30 text-sm sm:text-base mb-6 max-w-xs">
        Your closed trades will appear here
      </div>
      <button
        onClick={onSwitchToOpen}
        className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
        aria-label="View open trades"
      >
        VIEW OPEN TRADES
      </button>
    </div>
  );
});

export const TradeList = React.memo(function TradeList({
  showClosedTrades,
  openTrades,
  closedTrades,
  isLoadingOpen,
  isLoadingClosed,
  flippingIndex,
  closingIndex,
  isOnline,
  onFlip,
  onClose,
  onShare,
  onSwitchToOpen,
  hasActionInProgress,
}: TradeListProps) {
  const [displayedClosedCount, setDisplayedClosedCount] = useState(12);

  const handleLoadMore = useCallback(() => {
    setDisplayedClosedCount((prev) => Math.min(prev + 10, closedTrades.length));
  }, [closedTrades.length]);

  if (showClosedTrades) {
    if (isLoadingClosed && closedTrades.length === 0) {
      return <ActivityListSkeleton count={3} label="Loading closed trades…" />;
    }

    if (closedTrades.length === 0) {
      return <EmptyClosedState onSwitchToOpen={onSwitchToOpen} />;
    }

    return (
      <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-6">
        {closedTrades.slice(0, displayedClosedCount).map((closedTrade) => (
          <TradeCard
            key={`closed-${closedTrade.pairIndex}-${closedTrade.tradeIndex}`}
            trade={closedTrade}
            pnlData={{
              trade: closedTrade,
              currentPrice: closedTrade.closePrice,
              pnl: closedTrade.finalPnL,
              pnlPercentage: closedTrade.finalPnLPercentage,
              grossPnl: closedTrade.finalPnL,
              grossPnlPercentage: closedTrade.finalPnLPercentage,
            }}
            onFlip={() => {}}
            onClose={() => {}}
            onShare={() => onShare(closedTrade)}
            isFlipping={false}
            isClosing={false}
            isClosed={true}
          />
        ))}
        {closedTrades.length > displayedClosedCount && (
          <button
            onClick={handleLoadMore}
            className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            aria-label="Load more closed trades"
          >
            LOAD MORE ({closedTrades.length - displayedClosedCount} remaining)
          </button>
        )}
      </div>
    );
  }

  // Open trades
  if (isLoadingOpen) {
    return <ActivityListSkeleton count={3} label="Loading open positions…" />;
  }

  if (openTrades.length === 0) {
    return (
      <EmptyOpenState
        isOnline={isOnline}
        hasActionInProgress={hasActionInProgress}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-6">
      {openTrades.map((item, index) => (
        <TradeCard
          key={`${item.trade.pairIndex}-${item.trade.tradeIndex}`}
          trade={item.trade}
          pnlData={item.pnlData}
          onFlip={onFlip}
          onClose={onClose}
          isFlipping={flippingIndex === index}
          isClosing={closingIndex === index}
          actionsDisabled={!isOnline}
        />
      ))}
    </div>
  );
});
