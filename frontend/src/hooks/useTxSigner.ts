'use client';

import { useCallback, useState } from 'react';
import { getOrCreateDelegateWallet } from '@/lib/delegateWallet';
import { isDelegateDelegated } from '@/lib/tachyonRelay';
import { AVANTIS_CONTRACTS } from '@/lib/avantisEncoder';
import { relayService } from '@/lib/relayService';
import type { UnsignedTx } from '@/types';

const LOG_PREFIX = '[useTxSigner]';

/**
 * Transaction signer hook - uses Tachyon for gas sponsorship
 * 
 * With Tachyon EIP-7702 integration:
 * - Delegate wallet no longer needs ETH for gas
 * - First trade includes EIP-7702 authorization (~150ms)
 * - Future trades use flash-blocks (sub-50ms!)
 */
export function useTxSigner() {
  const [isPending, setIsPending] = useState(false);

  /**
   * Check if delegate has enough ETH for gas
   * NOTE: With Tachyon gas sponsorship, delegate doesn't need ETH anymore!
   * This function is kept for backward compatibility but always returns true.
   */
  const checkDelegateBalance = useCallback(async (): Promise<{ hasEnough: boolean; balance: bigint }> => {
    console.log(LOG_PREFIX, '✅ Gas check: Tachyon sponsors gas, delegate needs no ETH');
    // With Tachyon gas sponsorship, delegate doesn't need ETH
    // Always return true - gas is paid by Tachyon
    return { hasEnough: true, balance: BigInt(0) };
  }, []);

  /**
   * Sign and broadcast a transaction using Tachyon UserOperation relay
   */
  const signAndBroadcast = useCallback(
    async (unsignedTx: UnsignedTx): Promise<`0x${string}`> => {
      console.log(LOG_PREFIX, '═══════════════════════════════════════');
      console.log(LOG_PREFIX, '🎯 Sign and broadcast requested');
      console.log(LOG_PREFIX, '═══════════════════════════════════════');
      
      setIsPending(true);
      
      try {
        // Get delegate wallet
        console.log(LOG_PREFIX, '🔑 Getting delegate wallet...');
        const wallet = getOrCreateDelegateWallet();
        console.log(LOG_PREFIX, '  Delegate address:', wallet.address);
        console.log(LOG_PREFIX, '  Already delegated (EIP-7702):', isDelegateDelegated());
        
        // Log transaction details
        console.log(LOG_PREFIX, '📋 Transaction:');
        console.log(LOG_PREFIX, '  To:', unsignedTx.to);
        console.log(LOG_PREFIX, '  Data length:', unsignedTx.data?.length || 0, 'chars');
        console.log(LOG_PREFIX, '  Value:', unsignedTx.value || '0');
        
        // Validate this is a trade transaction (to Avantis Trading contract)
        const isTradeTx = unsignedTx.to.toLowerCase() === AVANTIS_CONTRACTS.Trading.toLowerCase();
        console.log(LOG_PREFIX, '  Is Avantis trade:', isTradeTx);
        console.log(LOG_PREFIX, '  Expected:', AVANTIS_CONTRACTS.Trading);
        
        if (!isTradeTx) {
          const error = new Error(
            `Tachyon relay only supports Avantis Trading transactions. ` +
            `Target: ${unsignedTx.to}, Expected: ${AVANTIS_CONTRACTS.Trading}`
          );
          console.error(LOG_PREFIX, '❌', error.message);
          throw error;
        }

        const currentProvider = relayService.getCurrentProviderType();
        console.log(LOG_PREFIX, `🚀 Relaying trade via ${currentProvider}...`);
        const startTime = Date.now();
        
        // Parse value from unsignedTx (if present)
        const txValue = unsignedTx.value ? BigInt(unsignedTx.value) : BigInt(0);
        console.log(LOG_PREFIX, '  Parsed value:', txValue.toString(), 'wei (', Number(txValue) / 1e18, 'ETH)');
        
        // Check Avantis delegate status before trading
        // This is critical - if delegate is not registered in Avantis, delegatedAction will revert
        try {
          const delegateCheckStart = Date.now();
          const { publicClient } = await import('@/lib/viemClient');
          const { AVANTIS_CONTRACTS, DELEGATIONS_ABI } = await import('@/lib/avantisEncoder');
          // Extract user address from calldata (first 20 bytes after function selector in delegatedAction)
          // delegatedAction(address trader, bytes calldata) - trader is padded to 32 bytes after 4-byte selector
          const calldataHex = unsignedTx.data as `0x${string}`;
          // Skip 4 bytes selector (8 hex chars) + 12 bytes padding (24 hex chars) = 32 hex chars, then read 20 bytes (40 hex chars)
          const userAddressFromCalldata = ('0x' + calldataHex.slice(10 + 24, 10 + 24 + 40)) as `0x${string}`;
          
          const registeredDelegate = await publicClient.readContract({
            address: AVANTIS_CONTRACTS.Trading,
            abi: DELEGATIONS_ABI,
            functionName: 'delegations',
            args: [userAddressFromCalldata],
          });
          const delegateCheckTime = Date.now() - delegateCheckStart;
          if (delegateCheckTime > 100) {
            console.log(LOG_PREFIX, `⏱️  Avantis delegate check took ${delegateCheckTime}ms`);
          }
          const isDelegateRegistered = registeredDelegate?.toString().toLowerCase() === wallet.address.toLowerCase();
          
          if (!isDelegateRegistered) {
            const error = new Error(
              `Avantis delegate not set up! The Trading contract doesn't recognize this delegate. ` +
              `User: ${userAddressFromCalldata}, Expected delegate: ${wallet.address}, ` +
              `Registered delegate: ${registeredDelegate}. ` +
              `Please complete the Setup Flow first (setDelegate + approveUSDC).`
            );
            console.error(LOG_PREFIX, '❌', error.message);
            throw error;
          }
          
          console.log(LOG_PREFIX, '✅ Avantis delegate verified:', wallet.address);
        } catch (e: any) {
          // If it's our own error about delegate not registered, re-throw it
          if (e.message?.includes('Avantis delegate not set up')) {
            throw e;
          }
          // Otherwise log and continue (might be RPC issue)
          console.warn(LOG_PREFIX, '⚠️ Could not verify Avantis delegate (continuing anyway):', e);
        }
        
        // Use relay service (supports multiple providers)
        const result = await relayService.relayTrade({
          delegatePrivateKey: wallet.privateKey,
          targetContract: unsignedTx.to as `0x${string}`,
          calldata: unsignedTx.data as `0x${string}`,
          value: txValue,
        });
        
        const txHash = result.txHash;

        const elapsed = Date.now() - startTime;
        console.log(LOG_PREFIX, '🎉 Transaction confirmed!');
        console.log(LOG_PREFIX, '  TX Hash:', txHash);
        console.log(LOG_PREFIX, '  Time:', elapsed, 'ms');
        console.log(LOG_PREFIX, '═══════════════════════════════════════');
        
        return txHash;
      } catch (error) {
        console.error(LOG_PREFIX, '❌ Transaction failed:', error);
        console.error(LOG_PREFIX, '  Stack:', (error as Error).stack);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  /**
   * Sign, broadcast, and wait for confirmation
   * Note: Tachyon.waitForExecutionHash already waits for confirmation
   */
  const signAndWait = useCallback(
    async (unsignedTx: UnsignedTx) => {
      console.log(LOG_PREFIX, '📨 signAndWait called');
      const hash = await signAndBroadcast(unsignedTx);
      // Tachyon already waits for execution, so hash is the confirmed tx hash
      // Receipt is not available from Tachyon, return null
      console.log(LOG_PREFIX, '✅ signAndWait complete, hash:', hash);
      return { hash, receipt: null };
    },
    [signAndBroadcast]
  );

  return {
    signAndBroadcast,
    signAndWait,
    checkDelegateBalance,
    isPending,
  };
}
