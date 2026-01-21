import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { STORAGE_KEYS } from './constants';

export interface DelegateWallet {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * Get or create a delegate wallet stored in localStorage
 * This wallet is used to sign trades on behalf of the user
 */
export function getOrCreateDelegateWallet(): DelegateWallet {
  if (typeof window === 'undefined') {
    throw new Error('Cannot access localStorage on server');
  }

  let privateKey = localStorage.getItem(STORAGE_KEYS.DELEGATE_KEY) as `0x${string}` | null;

  if (!privateKey) {
    // Generate new delegate wallet
    privateKey = generatePrivateKey();
    localStorage.setItem(STORAGE_KEYS.DELEGATE_KEY, privateKey);
  }

  const account = privateKeyToAccount(privateKey);
  const address = account.address;

  // Also cache the address for quick access
  localStorage.setItem(STORAGE_KEYS.DELEGATE_ADDRESS, address);

  return { privateKey, address };
}

/**
 * Get delegate address without exposing private key
 */
export function getDelegateAddress(): `0x${string}` | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Try cached address first
  const cachedAddress = localStorage.getItem(STORAGE_KEYS.DELEGATE_ADDRESS);
  if (cachedAddress) {
    return cachedAddress as `0x${string}`;
  }

  // If we have a key but no cached address, derive it
  const privateKey = localStorage.getItem(STORAGE_KEYS.DELEGATE_KEY);
  if (privateKey) {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    localStorage.setItem(STORAGE_KEYS.DELEGATE_ADDRESS, account.address);
    return account.address;
  }

  return null;
}

/**
 * Check if delegate wallet exists
 */
export function hasDelegateWallet(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!localStorage.getItem(STORAGE_KEYS.DELEGATE_KEY);
}

/**
 * Clear delegate wallet (for logout/reset)
 */
export function clearDelegateWallet(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(STORAGE_KEYS.DELEGATE_KEY);
  localStorage.removeItem(STORAGE_KEYS.DELEGATE_ADDRESS);
}

/**
 * Get the viem account for signing
 */
export function getDelegateAccount() {
  const { privateKey } = getOrCreateDelegateWallet();
  return privateKeyToAccount(privateKey);
}
