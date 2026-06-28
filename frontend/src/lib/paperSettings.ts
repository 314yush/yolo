import type { Settings } from '@/types';
import {
  DEFAULT_SETTINGS,
  clampCollateral,
  clampTakeProfitPercent,
} from './settings';

const SETTINGS_KEY_PREFIX = 'yolo_paper_settings_';

/** Default stake for paper mode (independent of live trading settings). */
export const PAPER_DEFAULT_COLLATERAL = 10;

export const PAPER_DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  collateral: PAPER_DEFAULT_COLLATERAL,
};

function settingsKey(guestId: string): string {
  return `${SETTINGS_KEY_PREFIX}${guestId}`;
}

export function loadPaperSettings(guestId: string): Settings {
  if (typeof window === 'undefined') {
    return PAPER_DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(settingsKey(guestId));
    if (!stored) return PAPER_DEFAULT_SETTINGS;

    const parsed = JSON.parse(stored);
    return {
      collateral: typeof parsed.collateral === 'number'
        ? clampCollateral(parsed.collateral)
        : PAPER_DEFAULT_SETTINGS.collateral,
      takeProfitPercent: typeof parsed.takeProfitPercent === 'number'
        ? clampTakeProfitPercent(parsed.takeProfitPercent)
        : PAPER_DEFAULT_SETTINGS.takeProfitPercent,
      audioEnabled: typeof parsed.audioEnabled === 'boolean'
        ? parsed.audioEnabled
        : PAPER_DEFAULT_SETTINGS.audioEnabled,
      musicEnabled: typeof parsed.musicEnabled === 'boolean'
        ? parsed.musicEnabled
        : PAPER_DEFAULT_SETTINGS.musicEnabled,
    };
  } catch {
    return PAPER_DEFAULT_SETTINGS;
  }
}

export function savePaperSettings(guestId: string, settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(settingsKey(guestId), JSON.stringify(settings));
  } catch (error) {
    console.error('[paperSettings] Failed to save:', error);
  }
}
