'use client';

import React from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePnL } from '@/hooks/usePnL';
import { useFlipTrade } from '@/hooks/useFlipTrade';

interface PnLScreenProps {
  onClose: () => void;
  onRollAgain: () => void;
  isClosing: boolean;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade } = useTradeStore();
  const { flipTrade, isFlipping } = useFlipTrade();
  
  // Start PnL polling
  usePnL({ enabled: true, interval: 1000 });

  const handleFlip = async () => {
    if (!currentTrade) return;
    try {
      await flipTrade(currentTrade);
      // PnL screen will update automatically via usePnL hook
    } catch (error) {
      console.error('Failed to flip trade:', error);
      alert(error instanceof Error ? error.message : 'Failed to flip trade');
    }
  };

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
            className="selection-chip px-4 py-2 text-black font-bold text-lg flex items-center gap-2"
            style={{ backgroundColor: selection.asset.color }}
          >
            <img src={selection.asset.icon} alt={selection.asset.name} className="w-5 h-5" />
            {selection.asset.name}
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
            {selection.direction.name}
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
      <div className="flex flex-col gap-4 w-full max-w-md items-center">
        {/* Circular FLIP button */}
        <button
          onClick={handleFlip}
          disabled={isFlipping || isClosing}
          className="w-20 h-20 rounded-full font-bold text-lg brutal-button disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          style={{ backgroundColor: '#CCFF00', color: '#000' }}
          aria-label="Flip trade"
        >
          {isFlipping ? '...' : '↻'}
        </button>
        
        {/* Secondary actions */}
        <div className="flex gap-4 w-full">
          <button
            onClick={onClose}
            disabled={isClosing || isFlipping}
            className="flex-1 py-3 text-sm font-bold bg-white/10 text-white brutal-button disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20"
          >
            {isClosing ? 'CLOSING...' : 'CLOSE'}
          </button>
          <button
            onClick={onRollAgain}
            disabled={isClosing || isFlipping}
            className="flex-1 py-3 text-sm font-bold brutal-button disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#CCFF00', color: '#000' }}
          >
            ROLL AGAIN
          </button>
        </div>
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
