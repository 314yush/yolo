'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { useSound } from '@/hooks/useSound';
import { PickerWheel } from '@/components/PickerWheel';
import { PnLScreen } from '@/components/PnLScreen';
import { LoginButton } from '@/components/LoginButton';
import { SetupFlow } from '@/components/SetupFlow';
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
    reset,
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
  const { buildOpenTradeTx, buildCloseTradeTx, getTrades } = useAvantisAPI();
  const { signAndBroadcast, signAndWait } = useTxSigner();
  const { playWin } = useSound();
  
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldSpin, setShouldSpin] = useState(false);

  // Handle spin start - fire trade immediately
  const handleSpinStart = useCallback(async () => {
    // Get selection directly from store to avoid stale closure
    const storeState = useTradeStore.getState();
    const currentSelection = storeState.selection;
    
    // Get user address - from store or directly from Privy user
    const traderAddress = userAddress || (user?.wallet?.address as `0x${string}` | undefined);
    
    console.log('handleSpinStart called:', {
      traderAddress,
      delegateAddress,
      selection: currentSelection,
    });
    
    if (!traderAddress || !delegateAddress || !currentSelection) {
      console.error('Missing data for trade:', { 
        traderAddress: traderAddress || 'MISSING', 
        delegateAddress: delegateAddress || 'MISSING', 
        currentSelection: currentSelection || 'MISSING' 
      });
      return;
    }

    console.log('Opening trade with:', {
      trader: traderAddress,
      delegate: delegateAddress,
      pair: `${currentSelection.asset.name}/USD`,
      pairIndex: currentSelection.asset.pairIndex,
      leverage: currentSelection.leverage.value,
      isLong: currentSelection.direction.isLong,
      collateral: collateral,
    });

    try {
      // Build the trade transaction
      const unsignedTx = await buildOpenTradeTx({
        trader: traderAddress,
        delegate: delegateAddress,
        pair: `${currentSelection.asset.name}/USD`,
        pairIndex: currentSelection.asset.pairIndex,
        leverage: currentSelection.leverage.value,
        isLong: currentSelection.direction.isLong,
        collateral: collateral,
      });

      if (!unsignedTx) {
        setError('Failed to build trade transaction');
        setStage('error');
        return;
      }

      console.log('Built unsigned tx:', unsignedTx);

      // Sign and broadcast with delegate key
      const hash = await signAndBroadcast(unsignedTx);
      console.log('Trade tx hash:', hash);
      setTxHash(hash);
      
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
    buildOpenTradeTx,
    signAndBroadcast,
    setTxHash,
    setStage,
    setError,
  ]);

  // Handle spin complete - check trade status and show PnL
  const handleSpinComplete = useCallback(async () => {
    if (!userAddress) return;

    try {
      // Fetch trades to get the newly opened position
      const trades = await getTrades(userAddress);
      
      if (trades.length > 0) {
        // Get the most recent trade
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
      } else {
        // Trade might still be pending
        setStage('pnl');
      }
    } catch (err) {
      console.error('Failed to fetch trade:', err);
      setStage('pnl'); // Still show PnL screen, it will poll for updates
    }
  }, [userAddress, getTrades, setCurrentTrade, setPnLData, setStage, playWin]);

  // Handle close trade
  const handleCloseTrade = useCallback(async () => {
    const { currentTrade } = useTradeStore.getState();
    if (!userAddress || !delegateAddress || !currentTrade) return;

    setIsClosing(true);

    try {
      const unsignedTx = await buildCloseTradeTx(
        userAddress,
        delegateAddress,
        currentTrade.pairIndex,
        currentTrade.tradeIndex,
        currentTrade.collateral
      );

      if (!unsignedTx) {
        setError('Failed to build close transaction');
        return;
      }

      const { hash, receipt } = await signAndWait(unsignedTx);
      console.log('Trade closed:', hash, receipt);
      
      // Reset and go back to idle
      reset();
    } catch (err) {
      console.error('Close trade error:', err);
      setError(err instanceof Error ? err.message : 'Failed to close trade');
    } finally {
      setIsClosing(false);
    }
  }, [userAddress, delegateAddress, buildCloseTradeTx, signAndWait, setError, reset]);

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
        <LoginButton />
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

          <div className="mt-4 text-white text-sm opacity-50 text-center">
            COLLATERAL: ${collateral} USDC
          </div>
        </footer>
      )}
    </div>
  );
}
