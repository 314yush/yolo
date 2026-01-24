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
    <div className={`brutal-card ${cardClass} p-2.5 sm:p-3`}>
      {/* Header: Chips - Very compact */}
      <div className="flex items-center gap-1 flex-wrap mb-2">
        {asset && (
          <div
            className="selection-chip px-1.5 py-0.5 text-[10px] font-bold text-black flex items-center gap-0.5"
            style={{ backgroundColor: asset.color }}
          >
            <img src={asset.icon} alt="" className="w-2.5 h-2.5" aria-hidden="true" />
            <span>{asset.name}</span>
          </div>
        )}
        {direction && (
          <div
            className="selection-chip px-1.5 py-0.5 text-[10px] font-bold text-black"
            style={{ backgroundColor: direction.color }}
          >
            {direction.name}
          </div>
        )}
        <div className="selection-chip px-1.5 py-0.5 text-[10px] font-bold bg-white/20 text-white">
          {trade.leverage}x
        </div>
      </div>

      {/* PnL Display - Dominant but compact */}
      <div className="mb-2">
        <div className={`text-2xl sm:text-3xl md:text-4xl font-black leading-none`} style={{ color }}>
          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
        </div>
        <div className={`text-sm sm:text-base md:text-lg font-bold mt-0.5`} style={{ color }}>
          {isProfit ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%
        </div>
      </div>

      {/* Price comparison - Compact inline */}
      <div className="flex items-baseline justify-between gap-2 mb-2 text-[10px] sm:text-xs font-mono">
        <div className="flex-1">
          <div className="text-white/30 text-[9px] mb-0.5">ENTRY</div>
          <div className="text-white font-bold text-xs sm:text-sm">
            ${trade.openPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-white/30 text-xs">→</div>
        <div className="flex-1 text-right">
          <div className="text-white/30 text-[9px] mb-0.5">CURRENT</div>
          <div className="font-bold text-xs sm:text-sm" style={{ color }}>
            ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Position Info - Very subtle, only if not closed */}
      {!isClosed && (
        <div className="text-white/30 text-[9px] mb-2 font-mono">
          ${trade.collateral} × {trade.leverage}x = ${positionSize.toLocaleString()}
        </div>
      )}

      {/* Actions - Only show for open trades */}
      {!isClosed && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onFlip(trade)}
            disabled={isFlipping || isClosing}
            className="flex-1 py-2 px-2 text-[10px] sm:text-xs font-bold brutal-button bg-[#CCFF00] text-black disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[40px]"
            aria-label={`Flip to ${trade.isLong ? 'SHORT' : 'LONG'}`}
          >
            {isFlipping ? 'FLIPPING...' : `FLIP: ${trade.isLong ? 'SHORT' : 'LONG'}`}
          </button>
          <button
            onClick={() => onClose(trade)}
            disabled={isFlipping || isClosing}
            className="px-2.5 sm:px-3 py-2 text-[10px] sm:text-xs font-bold brutal-button-danger disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[40px]"
            aria-label="Close trade"
          >
            {isClosing ? '...' : 'CLOSE'}
          </button>
        </div>
      )}
    </div>
  );
}
