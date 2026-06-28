'use client';

import React from 'react';

interface FinancialInfoBarProps {
  collateral: number;
  usdcBalance: number | null;
  balanceLabel?: string;
}

export function FinancialInfoBar({ collateral, usdcBalance, balanceLabel = 'BALANCE' }: FinancialInfoBarProps) {
  return (
    <div className="w-full px-4 py-1.5 border-b-2 border-white/10 bg-black/50 backdrop-blur-sm relative z-10 shrink-0">
      <div className="flex justify-center items-center gap-3 sm:gap-4 text-white/80 text-xs sm:text-sm font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-white/60 font-semibold">COLLATERAL:</span>
          <span className="text-[#CCFF00] font-bold" aria-live="polite">
            <span className="sr-only">Collateral: </span>${collateral}
          </span>
        </div>
        <div className="w-1 h-1 rounded-full bg-white/40" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <span className="text-white/60 font-semibold">{balanceLabel}:</span>
          <span className="text-[#CCFF00] font-bold" aria-live="polite">
            <span className="sr-only">Balance: </span>
            {usdcBalance !== null ? `$${usdcBalance.toFixed(2)}` : <span className="inline-block w-12 h-4 animate-shimmer rounded-sm align-middle" />}
          </span>
        </div>
      </div>
    </div>
  );
}
