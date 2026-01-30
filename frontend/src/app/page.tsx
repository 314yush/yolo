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
import { useChartDataCollector } from '@/hooks/useChartDataCollector';
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
    loadDelegateStatusForUser,
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
  // Also load cached delegate status for this user
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      const address = user.wallet.address as `0x${string}`;
      if (address !== userAddress) {
        setUserAddress(address);
        // Load cached delegate status for this user
        loadDelegateStatusForUser(address);
      }
    } else if (!authenticated) {
      // Clear delegate status when logged out
      loadDelegateStatusForUser(null);
    }
  }, [authenticated, user, userAddress, setUserAddress, loadDelegateStatusForUser]);
  const { getTrades, getPnL } = useAvantisAPI();  // Only read operations from backend
  const { signAndBroadcast, signAndWait } = useTxSigner();
  const { playWin, playBoom } = useSound();
  const { balance: usdcBalance } = useUsdcBalance();
  
  // Start fetching open trades + PnL immediately when user logs in
  useOpenTrades();
  
  // Stream real-time prices from Pyth (syncs to store)
  usePythPricesSync();
  
  // Collect chart data in background for all assets (pre-load for instant charts)
  useChartDataCollector();

  // Auto-detect and set currentTrade if we're in PnL stage but don't have a trade yet
  // Also verify that currentTrade still exists if we have one
  useEffect(() => {
    if (stage === 'pnl' && userAddress) {
      // Try to find the latest trade
      const checkForTrade = async () => {
        try {
          const positions = await getPnL(userAddress);
          if (positions.length === 0) return;
          
          // If we have a currentTrade, verify it still exists
          if (currentTrade) {
            const tradeStillExists = positions.some(
              p => p.trade.pairIndex === currentTrade.pairIndex && 
                   p.trade.tradeIndex === currentTrade.tradeIndex
            );
            // If trade doesn't exist anymore, clear it so we can set a new one
            if (!tradeStillExists) {
              setCurrentTrade(null);
              return; // Will retry on next interval
            }
            // Trade exists, we're good
            return;
          }
          
          // No currentTrade, set the newest one
          const sortedPositions = [...positions].sort((a, b) => b.trade.openedAt - a.trade.openedAt);
          const latestPosition = sortedPositions[0];
          setCurrentTrade(latestPosition.trade);
          setPnLData(latestPosition);
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
  }, [stage, currentTrade, userAddress, getPnL, setCurrentTrade, setPnLData]);
  
  // Pre-build transactions when selection changes
  const { prebuiltTx, isPrebuilding, rebuildNow } = usePrebuiltTx();
  
  // Track if trade was confirmed via Pusher before wheel finished
  const tradeConfirmedRef = useRef(false);
  const confirmationLatencyRef = useRef<number | null>(null);
  // Track when spin started to filter out old trades
  const spinStartTimeRef = useRef<number | null>(null);
  // Track timing milestones for debugging
  const timingRef = useRef<{
    spinStart: number | null;
    txSent: number | null;
    txConfirmed: number | null;
    tradeFound: number | null;
    pnlStageSet: number | null;
  }>({
    spinStart: null,
    txSent: null,
    txConfirmed: null,
    tradeFound: null,
    pnlStageSet: null,
  });
  
  // Fast confirmation via Pusher events
  const { startConfirmation } = useFastConfirmation(userAddress, {
    onPickedUp: () => {},
    onPreconfirmed: () => {},
    onConfirmed: (latency) => {
      const txConfirmedTime = Date.now();
      timingRef.current.txConfirmed = txConfirmedTime;
      const elapsedFromSpinStart = timingRef.current.spinStart ? txConfirmedTime - timingRef.current.spinStart : 0;
      const elapsedFromTxSent = timingRef.current.txSent ? txConfirmedTime - timingRef.current.txSent : null;
      console.log(`✅ [Trade Timing] Transaction confirmed (${elapsedFromSpinStart}ms from spin start${elapsedFromTxSent ? `, ${elapsedFromTxSent}ms from tx sent` : ''})`);
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
    const spinStartTime = Date.now();
    // Reset timing tracking
    timingRef.current = {
      spinStart: spinStartTime,
      txSent: null,
      txConfirmed: null,
      tradeFound: null,
      pnlStageSet: null,
    };
    console.log('🚀 [Trade Timing] Spin started');
    // Reset confirmation tracking
    tradeConfirmedRef.current = false;
    confirmationLatencyRef.current = null;
    // Record spin start time to filter out old trades
    spinStartTimeRef.current = spinStartTime;
    
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
      const txBuildStart = Date.now();
      // Use pre-built tx if available, otherwise build on-demand with direct encoding
      const unsignedTx = storedPrebuiltTx ?? buildOpenTradeTxDirect({
        trader: traderAddress,
        pairIndex: currentSelection.asset.pairIndex,
        collateral: collateral,
        leverage: currentSelection.leverage.value,
        isLong: currentSelection.direction.isLong,
        openPrice: prices[`${currentSelection.asset.name}/USD`]?.price || 0,
      });
      const txEncodeTime = Date.now() - txBuildStart;
      if (txEncodeTime > 10) {
        console.log(`⏱️  [Trade Timing] TX encoding took ${txEncodeTime}ms`);
      }

      if (!unsignedTx) {
        setError('Failed to build trade transaction');
        setStage('error');
        return;
      }

      // Sign and broadcast with delegate key
      const signStart = Date.now();
      const hash = await signAndBroadcast({
        to: unsignedTx.to as `0x${string}`,
        data: unsignedTx.data as `0x${string}`,
        value: unsignedTx.value,
        chainId: unsignedTx.chainId,
      });
      const txSentTime = Date.now();
      const signAndRelayTime = txSentTime - signStart;
      timingRef.current.txSent = txSentTime;
      const elapsedFromSpinStart = timingRef.current.spinStart ? txSentTime - timingRef.current.spinStart : 0;
      console.log(`📤 [Trade Timing] Transaction sent (${elapsedFromSpinStart}ms from spin start)`);
      console.log(`   ⏱️  Breakdown: Encoding=${txEncodeTime}ms, Sign+Relay=${signAndRelayTime}ms`);
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

  // Handle spin complete - show PnL immediately (optimistic UI)
  const handleSpinComplete = useCallback(async () => {
    if (!userAddress) {
      setError('User address not available');
      setStage('error');
      return;
    }
    
    const spinStartTime = spinStartTimeRef.current || Date.now();
    
    // OPTIMISTIC UI: Show PnLScreen immediately if we have txHash
    // This prevents the stuck spinning screen issue
    const storeState = useTradeStore.getState();
    if (storeState.txHash) {
      // We have a transaction hash, show PnL screen immediately
      // Initialize with current selection as fallback
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
          liquidationPrice: 0,
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
      // Continue polling in background via useOpenTrades hook
      return;
    }
    
    // If no txHash yet, wait briefly for it (max 2 seconds)
    const WAIT_FOR_TX_TIMEOUT = 2000;
    const waitStartTime = Date.now();
    
    while ((Date.now() - waitStartTime) < WAIT_FOR_TX_TIMEOUT) {
      const currentState = useTradeStore.getState();
      if (currentState.txHash) {
        // Found txHash, show PnL screen immediately
        if (currentState.selection && !currentState.currentTrade) {
          const tempTrade: Trade = {
            tradeIndex: 0,
            pairIndex: currentState.selection.asset.pairIndex,
            pair: `${currentState.selection.asset.name}/USD`,
            collateral: collateral,
            leverage: currentState.selection.leverage.value,
            isLong: currentState.selection.direction.isLong,
            openPrice: prices[`${currentState.selection.asset.name}/USD`]?.price || 0,
            tp: 0,
            sl: 0,
            liquidationPrice: 0,
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
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }
    
    // Fallback: If still no txHash after waiting, show PnL screen anyway
    // The useOpenTrades hook will continue polling in the background
    const finalState = useTradeStore.getState();
    if (finalState.selection) {
      const tempTrade: Trade = {
        tradeIndex: 0,
        pairIndex: finalState.selection.asset.pairIndex,
        pair: `${finalState.selection.asset.name}/USD`,
        collateral: collateral,
        leverage: finalState.selection.leverage.value,
        isLong: finalState.selection.direction.isLong,
        openPrice: prices[`${finalState.selection.asset.name}/USD`]?.price || 0,
        tp: 0,
        sl: 0,
        liquidationPrice: 0,
        openedAt: Date.now(),
      };
      setCurrentTrade(tempTrade);
      setPnLData({
        trade: tempTrade,
        currentPrice: tempTrade.openPrice,
        pnl: 0,
        pnlPercentage: 0,
      });
      setStage('pnl');
    } else {
      setError('Trade execution may have failed. Please check your wallet and try again.');
      setStage('error');
    }
    
    // Background polling continues via useOpenTrades hook
    // No need to poll here - PnLScreen will update when trade is confirmed
  }, [userAddress, setCurrentTrade, setPnLData, setStage, setError, collateral, prices]);

  useEffect(() => {
    if (stage === 'pnl') {
      const pnlRenderTime = Date.now();
      const timing = timingRef.current;
      const elapsedFromSpinStart = timing.spinStart ? pnlRenderTime - timing.spinStart : null;
      const elapsedFromTxSent = timing.txSent ? pnlRenderTime - timing.txSent : null;
      const elapsedFromTxConfirmed = timing.txConfirmed ? pnlRenderTime - timing.txConfirmed : null;
      const elapsedFromTradeFound = timing.tradeFound ? pnlRenderTime - timing.tradeFound : null;
      
      // Calculate phase durations
      const txBuildTime = timing.txSent && timing.spinStart ? timing.txSent - timing.spinStart : null;
      const txConfirmTime = timing.txConfirmed && timing.txSent ? timing.txConfirmed - timing.txSent : null;
      const tradeDiscoveryTime = timing.tradeFound && timing.txConfirmed ? timing.tradeFound - timing.txConfirmed : null;
      const pnlRenderDelay = timing.tradeFound ? pnlRenderTime - timing.tradeFound : null;
      
      // Console log summary
      console.log('📊 [Trade Timing] PnL Screen Rendered - Summary:');
      console.log(`   Total time: ${elapsedFromSpinStart ? (elapsedFromSpinStart / 1000).toFixed(2) : 'N/A'}s`);
      if (txBuildTime) console.log(`   ⏱️  TX Build: ${txBuildTime}ms`);
      if (txConfirmTime) console.log(`   ⏱️  TX Confirm: ${txConfirmTime}ms`);
      if (tradeDiscoveryTime) console.log(`   ⏱️  Trade Discovery: ${tradeDiscoveryTime}ms`);
      if (pnlRenderDelay) console.log(`   ⏱️  PnL Render Delay: ${pnlRenderDelay}ms`);
    }
  }, [stage]);

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
        <div className="text-[#CCFF00] text-2xl sm:text-3xl font-bold animate-pulse" aria-hidden="true">LOADING...</div>
        <span className="sr-only">Loading YOLO trading application</span>
      </div>
    );
  }

  // Not authenticated - show login
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-8 safe-area-top safe-area-bottom">
        <header className="text-center">
          <h1 className="yolo-logo text-5xl sm:text-6xl font-bold px-12 sm:px-16 py-10 sm:py-12 mb-8 sm:mb-12">
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
    <div 
      className={`bg-black flex flex-col relative w-full safe-area-top safe-area-bottom ${stage === 'pnl' ? '' : 'max-w-md mx-auto'}`}
      style={{
        height: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl') 
          ? '100dvh' 
          : 'min-h-screen',
        maxHeight: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl') 
          ? '100dvh' 
          : 'none',
        overflow: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl') 
          ? 'hidden' 
          : 'auto',
      }}
    >
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:px-4 focus:py-2 focus:bg-[#CCFF00] focus:text-black focus:font-bold focus:border-4 focus:border-black focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      >
        Skip to main content
      </a>
      
      {/* Abstract Background */}
      <AbstractBackground />
      
      {/* Header - Compact and always visible */}
      {stage !== 'pnl' && (
        <header className="w-full flex justify-between items-center px-4 pt-3 pb-2 relative z-10 flex-shrink-0">
          <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-bold">YOLO</h1>
          <LoginButton />
        </header>
      )}

      {/* Financial Info Bar - Prominent and always visible */}
      {stage !== 'pnl' && (
        <div className="w-full px-4 py-2 border-b-2 border-white/10 bg-black/50 backdrop-blur-sm relative z-10 flex-shrink-0">
          <div className="flex justify-center items-center gap-4 sm:gap-6 text-white/80 text-xs sm:text-sm font-mono">
            <div className="flex items-center gap-2">
              <span className="text-white/60 font-semibold">COLLATERAL:</span>
              <span className="text-[#CCFF00] font-bold" aria-live="polite">
                <span className="sr-only">Collateral: </span>${collateral} USDC
              </span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/40" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="text-white/60 font-semibold">BALANCE:</span>
              <span className="text-[#CCFF00] font-bold" aria-live="polite">
                <span className="sr-only">Balance: </span>
                {usdcBalance !== null 
                  ? `$${usdcBalance.toFixed(2)} USDC`
                  : '--'
                }
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main content - No scroll for picker/pnl screens */}
      <main 
        id="main-content"
        className={`flex-1 flex items-center justify-center w-full min-h-0 relative z-10 ${
          (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl')
            ? 'overflow-hidden'
            : 'overflow-y-auto'
        }`}
        role="main"
        aria-label="Trading interface"
        style={{
          paddingBottom: (stage === 'idle' || stage === 'spinning' || stage === 'executing') 
            ? 'calc(200px + env(safe-area-inset-bottom, 0px))' 
            : stage === 'pnl'
            ? '0'
            : 'calc(80px + env(safe-area-inset-bottom, 0px))',
          height: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl')
            ? '100%'
            : 'auto',
        }}
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
          <section 
            aria-label="Trade selection wheel" 
            className="w-full h-full flex flex-col items-center justify-center"
            style={{
              padding: 'clamp(0.5rem, 2vh, 1rem)',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Warning banner if positions are open */}
            {stage === 'idle' && openTrades.length > 0 && (
              <div 
                className="shrink-0 rounded-lg"
                style={{
                  width: 'calc(100% - clamp(1rem, 4vh, 2rem))',
                  maxWidth: 'calc(100vw - clamp(1rem, 4vh, 2rem) - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))',
                  marginBottom: 'clamp(0.5rem, 2vh, 1rem)',
                  padding: 'clamp(0.375rem, 1vh, 0.625rem)',
                  paddingLeft: 'clamp(0.5rem, 1.5vw, 0.75rem)',
                  paddingRight: 'clamp(0.5rem, 1.5vw, 0.75rem)',
                  borderWidth: 'clamp(2px, 0.5vw, 4px)',
                  borderColor: '#FFD60A',
                  borderStyle: 'solid',
                  backgroundColor: 'rgba(255, 214, 10, 0.1)',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                <div 
                  className="flex items-center gap-2"
                  style={{
                    minWidth: 0,
                    width: '100%',
                    flexWrap: 'nowrap',
                  }}
                >
                  <div 
                    className="flex items-center gap-1 text-[#FFD60A] font-bold"
                    style={{ 
                      fontSize: 'clamp(0.625rem, 1.6vw, 0.75rem)',
                      minWidth: 0,
                      flexShrink: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <span 
                      style={{ 
                        fontSize: 'clamp(0.6875rem, 1.8vw, 0.8125rem)',
                        flexShrink: 0,
                      }}
                    >
                      ⚠️
                    </span>
                    <span 
                      className="whitespace-nowrap truncate"
                      style={{ 
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {openTrades.length} POSITION{openTrades.length > 1 ? 'S' : ''} OPEN
                    </span>
                  </div>
                  <a 
                    href="/activity" 
                    className="text-[#FFD60A] font-bold underline hover:no-underline touch-manipulation"
                    style={{ 
                      fontSize: 'clamp(0.5625rem, 1.4vw, 0.6875rem)',
                      minHeight: '44px',
                      minWidth: 'clamp(3rem, 12vw, 4rem)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingLeft: 'clamp(0.25rem, 1vw, 0.5rem)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                    aria-label={`View ${openTrades.length} open position${openTrades.length !== 1 ? 's' : ''}`}
                  >
                    VIEW →
                  </a>
                </div>
              </div>
            )}
            <div 
              className="w-full h-full flex items-center justify-center shrink-0"
              style={{ minHeight: 0 }}
            >
              <PickerWheel
                onSpinStart={handleSpinStart}
                onSpinComplete={handleSpinComplete}
                triggerSpin={shouldSpin}
              />
            </div>
          </section>
        )}

        {stage === 'pnl' && (
          <section 
            aria-label="Profit and loss display"
            className="w-full h-full"
            style={{
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
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
            className="flex flex-col items-center gap-6 sm:gap-8 text-center px-4 pb-24"
          >
            <h2 className="text-[#FF006E] text-3xl sm:text-4xl font-bold">ERROR</h2>
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

      {/* Bottom Action Area - Stacked Nav Bar + ROLL Button */}
      {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
        <footer 
          className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/98 to-black/95 border-t-4 border-[#CCFF00]/20 backdrop-blur-md z-40 safe-area-bottom"
          style={{ 
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div className="px-4 pt-4 pb-3 max-w-md mx-auto space-y-3">
            {/* ROLL Button - Top of stack */}
            <div>
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
                  w-full py-4 sm:py-5 text-2xl sm:text-3xl font-black brutal-button min-h-[64px] touch-manipulation
                  transition-all duration-200 shadow-[0_8px_0px_0px_rgba(0,0,0,0.3)]
                  focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-4 focus:ring-offset-black
                  ${stage === 'idle'
                    ? 'bg-[#CCFF00] text-black hover:shadow-[0_6px_0px_0px_rgba(0,0,0,0.3)] hover:translate-y-[2px] active:shadow-[0_2px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-[6px]'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-[0_4px_0px_0px_rgba(0,0,0,0.3)]'
                  }
                `}
              >
                {stage === 'idle' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg 
                      className="w-6 h-6 sm:w-7 sm:h-7" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" />
                    </svg>
                    <span>ROLL</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg 
                      className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span>SPINNING...</span>
                  </span>
                )}
              </button>
            </div>

            {/* Navigation Bar - Below ROLL button */}
            <nav 
              className="flex justify-around items-center py-2"
              aria-label="Main navigation"
              role="navigation"
            >
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
            </nav>
          </div>
        </footer>
      )}

      {/* Bottom Navigation Bar - Only shown when not in trading stage */}
      {stage !== 'idle' && stage !== 'spinning' && stage !== 'executing' && (
        <nav 
          className="fixed bottom-0 left-0 right-0 bg-black/95 border-t-2 border-white/10 backdrop-blur-md z-30 safe-area-bottom"
          aria-label="Main navigation"
          role="navigation"
        >
          <div className="flex justify-around items-center px-4 py-2.5 max-w-md mx-auto">
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
      )}


      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
