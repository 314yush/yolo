/**
 * Access code management - localStorage cache + API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getAccessKey(wallet: string): string {
  return `yolo_access_${wallet.toLowerCase()}`;
}

// ============================================================
// localStorage helpers (cache) - per-wallet
// ============================================================

export function hasLocalAccess(walletAddress: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !walletAddress) return false;
  return localStorage.getItem(getAccessKey(walletAddress)) === 'true';
}

export function setLocalAccess(walletAddress: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getAccessKey(walletAddress), 'true');
}

export function clearLocalAccess(walletAddress?: string | null): void {
  if (typeof window === 'undefined') return;
  if (walletAddress) {
    localStorage.removeItem(getAccessKey(walletAddress));
  } else {
    // Clear all access keys on logout (keys follow pattern yolo_access_0x...)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('yolo_access_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
}

// ============================================================
// API helpers
// ============================================================

export interface CheckAccessResponse {
  hasAccess: boolean;
}

export interface RedeemCodeResponse {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Check if a wallet address has access (from backend DB)
 */
export async function checkWalletAccess(walletAddress: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/access/check/${walletAddress.toLowerCase()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('Access check failed:', response.status);
      return false;
    }
    
    const data: CheckAccessResponse = await response.json();
    return data.hasAccess === true;
  } catch (error) {
    console.error('Access check error:', error);
    return false; // Fail closed on network error
  }
}

/**
 * Redeem an access code and bind it to a wallet address
 */
export async function redeemAccessCode(
  code: string,
  walletAddress: string
): Promise<RedeemCodeResponse> {
  try {
    const response = await fetch(`${API_URL}/access/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.toUpperCase().trim(),
        wallet_address: walletAddress.toLowerCase(),
      }),
    });
    
    const data: RedeemCodeResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Redeem code error:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Connection failed. Please try again.',
    };
  }
}

// ============================================================
// Error message helpers
// ============================================================

export function getErrorMessage(error?: string): string {
  const messages: Record<string, string> = {
    invalid_code: 'Code not recognized. Check for typos.',
    already_used: 'This code has already been used.',
    rate_limited: 'Too many attempts. Wait a moment.',
    network_error: 'Connection failed. Please try again.',
  };
  return messages[error || ''] || 'Something went wrong. Try again.';
}
