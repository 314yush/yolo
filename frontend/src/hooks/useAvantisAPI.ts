'use client';

import { useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { fetchTrades, fetchPnL } from '@/lib/avantisApi';
import { publicClient } from '@/lib/viemClient';
import {
  buildSetDelegateTx,
  buildUsdcApprovalTx as buildUsdcApprovalTxDirect,
  AVANTIS_CONTRACTS,
  DELEGATIONS_ABI,
  ERC20_ALLOWANCE_ABI,
} from '@/lib/avantisEncoder';
import type { UnsignedTx } from '@/types';

// Minimum USDC allowance considered "sufficient" (1 million USDC in 6 decimals)
const MIN_SUFFICIENT_ALLOWANCE = 1_000_000n * 10n ** 6n;

export function useAvantisAPI() {
  // Build delegation setup transaction - Direct encoding (no backend!)
  const buildDelegateSetupTx = useCallback(
    async (_trader: string, delegateAddress: string): Promise<UnsignedTx | null> => {
      try {
        const tx = buildSetDelegateTx(delegateAddress as `0x${string}`);
        return {
          to: tx.to,
          data: tx.data,
          value: tx.value,
          chainId: tx.chainId,
        };
      } catch (error) {
        console.error('Failed to build delegate setup tx:', error);
        return null;
      }
    },
    []
  );

  // Check delegate status - Direct contract read (no backend!)
  const checkDelegateStatus = useCallback(
    async (trader: string) => {
      try {
        const delegateAddress = await publicClient.readContract({
          address: AVANTIS_CONTRACTS.Trading,
          abi: DELEGATIONS_ABI,
          functionName: 'delegations',
          args: [trader as `0x${string}`],
        });

        const isSetup = delegateAddress !== '0x0000000000000000000000000000000000000000';
        return {
          isSetup,
          delegateAddress: isSetup ? delegateAddress : null,
          error: null,
        };
      } catch (error) {
        console.error('Failed to check delegate status:', error);
        return { isSetup: false, delegateAddress: null, error: 'Failed to read contract' };
      }
    },
    []
  );

  // Build USDC approval transaction - Direct encoding (no backend!)
  const buildUsdcApprovalTx = useCallback(
    async (_trader: string): Promise<UnsignedTx | null> => {
      try {
        const tx = buildUsdcApprovalTxDirect();
        return {
          to: tx.to,
          data: tx.data,
          value: tx.value,
          chainId: tx.chainId,
        };
      } catch (error) {
        console.error('Failed to build USDC approval tx:', error);
        return null;
      }
    },
    []
  );

  // Check USDC allowance - Direct contract read (no backend!)
  const checkUsdcAllowance = useCallback(
    async (trader: string): Promise<{ hasSufficient: boolean; allowance: number }> => {
      try {
        const allowance = await publicClient.readContract({
          address: AVANTIS_CONTRACTS.USDC,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [trader as `0x${string}`, AVANTIS_CONTRACTS.TradingStorage],
        });

        // Convert from 6 decimals to human readable
        const allowanceNumber = Number(allowance) / 1e6;
        const hasSufficient = allowance >= MIN_SUFFICIENT_ALLOWANCE;

        return { hasSufficient, allowance: allowanceNumber };
      } catch (error) {
        console.error('Failed to check USDC allowance:', error);
        return { hasSufficient: false, allowance: 0 };
      }
    },
    []
  );

  // Get open trades - Direct from Avantis API (no backend!)
  const getTrades = useCallback(async (address: string) => {
    try {
      return await fetchTrades(address);
    } catch {
      return [];
    }
  }, []);

  // Get PnL for all positions - Direct from Avantis API + Pyth prices (no backend!)
  const getPnL = useCallback(async (address: string) => {
    try {
      const currentPrices = useTradeStore.getState().prices;
      return await fetchPnL(address, currentPrices);
    } catch {
      return [];
    }
  }, []);

  return {
    // Setup operations - Direct encoding (no backend!)
    buildDelegateSetupTx,
    checkDelegateStatus,
    buildUsdcApprovalTx,
    checkUsdcAllowance,
    // Read operations - Direct from Avantis API (no backend!)
    getTrades,
    getPnL,
  };
}
