'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore, type ConfirmationStage } from '@/store/tradeStore';
import { usePusherEvents } from './usePusherEvents';
import { debug } from '@/lib/debug';
import { publicClient } from '@/lib/viemClient';

// Exponential backoff: fast initially, backs off to 1s
// Total time to exhaust schedule: ~2.3s, then stays at 1s
const BACKOFF_SCHEDULE_MS = [50, 50, 100, 100, 200, 200, 500, 1000];
const CONFIRMATION_TIMEOUT_MS = 30000; // 30 second timeout

interface UseFastConfirmationOptions {
  /** Called when order is picked up by keeper */
  onPickedUp?: () => void;
  /** Called when order is preconfirmed (flashblock) */
  onPreconfirmed?: () => void;
  /** Called when order is confirmed (filled) */
  onConfirmed?: (latencyMs: number) => void;
  /** Called when order fails/is canceled */
  onFailed?: (reason?: string) => void;
}

interface UseFastConfirmationReturn {
  /** Start waiting for confirmation of a transaction */
  startConfirmation: (txHash: `0x${string}`) => void;
  /** Current confirmation stage */
  confirmationStage: ConfirmationStage;
  /** Whether currently waiting for confirmation */
  isConfirming: boolean;
  /** Latency in ms from broadcast to current stage */
  latencyMs: number | null;
  /** Cancel waiting for confirmation */
  cancelConfirmation: () => void;
}

/**
 * Hook for fast trade confirmation using Pusher events + aggressive polling.
 * 
 * This implements the dual confirmation strategy:
 * 1. Primary: Pusher events (instant notification)
 * 2. Backup: Receipt polling every 50ms
 * 
 * Pusher events typically arrive:
 * - OrderPickedUpForExecution: ~100-200ms
 * - ExecutionConfirmedInFlashblock: ~200-400ms
 * - OrderFilled: ~500-800ms
 * 
 * @param userAddress - User's wallet address (for Pusher channel)
 * @param options - Callbacks for confirmation events
 */
export function useFastConfirmation(
  userAddress: string | null | undefined,
  options: UseFastConfirmationOptions = {}
): UseFastConfirmationReturn {
  const { 
    confirmationStage, 
    setConfirmationStage,
    confirmationTimestamp,
    setConfirmationTimestamp,
  } = useTradeStore();
  
  const { onPickedUp, onPreconfirmed, onConfirmed, onFailed } = options;
  
  // Pusher events
  const pusher = usePusherEvents(userAddress);
  
  // Refs for tracking state across async operations
  const currentTxHashRef = useRef<`0x${string}` | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConfirmingRef = useRef(false);
  // Atomic confirmation resolution — only one source (Pusher or polling) can resolve
  const resolvedRef = useRef(false);
  // Session nonce — tag each confirmation session with txHash to ignore stale events
  const sessionNonceRef = useRef<string>('');

  // Calculate latency
  const latencyMs = confirmationTimestamp 
    ? Date.now() - confirmationTimestamp 
    : null;

  // Stop all polling and timeouts
  const cleanup = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    isConfirmingRef.current = false;
  }, []);

  // Cancel confirmation
  const cancelConfirmation = useCallback(() => {
    cleanup();
    currentTxHashRef.current = null;
    setConfirmationStage('none');
    setConfirmationTimestamp(null);
  }, [cleanup, setConfirmationStage, setConfirmationTimestamp]);

  // Atomic confirmation — prevents race between Pusher and polling
  const resolveConfirmation = useCallback((source: 'pusher' | 'polling', elapsed: number) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    debug(`[FastConfirmation] Resolved via ${source} in ${elapsed}ms`);
    setConfirmationStage('confirmed');
    onConfirmed?.(elapsed);
    cleanup();
  }, [setConfirmationStage, onConfirmed, cleanup]);

  // Start confirmation process
  const startConfirmation = useCallback((txHash: `0x${string}`) => {
    // Clean up any previous confirmation
    cleanup();

    // Clear Pusher events from previous trades
    pusher.clearEvents();

    resolvedRef.current = false;
    sessionNonceRef.current = txHash; // Tag this session

    // Set initial state
    currentTxHashRef.current = txHash;
    isConfirmingRef.current = true;
    setConfirmationStage('submitted');
    setConfirmationTimestamp(Date.now());

    debug(`[FastConfirmation] Starting confirmation for ${txHash}`);

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      if (isConfirmingRef.current) {
        console.warn('[FastConfirmation] Confirmation timeout');
        setConfirmationStage('failed');
        onFailed?.('Confirmation timeout');
        cleanup();
      }
    }, CONFIRMATION_TIMEOUT_MS);

    // Start polling with exponential backoff as backup
    const attemptRef = { current: 0 };

    async function pollReceipt() {
      if (!isConfirmingRef.current || !currentTxHashRef.current) {
        return;
      }

      try {
        const receipt = await publicClient.getTransactionReceipt({
          hash: currentTxHashRef.current,
        });

        if (receipt) {
          const elapsed = Date.now() - (confirmationTimestamp || Date.now());

          if (receipt.status === 'success') {
            debug(`[FastConfirmation] Receipt confirmed (polling) in ${elapsed}ms`);
            resolveConfirmation('polling', elapsed);
          } else {
            console.error('[FastConfirmation] Transaction reverted');
            setConfirmationStage('failed');
            onFailed?.('Transaction reverted');
            cleanup();
          }
          return; // Don't schedule next poll
        }
      } catch {
        // Receipt not available yet, continue polling
      }

      // Schedule next poll with backoff
      if (isConfirmingRef.current) {
        const delay = BACKOFF_SCHEDULE_MS[Math.min(attemptRef.current++, BACKOFF_SCHEDULE_MS.length - 1)];
        pollingIntervalRef.current = setTimeout(pollReceipt, delay) as unknown as NodeJS.Timeout;
      }
    }

    // Start first poll
    pollingIntervalRef.current = setTimeout(pollReceipt, BACKOFF_SCHEDULE_MS[0]) as unknown as NodeJS.Timeout;

  }, [
    cleanup,
    pusher,
    setConfirmationStage,
    setConfirmationTimestamp,
    confirmationTimestamp,
    confirmationStage,
    onConfirmed,
    onFailed,
    resolveConfirmation
  ]);

  // React to Pusher events
  useEffect(() => {
    if (!isConfirmingRef.current) return;
    // Ignore events if no active session (prevents stale event processing)
    if (!sessionNonceRef.current) return;

    const elapsed = confirmationTimestamp ? Date.now() - confirmationTimestamp : 0;

    // Order picked up
    if (pusher.hasPickedUp && confirmationStage === 'submitted') {
      debug(`[FastConfirmation] Order picked up (Pusher) in ${elapsed}ms`);
      setConfirmationStage('picked_up');
      onPickedUp?.();
    }

    // Flashblock preconfirmation
    if (pusher.hasPreconfirmed && ['submitted', 'picked_up'].includes(confirmationStage)) {
      debug(`[FastConfirmation] Preconfirmed (Pusher) in ${elapsed}ms`);
      setConfirmationStage('preconfirmed');
      onPreconfirmed?.();
    }

    // Order filled
    if (pusher.hasFilled && confirmationStage !== 'confirmed' && confirmationStage !== 'failed') {
      debug(`[FastConfirmation] Confirmed (Pusher) in ${elapsed}ms`);
      resolveConfirmation('pusher', elapsed);
    }

    // Order canceled
    if (pusher.hasCanceled && confirmationStage !== 'confirmed' && confirmationStage !== 'failed') {
      debug(`[FastConfirmation] Failed/Canceled (Pusher) in ${elapsed}ms`);
      setConfirmationStage('failed');
      onFailed?.('Order canceled');
      cleanup();
    }

  }, [
    pusher.hasPickedUp,
    pusher.hasPreconfirmed,
    pusher.hasFilled,
    pusher.hasCanceled,
    confirmationStage,
    confirmationTimestamp,
    setConfirmationStage,
    onPickedUp,
    onPreconfirmed,
    onConfirmed,
    onFailed,
    cleanup,
    resolveConfirmation,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    startConfirmation,
    confirmationStage,
    isConfirming: isConfirmingRef.current,
    latencyMs,
    cancelConfirmation,
  };
}
