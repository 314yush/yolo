'use client';

import React, { useState, useEffect } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePnL } from '@/hooks/usePnL';
import { useFlipTrade } from '@/hooks/useFlipTrade';
import { usePrebuiltCloseTx } from '@/hooks/usePrebuiltCloseTx';
import { usePrebuiltFlipTx } from '@/hooks/usePrebuiltFlipTx';

interface PnLScreenProps {
  onClose: () => void;
  onRollAgain: () => void;
  isClosing: boolean;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade } = useTradeStore();
  const { flipTrade, isFlipping } = useFlipTrade();
  const [prevPnl, setPrevPnl] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  
  // Activate pre-building when trade exists
  usePrebuiltCloseTx();
  usePrebuiltFlipTx();
  
  // Start PnL polling
  usePnL({ enabled: true, interval: 1000 });

  // Flash animation on PnL change
  useEffect(() => {
    const currentPnl = pnlData?.pnl ?? 0;
    if (prevPnl !== null && prevPnl !== currentPnl) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 300);
    }
    setPrevPnl(currentPnl);
  }, [pnlData?.pnl, prevPnl]);

  const handleFlip = async () => {
    if (!currentTrade) return;
    try {
      await flipTrade(currentTrade);
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

  // Calculate TP progress (0 to 200%)
  const tpProgress = Math.min(Math.max(pnlPercentage, -100), 200);
  const tpProgressNormalized = (tpProgress + 100) / 3; // -100% to 200% -> 0 to 100

  // Calculate liquidation distance (simplified - ~90% loss = liquidation for high leverage)
  const liqDistance = currentTrade ? Math.abs(100 + pnlPercentage) : 100;
  const isNearLiq = liqDistance < 20;
  const isNearTP = pnlPercentage > 80;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-2xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-12 pb-24 sm:pb-8 space-y-5 sm:space-y-6 md:space-y-8">
      
      {/* 1. CHIPS AT TOP - Compact */}
      <div 
        className="flex gap-1.5 sm:gap-2 flex-wrap justify-center"
        role="group"
        aria-label="Trade parameters"
      >
        {selection?.asset && (
          <div
            className="selection-chip px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-black flex items-center gap-1"
            style={{ backgroundColor: selection.asset.color }}
          >
            <img 
              src={selection.asset.icon} 
              alt="" 
              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              aria-hidden="true"
            />
            <span>{selection.asset.name}</span>
          </div>
        )}
        {selection?.leverage && (
          <div
            className="selection-chip px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-black"
            style={{ backgroundColor: selection.leverage.color }}
          >
            {selection.leverage.name}
          </div>
        )}
        {selection?.direction && (
          <div
            className="selection-chip px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-black"
            style={{ backgroundColor: selection.direction.color }}
          >
            {selection.direction.name}
          </div>
        )}
      </div>

      {/* 2. GIANT PnL DISPLAY - Dominant, centered */}
      <div 
        className={`text-center py-2 sm:py-4 md:py-6 ${isFlashing ? 'animate-pnl-flash' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div
          className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black animate-pnl-pulse ${glowClass} leading-none`}
          style={{ color, letterSpacing: '-0.03em' }}
        >
          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
        </div>
        <div
          className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 sm:mt-2 ${glowClass}`}
          style={{ color }}
        >
          {isProfit ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%
        </div>
        <span className="sr-only">
          {isProfit ? 'Profit' : 'Loss'} of {Math.abs(pnl).toFixed(2)} USDC, {Math.abs(pnlPercentage).toFixed(2)} percent
        </span>
      </div>

      {/* 3. TP PROGRESS BAR */}
      <div className="w-full max-w-md space-y-1.5 sm:space-y-2">
        <div className="flex justify-between text-[10px] sm:text-xs font-mono text-white/50">
          <span>-100%</span>
          <span className={`font-bold text-xs sm:text-sm ${isNearTP ? 'text-[#CCFF00]' : 'text-white/70'}`}>
            {isNearTP ? '🎯 ALMOST TP!' : 'Progress to 200% TP'}
          </span>
          <span>+200%</span>
        </div>
        <div className={`brutal-progress ${isNearLiq ? 'animate-danger-pulse' : isNearTP ? 'animate-success-pulse' : ''}`}>
          <div 
            className={`brutal-progress-bar ${isProfit ? 'brutal-progress-bar-green' : 'brutal-progress-bar-red'}`}
            style={{ width: `${tpProgressNormalized}%` }}
          />
        </div>
      </div>

      {/* 4. PRICE COMPARISON - Simple inline text */}
      {(currentTrade?.openPrice != null || pnlData?.currentPrice != null) && (
        <div className="flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-base font-mono text-white/60">
          <span>Entry:</span>
          <span className="text-white font-semibold">
            ${currentTrade?.openPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
          </span>
          <span className="text-white/40">→</span>
          <span>Current:</span>
          <span className="font-semibold" style={{ color }}>
            ${pnlData?.currentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
          </span>
        </div>
      )}

      {/* 5. LIQUIDATION WARNING (if applicable) */}
      {isNearLiq && (
        <div className="w-full max-w-md p-2.5 sm:p-3 border-4 border-[#FF006E] bg-[#FF006E]/20 animate-danger-pulse">
          <div className="flex items-center justify-center gap-2 text-[#FF006E] font-bold text-xs sm:text-sm">
            <span className="text-lg sm:text-xl">⚠️</span>
            <span>{liqDistance.toFixed(1)}% FROM LIQUIDATION</span>
          </div>
        </div>
      )}

      {/* 6. ACTION BUTTONS - Optimized spacing */}
      <div className="w-full max-w-md space-y-2.5 sm:space-y-3 pt-1 sm:pt-2">
        {/* Primary row: CLOSE and ROLL AGAIN */}
        <div className="flex gap-2.5 sm:gap-3 w-full">
          <button
            onClick={onClose}
            disabled={isClosing || isFlipping}
            aria-label={isClosing ? 'Closing trade...' : 'Close and take profit/loss'}
            aria-busy={isClosing}
            className="flex-1 py-3.5 sm:py-4 text-sm sm:text-base font-bold brutal-button-danger disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[52px] sm:min-h-[56px]"
          >
            {isClosing ? 'CLOSING...' : 'CLOSE EARLY'}
          </button>
          <button
            onClick={onRollAgain}
            disabled={isClosing || isFlipping}
            aria-label="Start a new trade"
            className="flex-1 py-3.5 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[52px] sm:min-h-[56px]"
          >
            ROLL AGAIN
          </button>
        </div>
        
        {/* Secondary: FLIP button */}
        <button
          onClick={handleFlip}
          disabled={isFlipping || isClosing}
          aria-label={isFlipping ? 'Flipping...' : `Flip to ${currentTrade?.isLong ? 'SHORT' : 'LONG'}`}
          aria-busy={isFlipping}
          className="w-full py-2.5 sm:py-3 text-xs sm:text-sm font-bold brutal-button-secondary disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-[48px] flex items-center justify-center gap-2"
        >
          <span>↻</span>
          <span>{isFlipping ? 'FLIPPING...' : `FLIP TO ${currentTrade?.isLong ? 'SHORT' : 'LONG'}`}</span>
        </button>
      </div>

      {/* TP info at bottom - Subtle */}
      {currentTrade && currentTrade.tp != null && currentTrade.tp > 0 && (
        <div className="text-white/30 text-[10px] sm:text-xs text-center font-mono pt-1 sm:pt-2">
          Auto-close at ${currentTrade.tp.toLocaleString()} (200% profit)
        </div>
      )}
    </div>
  );
}
