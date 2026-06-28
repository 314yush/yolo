'use client';

import React from 'react';

interface PaperInsufficientFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredAmount: number;
  onResetBalance: () => void;
}

export function PaperInsufficientFundsModal({
  isOpen,
  onClose,
  currentBalance,
  requiredAmount,
  onResetBalance,
}: PaperInsufficientFundsModalProps) {
  if (!isOpen) return null;

  const shortfall = Math.max(0, requiredAmount - currentBalance);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-md bg-black border-8 border-[#FF006E] font-mono"
        style={{ boxShadow: '12px 12px 0px 0px rgba(255, 0, 110, 0.5)' }}
      >
        <div className="bg-[#FF006E] px-5 py-4 flex items-center justify-between">
          <h2 id="paper-modal-title" className="text-black font-black text-xl uppercase tracking-tight">
            Insufficient Paper Balance
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-black text-white font-black text-xl hover:bg-white hover:text-black transition-colors border-4 border-black"
            aria-label="Close modal"
          >
            X
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b-2 border-[#333]">
              <span className="text-white/70 font-bold uppercase text-sm">Paper Balance</span>
              <span className="text-white font-black text-lg">${currentBalance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b-2 border-[#333]">
              <span className="text-white/70 font-bold uppercase text-sm">Required</span>
              <span className="text-[#CCFF00] font-black text-lg">${requiredAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 bg-[#FF006E]/10 px-3 -mx-3 border-2 border-[#FF006E]">
              <span className="text-[#FF006E] font-bold uppercase text-sm">Shortfall</span>
              <span className="text-[#FF006E] font-black text-xl">${shortfall.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => {
              onResetBalance();
              onClose();
            }}
            className="w-full py-4 px-5 bg-[#CCFF00] text-black font-black text-base uppercase
              border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
              hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px]
              active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px]
              transition-all"
          >
            Reset Paper Balance ($10,000)
          </button>

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
