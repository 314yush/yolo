'use client';

import { useEffect, useRef } from 'react';
import { useTradeStore } from '@/store/tradeStore';

/**
 * Background chart data collector with 1-second granularity.
 * Continuously accumulates tick data for all assets and aggregates client-side into time-based bars.
 * 
 * Data Configuration:
 * - Storage: Raw 1-second ticks (up to 5 hours for aggregation)
 * - Aggregation: Client-side into 3m, 5m, and 15m bars
 * - Default resolution: 3 minutes (180 seconds)
 * - Display: ~100 visible candles in viewport
 */

export interface CandlestickDataPoint {
  time: number; // Unix timestamp in seconds (aligned to bar boundary)
  open: number;
  high: number;
  low: number;
  close: number;
}

// Raw tick data point (1-second granularity)
interface TickDataPoint {
  time: number; // Unix timestamp in seconds
  price: number;
}

// Supported resolutions
export type Resolution = 60 | 180 | 300 | 900 | 14400 | 86400; // 1m, 3m, 5m, 15m, 4h, 1d in seconds

// Data storage configuration
const MAX_TICKS = 18000; // 5 hours of 1-second ticks (5 * 3600)
const MAX_AGE_SECONDS = 18000; // 5 hours
/** When price is unchanged, sample this often so flat segments still advance with the clock */
const FLAT_HEARTBEAT_MS = 1000;

// Default resolution: 1 minute
export const DEFAULT_RESOLUTION: Resolution = 60; // 1 minute
export const DEFAULT_VISIBLE_CANDLES = 360; // 6 hours = 360 candles at 1m resolution

// In-memory storage for raw tick data (1-second granularity)
const tickDataStore: Map<string, TickDataPoint[]> = new Map();
const lastUpdateTimes: Map<string, number> = new Map();

/**
 * Round timestamp to a specific resolution boundary
 */
function roundToResolution(timestampSeconds: number, resolutionSeconds: number): number {
  return Math.floor(timestampSeconds / resolutionSeconds) * resolutionSeconds;
}

/**
 * Aggregate 1-second ticks into time-based bars (OHLC)
 */
function aggregateTicksToBars(ticks: TickDataPoint[], resolutionSeconds: number): CandlestickDataPoint[] {
  if (ticks.length === 0) return [];

  // Group ticks by resolution boundary
  const barsMap = new Map<number, { open: number; high: number; low: number; close: number; count: number }>();

  ticks.forEach(tick => {
    const barTime = roundToResolution(tick.time, resolutionSeconds);
    const bar = barsMap.get(barTime);

    if (!bar) {
      barsMap.set(barTime, {
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        count: 1,
      });
    } else {
      bar.high = Math.max(bar.high, tick.price);
      bar.low = Math.min(bar.low, tick.price);
      bar.close = tick.price;
      bar.count++;
    }
  });

  // Convert map to sorted array
  const bars: CandlestickDataPoint[] = Array.from(barsMap.entries())
    .map(([time, data]) => ({
      time,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
    }))
    .sort((a, b) => a.time - b.time);

  return bars;
}

/**
 * Get aggregated candlestick data for an asset pair at a specific resolution.
 * Returns immediately available data without waiting.
 */
export function getChartData(assetPair: string, resolution: Resolution = DEFAULT_RESOLUTION): CandlestickDataPoint[] {
  const ticks = tickDataStore.get(assetPair) || [];
  
  if (ticks.length === 0) {
    return [];
  }

  // Aggregate ticks into bars
  const bars = aggregateTicksToBars(ticks, resolution);
  
  return bars;
}

/**
 * Get raw per-second tick data for an asset pair.
 * Useful for line charts that should mirror live SSE cadence directly.
 */
export function getTickData(assetPair: string, lookbackSeconds = 900): Array<{ time: number; price: number }> {
  const ticks = tickDataStore.get(assetPair) || [];
  if (ticks.length === 0) return [];

  const latestTime = ticks[ticks.length - 1]?.time ?? 0;
  const cutoff = Math.max(0, latestTime - lookbackSeconds);
  return ticks.filter(tick => tick.time >= cutoff);
}

/**
 * Clear chart data for an asset pair.
 */
export function clearChartData(assetPair: string): void {
  tickDataStore.delete(assetPair);
  lastUpdateTimes.delete(assetPair);
}

/**
 * Clear all chart data.
 */
export function clearAllChartData(): void {
  tickDataStore.clear();
  lastUpdateTimes.clear();
}

/** Sample store into tick buffers — call on every `prices` update or on heartbeat */
export function collectChartTicksFromStore(): void {
  const now = Date.now();
  const timeInSeconds = Math.floor(now / 1000);
  const prices = useTradeStore.getState().prices;

  Object.entries(prices).forEach(([assetPair, priceData]) => {
    if (!priceData?.price) return;

    const price = priceData.price;
    const lastUpdate = lastUpdateTimes.get(assetPair) || 0;

    let ticks = tickDataStore.get(assetPair) || [];
    const lastTick = ticks[ticks.length - 1];
    const priceMoved = !lastTick || lastTick.price !== price;
    if (!priceMoved && now - lastUpdate < FLAT_HEARTBEAT_MS) {
      return;
    }

    lastUpdateTimes.set(assetPair, now);

    if (lastTick && lastTick.time === timeInSeconds) {
      ticks = [...ticks.slice(0, -1), { time: timeInSeconds, price }];
    } else {
      ticks = [...ticks, { time: timeInSeconds, price }];
    }

    const cutoffTime = timeInSeconds - MAX_AGE_SECONDS;
    ticks = ticks.filter(tick => tick.time > cutoffTime);
    if (ticks.length > MAX_TICKS) {
      ticks = ticks.slice(-MAX_TICKS);
    }

    tickDataStore.set(assetPair, ticks);
  });
}

/**
 * Hook that runs in the background to collect tick data for all assets.
 * Should be mounted once at the app level (e.g., in main page or layout).
 *
 * Flushes on every zustand `prices` change (same cadence as SSE batches) plus a slow heartbeat when flat.
 */
export function useChartDataCollector() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    collectChartTicksFromStore();

    const unsub = useTradeStore.subscribe((state, prev) => {
      if (state.prices !== prev.prices) {
        collectChartTicksFromStore();
      }
    });

    intervalRef.current = setInterval(() => {
      collectChartTicksFromStore();
    }, FLAT_HEARTBEAT_MS);

    return () => {
      unsub();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Return stats for debugging
  return {
    assetsTracked: tickDataStore.size,
    getChartData,
    clearChartData,
    clearAllChartData,
  };
}

/**
 * Hook to get candlestick data for a specific asset at a specific resolution.
 * Returns pre-loaded data immediately.
 */
export function useChartData(assetPair: string | null, resolution: Resolution = DEFAULT_RESOLUTION): {
  data: CandlestickDataPoint[];
  hasData: boolean;
} {
  const data = assetPair ? getChartData(assetPair, resolution) : [];
  
  return {
    data,
    hasData: data.length > 0,
  };
}
