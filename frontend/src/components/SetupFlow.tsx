'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { usePrivyEmbeddedWallet } from '@/hooks/usePrivyEmbeddedWallet';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { debug } from '@/lib/debug';

interface SetupFlowProps {
  onSetupComplete: () => void;
}

type SetupStep = 'checking' | 'deposit' | 'complete';

export function SetupFlow({ onSetupComplete }: SetupFlowProps) {
  const { ready: privyReady } = usePrivy();
  const { address: embeddedAddress, isReady: walletReady } = usePrivyEmbeddedWallet();
  const { setDelegateStatus } = useTradeStore();
  const { balance: usdcBalance, refetch: refetchBalance } = useUsdcBalance();

  const [step, setStep] = useState<SetupStep>('checking');
  const [copied, setCopied] = useState(false);

  // Check if embedded wallet has USDC
  useEffect(() => {
    if (!privyReady || !walletReady || !embeddedAddress) return;

    debug('[SetupFlow] Embedded wallet:', embeddedAddress, 'USDC balance:', usdcBalance);

    if (usdcBalance !== null && usdcBalance > 0) {
      // Has USDC — setup complete
      setDelegateStatus({
        isSetup: true,
        usdcApproved: false, // Will be handled on first trade via batch
      });
      setStep('complete');
      onSetupComplete();
    } else if (usdcBalance !== null) {
      // Balance loaded but zero
      setStep('deposit');
    }
    // If balance is null, still loading — stay on 'checking'
  }, [privyReady, walletReady, embeddedAddress, usdcBalance, setDelegateStatus, onSetupComplete]);

  // Copy address to clipboard
  const handleCopy = useCallback(() => {
    if (!embeddedAddress) return;
    navigator.clipboard.writeText(embeddedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [embeddedAddress]);

  // Show loading while Privy/wallets are initializing
  if (!privyReady || !walletReady) {
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
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">CHECKING BALANCE...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'complete') {
    return null;
  }

  // Deposit screen
  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-md mx-auto w-full">
      <div className="text-2xl sm:text-3xl font-bold text-[#CCFF00] mb-6 sm:mb-8">FUND YOUR WALLET</div>

      <div className="text-white text-base sm:text-lg mb-4 leading-relaxed">
        Send USDC on Base to your trading wallet to start trading.
      </div>

      <div className="text-white/60 text-sm sm:text-base mb-6 sm:mb-8 leading-relaxed">
        This is your personal embedded wallet. No signatures or approvals needed — just deposit USDC and trade.
      </div>

      {/* Wallet address with copy */}
      <div className="w-full mb-6">
        <div className="text-white/50 text-xs uppercase tracking-wide mb-2">Your Trading Wallet</div>
        <div
          className="flex items-center gap-2 p-3 bg-white/5 border-2 border-white/20 rounded-lg cursor-pointer hover:border-[#CCFF00]/50 transition-colors"
          onClick={handleCopy}
        >
          <code className="text-[#CCFF00] text-sm font-mono flex-1 break-all">
            {embeddedAddress}
          </code>
          <button
            className="shrink-0 px-3 py-1 text-xs font-bold bg-[#CCFF00] text-black rounded"
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          >
            {copied ? 'COPIED!' : 'COPY'}
          </button>
        </div>
        <div className="text-white/40 text-xs mt-2">
          Network: Base (Chain ID: 8453) &bull; Token: USDC
        </div>
      </div>

      {/* Balance display */}
      <div className="w-full mb-6 p-3 bg-white/5 border-2 border-white/20 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-white/50 text-sm">USDC Balance</span>
          <span className="text-[#CCFF00] font-bold font-mono">
            {usdcBalance !== null ? `$${usdcBalance.toFixed(2)}` : '...'}
          </span>
        </div>
      </div>

      {/* Refresh button */}
      <button
        onClick={refetchBalance}
        className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
      >
        CHECK BALANCE
      </button>

      <div className="mt-4 text-white/50 text-xs leading-relaxed">
        Balance updates automatically. Once you have USDC, you can start trading immediately.
      </div>
    </div>
  );
}
