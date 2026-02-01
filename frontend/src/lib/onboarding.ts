/**
 * Track onboarding completion per user
 * Uses localStorage keyed by user address
 */

const STORAGE_KEY_PREFIX = 'yolo_onboarding_complete_';

/**
 * Check if user has completed onboarding
 */
export function hasCompletedOnboarding(userAddress: string | null): boolean {
  if (typeof window === 'undefined' || !userAddress) {
    return false;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
    return localStorage.getItem(key) === 'true';
  } catch (error) {
    console.error('Failed to check onboarding status:', error);
    return false;
  }
}

/**
 * Mark onboarding as complete for a user
 */
export function markOnboardingComplete(userAddress: string | null): void {
  if (typeof window === 'undefined' || !userAddress) {
    return;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
    localStorage.setItem(key, 'true');
  } catch (error) {
    console.error('Failed to mark onboarding complete:', error);
  }
}

/**
 * Clear onboarding status for a user (on logout)
 */
export function clearOnboardingStatus(userAddress: string | null): void {
  if (typeof window === 'undefined' || !userAddress) {
    return;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear onboarding status:', error);
  }
}
