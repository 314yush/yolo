'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COLLATERAL_PRESETS,
  MAX_COLLATERAL,
  MIN_COLLATERAL,
  TAKE_PROFIT_PRESETS,
  MAX_TAKE_PROFIT,
  MIN_TAKE_PROFIT,
} from '@/lib/settings';
import { loadPaperSettings, savePaperSettings } from '@/lib/paperSettings';
import { loadPaperStats } from '@/lib/paperStats';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { usePaperBalance } from '@/hooks/usePaperBalance';
import { useTradeStore } from '@/store/tradeStore';
import { SettingsTooltip } from '@/components/SettingsTooltip';
import { PaperIcon } from '@/components/PaperBadge';
import type { Settings } from '@/types';

type SettingsTab = 'wallet' | 'trading' | 'prefs';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'trading', label: 'Trading' },
  { id: 'prefs', label: 'Prefs' },
];

export default function PaperSettingsPage() {
  const router = useRouter();
  const { guestId } = usePaperTrading();
  const { balance, resetBalance, refresh: refreshBalance } = usePaperBalance();
  const { setSettings, setCollateral, setTradeStats } = useTradeStore();

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('wallet');
  const [localSettings, setLocalSettings] = useState<Settings>(() => loadPaperSettings(guestId));
  const [customInputValue, setCustomInputValue] = useState('');
  const [customInputError, setCustomInputError] = useState<string | null>(null);
  const [customTpInputValue, setCustomTpInputValue] = useState('');
  const [customTpInputError, setCustomTpInputError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const btnClass =
    'py-2 px-3 text-xs font-black uppercase border-2 border-[#CCFF00] text-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  useEffect(() => {
    const loaded = loadPaperSettings(guestId);
    setLocalSettings(loaded);
    setSettings(loaded);
    setCollateral(loaded.collateral);
    setTradeStats(loadPaperStats(guestId));
    refreshBalance();
  }, [guestId, setSettings, setCollateral, setTradeStats, refreshBalance]);

  const persistSettings = (settings: Settings) => {
    setLocalSettings(settings);
    setSettings(settings);
    setCollateral(settings.collateral);
    savePaperSettings(guestId, settings);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1200);
  };

  const handleBack = () => {
    router.push('/paper');
  };

  const handleCollateralChange = (value: number) => {
    persistSettings({ ...localSettings, collateral: value });
  };

  const handleTakeProfitChange = (value: number) => {
    persistSettings({ ...localSettings, takeProfitPercent: value });
  };

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

  return (
    <div className="h-dvh min-h-dvh bg-black flex flex-col px-3 sm:px-4 py-3 font-mono safe-area-top safe-area-bottom max-w-lg mx-auto w-full">
      <header className="shrink-0 flex items-center justify-between mb-2">
        <button type="button" onClick={handleBack} className={btnClass} aria-label="Go back">
          BACK
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-[#CCFF00] text-lg font-black uppercase tracking-tight">Settings</h1>
          <PaperIcon />
        </div>
        <span className={`text-[10px] font-bold uppercase ${saveStatus === 'saved' ? 'text-[#CCFF00]' : 'text-white/40'}`}>
          {saveStatus === 'saved' ? 'Saved' : 'Local'}
        </span>
      </header>

      <div className="shrink-0 mb-3" role="tablist">
        <div className="flex rounded-sm border-2 border-[#CCFF00]/40 bg-black overflow-hidden">
          {TABS.map(({ id, label }) => {
            const selected = settingsTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`flex-1 py-2.5 px-1 text-[11px] sm:text-xs font-black uppercase tracking-tight transition-colors min-h-[44px] border-r-2 border-[#CCFF00]/35 last:border-r-0 ${selected ? 'bg-[#CCFF00] text-black' : 'text-[#CCFF00] hover:bg-[#CCFF00]/10'}`}
                onClick={() => setSettingsTab(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pb-2">
        {settingsTab === 'wallet' && (
          <section className="flex flex-col gap-3">
            <div className="brutal-card p-4">
              <SettingsTooltip text="Virtual USDC for paper trading. Stored locally on this device." inline>
                <p className="text-[#CCFF00]/80 text-[10px] uppercase font-bold mb-1">Paper Balance</p>
              </SettingsTooltip>
              <p className="text-[#CCFF00] text-3xl sm:text-4xl font-black tracking-tight tabular-nums">
                ${balance !== null ? balance.toFixed(2) : '…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetBalance();
                setSaveStatus('saved');
              }}
              className="w-full py-3 font-black uppercase border-4 border-[#CCFF00] text-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors"
            >
              Reset Paper Balance ($10,000)
            </button>
          </section>
        )}

        {settingsTab === 'trading' && (
          <section className="flex flex-col gap-3">
            <div className="brutal-card p-4 space-y-3">
              <SettingsTooltip text="Collateral per trade in paper mode." inline>
                <p className="text-[#CCFF00] text-[10px] uppercase font-bold">Stake / Collateral</p>
              </SettingsTooltip>
              <div className="flex flex-wrap gap-2">
                {COLLATERAL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleCollateralChange(preset)}
                    className={`py-2 px-3 text-xs font-black uppercase border-2 transition-colors ${localSettings.collateral === preset ? 'bg-[#CCFF00] text-black border-black' : 'border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00]/10'}`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Custom amount"
                value={customInputValue}
                onChange={(e) => handleCustomCollateralInput(e.target.value)}
                className="w-full bg-black border-2 border-[#CCFF00]/40 text-white px-3 py-2 text-sm font-mono"
              />
              {customInputError && <p className="text-[#FF006E] text-xs">{customInputError}</p>}
            </div>

            <div className="brutal-card p-4 space-y-3">
              <SettingsTooltip text="Take-profit target for new paper trades." inline>
                <p className="text-[#CCFF00] text-[10px] uppercase font-bold">Take Profit %</p>
              </SettingsTooltip>
              <div className="flex flex-wrap gap-2">
                {TAKE_PROFIT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleTakeProfitChange(preset)}
                    className={`py-2 px-3 text-xs font-black uppercase border-2 transition-colors ${localSettings.takeProfitPercent === preset ? 'bg-[#CCFF00] text-black border-black' : 'border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00]/10'}`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Custom TP %"
                value={customTpInputValue}
                onChange={(e) => handleCustomTpInput(e.target.value)}
                className="w-full bg-black border-2 border-[#CCFF00]/40 text-white px-3 py-2 text-sm font-mono"
              />
              {customTpInputError && <p className="text-[#FF006E] text-xs">{customTpInputError}</p>}
            </div>
          </section>
        )}

        {settingsTab === 'prefs' && (
          <section className="flex flex-col gap-3">
            <div className="brutal-card p-4 flex items-center justify-between">
              <span className="text-white/80 text-sm font-bold uppercase">Sound Effects</span>
              <button
                type="button"
                onClick={() => persistSettings({ ...localSettings, audioEnabled: !localSettings.audioEnabled })}
                className={`py-2 px-4 text-xs font-black uppercase border-2 ${localSettings.audioEnabled ? 'bg-[#CCFF00] text-black border-black' : 'border-white/30 text-white/50'}`}
              >
                {localSettings.audioEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="brutal-card p-4 flex items-center justify-between">
              <span className="text-white/80 text-sm font-bold uppercase">Music</span>
              <button
                type="button"
                onClick={() => persistSettings({ ...localSettings, musicEnabled: !localSettings.musicEnabled })}
                className={`py-2 px-4 text-xs font-black uppercase border-2 ${localSettings.musicEnabled ? 'bg-[#CCFF00] text-black border-black' : 'border-white/30 text-white/50'}`}
              >
                {localSettings.musicEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
