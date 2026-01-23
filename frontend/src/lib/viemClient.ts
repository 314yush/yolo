import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { CHAIN_CONFIG } from './constants';
import { getDelegateAccount } from './delegateWallet';

// Public client for reading from Base
export const publicClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

// Flashblock client for faster tx broadcasting (~200ms preconfirmation)
// Uses Base Flashblocks RPC endpoint for optimistic preconfirmations
export const flashblockClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.flashblockRpcUrl),
});

/**
 * Create a wallet client for the delegate to sign transactions
 * Uses Flashblock RPC when enabled for faster preconfirmations
 */
export function createDelegateWalletClient() {
  const account = getDelegateAccount();
  
  // Use Flashblock RPC for broadcasting if enabled (faster preconfirmations)
  const rpcUrl = CHAIN_CONFIG.useFlashblock 
    ? CHAIN_CONFIG.flashblockRpcUrl 
    : CHAIN_CONFIG.rpcUrl;
  
  return createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });
}

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
