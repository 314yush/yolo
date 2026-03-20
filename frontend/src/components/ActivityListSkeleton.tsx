'use client';

import React from 'react';

type ActivityListSkeletonProps = {
  /** Number of placeholder cards */
  count?: number;
  /** Shown above the cards */
  label?: string;
};

/**
 * Shimmer placeholders for Activity open/closed trade lists (matches TradeCard-ish layout).
 */
export function ActivityListSkeleton({ count = 3, label = 'Loading…' }: ActivityListSkeletonProps) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:gap-4 pb-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <p className="text-[#CCFF00]/50 text-xs font-bold uppercase tracking-wider">{label}</p>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="brutal-card p-3 sm:p-4 min-w-0 border-4 border-[#CCFF00]/15"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="chart-loading-skeleton h-4 w-16 rounded-sm" />
            <div className="chart-loading-skeleton h-4 w-12 rounded-sm" />
          </div>
          <div className="chart-loading-skeleton h-10 w-28 mb-3 rounded-sm" />
          <div className="chart-loading-skeleton h-4 w-full mb-2 rounded-sm" />
          <div className="chart-loading-skeleton h-4 w-[80%] max-w-full rounded-sm" />
        </div>
      ))}
    </div>
  );
}
