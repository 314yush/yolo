'use client';

import { useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { fetchTrades, fetchPnL, fetchClosedTrades, fetchTotalVolume } from '@/lib/avantisApi';
import { publicClient } from '@/lib/viemClient';
import {
  buildSetDelegateTx,
  buildUsdcApprovalTx as buildUsdcApprovalTxDirect,
  AVANTIS_CONTRACTS,
  DELEGATIONS_ABI,
  ERC20_ALLOWANCE_ABI,
} from '@/lib/avantisEncoder';
import type { UnsignedTx } from '@/types';

// Minimum USDC allowance considered "sufficient" (10,000 USDC in 6 decimals)
const MIN_SUFFICIENT_ALLOWANCE = 10_000n * 10n ** 6n;

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

  // Check delegate status - Direct contract read with retries (no backend!)
  const checkDelegateStatus = useCallback(
    async (trader: string) => {
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
            continue;
          }
          console.error('Failed to check delegate status after retries:', error);
          return { isSetup: false, delegateAddress: null, error: 'Failed to read contract' };
        }
      }
      return { isSetup: false, delegateAddress: null, error: 'Failed to read contract' };
    },
    []
  );

  // Build USDC approval transaction - Direct encoding (no backend!)
  // Approves 10,000 USDC limit
  const buildUsdcApprovalTx = useCallback(
    async (_trader: string): Promise<UnsignedTx | null> => {
      try {
        // 10,000 USDC in 6 decimals
        const approvalLimit = 10_000n * 10n ** 6n;
        const tx = buildUsdcApprovalTxDirect(approvalLimit);
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

  // Check USDC allowance - Direct contract read with retries (no backend!)
  const checkUsdcAllowance = useCallback(
    async (trader: string): Promise<{ hasSufficient: boolean; allowance: number }> => {
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
            continue;
          }
          console.error('Failed to check USDC allowance after retries:', error);
          return { hasSufficient: false, allowance: 0 };
        }
      }
      return { hasSufficient: false, allowance: 0 };
    },
    []
  );

  // Get open trades - Direct from Avantis API (no backend!)
  const getTrades = useCallback(async (address: string) => {
    try {
      return await fetchTrades(address);
    } catch (error) {
      console.error('[useAvantisAPI] Failed to fetch trades:', error);
      // Return empty array on error to prevent hanging
      return [];
    }
  }, []);

  // Get PnL for all positions - Via backend proxy (or direct Avantis API fallback) + Pyth prices
  const getPnL = useCallback(async (address: string) => {
    try {
      const currentPrices = useTradeStore.getState().prices;
      return await fetchPnL(address, currentPrices);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[useAvantisAPI] Failed to fetch PnL:', msg);
      if (msg.includes('Cannot reach API') || msg.includes('backend')) {
        console.warn('[useAvantisAPI] Hint: Start the backend with "cd backend && uvicorn app.main:app" to fix PnL updates.');
      }
      return [];
    }
  }, []);

  // Get closed trades from Avantis portfolio history API
  const getClosedTrades = useCallback(async (address: string, pageNumber: number = 1) => {
    try {
      return await fetchClosedTrades(address, pageNumber);
    } catch (error) {
      console.error('[useAvantisAPI] Failed to fetch closed trades:', error);
      // Return empty array on error to prevent hanging
      return [];
    }
  }, []);

  // Get total historic volume from Avantis (open + closed positions)
  const getTotalVolume = useCallback(async (address: string) => {
    try {
      return await fetchTotalVolume(address);
    } catch (error) {
      console.error('[useAvantisAPI] Failed to fetch total volume:', error);
      return 0;
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
    getClosedTrades,
    getTotalVolume,
  };
}
