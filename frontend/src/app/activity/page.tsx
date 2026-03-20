'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { useSound } from '@/hooks/useSound';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { vibrateMedium } from '@/lib/haptics';
import { TradeCard } from '@/components/TradeCard';
import { ShareCardModal } from '@/components/ShareCardModal';
import { ToastContainer } from '@/components/Toast';
import { AvantisFooter } from '@/components/AvantisFooter';
import { StatsPanel } from '@/components/StatsPanel';
import { saveClosedTrade, loadClosedTrades } from '@/lib/closedTrades';
import { logTradeCloseByPosition, logTradeOpen, getActivityStats, getActivityTrades, type ActivityTrade } from '@/lib/activityApi';
import { buildCloseTradeTx as buildCloseTradeTxDirect, buildOpenTradeTx as buildOpenTradeTxDirect, calculateTakeProfitMultiplier } from '@/lib/avantisEncoder';
import { ASSETS } from '@/lib/constants';
import type { Trade, PnLData, ClosedTrade } from '@/types';

/** Map Activity API trade to ClosedTrade for TradeCard. */
function activityTradeToClosedTrade(at: ActivityTrade): ClosedTrade {
  const pairIndex = at.pair_index ?? ASSETS.find((a) => at.pair.includes(a.name))?.pairIndex ?? 0;
  const collateral = Math.max(Number(at.collateral) || 1, 1e-10); // Avoid div by zero
  const pnlRaw = at.pnl;
  const pnl = Number.isFinite(Number(pnlRaw)) ? Number(pnlRaw) : 0;
  const closedAtMs = at.closed_at ? new Date(at.closed_at).getTime() : 0;
  const openedAtSec = at.opened_at ? Math.floor(new Date(at.opened_at).getTime() / 1000) : 0;
  const finalPnLPercentage = Number.isFinite(pnl / collateral) ? (pnl / collateral) * 100 : 0;
  return {
    tradeIndex: at.trade_index ?? 0,
    pairIndex,
    pair: at.pair,
    collateral,
    leverage: at.leverage,
    isLong: at.direction === 'LONG',
    openPrice: at.entry_price,
    tp: at.tp_price ?? 0,
    sl: 0,
    liquidationPrice: at.liq_price ?? 0,
    openedAt: openedAtSec,
    closedAt: closedAtMs,
    finalPnL: pnl,
    finalPnLPercentage,
    closePrice: at.exit_price ?? at.entry_price,
    txHash: at.tx_hash_open as `0x${string}` | undefined,
    closeTxHash: at.tx_hash_close as `0x${string}` | undefined,
    isLiquidated: at.status === 'liquidated',
  };
}

export default function ActivityPage() {
  const router = useRouter();
  const { userAddress, delegateStatus, updateActivePositions, pendingTradeHashes, removePendingTradeHash, addPendingOpenTxHash, popPendingOpenTxHash, incrementTotalTrades, incrementVolume, toasts, removeToast, tradeStats, setTradeStats, showToast, setIsIntentionalClose, lastClosedTradeForShare, setLastClosedTradeForShare } = useTradeStore();
  const { delegateAddress } = useDelegateWallet();
  const { getTrades, getPnL, getClosedTrades, getTotalVolume } = useAvantisAPI();
  const { signAndWait, signAndBroadcast } = useTxSigner();
  const { playWin, playLose, playFlip } = useSound();
  const { isOnline } = useNetworkStatus();
  const { prices } = useTradeStore();  // Real-time Pyth prices
  
  const [tradesWithPnL, setTradesWithPnL] = useState<Array<{ trade: Trade; pnlData?: PnLData }>>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [showClosedTrades, setShowClosedTrades] = useState(false);
  const [flippingTradeIndex, setFlippingTradeIndex] = useState<number | null>(null);
  const [closingTradeIndex, setClosingTradeIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isLoadingTrades, setIsLoadingTrades] = useState(true);
  const [displayedClosedTradesCount, setDisplayedClosedTradesCount] = useState(12); // Default to 12 trades
  const [historicVolume, setHistoricVolume] = useState<number | null>(null);
  const [activityStats, setActivityStats] = useState<{ total_trades: number; total_volume: number; total_pnl: number; win_rate: number; open_trades: number } | null>(null);
  const [activityApiError, setActivityApiError] = useState<string | null>(null);
  const [shareTrade, setShareTrade] = useState<ClosedTrade | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Prevent hydration mismatch by only rendering stats after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Open share modal when arriving from home after closing a trade (SHARE button on toast)
  useEffect(() => {
    if (lastClosedTradeForShare) {
      setShareTrade(lastClosedTradeForShare);
      setLastClosedTradeForShare(null);
      setShowClosedTrades(true); // Switch to CLOSED tab for context
      // Prepend trade to list if not already present (handles async load race)
      setClosedTrades((prev) => {
        const exists = prev.some(
          (t) => t.pairIndex === lastClosedTradeForShare.pairIndex && t.tradeIndex === lastClosedTradeForShare.tradeIndex
        );
        if (exists) return prev;
        return [lastClosedTradeForShare, ...prev];
      });
    }
  }, [lastClosedTradeForShare, setLastClosedTradeForShare]);

  // Scroll to top when share modal opens so card is in view
  useEffect(() => {
    if (shareTrade && mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [shareTrade]);

  // Reset loading when user logs out
  useEffect(() => {
    if (!userAddress) {
      setIsLoadingTrades(false);
      setHistoricVolume(null);
      setActivityStats(null);
      setActivityApiError(null);
    }
  }, [userAddress]);

  // Warn before closing tab/window when close or flip is in progress
  useEffect(() => {
    const shouldWarn = flippingTradeIndex !== null || closingTradeIndex !== null;
    if (!shouldWarn) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flippingTradeIndex, closingTradeIndex]);

  const [activityApiRetryTrigger, setActivityApiRetryTrigger] = useState(0);

  // Fetch stats from Activity API (primary), fallback to Avantis volume
  useEffect(() => {
    if (!userAddress) return;

    const loadStats = async () => {
      setActivityApiError(null);
      const [stats, vol] = await Promise.all([
        getActivityStats(userAddress),
        getTotalVolume(userAddress).catch((error) => {
          console.error('[ActivityPage] Failed to fetch historic volume:', error);
          return null;
        }),
      ]);
      if (stats) {
        setActivityStats(stats);
      } else {
        setActivityApiError('Activity data temporarily unavailable. Check your connection.');
      }
      if (vol !== null) setHistoricVolume(vol);
    };

    loadStats();
  }, [userAddress, getTotalVolume, activityApiRetryTrigger]);

  // Retry Activity API on visibility change (e.g. tab focused)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && userAddress) {
        setActivityApiRetryTrigger((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userAddress]);


  // Volume = sum of position sizes (collateral * leverage) for open + closed trades
  // Used as fallback when API stats are missing or stale
  const computedVolume = React.useMemo(() => {
    const openVol = tradesWithPnL.reduce((sum, item) => sum + item.trade.collateral * item.trade.leverage, 0);
    const closedVol = closedTrades.reduce((sum, t) => sum + t.collateral * t.leverage, 0);
    return openVol + closedVol;
  }, [tradesWithPnL, closedTrades]);

  // Default to OPEN tab when trades exist (only on initial load)
  useEffect(() => {
    if (!hasInitialized && tradesWithPnL.length > 0) {
      setShowClosedTrades(false);
      setHasInitialized(true);
    } else if (!hasInitialized && tradesWithPnL.length === 0 && closedTrades.length > 0) {
      // If no open trades but have closed trades, show closed
      setShowClosedTrades(true);
      setHasInitialized(true);
    } else if (!hasInitialized && tradesWithPnL.length === 0 && closedTrades.length === 0) {
      setHasInitialized(true);
    }
  }, [tradesWithPnL.length, closedTrades.length, hasInitialized]);

  // Load closed trades: Activity API primary, merge localStorage + Avantis for legacy/fallback
  useEffect(() => {
    if (!userAddress) return;

    const loadAllClosedTrades = async () => {
      const mergedMap = new Map<string, ClosedTrade>();

      // Fetch all sources in parallel: Activity API, Avantis API, localStorage
      const localClosed = loadClosedTrades(userAddress);
      const [activityRes, apiClosed] = await Promise.all([
        getActivityTrades(userAddress, 50, 0),
        getClosedTrades(userAddress, 1).catch((error) => {
          console.error('[ActivityPage] Failed to fetch closed trades from Avantis:', error);
          return [] as ClosedTrade[];
        }),
      ]);

      if (!activityRes) {
        setActivityApiError('Activity data temporarily unavailable. Check your connection.');
      } else {
        setActivityApiError(null);
      }
      const activityClosed = activityRes?.trades
        ?.filter((t) => t.status === 'closed' || t.status === 'liquidated')
        .map(activityTradeToClosedTrade) ?? [];
      activityClosed.forEach((trade) => {
        const key = `${trade.pairIndex}-${trade.tradeIndex}`;
        mergedMap.set(key, trade);
      });
      apiClosed.forEach((trade) => {
        const key = `${trade.pairIndex}-${trade.tradeIndex}`;
        if (!mergedMap.has(key)) mergedMap.set(key, trade);
      });
      localClosed.forEach((trade) => {
        const key = `${trade.pairIndex}-${trade.tradeIndex}`;
        const existing = mergedMap.get(key);
        if (!existing) mergedMap.set(key, trade);
        else {
          // Enrich existing with tx hashes from localStorage (saved when user closed from our app)
          const updates: Partial<ClosedTrade> = {};
          if (trade.isTakeProfitHit && !existing.isTakeProfitHit) updates.isTakeProfitHit = true;
          if (trade.closeTxHash && !existing.closeTxHash) updates.closeTxHash = trade.closeTxHash;
          if (trade.txHash && !existing.txHash) updates.txHash = trade.txHash;
          if (Object.keys(updates).length > 0) {
            mergedMap.set(key, { ...existing, ...updates });
          }
        }
      });

      const merged = Array.from(mergedMap.values()).map((t) => ({
        ...t,
        finalPnL: Number.isFinite(Number(t.finalPnL)) ? Number(t.finalPnL) : 0,
        finalPnLPercentage: Number.isFinite(Number(t.finalPnLPercentage)) ? Number(t.finalPnLPercentage) : 0,
      })).sort((a, b) => {
        const aTime = (a.closedAt && a.closedAt > 0) ? a.closedAt : (a.openedAt && a.openedAt > 0 ? a.openedAt * 1000 : 0);
        const bTime = (b.closedAt && b.closedAt > 0) ? b.closedAt : (b.openedAt && b.openedAt > 0 ? b.openedAt * 1000 : 0);
        return bTime - aTime;
      });
      setClosedTrades(merged);
    };

    loadAllClosedTrades();
  }, [userAddress, getClosedTrades, activityApiRetryTrigger]);

  // Note: Volume is incremented when trades are opened, not recalculated here
  // Volume = cumulative sum of position sizes (collateral * leverage) for all opened trades

  // Load trades with PnL - adaptive polling (faster when pending trades exist)
  useEffect(() => {
    if (!userAddress) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    let hasLoadedOnce = false;
    const loadTrades = async () => {
      if (!isMounted || !userAddress) return;

      if (!hasLoadedOnce) {
        setIsLoadingTrades(true);
      }
      try {
        // Fetch PnL which includes trades
        const positions = await getPnL(userAddress);

        if (!isMounted) return;

        hasLoadedOnce = true;
        // PnL response includes trades, so we can use it directly
        const combined = positions.map((pos) => ({
          trade: pos.trade,
          pnlData: pos,
        }));

        setTradesWithPnL(combined);
        updateActivePositions(positions.length);
        setIsLoadingTrades(false);
        
        // If we have pending trades and found new trades, clear pending hashes
        if (pendingTradeHashes.size > 0 && positions.length > 0) {
          pendingTradeHashes.forEach(hash => removePendingTradeHash(hash));
        }
      } catch (error) {
        console.error('[TradesPage] Failed to load trades:', error);
        setIsLoadingTrades(false);
        // Don't stop polling on error - keep trying
      }
    };

    // Adaptive polling: faster (500ms) if pending trades, slower (2s) otherwise
    const hasPending = pendingTradeHashes.size > 0;
    const interval = hasPending ? 500 : 2000;
    
    // Load immediately
    loadTrades();
    
    // Start polling with adaptive interval
    intervalId = setInterval(() => {
      if (isMounted) {
        loadTrades();
      }
    }, interval);

    // Handle page visibility - refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && isMounted) {
        loadTrades();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, pendingTradeHashes.size]); // Restart polling when pending count changes

  const handleFlip = async (trade: Trade) => {
    // CRITICAL: Prevent trading if setup is not complete
    if (!delegateStatus.isSetup) {
      showToast('Please complete setup before trading. Enable trading in the setup flow first.', 'error');
      return;
    }

    if (!userAddress || !delegateAddress) return;

    // Find the trade in the current list to ensure we have the correct data
    const tradeWithPnL = tradesWithPnL.find((t) => 
      t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
    );
    
    if (!tradeWithPnL) {
      showToast('Trade not found. Please refresh and try again.', 'error');
      return;
    }

    // Use the verified trade data to ensure consistency
    const verifiedTrade = tradeWithPnL.trade;
    const tradeIndex = tradesWithPnL.findIndex((t) => 
      t.trade.pairIndex === verifiedTrade.pairIndex && t.trade.tradeIndex === verifiedTrade.tradeIndex
    );
    setFlippingTradeIndex(tradeIndex);
    setIsIntentionalClose(true);
    vibrateMedium();
    playFlip();

    try {
      // Get final PnL before closing
      const positions = await getPnL(userAddress);
      const pnlMap = new Map<string, PnLData>();
      positions.forEach((pos) => {
        const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
        pnlMap.set(key, pos);
      });
      const tradeKey = `${verifiedTrade.pairIndex}-${verifiedTrade.tradeIndex}`;
      const finalPnL = pnlMap.get(tradeKey) || null;

      // Validate minimum position size before opening new trade
      // Avantis requires minimum position size of $100
      const MIN_POSITION_SIZE_USD = 100;
      const positionSize = verifiedTrade.collateral * verifiedTrade.leverage;
      if (positionSize < MIN_POSITION_SIZE_USD) {
        const minCollateral = MIN_POSITION_SIZE_USD / verifiedTrade.leverage;
        throw new Error(
          `Cannot flip trade: Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE_USD.toFixed(2)}. ` +
          `With ${verifiedTrade.leverage}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC. ` +
          `Current collateral: $${verifiedTrade.collateral.toFixed(2)} USDC`
        );
      }

      // Build close transaction
      const closeTx = buildCloseTradeTxDirect({
        trader: userAddress,
        pairIndex: verifiedTrade.pairIndex,
        tradeIndex: verifiedTrade.tradeIndex,
        collateralToClose: verifiedTrade.collateral,
      });

      // Close position first
      const { hash: closeTxHash } = await signAndWait(closeTx);

      // Save closed trade (capture path for share card; may be empty for activity-page closes)
      if (userAddress) {
        saveClosedTrade(userAddress, verifiedTrade, finalPnL, { closeTxHash });
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: verifiedTrade.pairIndex,
          tradeIndex: verifiedTrade.tradeIndex,
          exitPrice: finalPnL?.currentPrice,
          pnl: finalPnL?.grossPnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });
        // Optimistically add to closed trades list (remove open trade from open list happens in refresh)
        const newClosed: ClosedTrade = {
          ...verifiedTrade,
          closedAt: Date.now(),
        finalPnL: finalPnL?.grossPnl ?? 0,
        finalPnLPercentage: finalPnL?.grossPnlPercentage ?? 0,
          closePrice: finalPnL?.currentPrice ?? verifiedTrade.openPrice,
          closeTxHash: closeTxHash as `0x${string}`,
          isLiquidated: false,
        };
        setClosedTrades((prev) => [newClosed, ...prev.filter((t) => t.pairIndex !== verifiedTrade.pairIndex || t.tradeIndex !== verifiedTrade.tradeIndex)]);
      }

      // Wait a moment for the close to settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Rebuild open transaction with fresh price data after closing
      const currentPrice = prices[verifiedTrade.pair]?.price;
      if (!currentPrice) {
        throw new Error(`No price available for ${verifiedTrade.pair}. Wait for Pyth connection.`);
      }

      // Build open transaction with fresh price
      const openTx = buildOpenTradeTxDirect({
        trader: userAddress,
        pairIndex: verifiedTrade.pairIndex,
        collateral: verifiedTrade.collateral, // Use same collateral amount
        leverage: verifiedTrade.leverage,
        isLong: !verifiedTrade.isLong, // Flip direction
        openPrice: currentPrice, // Use current price
        takeProfitMultiplier: calculateTakeProfitMultiplier(
          !verifiedTrade.isLong,
          verifiedTrade.leverage,
          useTradeStore.getState().settings.takeProfitPercent
        ),
      });

      // Open opposite position
      const openHash = await signAndBroadcast(openTx);
      addPendingOpenTxHash(openHash);

      // Refresh trades and stats after a delay
      setTimeout(() => {
        if (!userAddress) return;
        const refresh = async () => {
          try {
            const [trades, positions, stats] = await Promise.all([
              getTrades(userAddress),
              getPnL(userAddress),
              getActivityStats(userAddress),
            ]);
            const pnlMap = new Map<string, PnLData>();
            positions.forEach((pos) => {
              const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
              pnlMap.set(key, pos);
            });
            const combined = trades.map((trade) => {
              const key = `${trade.pairIndex}-${trade.tradeIndex}`;
              return { trade, pnlData: pnlMap.get(key) };
            });
            setTradesWithPnL(combined);
            updateActivePositions(trades.length);
            if (stats) setActivityStats(stats);

            // Log new trade to activity API (useOpenTrades doesn't run on /activity)
            const newTrade = combined.find((c) => c.trade.pairIndex === verifiedTrade.pairIndex);
            if (newTrade) {
              const txHash = popPendingOpenTxHash();
              if (txHash) {
                logTradeOpen({
                  wallet: userAddress,
                  pair: newTrade.trade.pair,
                  pairIndex: newTrade.trade.pairIndex,
                  tradeIndex: newTrade.trade.tradeIndex,
                  direction: newTrade.trade.isLong ? 'LONG' : 'SHORT',
                  leverage: newTrade.trade.leverage,
                  collateral: newTrade.trade.collateral,
                  entryPrice: newTrade.trade.openPrice,
                  tpPrice: newTrade.trade.tp,
                  liqPrice: newTrade.trade.liquidationPrice ?? undefined,
                  txHash,
                });
                incrementTotalTrades();
                incrementVolume(newTrade.trade.collateral, newTrade.trade.leverage);
              }
            }
          } catch (error) {
            console.error('Failed to refresh trades:', error);
          }
        };
        refresh();
      }, 2000);
    } catch (error) {
      console.error('Flip trade error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to flip trade',
        'error',
        undefined,
        { label: 'RETRY', onClick: () => handleFlip(trade) }
      );
    } finally {
      setFlippingTradeIndex(null);
      setIsIntentionalClose(false);
    }
  };

  const handleClose = async (trade: Trade) => {
    // CRITICAL: Prevent closing trades if setup is not complete (defensive check)
    if (!delegateStatus.isSetup) {
      showToast('Please complete setup before closing trades. Enable trading in the setup flow first.', 'error');
      return;
    }

    if (!userAddress || !delegateAddress) return;

    const tradeIndex = tradesWithPnL.findIndex((t) => 
      t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
    );
    setClosingTradeIndex(tradeIndex);
    setIsIntentionalClose(true);
    vibrateMedium();

    try {
      // Get final PnL before closing
      const positions = await getPnL(userAddress);
      const pnlMap = new Map<string, PnLData>();
      positions.forEach((pos) => {
        const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
        pnlMap.set(key, pos);
      });
      const tradeKey = `${trade.pairIndex}-${trade.tradeIndex}`;
      const finalPnL = pnlMap.get(tradeKey) || null;

      // Build close tx with direct encoding
      const closeTx = buildCloseTradeTxDirect({
        trader: userAddress,
        pairIndex: trade.pairIndex,
        tradeIndex: trade.tradeIndex,
        collateralToClose: trade.collateral,
      });

      const { hash: closeTxHash } = await signAndWait(closeTx);

      const pnlPct = finalPnL?.grossPnlPercentage ?? 0;
      if (pnlPct >= 0) {
        playWin();
      } else {
        playLose();
      }

      // Save closed trade (capture path for share card; may be empty for activity-page closes)
      if (userAddress) {
        saveClosedTrade(userAddress, trade, finalPnL, { closeTxHash });
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: trade.pairIndex,
          tradeIndex: trade.tradeIndex,
          exitPrice: finalPnL?.currentPrice,
          pnl: finalPnL?.grossPnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });
        // Optimistically add to closed trades list
        const newClosed: ClosedTrade = {
          ...trade,
          closedAt: Date.now(),
        finalPnL: finalPnL?.grossPnl ?? 0,
        finalPnLPercentage: finalPnL?.grossPnlPercentage ?? 0,
          closePrice: finalPnL?.currentPrice ?? trade.openPrice,
          closeTxHash: closeTxHash as `0x${string}`,
          isLiquidated: false,
        };
        setClosedTrades((prev) => [newClosed, ...prev.filter((t) => t.pairIndex !== trade.pairIndex || t.tradeIndex !== trade.tradeIndex)]);
      }

      // Show success toast with PnL
      const pnl = finalPnL?.grossPnl ?? 0;
      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      const closedForShare: ClosedTrade = {
        ...trade,
        closedAt: Date.now(),
        finalPnL: finalPnL?.grossPnl ?? 0,
        finalPnLPercentage: finalPnL?.grossPnlPercentage ?? 0,
        closePrice: finalPnL?.currentPrice ?? trade.openPrice,
        closeTxHash: closeTxHash as `0x${string}`,
        isLiquidated: false,
      };
      showToast(`Closed! PnL: ${pnlStr}`, 'success', undefined, {
        label: 'SHARE',
        onClick: () => {
          setShowClosedTrades(true);
          setShareTrade(closedForShare);
        },
      });

      // Refresh trades and stats after a delay
      setTimeout(() => {
        if (!userAddress) return;
        const refresh = async () => {
          try {
            const [trades, positions, stats] = await Promise.all([
              getTrades(userAddress),
              getPnL(userAddress),
              getActivityStats(userAddress),
            ]);
            const pnlMap = new Map<string, PnLData>();
            positions.forEach((pos) => {
              const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
              pnlMap.set(key, pos);
            });
            const combined = trades.map((trade) => {
              const key = `${trade.pairIndex}-${trade.tradeIndex}`;
              return { trade, pnlData: pnlMap.get(key) };
            });
            setTradesWithPnL(combined);
            updateActivePositions(trades.length);
            if (stats) setActivityStats(stats);
          } catch (error) {
            console.error('Failed to refresh trades:', error);
          }
        };
        refresh();
      }, 1000);
    } catch (error) {
      console.error('Close trade error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to close trade',
        'error',
        undefined,
        { label: 'RETRY', onClick: () => handleClose(trade) }
      );
    } finally {
      setClosingTradeIndex(null);
      setIsIntentionalClose(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-lg mx-auto w-full">
      {/* Header - Improved layout */}
      <header className="w-full mb-4 sm:mb-6">
        {activityApiError && (
          <div className="mb-4 p-3 border-4 border-[#FF006E] bg-[#FF006E]/10 flex items-center justify-between gap-3">
            <p className="text-sm text-white/90">{activityApiError}</p>
            <button
              onClick={() => {
                setActivityApiError(null);
                setActivityApiRetryTrigger((t) => t + 1);
              }}
              className="shrink-0 px-3 py-1.5 text-xs font-bold border-2 border-[#FF006E] bg-black text-[#FF006E] hover:bg-[#FF006E] hover:text-black transition-colors"
            >
              RETRY
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              if ((flippingTradeIndex !== null || closingTradeIndex !== null) && !window.confirm('A trade action is in progress. Leave this page anyway?')) {
                return;
              }
              router.back();
            }}
            className="text-[#CCFF00] text-sm sm:text-base font-bold touch-manipulation min-h-[44px] flex items-center px-3 sm:px-4 py-2 border-4 border-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            style={{ boxShadow: '4px 4px 0px 0px rgba(204, 255, 0, 0.5)' }}
            aria-label="Go back"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="whitespace-nowrap">BACK</span>
          </button>
          <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-black uppercase tracking-tight">Activity</h1>
          <div className="w-16 sm:w-20" />
        </div>

        <StatsPanel
          tradesWithPnL={tradesWithPnL}
          closedTradesCount={closedTrades.length}
          showClosedTrades={showClosedTrades}
          onToggle={setShowClosedTrades}
          mounted={mounted}
          activityStats={activityStats}
          tradeStats={tradeStats}
          historicVolume={historicVolume}
          computedVolume={computedVolume}
        />
      </header>

      {/* Trades List */}
      <main ref={mainRef} className="flex-1 overflow-y-auto min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6">
        {showClosedTrades ? (
          // Show closed trades
          closedTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="mb-6">
                <svg
                  className="w-16 h-16 mx-auto text-white/20 mb-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6M9 15h6" />
                </svg>
              </div>
              <div className="text-white/50 text-lg sm:text-xl font-bold mb-2">No Closed Trades</div>
              <div className="text-white/30 text-sm sm:text-base mb-6 max-w-xs">
                Your closed trades will appear here
              </div>
              <button
                onClick={() => setShowClosedTrades(false)}
                className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
                aria-label="View open trades"
              >
                VIEW OPEN TRADES
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-6">
              {closedTrades.slice(0, displayedClosedTradesCount).map((closedTrade) => (
                <TradeCard
                  key={`closed-${closedTrade.pairIndex}-${closedTrade.tradeIndex}`}
                  trade={closedTrade}
                  pnlData={{
                    trade: closedTrade,
                    currentPrice: closedTrade.closePrice,
                    pnl: closedTrade.finalPnL,
                    pnlPercentage: closedTrade.finalPnLPercentage,
                    grossPnl: closedTrade.finalPnL,
                    grossPnlPercentage: closedTrade.finalPnLPercentage,
                  }}
                  onFlip={() => {}}
                  onClose={() => {}}
                  onShare={() => setShareTrade(closedTrade)}
                  isFlipping={false}
                  isClosing={false}
                  isClosed={true}
                />
              ))}
              {closedTrades.length > displayedClosedTradesCount && (
                <button
                  onClick={() => setDisplayedClosedTradesCount(prev => Math.min(prev + 10, closedTrades.length))}
                  className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
                  aria-label="Load more closed trades"
                >
                  LOAD MORE ({closedTrades.length - displayedClosedTradesCount} remaining)
                </button>
              )}
            </div>
          )
        ) : (
          // Show open trades
          isLoadingTrades ? (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="brutal-card p-3 sm:p-4 min-w-0 border-4 border-white/20"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="chart-loading-skeleton h-4 w-16 rounded" />
                    <div className="chart-loading-skeleton h-4 w-12 rounded" />
                  </div>
                  <div className="chart-loading-skeleton h-10 w-24 mb-3 rounded" />
                  <div className="chart-loading-skeleton h-4 w-full mb-2 rounded" />
                  <div className="chart-loading-skeleton h-4 w-3/4 rounded" />
                </div>
              ))}
            </div>
          ) : tradesWithPnL.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="mb-6">
                <svg
                  className="w-16 h-16 mx-auto text-[#CCFF00]/30 mb-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div className="text-white/50 text-lg sm:text-xl font-bold mb-2">No Open Trades</div>
              <div className="text-white/30 text-sm sm:text-base mb-6 max-w-xs">
                Spin the wheel to start your first trade
              </div>
              <button
                onClick={() => {
                  if ((flippingTradeIndex !== null || closingTradeIndex !== null) && !window.confirm('A trade action is in progress. Leave this page anyway?')) {
                    return;
                  }
                  router.push('/');
                }}
                disabled={!isOnline}
                className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={isOnline ? 'Go to main page to roll' : 'You are offline. Reconnect to trade'}
              >
                ROLL NOW
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-6">
              {tradesWithPnL.map((item, index) => (
                <TradeCard
                  key={`${item.trade.pairIndex}-${item.trade.tradeIndex}`}
                  trade={item.trade}
                  pnlData={item.pnlData}
                  onFlip={handleFlip}
                  onClose={handleClose}
                  isFlipping={flippingTradeIndex === index}
                  isClosing={closingTradeIndex === index}
                  actionsDisabled={!isOnline}
                />
              ))}
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <AvantisFooter />

      {/* Share Card Modal */}
      {shareTrade && (
        <ShareCardModal
          trade={shareTrade}
          onClose={() => setShareTrade(null)}
          onCopy={() => showToast('Copied to clipboard', 'success')}
          onDownload={() => showToast('Downloaded', 'success')}
          onShare={() => showToast('Shared!', 'success')}
          onShareOnX={() => showToast('Opened X — paste image (Ctrl+V) to add it', 'success')}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
