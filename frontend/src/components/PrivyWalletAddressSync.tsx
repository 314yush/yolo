'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';

/** Keeps tradeStore.userAddress in sync with Privy on every route (including cold loads). */
export function PrivyWalletAddressSync() {
  const { authenticated, user, ready } = usePrivy();
  const setUserAddress = useTradeStore((s) => s.setUserAddress);

  useEffect(() => {
    if (!ready) return;
    if (authenticated && user?.wallet?.address) {
      setUserAddress(user.wallet.address as `0x${string}`);
    } else if (!authenticated) {
      setUserAddress(null);
    }
  }, [ready, authenticated, user, setUserAddress]);

  return null;
}
