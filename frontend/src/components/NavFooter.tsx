'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Dice5, Settings } from 'lucide-react';

interface NavFooterProps {
  openTradesCount: number;
  showRollButton?: boolean;
  rollButton?: React.ReactNode;
  warnOnNavigate?: boolean;
}

export function NavFooter({ openTradesCount, showRollButton, rollButton, warnOnNavigate }: NavFooterProps) {
  const handleNavClick = (e: React.MouseEvent) => {
    if (warnOnNavigate && !window.confirm('A trade is in progress. Leave this page anyway?')) {
      e.preventDefault();
    }
  };

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 bg-black/95 border-t-4 border-[#CCFF00]/20 backdrop-blur-md z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="px-4 pt-3 pb-2 max-w-lg mx-auto space-y-2">
        {showRollButton && rollButton && <div>{rollButton}</div>}

        <nav className="flex justify-around items-center py-1.5" aria-label="Main navigation" role="navigation">
          <Link
            href="/"
            className="p-2 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label="Home"
          >
            <Dice5 className="w-5 h-5 text-[#CCFF00]" strokeWidth={2.5} />
          </Link>
          <Link
            href="/activity"
            onClick={handleNavClick}
            className="relative p-2 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label={`Activity${openTradesCount > 0 ? `, ${openTradesCount} open trade${openTradesCount !== 1 ? 's' : ''}` : ''}`}
          >
            <Activity className="w-5 h-5 text-[#CCFF00]" strokeWidth={2.5} />
            {openTradesCount > 0 && (
              <span
                className="absolute top-0 right-0 bg-[#FF006E] text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center border-2 border-black animate-danger-pulse"
                style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)' }}
              >
                <span className="sr-only">{openTradesCount}</span>
                <span aria-hidden="true">{openTradesCount}</span>
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            onClick={handleNavClick}
            className="p-2 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5 text-[#CCFF00]" strokeWidth={2.5} />
          </Link>
        </nav>
      </div>
    </footer>
  );
}
