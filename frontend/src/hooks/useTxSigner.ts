'use client';

import { useCallback, useState } from 'react';
import { AVANTIS_CONTRACTS, ERC20_ALLOWANCE_ABI } from '@/lib/avantisEncoder';
import { relayService } from '@/lib/relayService';
import { publicClient } from '@/lib/viemClient';
import { usePrivyEmbeddedWallet } from './usePrivyEmbeddedWallet';
import { useTradeStore } from '@/store/tradeStore';
import type { UnsignedTx } from '@/types';
import { debug } from '@/lib/debug';

const LOG_PREFIX = '[useTxSigner]';

// Minimum USDC allowance considered "sufficient" (10,000 USDC in 6 decimals)
const MIN_SUFFICIENT_ALLOWANCE = 10_000n * 10n ** 6n;

/**
 * Transaction signer hook — uses Privy embedded wallet + Tachyon relay
 *
 * - Embedded wallet signs everything server-side (no user popups)
 * - First trade: detects USDC allowance, bundles approve + trade in batch
 * - All trades go through Tachyon for gas sponsorship
 */
export function useTxSigner() {
  const [isPending, setIsPending] = useState(false);
  const { address: embeddedAddress, signMessage, signAuthorization } = usePrivyEmbeddedWallet();
  const setDelegateStatus = useTradeStore((s) => s.setDelegateStatus);

  /**
   * Check USDC allowance on-chain to determine if first trade needs approval
   */
  const checkNeedsApproval = useCallback(async (): Promise<boolean> => {
    if (!embeddedAddress) return true;
    try {
      const allowance = await publicClient.readContract({
        address: AVANTIS_CONTRACTS.USDC,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: 'allowance',
        args: [embeddedAddress, AVANTIS_CONTRACTS.TradingStorage],
      });
      return (allowance as bigint) < MIN_SUFFICIENT_ALLOWANCE;
    } catch {
      // If we can't check, assume approval needed
      return true;
    }
  }, [embeddedAddress]);

  /**
   * Sign and broadcast a transaction using Tachyon UserOperation relay
   */
  const signAndBroadcast = useCallback(
    async (unsignedTx: UnsignedTx): Promise<`0x${string}`> => {
      debug(LOG_PREFIX, '═══════════════════════════════════════');
      debug(LOG_PREFIX, 'Sign and broadcast requested');
      debug(LOG_PREFIX, '═══════════════════════════════════════');

      if (!embeddedAddress) {
        throw new Error('Embedded wallet not ready');
      }

      setIsPending(true);

      try {
        debug(LOG_PREFIX, 'Embedded wallet:', embeddedAddress);

        // Validate this is a trade transaction (to Avantis Trading contract)
        const isTradeTx = unsignedTx.to.toLowerCase() === AVANTIS_CONTRACTS.Trading.toLowerCase();
        if (!isTradeTx) {
          throw new Error(
            `Tachyon relay only supports Avantis Trading transactions. ` +
            `Target: ${unsignedTx.to}, Expected: ${AVANTIS_CONTRACTS.Trading}`
          );
        }

        // Detect if first trade (needs USDC approval bundled)
        const needsApproval = await checkNeedsApproval();
        debug(LOG_PREFIX, 'Needs USDC approval:', needsApproval);

        const currentProvider = relayService.getCurrentProviderType();
        debug(LOG_PREFIX, `Relaying via ${currentProvider}...`);
        const startTime = Date.now();

        const txValue = unsignedTx.value ? BigInt(unsignedTx.value) : BigInt(0);

        // Relay trade via relay service
        const result = await relayService.relayTrade({
          senderAddress: embeddedAddress,
          targetContract: unsignedTx.to as `0x${string}`,
          calldata: unsignedTx.data as `0x${string}`,
          value: txValue,
          signMessage,
          signAuthorization,
          needsApproval,
        });

        const txHash = result.txHash;
        const elapsed = Date.now() - startTime;
        debug(LOG_PREFIX, 'TX Hash:', txHash);
        debug(LOG_PREFIX, 'Time:', elapsed, 'ms');

        // After successful first trade (which bundled USDC approval), mark approved
        if (needsApproval) {
          setDelegateStatus({ isSetup: true, usdcApproved: true });
          debug(LOG_PREFIX, 'USDC approval bundled in first trade — marked usdcApproved');
        }

        return txHash;
      } catch (error) {
        console.error(LOG_PREFIX, 'Transaction failed:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [embeddedAddress, signMessage, signAuthorization, checkNeedsApproval, setDelegateStatus]
  );

  /**
   * Sign, broadcast, and wait for confirmation
   * Note: Tachyon.waitForExecutionHash already waits for confirmation
   */
  const signAndWait = useCallback(
    async (unsignedTx: UnsignedTx) => {
      const hash = await signAndBroadcast(unsignedTx);
      return { hash, receipt: null };
    },
    [signAndBroadcast]
  );

  return {
    signAndBroadcast,
    signAndWait,
    isPending,
  };
}
