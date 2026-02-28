'use client';

import { useFundWallet } from '@privy-io/react-auth';
import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useRef, useState } from 'react';
import { base } from 'viem/chains';
import { useTradeStore } from '@/store/tradeStore';

export function LoginButton() {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { setUserAddress } = useTradeStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Update store with user address when authenticated
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      setUserAddress(user.wallet.address as `0x${string}`);
    } else {
      setUserAddress(null);
    }
  }, [authenticated, user, setUserAddress]);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  async function handleCopyAddress() {
    if (!user?.wallet?.address) return;

    try {
      await navigator.clipboard.writeText(user.wallet.address);
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 1400);
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }

  async function handleFundWallet() {
    if (!user?.wallet?.address) return;

    try {
      await fundWallet({
        address: user.wallet.address,
        options: {
          chain: base,
          asset: 'USDC',
        },
      });
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Failed to open fund wallet:', error);
    }
  }

  if (!ready) {
    return (
      <button
        disabled
        className="px-5 sm:px-6 py-2.5 sm:py-3 text-base sm:text-lg font-bold bg-gray-600 text-gray-400 brutal-button min-h-[44px] touch-manipulation"
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
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden sm:block" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="text-white/70 text-xs sm:text-sm font-mono hover:text-white transition-colors"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label="Wallet actions"
          >
            {displayAddress}
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] min-w-[190px] bg-[#0B1220] border-2 border-white/30 shadow-lg z-50 p-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleCopyAddress}
                className="w-full text-left px-3 py-2 text-xs font-mono text-white hover:bg-white/10 transition-colors"
              >
                {isCopying ? 'Address copied' : 'Copy wallet address'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleFundWallet}
                className="w-full text-left px-3 py-2 text-xs font-mono text-[#CCFF00] hover:bg-white/10 transition-colors"
              >
                Fund wallet (Privy)
              </button>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold font-mono bg-[#111827] text-white border-4 border-white hover:bg-[#1a1a1a] transition-colors touch-manipulation min-h-[44px]"
        >
          LOGOUT
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="px-5 sm:px-6 py-2.5 sm:py-3 text-base sm:text-lg font-black font-mono uppercase tracking-tighter bg-[#CCFF00] text-black border-4 border-black hover:opacity-90 transition-opacity touch-manipulation min-h-[44px]"
    >
      SIGN IN
    </button>
  );
}
