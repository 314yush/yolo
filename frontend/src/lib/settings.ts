import type { Settings } from '@/types';
import { DEFAULT_COLLATERAL } from './constants';

const STORAGE_KEY = 'yolo_settings';
export const MIN_COLLATERAL = 1;
export const MAX_COLLATERAL = 1000;

export const DEFAULT_TAKE_PROFIT_PERCENT = 200;
export const MIN_TAKE_PROFIT = 50;
export const MAX_TAKE_PROFIT = 500;

// Avantis requires $100 min position size; at 250x leverage min collateral = $0.40
export const COLLATERAL_PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;
export const TAKE_PROFIT_PRESETS = [100, 150, 200, 300] as const;

export const DEFAULT_SETTINGS: Settings = {
  collateral: DEFAULT_COLLATERAL,
  takeProfitPercent: DEFAULT_TAKE_PROFIT_PERCENT,
  audioEnabled: true,
  musicEnabled: true, // Music plays by default on landing page
};

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function clampCollateral(value: number): number {
  return Math.max(MIN_COLLATERAL, Math.min(MAX_COLLATERAL, value));
}

export function clampTakeProfitPercent(value: number): number {
  return Math.max(MIN_TAKE_PROFIT, Math.min(MAX_TAKE_PROFIT, Math.round(value)));
}

export function formatWalletAddress(address: string, start = 6, end = 4): string {
  if (!address || address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

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
        ? clampCollateral(parsed.collateral)
        : DEFAULT_COLLATERAL,
      takeProfitPercent: typeof parsed.takeProfitPercent === 'number'
        ? clampTakeProfitPercent(parsed.takeProfitPercent)
        : DEFAULT_TAKE_PROFIT_PERCENT,
      audioEnabled: parseBoolean(parsed.audioEnabled, DEFAULT_SETTINGS.audioEnabled),
      musicEnabled: parseBoolean(parsed.musicEnabled, DEFAULT_SETTINGS.musicEnabled),
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
