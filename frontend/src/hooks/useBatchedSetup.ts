'use client';

import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useSendCalls } from 'wagmi';
import { useAccount } from 'wagmi';
import { encodeFunctionData } from 'viem';
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
  const { address: wagmiAddress, isConnected } = useAccount();
  const { buildDelegateSetupTx } = useAvantisAPI();
  const { delegateAddress } = useDelegateWallet();
  const sendCalls = useSendCalls();
  const [isProcessing, setIsProcessing] = useState(false);

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

  // Execute batched setup: delegate + USDC approval (single signature)
  const executeBatchedSetup = useCallback(async (
    userAddress: string
  ): Promise<BatchedSetupResult> => {
    if (!delegateAddress) {
      return { success: false, error: 'Delegate wallet not initialized' };
    }

    setIsProcessing(true);

    try {
      // Find user wallet
      const userWallet = wallets?.find((w) => 
        w.address.toLowerCase() === userAddress.toLowerCase()
      ) || wallets?.[0];

      if (!userWallet) {
        return { success: false, error: 'No wallet found' };
      }

      // Get provider and switch to Base
      const provider = await getEthereumProvider(userWallet);
      await switchToBase(provider);

      // Build all transaction calls
      const delegateTx = await buildDelegateSetupTx(userAddress, delegateAddress);
      if (!delegateTx) {
        return { success: false, error: 'Failed to build delegate setup transaction' };
      }

      // Build USDC approval with 10,000 USDC limit
      const approvalTxEncoded = buildUsdcApprovalTx(USDC_APPROVAL_LIMIT);

      // Use Multicall3 to batch both transactions into a single signature
      // This works with ANY wallet (Rabby, MetaMask, etc.) because it's a standard contract call
      console.log('🚀 Building multicall transaction (single signature for both transactions)...');
      
      // Prepare calls for multicall
      const multicallCalls = [
        {
          target: delegateTx.to as `0x${string}`,
          callData: delegateTx.data as `0x${string}`,
        },
        {
          target: approvalTxEncoded.to as `0x${string}`,
          callData: approvalTxEncoded.data as `0x${string}`,
        },
      ];

      // Encode the multicall aggregate function
      const multicallData = encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: 'aggregate',
        args: [multicallCalls],
      });

      // Build the multicall transaction
      const multicallTx: UnsignedTx = {
        to: MULTICALL3_ADDRESS,
        data: multicallData,
        value: '0', // No value needed
        chainId: 8453, // Base
      };

      console.log('Multicall transaction:', {
        to: multicallTx.to,
        dataLength: multicallTx.data.length,
        calls: multicallCalls.length,
      });

      // Send the multicall transaction - user signs ONCE for both operations
      console.log('📝 Sending multicall transaction - user will sign ONCE for both delegate setup and USDC approval');
      const multicallHash = await sendTransaction(provider, multicallTx, userAddress);
      console.log('✅ Multicall transaction sent successfully! Hash:', multicallHash);
      console.log('🎉 User only needed to sign ONCE for both transactions!');

      return {
        success: true,
        txHashes: [multicallHash], // Single transaction hash for the multicall
      };
    } catch (err: any) {
      console.error('Batched setup error:', err);
      if (err.code === 4001 || err?.cause?.code === 4001) {
        return { success: false, error: 'Transaction rejected by user' };
      }
      return {
        success: false,
        error: err?.message || err?.shortMessage || 'Failed to complete setup',
      };
    } finally {
      setIsProcessing(false);
    }
  }, [delegateAddress, wallets, getEthereumProvider, switchToBase, buildDelegateSetupTx, sendCalls, isConnected, wagmiAddress, sendTransaction]);

  return {
    executeBatchedSetup,
    isProcessing: isProcessing || sendCalls.isPending,
  };
}
