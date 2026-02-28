/**
 * Tachyon SDK Client
 * 
 * Provides gas sponsorship for delegate wallet transactions via EIP-7702.
 * - First trade: EIP-7702 authorization (sets up delegation, ~150ms)
 * - Future trades: Flash-blocks (sub-50ms execution!)
 */

import { Tachyon } from '@rathfi/tachyon';
import { TACHYON_API_KEY } from './constants';
import { debug } from './debug';

// Validate API key on initialization
const apiKey = TACHYON_API_KEY;
if (!apiKey) {
  debug('[Tachyon] No API key found');
} else {
  debug('[Tachyon] ✅ API key configured (length:', apiKey.length, ')');
}

// Initialize Tachyon SDK
export const tachyon = new Tachyon({
  apiKey: apiKey,
});

/**
 * Check if Tachyon is properly configured
 */
export function isTachyonConfigured(): boolean {
  const configured = !!apiKey && apiKey.length > 0;
  if (!configured) {
    debug('[Tachyon] SDK not configured - missing API key');
  }
  return configured;
}

// Re-export constants for convenience
export { 
  ENTRY_POINT_ADDRESS, 
  ERC4337_DELEGATION_CONTRACT,
  TACHYON_BENEFICIARY,
} from './constants';
