'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeStore } from '@/store/tradeStore';
import { loadSettings, saveSettings } from '@/lib/settings';
import { loadStats } from '@/lib/stats';
import type { Settings } from '@/types';

const COLLATERAL_PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000];

export default function SettingsPage() {
  const router = useRouter();
  const { settings, setSettings, setCollateral, tradeStats, setTradeStats } = useTradeStore();
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  useEffect(() => {
    const loadedSettings = loadSettings();
    setLocalSettings(loadedSettings);
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

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 sm:px-6 py-4 sm:py-6 font-mono safe-area-top safe-area-bottom max-w-md mx-auto w-full">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-6 sm:mb-8">
        <button
          onClick={() => router.back()}
          className="text-[#CCFF00] text-lg sm:text-xl font-bold touch-manipulation min-h-[44px] flex items-center px-4 py-2 border-4 border-[#CCFF00] bg-black hover:bg-[#CCFF00] hover:text-black transition-colors"
          style={{ boxShadow: '4px 4px 0px 0px rgba(204, 255, 0, 0.5)' }}
          aria-label="Go back"
        >
          ← BACK
        </button>
        <h1 className="text-[#CCFF00] text-xl sm:text-2xl font-bold">SETTINGS</h1>
        <div className="w-24 sm:w-28" />
      </header>

      {/* Settings content */}
      <main className="flex-1 flex flex-col gap-8 sm:gap-10 max-w-md mx-auto w-full overflow-y-auto min-h-0 pb-4">
        
        {/* COLLATERAL SIZE - Grid of brutalist buttons (NO slider) */}
        <section className="space-y-4">
          <h2 className="text-white text-lg sm:text-xl font-bold">COLLATERAL SIZE</h2>
          <div className="text-[#CCFF00] text-center text-3xl sm:text-4xl font-black mb-4">
            ${localSettings.collateral}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {COLLATERAL_PRESETS.map((preset) => {
              const isSelected = localSettings.collateral === preset;
              return (
                <button
                  key={preset}
                  onClick={() => handleCollateralChange(preset)}
                  className={`
                    py-3 sm:py-4 text-sm sm:text-base font-bold touch-manipulation min-h-[56px]
                    border-4 border-black transition-all
                    ${isSelected
                      ? 'bg-[#CCFF00] text-black shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.2)]'
                      : 'bg-[#1a1a1a] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#2a2a2a]'
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
        </section>

        {/* AUDIO - Chunky ON/OFF toggles */}
        <section className="space-y-4">
          <h2 className="text-white text-lg sm:text-xl font-bold">AUDIO</h2>
          
          {/* Sound Effects Toggle */}
          <div className="brutal-card p-4 sm:p-5">
            <div className="flex justify-between items-center gap-4">
              <div className="flex-1">
                <div className="text-white font-bold text-sm sm:text-base">Sound Effects</div>
                <div className="text-white/50 text-xs sm:text-sm">Wheel spin, win/loss sounds</div>
              </div>
              <div className="brutal-toggle shrink-0">
                <button
                  onClick={() => handleAudioToggle(true)}
                  className={`brutal-toggle-option ${localSettings.audioEnabled ? 'active' : ''}`}
                  aria-pressed={localSettings.audioEnabled}
                >
                  ON
                </button>
                <button
                  onClick={() => handleAudioToggle(false)}
                  className={`brutal-toggle-option ${!localSettings.audioEnabled ? 'active' : ''}`}
                  aria-pressed={!localSettings.audioEnabled}
                >
                  OFF
                </button>
              </div>
            </div>
          </div>

          {/* Music Toggle */}
          <div className="brutal-card p-4 sm:p-5">
            <div className="flex justify-between items-center gap-4">
              <div className="flex-1">
                <div className="text-white font-bold text-sm sm:text-base">Background Music</div>
                <div className="text-white/50 text-xs sm:text-sm">Ambient music during gameplay</div>
              </div>
              <div className="brutal-toggle shrink-0">
                <button
                  onClick={() => handleMusicToggle(true)}
                  className={`brutal-toggle-option ${localSettings.musicEnabled ? 'active' : ''}`}
                  aria-pressed={localSettings.musicEnabled}
                >
                  ON
                </button>
                <button
                  onClick={() => handleMusicToggle(false)}
                  className={`brutal-toggle-option ${!localSettings.musicEnabled ? 'active' : ''}`}
                  aria-pressed={!localSettings.musicEnabled}
                >
                  OFF
                </button>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
