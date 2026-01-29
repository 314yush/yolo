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
                  onClick={() => handleCollateralChange(preset)}
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
    </div>
  );
}
