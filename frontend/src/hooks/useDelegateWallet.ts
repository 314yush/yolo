'use client';

import { useCallback } from 'react';
import {
  getOrCreateDelegateWallet,
  getDelegateAddress,
  hasDelegateWallet,
  clearDelegateWallet,
  type DelegateWallet,
} from '@/lib/delegateWallet';

// Custom hook for SSR-safe localStorage access
function useLocalStorageValue<T>(
  getValue: () => T,
  serverFallback: T
): T {
  // During SSR, return fallback
  if (typeof window === 'undefined') {
    return serverFallback;
  }
  // On client, return actual value
  return getValue();
}

export function useDelegateWallet() {
  // Get delegate address (SSR-safe)
  const delegateAddress = useLocalStorageValue<`0x${string}` | null>(
    getDelegateAddress,
    null
  );

  // Loading is always false since we read synchronously on client
  const isLoading = typeof window === 'undefined';

  // Create delegate wallet if it doesn't exist
  const ensureDelegateWallet = useCallback((): DelegateWallet => {
    return getOrCreateDelegateWallet();
  }, []);

  // Clear delegate wallet (for logout)
  const clearWallet = useCallback(() => {
    clearDelegateWallet();
    // Force re-render by triggering storage event
    window.dispatchEvent(new Event('storage'));
  }, []);

  // Check if wallet exists
  const hasWallet = useCallback(() => {
    return hasDelegateWallet();
  }, []);

  return {
    delegateAddress,
    isLoading,
    ensureDelegateWallet,
    clearWallet,
    hasWallet,
  };
}
