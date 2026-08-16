'use client';

/**
 * One-time onboarding. Since the v2 cutover this is a single USDC approval:
 * trades are signed by the user's own wallet, so there is no delegate to
 * register. Privy sponsors the gas, so the user never needs ETH.
 */

import { useCallback, useState } from 'react';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useAvantisAPI } from './useAvantisAPI';
import { buildUsdcApprovalTxV2 } from '@/lib/avantisV2';
import { debug } from '@/lib/debug';
import { base } from 'viem/chains';

const USDC_APPROVAL_LIMIT = 10_000n * 10n ** 6n;

interface SetupResult {
  success: boolean;
  error?: string;
  txHashes?: string[];
}

export function useBatchedSetup() {
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { checkUsdcAllowance } = useAvantisAPI();
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string>('');

  const executeBatchedSetup = useCallback(
    async (userAddress: string): Promise<SetupResult> => {
      const userWallet =
        wallets?.find((w) => w.address.toLowerCase() === userAddress.toLowerCase()) ??
        wallets?.[0];
      if (!userWallet) {
        return {
          success: false,
          error: 'No wallet found. Please ensure your wallet is connected.',
        };
      }

      setIsProcessing(true);
      setSetupStatus('Checking current setup status...');

      try {
        const allowance = await checkUsdcAllowance(userAddress).catch(() => ({
          hasSufficient: false,
          allowance: 0,
        }));

        if (allowance.hasSufficient) {
          debug('✅ USDC already approved, nothing to do');
          setSetupStatus('Setup complete!');
          return { success: true, txHashes: [] };
        }

        setSetupStatus('Approving USDC spending...');
        const approvalTx = buildUsdcApprovalTxV2(USDC_APPROVAL_LIMIT);
        const result = await sendTransaction(
          {
            to: approvalTx.to as `0x${string}`,
            data: approvalTx.data as `0x${string}`,
            value: BigInt(approvalTx.value ?? '0x0'),
            chainId: base.id,
          },
          { sponsor: true, address: userWallet.address }
        );

        debug('✅ USDC approval (Privy sponsored):', result.hash);
        setSetupStatus('Setup complete!');
        return { success: true, txHashes: [result.hash] };
      } catch (err: unknown) {
        console.error('Setup error:', err);
        setSetupStatus('');
        const rec = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
        const cause =
          rec.cause && typeof rec.cause === 'object'
            ? (rec.cause as Record<string, unknown>)
            : {};
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
        return { success: false, error: msg };
      } finally {
        setIsProcessing(false);
        setSetupStatus('');
      }
    },
    [wallets, checkUsdcAllowance, sendTransaction]
  );

  return {
    executeBatchedSetup,
    isProcessing,
    setupStatus,
  };
}
