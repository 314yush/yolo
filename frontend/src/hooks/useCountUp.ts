'use client';

import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  enabled?: boolean;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function useCountUp({ end, duration = 800, decimals = 2, prefix = '', enabled = true }: UseCountUpOptions): string {
  const [display, setDisplay] = useState(`${prefix}${(0).toFixed(decimals)}`);
  const rafRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const initialEndRef = useRef(end);

  // Animate only on initial mount (from 0 to first value)
  useEffect(() => {
    if (hasAnimatedRef.current) return;
    if (!enabled) {
      setDisplay(`${prefix}${end.toFixed(decimals)}`);
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplay(`${prefix}${end.toFixed(decimals)}`);
      hasAnimatedRef.current = true;
      return;
    }

    const target = initialEndRef.current;
    let startTime: number | null = null;

    function animate(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const current = easedProgress * target;

      setDisplay(`${prefix}${current.toFixed(decimals)}`);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        hasAnimatedRef.current = true;
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // After initial animation, update display directly on every change
  useEffect(() => {
    if (hasAnimatedRef.current) {
      setDisplay(`${prefix}${end.toFixed(decimals)}`);
    }
  }, [end, prefix, decimals]);

  return display;
}
