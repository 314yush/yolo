'use client';

import React, { useEffect, useState } from 'react';
import { useFundWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { base } from 'viem/chains';
import { useTradeStore } from '@/store/tradeStore';
import {
  COLLATERAL_PRESETS,
  MAX_COLLATERAL,
  MIN_COLLATERAL,
  formatWalletAddress,
  loadSettings,
  saveSettings,
} from '@/lib/settings';
import { loadStats } from '@/lib/stats';
import { AvantisFooter } from '@/components/AvantisFooter';
import type { Settings } from '@/types';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { wallets } = useWallets();
  const { userAddress, setSettings, setCollateral, setTradeStats } = useTradeStore();
  // Use lazy initialization to avoid setState in effect
  const [localSettings, setLocalSettings] = useState<Settings>(() => loadSettings());
  const [customInputValue, setCustomInputValue] = useState<string>('');
  const [customInputError, setCustomInputError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const walletAddress = user?.wallet?.address ?? userAddress ?? '';
  const displayAddress = formatWalletAddress(walletAddress, 6, 4);
  const linkedAccountTypes = Array.from(
    new Set(
      (user?.linkedAccounts ?? [])
        .map((account) => account.type)
        .filter((value) => typeof value === 'string')
    )
  );
  const activeWallet = wallets.find((wallet) => {
    if (!walletAddress) return false;
    return wallet.address.toLowerCase() === walletAddress.toLowerCase();
  });
  const walletProviderLabel = activeWallet?.walletClientType || activeWallet?.connectorType || 'wallet';

  const persistSettings = (settings: Settings) => {
    setLocalSettings(settings);
    setSettings(settings);
    setCollateral(settings.collateral);
    saveSettings(settings);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1200);
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  useEffect(() => {
    // Sync loaded settings to store (localSettings already initialized)
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setCollateral(loadedSettings.collateral);
    
    const loadedStats = loadStats(userAddress ?? undefined);
    setTradeStats(loadedStats);
  }, [userAddress, setSettings, setCollateral, setTradeStats]);

  const handleCollateralChange = (value: number) => {
    persistSettings({ ...localSettings, collateral: value });
  };

  const handleAudioToggle = (enabled: boolean) => {
    persistSettings({ ...localSettings, audioEnabled: enabled });
  };

  const handleMusicToggle = (enabled: boolean) => {
    persistSettings({ ...localSettings, musicEnabled: enabled });
  };

  const handleCopyWalletAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1200);
    } catch (error) {
      console.error('Failed to copy wallet address:', error);
    }
  };

  const handleFundWallet = async () => {
    if (!walletAddress) return;
    try {
      await fundWallet({
        address: walletAddress,
        options: {
          chain: base,
          asset: 'USDC',
        },
      });
    } catch (error) {
      console.error('Failed to open fund wallet flow:', error);
    }
  };

  const handleCustomCollateralInput = (value: string) => {
    setCustomInputValue(value);
    setCustomInputError(null);

    // Allow empty input (user clearing the field)
    if (value === '') {
      return;
    }

    // Check for non-numeric characters
    if (!/^\d+$/.test(value)) {
      setCustomInputError('Whole numbers only');
      return;
    }

    const num = parseInt(value, 10);

    // Validate range
    if (num < MIN_COLLATERAL) {
      setCustomInputError(`Minimum $${MIN_COLLATERAL}`);
      return;
    }

    if (num > MAX_COLLATERAL) {
      setCustomInputError(`Maximum $${MAX_COLLATERAL}`);
      return;
    }

    // Valid input - apply it
    handleCollateralChange(num);
  };

  const handleCustomCollateralBlur = () => {
    // On blur, if the input is empty or invalid, reset to current collateral
    if (customInputValue === '' || customInputError) {
      setCustomInputValue('');
      setCustomInputError(null);
    }
  };

  // Check if current collateral matches a preset
  const isCustomValue = !COLLATERAL_PRESETS.some((preset) => preset === localSettings.collateral);

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-md mx-auto w-full">
      {/* Header - Improved consistency */}
      <header className="w-full mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleBack}
            className="text-[#CCFF00] text-sm sm:text-base font-bold touch-manipulation min-h-[44px] flex items-center px-3 sm:px-4 py-2 border-4 border-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
            style={{ boxShadow: '4px 4px 0px 0px rgba(204, 255, 0, 0.5)' }}
            aria-label="Go back"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="whitespace-nowrap">BACK</span>
          </button>
          <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-black uppercase tracking-tight">Settings</h1>
          <div className="w-16 sm:w-20" />
        </div>
      </header>

      {/* Settings content */}
      <main className="flex-1 flex flex-col gap-8 sm:gap-10 max-w-md mx-auto w-full overflow-y-auto min-h-0 pb-4">
        {/* ACCOUNT */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-wide">Account</h2>
            <span
              className={`text-xs sm:text-sm font-bold uppercase tracking-wide transition-colors ${
                saveStatus === 'saved' ? 'text-[#CCFF00]' : 'text-white/40'
              }`}
              aria-live="polite"
            >
              {saveStatus === 'saved' ? 'Saved' : 'Synced'}
            </span>
          </div>

          <div className="brutal-card p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-white/50 text-xs uppercase font-bold tracking-wide">Wallet Address</p>
                <p className="text-white text-lg sm:text-xl font-black mt-1 break-all">{displayAddress || '--'}</p>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold uppercase border-2 border-[#CCFF00]/50 text-[#CCFF00] bg-[#CCFF00]/10">
                {walletProviderLabel}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {linkedAccountTypes.length > 0 ? (
                linkedAccountTypes.map((accountType) => (
                  <span
                    key={accountType}
                    className="px-2.5 py-1 text-[11px] sm:text-xs font-bold uppercase border-2 border-white/20 text-white/70 bg-white/5"
                  >
                    {accountType.replace(/_/g, ' ')}
                  </span>
                ))
              ) : (
                <span className="px-2.5 py-1 text-[11px] sm:text-xs font-bold uppercase border-2 border-white/20 text-white/70 bg-white/5">
                  Wallet login
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleCopyWalletAddress}
                disabled={!walletAddress}
                className="py-3 px-4 text-sm sm:text-base font-black uppercase border-4 border-[#CCFF00] text-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
              >
                {copyStatus === 'copied' ? 'Copied' : 'Copy address'}
              </button>
              <button
                onClick={handleFundWallet}
                disabled={!walletAddress}
                className="py-3 px-4 text-sm sm:text-base font-black uppercase border-4 border-black text-black bg-[#CCFF00] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
              >
                Fund wallet
              </button>
            </div>
          </div>
        </section>
        
        {/* COLLATERAL SIZE - Control panel redesign */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-wide">Collateral Size</h2>
            <div className="text-[11px] sm:text-xs uppercase tracking-widest text-white/40 font-bold">Trade sizing</div>
          </div>

          <div className="rounded-sm border-2 border-[#CCFF00]/30 bg-linear-to-b from-[#0d1117] to-[#090c10] p-4 sm:p-5 shadow-[0_0_0_1px_rgba(204,255,0,0.12),0_14px_40px_rgba(0,0,0,0.45)] space-y-4">
            <div className="rounded-sm border border-[#CCFF00]/25 bg-black/60 px-4 py-3">
              <p className="text-[11px] sm:text-xs uppercase tracking-[0.2em] text-[#CCFF00]/65 font-bold">Current Stake</p>
              <div className="mt-1 flex items-end justify-between">
                <p className="text-[#CCFF00] text-4xl sm:text-5xl font-black leading-none">${localSettings.collateral}</p>
                <p className="text-white/40 text-xs sm:text-sm font-bold uppercase">USDC</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
            {COLLATERAL_PRESETS.map((preset) => {
              const isSelected = localSettings.collateral === preset;
              return (
                <button
                  key={preset}
                  onClick={() => {
                    handleCollateralChange(preset);
                    setCustomInputValue('');
                    setCustomInputError(null);
                  }}
                  className={`
                    relative overflow-hidden py-3 sm:py-4 text-sm sm:text-base font-black touch-manipulation min-h-[56px] sm:min-h-[64px]
                    border-2 transition-all font-mono
                    focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${isSelected
                      ? 'bg-[#CCFF00] text-black border-[#CCFF00] shadow-[0_0_20px_rgba(204,255,0,0.28)]'
                      : 'bg-[#151a21] text-white border-white/15 hover:border-[#CCFF00]/40 hover:bg-[#1b212a] hover:-translate-y-px'
                    }
                  `}
                  aria-pressed={isSelected}
                  aria-label={`Set collateral to $${preset}`}
                >
                  ${preset}
                </button>
              );
            })}
            </div>

            {/* Custom Collateral Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-white/70 text-xs sm:text-sm font-bold uppercase tracking-wide">
                  Custom Amount
                </label>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-white/45">
                  <span>Min ${MIN_COLLATERAL}</span>
                  <span>•</span>
                  <span>Max ${MAX_COLLATERAL}</span>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45 font-black text-lg">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={customInputValue}
                  onChange={(e) => handleCustomCollateralInput(e.target.value)}
                  onBlur={handleCustomCollateralBlur}
                  placeholder={isCustomValue ? String(localSettings.collateral) : 'Type amount'}
                  className={`
                    w-full rounded-sm py-3.5 sm:py-4 pl-9 pr-4 text-lg sm:text-xl font-black font-mono
                    bg-[#11151b] text-white placeholder-white/25
                    border-2 transition-all
                    focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${customInputError
                      ? 'border-[#FF006E] shadow-[0_0_0_1px_rgba(255,0,110,0.2)]'
                      : isCustomValue
                        ? 'border-[#CCFF00] shadow-[0_0_0_1px_rgba(204,255,0,0.15)]'
                        : 'border-white/15'
                    }
                  `}
                  aria-label="Enter custom collateral amount"
                  aria-describedby={customInputError ? 'collateral-error' : 'collateral-hint'}
                />
              </div>
            </div>
            {customInputError ? (
              <p id="collateral-error" className="text-[#FF006E] text-xs sm:text-sm font-bold" role="alert">
                {customInputError}
              </p>
            ) : (
              <p id="collateral-hint" className="text-white/40 text-xs sm:text-sm">
                Whole numbers only. Updates instantly.
              </p>
            )}
          </div>
        </section>

        {/* AUDIO - Segmented switch redesign */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-wide">Audio</h2>
            <div className="text-[11px] sm:text-xs uppercase tracking-widest text-white/40 font-bold">Output control</div>
          </div>
          
          {/* Sound Effects Toggle */}
          <div className="rounded-sm border-2 border-white/15 bg-linear-to-b from-[#0e1420] to-[#0a0f17] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-base sm:text-lg mb-1 uppercase tracking-wide">Sound Effects</div>
                <div className="text-white/50 text-xs sm:text-sm leading-relaxed">Wheel, flip, win/loss feedback</div>
              </div>
              <div className="shrink-0 w-full sm:w-auto rounded-sm border-2 border-[#CCFF00]/35 bg-black/40 p-1 grid grid-cols-2 gap-1 min-w-[160px]">
                <button
                  onClick={() => handleAudioToggle(true)}
                  className={`
                    py-2.5 px-4 text-sm font-black uppercase transition-all
                    focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${localSettings.audioEnabled
                      ? 'bg-[#CCFF00] text-black'
                      : 'text-[#CCFF00] hover:bg-[#CCFF00]/10'
                    }
                  `}
                  aria-pressed={localSettings.audioEnabled}
                  aria-label="Enable sound effects"
                >
                  ON
                </button>
                <button
                  onClick={() => handleAudioToggle(false)}
                  className={`
                    py-2.5 px-4 text-sm font-black uppercase transition-all
                    focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${!localSettings.audioEnabled
                      ? 'bg-[#CCFF00] text-black'
                      : 'text-[#CCFF00] hover:bg-[#CCFF00]/10'
                    }
                  `}
                  aria-pressed={!localSettings.audioEnabled}
                  aria-label="Disable sound effects"
                >
                  OFF
                </button>
              </div>
            </div>
          </div>

          {/* Music Toggle */}
          <div className="rounded-sm border-2 border-white/15 bg-linear-to-b from-[#0e1420] to-[#0a0f17] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-base sm:text-lg mb-1 uppercase tracking-wide">Background Music</div>
                <div className="text-white/50 text-xs sm:text-sm leading-relaxed">Ambient loop during gameplay</div>
              </div>
              <div className="shrink-0 w-full sm:w-auto rounded-sm border-2 border-[#CCFF00]/35 bg-black/40 p-1 grid grid-cols-2 gap-1 min-w-[160px]">
                <button
                  onClick={() => handleMusicToggle(true)}
                  className={`
                    py-2.5 px-4 text-sm font-black uppercase transition-all
                    focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${localSettings.musicEnabled
                      ? 'bg-[#CCFF00] text-black'
                      : 'text-[#CCFF00] hover:bg-[#CCFF00]/10'
                    }
                  `}
                  aria-pressed={localSettings.musicEnabled}
                  aria-label="Enable background music"
                >
                  ON
                </button>
                <button
                  onClick={() => handleMusicToggle(false)}
                  className={`
                    py-2.5 px-4 text-sm font-black uppercase transition-all
                    focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${!localSettings.musicEnabled
                      ? 'bg-[#CCFF00] text-black'
                      : 'text-[#CCFF00] hover:bg-[#CCFF00]/10'
                    }
                  `}
                  aria-pressed={!localSettings.musicEnabled}
                  aria-label="Disable background music"
                >
                  OFF
                </button>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <AvantisFooter />
    </div>
  );
}
