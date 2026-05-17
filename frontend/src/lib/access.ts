/**
 * Access code management - localStorage cache + API calls
 */

import { logger } from './logger';

const API_BASE = '/api/backend';

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
 * Check if backend is reachable. Call this to diagnose connection issues.
 */
export async function checkBackendConnection(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  url?: string;
}> {
  const url = `${API_BASE}/health`;
  try {
    const response = await fetch(url);
    return {
      ok: response.ok,
      status: response.status,
      url: API_BASE,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: errMsg,
      url: API_BASE,
    };
  }
}

/**
 * Check if a wallet address has access (from backend DB)
 */
export async function checkWalletAccess(walletAddress: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/access/check/${walletAddress.toLowerCase()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      logger.error('Access check failed:', response.status);
      return false;
    }
    
    const data: CheckAccessResponse = await response.json();
    return data.hasAccess === true;
  } catch (error) {
    logger.error('Access check error:', error);
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
  if (!walletAddress?.trim()) {
    return {
      success: false,
      error: 'invalid_wallet',
      message: 'Wallet not ready.',
    };
  }

  const url = `${API_BASE}/access/redeem`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.toUpperCase().trim(),
        wallet_address: walletAddress.toLowerCase(),
      }),
    });

    const text = await response.text();
    let data: RedeemCodeResponse;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Backend returned non-JSON (e.g. 502/503 HTML from Railway)
      logger.error('Redeem code: backend returned non-JSON', response.status, url);
      return {
        success: false,
        error: 'network_error',
        message: `Backend error (${response.status}). Your API may be down or restarting.`,
      };
    }

    if (!response.ok) {
      logger.error('Redeem code: backend error', response.status, data);
    }
    return data;
  } catch (error) {
    // fetch threw: network failure, CORS, connection refused, etc.
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Redeem code error:', errMsg, 'URL:', url);
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
    invalid_wallet: 'Wallet not ready. Please wait and try again.',
  };
  return messages[error || ''] || 'Something went wrong. Try again.';
}
