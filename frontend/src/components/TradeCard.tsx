'use client';

import React from 'react';
import type { Trade, PnLData, ClosedTrade } from '@/types';
import { ASSETS, DIRECTIONS } from '@/lib/constants';

interface TradeCardProps {
  trade: Trade | ClosedTrade;
  pnlData?: PnLData;
  onFlip: (trade: Trade) => void;
  onClose: (trade: Trade) => void;
  onShare?: (trade: ClosedTrade) => void;
  isFlipping?: boolean;
  isClosing?: boolean;
  isClosed?: boolean; // New prop to indicate closed trade
  actionsDisabled?: boolean; // e.g. when offline
}

/**
 * Normalize timestamp to milliseconds.
 * Handles both Unix seconds and Unix milliseconds defensively.
 */
function normalizeToMs(timestamp: number | undefined | null): number | null {
  if (!timestamp || timestamp === 0) {
    return null;
  }
  // Timestamps < 1e12 are seconds; >= 1e12 are already milliseconds.
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

// Format timestamp to UTC string
// Expects timestamp in milliseconds
function formatTimestamp(timestampMs: number | null): string {
  if (!timestampMs) return 'N/A';
  const date = new Date(timestampMs);
  return date.toUTCString().replace('GMT', 'UTC');
}

// Format timestamp to relative time (e.g., "2 hours ago")
// Expects timestamp in milliseconds
function formatRelativeTime(timestampMs: number | null | undefined): string {
  if (!timestampMs || timestampMs === 0) {
    return 'N/A';
  }
  
  const date = new Date(timestampMs);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // For older dates, show formatted date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export function TradeCard({ trade, pnlData, onFlip, onClose, onShare, isFlipping, isClosing, isClosed = false, actionsDisabled = false }: TradeCardProps) {
  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex);
  const direction = DIRECTIONS.find((d) => d.isLong === trade.isLong);
  
  // Check if this is a ClosedTrade
  const closedTrade = isClosed && 'finalPnL' in trade ? trade as ClosedTrade : null;
  const isLiquidated = closedTrade?.isLiquidated ?? false;
  // Use net PnL for open trades (what user keeps after ZFP fees). Liquidated = -100% full loss.
  const rawPnl = closedTrade ? (isLiquidated ? -trade.collateral : closedTrade.finalPnL) : (pnlData?.pnl ?? 0);
  const rawPnlPct = closedTrade ? (isLiquidated ? -100 : closedTrade.finalPnLPercentage) : (pnlData?.pnlPercentage ?? 0);
  const pnl = Number.isFinite(Number(rawPnl)) ? Number(rawPnl) : 0;
  const pnlPercentage = Number.isFinite(Number(rawPnlPct)) ? Number(rawPnlPct) : 0;
  const currentPrice = closedTrade ? closedTrade.closePrice : (pnlData?.currentPrice ?? trade.openPrice);
  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  
  const positionSize = trade.collateral * trade.leverage;
  const isTakeProfitHit = closedTrade?.isTakeProfitHit ?? false;

  // Card border color based on P&L
  const cardClass = isProfit ? 'brutal-card-winning' : 'brutal-card-losing';
  
  // Basescan URL for Base network
  const BASESCAN_BASE = 'https://basescan.org/tx';

  return (
    <div className={`brutal-card ${cardClass} p-3 sm:p-4 min-w-0`}>
      {/* Header: Simplified text-based display (60/30/10 rule - no button-like fills) */}
      <div className="flex items-center gap-2 mb-3 min-w-0 text-sm sm:text-base font-bold font-mono text-white/80">
        {asset && (
          <span className="flex items-center gap-1.5 shrink-0">
            <span style={{ color: asset.color }}>●</span>
            <span className="whitespace-nowrap">{asset.name}</span>
          </span>
        )}
        <span className="text-white/30">•</span>
        <span className="whitespace-nowrap">{trade.leverage}x</span>
        <span className="text-white/30">•</span>
        {direction && (
          <span 
            className="whitespace-nowrap"
            style={{ color: direction.color }}
          >
            {direction.name}
          </span>
        )}
      </div>

      {/* PnL Display - Enhanced visual hierarchy */}
      <div className="mb-3">
        <div className={`text-3xl sm:text-4xl font-black leading-none font-mono`} style={{ color }}>
          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
        </div>
        <div className={`text-base sm:text-lg font-bold mt-1 font-mono`} style={{ color }}>
          {isProfit ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%
        </div>
      </div>

      {/* Price comparison - Improved layout and readability */}
      <div className="flex items-start justify-between gap-3 mb-3 text-xs sm:text-sm font-mono min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-white/40 text-[10px] sm:text-xs mb-1 uppercase tracking-wide">Entry</div>
          <div className="text-white font-bold text-sm sm:text-base wrap-break-word">
            ${trade.openPrice.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: trade.openPrice < 10 ? 4 : 2 
            })}
          </div>
        </div>
        <div className="text-white/30 text-base sm:text-lg shrink-0 pt-3">→</div>
        <div className="flex-1 text-right min-w-0">
          <div className="text-white/40 text-[10px] sm:text-xs mb-1 uppercase tracking-wide">
            {isClosed ? 'Closed At' : 'Current'}
          </div>
          <div className="font-bold text-sm sm:text-base wrap-break-word" style={{ color }}>
            ${currentPrice.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: currentPrice < 10 ? 4 : 2 
            })}
          </div>
        </div>
      </div>

      {/* Position Info - Improved visibility */}
      {!isClosed && (
        <div className="text-white/40 text-[10px] sm:text-xs mb-3 font-mono">
          ${trade.collateral.toLocaleString()} × {trade.leverage}x = ${positionSize.toLocaleString()}
        </div>
      )}

      {/* Timestamps and Transaction Links */}
      <div className="flex flex-col gap-2 mb-3 text-xs font-mono">
        {/* Opened timestamp */}
        <div className="flex items-center justify-between text-white/50">
          <span>Opened:</span>
          <div className="flex items-center gap-2">
            <span className="text-white/70">{formatRelativeTime(normalizeToMs(trade.openedAt))}</span>
            {closedTrade?.txHash && (
              <a
                href={`${BASESCAN_BASE}/${closedTrade.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#CCFF00] hover:text-[#CCFF00]/80 underline"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </a>
            )}
          </div>
        </div>
        
        {/* Closed timestamp (if closed) */}
        {closedTrade && (
          <div className="flex items-center justify-between text-white/50">
            <span className="flex items-center gap-1.5">
              {isLiquidated ? (
                <>
                  <span className="text-[#FF006E]">⚡</span>
                  <span>Liquidated:</span>
                </>
              ) : isTakeProfitHit ? (
                <>
                  <span className="text-[#CCFF00]">🎯</span>
                  <span className="text-[#CCFF00]/90">Take Profit:</span>
                </>
              ) : (
                <span>Closed:</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-white/70">
                {formatRelativeTime(normalizeToMs(closedTrade.closedAt))}
              </span>
              {closedTrade.closeTxHash && (
                <a
                  href={`${BASESCAN_BASE}/${closedTrade.closeTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#CCFF00] hover:text-[#CCFF00]/80 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}
        
        {/* Full UTC timestamp on hover/tap (for closed trades) */}
        {closedTrade && (
          <div className="text-white/30 text-[10px] mt-1">
            {formatTimestamp(normalizeToMs(trade.openedAt))} → {formatTimestamp(normalizeToMs(closedTrade.closedAt))}
          </div>
        )}
      </div>

      {/* Actions - Share for closed trades, Flip/Close for open */}
      {isClosed && closedTrade && onShare && (
        <button
          onClick={() => onShare(closedTrade)}
          className="w-full py-2.5 px-3 text-xs sm:text-sm font-bold brutal-button bg-[#CCFF00] text-black touch-manipulation min-h-[44px] flex items-center justify-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
          aria-label="Share trade"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span className="whitespace-nowrap">SHARE</span>
        </button>
      )}
      {!isClosed && (
        <div className="flex gap-2">
          <button
            onClick={() => onFlip(trade)}
            disabled={isFlipping || isClosing || actionsDisabled}
            aria-label={isFlipping ? 'Flipping trade...' : `Flip to ${trade.isLong ? 'SHORT' : 'LONG'}`}
            aria-busy={isFlipping}
            className="flex-1 py-2.5 px-3 text-xs sm:text-sm font-bold brutal-button bg-[#CCFF00] text-black disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[44px] flex items-center justify-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black relative"
          >
            {isFlipping ? (
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
              </svg>
            )}
            <span className="whitespace-nowrap">{isFlipping ? 'FLIPPING...' : `FLIP`}</span>
          </button>
          <button
            onClick={() => onClose(trade)}
            disabled={isFlipping || isClosing || actionsDisabled}
            aria-label={isClosing ? 'Closing trade...' : 'Close trade'}
            aria-busy={isClosing}
            className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold brutal-button-danger disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[44px] flex items-center justify-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black relative"
          >
            {isClosing ? (
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
            <span className="whitespace-nowrap">{isClosing ? '...' : 'CLOSE'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
