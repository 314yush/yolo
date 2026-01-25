'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, memo, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, UTCTimestamp, AreaSeries } from 'lightweight-charts';
import { useTradeStore } from '@/store/tradeStore';
import { getChartData, type ChartDataPoint } from '@/hooks/useChartDataCollector';

interface PriceChartProps {
  assetPair: string | null;
  lineColor?: string;
  entryPrice?: number | null;
  height?: number;
  showLegend?: boolean;
  pnl?: number; // PnL value to determine chart colors
}

// Configuration
const MAX_DATA_POINTS = 5; // 5 minutes of data at 1-minute intervals
const MAX_AGE_SECONDS = 300; // 5 minutes
const UPDATE_INTERVAL_MS = 60000; // Update chart every minute (1m granularity)
const SYNC_PRELOADED_DATA_INTERVAL = 60000; // Sync with pre-loaded data every minute

/**
 * Real-time price chart component using TradingView Lightweight Charts.
 * 
 * Displays a 1-minute rolling window of price data with:
 * - Asset-colored line with neon glow effect
 * - Entry price marker (horizontal dashed line)
 * - Dark theme matching YOLO design
 * 
 * Uses Pyth Hermes WebSocket data from the store (already streaming).
 */
function PriceChartComponent({ 
  assetPair, 
  lineColor = '#00AAE4', 
  entryPrice = null,
  height = 150,
  showLegend = true,
  pnl = 0
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const priceLineRef = useRef<ReturnType<ISeriesApi<'Area'>['createPriceLine']> | null>(null);
  
  const [isChartReady, setIsChartReady] = useState(false);
  const [hasData, setHasData] = useState(false);
  const dataBufferRef = useRef<ChartDataPoint[]>([]);
  const lastUpdateRef = useRef<number>(0);
  const isInitializedRef = useRef(false);
  
  // Get price from store (Pyth Hermes WebSocket)
  const prices = useTradeStore(state => state.prices);
  const pythPrice = assetPair ? prices[assetPair]?.price ?? null : null;
  const isConnected = pythPrice !== null;
  
  
  // Initialize chart with current price immediately (create at least 2 points for a line)
  const initializeWithCurrentPrice = useCallback((price: number) => {
    if (!lineSeriesRef.current || !isChartReady || isInitializedRef.current) return;
    
    const now = Date.now();
    // Round to nearest minute for 1-minute granularity
    const timeInSeconds = Math.floor(now / 60000) * 60;
    
    // Create initial 2 points (required for a visible line)
    const initialBuffer: ChartDataPoint[] = [
      { time: timeInSeconds - 60, value: price }, // 1 minute ago
      { time: timeInSeconds, value: price },     // now
    ];
    
    dataBufferRef.current = initialBuffer;
    
    const chartData: LineData[] = initialBuffer.map(point => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    }));
    
    try {
      lineSeriesRef.current.setData(chartData);
      // Use requestAnimationFrame to ensure chart is ready before fitting
      requestAnimationFrame(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      });
      setHasData(true);
      isInitializedRef.current = true;
    } catch (err) {
      console.error('[PriceChart] Error initializing chart:', err);
    }
  }, [isChartReady]);
  
  // Update chart with new data point
  const updateChart = useCallback((price: number) => {
    if (!lineSeriesRef.current || !isChartReady) return;
    
    const now = Date.now();
    // Round to nearest minute for 1-minute granularity
    const timeInSeconds = Math.floor(now / 60000) * 60;
    
    // Get current buffer
    let buffer = dataBufferRef.current;
    
    // Create new point (at minute boundary)
    const newPoint: ChartDataPoint = { time: timeInSeconds, value: price };
    
    // Check if we already have a point for this minute
    const lastPoint = buffer[buffer.length - 1];
    if (lastPoint && lastPoint.time === timeInSeconds) {
      // Update existing point (same minute) - only if price changed significantly
      const priceDiff = Math.abs(lastPoint.value - price);
      const priceChangePercent = (priceDiff / lastPoint.value) * 100;
      if (priceChangePercent > 0.01) { // Only update if price changed by more than 0.01%
        buffer[buffer.length - 1] = newPoint;
      } else {
        return; // Skip update if price hasn't changed meaningfully
      }
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
    
    dataBufferRef.current = buffer;
    
    // Convert to chart format
    const chartData: LineData[] = buffer.map(point => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    }));
    
    // Update the series (without fitContent to prevent continuous refresh)
    try {
      lineSeriesRef.current.setData(chartData);
      
      // Only fit content once on initial load when we have enough data
      if (!hasData && buffer.length >= 2) {
        setHasData(true);
        // Use requestAnimationFrame to ensure chart is ready
        requestAnimationFrame(() => {
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        });
      }
    } catch (err) {
      console.error('[PriceChart] Error updating chart:', err);
    }
  }, [isChartReady, hasData]);
  
  // Load pre-collected chart data when chart is ready
  useEffect(() => {
    if (!isChartReady || !assetPair || isInitializedRef.current) return;
    
    // Try to load pre-collected data
    const preloadedData = getChartData(assetPair);
    
    if (preloadedData.length >= 2) {
      // Use pre-loaded data
      console.log('[PriceChart] Loading pre-collected data:', preloadedData.length, 'points');
      dataBufferRef.current = preloadedData;
      
      const chartData: LineData[] = preloadedData.map(point => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      }));
      
      try {
        if (lineSeriesRef.current) {
          lineSeriesRef.current.setData(chartData);
          // Use requestAnimationFrame to ensure chart is ready before fitting
          requestAnimationFrame(() => {
            if (chartRef.current) {
              chartRef.current.timeScale().fitContent();
            }
          });
          setHasData(true);
          isInitializedRef.current = true;
          console.log('[PriceChart] Chart initialized with pre-loaded data');
        }
      } catch (err) {
        console.error('[PriceChart] Error loading pre-collected data:', err);
      }
    } else if (pythPrice !== null) {
      // Fallback: initialize with current price
      console.log('[PriceChart] No pre-loaded data, initializing with current price');
      initializeWithCurrentPrice(pythPrice);
    }
  }, [isChartReady, assetPair, pythPrice, initializeWithCurrentPrice]);
  
  // Update chart with new Pyth price updates (throttled to minute intervals)
  useEffect(() => {
    if (pythPrice === null || !isChartReady || !isInitializedRef.current) return;
    
    const now = Date.now();
    
    // Throttle updates to minute intervals
    if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) {
      return;
    }
    lastUpdateRef.current = now;
    
    updateChart(pythPrice);
  }, [pythPrice, isChartReady, updateChart]);
  
  // Periodically sync with pre-loaded data (in case chart data collector has newer data)
  useEffect(() => {
    if (!isChartReady || !assetPair || !isInitializedRef.current) return;
    
    const syncInterval = setInterval(() => {
      const preloadedData = getChartData(assetPair);
      
      // Only sync if pre-loaded data has significantly more points (new minute added)
      // Avoid syncing if data is identical to prevent unnecessary refreshes
      const currentLength = dataBufferRef.current.length;
      const newLength = preloadedData.length;
      
      if (newLength > currentLength) {
        // New data point added - sync it
        console.log('[PriceChart] Syncing with pre-loaded data:', newLength, 'points (was', currentLength, ')');
        dataBufferRef.current = preloadedData;
        
        const chartData: LineData[] = preloadedData.map(point => ({
          time: point.time as UTCTimestamp,
          value: point.value,
        }));
        
        try {
          if (lineSeriesRef.current) {
            lineSeriesRef.current.setData(chartData);
            // Never call fitContent here - it causes continuous refresh
          }
        } catch (err) {
          console.error('[PriceChart] Error syncing with pre-loaded data:', err);
        }
      }
    }, SYNC_PRELOADED_DATA_INTERVAL);
    
    return () => clearInterval(syncInterval);
  }, [isChartReady, assetPair]);
  
  // Clear data when asset changes
  useEffect(() => {
    dataBufferRef.current = [];
    setHasData(false);
    lastUpdateRef.current = 0;
    isInitializedRef.current = false;
    
    // Clear chart data
    if (lineSeriesRef.current) {
      try {
        lineSeriesRef.current.setData([]);
      } catch (err) {
        // Ignore errors during cleanup
      }
    }
  }, [assetPair]);

  // Initialize chart - using useLayoutEffect for synchronous execution before paint
  useLayoutEffect(() => {
    if (!containerRef.current) {
      console.error('[PriceChart] Container ref is null, cannot initialize chart');
      return;
    }

    // Skip if chart already exists (prevent recreation on pnl changes)
    if (chartRef.current) {
      return;
    }

    try {
      // Get container width - ensure it fills mobile view
      // Use multiple fallbacks to ensure we get a valid width
      const containerWidth = 
        containerRef.current.clientWidth || 
        containerRef.current.offsetWidth || 
        containerRef.current.getBoundingClientRect().width ||
        window.innerWidth;
      
      // Ensure minimum width for chart to render
      const chartWidth = Math.max(containerWidth, 200);
      
      // Create chart with TradingView-style config
      const chart = createChart(containerRef.current, {
        width: chartWidth,
        height,
        layout: {
          background: { color: '#000000' },
          textColor: '#666666',
        },
        grid: {
          vertLines: { color: '#1a1a1a' },
          horzLines: { color: '#1a1a1a' },
        },
        crosshair: {
          mode: 0, // Normal crosshair
          vertLine: {
            color: '#CCFF00',
            width: 1,
            style: 2, // Dashed
          },
          horzLine: {
            color: '#CCFF00',
            width: 1,
            style: 2, // Dashed
          },
        },
        rightPriceScale: {
          borderColor: '#2B2B2B',
          textColor: '#999999',
        },
        timeScale: {
          borderColor: '#2B2B2B',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: false, // Disable zoom on mobile
        handleScroll: false, // Disable scroll on mobile
      });

      // Determine colors based on PnL (initial)
      const isProfit = pnl >= 0;
      const chartLineColor = isProfit ? '#CCFF00' : '#FF006E';
      const topColor = isProfit ? 'rgba(204, 255, 0, 0.4)' : 'rgba(255, 0, 110, 0.4)';
      const bottomColor = 'rgba(0, 0, 0, 0)';

      // Add area series (v5 API: use addSeries with AreaSeries type)
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: topColor,
        bottomColor: bottomColor,
        lineColor: chartLineColor,
        lineWidth: 3,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: chartLineColor,
        crosshairMarkerBorderColor: '#ffffff',
        crosshairMarkerBorderWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false, // Hide default price line (we have entry marker)
      });

      chartRef.current = chart;
      lineSeriesRef.current = areaSeries;
      setIsChartReady(true);
      
      // Force initial resize after a short delay to ensure container is fully rendered
      setTimeout(() => {
        if (containerRef.current && chartRef.current) {
          const newWidth = 
            containerRef.current.clientWidth || 
            containerRef.current.offsetWidth ||
            containerRef.current.getBoundingClientRect().width;
          if (newWidth > 0 && newWidth !== chartWidth) {
            chartRef.current.applyOptions({ width: newWidth });
          }
        }
      }, 100);
    } catch (err) {
      console.error('[PriceChart] FATAL: Failed to create chart:', err);
      console.error('[PriceChart] Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    // Handle resize with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (containerRef.current && chartRef.current) {
          const newWidth = 
            containerRef.current.clientWidth || 
            containerRef.current.offsetWidth ||
            containerRef.current.getBoundingClientRect().width;
          if (newWidth > 0) {
            chartRef.current.applyOptions({
              width: newWidth,
            });
          }
        }
      }, 150);
    };

    // Use ResizeObserver for better mobile responsiveness
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', handleResize);
    }

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout);
      if (resizeObserver && containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        lineSeriesRef.current = null;
        priceLineRef.current = null;
      }
      setIsChartReady(false);
    };
  }, [height]); // Only recreate on height change, NOT on pnl change

  // Update area colors when PnL changes
  useEffect(() => {
    if (lineSeriesRef.current) {
      const isProfit = pnl >= 0;
      const chartLineColor = isProfit ? '#CCFF00' : '#FF006E';
      const topColor = isProfit ? 'rgba(204, 255, 0, 0.4)' : 'rgba(255, 0, 110, 0.4)';
      const bottomColor = 'rgba(0, 0, 0, 0)';
      
      lineSeriesRef.current.applyOptions({
        topColor: topColor,
        bottomColor: bottomColor,
        lineColor: chartLineColor,
        crosshairMarkerBackgroundColor: chartLineColor,
      });
    }
  }, [pnl]);

  // Update entry price line
  useEffect(() => {
    if (!isChartReady || !lineSeriesRef.current) return;

    // Remove existing price line
    if (priceLineRef.current) {
      try {
        lineSeriesRef.current.removePriceLine(priceLineRef.current);
      } catch (err) {
        // Ignore errors during cleanup
      }
      priceLineRef.current = null;
    }

    // Add new entry price line if provided
    if (entryPrice !== null && entryPrice > 0) {
      try {
        priceLineRef.current = lineSeriesRef.current.createPriceLine({
          price: entryPrice,
          color: '#666666',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: 'Entry',
        });
      } catch (err) {
        console.error('[PriceChart] Error creating price line:', err);
      }
    }
  }, [entryPrice, isChartReady]);

  // Always show chart container - no loading state needed
  return (
    <div 
      className="w-full relative price-chart-container" 
      style={{ 
        width: '100%', 
        margin: 0, 
        padding: 0,
        minWidth: 0, // Prevent flexbox overflow issues
        maxWidth: '100%', // Ensure it doesn't exceed parent
      }}
    >
      {/* Connection status indicator - smaller and bottom right */}
      <div className="absolute bottom-2 right-2 z-10">
        <div 
          className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />
      </div>
      
      {/* Chart container - optimized for mobile width */}
      <div 
        ref={containerRef}
        className="w-full"
        style={{ 
          height,
          width: '100%',
          margin: 0,
          padding: 0,
          minWidth: 0, // Prevent flexbox overflow
          maxWidth: '100%', // Ensure responsive
          boxSizing: 'border-box', // Include padding/border in width
        } as React.CSSProperties}
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const PriceChart = memo(PriceChartComponent);

export default PriceChart;
