'use client';

import { useEffect, useRef } from 'react';
import { useTradeStore } from '@/store/tradeStore';

/**
 * Background chart data collector.
 * Continuously accumulates price data for all assets so charts can render immediately.
 * 
 * This runs in the background as soon as the user logs in, ensuring that
 * when they open the PnL screen, chart data is already available.
 */

export interface ChartDataPoint {
  time: number; // Unix timestamp in seconds
  value: number; // Price
}

const MAX_DATA_POINTS = 5; // 5 minutes of data at 1-minute intervals
const MAX_AGE_SECONDS = 300; // 5 minutes
const UPDATE_INTERVAL_MS = 60000; // Collect data every minute (1m granularity)

// In-memory storage for chart data (persists across component mounts)
const chartDataStore: Map<string, ChartDataPoint[]> = new Map();
const lastUpdateTimes: Map<string, number> = new Map();

/**
 * Get pre-loaded chart data for an asset pair.
 * Returns immediately available data without waiting.
 */
export function getChartData(assetPair: string): ChartDataPoint[] {
  return chartDataStore.get(assetPair) || [];
}

/**
 * Clear chart data for an asset pair.
 */
export function clearChartData(assetPair: string): void {
  chartDataStore.delete(assetPair);
  lastUpdateTimes.delete(assetPair);
}

/**
 * Clear all chart data.
 */
export function clearAllChartData(): void {
  chartDataStore.clear();
  lastUpdateTimes.clear();
}

/**
 * Hook that runs in the background to collect chart data for all assets.
 * Should be mounted once at the app level (e.g., in main page or layout).
 */
export function useChartDataCollector() {
  const prices = useTradeStore(state => state.prices);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start collecting data
    const collect = () => {
      const now = Date.now();
      // Round to nearest minute for 1-minute granularity
      const timeInSeconds = Math.floor(now / 60000) * 60; // Round to minute boundary

      // Process all available asset prices
      Object.entries(prices).forEach(([assetPair, priceData]) => {
        if (!priceData?.price) return;

        const lastUpdate = lastUpdateTimes.get(assetPair) || 0;
        
        // Throttle updates per asset (only update once per minute)
        if (now - lastUpdate < UPDATE_INTERVAL_MS) {
          return;
        }

        lastUpdateTimes.set(assetPair, now);

        // Get or create buffer for this asset
        let buffer = chartDataStore.get(assetPair) || [];

        // Create new point (at minute boundary)
        const newPoint: ChartDataPoint = {
          time: timeInSeconds,
          value: priceData.price,
        };

        // Check if we already have a point for this minute
        const lastPoint = buffer[buffer.length - 1];
        if (lastPoint && lastPoint.time === timeInSeconds) {
          // Update existing point (same minute)
          buffer[buffer.length - 1] = newPoint;
        } else {
          // Add new point (new minute)
          buffer = [...buffer, newPoint];
        }

        // Trim old points (keep only last 5 minutes)
        const cutoffTime = timeInSeconds - MAX_AGE_SECONDS;
        buffer = buffer.filter(point => point.time > cutoffTime);
        if (buffer.length > MAX_DATA_POINTS) {
          buffer = buffer.slice(-MAX_DATA_POINTS);
        }

        // Store updated buffer
        chartDataStore.set(assetPair, buffer);
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
    assetsTracked: chartDataStore.size,
    getChartData,
    clearChartData,
    clearAllChartData,
  };
}

/**
 * Hook to get chart data for a specific asset.
 * Returns pre-loaded data immediately.
 */
export function useChartData(assetPair: string | null): {
  data: ChartDataPoint[];
  hasData: boolean;
} {
  const data = assetPair ? getChartData(assetPair) : [];
  
  return {
    data,
    hasData: data.length > 0,
  };
}
