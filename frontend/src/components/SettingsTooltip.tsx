'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface SettingsTooltipProps {
  text: string;
  children?: React.ReactNode;
  /** If true, wraps children with the tooltip. If false, shows inline label + icon. */
  inline?: boolean;
  label?: string;
}

/**
 * Visible tooltip with info icon. Works on hover (desktop) and tap (mobile).
 * Use for Settings page labels where native title is hard to discover.
 */
export function SettingsTooltip({ text, children, inline = false, label }: SettingsTooltipProps) {
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

  const trigger = (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[#CCFF00]/70 hover:text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black touch-manipulation"
      aria-label={`Info: ${text}`}
    >
      <Info className="w-3 h-3" strokeWidth={2.5} />
    </button>
  );

  if (inline && children) {
    return (
      <div ref={ref} className="relative inline-flex items-center gap-1">
        {children}
        {trigger}
        {visible && (
          <div
            className="absolute z-50 left-0 top-full mt-1 px-3 py-2 text-xs font-normal text-white bg-[#1a1f26] border-2 border-[#CCFF00]/50 shadow-lg max-w-[min(480px,95vw)] animate-fade-in"
            role="tooltip"
          >
            {text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      {label && <span className="text-[#CCFF00] text-[10px] font-bold uppercase">{label}</span>}
      {trigger}
      {visible && (
        <div
          className="absolute z-50 left-0 top-full mt-1 px-3 py-2 text-xs font-normal text-white bg-[#1a1f26] border-2 border-[#CCFF00]/50 shadow-lg max-w-[min(480px,95vw)] animate-fade-in"
          role="tooltip"
        >
          {text}
        </div>
      )}
    </div>
  );
}
