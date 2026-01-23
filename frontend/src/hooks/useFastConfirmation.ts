'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore, type ConfirmationStage } from '@/store/tradeStore';
import { usePusherEvents } from './usePusherEvents';
import { publicClient } from '@/lib/viemClient';

const POLLING_INTERVAL_MS = 50; // 50ms polling (10x faster than before)
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

  // Calculate latency
  const latencyMs = confirmationTimestamp 
    ? Date.now() - confirmationTimestamp 
    : null;

  // Stop all polling and timeouts
  const cleanup = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
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

  // Start confirmation process
  const startConfirmation = useCallback((txHash: `0x${string}`) => {
    // Clean up any previous confirmation
    cleanup();
    
    // Clear Pusher events from previous trades
    pusher.clearEvents();
    
    // Set initial state
    currentTxHashRef.current = txHash;
    isConfirmingRef.current = true;
    setConfirmationStage('submitted');
    setConfirmationTimestamp(Date.now());
    
    console.log(`[FastConfirmation] Starting confirmation for ${txHash}`);
    
    // Set timeout
    timeoutRef.current = setTimeout(() => {
      if (isConfirmingRef.current) {
        console.warn('[FastConfirmation] Confirmation timeout');
        setConfirmationStage('failed');
        onFailed?.('Confirmation timeout');
        cleanup();
      }
    }, CONFIRMATION_TIMEOUT_MS);
    
    // Start aggressive polling as backup
    pollingIntervalRef.current = setInterval(async () => {
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
            console.log(`[FastConfirmation] Receipt confirmed (polling) in ${elapsed}ms`);
            // Only update if Pusher hasn't already confirmed
            if (confirmationStage !== 'confirmed') {
              setConfirmationStage('confirmed');
              onConfirmed?.(elapsed);
            }
            cleanup();
          } else {
            console.error('[FastConfirmation] Transaction reverted');
            setConfirmationStage('failed');
            onFailed?.('Transaction reverted');
            cleanup();
          }
        }
      } catch {
        // Receipt not available yet, continue polling
      }
    }, POLLING_INTERVAL_MS);
    
  }, [
    cleanup, 
    pusher, 
    setConfirmationStage, 
    setConfirmationTimestamp, 
    confirmationTimestamp,
    confirmationStage,
    onConfirmed, 
    onFailed
  ]);

  // React to Pusher events
  useEffect(() => {
    if (!isConfirmingRef.current) return;
    
    const elapsed = confirmationTimestamp ? Date.now() - confirmationTimestamp : 0;
    
    // Order picked up
    if (pusher.hasPickedUp && confirmationStage === 'submitted') {
      console.log(`[FastConfirmation] Order picked up (Pusher) in ${elapsed}ms`);
      setConfirmationStage('picked_up');
      onPickedUp?.();
    }
    
    // Flashblock preconfirmation
    if (pusher.hasPreconfirmed && ['submitted', 'picked_up'].includes(confirmationStage)) {
      console.log(`[FastConfirmation] Preconfirmed (Pusher) in ${elapsed}ms`);
      setConfirmationStage('preconfirmed');
      onPreconfirmed?.();
    }
    
    // Order filled
    if (pusher.hasFilled && confirmationStage !== 'confirmed' && confirmationStage !== 'failed') {
      console.log(`[FastConfirmation] Confirmed (Pusher) in ${elapsed}ms`);
      setConfirmationStage('confirmed');
      onConfirmed?.(elapsed);
      cleanup();
    }
    
    // Order canceled
    if (pusher.hasCanceled && confirmationStage !== 'confirmed' && confirmationStage !== 'failed') {
      console.log(`[FastConfirmation] Failed/Canceled (Pusher) in ${elapsed}ms`);
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
