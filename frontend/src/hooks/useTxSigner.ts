'use client';

import { useCallback, useState } from 'react';
import { createDelegateWalletClient, publicClient, waitForTransaction } from '@/lib/viemClient';
import { getOrCreateDelegateWallet, getDelegateAccount } from '@/lib/delegateWallet';
import { useTradeStore } from '@/store/tradeStore';
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
        
        // Check balance FIRST before attempting gas estimation
        const balance = await publicClient.getBalance({ address: wallet.address });
        
        // Get current gas price
        const gasPrice = await publicClient.getGasPrice();
        
        // Add $0.01 USD buffer to gas cost for safety margin
        // Use ETH price from Pyth store, fallback to $3000
        let gasCostBuffer = BigInt(0);
        const prices = useTradeStore.getState().prices;
        const ethPrice = prices['ETH/USD']?.price || 3000;
        const bufferUsd = 0.01;
        const bufferEth = bufferUsd / ethPrice;
        gasCostBuffer = BigInt(Math.ceil(bufferEth * 1e18));
        
        // Estimate gas
        let estimatedGas: bigint;
        let gasEstimationFailed = false;
        try {
          estimatedGas = await publicClient.estimateGas({
            account,
            to: txParams.to,
            data: txParams.data,
            value: txParams.value,
          });
        } catch (error: unknown) {
          gasEstimationFailed = true;
          const err = error as { message?: string; name?: string; cause?: { message?: string; name?: string } };
          const errorMessage = err?.message || '';
          const errorName = err?.name || '';
          const causeMessage = err?.cause?.message || '';
          const causeName = err?.cause?.name || '';
          
          const isInsufficientFunds = 
            errorMessage.toLowerCase().includes('insufficient funds') || 
            errorMessage.toLowerCase().includes('exceeds the balance') ||
            errorName === 'EstimateGasExecutionError' ||
            errorName === 'InsufficientFundsError' ||
            causeMessage.toLowerCase().includes('insufficient funds') ||
            causeName === 'InsufficientFundsError';
          
          if (isInsufficientFunds) {
            estimatedGas = BigInt(300000);
            const gasCost = estimatedGas * gasPrice;
            const totalGasCost = gasCost + gasCostBuffer;
            const totalCost = totalGasCost + txParams.value;
            
            if (balance < totalCost) {
              const balanceEth = Number(balance) / 1e18;
              const totalCostEth = Number(totalCost) / 1e18;
              throw new Error(
                `Insufficient funds. Balance: ${balanceEth.toFixed(6)} ETH, Required: ${totalCostEth.toFixed(6)} ETH. ` +
                `Please fund your delegate wallet.`
              );
            }
          } else {
            estimatedGas = BigInt(300000);
          }
        }
        
        // Calculate total cost
        const gasCost = estimatedGas * gasPrice;
        const totalGasCost = gasCost + gasCostBuffer;
        const totalCost = totalGasCost + txParams.value;
        
        if (balance < totalCost) {
          const balanceEth = Number(balance) / 1e18;
          const totalCostEth = Number(totalCost) / 1e18;
          throw new Error(
            `Insufficient funds. Balance: ${balanceEth.toFixed(6)} ETH, Required: ${totalCostEth.toFixed(6)} ETH. ` +
            `Please fund your delegate wallet.`
          );
        }
        
        // Prepare and send transaction
        let preparedTx;
        try {
          preparedTx = await publicClient.prepareTransactionRequest({
            account,
            to: txParams.to,
            data: txParams.data,
            value: txParams.value,
            gas: estimatedGas,
            gasPrice: gasPrice,
          });
        } catch (prepareError) {
          if (gasEstimationFailed) {
            const higherGas = BigInt(500000);
            preparedTx = await publicClient.prepareTransactionRequest({
              account,
              to: txParams.to,
              data: txParams.data,
              value: txParams.value,
              gas: higherGas,
              gasPrice: gasPrice,
            });
            estimatedGas = higherGas;
          } else {
            throw prepareError;
          }
        }
        
        // Re-check balance with updated gas estimate
        const updatedGasCost = estimatedGas * gasPrice;
        const updatedTotalCost = updatedGasCost + gasCostBuffer + txParams.value;
        
        if (balance < updatedTotalCost) {
          const balanceEth = Number(balance) / 1e18;
          const totalCostEth = Number(updatedTotalCost) / 1e18;
          throw new Error(
            `Insufficient funds: Balance ${balanceEth.toFixed(6)} ETH < Required ${totalCostEth.toFixed(6)} ETH.`
          );
        }
        
        // Send transaction
        const hash = await walletClient.sendTransaction(preparedTx);
        
        // Wait for receipt
        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
            confirmations: 1,
            timeout: 60000,
          });
          
          if (receipt.status === 'reverted') {
            let revertReason = 'Unknown reason';
            try {
              const tx = await publicClient.getTransaction({ hash });
              try {
                await publicClient.call({
                  account,
                  to: tx.to!,
                  data: tx.input,
                  value: tx.value,
                });
              } catch (callError: unknown) {
                const err = callError as { message?: string; cause?: { message?: string } };
                const errorMsg = err?.message || '';
                const causeMsg = err?.cause?.message || '';
                
                if (errorMsg.includes('DELEGATE_NOT_APPROVED') || causeMsg.includes('DELEGATE_NOT_APPROVED')) {
                  revertReason = 'DELEGATE_NOT_APPROVED - Please complete the setup flow.';
                } else if (errorMsg.includes('execution reverted') || causeMsg.includes('execution reverted')) {
                  const revertMatch = errorMsg.match(/execution reverted:?\s*(.+)/i) || 
                                    causeMsg.match(/execution reverted:?\s*(.+)/i);
                  if (revertMatch) {
                    revertReason = revertMatch[1].substring(0, 100);
                  }
                }
              }
            } catch {
              // Ignore
            }
            
            if (revertReason.includes('DELEGATE_NOT_APPROVED')) {
              throw new Error(
                `Delegate wallet not approved. Please complete the setup flow. ` +
                `Check https://basescan.org/tx/${hash}`
              );
            }
            
            throw new Error(
              `Transaction reverted: ${revertReason}. ` +
              `Check https://basescan.org/tx/${hash}`
            );
          }
        } catch (waitError: unknown) {
          const err = waitError as { name?: string; message?: string };
          if (err?.name === 'TimeoutError' || err?.message?.includes('timeout')) {
            return hash;
          }
          throw waitError;
        }
        
        return hash;
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
