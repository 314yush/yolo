'use client';

import { useFundWallet } from '@privy-io/react-auth';
import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useRef, useState } from 'react';
import { base } from 'viem/chains';
import { useTradeStore } from '@/store/tradeStore';
import { LogOut, Copy, Wallet, Check, ChevronDown } from 'lucide-react';

interface LoginButtonProps {
  label?: string;
  variant?: 'default' | 'glow';
}

export function LoginButton({ label = 'SIGN IN', variant = 'default' }: LoginButtonProps) {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { reset } = useTradeStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  async function handleLogout() {
    reset();
    // Don't clear delegate wallet - same user logging back in should reuse it
    await logout();
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
      <div className="flex items-center gap-2">
        {/* Wallet Address Dropdown - Desktop only */}
        <div className="relative hidden sm:block" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold bg-black/60 text-[#CCFF00] border-2 border-[#CCFF00]/30 hover:border-[#CCFF00]/60 transition-all touch-manipulation min-h-[44px] backdrop-blur-sm"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label="Wallet actions"
            style={{
              boxShadow: '2px 2px 0px 0px rgba(204, 255, 0, 0.3)',
            }}
          >
            <Wallet className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>{displayAddress}</span>
            <ChevronDown 
              className={`w-3 h-3 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`}
              strokeWidth={2.5}
            />
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] min-w-[200px] bg-black border-4 border-[#CCFF00] z-50 animate-fade-in"
              style={{
                boxShadow: '6px 6px 0px 0px rgba(204, 255, 0, 0.4)',
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleCopyAddress}
                className="w-full flex items-center gap-2 px-4 py-3 text-xs font-mono font-bold text-white hover:bg-[#CCFF00]/10 transition-colors border-b-2 border-[#CCFF00]/20"
              >
                {isCopying ? (
                  <>
                    <Check className="w-4 h-4 text-[#CCFF00]" strokeWidth={2.5} />
                    <span className="text-[#CCFF00]">COPIED!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" strokeWidth={2.5} />
                    <span>COPY ADDRESS</span>
                  </>
                )}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleFundWallet}
                className="w-full flex items-center gap-2 px-4 py-3 text-xs font-mono font-bold text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-colors"
              >
                <Wallet className="w-4 h-4" strokeWidth={2.5} />
                <span>FUND WALLET</span>
              </button>
            </div>
          )}
        </div>

        {/* Logout Button - Clean icon-only */}
        <button
          onClick={handleLogout}
          className="group p-2.5 bg-black/60 text-white/70 border-2 border-white/20 hover:border-white/40 hover:text-white touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center transition-all duration-200 backdrop-blur-sm"
          style={{
            boxShadow: '2px 2px 0px 0px rgba(255, 255, 255, 0.1)',
          }}
          aria-label="Logout from YOLO"
        >
          <LogOut className="w-4 h-4 group-hover:translate-x-[1px] transition-transform duration-200" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  const isGlow = variant === 'glow';

  return (
    <button
      onClick={login}
      className={
        isGlow
          ? 'group relative px-8 sm:px-10 py-4 sm:py-5 text-lg sm:text-xl font-black font-mono uppercase tracking-tight bg-[#CCFF00] text-black border-4 border-[#CCFF00]/80 touch-manipulation min-h-[56px] transition-all duration-200 rounded-lg hover:opacity-95'
          : 'group relative px-6 sm:px-8 py-3 sm:py-4 text-lg sm:text-xl font-black font-mono uppercase tracking-tight bg-[#CCFF00] text-black border-8 border-black touch-manipulation min-h-[56px] transition-all duration-200 hover:translate-x-[-4px] hover:translate-y-[-4px] active:translate-x-[4px] active:translate-y-[4px]'
      }
      style={
        isGlow
          ? {
              boxShadow:
                '0 0 30px rgba(204,255,0,0.6), 0 0 60px rgba(204,255,0,0.3), inset 0 0 20px rgba(255,255,255,0.1)',
            }
          : {
              boxShadow: '8px 8px 0px 0px rgba(0, 0, 0, 1)',
            }
      }
      aria-label={`${label} - Sign in to YOLO`}
    >
      {/* Animated shine effect on hover */}
      {!isGlow && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-none"
          style={{
            background: 'linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shine 1.5s infinite',
          }}
        />
      )}

      {/* Content */}
      <span className="relative flex items-center justify-center gap-2">
        <Wallet className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-200" strokeWidth={3} />
        <span>{label}</span>
      </span>
    </button>
  );
}
