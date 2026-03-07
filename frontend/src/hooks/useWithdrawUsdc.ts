'use client';

import { useCallback, useState } from 'react';
import { encodeFunctionData, isAddress } from 'viem';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { base } from 'viem/chains';
import { CONTRACTS } from '@/lib/constants';

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const USDC_DECIMALS = 6;

/**
 * Withdraw USDC from the user's Privy wallet to a recipient address.
 * Uses Privy native gas sponsorship - no ETH required in the Privy wallet.
 */
export function useWithdrawUsdc() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userAddress = useTradeStore((state) => state.userAddress);
  const { wallets, ready: walletsReady } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const withdraw = useCallback(
    async (amountUsdc: number, recipientAddress: `0x${string}`): Promise<`0x${string}` | null> => {
      if (amountUsdc <= 0) {
        setError('Amount must be greater than 0');
        return null;
      }
      if (!isAddress(recipientAddress)) {
        setError('Invalid recipient address');
        return null;
      }
      if (!userAddress) {
        setError('No wallet connected');
        return null;
      }
      if (!walletsReady) {
        setError('Wallet still initializing. Please retry.');
        return null;
      }

      const userWallet = wallets?.find((w) => w.address?.toLowerCase() === userAddress.toLowerCase()) ?? wallets?.[0];
      if (!userWallet?.address) {
        setError('No Privy wallet available');
        return null;
      }

      setError(null);
      setIsPending(true);

      try {
        const amountRaw = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
        const calldata = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [recipientAddress, amountRaw],
        });

        const result = await sendTransaction(
          {
            to: CONTRACTS.USDC,
            data: calldata,
            value: 0n,
            chainId: base.id,
          },
          { sponsor: true, address: userWallet.address }
        );

        return result.hash as `0x${string}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Withdrawal failed';
        setError(message);
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [userAddress, wallets, walletsReady, sendTransaction]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    withdraw,
    isPending,
    error,
    clearError,
  };
}
