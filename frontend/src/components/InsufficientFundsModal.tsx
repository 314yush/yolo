'use client';

import React, { useCallback } from 'react';
import { useFundWallet } from '@privy-io/react-auth';
import { base } from 'viem/chains';

interface InsufficientFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredAmount: number;
  userAddress: string;
}

export function InsufficientFundsModal({
  isOpen,
  onClose,
  currentBalance,
  requiredAmount,
  userAddress,
}: InsufficientFundsModalProps) {
  const { fundWallet } = useFundWallet();
  
  const shortfall = Math.max(0, requiredAmount - currentBalance);
  const shortfallDisplay = shortfall.toFixed(2);

  const handleFundWithCard = useCallback(async () => {
    try {
      await fundWallet({
        address: userAddress,
        options: {
          chain: base,
          asset: 'USDC',
          amount: shortfallDisplay,
        },
      });
      onClose();
    } catch (error) {
      console.error('Fund wallet error:', error);
    }
  }, [fundWallet, userAddress, shortfallDisplay, onClose]);

  const handleFundFromWallet = useCallback(async () => {
    try {
      await fundWallet({
        address: userAddress,
        options: {
          chain: base,
          asset: 'USDC',
          amount: shortfallDisplay,
          defaultFundingMethod: 'wallet',
        },
      });
      onClose();
    } catch (error) {
      console.error('Fund from wallet error:', error);
    }
  }, [fundWallet, userAddress, shortfallDisplay, onClose]);

  const handleFundFromExchange = useCallback(async () => {
    try {
      await fundWallet({
        address: userAddress,
        options: {
          chain: base,
          asset: 'USDC',
          amount: shortfallDisplay,
          defaultFundingMethod: 'exchange',
        },
      });
      onClose();
    } catch (error) {
      console.error('Fund from exchange error:', error);
    }
  }, [fundWallet, userAddress, shortfallDisplay, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div 
        className="relative w-full max-w-md bg-black border-8 border-[#FF006E] font-mono"
        style={{ boxShadow: '12px 12px 0px 0px rgba(255, 0, 110, 0.5)' }}
      >
        {/* Header */}
        <div className="bg-[#FF006E] px-5 py-4 flex items-center justify-between">
          <h2 id="modal-title" className="text-black font-black text-xl uppercase tracking-tight">
            Insufficient Funds
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-black text-white font-black text-xl hover:bg-white hover:text-black transition-colors border-4 border-black"
            aria-label="Close modal"
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6">
          {/* Balance Info */}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b-2 border-[#333]">
              <span className="text-white/70 font-bold uppercase text-sm">Your Balance</span>
              <span className="text-white font-black text-lg">${currentBalance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b-2 border-[#333]">
              <span className="text-white/70 font-bold uppercase text-sm">Required</span>
              <span className="text-[#CCFF00] font-black text-lg">${requiredAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 bg-[#FF006E]/10 px-3 -mx-3 border-2 border-[#FF006E]">
              <span className="text-[#FF006E] font-bold uppercase text-sm">Shortfall</span>
              <span className="text-[#FF006E] font-black text-xl">${shortfallDisplay}</span>
            </div>
          </div>

          {/* Funding Options */}
          <div className="space-y-3">
            <p className="text-white/50 text-xs uppercase font-bold tracking-wide">
              Add funds to continue
            </p>

            {/* Buy with Card */}
            <button
              onClick={handleFundWithCard}
              className="w-full py-4 px-5 bg-[#CCFF00] text-black font-black text-base uppercase
                border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px]
                active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px]
                transition-all focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Buy USDC
              <span className="text-xs opacity-70">(Card / Apple Pay)</span>
            </button>

            {/* Transfer from Wallet */}
            <button
              onClick={handleFundFromWallet}
              className="w-full py-4 px-5 bg-[#1a1a1a] text-white font-black text-base uppercase
                border-4 border-[#CCFF00] shadow-[6px_6px_0px_0px_rgba(204,255,0,0.3)]
                hover:bg-[#2a2a2a] hover:shadow-[8px_8px_0px_0px_rgba(204,255,0,0.5)]
                active:shadow-[2px_2px_0px_0px_rgba(204,255,0,0.3)] active:translate-y-[2px]
                transition-all focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
              </svg>
              Transfer from Wallet
            </button>

            {/* Transfer from Exchange */}
            <button
              onClick={handleFundFromExchange}
              className="w-full py-4 px-5 bg-[#1a1a1a] text-white font-black text-base uppercase
                border-4 border-[#333] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                hover:bg-[#2a2a2a] hover:border-[#CCFF00] hover:shadow-[8px_8px_0px_0px_rgba(204,255,0,0.3)]
                active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px]
                transition-all focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 18V6" />
              </svg>
              Transfer from Exchange
            </button>
          </div>

          {/* Cancel Button */}
          <button
            onClick={onClose}
            className="w-full py-3 text-white/50 font-bold text-sm uppercase hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
