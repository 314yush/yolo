'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, memo, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, AreaData, UTCTimestamp, LineStyle, CrosshairMode, LineSeries, AreaSeries } from 'lightweight-charts';
import { useTradeStore } from '@/store/tradeStore';
import { getChartData, type CandlestickDataPoint, type Resolution } from '@/hooks/useChartDataCollector';

interface PriceChartProps {
  assetPair: string | null;
  lineColor?: string;
  entryPrice?: number | null;
  liquidationPrice?: number | null;
  height?: number;
  showLegend?: boolean;
  pnl?: number;
  resolution?: Resolution; // 60 (1m), 180 (3m), 300 (5m), or 900 (15m)
}

// 5-minute resolution (300 seconds)
const CHART_RESOLUTION: Resolution = 300;
// 6-hour rolling window = 72 data points at 5-minute resolution
const VISIBLE_CANDLES = 72;

// Color palette for line + stacked area chart
const CHART_COLORS = {
  background: '#000000',
  text: '#787b86',
  textBright: '#d1d4dc',
  crosshair: 'rgba(120, 123, 134, 0.5)',
  entry: '#2962ff',
  liquidation: '#f23645',
  line: '#00AAE4', // Primary line color
  // Area colors (25% opacity, no borders)
  areaPositive: 'rgba(8, 153, 129, 0.25)', // Positive delta (green, 25% opacity)
  areaNegative: 'rgba(242, 54, 69, 0.25)', // Negative delta (red, 25% opacity)
  // Price change indicator colors
  priceUp: '#089981', // Green for up price
  priceDown: '#f23645', // Red for down price
};

const SYNC_INTERVAL_MS = 1000; // Sync every second for real-time updates

function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function getPricePrecision(price: number): number {
  if (price >= 10000) return 2;
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  return 6;
}

function PriceChartComponent({ 
  assetPair, 
  lineColor = CHART_COLORS.line, 
  entryPrice = null,
  liquidationPrice = null,
  height = 150,
  showLegend = true,
  pnl = 0,
  resolution = CHART_RESOLUTION, // Default: 5 minutes
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const positiveAreaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const negativeAreaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const entryPriceLineRef = useRef<any>(null);
  const liquidationPriceLineRef = useRef<any>(null);
  
  const [isChartReady, setIsChartReady] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [timeRange, setTimeRange] = useState<string>('');
  const dataBufferRef = useRef<CandlestickDataPoint[]>([]);
  const isInitializedRef = useRef(false);
  const visibleRangeSetRef = useRef(false);
  
  const prices = useTradeStore(state => state.prices);
  const pythPrice = assetPair ? prices[assetPair]?.price ?? null : null;
  const isConnected = pythPrice !== null;
  
  const updateTimeRangeDisplay = useCallback(() => {
    if (!chartRef.current) return;
    
    const timeScale = chartRef.current.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();
    
    if (visibleRange && dataBufferRef.current.length > 0) {
      const startIdx = Math.max(0, Math.floor(visibleRange.from));
      const endIdx = Math.min(dataBufferRef.current.length - 1, Math.ceil(visibleRange.to));
      
      if (startIdx < dataBufferRef.current.length && endIdx >= 0) {
        const startTime = new Date(dataBufferRef.current[startIdx].time * 1000);
        const endTime = new Date(dataBufferRef.current[Math.min(endIdx, dataBufferRef.current.length - 1)].time * 1000);
        
        const formatTime = (d: Date) => 
          `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        
        setTimeRange(`${formatTime(startTime)} - ${formatTime(endTime)}`);
      }
    }
  }, []);
  
  // Calculate positive/negative delta areas (stacked areas showing cumulative price changes per candle)
  const calculateDeltaAreas = useCallback((candles: CandlestickDataPoint[]): { positive: AreaData[], negative: AreaData[] } => {
    const positive: AreaData[] = [];
    const negative: AreaData[] = [];
    
    if (candles.length === 0) return { positive, negative };
    
    // Use first close price as baseline for stacking
    const baseline = candles[0].close;
    let cumulativePositive = 0;
    let cumulativeNegative = 0;
    
    candles.forEach((candle) => {
      const time = candle.time as UTCTimestamp;
      const priceDelta = candle.close - candle.open;
      
      if (priceDelta > 0) {
        // Positive delta: add to positive cumulative stack
        cumulativePositive += priceDelta;
        // Negative area stays at its current cumulative level (doesn't reset)
      } else if (priceDelta < 0) {
        // Negative delta: add magnitude to negative cumulative stack
        cumulativeNegative += Math.abs(priceDelta);
        // Positive area stays at its current cumulative level (doesn't reset)
      }
      // If priceDelta === 0, both cumulative values remain unchanged
      
      // Both areas always rendered, showing cumulative deltas stacked from baseline
      positive.push({
        time,
        value: baseline + cumulativePositive,
      });
      negative.push({
        time,
        value: baseline + cumulativeNegative,
      });
    });
    
    return { positive, negative };
  }, []);
  
  const loadChartData = useCallback((candles: CandlestickDataPoint[]) => {
    if (!lineSeriesRef.current || !isChartReady) return;
    
    // Filter and validate data, keep only last 72 candles (6-hour window)
    const validCandles = candles
      .filter(candle => 
        candle && 
        !isNaN(candle.close) &&
        candle.close > 0
      )
      .slice(-VISIBLE_CANDLES); // Keep only last 72 data points
    
    if (validCandles.length === 0) return;
    
    // Convert to line data (close price only)
    const lineData: LineData[] = validCandles.map(candle => ({
      time: candle.time as UTCTimestamp,
      value: candle.close,
    }));
    
    // Calculate delta areas (stacked positive/negative deltas)
    const deltaAreas = calculateDeltaAreas(validCandles);
    
    try {
      // Only use setData() for initial load
      if (!hasData && lineData.length >= 1) {
        lineSeriesRef.current.setData(lineData);
        
        // Set area series data (stacked behind line)
        if (positiveAreaSeriesRef.current) {
          positiveAreaSeriesRef.current.setData(deltaAreas.positive);
        }
        if (negativeAreaSeriesRef.current) {
          negativeAreaSeriesRef.current.setData(deltaAreas.negative);
        }
        
        setHasData(true);
        
        // Set visible range ONCE during initial load only - show 72 candles (6 hours)
        requestAnimationFrame(() => {
          if (chartRef.current && lineData.length > 0 && !visibleRangeSetRef.current) {
            const timeScale = chartRef.current.timeScale();
            const visibleEnd = lineData.length - 1;
            const visibleStart = Math.max(0, visibleEnd - Math.min(VISIBLE_CANDLES - 1, visibleEnd));
            
            if (visibleStart <= visibleEnd && visibleEnd >= 0) {
              timeScale.setVisibleLogicalRange({
                from: visibleStart,
                to: visibleEnd,
              });
              visibleRangeSetRef.current = true;
            } else {
              timeScale.fitContent();
              visibleRangeSetRef.current = true;
            }
            
            updateTimeRangeDisplay();
          }
        });
      } else {
        // For live updates, use update() instead of setData() to avoid jitter
        if (lineData.length > 0 && lineSeriesRef.current) {
          const latestPoint = lineData[lineData.length - 1];
          try {
            lineSeriesRef.current.update(latestPoint);
            
            // Update area series with latest delta data
            const latestDelta = calculateDeltaAreas([validCandles[validCandles.length - 1]]);
            if (positiveAreaSeriesRef.current && latestDelta.positive.length > 0) {
              positiveAreaSeriesRef.current.update(latestDelta.positive[0]);
            }
            if (negativeAreaSeriesRef.current && latestDelta.negative.length > 0) {
              negativeAreaSeriesRef.current.update(latestDelta.negative[0]);
            }
          } catch (err) {
            // If update fails, fall back to setData
            console.warn('[PriceChart] Update failed, falling back to setData:', err);
            lineSeriesRef.current.setData(lineData);
            if (positiveAreaSeriesRef.current) {
              positiveAreaSeriesRef.current.setData(deltaAreas.positive);
            }
            if (negativeAreaSeriesRef.current) {
              negativeAreaSeriesRef.current.setData(deltaAreas.negative);
            }
          }
        }
        updateTimeRangeDisplay();
      }
    } catch (err) {
      console.error('[PriceChart] Error loading chart data:', err);
    }
  }, [isChartReady, hasData, updateTimeRangeDisplay, calculateDeltaAreas]);
  
  // Load initial data
  useEffect(() => {
    if (!isChartReady || !assetPair || isInitializedRef.current) return;
    
    // Always use 5-minute resolution
    const preloadedCandles = getChartData(assetPair, CHART_RESOLUTION);
    
    if (preloadedCandles.length >= 1) {
      console.log('[PriceChart] Loading pre-collected data:', preloadedCandles.length, 'candles at', CHART_RESOLUTION, 's resolution');
      dataBufferRef.current = preloadedCandles;
      loadChartData(preloadedCandles);
      isInitializedRef.current = true;
    }
  }, [isChartReady, assetPair, loadChartData]);
  
  // Periodic sync for real-time updates
  useEffect(() => {
    if (!isChartReady || !assetPair || !isInitializedRef.current) return;
    
    const syncInterval = setInterval(() => {
      // Always use 5-minute resolution
      const preloadedCandles = getChartData(assetPair, CHART_RESOLUTION);
      const currentLength = dataBufferRef.current.length;
      const newLength = preloadedCandles.length;
      
      const lengthChanged = newLength !== currentLength;
      const timeChanged = newLength > 0 && currentLength > 0 && 
                          preloadedCandles[newLength - 1].time !== dataBufferRef.current[currentLength - 1].time;
      const priceChanged = newLength > 0 && currentLength > 0 && 
                          preloadedCandles[newLength - 1].close !== dataBufferRef.current[currentLength - 1].close;
      
      if (lengthChanged || timeChanged || priceChanged) {
        dataBufferRef.current = preloadedCandles;
        loadChartData(preloadedCandles);
      }
    }, SYNC_INTERVAL_MS);
    
    return () => clearInterval(syncInterval);
  }, [isChartReady, assetPair, loadChartData]);
  
  // Clear on asset change
  useEffect(() => {
    dataBufferRef.current = [];
    setHasData(false);
    setTimeRange('');
    isInitializedRef.current = false;
    visibleRangeSetRef.current = false;
    
    if (lineSeriesRef.current) {
      try {
        lineSeriesRef.current.setData([]);
      } catch (err) {}
    }
    if (positiveAreaSeriesRef.current) {
      try {
        positiveAreaSeriesRef.current.setData([]);
      } catch (err) {}
    }
    if (negativeAreaSeriesRef.current) {
      try {
        negativeAreaSeriesRef.current.setData([]);
      } catch (err) {}
    }
  }, [assetPair]);

  // Initialize chart
  useLayoutEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    try {
      const containerWidth = 
        containerRef.current.clientWidth || 
        containerRef.current.offsetWidth || 
        containerRef.current.getBoundingClientRect().width ||
        window.innerWidth;
      
      const chartWidth = Math.max(containerWidth, 200);
      const pricePrecision = pythPrice ? getPricePrecision(pythPrice) : 2;
      
      // Create chart
      const chart = createChart(containerRef.current, {
        width: chartWidth,
        height,
        layout: {
          background: { color: CHART_COLORS.background },
          textColor: CHART_COLORS.text,
          fontFamily: "'Trebuchet MS', 'Lucida Grande', 'Lucida Sans Unicode', Arial, sans-serif",
          fontSize: 10,
        },
        grid: {
          vertLines: { 
            visible: false,
          },
          horzLines: { 
            visible: false, // Disable grid lines
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: CHART_COLORS.crosshair,
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: CHART_COLORS.background,
          },
          horzLine: {
            color: CHART_COLORS.crosshair,
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: CHART_COLORS.background,
          },
        },
        leftPriceScale: {
          visible: false,
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          textColor: CHART_COLORS.text,
          scaleMargins: {
            top: 0.2,
            bottom: 0.2,
          },
          alignLabels: true,
          borderVisible: false,
          entireTextOnly: true,
          autoScale: true,
          visible: true,
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          timeVisible: true,
          secondsVisible: false, // No seconds for 5m candles
          borderVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
          rightOffset: 2,
          barSpacing: 5, // Optimized for iPhone 15 Pro Max (430px width) - 72 candles
          minBarSpacing: 2,
          tickMarkFormatter: (time: UTCTimestamp) => {
            const date = new Date(time * 1000);
            return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          },
        },
        handleScale: {
          axisPressedMouseMove: {
            time: true,
            price: false,
          },
          mouseWheel: false,
          pinch: false,
        },
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        localization: {
          priceFormatter: (price: number) => formatPrice(price),
        },
      });

      // Add positive delta area series (behind line, rendered first)
      const positiveAreaSeries = chart.addSeries(AreaSeries, {
        topColor: CHART_COLORS.areaPositive,
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineColor: 'transparent', // No visible line border
        priceLineVisible: false,
        lastValueVisible: false, // No last-value label
        priceFormat: {
          type: 'price',
          precision: pricePrecision,
          minMove: 0.01,
        },
      });

      // Add negative delta area series (behind line, rendered second)
      const negativeAreaSeries = chart.addSeries(AreaSeries, {
        topColor: CHART_COLORS.areaNegative,
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineColor: 'transparent', // No visible line border
        priceLineVisible: false,
        lastValueVisible: false, // No last-value label
        priceFormat: {
          type: 'price',
          precision: pricePrecision,
          minMove: 0.01,
        },
      });

      // Add line series (on top of areas) - primary series using close price
      const lineSeries = chart.addSeries(LineSeries, {
        color: lineColor,
        lineWidth: 2,
        priceLineVisible: true, // Keep last-price horizontal line + label
        lastValueVisible: true, // Show last price label
        priceFormat: {
          type: 'price',
          precision: pricePrecision,
          minMove: 0.01,
        },
        visible: true,
      });

      chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        updateTimeRangeDisplay();
      });

      chartRef.current = chart;
      lineSeriesRef.current = lineSeries;
      positiveAreaSeriesRef.current = positiveAreaSeries;
      negativeAreaSeriesRef.current = negativeAreaSeries;
      setIsChartReady(true);
      
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
      console.error('[PriceChart] Failed to create chart:', err);
    }

    // Resize handling
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (containerRef.current && chartRef.current) {
          const newWidth = 
            containerRef.current.clientWidth || 
            containerRef.current.offsetWidth ||
            containerRef.current.getBoundingClientRect().width;
          const newHeight = 
            containerRef.current.clientHeight ||
            height;
          if (newWidth > 0 && newHeight > 0) {
            chartRef.current.applyOptions({
              width: newWidth,
              height: newHeight,
            });
          }
        }
      }, 100);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', handleResize);
    }

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
        positiveAreaSeriesRef.current = null;
        negativeAreaSeriesRef.current = null;
        entryPriceLineRef.current = null;
        liquidationPriceLineRef.current = null;
      }
      setIsChartReady(false);
    };
  }, []); // Only initialize once

  // Update chart height when it changes
  useEffect(() => {
    if (chartRef.current && isChartReady) {
      chartRef.current.applyOptions({ height });
    }
  }, [height, isChartReady]);

  // Update line color when it changes
  useEffect(() => {
    if (lineSeriesRef.current && isChartReady) {
      lineSeriesRef.current.applyOptions({ color: lineColor });
    }
  }, [lineColor, isChartReady]);

  // Entry price line
  useEffect(() => {
    if (!isChartReady || !lineSeriesRef.current) return;

    if (entryPriceLineRef.current) {
      try {
        lineSeriesRef.current.removePriceLine(entryPriceLineRef.current);
      } catch (err) {}
      entryPriceLineRef.current = null;
    }

    if (entryPrice !== null && entryPrice > 0) {
      try {
        entryPriceLineRef.current = lineSeriesRef.current.createPriceLine({
          price: entryPrice,
          color: CHART_COLORS.entry,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: '',
        });
      } catch (err) {
        console.error('[PriceChart] Error creating entry price line:', err);
      }
    }
  }, [entryPrice, isChartReady]);

  // Liquidation price line
  useEffect(() => {
    if (!isChartReady || !lineSeriesRef.current) return;

    if (liquidationPriceLineRef.current) {
      try {
        lineSeriesRef.current.removePriceLine(liquidationPriceLineRef.current);
      } catch (err) {}
      liquidationPriceLineRef.current = null;
    }

    if (liquidationPrice !== null && liquidationPrice > 0) {
      try {
        liquidationPriceLineRef.current = lineSeriesRef.current.createPriceLine({
          price: liquidationPrice,
          color: CHART_COLORS.liquidation,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '',
        });
      } catch (err) {
        console.error('[PriceChart] Error creating liquidation price line:', err);
      }
    }
  }, [liquidationPrice, isChartReady]);

  const candleCount = dataBufferRef.current.length;
  const hasHistory = candleCount > VISIBLE_CANDLES;
  const priceChange = entryPrice && pythPrice 
    ? ((pythPrice - entryPrice) / entryPrice) * 100 
    : null;
  const isPriceUp = priceChange !== null && priceChange > 0;

  return (
    <div 
      className="w-full relative price-chart-container" 
      style={{ 
        width: '100%', 
        margin: 0, 
        padding: '0 4px', // Reduced padding for better mobile fit
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Minimal time range overlay */}
      {timeRange && candleCount > 0 && (
        <div 
          className="absolute top-2 left-2 z-10 px-2 py-1 rounded text-[10px] font-sans"
          style={{
            background: 'rgba(19, 23, 34, 0.8)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: CHART_COLORS.text,
            fontSize: '10px',
          }}
        >
          {timeRange}
        </div>
      )}
      
      {/* Minimal price change indicator */}
      {priceChange !== null && (
        <div 
          className="absolute bottom-2 right-2 z-10 px-2 py-1 rounded text-[10px] font-sans"
          style={{
            background: 'rgba(19, 23, 34, 0.8)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: isPriceUp ? CHART_COLORS.priceUp : CHART_COLORS.priceDown,
            fontSize: '10px',
          }}
        >
          {isPriceUp ? '+' : ''}{priceChange.toFixed(2)}%
        </div>
      )}
      
      {/* Chart container */}
      <div 
        ref={containerRef}
        className="w-full touch-pan-x chart-touch-container"
        style={{ 
          height,
          width: '100%',
          margin: 0,
          padding: 0,
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export const PriceChart = memo(PriceChartComponent);
export default PriceChart;
