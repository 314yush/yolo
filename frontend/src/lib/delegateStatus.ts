/**
 * Persist delegate status to localStorage
 * Keyed by user address so different users can have different statuses
 */

import type { DelegateStatus } from '@/types';

const STORAGE_KEY_PREFIX = 'yolo_delegate_status_';

/**
 * Get delegate status from localStorage for a specific user
 */
export function loadDelegateStatus(userAddress: string | null): DelegateStatus | null {
  if (typeof window === 'undefined' || !userAddress) {
    return null;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as DelegateStatus;
    // Validate structure
    if (
      typeof parsed === 'object' &&
      typeof parsed.isSetup === 'boolean' &&
      (parsed.delegateAddress === null || typeof parsed.delegateAddress === 'string') &&
      typeof parsed.usdcApproved === 'boolean'
    ) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load delegate status:', error);
  }

  return null;
}

/**
 * Save delegate status to localStorage for a specific user
 */
export function saveDelegateStatus(userAddress: string | null, status: DelegateStatus): void {
  if (typeof window === 'undefined' || !userAddress) {
    return;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify(status));
  } catch (error) {
    console.error('Failed to save delegate status:', error);
  }
}

/**
 * Clear delegate status for a specific user (on logout)
 */
export function clearDelegateStatus(userAddress: string | null): void {
  if (typeof window === 'undefined' || !userAddress) {
    return;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear delegate status:', error);
  }
}
