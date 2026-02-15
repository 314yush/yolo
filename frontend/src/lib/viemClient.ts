import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CHAIN_CONFIG } from './constants';

// Public client for reading from Base
export const publicClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

// Flashblock client for faster tx broadcasting (~200ms preconfirmation)
export const flashblockClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.flashblockRpcUrl),
});

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(hash: `0x${string}`) {
  return publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });
}

/**
 * Get current block number
 */
export async function getBlockNumber() {
  return publicClient.getBlockNumber();
}

/**
 * Get ETH balance of an address
 */
export async function getBalance(address: `0x${string}`) {
  return publicClient.getBalance({ address });
}
