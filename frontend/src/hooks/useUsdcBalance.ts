'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
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

export function useUsdcBalance() {
  const { authenticated, user } = usePrivy();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    const userAddress = user?.wallet?.address as `0x${string}` | undefined;
    
    if (!authenticated || !userAddress) {
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
        args: [userAddress],
      })) as bigint;

      // USDC has 6 decimals
      const balanceFormatted = parseFloat(formatUnits(balanceBigInt, 6));
      setBalance(balanceFormatted);
    } catch (err) {
      console.error('Error fetching USDC balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, user]);

  // Fetch balance on mount and when user/authentication changes
  useEffect(() => {
    fetchBalance();
    
    // Poll balance every 10 seconds
    const interval = setInterval(() => {
      fetchBalance();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
