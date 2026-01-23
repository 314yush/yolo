'use client';

import { useCallback, useState } from 'react';
import { createDelegateWalletClient, publicClient, waitForTransaction } from '@/lib/viemClient';
import { getOrCreateDelegateWallet, getDelegateAccount } from '@/lib/delegateWallet';
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
        const walletClient = createDelegateWalletClient();
        const wallet = getOrCreateDelegateWallet();
        const account = getDelegateAccount();
        
        const txParams = {
          to: unsignedTx.to as `0x${string}`,
          data: unsignedTx.data as `0x${string}`,
          value: BigInt(unsignedTx.value || '0'),
        };
        
        console.log('[signAndBroadcast] Preparing transaction:', {
          to: txParams.to,
          dataLength: txParams.data.length,
          value: txParams.value.toString(),
        });
        
        // Estimate gas BEFORE sending to check if we have enough balance
        let estimatedGas: bigint;
        try {
          estimatedGas = await publicClient.estimateGas({
            account,
            to: txParams.to,
            data: txParams.data,
            value: txParams.value,
          });
          console.log('[signAndBroadcast] Estimated gas:', estimatedGas.toString());
        } catch (error) {
          console.warn('[signAndBroadcast] Gas estimation failed, using fallback:', error);
          // Fallback: use a high estimate (300k gas) if estimation fails
          estimatedGas = BigInt(300000);
        }
        
        // Get current gas price
        const gasPrice = await publicClient.getGasPrice();
        console.log('[signAndBroadcast] Gas price:', gasPrice.toString());
        
        // Calculate total cost: gas * gasPrice + value
        const gasCost = estimatedGas * gasPrice;
        const totalCost = gasCost + txParams.value;
        
        // Check balance
        const balance = await publicClient.getBalance({ address: wallet.address });
        console.log('[signAndBroadcast] Balance check:', {
          balance: balance.toString(),
          totalCost: totalCost.toString(),
          gasCost: gasCost.toString(),
          value: txParams.value.toString(),
        });
        
        if (balance < totalCost) {
          const balanceEth = Number(balance) / 1e18;
          const totalCostEth = Number(totalCost) / 1e18;
          const gasCostEth = Number(gasCost) / 1e18;
          const valueEth = Number(txParams.value) / 1e18;
          throw new Error(
            `Insufficient funds for transaction. ` +
            `Balance: ${balanceEth.toFixed(6)} ETH. ` +
            `Required: ${totalCostEth.toFixed(6)} ETH ` +
            `(gas: ${gasCostEth.toFixed(6)} ETH + value: ${valueEth.toFixed(6)} ETH). ` +
            `Please fund your delegate wallet.`
          );
        }
        
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
