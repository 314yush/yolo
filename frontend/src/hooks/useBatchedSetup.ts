'use client';

import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useAvantisAPI } from './useAvantisAPI';
import { useDelegateWallet } from './useDelegateWallet';
import { buildUsdcApprovalTx } from '@/lib/avantisEncoder';
import type { UnsignedTx } from '@/types';

// USDC approval limit: 10,000 USDC (in 6 decimals)
const USDC_APPROVAL_LIMIT = 10_000n * 10n ** 6n; // 10,000,000,000 (10k USDC)

// Multicall3 contract address (deployed on Base and most EVM chains)
// This is the standard Multicall3 contract that allows batching multiple calls
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`;

// Multicall3 ABI - only need the aggregate function
const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate',
    outputs: [
      { name: 'blockNumber', type: 'uint256' },
      { name: 'returnData', type: 'bytes[]' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

interface BatchedSetupResult {
  success: boolean;
  error?: string;
  txHashes?: string[];
}

export function useBatchedSetup() {
  const { wallets } = useWallets();
  const { buildDelegateSetupTx, checkDelegateStatus, checkUsdcAllowance } = useAvantisAPI();
  const { delegateAddress } = useDelegateWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string>('');

  // Get Ethereum provider from wallet
  const getEthereumProvider = useCallback(async (wallet: any) => {
    if (wallet && typeof wallet.getEthereumProvider === 'function') {
      const provider = await wallet.getEthereumProvider();
      if (provider) return provider;
    }
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      return (window as any).ethereum;
    }
    throw new Error('Unable to get Ethereum provider');
  }, []);

  // Switch to Base network
  const switchToBase = useCallback(async (provider: any) => {
    const BASE_CHAIN_ID_HEX = '0x2105'; // 8453 in hex
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BASE_CHAIN_ID_HEX,
            chainName: 'Base',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org'],
          }],
        });
      } else {
        throw switchError;
      }
    }
  }, []);

  // Estimate gas for a transaction
  const estimateGas = useCallback(async (provider: any, tx: UnsignedTx, from: string): Promise<string> => {
    try {
      const estimatedGas = await provider.request({
        method: 'eth_estimateGas',
        params: [{
          from,
          to: tx.to,
          data: tx.data,
          value: tx.value || '0x0',
        }],
      });
      return estimatedGas as string;
    } catch (error) {
      console.warn('Gas estimation failed, using fallback:', error);
      return '0x493e0'; // 300k gas fallback
    }
  }, []);

  // Send a single transaction
  const sendTransaction = useCallback(async (
    provider: any,
    tx: UnsignedTx,
    from: string
  ): Promise<string> => {
    const estimatedGas = await estimateGas(provider, tx, from);
    const gasPrice = await provider.request({
      method: 'eth_gasPrice',
      params: [],
    });

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from,
        to: tx.to,
        data: tx.data,
        value: tx.value || '0x0',
        gas: estimatedGas,
        gasPrice: gasPrice,
      }],
    });

    return txHash as string;
  }, [estimateGas]);

  // Execute batched setup: remove old delegate (if needed) + set new delegate + USDC approval (single signature)
  const executeBatchedSetup = useCallback(async (
    userAddress: string
  ): Promise<BatchedSetupResult> => {
    if (!delegateAddress) {
      return { success: false, error: 'Delegate wallet not initialized' };
    }

    setIsProcessing(true);
    setSetupStatus('Checking current delegate status...');

    try {
      // Find user wallet
      const userWallet = wallets?.find((w) => 
        w.address.toLowerCase() === userAddress.toLowerCase()
      ) || wallets?.[0];

      if (!userWallet) {
        return { success: false, error: 'No wallet found. Please ensure your wallet is connected.' };
      }

      // Get provider and switch to Base
      setSetupStatus('Connecting to wallet...');
      const provider = await getEthereumProvider(userWallet);
      await switchToBase(provider);

      // Check for existing delegate and USDC allowance
      setSetupStatus('Checking current setup status...');
      const currentDelegateStatus = await checkDelegateStatus(userAddress);
      const usdcAllowanceCheck = await checkUsdcAllowance(userAddress).catch(() => ({ hasSufficient: false, allowance: 0 }));

      const hasExistingDelegate = currentDelegateStatus.isSetup && 
        currentDelegateStatus.delegateAddress?.toLowerCase() !== delegateAddress.toLowerCase();
      const needsUsdcApproval = !usdcAllowanceCheck.hasSufficient;

      // Build delegate setup transaction
      const delegateTx = await buildDelegateSetupTx(userAddress, delegateAddress);
      if (!delegateTx) {
        return { success: false, error: 'Failed to build delegate setup transaction' };
      }

      // Build calls array - conditionally include USDC approval
      const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: string }> = [
        {
          to: delegateTx.to as `0x${string}`,
          data: delegateTx.data as `0x${string}`,
          value: delegateTx.value || '0x0',
        },
      ];

      // Only include USDC approval if not already approved
      if (needsUsdcApproval) {
        const approvalTxEncoded = buildUsdcApprovalTx(USDC_APPROVAL_LIMIT);
        calls.push({
          to: approvalTxEncoded.to as `0x${string}`,
          data: approvalTxEncoded.data as `0x${string}`,
          value: approvalTxEncoded.value || '0x0',
        });
      }

      // Update status message based on what's needed
      if (hasExistingDelegate && needsUsdcApproval) {
        setSetupStatus('Replacing existing delegate and approving USDC...');
      } else if (hasExistingDelegate && !needsUsdcApproval) {
        setSetupStatus('Replacing existing delegate (USDC already approved)...');
      } else if (!hasExistingDelegate && needsUsdcApproval) {
        setSetupStatus('Setting up delegate wallet and approving USDC...');
      } else {
        setSetupStatus('Setting up delegate wallet (USDC already approved)...');
      }

      // Use EIP-5792 sendCalls (wallet-level batching) which preserves msg.sender
      // This allows us to batch setDelegate + approve USDC (if needed) in a single signature
      // while maintaining the correct msg.sender context for setDelegate
      
      if (calls.length === 1) {
        setSetupStatus('Ready to sign. Setting up delegate wallet...');
      } else {
        setSetupStatus('Ready to sign. You\'ll sign once for both operations...');
      }
      
      // Call EIP-5792 wallet_sendCalls directly through the wallet provider
      // This is supported by Privy wallets and preserves msg.sender
      // If not supported, we'll fall back to sequential transactions
      let batchId: string;
      
      try {
        const sendCallsParams = {
          version: '1.0',
          chainId: '0x2105', // Base chain ID in hex (8453)
          from: userAddress,
          calls: calls.map(call => ({
            to: call.to,
            data: call.data,
            value: call.value,
          })),
          atomicRequired: false, // Set to false for sequential execution (can still be atomic if wallet supports it)
        };
        
        batchId = await provider.request({
          method: 'wallet_sendCalls',
          params: [sendCallsParams],
        }) as string;
      } catch (sendCallsError: any) {
        // Check error code and message for fallback conditions
        const errorCode = sendCallsError?.code;
        const errorMessage = sendCallsError?.message || '';
        const matchesCode = errorCode === -32601;
        const matchesMessage = errorMessage.includes('not supported') || errorMessage.includes('Unknown') || errorMessage.includes('doesn\'t has corresponding handler') || errorMessage.includes('doesn\'t have corresponding handler');
        
        // If wallet_sendCalls is not supported (method not found), fall back to sequential transactions
        if (matchesCode || matchesMessage) {
          console.warn('wallet_sendCalls not supported, falling back to sequential transactions');
          setSetupStatus('Wallet doesn\'t support batching. Sending transactions sequentially...');
          
          // Send setDelegate first
          setSetupStatus('Setting delegate wallet...');
          const delegateHash = await sendTransaction(provider, delegateTx, userAddress);
          
          const txHashes: string[] = [delegateHash];
          
          // Only send USDC approval if needed
          if (needsUsdcApproval) {
            const approvalTxEncoded = buildUsdcApprovalTx(USDC_APPROVAL_LIMIT);
            setSetupStatus('Approving USDC spending...');
            const approvalHash = await sendTransaction(provider, approvalTxEncoded, userAddress);
            txHashes.push(approvalHash);
            console.log('✅ Sequential transactions sent! Hashes:', delegateHash, approvalHash);
            setSetupStatus('Both transactions sent! Waiting for confirmation...');
          } else {
            console.log('✅ Delegate transaction sent! Hash:', delegateHash);
            setSetupStatus('Transaction sent! Waiting for confirmation...');
          }
          
          return {
            success: true,
            txHashes,
          };
        }
        
        // Re-throw if it's a different error
        throw sendCallsError;
      }
      
      // wallet_sendCalls returns a batch ID (string) - this is the identifier for the batch
      // The wallet will execute the calls and we can track them via this ID
      // Note: Some wallets may batch into a single transaction, others may create multiple
      // The wallet handles this internally and preserves msg.sender for each call
      
      console.log('✅ Batched calls sent! Batch ID:', batchId);
      if (calls.length > 1) {
        console.log('🎉 User only needed to sign ONCE for both setDelegate and approve USDC!');
      } else {
        console.log('🎉 User only needed to sign ONCE for setDelegate (USDC already approved)!');
      }
      setSetupStatus('Transaction sent! Waiting for confirmation...');

      return {
        success: true,
        txHashes: [batchId as string], // Use batch ID as transaction identifier
      };
    } catch (err: any) {
      console.error('Batched setup error:', err);
      setSetupStatus('');
      if (err.code === 4001 || err?.cause?.code === 4001) {
        return { success: false, error: 'Transaction rejected by user' };
      }
      return {
        success: false,
        error: err?.message || err?.shortMessage || 'Failed to complete setup',
      };
    } finally {
      setIsProcessing(false);
      setSetupStatus('');
    }
  }, [delegateAddress, wallets, getEthereumProvider, switchToBase, buildDelegateSetupTx, checkDelegateStatus, checkUsdcAllowance, sendTransaction]);

  return {
    executeBatchedSetup,
    isProcessing,
    setupStatus,
  };
}
