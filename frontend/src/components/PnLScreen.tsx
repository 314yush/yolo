'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useCountUp } from '@/hooks/useCountUp';
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
import { calculateTakeProfitMultiplier } from '@/lib/avantisEncoder';
import { computeClientPnL } from '@/lib/pnlFees';
import { ArrowUpDown, Dice5, Loader2 } from 'lucide-react';

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

// Format elapsed seconds into a human-readable timer string
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 10) return `${m}:${s.toString().padStart(2, '0')}m`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}m`;
}

export function PnLScreen({ onClose, onRollAgain, isClosing }: PnLScreenProps) {
  const { selection, pnlData, currentTrade, confirmationStage, txHash, isLiquidated, isTakeProfitHit, lastKnownPnLPercentage, showToast, settings } = useTradeStore();
  const { flipTrade, isFlipping } = useFlipTrade();
  const { playFlip } = useSound();
  const { isOnline } = useNetworkStatus();
  const [prevPnl, setPrevPnl] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const hasTriggeredConfettiRef = useRef(false);
  const hasTriggeredTPConfettiRef = useRef(false);
  const megaContainerRef = useRef<HTMLDivElement>(null);

  // Reset confetti refs when trade changes
  useEffect(() => {
    hasTriggeredConfettiRef.current = false;
    hasTriggeredTPConfettiRef.current = false;
  }, [currentTrade?.pairIndex, currentTrade?.tradeIndex]);

  // Warn before closing tab/window when flip is in progress (close is handled by page.tsx)
  useEffect(() => {
    if (!isFlipping) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFlipping]);

  // Elapsed timer — ticks every 100ms from trade.openedAt
  const displayTrade = pnlData?.trade ?? currentTrade;
  useEffect(() => {
    const openedAt = displayTrade?.openedAt;
    if (!openedAt) {
      queueMicrotask(() => setElapsedSeconds(0));
      return;
    }
    const openedAtMs = openedAt > 1e12 ? openedAt : openedAt * 1000;
    const tick = () => {
      setElapsedSeconds(Math.max(0, (Date.now() - openedAtMs) / 1000));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [displayTrade?.openedAt]);

  // Check if trade is still confirming
  const isConfirming = confirmationStage !== 'none' && confirmationStage !== 'confirmed' && confirmationStage !== 'failed';

  // Activate pre-building when trade exists
  usePrebuiltCloseTx();
  usePrebuiltFlipTx();

  // usePositionSync is mounted in page.tsx (has access to balance refetch + open trades).
  // usePnL runs as reconciliation + liquidation monitor at a slower interval.
  const pollInterval = currentTrade?.tradeIndex === 0 ? 1500 : 4000;
  usePnL({ enabled: true, interval: pollInterval });

  // Live mark from store (Avantis feed-v3 → Hermes fallback, via useLivePricesSync)
  const assetPair = pnlData?.trade?.pair ?? currentTrade?.pair ?? (selection?.asset ? `${selection.asset.name}/USD` : null);
  /** Granular subscription: re-render when this pair’s mark changes, not on every store field */
  const liveMarkPrice = useTradeStore(
    (s) => (assetPair ? s.prices[assetPair]?.price ?? null : null)
  );

  // Live oracle PnL (ZFP net) — same formula for placeholder and confirmed trades so the header
  // tracks the feed; Avantis poll still runs for liquidation / sync / activity.
  const tradeForLivePnL = currentTrade ?? pnlData?.trade;
  const canLiveOraclePnL =
    !isLiquidated &&
    !isTakeProfitHit &&
    !isConfirming &&
    !!tradeForLivePnL &&
    tradeForLivePnL.openPrice > 0 &&
    typeof liveMarkPrice === 'number' &&
    liveMarkPrice > 0;
  const clientPnL = canLiveOraclePnL
    ? computeClientPnL(
        tradeForLivePnL.collateral,
        tradeForLivePnL.leverage,
        tradeForLivePnL.isLong,
        tradeForLivePnL.openPrice,
        liveMarkPrice,
        true,
        0
      )
    : null;

  // Confetti when net PnL first crosses 100%
  const displayPnlPercentage = clientPnL?.pnlPercentage ?? pnlData?.pnlPercentage ?? 0;
  useEffect(() => {
    const pct = displayPnlPercentage;
    if (pct >= 100 && !hasTriggeredConfettiRef.current && !isLiquidated) {
      hasTriggeredConfettiRef.current = true;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#CCFF00', '#FF006E'],
      });
    }
  }, [displayPnlPercentage, isLiquidated]);

  // Extra confetti burst when take profit is hit
  useEffect(() => {
    if (isTakeProfitHit && !hasTriggeredTPConfettiRef.current) {
      hasTriggeredTPConfettiRef.current = true;
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#CCFF00', '#FF006E', '#FFFFFF'],
      });
    }
  }, [isTakeProfitHit]);

  // Flash animation on PnL change
  const displayPnl = clientPnL?.pnl ?? pnlData?.pnl ?? 0;
  useEffect(() => {
    const currentPnl = displayPnl;
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
  }, [displayPnl, prevPnl]);

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

  // Calculate display values - show NET PnL (what user keeps, after ZFP fees)
  let pnl: number;
  let pnlPercentage: number;

  if (isLiquidated) {
    // Liquidation = full loss: -100%
    pnlPercentage = -100;
    const collateral = currentTrade?.collateral ?? pnlData?.trade?.collateral ?? 0;
    pnl = -collateral;
  } else if (isTakeProfitHit) {
    pnl = pnlData?.pnl ?? 0;
    pnlPercentage = pnlData?.pnlPercentage ?? lastKnownPnLPercentage ?? 0;
  } else {
    // Use client-computed net PnL when placeholder, else Avantis net PnL
    pnl = clientPnL?.pnl ?? pnlData?.pnl ?? 0;
    pnlPercentage = clientPnL?.pnlPercentage ?? pnlData?.pnlPercentage ?? 0;
  }

  const isProfit = pnl >= 0;
  const color = isProfit ? '#CCFF00' : '#FF006E';
  const glowClass = isProfit ? 'pnl-glow-green' : 'pnl-glow-red';

  // Animated PnL counter on mount
  const animatedPnl = useCountUp({
    end: Math.abs(pnl),
    duration: 800,
    decimals: 2,
    prefix: pnl >= 0 ? '+$' : '-$',
    enabled: !isConfirming,
  });
  const animatedPct = useCountUp({
    end: Math.abs(pnlPercentage),
    duration: 800,
    decimals: 2,
    prefix: pnlPercentage >= 0 ? '+' : '-',
    enabled: !isConfirming,
  });

  // Big win scale effect for >100% PnL
  const [bigWinScale, setBigWinScale] = useState(false);

  useEffect(() => {
    if (Math.abs(pnlPercentage) >= 100 && isProfit && !isConfirming) {
      queueMicrotask(() => {
        setBigWinScale(true);
        setTimeout(() => setBigWinScale(false), 600);
      });
    }
  }, [pnlPercentage, isProfit, isConfirming]);

  // Calculate liquidation distance
  const liqDistance = currentTrade ? Math.abs(100 + pnlPercentage) : 100;
  const isNearLiq = liqDistance < 20;

  // Liq line: only after real position (placeholder trade has liquidationPrice: 0 until Avantis poll).
  const rawLiqPrice = pnlData?.trade?.liquidationPrice ?? currentTrade?.liquidationPrice ?? 0;
  const hasRealTradeData = rawLiqPrice > 0 || isLiquidated || isTakeProfitHit;
  const liquidationPrice = hasRealTradeData ? rawLiqPrice : null;

  // Entry line: use open price as soon as it exists (wheel placeholder + API). Do NOT gate on
  // hasRealTradeData — that waits for liquidation from Avantis (~15–20s), so the entry line was late or missing.
  const openForEntryLine = pnlData?.trade?.openPrice ?? currentTrade?.openPrice ?? null;
  const entryPrice =
    openForEntryLine != null && Number.isFinite(openForEntryLine) && openForEntryLine > 0
      ? openForEntryLine
      : null;
  const currentPrice = liveMarkPrice ?? pnlData?.currentPrice ?? null;

  // Target price: prefer tp from API when > 0, else compute from settings
  const takeProfitPercent = settings.takeProfitPercent ?? 200;
  const tradeForTarget = pnlData?.trade ?? currentTrade;
  const apiTp = tradeForTarget?.tp ?? 0;
  const targetPrice = entryPrice && tradeForTarget
    ? (apiTp > 0
        ? apiTp
        : entryPrice * calculateTakeProfitMultiplier(tradeForTarget.isLong, tradeForTarget.leverage, takeProfitPercent))
    : null;

  // Derive display values from actual trade data
  const displayAsset = displayTrade ? ASSETS.find(a => a.pairIndex === displayTrade.pairIndex) : selection?.asset;
  const displayLeverage = displayTrade ? LEVERAGES.find(l => l.value === displayTrade.leverage) : selection?.leverage;
  const displayDirection = displayTrade ? DIRECTIONS.find(d => d.isLong === displayTrade.isLong) : selection?.direction;

  // Gamification message
  const gamificationMessage = getGamificationMessage(pnlPercentage, isConfirming, isNearLiq, liqDistance);

  // Whether to show status badge + timer (hidden during special states)
  const showStatusRow = !isLiquidated && !isTakeProfitHit && !isConfirming;

  // Collateral for info bar
  const collateral = displayTrade?.collateral ?? 0;
  // Target PnL amount (net profit at TP)
  const targetPnlAmount = collateral > 0 ? (collateral * takeProfitPercent) / 100 : null;

  // Mega-container ambient glow class
  const megaGlowClass = isLiquidated ? 'pnl-negative' : isTakeProfitHit ? 'pnl-positive' : isProfit ? 'pnl-positive' : 'pnl-negative';

  const netForLiqWarn = clientPnL?.pnlPercentage ?? pnlData?.pnlPercentage ?? lastKnownPnLPercentage ?? 0;
  const grossForLiqWarn = pnlData?.grossPnlPercentage ?? netForLiqWarn;
  const worstPnlPctForLiqWarn = Math.min(netForLiqWarn, grossForLiqWarn);
  const showNearLiquidationBanner =
    !isLiquidated &&
    !isTakeProfitHit &&
    !isConfirming &&
    worstPnlPctForLiqWarn <= -80;

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
      {/* Trade info strip — sits ABOVE the mega-container */}
      <div
        className="flex w-full items-center justify-center px-4 text-center text-white/80 font-mono"
        style={{
          fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)',
          paddingBottom: '0.25rem',
        }}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
          {gamificationMessage && showStatusRow && (
            <>
              <span className="text-white/40">•</span>
              <span
                className={`font-bold ${isNearLiq ? 'animate-pulse' : ''}`}
                style={{
                  color: isNearLiq ? '#FF006E' : '#CCFF00',
                  textShadow: isNearLiq
                    ? '0 0 10px rgba(255, 0, 110, 0.8), 0 0 20px rgba(255, 0, 110, 0.4)'
                    : 'none',
                }}
              >
                {gamificationMessage}
              </span>
            </>
          )}
        </div>
      </div>

      {/* MEGA CONTAINER — merged hero + chart as one seamless unit */}
      <div
        ref={megaContainerRef}
        className={`mega-container ${megaGlowClass}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {/* Scanline CRT overlay */}
        <div className="scanline-overlay" />

        {/* Hero section — PnL numbers */}
        <div className={`relative z-[5] text-center pt-2 px-4 ${isFlashing ? 'animate-pnl-flash' : ''}`}>
          {/* Status row: badge (left) + timer (right) */}
          {showStatusRow && (
            <div className="flex items-center justify-between mb-2">
              <div
                className="status-badge font-mono"
                style={{ color }}
              >
                <span className="status-dot" />
                <span>{isProfit ? 'WINNING' : 'LOSING'}</span>
              </div>
              <div
                className="font-mono font-bold text-white/60"
                style={{ fontSize: '0.8rem' }}
              >
                ⏱ {formatElapsed(elapsedSeconds)}
              </div>
            </div>
          )}

          {showNearLiquidationBanner && (
            <div
              className="mb-3 mx-auto max-w-md border-4 border-[#FF006E] bg-[#FF006E]/10 px-3 py-2 font-mono text-center font-bold text-[#FF006E] brutal-card-losing"
              style={{ fontSize: 'clamp(0.7rem, 2.8vw, 0.85rem)', lineHeight: 1.35 }}
              role="alert"
            >
              Near liquidation — the protocol may close your position on-chain before the app updates. Closing
              manually may not cap your loss.
            </div>
          )}

          {isLiquidated ? (
            <>
              <div
                className="font-black leading-none font-mono text-[#FF006E] mb-2 animate-pulse"
                style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)' }}
              >
                LIQUIDATED
              </div>
              <div
                className={`font-black ${glowClass} leading-none font-mono`}
                style={{
                  color: '#FF006E',
                  letterSpacing: '-0.03em',
                  fontSize: 'clamp(2.5rem, 10vw, 4.5rem)',
                }}
              >
                -${Math.abs(pnl).toFixed(2)}
              </div>
              <div
                className={`font-bold mt-1 ${glowClass} font-mono`}
                style={{
                  color: '#FF006E',
                  fontSize: 'clamp(1.25rem, 5vw, 2rem)',
                }}
              >
                {pnlPercentage.toFixed(2)}%
              </div>
              <div
                className="text-white/70 mt-1 font-semibold font-mono text-center"
                style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}
              >
                Full collateral lost · liquidated on-chain
              </div>
            </>
          ) : isTakeProfitHit ? (
            <>
              <div
                className="font-black leading-none font-mono text-[#CCFF00] mb-2"
                style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)' }}
              >
                TAKE PROFIT!
              </div>
              <div
                className="font-black pnl-glow-green leading-none font-mono"
                style={{
                  color: '#CCFF00',
                  letterSpacing: '-0.03em',
                  fontSize: 'clamp(2.5rem, 10vw, 4.5rem)',
                }}
              >
                +${pnl.toFixed(2)}
              </div>
              <div
                className="font-bold mt-1 pnl-glow-green font-mono"
                style={{
                  color: '#CCFF00',
                  fontSize: 'clamp(1.25rem, 5vw, 2rem)',
                }}
              >
                +{pnlPercentage.toFixed(2)}%
              </div>
              <div
                className="text-white/70 mt-1 font-semibold font-mono text-center"
                style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}
              >
                Target reached · Position closed
              </div>
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
                className="border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto"
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
              {/* Main PnL — big dollar amount */}
              <div className={`transition-transform duration-300 ${bigWinScale ? 'scale-[1.2]' : 'scale-100'}`}>
                <div
                  className={`font-black animate-pnl-pulse ${glowClass} leading-none font-mono`}
                  style={{
                    color,
                    letterSpacing: '-0.03em',
                    fontSize: 'clamp(3rem, 12vw, 4.5rem)',
                  }}
                >
                  {animatedPnl}
                </div>
              </div>

              {/* Percentage */}
              <div
                className={`font-bold mt-1 ${glowClass} font-mono`}
                style={{
                  color,
                  fontSize: 'clamp(1.25rem, 5vw, 2rem)',
                }}
              >
                {animatedPct}%
              </div>

              {/* Compact price row: entry → current */}
              {(entryPrice != null && currentPrice != null) && (
                <div
                  className="flex items-center justify-center gap-2 font-mono text-white/70 mt-1"
                  style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}
                >
                  <span>${entryPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}</span>
                  <span className="text-white/40">→</span>
                  <span style={{ color }}>
                    ${currentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Chart section — fills remaining space, no padding, no border */}
        <div className="flex-1 w-full overflow-hidden" style={{ minHeight: '120px' }}>
          <PriceChart
            assetPair={assetPair}
            entryPrice={entryPrice}
            liquidationPrice={liquidationPrice}
            targetPrice={targetPrice}
            height={typeof window !== 'undefined' ? Math.max(160, window.innerHeight * 0.3) : 200}
            pnl={pnl}
          />
        </div>
      </div>

      {/* Info bar — Collateral / Target / Liq */}
      <div className="info-bar font-mono text-white/70">
        <div className="flex flex-col items-center">
          <span className="text-white/40" style={{ fontSize: '0.65rem' }}>Collateral</span>
          <span className="text-white font-bold" style={{ fontSize: '0.8rem' }}>
            ${collateral.toFixed(2)}
          </span>
        </div>
        {targetPnlAmount != null && (
          <div className="flex flex-col items-center">
            <span className="text-white/40" style={{ fontSize: '0.65rem' }}>Target</span>
            <span className="font-bold" style={{ fontSize: '0.8rem', color: '#CCFF00' }}>
              +${targetPnlAmount.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex flex-col items-center">
          <span className="text-white/40" style={{ fontSize: '0.65rem' }}>Liq</span>
          <span className="font-bold" style={{ fontSize: '0.8rem', color: '#FF006E' }}>
            -${collateral.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className="mt-auto px-4"
        style={{
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Secondary actions: Close and Flip - Hidden when liquidated or take profit hit */}
        {!isLiquidated && !isTakeProfitHit && (
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
              className={`flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black font-black font-mono uppercase ${
                isProfit
                  ? 'brutal-button bg-[#CCFF00] text-black'
                  : 'brutal-button brutal-button-danger'
              }`}
              style={{
                minHeight: '48px',
                padding: '0.75rem 1rem',
                fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                ...(isProfit ? { boxShadow: '0 0 20px rgba(204, 255, 0, 0.3)' } : {}),
              }}
            >
              {isClosing ? (
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} />
              ) : isProfit ? (
                <span>CASH OUT +${Math.abs(pnl).toFixed(2)}</span>
              ) : (
                <span>CLOSE -${Math.abs(pnl).toFixed(2)}</span>
              )}
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
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2} />
              ) : (
                <ArrowUpDown className="w-5 h-5" strokeWidth={2.5} />
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
          <Dice5 className="w-7 h-7" strokeWidth={2.5} />
          <span>ROLL AGAIN</span>
        </button>
      </div>

      <span className="sr-only">
        {isProfit ? 'Profit' : 'Loss'} of {Math.abs(pnl).toFixed(2)} USDC, {Math.abs(pnlPercentage).toFixed(2)} percent
      </span>

    </div>
  );
}
