'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTradeStore, type ConfirmationStage } from '@/store/tradeStore';

const STAGE_DELAYS_MS: { stage: ConfirmationStage; delay: number }[] = [
  { stage: 'submitted', delay: 0 },
  { stage: 'picked_up', delay: 150 },
  { stage: 'preconfirmed', delay: 300 },
  { stage: 'confirmed', delay: 650 },
];

export function usePaperSimulatedConfirmation() {
  const {
    setConfirmationStage,
    setConfirmationTimestamp,
  } = useTradeStore();

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sessionRef = useRef(0);

  const cancelConfirmation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setConfirmationStage('none');
    setConfirmationTimestamp(null);
  }, [setConfirmationStage, setConfirmationTimestamp]);

  const startConfirmation = useCallback(() => {
    cancelConfirmation();
    const session = ++sessionRef.current;
    const startTime = Date.now();
    setConfirmationTimestamp(startTime);
    setConfirmationStage('submitted');

    for (const { stage, delay } of STAGE_DELAYS_MS) {
      if (delay === 0) continue;
      const timer = setTimeout(() => {
        if (sessionRef.current !== session) return;
        setConfirmationStage(stage);
      }, delay);
      timersRef.current.push(timer);
    }
  }, [cancelConfirmation, setConfirmationStage, setConfirmationTimestamp]);

  useEffect(() => cancelConfirmation, [cancelConfirmation]);

  return { startConfirmation, cancelConfirmation };
}
