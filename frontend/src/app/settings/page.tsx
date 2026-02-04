'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeStore } from '@/store/tradeStore';
import { loadSettings, saveSettings } from '@/lib/settings';
import { loadStats } from '@/lib/stats';
import { AvantisFooter } from '@/components/AvantisFooter';
import type { Settings } from '@/types';

const COLLATERAL_PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000];
const MIN_COLLATERAL = 2;
const MAX_COLLATERAL = 1000;

export default function SettingsPage() {
  const router = useRouter();
  const { setSettings, setCollateral, setTradeStats } = useTradeStore();
  // Use lazy initialization to avoid setState in effect
  const [localSettings, setLocalSettings] = useState<Settings>(() => loadSettings());
  const [customInputValue, setCustomInputValue] = useState<string>('');
  const [customInputError, setCustomInputError] = useState<string | null>(null);

  useEffect(() => {
    // Sync loaded settings to store (localSettings already initialized)
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setCollateral(loadedSettings.collateral);
    
    const loadedStats = loadStats();
    setTradeStats(loadedStats);
  }, [setSettings, setCollateral, setTradeStats]);

  const handleCollateralChange = (value: number) => {
    const newSettings = { ...localSettings, collateral: value };
    setLocalSettings(newSettings);
    setSettings(newSettings);
    setCollateral(value);
    saveSettings(newSettings);
  };

  const handleAudioToggle = (enabled: boolean) => {
    const newSettings = { ...localSettings, audioEnabled: enabled };
    setLocalSettings(newSettings);
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleMusicToggle = (enabled: boolean) => {
    const newSettings = { ...localSettings, musicEnabled: enabled };
    setLocalSettings(newSettings);
    setSettings(newSettings);
    saveSettings(newSettings);
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
  const isCustomValue = !COLLATERAL_PRESETS.includes(localSettings.collateral);

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-md mx-auto w-full">
      {/* Header - Improved consistency */}
      <header className="w-full mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
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
        
        {/* COLLATERAL SIZE - Enhanced visual hierarchy */}
        <section className="space-y-5">
          <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-wide">Collateral Size</h2>
          <div className="text-[#CCFF00] text-center text-4xl sm:text-5xl font-black mb-6 font-mono">
            ${localSettings.collateral}
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
                    py-3 sm:py-4 text-sm sm:text-base font-black touch-manipulation min-h-[56px] sm:min-h-[64px]
                    border-4 border-black transition-all font-mono
                    focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${isSelected
                      ? 'bg-[#CCFF00] text-black shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.3)]'
                      : 'bg-[#1a1a1a] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#2a2a2a] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px]'
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
          <div className="mt-4 sm:mt-5">
            <label className="block text-white/70 text-xs sm:text-sm font-bold uppercase tracking-wide mb-2">
              Custom Amount
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 font-black text-lg">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={customInputValue}
                  onChange={(e) => handleCustomCollateralInput(e.target.value)}
                  onBlur={handleCustomCollateralBlur}
                  placeholder={isCustomValue ? String(localSettings.collateral) : 'Enter amount'}
                  className={`
                    w-full py-3 sm:py-4 pl-9 pr-4 text-lg sm:text-xl font-black font-mono
                    bg-[#1a1a1a] text-white placeholder-white/30
                    border-4 transition-all
                    focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black
                    ${customInputError 
                      ? 'border-[#FF006E]' 
                      : isCustomValue 
                        ? 'border-[#CCFF00]' 
                        : 'border-[#333]'
                    }
                  `}
                  style={{ 
                    boxShadow: customInputError 
                      ? '4px 4px 0px 0px rgba(255, 0, 110, 0.5)'
                      : isCustomValue
                        ? '4px 4px 0px 0px rgba(204, 255, 0, 0.5)'
                        : '4px 4px 0px 0px rgba(0, 0, 0, 1)'
                  }}
                  aria-label="Enter custom collateral amount"
                  aria-describedby={customInputError ? 'collateral-error' : 'collateral-hint'}
                />
              </div>
            </div>
            {customInputError ? (
              <p id="collateral-error" className="mt-2 text-[#FF006E] text-xs sm:text-sm font-bold" role="alert">
                {customInputError}
              </p>
            ) : (
              <p id="collateral-hint" className="mt-2 text-white/40 text-xs sm:text-sm">
                Min ${MIN_COLLATERAL}, max ${MAX_COLLATERAL}, whole numbers only
              </p>
            )}
          </div>
        </section>

        {/* AUDIO - Enhanced toggle components */}
        <section className="space-y-4">
          <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-wide">Audio</h2>
          
          {/* Sound Effects Toggle */}
          <div className="brutal-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-base sm:text-lg mb-1">Sound Effects</div>
                <div className="text-white/50 text-xs sm:text-sm leading-relaxed">Wheel spin, win/loss sounds</div>
              </div>
              <div className="brutal-toggle shrink-0 w-full sm:w-auto">
                <button
                  onClick={() => handleAudioToggle(true)}
                  className={`brutal-toggle-option ${localSettings.audioEnabled ? 'active' : ''} focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black`}
                  aria-pressed={localSettings.audioEnabled}
                  aria-label="Enable sound effects"
                >
                  ON
                </button>
                <button
                  onClick={() => handleAudioToggle(false)}
                  className={`brutal-toggle-option ${!localSettings.audioEnabled ? 'active' : ''} focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black`}
                  aria-pressed={!localSettings.audioEnabled}
                  aria-label="Disable sound effects"
                >
                  OFF
                </button>
              </div>
            </div>
          </div>

          {/* Music Toggle */}
          <div className="brutal-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-base sm:text-lg mb-1">Background Music</div>
                <div className="text-white/50 text-xs sm:text-sm leading-relaxed">Ambient music during gameplay</div>
              </div>
              <div className="brutal-toggle shrink-0 w-full sm:w-auto">
                <button
                  onClick={() => handleMusicToggle(true)}
                  className={`brutal-toggle-option ${localSettings.musicEnabled ? 'active' : ''} focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black`}
                  aria-pressed={localSettings.musicEnabled}
                  aria-label="Enable background music"
                >
                  ON
                </button>
                <button
                  onClick={() => handleMusicToggle(false)}
                  className={`brutal-toggle-option ${!localSettings.musicEnabled ? 'active' : ''} focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black`}
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
