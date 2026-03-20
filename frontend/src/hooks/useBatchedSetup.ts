'use client';

import { useCallback, useState } from 'react';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useAvantisAPI } from './useAvantisAPI';
import { useDelegateWallet } from './useDelegateWallet';
import { buildUsdcApprovalTx } from '@/lib/avantisEncoder';
import { debug } from '@/lib/debug';
import { base } from 'viem/chains';

const USDC_APPROVAL_LIMIT = 10_000n * 10n ** 6n;
const BASE_CHAIN_ID_HEX = '0x2105';

interface BatchedSetupResult {
  success: boolean;
  error?: string;
  txHashes?: string[];
}

/**
 * Setup flow uses Privy gas sponsorship for the FIRST signing only (setDelegate + approveUSDC).
 * When both are needed, tries wallet_sendCalls (EIP-5792) batch first, else falls back to separate txns.
 * After setup, Tachyon handles all trade transactions.
 */
export function useBatchedSetup() {
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { buildDelegateSetupTx, checkUsdcAllowance } = useAvantisAPI();
  const { delegateAddress } = useDelegateWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string>('');

  const executeBatchedSetup = useCallback(async (
    userAddress: string
  ): Promise<BatchedSetupResult> => {
    if (!delegateAddress) {
      return { success: false, error: 'Secure trading session not initialized' };
    }

    const userWallet = wallets?.find((w) =>
      w.address.toLowerCase() === userAddress.toLowerCase()
    ) ?? wallets?.[0];
    if (!userWallet) {
      return { success: false, error: 'No wallet found. Please ensure your wallet is connected.' };
    }

    setIsProcessing(true);
    setSetupStatus('Checking current setup status...');

    try {
      const usdcAllowanceCheck = await checkUsdcAllowance(userAddress).catch(() => ({ hasSufficient: false, allowance: 0 }));
      const needsUsdcApproval = !usdcAllowanceCheck.hasSufficient;

      if (!needsUsdcApproval) {
        debug('✅ USDC already approved, skipping approval tx');
      }

      const delegateTx = await buildDelegateSetupTx(userAddress, delegateAddress);
      if (!delegateTx) {
        return { success: false, error: 'Failed to build delegate setup transaction' };
      }

      const txHashes: string[] = [];

      // When both setDelegate and approve are needed, try wallet_sendCalls (EIP-5792) batch first
      if (needsUsdcApproval) {
        const approvalTx = buildUsdcApprovalTx(USDC_APPROVAL_LIMIT);
        const batchAttempt = await tryBatchedSendCalls(
          userWallet,
          delegateTx,
          approvalTx,
          (msg) => setSetupStatus(msg)
        );
        if (batchAttempt.success && batchAttempt.txHashes?.length) {
          txHashes.push(...batchAttempt.txHashes);
          debug('✅ Batched setDelegate + approve:', batchAttempt.txHashes);
          setSetupStatus('Setup complete!');
          return { success: true, txHashes };
        }
        // Fallback to separate transactions
        debug('Batch not supported, falling back to sequential txns');
      }

      // 1. setDelegate - Privy sponsors gas
      setSetupStatus('Ready to sign. Setting up secure trading session...');
      const setDelegateResult = await sendTransaction(
        {
          to: delegateTx.to as `0x${string}`,
          data: delegateTx.data as `0x${string}`,
          value: BigInt(delegateTx.value ?? '0x0'),
          chainId: base.id,
        },
        { sponsor: true, address: userWallet.address }
      );
      txHashes.push(setDelegateResult.hash);
      debug('✅ setDelegate (Privy sponsored):', setDelegateResult.hash);

      // 2. approveUSDC if needed - Privy sponsors gas
      if (needsUsdcApproval) {
        setSetupStatus('Approving USDC spending...');
        const approvalTx = buildUsdcApprovalTx(USDC_APPROVAL_LIMIT);
        const approvalResult = await sendTransaction(
          {
            to: approvalTx.to as `0x${string}`,
            data: approvalTx.data as `0x${string}`,
            value: BigInt(approvalTx.value ?? '0x0'),
            chainId: base.id,
          },
          { sponsor: true, address: userWallet.address }
        );
        txHashes.push(approvalResult.hash);
        debug('✅ USDC approval (Privy sponsored):', approvalResult.hash);
      }

      setSetupStatus('Setup complete!');
      return { success: true, txHashes };
    } catch (err: unknown) {
      console.error('Batched setup error:', err);
      setSetupStatus('');
      const rec = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
      const cause = rec.cause && typeof rec.cause === 'object' ? (rec.cause as Record<string, unknown>) : {};
      if (rec.code === 4001 || cause.code === 4001) {
        return { success: false, error: 'Transaction rejected by user' };
      }
      const msg =
        typeof rec.message === 'string'
          ? rec.message
          : typeof rec.shortMessage === 'string'
            ? rec.shortMessage
            : err instanceof Error
              ? err.message
              : 'Failed to complete setup';
      return {
        success: false,
        error: msg,
      };
    } finally {
      setIsProcessing(false);
      setSetupStatus('');
    }
  }, [delegateAddress, wallets, checkUsdcAllowance, sendTransaction, buildDelegateSetupTx]);

  return {
    executeBatchedSetup,
    isProcessing,
    setupStatus,
  };
}

/** Try EIP-5792 wallet_sendCalls for batched setDelegate + approve. Falls back gracefully. */
async function tryBatchedSendCalls(
  wallet: { getEthereumProvider?: () => Promise<unknown>; address: string },
  delegateTx: { to: string; data: string; value?: string },
  approvalTx: { to: string; data: string; value?: string },
  setStatus: (msg: string) => void
): Promise<{ success: boolean; txHashes?: string[] }> {
  try {
    const provider = wallet.getEthereumProvider
      ? (await wallet.getEthereumProvider()) as { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
      : null;
    if (!provider?.request) return { success: false };

    setStatus('Ready to sign. Setting up delegate and approving USDC in one step...');

    const result = await provider.request({
      method: 'wallet_sendCalls',
      params: [
        {
          version: '1.0',
          chainId: BASE_CHAIN_ID_HEX,
          from: wallet.address as `0x${string}`,
          calls: [
            {
              to: delegateTx.to as `0x${string}`,
              data: delegateTx.data as `0x${string}`,
              value: (delegateTx.value ?? '0x0') as `0x${string}`,
            },
            {
              to: approvalTx.to as `0x${string}`,
              data: approvalTx.data as `0x${string}`,
              value: (approvalTx.value ?? '0x0') as `0x${string}`,
            },
          ],
        },
      ],
    }) as { batchId?: string; txHashes?: string[] } | undefined;

    if (!result) return { success: false };

    // Some wallets return tx hashes; others return batchId. If we get batchId we'd need to poll wallet_getCallsStatus
    const hashes = Array.isArray(result) ? result : result?.txHashes ?? [];
    if (hashes.length > 0) {
      return { success: true, txHashes: hashes };
    }
    if (result?.batchId) {
      // Batch submitted, assume success - SetupFlow will verify on-chain
      return { success: true, txHashes: [result.batchId] };
    }
    return { success: false };
  } catch (e) {
    debug('wallet_sendCalls not supported or failed:', e);
    return { success: false };
  }
}
