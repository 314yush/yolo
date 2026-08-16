'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useBatchedSetup } from '@/hooks/useBatchedSetup';
import { markOnboardingCompleteApi } from '@/lib/activityApi';
import { debug } from '@/lib/debug';

interface SetupFlowProps {
  onSetupComplete: () => void;
}

type SetupStep = 'checking' | 'setup' | 'complete';

/**
 * The only on-chain prerequisite for trading on v2 is the USDC allowance.
 * Trades are EIP-712 intents signed by the user's own embedded wallet, so
 * there is no delegate to register and nothing to re-authorize later.
 */
export function SetupFlow({ onSetupComplete }: SetupFlowProps) {
  const { user, ready: privyReady } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const setSetupStatus = useTradeStore((s) => s.setSetupStatus);
  const { checkUsdcAllowance } = useAvantisAPI();
  const { executeBatchedSetup, isProcessing: isApproving, setupStatus } = useBatchedSetup();

  const [step, setStep] = useState<SetupStep>('checking');
  const [error, setError] = useState<string | null>(null);

  const userAddress = user?.wallet?.address as `0x${string}` | undefined;

  const markReady = useCallback(() => {
    if (!userAddress) return;
    setSetupStatus({ isSetup: true, usdcApproved: true });
    setStep('complete');
    markOnboardingCompleteApi(userAddress);
    onSetupComplete();
  }, [userAddress, setSetupStatus, onSetupComplete]);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (!userAddress || !privyReady || !walletsReady) return;

      setStep('checking');
      setError(null);

      const allowance = await checkUsdcAllowance(userAddress).catch((err) => {
        console.warn('USDC allowance check failed:', err);
        return { hasSufficient: false, allowance: 0 };
      });
      if (cancelled) return;

      debug('USDC allowance check:', allowance);
      if (allowance.hasSufficient) {
        markReady();
      } else {
        setStep('setup');
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
    // Re-run only on identity/readiness changes, not when callbacks re-create.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, privyReady, walletsReady]);

  const handleApprove = useCallback(async () => {
    if (!userAddress) {
      setError('User address not available');
      return;
    }

    setError(null);
    const result = await executeBatchedSetup(userAddress);
    if (!result.success) {
      setError(result.error || 'Failed to approve USDC');
      return;
    }

    // Confirm on-chain rather than trusting the receipt, so a dropped or
    // replaced approval can't leave the user stuck at the first trade.
    for (let attempt = 0; attempt < 30; attempt++) {
      const allowance = await checkUsdcAllowance(userAddress).catch(() => ({
        hasSufficient: false,
        allowance: 0,
      }));
      if (allowance.hasSufficient) {
        markReady();
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    setError('Approval is taking longer than expected. Please try again.');
  }, [userAddress, executeBatchedSetup, checkUsdcAllowance, markReady]);

  if (!privyReady || !walletsReady) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">INITIALIZING...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">CHECKING SETUP...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'complete') {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-lg mx-auto w-full">
      <div className="text-2xl sm:text-3xl font-bold text-[#CCFF00] mb-6 sm:mb-8">ONE LAST STEP</div>

      <div className="text-white text-base sm:text-lg mb-4 leading-relaxed">
        Approve USDC so YOLO can open positions for you.
      </div>
      <div className="text-white/60 text-sm sm:text-base mb-6 sm:mb-8 leading-relaxed">
        One-time, gas-free, and your funds stay in your wallet. Every trade after
        this is signed instantly with no pop-ups.
      </div>

      {setupStatus && (
        <div className="mb-4 p-3 bg-[#CCFF00]/10 border-2 border-[#CCFF00]/30 text-[#CCFF00] text-sm font-mono rounded-lg">
          {setupStatus}
        </div>
      )}

      <button
        onClick={handleApprove}
        disabled={isApproving}
        className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button disabled:opacity-50 bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
      >
        {isApproving ? setupStatus || 'APPROVING...' : 'APPROVE USDC'}
      </button>

      {error && (
        <div className="mt-6 p-4 bg-red-500/20 border-2 border-red-500 text-red-400 text-sm sm:text-base rounded-lg max-w-md">
          <div className="whitespace-pre-wrap break-words">{error}</div>
        </div>
      )}
    </div>
  );
}
