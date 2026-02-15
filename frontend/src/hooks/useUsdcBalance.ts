'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePrivyEmbeddedWallet } from './usePrivyEmbeddedWallet';
import { publicClient } from '@/lib/viemClient';
import { CONTRACTS } from '@/lib/constants';
import { formatUnits } from 'viem';

// ERC20 balanceOf ABI
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

const BALANCE_POLL_INTERVAL_MS = 3000;

export function useUsdcBalance() {
  const { address: embeddedAddress, isReady } = usePrivyEmbeddedWallet();
  const txHash = useTradeStore((s) => s.txHash);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevTxHashRef = useRef<`0x${string}` | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!isReady || !embeddedAddress) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balanceBigInt = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [embeddedAddress],
      })) as bigint;

      const balanceFormatted = parseFloat(formatUnits(balanceBigInt, 6));
      setBalance(balanceFormatted);
    } catch (err) {
      console.error('Error fetching USDC balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [isReady, embeddedAddress]);

  // Refetch immediately when txHash changes (trade/close submitted)
  useEffect(() => {
    if (txHash && txHash !== prevTxHashRef.current) {
      prevTxHashRef.current = txHash;
      fetchBalance();
    }
  }, [txHash, fetchBalance]);

  // Fetch balance on mount and poll (pause when tab hidden)
  useEffect(() => {
    fetchBalance();

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchBalance();
      }
    }, BALANCE_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchBalance();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
