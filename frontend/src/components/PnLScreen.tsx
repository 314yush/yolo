'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePnL } from '@/hooks/usePnL';
import { useFlipTrade } from '@/hooks/useFlipTrade';
import { usePrebuiltCloseTx } from '@/hooks/usePrebuiltCloseTx';
import { usePrebuiltFlipTx } from '@/hooks/usePrebuiltFlipTx';
import { useSound } from '@/hooks/useSound';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { vibrateMedium } from '@/lib/haptics';
import confetti from 'canvas-confetti';
import { PriceChart } from './PriceChart';
import { ASSETS, LEVERAGES, DIRECTIONS } from '@/lib/constants';

// Chart colors matching PriceChart component
const CHART_COLORS = {
  entry: '#CCFF00',        // Lime Green for entry
  liquidation: '#FF006E',  // Hot Pink for liquidation
};

interface PnLScreenProps {
  onClose: () => void;
  onRollAgain: () => void;
  isClosing: boolean;
}

// Gamification messages based on PnL state
function getGamificationMessage(pnlPercentage: number, isConfirming: boolean, isNearLiq: boolean, liqDistance: number): string | null {
  if (isConfirming) return "Rolling the dice...";
  if (isNearLiq) {
    // More dramatic messages as liquidation approaches
    if (liqDistance < 5) return "⚠️ DANGER ZONE ⚠️";
    if (liqDistance < 10) return "🚨 HOLD THE LINE! 🚨";
    if (liqDistance < 15) return "💪 Stay strong!";
    return "⚡ Hold tight!";
  }
  if (pnlPercentage >= 150) return "🎯 Almost there!";
  if (pnlPercentage >= 100) return "🔥 You're on fire!";
  if (pnlPercentage >= 50) return "✨ Looking good!";
  if (pnlPercentage >= 0) return "Good luck!";
  if (pnlPercentage >= -50) return "Stay strong!";
  return null;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade, prices, confirmationStage, txHash, isLiquidated, lastKnownPnLPercentage, showToast } = useTradeStore();
  const { flipTrade, isFlipping } = useFlipTrade();
  const { playFlip } = useSound();
  const { isOnline } = useNetworkStatus();
  const [prevPnl, setPrevPnl] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const hasTriggeredConfettiRef = useRef(false);

  // Reset confetti ref when trade changes
  useEffect(() => {
    hasTriggeredConfettiRef.current = false;
  }, [currentTrade?.pairIndex, currentTrade?.tradeIndex]);

  // Check if trade is still confirming
  const isConfirming = confirmationStage !== 'none' && confirmationStage !== 'confirmed' && confirmationStage !== 'failed';
  
  // Activate pre-building when trade exists
  usePrebuiltCloseTx();
  usePrebuiltFlipTx();
  
  // Start PnL polling
  usePnL({ enabled: true, interval: 1000 });
  
  // Get real-time Pyth price for the current asset
  const assetPair = pnlData?.trade?.pair ?? currentTrade?.pair ?? (selection?.asset ? `${selection.asset.name}/USD` : null);
  const pythCurrentPrice = assetPair ? prices[assetPair]?.price ?? null : null;

  // Confetti when PnL first crosses 100%
  useEffect(() => {
    const pct = pnlData?.pnlPercentage ?? 0;
    if (pct >= 100 && !hasTriggeredConfettiRef.current && !isLiquidated) {
      hasTriggeredConfettiRef.current = true;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#CCFF00', '#FF006E'],
      });
    }
  }, [pnlData?.pnlPercentage, isLiquidated]);

  // Flash animation on PnL change
  useEffect(() => {
    const currentPnl = pnlData?.pnl ?? 0;
    if (prevPnl !== null && prevPnl !== currentPnl) {
      setTimeout(() => {
        setIsFlashing(true);
        setTimeout(() => {
          setIsFlashing(false);
          setPrevPnl(currentPnl);
        }, 300);
      }, 0);
    } else if (prevPnl === null) {
      setTimeout(() => {
        setPrevPnl(currentPnl);
      }, 0);
    }
  }, [pnlData?.pnl, prevPnl]);

  const handleFlip = async () => {
    if (!currentTrade) return;
    vibrateMedium();
    playFlip();
    try {
      await flipTrade(currentTrade);
    } catch (error) {
      console.error('Failed to flip trade:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to flip trade',
        'error',
        undefined,
        { label: 'RETRY', onClick: () => handleFlip() }
      );
    }
  };

  // Calculate display values
  // When liquidated, always show liquidation values (-85% or worse)
  let pnl: number;
  let pnlPercentage: number;
  
  if (isLiquidated) {
    // Use last known PnL percentage, or default to -85% if not available
    pnlPercentage = lastKnownPnLPercentage !== null && lastKnownPnLPercentage <= -85
      ? lastKnownPnLPercentage
      : -85;
    
    // Calculate PnL from percentage and collateral
    const collateral = currentTrade?.collateral ?? pnlData?.trade?.collateral ?? 0;
    pnl = (collateral * pnlPercentage) / 100;
  } else {
    // Use current PnL data
    pnl = pnlData?.pnl ?? 0;
    pnlPercentage = pnlData?.pnlPercentage ?? 0;
  }
  
  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  const glowClass = isProfit ? 'pnl-glow-green' : 'pnl-glow-red';

  // Calculate liquidation distance
  const liqDistance = currentTrade ? Math.abs(100 + pnlPercentage) : 100;
  const isNearLiq = liqDistance < 20;

  // Get prices from trade data
  const entryPrice = pnlData?.trade?.openPrice ?? currentTrade?.openPrice ?? null;
  const liquidationPrice = pnlData?.trade?.liquidationPrice ?? currentTrade?.liquidationPrice ?? null;
  const currentPrice = pythCurrentPrice ?? pnlData?.currentPrice ?? null;
  
  // Calculate liquidation price if not provided
  const calculatedLiquidationPrice = liquidationPrice !== null && liquidationPrice > 0
    ? liquidationPrice
    : entryPrice !== null && entryPrice > 0
    ? entryPrice * 0.15
    : null;
  
  // Calculate take profit price (200% gain)
  const takeProfitPrice = entryPrice && currentTrade 
    ? currentTrade.isLong 
      ? entryPrice * (1 + 2 / currentTrade.leverage) 
      : entryPrice * (1 - 2 / currentTrade.leverage)
    : null;
  
  // Derive display values from actual trade data
  const displayTrade = pnlData?.trade ?? currentTrade;
  const displayAsset = displayTrade ? ASSETS.find(a => a.pairIndex === displayTrade.pairIndex) : selection?.asset;
  const displayLeverage = displayTrade ? LEVERAGES.find(l => l.value === displayTrade.leverage) : selection?.leverage;
  const displayDirection = displayTrade ? DIRECTIONS.find(d => d.isLong === displayTrade.isLong) : selection?.direction;

  // Gamification message
  const gamificationMessage = getGamificationMessage(pnlPercentage, isConfirming, isNearLiq, liqDistance);

  return (
    <div 
      className="bg-black w-full safe-area-top safe-area-bottom flex flex-col"
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {/* 1. HERO: PnL Display - Top of screen, largest element */}
      <div 
        className={`flex flex-col items-center justify-center px-4 ${isFlashing ? 'animate-pnl-flash' : ''}`}
        style={{
          minHeight: '35vh',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
        }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {isLiquidated ? (
          <>
            {/* Liquidation message - HUGE */}
            <div 
              className="font-black leading-none font-mono text-[#FF006E] mb-4 animate-pulse"
              style={{ fontSize: 'clamp(2.5rem, 10vw, 4.5rem)' }}
            >
              LIQUIDATED
            </div>
            
            {/* Final PnL display */}
            <div
              className={`font-black ${glowClass} leading-none font-mono`}
              style={{ 
                color: '#FF006E', 
                letterSpacing: '-0.03em',
                fontSize: 'clamp(3rem, 12vw, 6rem)',
              }}
            >
              -${Math.abs(pnl).toFixed(2)}
            </div>
            
            {/* Final percentage */}
            <div
              className={`font-bold mt-2 ${glowClass} font-mono`}
              style={{ 
                color: '#FF006E',
                fontSize: 'clamp(1.5rem, 6vw, 2.5rem)',
              }}
            >
              {pnlPercentage.toFixed(2)}%
            </div>
            
            {/* Liquidation explanation */}
            <div 
              className="text-white/70 mt-4 font-semibold font-mono text-center px-4"
              style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}
            >
              Position closed at -85% loss
            </div>
            
            {/* Inline trade info */}
            {displayAsset && (
              <div 
                className="flex items-center gap-2 mt-4 text-white font-semibold font-mono"
                style={{ fontSize: 'clamp(1rem, 3vw, 1.125rem)' }}
              >
                <span className="flex items-center gap-1">
                  <span style={{ color: displayAsset.color }}>●</span>
                  <span>{displayAsset.name}</span>
                </span>
                {displayLeverage && (
                  <>
                    <span className="text-white/40">•</span>
                    <span>{displayLeverage.name}</span>
                  </>
                )}
                {displayDirection && (
                  <>
                    <span className="text-white/40">•</span>
                    <span style={{ color: displayDirection.color }}>{displayDirection.name}</span>
                  </>
                )}
              </div>
            )}
          </>
        ) : isConfirming ? (
          <>
            <div 
              className="font-black leading-none font-mono text-white/60 mb-4"
              style={{ fontSize: 'clamp(2.5rem, 10vw, 4.5rem)' }}
            >
              CONFIRMING...
            </div>
            <div 
              className="border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin"
              style={{ width: 'clamp(2rem, 6vw, 3rem)', height: 'clamp(2rem, 6vw, 3rem)' }}
            />
            {txHash && (
              <div 
                className="text-white/40 mt-4 font-mono"
                style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)' }}
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </div>
            )}
            {gamificationMessage && (
              <div 
                className="text-[#CCFF00] mt-4 font-bold font-mono"
                style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}
              >
                {gamificationMessage}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Gamification message - More prominent when near liquidation */}
            {gamificationMessage && (
              <div 
                className={`font-black font-mono mb-2 ${isNearLiq ? 'animate-pulse' : ''}`}
                style={{ 
                  color: isNearLiq ? '#FF006E' : '#CCFF00',
                  fontSize: isNearLiq 
                    ? 'clamp(1.25rem, 4vw, 1.75rem)' 
                    : 'clamp(1rem, 3vw, 1.25rem)',
                  textShadow: isNearLiq 
                    ? '0 0 10px rgba(255, 0, 110, 0.8), 0 0 20px rgba(255, 0, 110, 0.4)' 
                    : 'none',
                }}
              >
                {gamificationMessage}
              </div>
            )}
            
            {/* Main PnL - HUGE */}
            <div
              className={`font-black animate-pnl-pulse ${glowClass} leading-none font-mono`}
              style={{ 
                color, 
                letterSpacing: '-0.03em',
                fontSize: 'clamp(3rem, 12vw, 6rem)',
              }}
            >
              {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
            </div>
            
            {/* Percentage */}
            <div
              className={`font-bold mt-2 ${glowClass} font-mono`}
              style={{ 
                color,
                fontSize: 'clamp(1.5rem, 6vw, 2.5rem)',
              }}
            >
              {isProfit ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%
            </div>

            {/* Inline trade info - simplified, no fill colors */}
            <div 
              className="flex items-center gap-2 mt-4 text-white font-semibold font-mono"
              style={{ fontSize: 'clamp(1rem, 3vw, 1.125rem)' }}
            >
              {displayAsset && (
                <span className="flex items-center gap-1">
                  <span style={{ color: displayAsset.color }}>●</span>
                  <span>{displayAsset.name}</span>
                </span>
              )}
              {displayLeverage && (
                <>
                  <span className="text-white/40">•</span>
                  <span>{displayLeverage.name}</span>
                </>
              )}
              {displayDirection && (
                <>
                  <span className="text-white/40">•</span>
                  <span style={{ color: displayDirection.color }}>{displayDirection.name}</span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. Compact Info Row - Entry → Current */}
      <div 
        className="px-4 py-2"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        {/* Entry → Current price */}
        {(entryPrice != null || currentPrice != null) && (
          <div 
            className="flex items-center justify-center gap-3 font-mono text-white font-semibold"
            style={{ fontSize: 'clamp(1rem, 3vw, 1.125rem)' }}
          >
            <span>Entry:</span>
            <span className="text-white font-bold">
              ${entryPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
            </span>
            <span className="text-white/60">→</span>
            <span>Now:</span>
            <span className="font-bold" style={{ color }}>
              ${currentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
            </span>
          </div>
        )}
        
        {/* Progressive disclosure toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-white/70 font-semibold font-mono flex items-center gap-1 hover:text-white transition-colors touch-manipulation"
          style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', minHeight: '44px' }}
        >
          <span>{showDetails ? 'Hide' : 'Show'} details</span>
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{ 
              width: '1em', 
              height: '1em',
              transform: showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        
        {/* Progressive disclosure content */}
        {showDetails && (
          <div 
            className="flex flex-col items-center gap-1 text-white/80 font-semibold font-mono animate-fade-in"
            style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}
          >
            {takeProfitPrice && (
              <div>
                Max: ${takeProfitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} 
                <span className="text-[#CCFF00]/60"> (200% profit)</span>
              </div>
            )}
            {liquidationPrice && (
              <div>
                Liquidation: ${liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Chart Widget - Readable size */}
      <div 
        className="w-full overflow-hidden px-4 py-2 flex-1"
        style={{ 
          minHeight: '140px',
          maxHeight: '180px',
        }}
      >
        <PriceChart
          assetPair={assetPair}
          lineColor={isProfit ? '#CCFF00' : '#FF006E'}
          entryPrice={entryPrice}
          liquidationPrice={liquidationPrice}
          takeProfitPrice={takeProfitPrice}
          height={160}
          pnl={pnl}
          showLegend={false}
        />
      </div>

      {/* 5. Action Buttons - Stacked above nav bar */}
      <div 
        className="mt-auto px-4"
        style={{
          // Account for nav bar height (~70px) + safe area + padding
          paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Secondary actions: Close and Flip - Disabled when liquidated */}
        {!isLiquidated && (
          <div className="flex gap-3 mb-3">
            {/* Close button */}
            <button
              onClick={() => {
                vibrateMedium();
                onClose();
              }}
              disabled={isClosing || isFlipping || !isOnline}
              aria-label={isClosing ? 'Closing trade...' : 'Close and take profit/loss'}
              aria-busy={isClosing}
              className="brutal-button brutal-button-danger flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
              style={{
                minHeight: '48px',
                padding: '0.75rem 1rem',
                fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
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
                  style={{ width: '1.25rem', height: '1.25rem' }}
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
                  style={{ width: '1.25rem', height: '1.25rem' }}
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              )}
              <span className="font-black font-mono uppercase">CLOSE</span>
            </button>

            {/* Flip button */}
            <button
              onClick={handleFlip}
              disabled={isFlipping || isClosing || !isOnline}
              aria-label={isFlipping ? 'Flipping...' : `Flip to ${currentTrade?.isLong ? 'SHORT' : 'LONG'}`}
              aria-busy={isFlipping}
              className="brutal-button brutal-button-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
              style={{
                minHeight: '48px',
                padding: '0.75rem 1rem',
                fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
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
                  style={{ width: '1.25rem', height: '1.25rem' }}
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
                  style={{ width: '1.25rem', height: '1.25rem' }}
                >
                  <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
                </svg>
              )}
              <span className="font-black font-mono uppercase">FLIP</span>
            </button>
          </div>
        )}

        {/* Primary CTA: Roll Again - BIG */}
        <button
          onClick={onRollAgain}
          disabled={isClosing || isFlipping || !isOnline}
          aria-label="Start a new trade"
          className="w-full brutal-button font-black font-mono uppercase bg-[#CCFF00] text-black disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation flex items-center justify-center gap-3 focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
          style={{
            minHeight: '64px',
            padding: '1rem 1.5rem',
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
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
            style={{ width: '1.75rem', height: '1.75rem' }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" />
          </svg>
          <span>ROLL AGAIN</span>
        </button>
      </div>

      <span className="sr-only">
        {isProfit ? 'Profit' : 'Loss'} of {Math.abs(pnl).toFixed(2)} USDC, {Math.abs(pnlPercentage).toFixed(2)} percent
      </span>
    </div>
  );
}
