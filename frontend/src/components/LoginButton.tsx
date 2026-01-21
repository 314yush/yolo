'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect } from 'react';
import { useTradeStore } from '@/store/tradeStore';

export function LoginButton() {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const { setUserAddress } = useTradeStore();

  // Update store with user address when authenticated
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      setUserAddress(user.wallet.address as `0x${string}`);
    } else {
      setUserAddress(null);
    }
  }, [authenticated, user, setUserAddress]);

  if (!ready) {
    return (
      <button
        disabled
        className="px-6 py-3 text-lg font-bold bg-gray-600 text-gray-400 brutal-button"
      >
        LOADING...
      </button>
    );
  }

  if (authenticated) {
    const displayAddress = user?.wallet?.address
      ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`
      : 'Connected';

    return (
      <div className="flex items-center gap-4">
        <span className="text-white/70 text-sm font-mono">{displayAddress}</span>
        <button
          onClick={logout}
          className="px-4 py-2 text-sm font-bold bg-white/10 text-white border-2 border-white/20 hover:bg-white/20 transition-colors"
        >
          LOGOUT
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="px-6 py-3 text-lg font-bold brutal-button"
      style={{ backgroundColor: '#CCFF00', color: '#000' }}
    >
      CONNECT
    </button>
  );
}
