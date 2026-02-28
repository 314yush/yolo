'use client';

import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { getOrCreateDelegateWallet } from '@/lib/delegateWallet';
import { isDelegateDelegated } from '@/lib/tachyonRelay';
import { AVANTIS_CONTRACTS } from '@/lib/avantisEncoder';
import { relayService } from '@/lib/relayService';
import type { UnsignedTx } from '@/types';
import { debug } from '@/lib/debug';
import { USE_PRIVY_EXECUTION_WALLET } from '@/lib/constants';
import { useTradeStore } from '@/store/tradeStore';
import { buildPrivyRelayRequest } from '@/lib/tachyonPrivy';
import { getWalletProvider, resolvePrivyEmbeddedWallet, type PrivyWalletLike } from '@/lib/privyWallet';

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
  const userAddress = useTradeStore((state) => state.userAddress);
  const { wallets, ready: walletsReady } = useWallets();

  /**
   * Check if delegate has enough ETH for gas
   * NOTE: With Tachyon gas sponsorship, delegate doesn't need ETH anymore!
   * This function is kept for backward compatibility but always returns true.
   */
  const checkDelegateBalance = useCallback(async (): Promise<{ hasEnough: boolean; balance: bigint }> => {
    debug(LOG_PREFIX, '✅ Gas check: Tachyon sponsors gas, delegate needs no ETH');
    // With Tachyon gas sponsorship, delegate doesn't need ETH
    // Always return true - gas is paid by Tachyon
    return { hasEnough: true, balance: BigInt(0) };
  }, []);

  /**
   * Sign and broadcast a transaction using Tachyon UserOperation relay
   */
  const signAndBroadcast = useCallback(
    async (unsignedTx: UnsignedTx): Promise<`0x${string}`> => {
      debug(LOG_PREFIX, '═══════════════════════════════════════');
      debug(LOG_PREFIX, '🎯 Sign and broadcast requested');
      debug(LOG_PREFIX, '═══════════════════════════════════════');
      
      setIsPending(true);
      
      try {
        const isTradeTx = unsignedTx.to.toLowerCase() === AVANTIS_CONTRACTS.Trading.toLowerCase();
        if (!isTradeTx) {
          throw new Error(
            `Tachyon relay only supports Avantis Trading transactions. ` +
              `Target: ${unsignedTx.to}, Expected: ${AVANTIS_CONTRACTS.Trading}`
          );
        }

        if (USE_PRIVY_EXECUTION_WALLET) {
          if (!userAddress) {
            throw new Error('Missing Privy wallet address');
          }
          if (!walletsReady) {
            throw new Error('Wallet still initializing. Please retry in a moment.');
          }
          debug(LOG_PREFIX, 'Privy signer preflight:', {
            walletsReady,
            walletCount: wallets?.length || 0,
            userAddress,
          });

          const walletResult = resolvePrivyEmbeddedWallet(wallets as PrivyWalletLike[] | undefined, userAddress);
          if (!walletResult.wallet) {
            throw new Error(walletResult.error || 'No embedded wallet available');
          }
          const provider = await getWalletProvider(walletResult.wallet);
          const relayRequest = await buildPrivyRelayRequest({
            provider,
            walletAddress: userAddress,
            targetContract: unsignedTx.to as `0x${string}`,
            calldata: unsignedTx.data as `0x${string}`,
            value: unsignedTx.value ? BigInt(unsignedTx.value) : BigInt(0),
          });

          const response = await fetch('/api/tachyon/relay-trade', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(relayRequest),
          });
          const payload = await response.json();
          if (!response.ok || !payload?.txHash) {
            throw new Error(payload?.error || 'Server relay failed');
          }

          const txHash = payload.txHash as `0x${string}`;
          debug(LOG_PREFIX, '✅ Privy signer relay success:', txHash);
          return txHash;
        }

        // Get delegate wallet
        debug(LOG_PREFIX, '🔑 Getting delegate wallet...');
        const wallet = getOrCreateDelegateWallet();
        debug(LOG_PREFIX, '  Delegate address:', wallet.address);
        debug(LOG_PREFIX, '  Already delegated (EIP-7702):', isDelegateDelegated());
        
        // Log transaction details
        debug(LOG_PREFIX, '📋 Transaction:');
        debug(LOG_PREFIX, '  To:', unsignedTx.to);
        debug(LOG_PREFIX, '  Data length:', unsignedTx.data?.length || 0, 'chars');
        debug(LOG_PREFIX, '  Value:', unsignedTx.value || '0');

        const currentProvider = relayService.getCurrentProviderType();
        debug(LOG_PREFIX, `🚀 Relaying trade via ${currentProvider}...`);
        const startTime = Date.now();
        
        // Parse value from unsignedTx (if present)
        const txValue = unsignedTx.value ? BigInt(unsignedTx.value) : BigInt(0);
        debug(LOG_PREFIX, '  Parsed value:', txValue.toString(), 'wei (', Number(txValue) / 1e18, 'ETH)');
        
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
            debug(LOG_PREFIX, `⏱️  Avantis delegate check took ${delegateCheckTime}ms`);
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
          
          debug(LOG_PREFIX, '✅ Avantis delegate verified:', wallet.address);
        } catch (e: unknown) {
          // If it's our own error about delegate not registered, re-throw it
          if (e instanceof Error && e.message.includes('Avantis delegate not set up')) {
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
        debug(LOG_PREFIX, '🎉 Transaction confirmed!');
        debug(LOG_PREFIX, '  TX Hash:', txHash);
        debug(LOG_PREFIX, '  Time:', elapsed, 'ms');
        debug(LOG_PREFIX, '═══════════════════════════════════════');
        
        return txHash;
      } catch (error) {
        console.error(LOG_PREFIX, '❌ Transaction failed:', error);
        console.error(LOG_PREFIX, '  Stack:', (error as Error).stack);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [userAddress, wallets, walletsReady]
  );

  /**
   * Sign, broadcast, and wait for confirmation
   * Note: Tachyon.waitForExecutionHash already waits for confirmation
   */
  const signAndWait = useCallback(
    async (unsignedTx: UnsignedTx) => {
      debug(LOG_PREFIX, '📨 signAndWait called');
      const hash = await signAndBroadcast(unsignedTx);
      // Tachyon already waits for execution, so hash is the confirmed tx hash
      // Receipt is not available from Tachyon, return null
      debug(LOG_PREFIX, '✅ signAndWait complete, hash:', hash);
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
