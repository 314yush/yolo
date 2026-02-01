'use client';

import React from 'react';

export function AvantisFooter() {
  return (
    <footer className="mt-auto pt-8 pb-6 sm:pt-10 sm:pb-8 flex items-center justify-center safe-area-bottom">
      <a
        href="https://avantisfi.com"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 transition-all duration-200 touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black rounded-none"
        aria-label="Visit Avantis Finance website - Built on Avantis"
      >
        <span className="text-white/50 group-hover:text-white/70 text-xs sm:text-sm font-mono uppercase tracking-wider font-bold transition-colors duration-200">
          built on
        </span>
        <div className="relative flex items-center">
          <img
            src="/avantis-logo.svg"
            alt="Avantis"
            className="h-5 sm:h-6 w-auto transition-all duration-200 group-hover:brightness-110 group-hover:drop-shadow-[0_0_8px_rgba(204,255,0,0.3)]"
          />
        </div>
      </a>
    </footer>
  );
}
