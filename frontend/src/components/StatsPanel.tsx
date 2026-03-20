'use client';

import React from 'react';
import type { PnLData, Trade } from '@/types';

interface StatsPanelProps {
  tradesWithPnL: Array<{ trade: Trade; pnlData?: PnLData }>;
  closedTradesCount: number;
  showClosedTrades: boolean;
  onToggle: (showClosed: boolean) => void;
  mounted: boolean;
  activityStats: { total_trades: number; total_volume: number; total_pnl: number; win_rate: number; open_trades: number } | null;
  tradeStats: { totalTrades: number; totalVolume: number };
  historicVolume: number | null;
  computedVolume: number;
  /** Activity API stats row still fetching */
  statsLoading?: boolean;
}

function StatShimmer({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block chart-loading-skeleton rounded-sm align-middle min-h-[1.25rem] ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}

export function StatsPanel({
  tradesWithPnL, closedTradesCount, showClosedTrades, onToggle,
  mounted, activityStats, tradeStats, historicVolume, computedVolume,
  statsLoading = false,
}: StatsPanelProps) {
  const aggregateStats = React.useMemo(() => {
    const totalPnL = tradesWithPnL.reduce((sum, item) => sum + (item.pnlData?.pnl ?? 0), 0);
    const totalCollateral = tradesWithPnL.reduce((sum, item) => sum + item.trade.collateral, 0);
    return { totalPnL, totalCollateral };
  }, [tradesWithPnL]);

  return (
    <>
      {/* Aggregate Stats - Total PnL across all open positions */}
      {mounted && tradesWithPnL.length > 0 && !showClosedTrades && (
        <div
          className="mb-4 p-4 border-4"
          style={{
            borderColor: aggregateStats.totalPnL >= 0 ? '#CCFF00' : 'var(--color-danger)',
            backgroundColor: aggregateStats.totalPnL >= 0 ? 'rgba(204, 255, 0, 0.1)' : 'rgba(255, 0, 110, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Total P&L</div>
              <div className="font-black text-2xl font-mono" style={{ color: aggregateStats.totalPnL >= 0 ? '#CCFF00' : 'var(--color-danger)' }}>
                {aggregateStats.totalPnL >= 0 ? '+' : '-'}${Math.abs(aggregateStats.totalPnL).toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Collateral</div>
              <div className="text-white font-bold text-lg font-mono">${aggregateStats.totalCollateral.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Toggle and Stats */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="brutal-toggle shrink-0">
          <button onClick={() => onToggle(false)} className={`brutal-toggle-option ${!showClosedTrades ? 'active' : ''}`} aria-pressed={!showClosedTrades}>
            OPEN {tradesWithPnL.length > 0 && `(${tradesWithPnL.length})`}
          </button>
          <button onClick={() => onToggle(true)} className={`brutal-toggle-option ${showClosedTrades ? 'active' : ''}`} aria-pressed={showClosedTrades}>
            CLOSED {closedTradesCount > 0 && `(${closedTradesCount})`}
          </button>
        </div>
        <div className="flex items-center justify-end gap-4 text-xs sm:text-sm min-w-0">
          <div className="text-center shrink-0">
            <div className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide mb-0.5">Trades</div>
            <div className="text-[#CCFF00] font-black text-lg sm:text-xl font-mono min-h-[1.75rem] flex items-center justify-center" suppressHydrationWarning>
              {mounted && statsLoading ? (
                <StatShimmer className="w-10 h-7" />
              ) : mounted ? (
                activityStats?.total_trades ?? tradeStats.totalTrades
              ) : (
                0
              )}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide mb-0.5">Volume</div>
            <div className="text-[#CCFF00] font-black text-lg sm:text-xl font-mono min-h-[1.75rem] flex items-center justify-center" suppressHydrationWarning>
              {mounted && statsLoading ? (
                <StatShimmer className="w-16 sm:w-20 h-7" />
              ) : mounted ? (
                `$${(activityStats?.total_volume ?? historicVolume ?? tradeStats.totalVolume ?? computedVolume).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              ) : (
                '$0'
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
