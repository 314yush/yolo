'use client';

import { useEffect, useState, useCallback } from 'react';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { publicClient } from '@/lib/viemClient';
import { CONTRACTS } from '@/lib/constants';
import { formatUnits } from 'viem';

const ERC20_BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

const BALANCE_POLL_INTERVAL_MS = 3000;

export function useDelegateUsdcBalance() {
  const { delegateAddress } = useDelegateWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!delegateAddress) {
      setBalance(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balanceBigInt = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [delegateAddress],
      })) as bigint;

      const balanceFormatted = parseFloat(formatUnits(balanceBigInt, 6));
      setBalance(balanceFormatted);
    } catch (err) {
      console.error('Error fetching delegate USDC balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [delegateAddress]);

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
