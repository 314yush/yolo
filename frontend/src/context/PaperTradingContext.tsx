'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { getOrCreateGuestId } from '@/lib/paperWallet';

interface PaperTradingContextValue {
  guestId: string;
  isPaperMode: true;
}

const PaperTradingContext = createContext<PaperTradingContextValue | null>(null);

export function PaperTradingProvider({ children }: { children: React.ReactNode }) {
  const guestId = useMemo(() => getOrCreateGuestId(), []);

  const value = useMemo(
    (): PaperTradingContextValue => ({ guestId, isPaperMode: true }),
    [guestId]
  );

  return (
    <PaperTradingContext.Provider value={value}>
      {children}
    </PaperTradingContext.Provider>
  );
}

export function usePaperTrading(): PaperTradingContextValue {
  const ctx = useContext(PaperTradingContext);
  if (!ctx) {
    throw new Error('usePaperTrading must be used within PaperTradingProvider');
  }
  return ctx;
}

export function useOptionalPaperTrading(): PaperTradingContextValue | null {
  return useContext(PaperTradingContext);
}
