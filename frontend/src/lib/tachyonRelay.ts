/**
 * Tachyon Relay
 *
 * Handles relaying UserOperations via Tachyon:
 * - First trade: EIP-7702 authorization (makes embedded wallet a smart wallet)
 * - Future trades: Flash-blocks (sub-50ms execution)
 *
 * Based on: https://github.com/RathFinance/tachyon-examples/blob/main/ts-example/src/scripts/eip7702_4337.ts
 */

import { createPublicClient, http, type Hex, type Address } from 'viem';
import { base } from 'viem/chains';
import { entryPoint07Abi } from 'viem/account-abstraction';
import { ENTRY_POINT_ADDRESS } from './constants';
import { debug } from './debug';

// Logging prefix for easy filtering
const LOG_PREFIX = '[TachyonRelay]';

// Storage key prefix for EIP-7702 delegation status (keyed by wallet address)
const DELEGATION_STATUS_PREFIX = 'yolo_7702_';

export interface EIP7702Authorization {
  chainId: number;
  address: Address;
  nonce: number;
  r: Hex;
  s: Hex;
  v: number;
  yParity: 0 | 1;
}

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Check if wallet has EIP-7702 delegation set up
 */
export function isWalletDelegated(walletAddress: Address): boolean {
  if (typeof window === 'undefined') {
    debug(LOG_PREFIX, 'SSR context - assuming not delegated');
    return false;
  }
  const key = `${DELEGATION_STATUS_PREFIX}${walletAddress.toLowerCase()}`;
  const delegated = localStorage.getItem(key) === 'true';
  debug(LOG_PREFIX, `Delegation status for ${walletAddress}:`, delegated ? 'delegated' : 'not delegated');
  return delegated;
}

/**
 * Mark wallet as EIP-7702 delegated
 */
export function markWalletDelegated(walletAddress: Address): void {
  if (typeof window !== 'undefined') {
    const key = `${DELEGATION_STATUS_PREFIX}${walletAddress.toLowerCase()}`;
    localStorage.setItem(key, 'true');
    debug(LOG_PREFIX, `Marked ${walletAddress} as EIP-7702 delegated`);
  }
}

/**
 * Clear delegation status for a wallet (for testing/reset)
 */
export function clearDelegationStatus(walletAddress?: Address): void {
  if (typeof window !== 'undefined') {
    if (walletAddress) {
      const key = `${DELEGATION_STATUS_PREFIX}${walletAddress.toLowerCase()}`;
      localStorage.removeItem(key);
      debug(LOG_PREFIX, `Cleared delegation status for ${walletAddress}`);
    }
  }
}

/**
 * Get nonce for wallet from EntryPoint
 */
export async function getWalletNonce(walletAddress: Address): Promise<bigint> {
  debug(LOG_PREFIX, 'Getting nonce from EntryPoint for', walletAddress);

  try {
    const nonce = await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: entryPoint07Abi,
      functionName: 'getNonce',
      args: [walletAddress, BigInt(0)],
      blockTag: 'pending',
    });
    debug(LOG_PREFIX, 'Nonce:', nonce.toString());
    return nonce;
  } catch (error) {
    console.warn(LOG_PREFIX, 'Failed to get nonce, using 0:', error);
    return BigInt(0);
  }
}

// Legacy aliases for backward compatibility during migration
export const isDelegateDelegated = (): boolean => {
  // Without a specific address, check nothing — callers should use isWalletDelegated
  debug(LOG_PREFIX, 'isDelegateDelegated called without address — returning false');
  return false;
};
export const markDelegateDelegated = (): void => {
  debug(LOG_PREFIX, 'markDelegateDelegated called without address — no-op');
};
export const getDelegateNonce = getWalletNonce;
