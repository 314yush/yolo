'use client';

import React, { useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useFundWallet } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { DEFAULT_COLLATERAL } from '@/lib/constants';

interface DepositUSDCProps {
  onDeposited: () => void;
}

export function DepositUSDC({ onDeposited }: DepositUSDCProps) {
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { balance, isLoading } = useUsdcBalance();
  const userAddress = user?.wallet?.address;

  const hasEnoughBalance = balance !== null && balance >= DEFAULT_COLLATERAL;

  const handleFundWallet = useCallback(async () => {
    if (!userAddress) return;

    try {
      await fundWallet({
        address: userAddress,
        options: {
          chain: base,
          asset: 'USDC',
          amount: String(DEFAULT_COLLATERAL),
        },
      });
    } catch (error) {
      console.error('Failed to open fund wallet:', error);
    }
  }, [fundWallet, userAddress]);

  return (
    <div className="relative flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md mx-auto w-full min-h-[60vh]">
      {/* Icon */}
      <div className="mb-6 sm:mb-8 flex items-center justify-center">
        <svg
          className="w-24 h-24 sm:w-32 sm:h-32 text-[#CCFF00]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      </div>

      {/* Title */}
      <h2 className="text-2xl sm:text-3xl font-bold text-[#CCFF00] mb-4 sm:mb-6 leading-tight">
        DEPOSIT USDC TO TRADE
      </h2>

      {/* Description */}
      <p className="text-white/80 text-base sm:text-lg mb-6 leading-relaxed max-w-sm">
        Add at least ${DEFAULT_COLLATERAL} USDC to your wallet on Base. You&apos;ll need it for collateral when you spin.
      </p>

      {/* Balance display */}
      <div
        className={`w-full py-4 px-6 mb-6 font-mono text-lg font-bold border-4 rounded-lg ${
          hasEnoughBalance ? 'bg-[#CCFF00]/20 border-[#CCFF00] text-[#CCFF00]' : 'bg-white/5 border-white/30 text-white'
        }`}
      >
        {isLoading ? (
          <span className="animate-pulse">Checking balance...</span>
        ) : (
          <>Balance: ${balance !== null ? balance.toFixed(2) : '0.00'} USDC</>
        )}
      </div>

      {hasEnoughBalance ? (
        <button
          onClick={onDeposited}
          className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
          aria-label="Continue to setup"
        >
          CONTINUE TO SETUP
        </button>
      ) : (
        <>
          <button
            onClick={handleFundWallet}
            className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
            aria-label="Add USDC to wallet"
          >
            ADD USDC
          </button>
          <p className="mt-4 text-white/40 text-xs">
            Buy with card, or transfer from another wallet or exchange
          </p>
        </>
      )}
    </div>
  );
}
