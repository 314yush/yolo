'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useTradeStore } from '@/store/tradeStore';
import { saveSettings } from '@/lib/settings';

export function MusicToggleButton() {
  const { settings, setSettings } = useTradeStore();
  const musicEnabled = settings.musicEnabled;

  const handleToggle = () => {
    const next = { ...settings, musicEnabled: !musicEnabled };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={musicEnabled ? 'Mute background music' : 'Unmute background music'}
      aria-pressed={!musicEnabled}
      className="absolute top-3 right-3 z-50 p-2.5 rounded-full bg-black/60 text-white/80 border-2 border-[#CCFF00]/30 hover:border-[#CCFF00]/60 hover:text-[#CCFF00] backdrop-blur-sm transition-all duration-200 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-black"
      style={{
        boxShadow: '2px 2px 0px 0px rgba(204, 255, 0, 0.2)',
      }}
    >
      {musicEnabled ? (
        <Volume2 className="w-5 h-5" strokeWidth={2.5} aria-hidden />
      ) : (
        <VolumeX className="w-5 h-5 text-white/60" strokeWidth={2.5} aria-hidden />
      )}
    </button>
  );
}
