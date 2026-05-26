'use client';

import React, { useEffect, useState } from 'react';
import { useFundWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { ChevronDown } from 'lucide-react';
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

type SettingsTab = 'wallet' | 'trading' | 'prefs';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'trading', label: 'Trading' },
  { id: 'prefs', label: 'Prefs' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { wallets } = useWallets();
  const { userAddress, setSettings, setCollateral, setTradeStats, setTxHash } = useTradeStore();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('wallet');
  const [withdrawOpen, setWithdrawOpen] = useState(false);

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

  const btnClass = 'py-2 px-3 text-xs font-black uppercase border-2 border-[#CCFF00] text-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black';
  const btnPrimaryClass = 'py-2 px-3 text-xs font-black uppercase border-2 border-black text-black bg-[#CCFF00] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black';

  const balanceLine =
    !walletAddress ? (
      <p className="text-white/40 text-sm font-bold">Connect a wallet to see balance</p>
    ) : privyBalanceLoading ? (
      <p className="text-white/40 text-2xl font-black animate-pulse">…</p>
    ) : privyBalance !== null ? (
      <p className="text-[#CCFF00] text-3xl sm:text-4xl font-black tracking-tight tabular-nums">${privyBalance.toFixed(2)}</p>
    ) : (
      <div className="h-10 w-40 animate-shimmer rounded-sm" />
    );

  return (
    <div className="h-dvh min-h-dvh bg-black flex flex-col px-3 sm:px-4 py-3 font-mono safe-area-top safe-area-bottom max-w-lg mx-auto w-full">
      <header className="shrink-0 flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={handleBack}
          className={`${btnClass} min-w-[88px]`}
          style={{ boxShadow: '3px 3px 0px 0px rgba(204, 255, 0, 0.5)' }}
          aria-label="Go back"
        >
          BACK
        </button>
        <h1 className="text-[#CCFF00] text-lg font-black uppercase tracking-tight">Settings</h1>
        <span
          className={`text-[10px] font-bold uppercase min-w-[3.25rem] text-right ${saveStatus === 'saved' ? 'text-[#CCFF00]' : 'text-white/40'}`}
          aria-live="polite"
          title={saveStatus === 'saved' ? 'Settings saved to this device' : 'In sync'}
        >
          {saveStatus === 'saved' ? 'Saved' : 'Synced'}
        </span>
      </header>

      <div className="shrink-0 mb-3" role="tablist" aria-label="Settings sections">
        <div className="flex rounded-sm border-2 border-[#CCFF00]/40 bg-black overflow-hidden">
          {TABS.map(({ id, label }) => {
            const selected = settingsTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-tab-${id}`}
                id={`settings-tab-trigger-${id}`}
                className={`flex-1 py-2.5 px-1 text-[11px] sm:text-xs font-black uppercase tracking-tight transition-colors touch-manipulation min-h-[44px] border-r-2 border-[#CCFF00]/35 last:border-r-0 ${selected ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00] hover:bg-[#CCFF00]/10'}`}
                onClick={() => setSettingsTab(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 pb-2">
          {settingsTab === 'wallet' && (
            <section
              className="flex flex-col gap-3"
              role="tabpanel"
              id="settings-tab-wallet"
              aria-labelledby="settings-tab-trigger-wallet"
            >
              <div className="brutal-card p-4 shrink-0">
                <SettingsTooltip text="USDC balance in your Privy wallet. Available for trading or withdrawal." inline>
                  <p className="text-[#CCFF00]/80 text-[10px] uppercase font-bold mb-1">Balance</p>
                </SettingsTooltip>
                {balanceLine}
              </div>

              <div className="brutal-card p-3 space-y-3 shrink-0">
                <p className="text-[#CCFF00] text-[10px] uppercase font-bold tracking-wider">Your wallet</p>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1" title="Your Privy embedded wallet address. Holds USDC for trading.">
                    <p className="text-[#CCFF00] text-sm font-black truncate">{displayAddress || '—'}</p>
                    <span
                      className="inline-block mt-1 text-[10px] font-bold uppercase border border-[#CCFF00]/50 text-[#CCFF00] bg-[#CCFF00]/10 px-1.5 py-0.5"
                      title="Privy embedded wallet – gasless, secure."
                    >
                      {walletProviderLabel}
                    </span>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <button type="button" onClick={handleCopyWalletAddress} disabled={!walletAddress} className={btnClass} title="Copy full wallet address">
                      {copyStatus === 'copied' ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={handleFundWallet} disabled={!walletAddress} className={btnPrimaryClass} title="Add USDC via Privy">
                      Fund
                    </button>
                  </div>
                </div>

                {walletAddress && (
                  <div className="border-t border-white/10 pt-3 space-y-2">
                    <button
                      type="button"
                      className={`w-full flex items-center justify-between gap-2 py-2 px-2 text-left border-2 font-black uppercase text-xs transition-colors touch-manipulation min-h-[44px] ${withdrawOpen ? 'border-[#CCFF00] text-[#CCFF00] bg-[#CCFF00]/10' : 'border-white/20 text-white/80 hover:border-[#CCFF00]/45'}`}
                      onClick={() => setWithdrawOpen((o) => !o)}
                      aria-expanded={withdrawOpen}
                    >
                      <span>Withdraw USDC</span>
                      <ChevronDown className={`w-4 h-4 shrink-0 text-[#CCFF00] transition-transform ${withdrawOpen ? 'rotate-180' : ''}`} aria-hidden />
                    </button>
                    {withdrawOpen && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[10px] font-bold text-white/50 leading-snug">
                          Sends USDC to any address on Base. Gas sponsored. Transfers cannot be undone—double-check the recipient.
                        </p>
                        <div className="flex gap-1.5 flex-wrap sm:flex-nowrap">
                          <div className="relative flex-1 min-w-0 basis-[40%] sm:basis-auto">
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
                          <button type="button" onClick={handleMaxWithdraw} disabled={privyBalance === null || privyBalance <= 0} className={btnClass} title="Use full available balance">
                            Max
                          </button>
                          <button type="button" onClick={handleWithdraw} disabled={!isWithdrawValid || isWithdrawPending} className={btnPrimaryClass} title="Send USDC">
                            {isWithdrawPending ? '…' : 'Send'}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={withdrawToAddress}
                          onChange={(e) => handleWithdrawToAddressChange(e.target.value)}
                          placeholder="Recipient 0x…"
                          className="w-full py-2 px-2 text-xs font-mono bg-[#11151b] text-white placeholder-white/25 border-2 border-white/15 focus:outline-none focus:ring-2 focus:ring-[#CCFF00]"
                          aria-label="Recipient address"
                        />
                        {(withdrawError || withdrawApiError) && (
                          <p className="text-[#FF006E] text-[10px] font-bold" role="alert">{withdrawError || withdrawApiError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {settingsTab === 'trading' && (
            <section
              className="flex flex-col gap-3"
              role="tabpanel"
              id="settings-tab-trading"
              aria-labelledby="settings-tab-trigger-trading"
            >
              <p className="text-white/55 text-[10px] font-bold uppercase shrink-0">
                Defaults for new spins · Stake ${localSettings.collateral} · TP {localSettings.takeProfitPercent}%
              </p>

              <div className="brutal-card p-3 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <SettingsTooltip label="Stake (collateral)" text="The margin backing your leveraged position. Same as Stake — sets position size (Collateral × Leverage)." />
                  <div className="relative w-16 shrink-0">
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
                {customInputError && (
                  <p className="text-[#FF006E] text-[10px] font-bold" role="alert">{customInputError}</p>
                )}
                <div className="grid grid-cols-4 gap-1">
                  {COLLATERAL_PRESETS.map((preset) => {
                    const isSelected = localSettings.collateral === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => { handleCollateralChange(preset); setCustomInputValue(''); setCustomInputError(null); }}
                        className={`py-2.5 text-xs font-black touch-manipulation border-2 transition-all min-h-[44px] ${isSelected ? 'bg-[#CCFF00] text-black border-[#CCFF00]' : 'bg-[#151a21] text-white border-white/15 hover:border-[#CCFF00]/40'}`}
                        aria-pressed={isSelected}
                      >
                        ${preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="brutal-card p-3 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <SettingsTooltip label="Take profit %" text="Net profit % (after fees) to auto-close. Applied to new trades. Min 50%, max 500%." />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customTpInputValue}
                    onChange={(e) => handleCustomTpInput(e.target.value)}
                    onBlur={handleCustomTpBlur}
                    placeholder={`${localSettings.takeProfitPercent}`}
                    className={`w-14 shrink-0 py-1.5 px-2 text-xs font-black font-mono bg-[#11151b] text-white placeholder-white/25 border focus:outline-none focus:ring-2 focus:ring-[#CCFF00] ${customTpInputError ? 'border-[#FF006E]' : 'border-white/15'}`}
                    aria-label="Custom take profit percent"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {TAKE_PROFIT_PRESETS.map((preset) => {
                    const isSelected = localSettings.takeProfitPercent === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => { handleTakeProfitChange(preset); setCustomTpInputValue(''); setCustomTpInputError(null); }}
                        className={`py-2.5 text-xs font-black touch-manipulation border-2 transition-all min-h-[44px] ${isSelected ? 'bg-[#CCFF00] text-black border-[#CCFF00]' : 'bg-[#151a21] text-white border-white/15 hover:border-[#CCFF00]/40'}`}
                        aria-pressed={isSelected}
                      >
                        {preset}%
                      </button>
                    );
                  })}
                </div>
                {customTpInputError && (
                  <p className="text-[#FF006E] text-[10px] font-bold" role="alert">{customTpInputError}</p>
                )}
              </div>
            </section>
          )}

          {settingsTab === 'prefs' && (
            <section
              className="flex flex-col gap-3"
              role="tabpanel"
              id="settings-tab-prefs"
              aria-labelledby="settings-tab-trigger-prefs"
            >
              <div className="brutal-card p-3 space-y-4 shrink-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <SettingsTooltip label="Sound effects" text="Sound effects: wheel spin, flip, win/loss feedback." />
                  <div className="flex border-2 border-[#CCFF00]/35 bg-black/40 p-0.5 self-start sm:self-auto">
                    <button type="button" onClick={() => handleAudioToggle(true)} className={`px-3 py-2 min-h-[44px] min-w-[48px] text-[10px] font-black uppercase ${localSettings.audioEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={localSettings.audioEnabled}>
                      ON
                    </button>
                    <button type="button" onClick={() => handleAudioToggle(false)} className={`px-3 py-2 min-h-[44px] min-w-[48px] text-[10px] font-black uppercase ${!localSettings.audioEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={!localSettings.audioEnabled}>
                      OFF
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <SettingsTooltip label="Music" text="Background music during gameplay." />
                  <div className="flex border-2 border-[#CCFF00]/35 bg-black/40 p-0.5 self-start sm:self-auto">
                    <button type="button" onClick={() => handleMusicToggle(true)} className={`px-3 py-2 min-h-[44px] min-w-[48px] text-[10px] font-black uppercase ${localSettings.musicEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={localSettings.musicEnabled}>
                      ON
                    </button>
                    <button type="button" onClick={() => handleMusicToggle(false)} className={`px-3 py-2 min-h-[44px] min-w-[48px] text-[10px] font-black uppercase ${!localSettings.musicEnabled ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00]'}`} aria-pressed={!localSettings.musicEnabled}>
                      OFF
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          <AvantisFooter />
        </div>
      </main>
    </div>
  );
}
