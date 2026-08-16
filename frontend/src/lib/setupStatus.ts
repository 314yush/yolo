/**
 * Persist trading-setup status to localStorage, keyed by user address.
 *
 * Since the v2 cutover the only on-chain prerequisite for trading is the USDC
 * allowance: intents are signed by the user's own wallet, so there is no
 * delegate to register.
 */

import type { SetupStatus } from '@/types';

const STORAGE_KEY_PREFIX = 'yolo_setup_status_';

function keyFor(userAddress: string): string {
  return `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
}

export function loadSetupStatus(userAddress: string | null): SetupStatus | null {
  if (typeof window === 'undefined' || !userAddress) {
    return null;
  }

  try {
    const stored = localStorage.getItem(keyFor(userAddress));
    if (!stored) return null;

    const parsed = JSON.parse(stored) as SetupStatus;
    if (
      typeof parsed === 'object' &&
      typeof parsed.isSetup === 'boolean' &&
      typeof parsed.usdcApproved === 'boolean'
    ) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load setup status:', error);
  }

  return null;
}

export function saveSetupStatus(userAddress: string | null, status: SetupStatus): void {
  if (typeof window === 'undefined' || !userAddress) {
    return;
  }

  try {
    localStorage.setItem(keyFor(userAddress), JSON.stringify(status));
  } catch (error) {
    console.error('Failed to save setup status:', error);
  }
}

export function clearSetupStatus(userAddress: string | null): void {
  if (typeof window === 'undefined' || !userAddress) {
    return;
  }

  try {
    localStorage.removeItem(keyFor(userAddress));
  } catch (error) {
    console.error('Failed to clear setup status:', error);
  }
}
