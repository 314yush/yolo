'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { useSound } from '@/hooks/useSound';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useOpenTrades } from '@/hooks/useOpenTrades';
import { useFastConfirmation } from '@/hooks/useFastConfirmation';
import { usePythPricesSync } from '@/hooks/usePythPrices';
import { usePrebuiltTx } from '@/hooks/usePrebuiltTx';
import { PickerWheel } from '@/components/PickerWheel';
import { PnLScreen } from '@/components/PnLScreen';
import { LoginButton } from '@/components/LoginButton';
import { SetupFlow } from '@/components/SetupFlow';
import { ToastContainer } from '@/components/Toast';
import { AbstractBackground } from '@/components/AbstractBackground';
import { saveClosedTrade } from '@/lib/closedTrades';
import { 
  buildCloseTradeTx as buildCloseTradeTxDirect,
  buildOpenTradeTx as buildOpenTradeTxDirect,
} from '@/lib/avantisEncoder';
import Link from 'next/link';
import type { Trade, PnLData } from '@/types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DEFAULT_COLLATERAL } from '@/lib/constants';

export default function HomePage() {
  const { authenticated, ready, user } = usePrivy();
  const {
    stage,
    setStage,
    userAddress,
    setUserAddress,
    delegateStatus,
    collateral,
    currentTrade,
    setCurrentTrade,
    setPnLData,
    setTxHash,
    setError,
    incrementTotalTrades,
    openTrades,
    addPendingTradeHash,
    removePendingTradeHash,
    reset,
    toasts,
    removeToast,
    prices,
  } = useTradeStore();
  
  const { delegateAddress } = useDelegateWallet();
  
  // Ensure userAddress is set when user is authenticated
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      const address = user.wallet.address as `0x${string}`;
      if (address !== userAddress) {
        setUserAddress(address);
      }
    }
  }, [authenticated, user, userAddress, setUserAddress]);
  const { getTrades, getPnL } = useAvantisAPI();  // Only read operations from backend
  const { signAndBroadcast, signAndWait } = useTxSigner();
  const { playWin, playBoom } = useSound();
  const { balance: usdcBalance } = useUsdcBalance();
  
  // Start fetching open trades + PnL immediately when user logs in
  useOpenTrades();
  
  // Stream real-time prices from Pyth (syncs to store)
  usePythPricesSync();

  // Auto-detect and set currentTrade if we're in PnL stage but don't have a trade yet
  useEffect(() => {
    if (stage === 'pnl' && !currentTrade && userAddress) {
      // Try to find the latest trade
      const checkForTrade = async () => {
        try {
          const trades = await getTrades(userAddress);
          if (trades.length > 0) {
            const latestTrade = trades[trades.length - 1];
            setCurrentTrade(latestTrade);
            
            // Also try to get PnL data
            try {
              const positions = await getPnL(userAddress);
              const matchingPnL = positions.find(
                p => p.trade.pairIndex === latestTrade.pairIndex && 
                     p.trade.tradeIndex === latestTrade.tradeIndex
              );
              if (matchingPnL) {
                setPnLData(matchingPnL);
              } else {
                // Initialize with zero PnL
                setPnLData({
                  trade: latestTrade,
                  currentPrice: latestTrade.openPrice,
                  pnl: 0,
                  pnlPercentage: 0,
                });
              }
            } catch {
              // Initialize with zero PnL if PnL fetch fails
              setPnLData({
                trade: latestTrade,
                currentPrice: latestTrade.openPrice,
                pnl: 0,
                pnlPercentage: 0,
              });
            }
          }
        } catch (err) {
          console.error('Failed to auto-detect trade:', err);
        }
      };
      
      // Check immediately and then retry a few times
      checkForTrade();
      const intervalId = setInterval(checkForTrade, 2000);
      const timeoutId = setTimeout(() => clearInterval(intervalId), 10000); // Stop after 10s
      
      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    }
  }, [stage, currentTrade, userAddress, getTrades, getPnL, setCurrentTrade, setPnLData]);
  
  // Pre-build transactions when selection changes
  const { prebuiltTx, isPrebuilding, rebuildNow } = usePrebuiltTx();
  
  // Track if trade was confirmed via Pusher before wheel finished
  const tradeConfirmedRef = useRef(false);
  const confirmationLatencyRef = useRef<number | null>(null);
  
  // Fast confirmation via Pusher events
  const { startConfirmation } = useFastConfirmation(userAddress, {
    onPickedUp: () => {},
    onPreconfirmed: () => {},
    onConfirmed: (latency) => {
      tradeConfirmedRef.current = true;
      confirmationLatencyRef.current = latency;
    },
    onFailed: (reason) => {
      setError(reason || 'Trade failed');
      setStage('error');
    },
  });
  
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldSpin, setShouldSpin] = useState(false);

  // Handle spin start - fire trade immediately
  const handleSpinStart = useCallback(async () => {
    // Reset confirmation tracking
    tradeConfirmedRef.current = false;
    confirmationLatencyRef.current = null;
    
    // Get selection directly from store to avoid stale closure
    const storeState = useTradeStore.getState();
    const currentSelection = storeState.selection;
    const storedPrebuiltTx = storeState.prebuiltTx;
    
    // Get user address - from store or directly from Privy user
    const traderAddress = userAddress || (user?.wallet?.address as `0x${string}` | undefined);
    
    if (!traderAddress || !delegateAddress || !currentSelection) return;

    // Validate minimum position size ($100 minimum)
    const MIN_POSITION_SIZE_USD = 100.0;
    const positionSize = collateral * currentSelection.leverage.value;
    if (positionSize < MIN_POSITION_SIZE_USD) {
      const minCollateral = MIN_POSITION_SIZE_USD / currentSelection.leverage.value;
      setError(
        `Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE_USD.toFixed(2)}. ` +
        `With ${currentSelection.leverage.value}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC.`
      );
      setStage('error');
      return;
    }

    try {
      // Use pre-built tx if available, otherwise build on-demand with direct encoding
      const unsignedTx = storedPrebuiltTx ?? buildOpenTradeTxDirect({
        trader: traderAddress,
        pairIndex: currentSelection.asset.pairIndex,
        collateral: collateral,
        leverage: currentSelection.leverage.value,
        isLong: currentSelection.direction.isLong,
        openPrice: prices[`${currentSelection.asset.name}/USD`]?.price || 0,
      });

      if (!unsignedTx) {
        setError('Failed to build trade transaction');
        setStage('error');
        return;
      }

      // Sign and broadcast with delegate key
      const hash = await signAndBroadcast({
        to: unsignedTx.to as `0x${string}`,
        data: unsignedTx.data as `0x${string}`,
        value: unsignedTx.value,
        chainId: unsignedTx.chainId,
      });
      setTxHash(hash);
      
      // Clear the pre-built tx (it's been used)
      useTradeStore.getState().setPrebuiltTx(null);
      
      // Start fast confirmation tracking via Pusher + polling
      startConfirmation(hash);
      
      // Add to pending trades for optimistic update
      addPendingTradeHash(hash);
      
      setStage('executing');
    } catch (err) {
      console.error('Trade execution error:', err);
      setError(err instanceof Error ? err.message : 'Trade failed');
      setStage('error');
    }
  }, [
    userAddress,
    user,
    delegateAddress,
    collateral,
    prices,
    signAndBroadcast,
    setTxHash,
    setStage,
    setError,
    addPendingTradeHash,
    startConfirmation,
  ]);

  // Handle spin complete - check trade status and show PnL
  const handleSpinComplete = useCallback(async () => {
    if (!userAddress) {
      setError('User address not available');
      setStage('error');
      return;
    }
    
    const wasConfirmedViaPusher = tradeConfirmedRef.current;
    const startTime = Date.now();
    const MAX_POLLING_TIME = 15000; // Maximum 15 seconds total polling time

    try {
      // Faster polling if already confirmed via Pusher
      const pollingInterval = wasConfirmedViaPusher ? 100 : 500;
      const maxAttempts = wasConfirmedViaPusher ? 50 : 20;
      let attempts = 0;
      
      const pollForTrade = async (): Promise<boolean> => {
        // Check if we've exceeded maximum polling time
        if (Date.now() - startTime > MAX_POLLING_TIME) {
          console.warn('Polling timeout exceeded');
          return false;
        }

        attempts++;
        
        try {
          const trades = await getTrades(userAddress);
          
          if (trades.length > 0) {
            const latestTrade = trades[trades.length - 1];
            setCurrentTrade(latestTrade);
            
            // Initialize PnL data
            setPnLData({
              trade: latestTrade,
              currentPrice: latestTrade.openPrice,
              pnl: 0,
              pnlPercentage: 0,
            });
            
            setStage('pnl');
            playWin();
            incrementTotalTrades();
            
            // Remove pending hash - trade is confirmed
            const { txHash } = useTradeStore.getState();
            if (txHash) {
              removePendingTradeHash(txHash);
            }
            
            return true;
          }
        } catch (err) {
          console.error('Error fetching trades:', err);
          // Continue to try PnL endpoint
        }
        
        try {
          // Also try PnL endpoint
          const positions = await getPnL(userAddress);
          if (positions.length > 0) {
            const latestPosition = positions[positions.length - 1];
            setCurrentTrade(latestPosition.trade);
            setPnLData(latestPosition);
            setStage('pnl');
            playWin();
            incrementTotalTrades();
            
            // Remove pending hash - trade is confirmed
            const { txHash } = useTradeStore.getState();
            if (txHash) {
              removePendingTradeHash(txHash);
            }
            
            return true;
          }
        } catch (err) {
          console.error('Error fetching PnL:', err);
          // Continue polling
        }
        
        return false;
      };
      
      // Try immediately
      if (await pollForTrade()) {
        return;
      }
      
      // Poll at determined interval with timeout protection
      while (attempts < maxAttempts) {
        // Check timeout before each poll
        if (Date.now() - startTime > MAX_POLLING_TIME) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollingInterval));
        
        if (await pollForTrade()) {
          return;
        }
      }
      
      // Still no trade after polling - check if we have a pending txHash
      const { txHash } = useTradeStore.getState();
      if (txHash) {
        // We have a transaction hash, show PnL screen - it will continue polling via useOpenTrades
        // Initialize with current selection as fallback
        const storeState = useTradeStore.getState();
        if (storeState.selection && !storeState.currentTrade) {
          // Create a temporary trade object from selection for display
          const tempTrade: Trade = {
            tradeIndex: 0,
            pairIndex: storeState.selection.asset.pairIndex,
            pair: `${storeState.selection.asset.name}/USD`,
            collateral: collateral,
            leverage: storeState.selection.leverage.value,
            isLong: storeState.selection.direction.isLong,
            openPrice: prices[`${storeState.selection.asset.name}/USD`]?.price || 0,
            tp: 0,
            sl: 0,
            openedAt: Date.now(),
          };
          setCurrentTrade(tempTrade);
          setPnLData({
            trade: tempTrade,
            currentPrice: tempTrade.openPrice,
            pnl: 0,
            pnlPercentage: 0,
          });
        }
        setStage('pnl');
      } else {
        // No transaction hash - something went wrong
        setError('Trade execution may have failed. Please check your wallet and try again.');
        setStage('error');
      }
    } catch (err) {
      console.error('Spin complete error:', err);
      // Show PnL screen if we have a selection, otherwise show error
      const storeState = useTradeStore.getState();
      if (storeState.selection) {
        setStage('pnl'); // PnL screen will continue polling
      } else {
        setError(err instanceof Error ? err.message : 'Failed to confirm trade');
        setStage('error');
      }
    }
  }, [userAddress, getTrades, getPnL, setCurrentTrade, setPnLData, setStage, setError, playWin, incrementTotalTrades, removePendingTradeHash, collateral, prices]);

  // Handle close trade - uses pre-built tx or direct encoding (no SDK)
  const handleCloseTrade = useCallback(async () => {
    const { currentTrade, pnlData, prebuiltCloseTx, setPrebuiltCloseTx } = useTradeStore.getState();
    if (!userAddress || !delegateAddress || !currentTrade) return;

    playBoom();
    setIsClosing(true);

    try {
      // Use pre-built tx if available, otherwise build on-demand
      const closeTx = prebuiltCloseTx 
        ? (setPrebuiltCloseTx(null), prebuiltCloseTx)
        : buildCloseTradeTxDirect({
            trader: userAddress,
            pairIndex: currentTrade.pairIndex,
            tradeIndex: currentTrade.tradeIndex,
            collateralToClose: currentTrade.collateral,
          });

      await signAndWait(closeTx);
      
      // Save closed trade with current PnL data
      if (userAddress && currentTrade) {
        saveClosedTrade(userAddress, currentTrade, pnlData);
      }
      
      // Reset and go back to idle
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close trade');
    } finally {
      setIsClosing(false);
    }
  }, [userAddress, delegateAddress, signAndWait, setError, reset, playBoom]);

  // Handle roll again
  const handleRollAgain = useCallback(() => {
    reset();
  }, [reset]);

  // Loading state
  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center safe-area-top safe-area-bottom" role="status" aria-live="polite" aria-label="Loading application">
        <div className="text-[#CCFF00] text-2xl md:text-3xl font-bold animate-pulse" aria-hidden="true">LOADING...</div>
        <span className="sr-only">Loading YOLO trading application</span>
      </div>
    );
  }

  // Not authenticated - show login
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-8 safe-area-top safe-area-bottom">
        <header className="text-center">
          <h1 className="yolo-logo text-5xl sm:text-6xl md:text-7xl font-bold px-12 sm:px-16 py-10 sm:py-12 mb-8 sm:mb-12">
            YOLO
          </h1>
          <p className="text-white/60 text-center mb-8 sm:mb-10 max-w-md text-base sm:text-lg leading-relaxed px-4">
            Spin the wheel, open a trade. Zero-fee perpetuals on Base.
          </p>
        </header>
        <LoginButton />
      </div>
    );
  }

  // Authenticated but not set up
  if (!delegateStatus.isSetup && !isSetupComplete) {
    return (
      <div className="min-h-screen bg-black flex flex-col safe-area-top safe-area-bottom">
        <header className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-6">
          <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-bold">YOLO</h1>
          <LoginButton />
        </header>
        <main className="flex-1 flex items-center justify-center px-4" id="main-content">
          <SetupFlow onSetupComplete={() => setIsSetupComplete(true)} />
        </main>
      </div>
    );
  }

  // Main app
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-between px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 font-mono safe-area-top safe-area-bottom relative">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:px-4 focus:py-2 focus:bg-[#CCFF00] focus:text-black focus:font-bold focus:border-4 focus:border-black focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      >
        Skip to main content
      </a>
      
      {/* Abstract Background */}
      <AbstractBackground />
      
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-6 sm:mb-8 relative z-10">
        <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-bold">YOLO</h1>
        <LoginButton />
      </header>

      {/* Main content */}
      <main 
        id="main-content"
        className="flex-1 flex items-center justify-center w-full min-h-0 relative z-10"
        role="main"
        aria-label="Trading interface"
      >
        {/* Live region for status updates */}
        <div 
          role="status" 
          aria-live="polite" 
          aria-atomic="true"
          className="sr-only"
          id="status-announcements"
        />
        
        {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
          <section aria-label="Trade selection wheel" className="w-full flex flex-col items-center">
            {/* Warning banner if positions are open */}
            {stage === 'idle' && openTrades.length > 0 && (
              <div className="w-full max-w-md mb-4 p-3 border-4 border-[#FFD60A] bg-[#FFD60A]/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[#FFD60A] font-bold text-sm">
                  <span>⚠️</span>
                  <span>{openTrades.length} POSITION{openTrades.length > 1 ? 'S' : ''} OPEN</span>
                </div>
                <a 
                  href="/activity" 
                  className="text-[#FFD60A] text-xs font-bold underline hover:no-underline"
                >
                  VIEW →
                </a>
              </div>
            )}
            <PickerWheel
              onSpinStart={handleSpinStart}
              onSpinComplete={handleSpinComplete}
              triggerSpin={shouldSpin}
            />
          </section>
        )}

        {stage === 'pnl' && (
          <section aria-label="Profit and loss display">
            <PnLScreen
              onClose={handleCloseTrade}
              onRollAgain={handleRollAgain}
              isClosing={isClosing}
            />
          </section>
        )}

        {stage === 'error' && (
          <section 
            role="alert" 
            aria-live="assertive"
            className="flex flex-col items-center gap-6 sm:gap-8 text-center px-4 pb-24 sm:pb-6"
          >
            <h2 className="text-[#FF006E] text-3xl sm:text-4xl md:text-5xl font-bold">ERROR</h2>
            <p className="text-white/70 text-base sm:text-lg max-w-md">
              Something went wrong. Please try again.
            </p>
            <button
              onClick={reset}
              className="px-8 sm:px-10 py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button bg-[#CCFF00] text-black min-h-[44px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-4 focus:ring-offset-black"
              aria-label="Try again to reset and return to trading"
            >
              TRY AGAIN
            </button>
          </section>
        )}
      </main>

      {/* Footer with roll button */}
      {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
        <footer className="w-full max-w-md mt-6 sm:mt-8 mb-20 sm:mb-0 relative z-10">
          <button
            onClick={() => {
              if (stage === 'idle') {
                setShouldSpin(true);
                setTimeout(() => setShouldSpin(false), 100);
              }
            }}
            disabled={stage !== 'idle'}
            aria-label={stage === 'idle' ? 'Spin the wheel to select trade parameters' : 'Wheel is spinning, please wait'}
            aria-busy={stage !== 'idle'}
            className={`
              w-full py-5 sm:py-6 text-2xl sm:text-3xl font-bold brutal-button min-h-[56px] touch-manipulation mb-3 sm:mb-4
              focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-4 focus:ring-offset-black
              ${stage === 'idle'
                ? 'bg-[#CCFF00] text-black hover:opacity-90 active:opacity-80'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {stage === 'idle' ? 'ROLL' : 'SPINNING...'}
          </button>

          <div className="flex justify-center items-center gap-4 sm:gap-6 text-white/60 text-xs sm:text-sm mb-20 sm:mb-0" role="group" aria-label="Account information">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white/80">COLLATERAL:</span>
              <span className="text-[#CCFF00] font-mono" aria-live="polite">
                <span className="sr-only">Collateral: </span>${collateral} USDC
              </span>
            </div>
            <div className="text-white/40">•</div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white/80">BALANCE:</span>
              <span className="text-[#CCFF00] font-mono" aria-live="polite">
                <span className="sr-only">Balance: </span>
                {usdcBalance !== null 
                  ? `$${usdcBalance.toFixed(2)} USDC`
                  : '--'
                }
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Bottom Navigation Bar - Mobile */}
      <nav 
        className="fixed bottom-0 left-0 right-0 bg-black/95 border-t-4 border-black backdrop-blur-sm z-50 safe-area-bottom sm:hidden"
        aria-label="Main navigation"
        role="navigation"
      >
        <div className="flex justify-around items-center px-4 py-3">
          <Link
            href="/activity"
            className="relative flex flex-col items-center gap-1 p-2 touch-manipulation min-h-[44px] min-w-[44px] justify-center focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label={`Activity${openTrades.length > 0 ? `, ${openTrades.length} open trade${openTrades.length !== 1 ? 's' : ''}` : ''}`}
          >
            <svg
              className="w-6 h-6 text-[#CCFF00]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 3h18v18H3zM3 9h18M9 3v18" />
            </svg>
            <span className="text-[10px] font-bold text-[#CCFF00] uppercase">Activity</span>
            {openTrades.length > 0 && (
              <span 
                className="absolute top-0 right-0 bg-[#FF006E] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-black animate-danger-pulse"
                aria-label={`${openTrades.length} open trade${openTrades.length !== 1 ? 's' : ''}`}
              >
                <span className="sr-only">{openTrades.length}</span>
                <span aria-hidden="true">{openTrades.length}</span>
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            className="flex flex-col items-center gap-1 p-2 touch-manipulation min-h-[44px] min-w-[44px] justify-center focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label="Settings"
          >
            <svg
              className="w-6 h-6 text-[#CCFF00]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m15.364 6.364l-4.243-4.243m0 0L12 12m4.121-4.121l4.243-4.243M12 12l-4.121-4.121m0 0L3.636 3.636m4.243 4.243L12 12" />
            </svg>
            <span className="text-[10px] font-bold text-[#CCFF00] uppercase">Settings</span>
          </Link>
        </div>
      </nav>

      {/* Desktop Navigation - Show in header on larger screens */}
      <nav 
        className="hidden sm:flex items-center gap-4 fixed top-4 right-20 md:top-6 md:right-24 z-40"
        aria-label="Main navigation"
        role="navigation"
      >
        <Link
          href="/activity"
          className="relative p-3 text-[#CCFF00] touch-manipulation bg-black border-4 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
          aria-label={`Activity${openTrades.length > 0 ? `, ${openTrades.length} open trade${openTrades.length !== 1 ? 's' : ''}` : ''}`}
          style={{ boxShadow: '4px 4px 0px 0px #CCFF00' }}
        >
          <svg
            className="w-5 h-5 md:w-6 md:h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
            strokeLinejoin="miter"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          {openTrades.length > 0 && (
            <span 
              className="absolute -top-2 -right-2 bg-[#FF006E] text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center border-2 border-black"
              aria-label={`${openTrades.length} open trade${openTrades.length !== 1 ? 's' : ''}`}
            >
              {openTrades.length}
            </span>
          )}
        </Link>
        <Link
          href="/settings"
          className="p-3 text-[#CCFF00] touch-manipulation bg-black border-4 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
          aria-label="Settings"
          style={{ boxShadow: '4px 4px 0px 0px #CCFF00' }}
        >
          <svg
            className="w-5 h-5 md:w-6 md:h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
            strokeLinejoin="miter"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </nav>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
