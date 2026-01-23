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
import type { Trade, PnLData, ClosedTrade } from '@/types';

export default function ActivityPage() {
  const router = useRouter();
  const { userAddress, updateActivePositions, pendingTradeHashes, removePendingTradeHash, toasts, removeToast } = useTradeStore();
  const { delegateAddress } = useDelegateWallet();
  const { getTrades, getPnL, buildCloseTradeTx, buildOpenTradeTx } = useAvantisAPI();
  const { signAndWait, signAndBroadcast } = useTxSigner();
  
  const [tradesWithPnL, setTradesWithPnL] = useState<Array<{ trade: Trade; pnlData?: PnLData }>>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [showClosedTrades, setShowClosedTrades] = useState(false);
  const [flippingTradeIndex, setFlippingTradeIndex] = useState<number | null>(null);
  const [closingTradeIndex, setClosingTradeIndex] = useState<number | null>(null);

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

      // 1. Close current trade - using the same pattern as handleCloseTrade
      const closeTx = await buildCloseTradeTx(
        userAddress,
        delegateAddress,
        verifiedTrade.pairIndex,
        verifiedTrade.tradeIndex,
        verifiedTrade.collateral
      );

      if (!closeTx) {
        throw new Error('Failed to build close transaction');
      }

      await signAndWait(closeTx);

      // Save closed trade (flip closes the original trade)
      if (userAddress) {
        saveClosedTrade(userAddress, verifiedTrade, finalPnL);
        // Reload closed trades
        const updatedClosed = loadClosedTrades(userAddress);
        setClosedTrades(updatedClosed);
      }

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

      // 2. Open opposite direction - using verified pair that matches pairIndex
      // Using the same pattern as handleSpinStart
      const openTx = await buildOpenTradeTx({
        trader: userAddress,
        delegate: delegateAddress,
        pair: verifiedTrade.pair, // Use verified pair that matches pairIndex
        pairIndex: verifiedTrade.pairIndex,
        leverage: verifiedTrade.leverage,
        isLong: !verifiedTrade.isLong, // Flip direction
        collateral: verifiedTrade.collateral,
      });

      if (!openTx) {
        throw new Error('Failed to build open transaction');
      }

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
      const closeTx = await buildCloseTradeTx(
        userAddress,
        delegateAddress,
        trade.pairIndex,
        trade.tradeIndex,
        trade.collateral
      );

      if (!closeTx) {
        throw new Error('Failed to build close transaction');
      }

      // Get final PnL before closing
      const positions = await getPnL(userAddress);
      const pnlMap = new Map<string, PnLData>();
      positions.forEach((pos) => {
        const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
        pnlMap.set(key, pos);
      });
      const tradeKey = `${trade.pairIndex}-${trade.tradeIndex}`;
      const finalPnL = pnlMap.get(tradeKey) || null;

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
    <div className="min-h-screen bg-black flex flex-col p-4 md:p-8 font-mono safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-8">
        <button
          onClick={() => router.back()}
          className="text-[#CCFF00] text-xl font-bold hover:opacity-70"
        >
          ← BACK
        </button>
        <div className="flex flex-col items-center gap-2">
          <div className="text-[#CCFF00] text-2xl font-bold">ACTIVITY</div>
          {/* Toggle */}
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setShowClosedTrades(false)}
              className={`px-4 py-1 text-sm font-bold transition-opacity ${
                !showClosedTrades ? 'opacity-100' : 'opacity-50'
              }`}
              style={!showClosedTrades ? { backgroundColor: '#CCFF00', color: '#000' } : { backgroundColor: 'transparent', color: '#CCFF00', border: '2px solid #CCFF00' }}
            >
              OPEN
            </button>
            <button
              onClick={() => setShowClosedTrades(true)}
              className={`px-4 py-1 text-sm font-bold transition-opacity ${
                showClosedTrades ? 'opacity-100' : 'opacity-50'
              }`}
              style={showClosedTrades ? { backgroundColor: '#CCFF00', color: '#000' } : { backgroundColor: 'transparent', color: '#CCFF00', border: '2px solid #CCFF00' }}
            >
              CLOSED
            </button>
          </div>
        </div>
        <div className="w-16" /> {/* Spacer for centering */}
      </header>

      {/* Trades List */}
      <main className="flex-1 overflow-y-auto">
        {showClosedTrades ? (
          // Show closed trades
          closedTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-white/50 text-xl mb-4">No closed trades</div>
              <button
                onClick={() => setShowClosedTrades(false)}
                className="px-8 py-4 text-xl font-bold brutal-button"
                style={{ backgroundColor: '#CCFF00', color: '#000' }}
              >
                VIEW OPEN TRADES
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
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
                    onFlip={() => {}} // Disabled for closed trades
                    onClose={() => {}} // Disabled for closed trades
                    isFlipping={false}
                    isClosing={false}
                  />
                );
              })}
            </div>
          )
        ) : (
          // Show open trades
          tradesWithPnL.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-white/50 text-xl mb-4">No open trades</div>
              <button
                onClick={() => router.push('/')}
                className="px-8 py-4 text-xl font-bold brutal-button"
                style={{ backgroundColor: '#CCFF00', color: '#000' }}
              >
                ROLL NOW
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
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

      {/* Footer */}
      {!showClosedTrades && tradesWithPnL.length > 0 && (
        <footer className="mt-8 text-center text-white/50 text-sm">
          {tradesWithPnL.length} position{tradesWithPnL.length !== 1 ? 's' : ''} open
        </footer>
      )}
      {showClosedTrades && closedTrades.length > 0 && (
        <footer className="mt-8 text-center text-white/50 text-sm">
          {closedTrades.length} closed trade{closedTrades.length !== 1 ? 's' : ''}
        </footer>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
