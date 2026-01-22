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
    // Load settings from localStorage on mount
    const loadedSettings = loadSettings();
    setLocalSettings(loadedSettings);
    setSettings(loadedSettings);
    setCollateral(loadedSettings.collateral);
    
    // Load stats from localStorage on mount
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

  const handleAudioToggle = () => {
    const newSettings = { ...localSettings, audioEnabled: !localSettings.audioEnabled };
    setLocalSettings(newSettings);
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleMusicToggle = () => {
    const newSettings = { ...localSettings, musicEnabled: !localSettings.musicEnabled };
    setLocalSettings(newSettings);
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col p-4 md:p-8 font-mono safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-8">
        <button
          onClick={() => router.back()}
          className="text-[#CCFF00] text-xl font-bold hover:opacity-70"
        >
          ← BACK
        </button>
        <div className="text-[#CCFF00] text-2xl font-bold">SETTINGS</div>
        <div className="w-16" /> {/* Spacer for centering */}
      </header>

      {/* Settings content */}
      <main className="flex-1 flex flex-col gap-8 max-w-md mx-auto w-full">
        {/* Trade Statistics */}
        <div className="space-y-4">
          <div className="text-white text-xl font-bold">STATISTICS</div>
          <div className="space-y-2 p-4 bg-white/5 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-white/70">Total Trades</span>
              <span className="text-[#CCFF00] font-bold">{tradeStats.totalTrades}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70">Active Positions</span>
              <span className="text-[#CCFF00] font-bold">{tradeStats.activePositions}</span>
            </div>
          </div>
        </div>
        {/* Collateral Size */}
        <div className="space-y-4">
          <div className="text-white text-xl font-bold">COLLATERAL SIZE</div>
          <div className="space-y-4">
            {/* Slider */}
            <div className="space-y-2">
              <input
                type="range"
                min="5"
                max="1000"
                step="5"
                value={localSettings.collateral}
                onChange={(e) => handleCollateralChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#CCFF00]"
                style={{
                  background: `linear-gradient(to right, #CCFF00 0%, #CCFF00 ${((localSettings.collateral - 5) / (1000 - 5)) * 100}%, #333333 ${((localSettings.collateral - 5) / (1000 - 5)) * 100}%, #333333 100%)`,
                }}
              />
              <div className="flex justify-between text-white/50 text-sm">
                <span>$5</span>
                <span className="text-[#CCFF00] font-bold">${localSettings.collateral}</span>
                <span>$1000</span>
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {COLLATERAL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleCollateralChange(preset)}
                  className={`px-4 py-2 text-sm font-bold brutal-button ${
                    localSettings.collateral === preset
                      ? 'bg-[#CCFF00] text-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Audio Settings */}
        <div className="space-y-4">
          <div className="text-white text-xl font-bold">AUDIO</div>
          <div className="space-y-3">
            {/* Sound Effects Toggle */}
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-lg">
              <div>
                <div className="text-white font-bold">Sound Effects</div>
                <div className="text-white/50 text-sm">Wheel spin, win/loss sounds</div>
              </div>
              <button
                onClick={handleAudioToggle}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  localSettings.audioEnabled ? 'bg-[#CCFF00]' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-black rounded-full transition-transform ${
                    localSettings.audioEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Music Toggle */}
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-lg">
              <div>
                <div className="text-white font-bold">Background Music</div>
                <div className="text-white/50 text-sm">Ambient music during gameplay</div>
              </div>
              <button
                onClick={handleMusicToggle}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  localSettings.musicEnabled ? 'bg-[#CCFF00]' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-black rounded-full transition-transform ${
                    localSettings.musicEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
