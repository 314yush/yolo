'use client';

import React, { useState, useEffect } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePnL } from '@/hooks/usePnL';
import { useFlipTrade } from '@/hooks/useFlipTrade';
import { usePrebuiltCloseTx } from '@/hooks/usePrebuiltCloseTx';
import { usePrebuiltFlipTx } from '@/hooks/usePrebuiltFlipTx';
import { PriceChart } from './PriceChart';
import { LoginButton } from './LoginButton';
import { ASSETS, LEVERAGES, DIRECTIONS } from '@/lib/constants';

interface PnLScreenProps {
  onClose: () => void;
  onRollAgain: () => void;
  isClosing: boolean;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade, prices } = useTradeStore();
  const { flipTrade, isFlipping } = useFlipTrade();
  const [prevPnl, setPrevPnl] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  
  // Activate pre-building when trade exists
  usePrebuiltCloseTx();
  usePrebuiltFlipTx();
  
  // Start PnL polling
  usePnL({ enabled: true, interval: 1000 });
  
  // Get real-time Pyth price for the current asset
  // FIX: Use pnlData.trade or currentTrade to determine assetPair, not selection
  // This ensures we show the correct pair when multiple positions exist
  const assetPair = pnlData?.trade?.pair ?? currentTrade?.pair ?? (selection?.asset ? `${selection.asset.name}/USD` : null);
  const pythCurrentPrice = assetPair ? prices[assetPair]?.price ?? null : null;

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

  // Get the correct entry price from pnlData (matches the displayed PnL)
  // This ensures we show the entry price for the trade that matches the PnL being displayed
  const entryPrice = pnlData?.trade?.openPrice ?? currentTrade?.openPrice ?? null;
  
  // Get current price for display
  const currentPrice = pythCurrentPrice ?? pnlData?.currentPrice ?? null;
  
  // Derive display values from pnlData.trade or currentTrade (not selection, which may be stale)
  // This ensures chips and assetPair match the actual trade being displayed
  const displayTrade = pnlData?.trade ?? currentTrade;
  const displayAsset = displayTrade ? ASSETS.find(a => a.pairIndex === displayTrade.pairIndex) : selection?.asset;
  const displayLeverage = displayTrade ? LEVERAGES.find(l => l.value === displayTrade.leverage) : selection?.leverage;
  const displayDirection = displayTrade ? DIRECTIONS.find(d => d.isLong === displayTrade.isLong) : selection?.direction;

  return (
    <div className="min-h-screen bg-black flex flex-col w-full max-w-md mx-auto safe-area-top safe-area-bottom">
      {/* 1. Header (60px) */}
      <header className="h-[60px] flex justify-between items-center px-4 relative z-10">
        <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-bold">YOLO</h1>
        <LoginButton />
      </header>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* 2. Chart Header (40px) */}
        <div className="h-[40px] flex justify-between items-center px-4 border-b border-white/10">
          <div className="text-white/80 text-sm sm:text-base font-bold font-mono uppercase">
            {assetPair || 'Loading...'}
          </div>
          {currentPrice !== null && (
            <div className="text-[#CCFF00] text-base sm:text-lg font-black font-mono">
              ${currentPrice.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: currentPrice < 10 ? 4 : 2 
              })}
            </div>
          )}
        </div>

        {/* 3. Chart (320px) - Full width, no padding */}
        <div className="h-[320px] w-full overflow-hidden">
          <PriceChart
            assetPair={assetPair}
            lineColor={isProfit ? '#CCFF00' : '#FF006E'}
            entryPrice={entryPrice}
            height={320}
            pnl={pnl}
            showLegend={false}
          />
        </div>

        {/* 4. Small Chips (32px) */}
        <div 
          className="flex gap-2 flex-wrap justify-center px-4 py-2 min-h-[32px]"
          role="group"
          aria-label="Trade parameters"
        >
          {displayAsset && (
            <div
              className="selection-chip px-3 py-1.5 text-sm font-bold text-black flex items-center gap-1.5 font-mono"
              style={{ backgroundColor: displayAsset.color }}
            >
              <img 
                src={displayAsset.icon} 
                alt="" 
                className="w-4 h-4"
                aria-hidden="true"
              />
              <span>{displayAsset.name}</span>
            </div>
          )}
          {displayLeverage && (
            <div
              className="selection-chip px-3 py-1.5 text-sm font-bold text-black font-mono"
              style={{ backgroundColor: displayLeverage.color }}
            >
              {displayLeverage.name}
            </div>
          )}
          {displayDirection && (
            <div
              className="selection-chip px-3 py-1.5 text-sm font-bold text-black font-mono"
              style={{ backgroundColor: displayDirection.color }}
            >
              {displayDirection.name}
            </div>
          )}
        </div>

        {/* 5. Large PnL (120px) */}
        <div 
          className={`min-h-[120px] flex flex-col items-center justify-center px-4 py-6 ${isFlashing ? 'animate-pnl-flash' : ''}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            className={`text-5xl sm:text-6xl font-black animate-pnl-pulse ${glowClass} leading-none font-mono`}
            style={{ color, letterSpacing: '-0.03em' }}
          >
            {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
          </div>
          <div
            className={`text-2xl sm:text-3xl font-bold mt-2 ${glowClass} font-mono`}
            style={{ color }}
          >
            {isProfit ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%
          </div>
        </div>

        {/* 6. Inline Info (24px each) */}
        <div className="px-4 space-y-1 pb-4">
          {/* Entry → Current price line */}
          {(entryPrice != null || currentPrice != null) && (
            <div className="h-[24px] flex items-center justify-center gap-3 text-sm font-mono text-white/60">
              <span>Entry:</span>
              <span className="text-white font-semibold">
                ${entryPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
              </span>
              <span className="text-white/40">→</span>
              <span>Now:</span>
              <span className="font-semibold" style={{ color }}>
                ${currentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
              </span>
            </div>
          )}
          
          {/* TP at 200% line */}
          <div className="h-[24px] flex items-center justify-center text-sm font-mono text-white/50">
            TP at 200%
          </div>
        </div>

        {/* Spacer for floating buttons (160px) */}
        <div className="h-[160px]" />

        {/* Liquidation warning (if applicable) */}
        {isNearLiq && (
          <div className="w-full px-4 pb-4">
            <div className="p-3 border-4 border-[#FF006E] bg-[#FF006E]/20 animate-danger-pulse">
              <div className="flex items-center justify-center gap-2 text-[#FF006E] font-bold text-sm font-mono">
                <span className="text-xl">⚠️</span>
                <span>{liqDistance.toFixed(1)}% FROM LIQUIDATION</span>
              </div>
            </div>
          </div>
        )}

        <span className="sr-only">
          {isProfit ? 'Profit' : 'Loss'} of {Math.abs(pnl).toFixed(2)} USDC, {Math.abs(pnlPercentage).toFixed(2)} percent
        </span>
      </div>

      {/* Floating Action Buttons - Above nav bar */}
      <div className="fixed left-0 right-0 px-4 z-40" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <div className="max-w-md mx-auto flex gap-3 items-center">
          {/* Close button - Icon only */}
          <button
            onClick={onClose}
            disabled={isClosing || isFlipping}
            aria-label={isClosing ? 'Closing trade...' : 'Close and take profit/loss'}
            aria-busy={isClosing}
            className="brutal-button brutal-button-danger w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation shadow-[0_8px_16px_rgba(0,0,0,0.4)]"
          >
            <span className="text-2xl sm:text-3xl font-black">✕</span>
          </button>

          {/* Flip button - Icon only */}
          <button
            onClick={handleFlip}
            disabled={isFlipping || isClosing}
            aria-label={isFlipping ? 'Flipping...' : `Flip to ${currentTrade?.isLong ? 'SHORT' : 'LONG'}`}
            aria-busy={isFlipping}
            className="brutal-button brutal-button-secondary w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation shadow-[0_8px_16px_rgba(0,0,0,0.4)]"
          >
            <span className="text-2xl sm:text-3xl font-black">⟲</span>
          </button>

          {/* Roll Again button - Text */}
          <button
            onClick={onRollAgain}
            disabled={isClosing || isFlipping}
            aria-label="Start a new trade"
            className="flex-1 brutal-button py-3 sm:py-4 text-base sm:text-lg font-black font-mono uppercase bg-[#CCFF00] text-black disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[56px] sm:min-h-[64px] flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.4)]"
          >
            ROLL
          </button>
        </div>
      </div>
    </div>
  );
}
