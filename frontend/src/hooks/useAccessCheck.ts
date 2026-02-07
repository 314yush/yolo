'use client';

import { useState, useEffect, useCallback } from 'react';
import { hasLocalAccess, setLocalAccess, checkWalletAccess } from '@/lib/access';

interface UseAccessCheckReturn {
  hasAccess: boolean | null;
  isChecking: boolean;
  grantAccess: (walletAddress: string) => void;
}

/**
 * Hook to check if user has access to the app.
 * Checks localStorage first (fast), then API (for multi-device support).
 */
export function useAccessCheck(walletAddress: string | null): UseAccessCheckReturn {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function check() {
      // 1. First check localStorage (fast path) - per-wallet
      if (walletAddress && hasLocalAccess(walletAddress)) {
        setHasAccess(true);
        setIsChecking(false);
        return;
      }

      // 2. If no wallet connected yet, we can't check API
      if (!walletAddress) {
        setHasAccess(false);
        setIsChecking(false);
        return;
      }

      // 3. Check API (wallet might have access from another device)
      setIsChecking(true);
      try {
        const walletHasAccess = await checkWalletAccess(walletAddress);
        
        if (walletHasAccess) {
          // Cache it locally for fast access next time (per-wallet)
          setLocalAccess(walletAddress);
          setHasAccess(true);
        } else {
          setHasAccess(false);
        }
      } catch (error) {
        console.error('Access check error:', error);
        setHasAccess(false);
      } finally {
        setIsChecking(false);
      }
    }

    check();
  }, [walletAddress]);

  // Function to grant access (called after successful code redemption)
  const grantAccess = useCallback((walletAddress: string) => {
    setLocalAccess(walletAddress);
    setHasAccess(true);
  }, []);

  return { hasAccess, isChecking, grantAccess };
}
