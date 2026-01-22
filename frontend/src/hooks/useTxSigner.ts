'use client';

import { useCallback, useState } from 'react';
import { createDelegateWalletClient, publicClient, waitForTransaction } from '@/lib/viemClient';
import { getOrCreateDelegateWallet } from '@/lib/delegateWallet';
import type { UnsignedTx } from '@/types';

// Minimum ETH required for delegate to execute a trade
const MIN_DELEGATE_ETH_FOR_TRADE = 0.0001; // ~$0.30, enough for 1-2 trades

export function useTxSigner() {
  const [isPending, setIsPending] = useState(false);

  /**
   * Check if delegate has enough ETH for gas
   */
  const checkDelegateBalance = useCallback(async (): Promise<{ hasEnough: boolean; balance: bigint }> => {
    try {
      const wallet = getOrCreateDelegateWallet();
      const balance = await publicClient.getBalance({ address: wallet.address });
      const minRequired = BigInt(Math.floor(MIN_DELEGATE_ETH_FOR_TRADE * 1e18));
      return { hasEnough: balance >= minRequired, balance };
    } catch (err) {
      console.error('Error checking delegate balance:', err);
      return { hasEnough: false, balance: BigInt(0) };
    }
  }, []);

  /**
   * Sign and broadcast a transaction using the delegate wallet
   */
  const signAndBroadcast = useCallback(
    async (unsignedTx: UnsignedTx): Promise<`0x${string}`> => {
      setIsPending(true);
      
      try {
        // Pre-flight check: ensure delegate has enough ETH
        const { hasEnough, balance } = await checkDelegateBalance();
        if (!hasEnough) {
          const balanceEth = Number(balance) / 1e18;
          throw new Error(
            `Delegate wallet needs more ETH for gas. ` +
            `Current balance: ${balanceEth.toFixed(6)} ETH. ` +
            `Please fund your delegate wallet to continue trading.`
          );
        }
        
        const walletClient = createDelegateWalletClient();
        
        const txParams = {
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: BigInt(unsignedTx.value || '0'),
        };
        
        console.log('[signAndBroadcast] Sending transaction:', {
          to: txParams.to,
          dataLength: txParams.data.length,
          value: txParams.value.toString(),
        });
        
        try {
          const hash = await walletClient.sendTransaction(txParams);
          console.log('[signAndBroadcast] ✅ Transaction sent, hash:', hash);
          return hash;
        } catch (error) {
          console.error('[signAndBroadcast] ❌ Transaction failed:', error);
          throw error;
        }
      } finally {
        setIsPending(false);
      }
    },
    [checkDelegateBalance]
  );

  /**
   * Sign, broadcast, and wait for confirmation
   */
  const signAndWait = useCallback(
    async (unsignedTx: UnsignedTx) => {
      const hash = await signAndBroadcast(unsignedTx);
      const receipt = await waitForTransaction(hash);
      return { hash, receipt };
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
