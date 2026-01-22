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
}

export function TradeCard({ trade, pnlData, onFlip, onClose, isFlipping, isClosing }: TradeCardProps) {
  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex);
  const direction = DIRECTIONS.find((d) => d.isLong === trade.isLong);
  
  const pnl = pnlData?.pnl ?? 0;
  const pnlPercentage = pnlData?.pnlPercentage ?? 0;
  const currentPrice = pnlData?.currentPrice ?? trade.openPrice;
  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  
  const positionSize = trade.collateral * trade.leverage;
  
  // Calculate time open
  const timeOpen = trade.openedAt > 0 
    ? Math.floor((Date.now() - trade.openedAt) / 1000 / 60) // minutes
    : 0;
  const timeDisplay = timeOpen < 60 
    ? `${timeOpen}m` 
    : `${Math.floor(timeOpen / 60)}h ${timeOpen % 60}m`;

  return (
    <div className="bg-white/5 rounded-lg p-4 border-2 border-white/10">
      {/* Header: Asset and Direction */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {asset && (
            <div
              className="px-3 py-1 text-sm font-bold text-black rounded flex items-center gap-1.5"
              style={{ backgroundColor: asset.color }}
            >
              <img src={asset.icon} alt={asset.name} className="w-4 h-4" />
              {asset.name}
            </div>
          )}
          {direction && (
            <div
              className="px-3 py-1 text-sm font-bold text-black rounded"
              style={{ backgroundColor: direction.color }}
            >
              {direction.name}
            </div>
          )}
          <div className="px-3 py-1 text-sm font-bold bg-white/20 text-white rounded">
            {trade.leverage}x
          </div>
        </div>
      </div>

      {/* PnL Display */}
      <div className="mb-3">
        <div className={`text-3xl font-bold mb-1`} style={{ color }}>
          {isProfit ? '+' : ''}${pnl.toFixed(2)}
        </div>
        <div className={`text-lg font-bold mb-2`} style={{ color }}>
          {isProfit ? '+' : ''}{pnlPercentage.toFixed(2)}%
        </div>
        <div className="text-white/50 text-xs">
          Entry: ${trade.openPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} • 
          Current: ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Position Info */}
      <div className="text-white/50 text-xs mb-3 space-y-1">
        <div>Position: ${trade.collateral} × {trade.leverage}x = ${positionSize.toLocaleString()}</div>
        {timeOpen > 0 && <div>Open: {timeDisplay}</div>}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onFlip(trade)}
          disabled={isFlipping || isClosing}
          className="flex-1 py-2 px-4 text-sm font-bold bg-[#CCFF00] text-black rounded brutal-button disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isFlipping ? 'FLIPPING...' : 'FLIP'}
        </button>
        <button
          onClick={() => onClose(trade)}
          disabled={isFlipping || isClosing}
          className="px-4 py-2 text-sm font-bold bg-white/10 text-white rounded brutal-button disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20"
        >
          {isClosing ? '...' : 'CLOSE'}
        </button>
      </div>
    </div>
  );
}
