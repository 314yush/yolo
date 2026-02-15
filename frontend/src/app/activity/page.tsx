'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeStore } from '@/store/tradeStore';
import { usePrivyEmbeddedWallet } from '@/hooks/usePrivyEmbeddedWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { useSound } from '@/hooks/useSound';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { vibrateMedium } from '@/lib/haptics';
import { TradeCard } from '@/components/TradeCard';
import { ToastContainer } from '@/components/Toast';
import { AvantisFooter } from '@/components/AvantisFooter';
import { saveClosedTrade, loadClosedTrades } from '@/lib/closedTrades';
import { buildCloseTradeTx as buildCloseTradeTxDirect, buildOpenTradeTx as buildOpenTradeTxDirect, calculate200PercentGainMultiplier } from '@/lib/avantisEncoder';
import type { Trade, PnLData, ClosedTrade } from '@/types';

export default function ActivityPage() {
  const router = useRouter();
  const { userAddress, delegateStatus, updateActivePositions, pendingTradeHashes, removePendingTradeHash, toasts, removeToast, tradeStats, setTradeStats, showToast, setIsIntentionalClose } = useTradeStore();
  const { address: embeddedAddress } = usePrivyEmbeddedWallet();
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

  // Prevent hydration mismatch by only rendering stats after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset loading when user logs out
  useEffect(() => {
    if (!userAddress) {
      setIsLoadingTrades(false);
      setHistoricVolume(null);
    }
  }, [userAddress]);

  // Fetch historic volume from Avantis (all open + closed positions)
  useEffect(() => {
    if (!userAddress) return;

    const loadVolume = async () => {
      try {
        const vol = await getTotalVolume(userAddress);
        setHistoricVolume(vol);
      } catch (error) {
        console.error('[ActivityPage] Failed to fetch historic volume:', error);
      }
    };

    loadVolume();
  }, [userAddress, getTotalVolume]);

  // Calculate aggregate stats
  const aggregateStats = React.useMemo(() => {
    const totalPnL = tradesWithPnL.reduce((sum, item) => sum + (item.pnlData?.pnl ?? 0), 0);
    const totalCollateral = tradesWithPnL.reduce((sum, item) => sum + item.trade.collateral, 0);
    return { totalPnL, totalCollateral };
  }, [tradesWithPnL]);

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

  // Load and merge closed trades from localStorage and Avantis API
  useEffect(() => {
    if (!userAddress) return;
    
    const loadAllClosedTrades = async () => {
      // Load from localStorage
      const localClosed = loadClosedTrades(userAddress);
      
      // Fetch from Avantis API (first page only for now)
      let apiClosed: ClosedTrade[] = [];
      try {
        apiClosed = await getClosedTrades(userAddress, 1);
      } catch (error) {
        console.error('[ActivityPage] Failed to fetch closed trades from API:', error);
      }
      
      // Merge: combine both sources, deduplicate by pairIndex + tradeIndex
      const mergedMap = new Map<string, ClosedTrade>();
      
      // Add API trades first (they're more authoritative)
      apiClosed.forEach(trade => {
        const key = `${trade.pairIndex}-${trade.tradeIndex}`;
        mergedMap.set(key, trade);
      });
      
      // Add local trades (only if not already present from API)
      localClosed.forEach(trade => {
        const key = `${trade.pairIndex}-${trade.tradeIndex}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, trade);
        }
      });
      
      // Sort by closedAt (most recent first), fallback to openedAt if closedAt is missing
      // Timestamp units: openedAt is in seconds (Unix timestamp), closedAt is in milliseconds
      // Convert both to milliseconds for consistent comparison
      const merged = Array.from(mergedMap.values()).sort((a, b) => {
        // Normalize both timestamps to milliseconds for comparison
        const aTime = (a.closedAt && a.closedAt > 0) 
          ? a.closedAt  // closedAt is already in milliseconds
          : (a.openedAt && a.openedAt > 0 ? a.openedAt * 1000 : 0); // openedAt is in seconds, convert to ms
        const bTime = (b.closedAt && b.closedAt > 0)
          ? b.closedAt  // closedAt is already in milliseconds
          : (b.openedAt && b.openedAt > 0 ? b.openedAt * 1000 : 0); // openedAt is in seconds, convert to ms
        return bTime - aTime; // Descending order (latest first)
      });
      
      setClosedTrades(merged);
    };
    
    loadAllClosedTrades();
  }, [userAddress, getClosedTrades]);

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

    if (!userAddress || !embeddedAddress) return;

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
      const MIN_POSITION_SIZE_USD = 100.0;
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

      // Save closed trade
      if (userAddress) {
        saveClosedTrade(userAddress, verifiedTrade, finalPnL, { closeTxHash });
        const updatedClosed = loadClosedTrades(userAddress);
        setClosedTrades(updatedClosed);
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
        takeProfitMultiplier: calculate200PercentGainMultiplier(
          !verifiedTrade.isLong,
          verifiedTrade.leverage
        ),
      });

      // Open opposite position
      await signAndBroadcast(openTx);

      // Refresh trades after a delay
      setTimeout(() => {
        if (!userAddress) return;
        const refreshTrades = async () => {
          try {
            const [trades, positions] = await Promise.all([
              getTrades(userAddress),
              getPnL(userAddress),
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
          } catch (error) {
            console.error('Failed to refresh trades:', error);
          }
        };
        refreshTrades();
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

    if (!userAddress || !embeddedAddress) return;

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

      const pnlPct = finalPnL?.pnlPercentage ?? 0;
      if (pnlPct >= 0) {
        playWin();
      } else {
        playLose();
      }

      // Save closed trade
      if (userAddress) {
        saveClosedTrade(userAddress, trade, finalPnL, { closeTxHash });
        // Reload closed trades
        const updatedClosed = loadClosedTrades(userAddress);
        setClosedTrades(updatedClosed);
      }

      // Show success toast with PnL
      const pnl = finalPnL?.pnl ?? 0;
      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      showToast(`Closed! PnL: ${pnlStr}`, 'success');

      // Refresh trades after a delay
      setTimeout(() => {
        if (!userAddress) return;
        const refreshTrades = async () => {
          try {
            const [trades, positions] = await Promise.all([
              getTrades(userAddress),
              getPnL(userAddress),
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
          } catch (error) {
            console.error('Failed to refresh trades:', error);
          }
        };
        refreshTrades();
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
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-md mx-auto w-full">
      {/* Header - Improved layout */}
      <header className="w-full mb-4 sm:mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
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
        
        {/* Aggregate Stats - Total PnL across all open positions */}
        {mounted && tradesWithPnL.length > 0 && !showClosedTrades && (
          <div 
            className="mb-4 p-4 border-4"
            style={{
              borderColor: aggregateStats.totalPnL >= 0 ? '#CCFF00' : '#FF006E',
              backgroundColor: aggregateStats.totalPnL >= 0 ? 'rgba(204, 255, 0, 0.1)' : 'rgba(255, 0, 110, 0.1)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Total P&L</div>
                <div 
                  className="font-black text-2xl font-mono"
                  style={{ color: aggregateStats.totalPnL >= 0 ? '#CCFF00' : '#FF006E' }}
                >
                  {aggregateStats.totalPnL >= 0 ? '+' : '-'}${Math.abs(aggregateStats.totalPnL).toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Collateral</div>
                <div className="text-white font-bold text-lg font-mono">
                  ${aggregateStats.totalCollateral.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toggle and Stats - Improved layout */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="brutal-toggle shrink-0">
            <button
              onClick={() => setShowClosedTrades(false)}
              className={`brutal-toggle-option ${!showClosedTrades ? 'active' : ''}`}
              aria-pressed={!showClosedTrades}
              aria-label="Show open trades"
            >
              OPEN {tradesWithPnL.length > 0 && `(${tradesWithPnL.length})`}
            </button>
            <button
              onClick={() => setShowClosedTrades(true)}
              className={`brutal-toggle-option ${showClosedTrades ? 'active' : ''}`}
              aria-pressed={showClosedTrades}
              aria-label="Show closed trades"
            >
              CLOSED {closedTrades.length > 0 && `(${closedTrades.length})`}
            </button>
          </div>
          
          {/* Compact Stats */}
          <div className="flex items-center justify-end gap-4 text-xs sm:text-sm min-w-0">
            <div className="text-center shrink-0">
              <div className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide mb-0.5">Trades</div>
              <div className="text-[#CCFF00] font-black text-lg sm:text-xl font-mono" suppressHydrationWarning>
                {mounted ? tradeStats.totalTrades : 0}
              </div>
            </div>
            <div className="text-center shrink-0">
              <div className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide mb-0.5">Volume</div>
              <div className="text-[#CCFF00] font-black text-lg sm:text-xl font-mono" suppressHydrationWarning>
                {mounted
                  ? `$${(historicVolume ?? tradeStats.totalVolume).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : '$0'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Trades List */}
      <main className="flex-1 overflow-y-auto min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6">
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
              {closedTrades.slice(0, displayedClosedTradesCount).map((closedTrade) => {
                // Convert ClosedTrade to Trade + PnLData for TradeCard
                const trade: Trade = {
                  tradeIndex: closedTrade.tradeIndex,
                  pairIndex: closedTrade.pairIndex,
                  pair: closedTrade.pair,
                  collateral: closedTrade.collateral,
                  leverage: closedTrade.leverage,
                  isLong: closedTrade.isLong,
                  openPrice: closedTrade.openPrice,
                  tp: closedTrade.tp,
                  sl: closedTrade.sl,
                  liquidationPrice: closedTrade.liquidationPrice,
                  openedAt: closedTrade.openedAt,
                };
                const pnlData: PnLData = {
                  trade,
                  currentPrice: closedTrade.closePrice,
                  pnl: closedTrade.finalPnL,
                  pnlPercentage: closedTrade.finalPnLPercentage,
                };
                return (
                  <TradeCard
                    key={`closed-${closedTrade.pairIndex}-${closedTrade.tradeIndex}`}
                    trade={trade}
                    pnlData={pnlData}
                    onFlip={() => {}}
                    onClose={() => {}}
                    isFlipping={false}
                    isClosing={false}
                    isClosed={true}
                  />
                );
              })}
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
                onClick={() => router.push('/')}
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

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
