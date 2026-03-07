'use client';

import React, { useEffect, useState } from 'react';
import { useFundWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { base } from 'viem/chains';
import {
  COLLATERAL_PRESETS,
  MAX_COLLATERAL,
  MIN_COLLATERAL,
  TAKE_PROFIT_PRESETS,
  MAX_TAKE_PROFIT,
  MIN_TAKE_PROFIT,
  formatWalletAddress,
  loadSettings,
  saveSettings,
} from '@/lib/settings';
import { loadStats } from '@/lib/stats';
import { AvantisFooter } from '@/components/AvantisFooter';
import { SettingsTooltip } from '@/components/SettingsTooltip';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWithdrawUsdc } from '@/hooks/useWithdrawUsdc';
import { useTradeStore } from '@/store/tradeStore';
import type { Settings } from '@/types';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { wallets } = useWallets();
  const { userAddress, setSettings, setCollateral, setTradeStats, setTxHash } = useTradeStore();
  const [localSettings, setLocalSettings] = useState<Settings>(() => loadSettings());
  const [customInputValue, setCustomInputValue] = useState<string>('');
  const [customInputError, setCustomInputError] = useState<string | null>(null);
  const [customTpInputValue, setCustomTpInputValue] = useState<string>('');
  const [customTpInputError, setCustomTpInputError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawToAddress, setWithdrawToAddress] = useState<string>('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const { balance: privyBalance, isLoading: privyBalanceLoading, refetch: refetchPrivyBalance } = useUsdcBalance();
  const { withdraw, isPending: isWithdrawPending, error: withdrawApiError, clearError: clearWithdrawError } = useWithdrawUsdc();

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
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setCollateral(loadedSettings.collateral);
    const loadedStats = loadStats(userAddress ?? undefined);
    setTradeStats(loadedStats);
  }, [userAddress, setSettings, setCollateral, setTradeStats]);

  const handleCollateralChange = (value: number) => {
    persistSettings({ ...localSettings, collateral: value });
  };

  const handleTakeProfitChange = (value: number) => {
    persistSettings({ ...localSettings, takeProfitPercent: value });
  };

  const handleCustomTpInput = (value: string) => {
    setCustomTpInputValue(value);
    setCustomTpInputError(null);
    if (value === '') return;
    if (!/^\d+$/.test(value)) {
      setCustomTpInputError('Whole numbers only');
      return;
    }
    const num = parseInt(value, 10);
    if (num < MIN_TAKE_PROFIT) {
      setCustomTpInputError(`Min ${MIN_TAKE_PROFIT}%`);
      return;
    }
    if (num > MAX_TAKE_PROFIT) {
      setCustomTpInputError(`Max ${MAX_TAKE_PROFIT}%`);
      return;
    }
    handleTakeProfitChange(num);
  };

  const handleCustomTpBlur = () => {
    if (customTpInputValue === '' || customTpInputError) {
      setCustomTpInputValue('');
      setCustomTpInputError(null);
    }
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
        options: { chain: base, asset: 'USDC' },
      });
    } catch (error) {
      console.error('Failed to open fund wallet flow:', error);
    }
  };

  const handleWithdrawAmountChange = (value: string) => {
    setWithdrawAmount(value);
    setWithdrawError(null);
    clearWithdrawError();
  };

  const handleMaxWithdraw = () => {
    if (privyBalance !== null && privyBalance > 0) {
      setWithdrawAmount(privyBalance.toFixed(2));
      setWithdrawError(null);
      clearWithdrawError();
    }
  };

  const handleWithdrawToAddressChange = (value: string) => {
    setWithdrawToAddress(value);
    setWithdrawError(null);
    clearWithdrawError();
  };

  const handleWithdraw = async () => {
    if (!walletAddress || !withdrawToAddress.trim()) return;
    const amount = parseFloat(withdrawAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }
    if (privyBalance !== null && amount > privyBalance) {
      setWithdrawError('Amount exceeds balance');
      return;
    }
    setWithdrawError(null);
    clearWithdrawError();
    const txHashResult = await withdraw(amount, withdrawToAddress.trim() as `0x${string}`);
    if (txHashResult) {
      setTxHash(txHashResult);
      setWithdrawAmount('');
      setWithdrawToAddress('');
      refetchPrivyBalance();
    }
  };

  const withdrawAmountNum = parseFloat(withdrawAmount);
  const isWithdrawToAddressValid = withdrawToAddress.trim().length > 0 && /^0x[a-fA-F0-9]{40}$/.test(withdrawToAddress.trim());
  const isWithdrawValid =
    !Number.isNaN(withdrawAmountNum) &&
    withdrawAmountNum > 0 &&
    privyBalance !== null &&
    withdrawAmountNum <= privyBalance &&
    isWithdrawToAddressValid;

  const handleCustomCollateralInput = (value: string) => {
    setCustomInputValue(value);
    setCustomInputError(null);
    if (value === '') return;
    if (!/^\d+$/.test(value)) {
      setCustomInputError('Whole numbers only');
      return;
    }
    const num = parseInt(value, 10);
    if (num < MIN_COLLATERAL) {
      setCustomInputError(`Min $${MIN_COLLATERAL}`);
      return;
    }
    if (num > MAX_COLLATERAL) {
      setCustomInputError(`Max $${MAX_COLLATERAL}`);
      return;
    }
    handleCollateralChange(num);
  };

  const handleCustomCollateralBlur = () => {
    if (customInputValue === '' || customInputError) {
      setCustomInputValue('');
      setCustomInputError(null);
    }
  };

  const isCustomValue = !COLLATERAL_PRESETS.some((preset) => preset === localSettings.collateral);

  const btnClass = 'py-2 px-3 text-xs font-black uppercase border-2 border-[#CCFF00] text-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black';
  const btnPrimaryClass = 'py-2 px-3 text-xs font-black uppercase border-2 border-black text-black bg-[#CCFF00] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black';

  return (
    <div className="h-dvh min-h-dvh bg-black flex flex-col px-3 sm:px-4 py-3 font-mono safe-area-top safe-area-bottom max-w-md mx-auto w-full overflow-hidden">
      {/* Compact header */}
      <header className="shrink-0 flex items-center justify-between mb-3">
        <button
          onClick={handleBack}
          className={`${btnClass} min-w-[88px]`}
          style={{ boxShadow: '3px 3px 0px 0px rgba(204, 255, 0, 0.5)' }}
          aria-label="Go back"
        >
          BACK
        </button>
        <h1 className="text-[#CCFF00] text-lg font-black uppercase tracking-tight">Settings</h1>
        <span className={`text-[10px] font-bold uppercase ${saveStatus === 'saved' ? 'text-[#CCFF00]' : 'text-white/40'}`} aria-live="polite" title={saveStatus === 'saved' ? 'Settings saved to device' : 'Settings synced with app'}>
          {saveStatus === 'saved' ? 'Saved' : 'Synced'}
        </span>
      </header>

      {/* Variation C: Dashboard - single page, no scroll */}
      <main className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Hero stats strip: Balance | Stake | TP */}
        <div className="brutal-card p-3 grid grid-cols-3 gap-2 shrink-0">
          <div className="text-center border-r-2 border-white/10 pr-2">
            <SettingsTooltip text="USDC balance in your Privy wallet. Available for trading or withdrawal." inline>
              <p className="text-[#CCFF00] text-[10px] uppercase font-bold">Balance</p>
            </SettingsTooltip>
            {!walletAddress ? (
              <p className="text-white/40 text-xs font-bold">—</p>
            ) : privyBalanceLoading ? (
              <p className="text-white/40 text-sm font-black animate-pulse">...</p>
            ) : (
              <p className="text-[#CCFF00] text-base sm:text-lg font-black leading-none">${privyBalance !== null ? privyBalance.toFixed(2) : '0'}</p>
            )}
          </div>
          <div className="text-center border-r-2 border-white/10 pr-2">
            <SettingsTooltip text="Your default bet per spin. The USDC you put at risk when opening a trade." inline>
              <p className="text-[#CCFF00] text-[10px] uppercase font-bold">Stake</p>
            </SettingsTooltip>
            <p className="text-[#CCFF00] text-base sm:text-lg font-black leading-none">${localSettings.collateral}</p>
          </div>
          <div className="text-center">
            <SettingsTooltip text="Take Profit %. Net profit target (after fees) for new trades. Position closes automatically when reached." inline>
              <p className="text-[#CCFF00] text-[10px] uppercase font-bold">TP %</p>
            </SettingsTooltip>
            <p className="text-[#CCFF00] text-base sm:text-lg font-black leading-none">{localSettings.takeProfitPercent}%</p>
          </div>
        </div>

        {/* Wallet + Actions row */}
        <div className="brutal-card p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1" title="Your Privy embedded wallet address. Holds USDC for trading.">
              <p className="text-[#CCFF00] text-[10px] uppercase font-bold truncate">{displayAddress || '--'}</p>
              <span className="text-[10px] font-bold uppercase border border-[#CCFF00]/50 text-[#CCFF00] bg-[#CCFF00]/10 px-1.5 py-0.5" title="Privy embedded wallet – gasless, secure, no seed phrase.">{walletProviderLabel}</span>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={handleCopyWalletAddress} disabled={!walletAddress} className={btnClass} title="Copy full wallet address">
                {copyStatus === 'copied' ? 'Copied' : 'Copy'}
              </button>
              <button onClick={handleFundWallet} disabled={!walletAddress} className={btnPrimaryClass} title="Add USDC to your wallet via Privy">
                Fund
              </button>
            </div>
          </div>

          {/* Withdraw - compact 2 rows */}
          {walletAddress && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="flex gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/45 font-bold text-sm">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={withdrawAmount}
                    onChange={(e) => handleWithdrawAmountChange(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 pl-6 pr-2 text-sm font-black font-mono bg-[#11151b] text-white placeholder-white/25 border-2 border-white/15 focus:outline-none focus:ring-2 focus:ring-[#CCFF00]"
                    aria-label="Amount to withdraw"
                  />
                </div>
                <button onClick={handleMaxWithdraw} disabled={privyBalance === null || privyBalance <= 0} className={btnClass} title="Use your full available balance">
                  Max
                </button>
                <button onClick={handleWithdraw} disabled={!isWithdrawValid || isWithdrawPending} className={btnPrimaryClass} title="Send USDC to the recipient address. Gas sponsored.">
                  {isWithdrawPending ? '…' : 'Send'}
                </button>
              </div>
              <input
                type="text"
                value={withdrawToAddress}
                onChange={(e) => handleWithdrawToAddressChange(e.target.value)}
                placeholder="To: 0x..."
                className="w-full py-2 px-2 text-xs font-mono bg-[#11151b] text-white placeholder-white/25 border-2 border-white/15 focus:outline-none focus:ring-2 focus:ring-[#CCFF00]"
                aria-label="Recipient address"
              />
              {(withdrawError || withdrawApiError) && (
                <p className="text-[#FF006E] text-[10px] font-bold" role="alert">{withdrawError || withdrawApiError}</p>
              )}
            </div>
          )}
        </div>

        {/* Collateral + Take Profit - compact grid */}
        <div className="brutal-card p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <SettingsTooltip label="Collateral" text="The margin backing your leveraged position. Same as Stake – sets position size (Collateral × Leverage)." />
            <div className="relative w-16">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/45 font-bold text-xs">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={customInputValue}
                onChange={(e) => handleCustomCollateralInput(e.target.value)}
                onBlur={handleCustomCollateralBlur}
                placeholder={String(localSettings.collateral)}
                className={`w-full py-1.5 pl-5 pr-1 text-xs font-black font-mono bg-[#11151b] text-white placeholder-white/25 border focus:outline-none focus:ring-2 focus:ring-[#CCFF00] ${customInputError ? 'border-[#FF006E]' : 'border-white/15'}`}
                aria-label="Custom collateral"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {COLLATERAL_PRESETS.map((preset) => {
              const isSelected = localSettings.collateral === preset;
              return (
                <button
                  key={preset}
                  onClick={() => { handleCollateralChange(preset); setCustomInputValue(''); setCustomInputError(null); }}
                  className={`py-2 text-xs font-black touch-manipulation border-2 transition-all ${isSelected ? 'bg-[#CCFF00] text-black border-[#CCFF00]' : 'bg-[#151a21] text-white border-white/15 hover:border-[#CCFF00]/40'}`}
                  aria-pressed={isSelected}
                >
                  ${preset}
                </button>
              );
            })}
          </div>
        </div>

        <div className="brutal-card p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <SettingsTooltip label="Take Profit %" text="Net profit % (after fees) to auto-close. Applied to all new trades. Min 50%, max 500%." />
            <input
              type="text"
              inputMode="numeric"
              value={customTpInputValue}
              onChange={(e) => handleCustomTpInput(e.target.value)}
              onBlur={handleCustomTpBlur}
              placeholder={String(localSettings.takeProfitPercent)}
              className={`w-14 py-1.5 px-2 text-xs font-black font-mono bg-[#11151b] text-white placeholder-white/25 border focus:outline-none focus:ring-2 focus:ring-[#CCFF00] ${customTpInputError ? 'border-[#FF006E]' : 'border-white/15'}`}
              aria-label="Custom TP %"
            />
          </div>
          <div className="grid grid-cols-4 gap-1">
            {TAKE_PROFIT_PRESETS.map((preset) => {
              const isSelected = localSettings.takeProfitPercent === preset;
              return (
                <button
                  key={preset}
                  onClick={() => { handleTakeProfitChange(preset); setCustomTpInputValue(''); setCustomTpInputError(null); }}
                  className={`py-2 text-xs font-black touch-manipulation border-2 transition-all ${isSelected ? 'bg-[#CCFF00] text-black border-[#CCFF00]' : 'bg-[#151a21] text-white border-white/15 hover:border-[#CCFF00]/40'}`}
                  aria-pressed={isSelected}
                >
                  {preset}%
                </button>
              );
            })}
          </div>
          {customTpInputError && <p className="text-[#FF006E] text-[10px] font-bold" role="alert">{customTpInputError}</p>}
        </div>

        {/* Audio - single row */}
        <div className="brutal-card p-3 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-2">
              <SettingsTooltip label="SFX" text="Sound effects: wheel spin, flip, win/loss feedback." />
              <div className="flex border-2 border-[#CCFF00]/35 bg-black/40 p-0.5">
                <button onClick={() => handleAudioToggle(true)} className={`px-2 py-1 text-[10px] font-black uppercase ${localSettings.audioEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={localSettings.audioEnabled}>ON</button>
                <button onClick={() => handleAudioToggle(false)} className={`px-2 py-1 text-[10px] font-black uppercase ${!localSettings.audioEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={!localSettings.audioEnabled}>OFF</button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <SettingsTooltip label="Music" text="Background music during gameplay." />
              <div className="flex border-2 border-[#CCFF00]/35 bg-black/40 p-0.5">
                <button onClick={() => handleMusicToggle(true)} className={`px-2 py-1 text-[10px] font-black uppercase ${localSettings.musicEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={localSettings.musicEnabled}>ON</button>
                <button onClick={() => handleMusicToggle(false)} className={`px-2 py-1 text-[10px] font-black uppercase ${!localSettings.musicEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={!localSettings.musicEnabled}>OFF</button>
              </div>
            </div>
          </div>
        </div>

        <AvantisFooter />
      </main>
    </div>
  );
}
