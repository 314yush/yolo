'use client';

import React, { useState, useEffect } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePnL } from '@/hooks/usePnL';
import { useFlipTrade } from '@/hooks/useFlipTrade';
import { usePrebuiltCloseTx } from '@/hooks/usePrebuiltCloseTx';
import { usePrebuiltFlipTx } from '@/hooks/usePrebuiltFlipTx';
import { useViewportDimensions } from '@/hooks/useViewportDimensions';
import { PriceChart } from './PriceChart';
import { LoginButton } from './LoginButton';
import { ASSETS, LEVERAGES, DIRECTIONS } from '@/lib/constants';

interface PnLScreenProps {
  onClose: () => void;
  onRollAgain: () => void;
  isClosing: boolean;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade, prices, confirmationStage, txHash } = useTradeStore();
  const { flipTrade, isFlipping } = useFlipTrade();
  const [prevPnl, setPrevPnl] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  
  // Check if trade is still confirming
  const isConfirming = confirmationStage !== 'none' && confirmationStage !== 'confirmed' && confirmationStage !== 'failed';
  
  // Get viewport dimensions for responsive chart sizing
  const viewport = useViewportDimensions();
  
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
  
  // Get liquidation price from trade data
  const liquidationPrice = pnlData?.trade?.liquidationPrice ?? currentTrade?.liquidationPrice ?? null;
  
  // Get current price for display
  const currentPrice = pythCurrentPrice ?? pnlData?.currentPrice ?? null;
  
  // Derive display values from pnlData.trade or currentTrade (not selection, which may be stale)
  // This ensures chips and assetPair match the actual trade being displayed
  const displayTrade = pnlData?.trade ?? currentTrade;
  const displayAsset = displayTrade ? ASSETS.find(a => a.pairIndex === displayTrade.pairIndex) : selection?.asset;
  const displayLeverage = displayTrade ? LEVERAGES.find(l => l.value === displayTrade.leverage) : selection?.leverage;
  const displayDirection = displayTrade ? DIRECTIONS.find(d => d.isLong === displayTrade.isLong) : selection?.direction;

  // Calculate dynamic chart height - use viewport dimensions or calculate from available space
  // Chart should take remaining space after header, chart header, chips, PnL, info
  // Buttons are now fixed above nav bar, so they don't take grid space
  const calculateChartHeight = (): number => {
    if (typeof window === 'undefined') return 320;
    
    // Get dynamic viewport height
    const dvh = window.innerHeight;
    
    // Calculate fixed section heights (using min values for calculation)
    const headerHeight = Math.min(60, dvh * 0.08);
    const chartHeaderHeight = Math.min(40, dvh * 0.05);
    const chipsHeight = Math.min(48, dvh * 0.05);
    const pnlHeight = Math.min(120, dvh * 0.12);
    const infoHeight = Math.min(56, dvh * 0.06);
    // Buttons are fixed, so they don't reduce chart space
    
    // Calculate remaining space
    const remaining = dvh - headerHeight - chartHeaderHeight - chipsHeight - pnlHeight - infoHeight;
    
    // Clamp between 200px and 400px
    return Math.max(200, Math.min(400, remaining));
  };
  
  const chartHeight = viewport.chartDimensions.height > 0 
    ? Math.max(200, Math.min(400, viewport.chartDimensions.height))
    : calculateChartHeight();
  
  // Navigation bar height (approximately 70px including padding and safe area)
  const navBarHeight = 70;

  return (
    <div 
      className="bg-black w-full safe-area-top safe-area-bottom"
      style={{
        height: '100dvh',
        maxHeight: '100dvh',
        width: '100vw',
        maxWidth: '100vw',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
        gridTemplateAreas: `
          "header"
          "chart-header"
          "chart"
          "content"
        `,
      }}
    >
      {/* 1. Header - Fixed height, scales down */}
      <header 
        className="flex justify-between items-center px-4 relative z-10 w-full"
        style={{
          gridArea: 'header',
          height: 'clamp(50px, 8vh, 60px)',
          minHeight: 'clamp(50px, 8vh, 60px)',
        }}
      >
        <h1 
          className="text-[#CCFF00] font-bold"
          style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)' }}
        >
          YOLO
        </h1>
        <LoginButton />
      </header>

      {/* 2. Chart Header - Fixed height, scales down */}
      <div 
        className="flex justify-between items-center px-4 border-b border-white/10"
        style={{
          gridArea: 'chart-header',
          height: 'clamp(32px, 5vh, 40px)',
          minHeight: 'clamp(32px, 5vh, 40px)',
        }}
      >
        <div 
          className="text-white/80 font-bold font-mono uppercase"
          style={{ fontSize: 'clamp(0.75rem, 2vw, 1rem)' }}
        >
          {assetPair || 'Loading...'}
        </div>
        {currentPrice !== null && (
          <div 
            className="text-[#CCFF00] font-black font-mono"
            style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.125rem)' }}
          >
            ${currentPrice.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: currentPrice < 10 ? 4 : 2 
            })}
          </div>
        )}
      </div>

      {/* 3. Chart - Takes remaining space, scales dynamically */}
      <div 
        className="w-full overflow-hidden chart-container-full-width"
        style={{ 
          gridArea: 'chart',
          height: `${chartHeight}px`,
          minHeight: '200px',
          maxHeight: '400px',
          width: 'calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))',
          marginLeft: 'calc(-1 * env(safe-area-inset-left, 0px))',
        }}
      >
        <PriceChart
          assetPair={assetPair}
          lineColor={isProfit ? '#CCFF00' : '#FF006E'}
          entryPrice={entryPrice}
          liquidationPrice={liquidationPrice}
          height={chartHeight}
          pnl={pnl}
          showLegend={false}
        />
      </div>

      {/* 4. Content area - Fixed height sections */}
      <div 
        className="w-full overflow-hidden"
        style={{
          gridArea: 'content',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {/* Small Chips */}
        <div 
          className="flex gap-2 flex-wrap justify-center px-4"
          style={{
            paddingTop: 'clamp(0.25rem, 1vh, 0.5rem)',
            paddingBottom: 'clamp(0.25rem, 1vh, 0.5rem)',
            minHeight: 'clamp(32px, 5vh, 48px)',
            maxHeight: 'clamp(32px, 5vh, 48px)',
          }}
          role="group"
          aria-label="Trade parameters"
        >
          {displayAsset && (
            <div
              className="selection-chip font-bold text-black flex items-center gap-1.5 font-mono"
              style={{ 
                backgroundColor: displayAsset.color,
                padding: 'clamp(0.25rem, 1vh, 0.375rem) clamp(0.5rem, 1.5vw, 0.75rem)',
                fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
              }}
            >
              <img 
                src={displayAsset.icon} 
                alt="" 
                style={{ width: 'clamp(0.875rem, 2.5vw, 1rem)', height: 'clamp(0.875rem, 2.5vw, 1rem)' }}
                aria-hidden="true"
              />
              <span>{displayAsset.name}</span>
            </div>
          )}
          {displayLeverage && (
            <div
              className="selection-chip font-bold text-black font-mono"
              style={{ 
                backgroundColor: displayLeverage.color,
                padding: 'clamp(0.25rem, 1vh, 0.375rem) clamp(0.5rem, 1.5vw, 0.75rem)',
                fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
              }}
            >
              {displayLeverage.name}
            </div>
          )}
          {displayDirection && (
            <div
              className="selection-chip font-bold text-black font-mono"
              style={{ 
                backgroundColor: displayDirection.color,
                padding: 'clamp(0.25rem, 1vh, 0.375rem) clamp(0.5rem, 1.5vw, 0.75rem)',
                fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
              }}
            >
              {displayDirection.name}
            </div>
          )}
        </div>

        {/* Large PnL */}
        <div 
          className={`flex flex-col items-center justify-center px-4 ${isFlashing ? 'animate-pnl-flash' : ''}`}
          style={{
            minHeight: 'clamp(80px, 12vh, 120px)',
            maxHeight: 'clamp(80px, 12vh, 120px)',
            paddingTop: 'clamp(0.5rem, 1.5vh, 1rem)',
            paddingBottom: 'clamp(0.5rem, 1.5vh, 1rem)',
          }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {isConfirming ? (
            <>
              <div 
                className="font-black leading-none font-mono text-white/60 mb-2"
                style={{ fontSize: 'clamp(2rem, 8vw, 3.75rem)' }}
              >
                CONFIRMING...
              </div>
              <div 
                className="border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin"
                style={{ width: 'clamp(1.5rem, 4vw, 2rem)', height: 'clamp(1.5rem, 4vw, 2rem)' }}
              />
              {txHash && (
                <div 
                  className="text-white/40 mt-2 font-mono"
                  style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)' }}
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className={`font-black animate-pnl-pulse ${glowClass} leading-none font-mono`}
                style={{ 
                  color, 
                  letterSpacing: '-0.03em',
                  fontSize: 'clamp(2rem, 8vw, 3.75rem)',
                }}
              >
                {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
              </div>
              <div
                className={`font-bold mt-2 ${glowClass} font-mono`}
                style={{ 
                  color,
                  fontSize: 'clamp(1.25rem, 5vw, 1.875rem)',
                }}
              >
                {isProfit ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%
              </div>
            </>
          )}
        </div>

        {/* Inline Info */}
        <div 
          className="px-4"
          style={{
            paddingTop: 'clamp(0.25rem, 1vh, 0.5rem)',
            paddingBottom: 'clamp(0.25rem, 1vh, 0.5rem)',
            minHeight: 'clamp(40px, 6vh, 56px)',
            maxHeight: 'clamp(40px, 6vh, 56px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 'clamp(0.125rem, 0.5vh, 0.25rem)',
          }}
        >
          {/* Entry → Current price line */}
          {(entryPrice != null || currentPrice != null) && (
            <div 
              className="flex items-center justify-center gap-3 font-mono text-white/60"
              style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}
            >
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
          <div 
            className="flex items-center justify-center font-mono text-white/50"
            style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}
          >
            TP at 200%
          </div>
        </div>

        {/* Liquidation warning (if applicable) */}
        {isNearLiq && (
          <div 
            className="w-full px-4"
            style={{
              paddingTop: 'clamp(0.25rem, 1vh, 0.5rem)',
              paddingBottom: 'clamp(0.25rem, 1vh, 0.5rem)',
            }}
          >
            <div 
              className="border-4 border-[#FF006E] bg-[#FF006E]/20 animate-danger-pulse"
              style={{ padding: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}
            >
              <div 
                className="flex items-center justify-center gap-2 text-[#FF006E] font-bold font-mono"
                style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}
              >
                <span style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>⚠️</span>
                <span>{liqDistance.toFixed(1)}% FROM LIQUIDATION</span>
              </div>
            </div>
          </div>
        )}

        <span className="sr-only">
          {isProfit ? 'Profit' : 'Loss'} of {Math.abs(pnl).toFixed(2)} USDC, {Math.abs(pnlPercentage).toFixed(2)} percent
        </span>
        
        {/* Spacer for fixed buttons above nav bar */}
        <div style={{ height: `calc(${navBarHeight + 80}px + env(safe-area-inset-bottom, 0px))` }} />
      </div>

      {/* 5. Action Buttons - Fixed above navigation bar */}
      <div 
        className="fixed left-0 right-0 px-4 z-40 max-w-md mx-auto"
        style={{
          bottom: `calc(${navBarHeight}px + env(safe-area-inset-bottom, 0px))`,
          paddingTop: 'clamp(0.75rem, 2vh, 1rem)',
          paddingBottom: 'clamp(0.75rem, 2vh, 1rem)',
        }}
      >
        <div className="w-full flex gap-3 items-center">
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={isClosing || isFlipping}
            aria-label={isClosing ? 'Closing trade...' : 'Close and take profit/loss'}
            aria-busy={isClosing}
            className="brutal-button brutal-button-danger flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation shadow-[0_8px_16px_rgba(0,0,0,0.4)] relative focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            style={{
              width: 'clamp(3.5rem, 10vw, 4rem)',
              height: 'clamp(3.5rem, 10vw, 4rem)',
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            {isClosing ? (
              <svg
                className="animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ width: 'clamp(1.5rem, 4vw, 1.75rem)', height: 'clamp(1.5rem, 4vw, 1.75rem)' }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ width: 'clamp(1.5rem, 4vw, 1.75rem)', height: 'clamp(1.5rem, 4vw, 1.75rem)' }}
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
          </button>

          {/* Flip button */}
          <button
            onClick={handleFlip}
            disabled={isFlipping || isClosing}
            aria-label={isFlipping ? 'Flipping...' : `Flip to ${currentTrade?.isLong ? 'SHORT' : 'LONG'}`}
            aria-busy={isFlipping}
            className="brutal-button brutal-button-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation shadow-[0_8px_16px_rgba(0,0,0,0.4)] relative focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            style={{
              minWidth: 'clamp(7.5rem, 25vw, 8.75rem)',
              minHeight: 'clamp(3.5rem, 10vw, 4rem)',
              padding: 'clamp(0.75rem, 2vh, 1rem)',
              fontSize: 'clamp(0.75rem, 2vw, 1rem)',
            }}
          >
            {isFlipping ? (
              <svg
                className="animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ width: 'clamp(1.5rem, 4vw, 1.75rem)', height: 'clamp(1.5rem, 4vw, 1.75rem)' }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ width: 'clamp(1.5rem, 4vw, 1.75rem)', height: 'clamp(1.5rem, 4vw, 1.75rem)' }}
              >
                <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
              </svg>
            )}
            <span className="font-black font-mono uppercase hidden sm:inline">FLIP</span>
          </button>

          {/* Roll Again button */}
          <button
            onClick={onRollAgain}
            disabled={isClosing || isFlipping}
            aria-label="Start a new trade"
            className="flex-1 brutal-button font-black font-mono uppercase bg-[#CCFF00] text-black disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation flex items-center justify-center gap-2 shadow-[0_8px_16px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            style={{
              minWidth: 'clamp(7.5rem, 25vw, 8.75rem)',
              minHeight: 'clamp(3.5rem, 10vw, 4rem)',
              padding: 'clamp(0.75rem, 2vh, 1rem)',
              fontSize: 'clamp(0.875rem, 2.5vw, 1.125rem)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ width: 'clamp(1.5rem, 4vw, 1.75rem)', height: 'clamp(1.5rem, 4vw, 1.75rem)' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" />
            </svg>
            <span>ROLL</span>
          </button>
        </div>
      </div>
    </div>
  );
}
