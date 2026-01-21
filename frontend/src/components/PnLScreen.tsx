'use client';

import React from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePnL } from '@/hooks/usePnL';

interface PnLScreenProps {
  onClose: () => void;
  onRollAgain: () => void;
  isClosing: boolean;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade } = useTradeStore();
  
  // Start PnL polling
  usePnL({ enabled: true, interval: 1000 });

  // Calculate display values
  const pnl = pnlData?.pnl ?? 0;
  const pnlPercentage = pnlData?.pnlPercentage ?? 0;
  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  const glowClass = isProfit ? 'pnl-glow-green' : 'pnl-glow-red';

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-8 px-4">
      {/* Selection chips */}
      <div className="flex gap-3 flex-wrap justify-center">
        {selection?.asset && (
          <div
            className="selection-chip px-4 py-2 text-black font-bold text-lg"
            style={{ backgroundColor: selection.asset.color }}
          >
            {selection.asset.icon} {selection.asset.name}
          </div>
        )}
        {selection?.leverage && (
          <div
            className="selection-chip px-4 py-2 text-black font-bold text-lg"
            style={{ backgroundColor: selection.leverage.color }}
          >
            {selection.leverage.name}
          </div>
        )}
        {selection?.direction && (
          <div
            className="selection-chip px-4 py-2 text-black font-bold text-lg"
            style={{ backgroundColor: selection.direction.color }}
          >
            {selection.direction.symbol} {selection.direction.name}
          </div>
        )}
      </div>

      {/* Entry price info */}
      {currentTrade && currentTrade.openPrice != null && (
        <div className="text-white/50 text-sm text-center">
          Entry: ${currentTrade.openPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {' • '}
          Collateral: ${currentTrade.collateral}
        </div>
      )}

      {/* Giant PnL display */}
      <div className="text-center">
        <div
          className={`text-7xl md:text-8xl font-bold mb-4 animate-pnl-pulse ${glowClass}`}
          style={{ color }}
        >
          {isProfit ? '+' : ''}${pnl.toFixed(2)}
        </div>
        <div
          className={`text-4xl md:text-5xl font-bold ${glowClass}`}
          style={{ color }}
        >
          {isProfit ? '+' : ''}{pnlPercentage.toFixed(2)}%
        </div>
      </div>

      {/* Current price */}
      {pnlData && pnlData.currentPrice != null && (
        <div className="text-white/50 text-sm">
          Current: ${pnlData.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-4 w-full max-w-md">
        <button
          onClick={onClose}
          disabled={isClosing}
          className="flex-1 py-4 text-xl font-bold bg-white text-black brutal-button disabled:opacity-50"
        >
          {isClosing ? 'CLOSING...' : 'CLOSE EARLY'}
        </button>
        <button
          onClick={onRollAgain}
          disabled={isClosing}
          className="flex-1 py-4 text-xl font-bold brutal-button disabled:opacity-50"
          style={{ backgroundColor: '#CCFF00', color: '#000' }}
        >
          ROLL AGAIN
        </button>
      </div>

      {/* TP info */}
      {currentTrade && currentTrade.tp != null && currentTrade.tp > 0 && (
        <div className="text-white/30 text-xs text-center">
          Take Profit at ${currentTrade.tp.toLocaleString()} (100% profit)
        </div>
      )}
    </div>
  );
}
