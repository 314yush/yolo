'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { TradeCard } from '@/components/TradeCard';
import { ToastContainer } from '@/components/Toast';
import { saveClosedTrade, loadClosedTrades } from '@/lib/closedTrades';
import { buildCloseTradeTx as buildCloseTradeTxDirect, buildOpenTradeTx as buildOpenTradeTxDirect } from '@/lib/avantisEncoder';
import type { Trade, PnLData, ClosedTrade } from '@/types';

export default function ActivityPage() {
  const router = useRouter();
  const { userAddress, updateActivePositions, pendingTradeHashes, removePendingTradeHash, toasts, removeToast, tradeStats } = useTradeStore();
  const { delegateAddress } = useDelegateWallet();
  const { getTrades, getPnL } = useAvantisAPI();  // Only need read operations now
  const { signAndWait, signAndBroadcast } = useTxSigner();
  const { prices } = useTradeStore();  // Real-time Pyth prices
  
  const [tradesWithPnL, setTradesWithPnL] = useState<Array<{ trade: Trade; pnlData?: PnLData }>>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [showClosedTrades, setShowClosedTrades] = useState(false);
  const [flippingTradeIndex, setFlippingTradeIndex] = useState<number | null>(null);
  const [closingTradeIndex, setClosingTradeIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering stats after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load closed trades from localStorage
  useEffect(() => {
    if (!userAddress) return;
    const closed = loadClosedTrades(userAddress);
    setClosedTrades(closed);
  }, [userAddress]);

  // Load trades with PnL - adaptive polling (faster when pending trades exist)
  useEffect(() => {
    if (!userAddress) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const loadTrades = async () => {
      if (!isMounted || !userAddress) return;

      try {
        // Fetch PnL which includes trades
        const positions = await getPnL(userAddress);

        if (!isMounted) return;

        // PnL response includes trades, so we can use it directly
        const combined = positions.map((pos) => ({
          trade: pos.trade,
          pnlData: pos,
        }));

        setTradesWithPnL(combined);
        updateActivePositions(positions.length);
        
        // If we have pending trades and found new trades, clear pending hashes
        if (pendingTradeHashes.size > 0 && positions.length > 0) {
          pendingTradeHashes.forEach(hash => removePendingTradeHash(hash));
        }
      } catch (error) {
        console.error('[TradesPage] Failed to load trades:', error);
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
    if (!userAddress || !delegateAddress) return;

    // Find the trade in the current list to ensure we have the correct data
    const tradeWithPnL = tradesWithPnL.find((t) => 
      t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
    );
    
    if (!tradeWithPnL) {
      alert('Trade not found. Please refresh and try again.');
      return;
    }

    // Use the verified trade data to ensure consistency
    const verifiedTrade = tradeWithPnL.trade;
    const tradeIndex = tradesWithPnL.findIndex((t) => 
      t.trade.pairIndex === verifiedTrade.pairIndex && t.trade.tradeIndex === verifiedTrade.tradeIndex
    );
    setFlippingTradeIndex(tradeIndex);

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
      await signAndWait(closeTx);

      // Save closed trade
      if (userAddress) {
        saveClosedTrade(userAddress, verifiedTrade, finalPnL);
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
      alert(error instanceof Error ? error.message : 'Failed to flip trade');
    } finally {
      setFlippingTradeIndex(null);
    }
  };

  const handleClose = async (trade: Trade) => {
    if (!userAddress || !delegateAddress) return;

    const tradeIndex = tradesWithPnL.findIndex((t) => 
      t.trade.pairIndex === trade.pairIndex && t.trade.tradeIndex === trade.tradeIndex
    );
    setClosingTradeIndex(tradeIndex);

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

      await signAndWait(closeTx);

      // Save closed trade
      if (userAddress) {
        saveClosedTrade(userAddress, trade, finalPnL);
        // Reload closed trades
        const updatedClosed = loadClosedTrades(userAddress);
        setClosedTrades(updatedClosed);
      }

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
      alert(error instanceof Error ? error.message : 'Failed to close trade');
    } finally {
      setClosingTradeIndex(null);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-md mx-auto w-full">
      {/* Header - Compact */}
      <header className="w-full mb-4 sm:mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => router.back()}
            className="text-[#CCFF00] text-base sm:text-lg font-bold touch-manipulation min-h-[40px] flex items-center px-3 py-1.5 border-4 border-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors"
            style={{ boxShadow: '4px 4px 0px 0px rgba(204, 255, 0, 0.5)' }}
            aria-label="Go back"
          >
            ← BACK
          </button>
          <h1 className="text-[#CCFF00] text-lg sm:text-xl font-bold">ACTIVITY</h1>
          <div className="w-20 sm:w-24" />
        </div>
        
        {/* Toggle and Stats - Inline */}
        <div className="flex items-center justify-between gap-4">
          <div className="brutal-toggle">
            <button
              onClick={() => setShowClosedTrades(false)}
              className={`brutal-toggle-option ${!showClosedTrades ? 'active' : ''}`}
              aria-pressed={!showClosedTrades}
            >
              OPEN
            </button>
            <button
              onClick={() => setShowClosedTrades(true)}
              className={`brutal-toggle-option ${showClosedTrades ? 'active' : ''}`}
              aria-pressed={showClosedTrades}
            >
              CLOSED
            </button>
          </div>
          
          {/* Compact Stats */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
            <div className="text-center">
              <div className="text-white/50 text-[10px] sm:text-xs">TOTAL</div>
              <div className="text-[#CCFF00] font-bold text-base sm:text-lg" suppressHydrationWarning>
                {mounted ? tradeStats.totalTrades : 0}
              </div>
            </div>
            <div className="text-center">
              <div className="text-white/50 text-[10px] sm:text-xs">OPEN</div>
              <div className="text-[#CCFF00] font-bold text-base sm:text-lg" suppressHydrationWarning>
                {mounted ? tradesWithPnL.length : 0}
              </div>
            </div>
            <div className="text-center">
              <div className="text-white/50 text-[10px] sm:text-xs">CLOSED</div>
              <div className="text-[#CCFF00] font-bold text-base sm:text-lg" suppressHydrationWarning>
                {mounted ? closedTrades.length : 0}
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
              <div className="text-white/40 text-base sm:text-lg mb-4">No closed trades</div>
              <button
                onClick={() => setShowClosedTrades(false)}
                className="px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation"
              >
                VIEW OPEN TRADES
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-4">
              {closedTrades.map((closedTrade) => {
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
            </div>
          )
        ) : (
          // Show open trades
          tradesWithPnL.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="text-white/40 text-base sm:text-lg mb-4">No open trades</div>
              <button
                onClick={() => router.push('/')}
                className="px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-bold brutal-button bg-[#CCFF00] text-black min-h-[48px] touch-manipulation"
              >
                ROLL NOW
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 pb-4">
              {tradesWithPnL.map((item, index) => (
                <TradeCard
                  key={`${item.trade.pairIndex}-${item.trade.tradeIndex}`}
                  trade={item.trade}
                  pnlData={item.pnlData}
                  onFlip={handleFlip}
                  onClose={handleClose}
                  isFlipping={flippingTradeIndex === index}
                  isClosing={closingTradeIndex === index}
                />
              ))}
            </div>
          )
        )}
      </main>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
