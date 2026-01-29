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
export type Resolution = 60 | 180 | 300 | 900; // 1m, 3m, 5m, 15m in seconds

// Data storage configuration
const MAX_TICKS = 18000; // 5 hours of 1-second ticks (5 * 3600)
const MAX_AGE_SECONDS = 18000; // 5 hours
const UPDATE_INTERVAL_MS = 1000; // Update every 1 second

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

/**
 * Hook that runs in the background to collect 1-second tick data for all assets.
 * Should be mounted once at the app level (e.g., in main page or layout).
 * 
 * Updates every 1 second via WebSocket and stores raw ticks for client-side aggregation.
 */
export function useChartDataCollector() {
  const prices = useTradeStore(state => state.prices);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start collecting data
    const collect = () => {
      const now = Date.now();
      const timeInSeconds = Math.floor(now / 1000);

      // Process all available asset prices
      Object.entries(prices).forEach(([assetPair, priceData]) => {
        if (!priceData?.price) return;

        const price = priceData.price;
        const lastUpdate = lastUpdateTimes.get(assetPair) || 0;
        
        // Throttle: only update if at least 1 second has passed
        if (now - lastUpdate < UPDATE_INTERVAL_MS) {
          return;
        }

        lastUpdateTimes.set(assetPair, now);

        // Get or create tick buffer for this asset
        let ticks = tickDataStore.get(assetPair) || [];
        
        // Add new tick
        ticks = [...ticks, {
          time: timeInSeconds,
          price,
        }];

        // Trim old ticks (keep only last 5 hours)
        const cutoffTime = timeInSeconds - MAX_AGE_SECONDS;
        ticks = ticks.filter(tick => tick.time > cutoffTime);
        if (ticks.length > MAX_TICKS) {
          ticks = ticks.slice(-MAX_TICKS);
        }

        tickDataStore.set(assetPair, ticks);
      });
    };

    // Run immediately
    collect();

    // Then run every second
    intervalRef.current = setInterval(collect, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [prices]);

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
