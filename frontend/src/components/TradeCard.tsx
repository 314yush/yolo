'use client';

import React from 'react';
import type { Trade, PnLData } from '@/types';
import { ASSETS, DIRECTIONS } from '@/lib/constants';

interface TradeCardProps {
  trade: Trade;
  pnlData?: PnLData;
  onFlip: (trade: Trade) => void;
  onClose: (trade: Trade) => void;
  isFlipping?: boolean;
  isClosing?: boolean;
  isClosed?: boolean; // New prop to indicate closed trade
}

export function TradeCard({ trade, pnlData, onFlip, onClose, isFlipping, isClosing, isClosed = false }: TradeCardProps) {
  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex);
  const direction = DIRECTIONS.find((d) => d.isLong === trade.isLong);
  
  const pnl = pnlData?.pnl ?? 0;
  const pnlPercentage = pnlData?.pnlPercentage ?? 0;
  const currentPrice = pnlData?.currentPrice ?? trade.openPrice;
  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  
  const positionSize = trade.collateral * trade.leverage;

  // Card border color based on P&L
  const cardClass = isProfit ? 'brutal-card-winning' : 'brutal-card-losing';

  return (
    <div className={`brutal-card ${cardClass} p-3 sm:p-4 min-w-0`}>
      {/* Header: Chips - Improved spacing and wrapping */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3 min-w-0">
        {asset && (
          <div
            className="selection-chip px-2 py-1 text-[11px] sm:text-xs font-bold text-black flex items-center gap-1 shrink-0"
            style={{ backgroundColor: asset.color }}
          >
            <img src={asset.icon} alt="" className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">{asset.name}</span>
          </div>
        )}
        {direction && (
          <div
            className="selection-chip px-2 py-1 text-[11px] sm:text-xs font-bold text-black shrink-0 whitespace-nowrap"
            style={{ backgroundColor: direction.color }}
          >
            {direction.name}
          </div>
        )}
        <div className="selection-chip px-2 py-1 text-[11px] sm:text-xs font-bold bg-white/20 text-white shrink-0 whitespace-nowrap">
          {trade.leverage}x
        </div>
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
          <div className="text-white/40 text-[10px] sm:text-xs mb-1 uppercase tracking-wide">Current</div>
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

      {/* Actions - Enhanced with icons and better states */}
      {!isClosed && (
        <div className="flex gap-2">
          <button
            onClick={() => onFlip(trade)}
            disabled={isFlipping || isClosing}
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
            disabled={isFlipping || isClosing}
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
