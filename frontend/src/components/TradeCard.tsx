'use client';

import React, { useState, useEffect } from 'react';
import type { Trade, PnLData } from '@/types';
import { ASSETS, DIRECTIONS } from '@/lib/constants';

interface TradeCardProps {
  trade: Trade;
  pnlData?: PnLData;
  onFlip: (trade: Trade) => void;
  onClose: (trade: Trade) => void;
  isFlipping?: boolean;
  isClosing?: boolean;
}

export function TradeCard({ trade, pnlData, onFlip, onClose, isFlipping, isClosing }: TradeCardProps) {
  const [timeOpen, setTimeOpen] = useState(0);
  
  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex);
  const direction = DIRECTIONS.find((d) => d.isLong === trade.isLong);
  
  const pnl = pnlData?.pnl ?? 0;
  const pnlPercentage = pnlData?.pnlPercentage ?? 0;
  const currentPrice = pnlData?.currentPrice ?? trade.openPrice;
  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  
  const positionSize = trade.collateral * trade.leverage;

  // Track time open
  useEffect(() => {
    if (!trade.openedAt) return;
    
    const updateTime = () => {
      const elapsed = Math.floor((Date.now() - trade.openedAt) / 1000);
      setTimeOpen(elapsed);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [trade.openedAt]);

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}h ${remainingMins}m`;
    }
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Card border color based on P&L
  const cardClass = isProfit ? 'brutal-card-winning' : 'brutal-card-losing';

  return (
    <div className={`brutal-card ${cardClass} p-4 sm:p-5`}>
      {/* Header: Chips */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {asset && (
          <div
            className="selection-chip px-2.5 py-1 text-xs font-bold text-black flex items-center gap-1"
            style={{ backgroundColor: asset.color }}
          >
            <img src={asset.icon} alt="" className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{asset.name}</span>
          </div>
        )}
        {direction && (
          <div
            className="selection-chip px-2.5 py-1 text-xs font-bold text-black"
            style={{ backgroundColor: direction.color }}
          >
            {direction.name}
          </div>
        )}
        <div className="selection-chip px-2.5 py-1 text-xs font-bold bg-white/20 text-white">
          {trade.leverage}x
        </div>
        
        {/* Time badge */}
        {timeOpen > 0 && (
          <div className="ml-auto text-white/60 text-xs font-mono flex items-center gap-1">
            <span>⏱️</span>
            <span>{formatTime(timeOpen)}</span>
          </div>
        )}
      </div>

      {/* GIANT PnL Display */}
      <div className="mb-4">
        <div className={`text-4xl sm:text-5xl font-black`} style={{ color }}>
          {isProfit ? '+' : ''}${Math.abs(pnl).toFixed(2)}
        </div>
        <div className={`text-xl sm:text-2xl font-bold`} style={{ color }}>
          {isProfit ? '+' : ''}{pnlPercentage.toFixed(2)}%
        </div>
      </div>

      {/* Price comparison */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm font-mono">
        <div>
          <div className="text-white/50 text-xs">Entry</div>
          <div className="text-white font-bold">
            ${trade.openPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div className="text-white/50 text-xs">Current</div>
          <div className="font-bold" style={{ color }}>
            ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Position Info */}
      <div className="text-white/60 text-xs mb-4 font-mono border-t border-white/10 pt-3">
        Position: ${trade.collateral} × {trade.leverage}x = ${positionSize.toLocaleString()}
      </div>

      {/* Actions - Full neobrutalist buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onFlip(trade)}
          disabled={isFlipping || isClosing}
          className="flex-1 py-3 px-3 text-sm font-bold brutal-button bg-[#CCFF00] text-black disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px]"
          aria-label={`Flip to ${trade.isLong ? 'SHORT' : 'LONG'}`}
        >
          {isFlipping ? 'FLIPPING...' : `FLIP: ${trade.isLong ? 'SHORT' : 'LONG'}`}
        </button>
        <button
          onClick={() => onClose(trade)}
          disabled={isFlipping || isClosing}
          className="px-4 py-3 text-sm font-bold brutal-button-danger disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px]"
          aria-label="Close trade"
        >
          {isClosing ? '...' : 'CLOSE'}
        </button>
      </div>
    </div>
  );
}
