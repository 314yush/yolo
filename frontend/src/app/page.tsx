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
      const hash = await signAndBroadcast(unsignedTx);
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
    if (!userAddress) return;
    
    const wasConfirmedViaPusher = tradeConfirmedRef.current;

    try {
      // Faster polling if already confirmed via Pusher
      const pollingInterval = wasConfirmedViaPusher ? 100 : 500;
      const maxAttempts = wasConfirmedViaPusher ? 50 : 20;
      let attempts = 0;
      
      const pollForTrade = async (): Promise<boolean> => {
        attempts++;
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
        
        return false;
      };
      
      // Try immediately
      if (await pollForTrade()) {
        return;
      }
      
      // Poll at determined interval
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
        if (await pollForTrade()) {
          return;
        }
      }
      
      // Still no trade after polling - show PnL screen, it will continue polling
      setStage('pnl');
    } catch {
      setStage('pnl'); // Show PnL screen, it will poll for updates
    }
  }, [userAddress, getTrades, getPnL, setCurrentTrade, setPnLData, setStage, playWin, incrementTotalTrades, removePendingTradeHash]);

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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[#CCFF00] text-2xl font-bold animate-pulse">LOADING...</div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
        <div
          className="yolo-logo text-6xl font-bold px-16 py-12 mb-12"
        >
          YOLO
        </div>
        <p className="text-white/50 text-center mb-8 max-w-md">
          Spin the wheel, open a trade. Zero-fee perpetuals on Base.
        </p>
        <LoginButton />
      </div>
    );
  }

  // Authenticated but not set up
  if (!delegateStatus.isSetup && !isSetupComplete) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <header className="flex justify-between items-center p-4">
          <div className="text-[#CCFF00] text-2xl font-bold">YOLO</div>
          <LoginButton />
        </header>
        <main className="flex-1 flex items-center justify-center">
          <SetupFlow onSetupComplete={() => setIsSetupComplete(true)} />
        </main>
      </div>
    );
  }

  // Main app
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-between p-4 md:p-8 font-mono safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-4">
        <div className="text-[#CCFF00] text-2xl font-bold">YOLO</div>
        <div className="flex items-center gap-4">
          <Link
            href="/activity"
            className="relative text-[#CCFF00] hover:opacity-70 transition-opacity"
            aria-label="Activity"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3h18v18H3zM3 9h18M9 3v18" />
            </svg>
            {openTrades.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#FF006E] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {openTrades.length}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            className="text-[#CCFF00] hover:opacity-70 transition-opacity"
            aria-label="Settings"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m15.364 6.364l-4.243-4.243m0 0L12 12m4.121-4.121l4.243-4.243M12 12l-4.121-4.121m0 0L3.636 3.636m4.243 4.243L12 12" />
            </svg>
          </Link>
          <LoginButton />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center w-full">
        {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
          <PickerWheel
            onSpinStart={handleSpinStart}
            onSpinComplete={handleSpinComplete}
            triggerSpin={shouldSpin}
          />
        )}

        {stage === 'pnl' && (
          <PnLScreen
            onClose={handleCloseTrade}
            onRollAgain={handleRollAgain}
            isClosing={isClosing}
          />
        )}

        {stage === 'error' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="text-[#FF006E] text-4xl font-bold">ERROR</div>
            <div className="text-white/70">Something went wrong. Please try again.</div>
            <button
              onClick={reset}
              className="px-8 py-4 text-xl font-bold brutal-button"
              style={{ backgroundColor: '#CCFF00', color: '#000' }}
            >
              TRY AGAIN
            </button>
          </div>
        )}
      </main>

      {/* Footer with roll button */}
      {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
        <footer className="w-full max-w-md mt-4">
          <button
            onClick={() => {
              if (stage === 'idle') {
                setShouldSpin(true);
                // Reset the trigger after a short delay
                setTimeout(() => setShouldSpin(false), 100);
              }
            }}
            disabled={stage !== 'idle'}
            className={`
              w-full py-6 text-3xl font-bold brutal-button
              ${stage === 'idle'
                ? ''
                : 'bg-gray-600 text-gray-400'
              }
            `}
            style={
              stage === 'idle'
                ? { backgroundColor: '#CCFF00', color: '#000' }
                : undefined
            }
          >
            {stage === 'idle' ? 'ROLL' : 'SPINNING...'}
          </button>

          <div className="mt-4 flex justify-center gap-6 text-white text-sm opacity-50">
            <div className="text-center">
              <div className="font-bold">COLLATERAL</div>
              <div>${collateral} USDC</div>
            </div>
            <div className="text-center">
              <div className="font-bold">BALANCE</div>
              <div>
                {usdcBalance !== null 
                  ? `$${usdcBalance.toFixed(2)} USDC`
                  : '--'
                }
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
