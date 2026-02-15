'use client';

import { useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { fetchTrades, fetchPnL, fetchClosedTrades, fetchTotalVolume } from '@/lib/avantisApi';
import { publicClient } from '@/lib/viemClient';
import {
  AVANTIS_CONTRACTS,
  ERC20_ALLOWANCE_ABI,
} from '@/lib/avantisEncoder';

// Minimum USDC allowance considered "sufficient" (10,000 USDC in 6 decimals)
const MIN_SUFFICIENT_ALLOWANCE = 10_000n * 10n ** 6n;

export function useAvantisAPI() {
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
    } catch (error) {
      console.error('[useAvantisAPI] Failed to fetch trades:', error);
      return [];
    }
  }, []);

  // Get PnL for all positions - Direct from Avantis API + Pyth prices (no backend!)
  const getPnL = useCallback(async (address: string) => {
    try {
      const currentPrices = useTradeStore.getState().prices;
      return await fetchPnL(address, currentPrices);
    } catch (error) {
      console.error('[useAvantisAPI] Failed to fetch PnL:', error);
      return [];
    }
  }, []);

  // Get closed trades from Avantis portfolio history API
  const getClosedTrades = useCallback(async (address: string, pageNumber: number = 1) => {
    try {
      return await fetchClosedTrades(address, pageNumber);
    } catch (error) {
      console.error('[useAvantisAPI] Failed to fetch closed trades:', error);
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
    checkUsdcAllowance,
    getTrades,
    getPnL,
    getClosedTrades,
    getTotalVolume,
  };
}
