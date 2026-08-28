'use client';

/**
 * The single on-chain prerequisite for trading on v2 is a USDC allowance for
 * TradingStorage. Trades are EIP-712 intents signed by the user's own wallet,
 * so there is no delegate to register.
 *
 * Privy sponsors the approval and `showWalletUIs: false` suppresses the
 * confirmation modal, so it costs the user nothing and shows them nothing.
 * That makes it safe to send in the background instead of behind a gate.
 */

import { useCallback } from 'react';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useAvantisAPI } from './useAvantisAPI';
import { useTradeStore } from '@/store/tradeStore';
import { buildUsdcApprovalTxV2 } from '@/lib/avantisV2';
import { markOnboardingCompleteApi } from '@/lib/activityApi';
import { debug } from '@/lib/debug';
import { base } from 'viem/chains';

const USDC_APPROVAL_LIMIT = 10_000n * 10n ** 6n;

const MAX_SEND_ATTEMPTS = 3;
const SEND_BACKOFF_MS = 1_500;
const ALLOWANCE_POLL_ATTEMPTS = 20;
const ALLOWANCE_POLL_INTERVAL_MS = 750;

export type ApprovalResult = { ok: true } | { ok: false; error: string };

/**
 * Shared across every hook instance so the deposit screen, the ROLL button and
 * the wheel tap can never race two sponsored approvals against each other.
 */
const inFlightByAddress = new Map<string, Promise<ApprovalResult>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  const rec = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const cause =
    rec.cause && typeof rec.cause === 'object' ? (rec.cause as Record<string, unknown>) : {};
  if (rec.code === 4001 || cause.code === 4001) {
    return 'Transaction rejected';
  }
  if (typeof rec.shortMessage === 'string') return rec.shortMessage;
  if (typeof rec.message === 'string') return rec.message;
  if (err instanceof Error) return err.message;
  return 'Could not enable trading';
}

export function useUsdcApproval() {
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { checkUsdcAllowance } = useAvantisAPI();

  const markApproved = useCallback((userAddress: string) => {
    const { setupStatus, setSetupStatus } = useTradeStore.getState();
    if (setupStatus.isSetup && setupStatus.usdcApproved) return;
    setSetupStatus({ isSetup: true, usdcApproved: true });
    // Backend record so a new device recognises a returning user.
    void markOnboardingCompleteApi(userAddress);
  }, []);

  const runApproval = useCallback(
    async (userAddress: string): Promise<ApprovalResult> => {
      const alreadyApproved = await checkUsdcAllowance(userAddress).catch(() => null);
      if (alreadyApproved?.hasSufficient) {
        debug('✅ USDC allowance already sufficient');
        markApproved(userAddress);
        return { ok: true };
      }

      const wallet =
        wallets?.find((w) => w.address.toLowerCase() === userAddress.toLowerCase()) ?? wallets?.[0];
      if (!wallet) {
        return { ok: false, error: 'Wallet is still being prepared. Try again in a moment.' };
      }

      const approvalTx = buildUsdcApprovalTxV2(USDC_APPROVAL_LIMIT);
      let lastError = 'Could not enable trading';

      for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await sleep(SEND_BACKOFF_MS * 2 ** (attempt - 1));
        }

        try {
          const result = await sendTransaction(
            {
              to: approvalTx.to as `0x${string}`,
              data: approvalTx.data as `0x${string}`,
              value: BigInt(approvalTx.value ?? '0x0'),
              chainId: base.id,
            },
            { sponsor: true, address: wallet.address }
          );
          debug('✅ USDC approval sent (Privy sponsored):', result.hash);
        } catch (err) {
          lastError = errorMessage(err);
          debug(`⚠️ USDC approval send failed (attempt ${attempt + 1}): ${lastError}`);
          continue;
        }

        // Confirm on-chain rather than trusting the receipt: the relayer rejects
        // intents until the allowance is actually mined.
        for (let poll = 0; poll < ALLOWANCE_POLL_ATTEMPTS; poll++) {
          const allowance = await checkUsdcAllowance(userAddress).catch(() => null);
          if (allowance?.hasSufficient) {
            markApproved(userAddress);
            return { ok: true };
          }
          await sleep(ALLOWANCE_POLL_INTERVAL_MS);
        }

        lastError = 'Approval did not confirm on-chain';
      }

      return { ok: false, error: lastError };
    },
    [wallets, checkUsdcAllowance, sendTransaction, markApproved]
  );

  /**
   * Idempotent, deduplicated approval. Safe to call fire-and-forget in the
   * background and to await on the trade path — a caller arriving while an
   * approval is in flight joins the existing promise instead of sending a
   * second transaction.
   */
  const ensureUsdcApproval = useCallback(
    (userAddress: string): Promise<ApprovalResult> => {
      const key = userAddress.toLowerCase();
      const existing = inFlightByAddress.get(key);
      if (existing) return existing;

      const pending: Promise<ApprovalResult> = runApproval(userAddress).finally(() => {
        if (inFlightByAddress.get(key) === pending) {
          inFlightByAddress.delete(key);
        }
      });
      inFlightByAddress.set(key, pending);
      return pending;
    },
    [runApproval]
  );

  return { ensureUsdcApproval };
}
