import type { Settings } from '@/types';
import { DEFAULT_COLLATERAL } from './constants';

const STORAGE_KEY = 'yolo_settings';

const DEFAULT_SETTINGS: Settings = {
  collateral: DEFAULT_COLLATERAL,
  audioEnabled: true,
  musicEnabled: false,
};

export function loadSettings(): Settings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(stored);
    // Validate and merge with defaults
    return {
      collateral: typeof parsed.collateral === 'number' 
        ? Math.max(5, Math.min(1000, parsed.collateral)) 
        : DEFAULT_COLLATERAL,
      audioEnabled: typeof parsed.audioEnabled === 'boolean' ? parsed.audioEnabled : true,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : false,
    };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}
