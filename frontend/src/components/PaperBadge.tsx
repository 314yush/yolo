'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FileText } from 'lucide-react';

const PAPER_TRADING_TOOLTIP =
  'Practice trading with $10,000 virtual USDC and live market prices. No wallet or real money — trades are saved on this device only.';

export function PaperIcon() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="flex items-center justify-center w-6 h-6 rounded text-white/35 hover:text-[#CCFF00]/70 transition-colors touch-manipulation focus:outline-none focus:ring-1 focus:ring-[#CCFF00]/40 focus:ring-offset-1 focus:ring-offset-black"
        aria-label="Paper trading mode"
        aria-describedby={visible ? 'paper-trading-tooltip' : undefined}
      >
        <FileText className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      {visible && (
        <div
          id="paper-trading-tooltip"
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-2 px-3 py-2 text-xs font-normal leading-relaxed text-white bg-[#1a1f26] border-2 border-[#CCFF00]/50 shadow-lg w-[min(280px,calc(100vw-2rem))] animate-fade-in"
        >
          {PAPER_TRADING_TOOLTIP}
        </div>
      )}
    </div>
  );
}
