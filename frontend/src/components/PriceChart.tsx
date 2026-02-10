'use client';

import React, { useEffect, useRef, memo, useCallback } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  IPriceLine, 
  UTCTimestamp, 
  LineStyle, 
  CrosshairMode, 
  AreaSeries,
  LineData
} from 'lightweight-charts';
import { useTradeStore } from '@/store/tradeStore';
import { getChartData, type CandlestickDataPoint, type Resolution } from '@/hooks/useChartDataCollector';

interface PriceChartProps {
  assetPair: string | null;
  lineColor?: string;
  entryPrice?: number | null;
  liquidationPrice?: number | null;
  takeProfitPrice?: number | null;
  height?: number;
  showLegend?: boolean;
  pnl?: number;
  resolution?: Resolution;
  leverage?: number;
}

// Fixed resolution for simplified chart - no user control
const CHART_RESOLUTION: Resolution = 60;
const SYNC_INTERVAL_MS = 1000;

// YOLO Brand Colors - Neobrutalist Design System
const BRAND_COLORS = {
  primary: '#CCFF00',      // Lime Green - Success/Primary
  secondary: '#FF006E',    // Hot Pink - Danger/Loss
  black: '#000000',        // True Black - Base
  white: '#FFFFFF',        // White - Text on dark
  gray900: '#111827',      // Secondary backgrounds
  gray600: '#4B5563',      // Disabled states
};

// Chart-specific colors aligned with brand
const CHART_COLORS = {
  background: BRAND_COLORS.black,
  text: BRAND_COLORS.white,
  textSecondary: BRAND_COLORS.gray600,
  crosshair: BRAND_COLORS.primary,
  entry: BRAND_COLORS.primary,        // Lime Green for entry
  liquidation: BRAND_COLORS.secondary, // Hot Pink for liquidation
  lineUp: BRAND_COLORS.primary,       // Lime Green line when profitable
  lineDown: BRAND_COLORS.secondary,   // Hot Pink line when losing
  border: BRAND_COLORS.black,
};

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

// Convert hex color to RGBA with opacity
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function PriceChartComponent({
  assetPair,
  lineColor = BRAND_COLORS.primary,
  entryPrice = null,
  liquidationPrice = null,
  takeProfitPrice = null,
  height = 120,
  pnl = 0,
  leverage = 1,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const entryPriceLineRef = useRef<IPriceLine | null>(null);
  const liquidationPriceLineRef = useRef<IPriceLine | null>(null);
  const takeProfitPriceLineRef = useRef<IPriceLine | null>(null);
  const chartDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  
  const prices = useTradeStore(state => state.prices);
  const pythPrice = assetPair ? prices[assetPair]?.price ?? null : null;
  
  // Determine line color based on PnL
  const chartLineColor = pnl >= 0 ? CHART_COLORS.lineUp : CHART_COLORS.lineDown;
  
  // Calculate liquidation price as -85% from entry price if not provided
  const calculatedLiquidationPrice = liquidationPrice !== null && liquidationPrice > 0
    ? liquidationPrice
    : entryPrice !== null && entryPrice > 0
    ? entryPrice * 0.15
    : null;

  // Convert candlestick data to line data (close prices only)
  const convertToLineData = useCallback((candles: CandlestickDataPoint[]): LineData[] => {
    const validCandles = candles.filter(candle => 
      candle && 
      !isNaN(candle.close) &&
      candle.close > 0
    );
    
    // Show last 30 data points for a smooth line
    const visibleCandles = Math.min(30, validCandles.length);
    const slicedCandles = validCandles.slice(-visibleCandles);
    
    return slicedCandles.map(candle => ({
      time: candle.time as UTCTimestamp,
      value: candle.close,
    }));
  }, []);

  // Update price lines with brand colors
  const updatePriceLines = useCallback(() => {
    if (!seriesRef.current) return;

    // Update entry price line - Lime Green
    if (entryPriceLineRef.current) {
      try {
        seriesRef.current.removePriceLine(entryPriceLineRef.current);
      } catch (err) {}
      entryPriceLineRef.current = null;
    }

    if (entryPrice !== null && entryPrice > 0) {
      try {
        entryPriceLineRef.current = seriesRef.current.createPriceLine({
          price: entryPrice,
          color: CHART_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `ENTRY: ${formatDisplayPrice(entryPrice)}`,
        });
      } catch (err) {
        console.error('[PriceChart] Error creating entry price line:', err);
      }
    }

    // Update liquidation price line - Hot Pink
    if (liquidationPriceLineRef.current) {
      try {
        seriesRef.current.removePriceLine(liquidationPriceLineRef.current);
      } catch (err) {}
      liquidationPriceLineRef.current = null;
    }

    if (calculatedLiquidationPrice !== null && calculatedLiquidationPrice > 0) {
      try {
        liquidationPriceLineRef.current = seriesRef.current.createPriceLine({
          price: calculatedLiquidationPrice,
          color: CHART_COLORS.liquidation,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `LIQ: ${formatDisplayPrice(calculatedLiquidationPrice)}`,
        });
      } catch (err) {
        console.error('[PriceChart] Error creating liquidation price line:', err);
      }
    }

    // Update take profit price line - Lime Green (dashed, different style)
    if (takeProfitPriceLineRef.current) {
      try {
        seriesRef.current.removePriceLine(takeProfitPriceLineRef.current);
      } catch (err) {}
      takeProfitPriceLineRef.current = null;
    }

    // Skip take-profit line for high leverage (stretches scale too much)
    if (takeProfitPrice !== null && takeProfitPrice > 0 && leverage < 100) {
      try {
        takeProfitPriceLineRef.current = seriesRef.current.createPriceLine({
          price: takeProfitPrice,
          color: CHART_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false, // Hide chart library label to reduce clutter
          title: '',
        });
      } catch (err) {
        console.error('[PriceChart] Error creating take profit price line:', err);
      }
    }
  }, [entryPrice, calculatedLiquidationPrice, takeProfitPrice, leverage]);

  // Initialize chart only once
  useEffect(() => {
    if (!containerRef.current || !assetPair || chartRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth || container.offsetWidth || container.getBoundingClientRect().width || window.innerWidth;
    const chartWidth = Math.max(containerWidth, 200);
    const pricePrecision = pythPrice ? getPricePrecision(pythPrice) : 2;
    const chartHeight = Math.max(height, 80);

    // Create chart - minimal, clean line chart
    const chart = createChart(container, {
      width: chartWidth,
      height: chartHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: CHART_COLORS.text,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 14, // Increased from 10 for better readability
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Hidden, // Hide crosshair for minimal look
      },
      leftPriceScale: { 
        visible: false, // Hide price scale labels, but keep Entry/LIQ labels
      },
      rightPriceScale: {
        visible: leverage >= 250, // Show price scale for high leverage trades
      },
      timeScale: {
        visible: false, // Hide time scale for minimal look
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: false,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      localization: {
        priceFormatter: (price: number) => formatPrice(price),
      },
    });

    // Add area series with gradient fill - visual richness
    const series = chart.addSeries(AreaSeries, {
      lineColor: chartLineColor,
      lineWidth: 2,
      topColor: hexToRgba(chartLineColor, 0.4), // 40% opacity for more visible gradient
      bottomColor: hexToRgba(chartLineColor, 0.05), // 5% opacity at bottom for subtle fade
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'price',
        precision: pricePrecision,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    chartDimensionsRef.current = { width: chartWidth, height: chartHeight };

    // Handle resize - debounced
    let resizeTimeout: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (container && chart && chartRef.current) {
          const newWidth = container.clientWidth || container.offsetWidth || container.getBoundingClientRect().width;
          const currentWidth = chartDimensionsRef.current.width;
          if (Math.abs(newWidth - currentWidth) > 5) {
            if (newWidth > 0) {
              chart.applyOptions({ width: newWidth });
              chartDimensionsRef.current.width = newWidth;
            }
          }
        }
      }, 150);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', handleResize);
    }

    // Load initial data - optimized for faster rendering
    const loadData = () => {
      const candles = getChartData(assetPair, CHART_RESOLUTION);
      
      if (candles.length > 0) {
        const validCandles = candles.filter(candle => 
          candle && 
          !isNaN(candle.close) &&
          candle.close > 0
        );
        
        // Use fewer points for initial render (faster), then update with more
        const initialPoints = Math.min(10, validCandles.length); // Start with 10 points
        const slicedCandles = validCandles.slice(-initialPoints);
        const lineData = slicedCandles.map(candle => ({
          time: candle.time as UTCTimestamp,
          value: candle.close,
        }));
        
        if (lineData.length > 0) {
          series.setData(lineData);
          
          // Fit content immediately for faster initial render
          chart.timeScale().fitContent();
          
          // Then update with more data points in next frame (progressive enhancement)
          if (validCandles.length > initialPoints) {
            requestAnimationFrame(() => {
              const fullCandles = Math.min(30, validCandles.length);
              const fullSlicedCandles = validCandles.slice(-fullCandles);
              const fullLineData = fullSlicedCandles.map(candle => ({
                time: candle.time as UTCTimestamp,
                value: candle.close,
              }));
              if (fullLineData.length > lineData.length) {
                series.setData(fullLineData);
                chart.timeScale().fitContent();
              }
            });
          }
        }
      } else {
        // Show empty chart immediately - don't wait for data
        series.setData([]);
      }
    };

    // Load data immediately (don't wait)
    loadData();
    
    // Update price lines after series is created
    if (entryPrice !== null && entryPrice > 0) {
      try {
        entryPriceLineRef.current = series.createPriceLine({
          price: entryPrice,
          color: CHART_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `ENTRY: ${formatDisplayPrice(entryPrice)}`,
        });
      } catch (err) {
        console.error('[PriceChart] Error creating entry price line:', err);
      }
    }

    if (calculatedLiquidationPrice !== null && calculatedLiquidationPrice > 0) {
      try {
        liquidationPriceLineRef.current = series.createPriceLine({
          price: calculatedLiquidationPrice,
          color: CHART_COLORS.liquidation,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `LIQ: ${formatDisplayPrice(calculatedLiquidationPrice)}`,
        });
      } catch (err) {
        console.error('[PriceChart] Error creating liquidation price line:', err);
      }
    }

    // Skip take-profit line for high leverage (stretches scale too much)
    if (takeProfitPrice !== null && takeProfitPrice > 0 && leverage < 100) {
      try {
        takeProfitPriceLineRef.current = series.createPriceLine({
          price: takeProfitPrice,
          color: CHART_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false, // Hide chart library label to reduce clutter
          title: '',
        });
      } catch (err) {
        console.error('[PriceChart] Error creating take profit price line:', err);
      }
    }

    // For high leverage, set a focused price range around entry
    if (leverage >= 100 && entryPrice !== null && entryPrice > 0) {
      try {
        // Margin = enough to show entry-to-liquidation with padding
        const margin = entryPrice / leverage * 3; // 3x the entry-to-liq distance
        chart.priceScale('right').applyOptions({
          autoScale: false,
        });
        // Use timeScale fitContent first, then manually set price range
        requestAnimationFrame(() => {
          try {
            const priceScale = chart.priceScale('right');
            priceScale.applyOptions({ autoScale: false });
            // Set visible range via series price range
            if (seriesRef.current) {
              const minPrice = entryPrice - margin;
              const maxPrice = entryPrice + margin;
              // lightweight-charts v5: use setVisibleLogicalRange equivalent for price
              // Workaround: add invisible price lines to anchor the scale
              // Anchor lines widen the auto-scale range
              seriesRef.current.createPriceLine({
                price: minPrice,
                color: 'transparent',
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: false,
                title: '',
              });
              seriesRef.current.createPriceLine({
                price: maxPrice,
                color: 'transparent',
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: false,
                title: '',
              });
              // Re-enable autoScale so it includes our anchors
              priceScale.applyOptions({ autoScale: true });
            }
          } catch (err) {
            // Fallback: just use autoScale
            chart.priceScale('right').applyOptions({ autoScale: true });
          }
        });
      } catch (err) {
        console.error('[PriceChart] Error setting high-leverage price range:', err);
      }
    }

    // Periodic sync for real-time updates
    const syncInterval = setInterval(() => {
      const candles = getChartData(assetPair, CHART_RESOLUTION);
      if (candles.length > 0 && series) {
        const validCandles = candles.filter(candle => 
          candle && 
          !isNaN(candle.close) &&
          candle.close > 0
        );
        const visibleCandles = Math.min(30, validCandles.length);
        const slicedCandles = validCandles.slice(-visibleCandles);
        const lineData = slicedCandles.map(candle => ({
          time: candle.time as UTCTimestamp,
          value: candle.close,
        }));
        if (lineData.length > 0) {
          const latestPoint = lineData[lineData.length - 1];
          try {
            series.update(latestPoint);
          } catch (err) {
            series.setData(lineData);
          }
        }
      }
    }, SYNC_INTERVAL_MS);

    // Cleanup
    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (resizeObserver) {
        resizeObserver.unobserve(container);
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      clearInterval(syncInterval);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      entryPriceLineRef.current = null;
      liquidationPriceLineRef.current = null;
      takeProfitPriceLineRef.current = null;
    };
    // Only recreate chart when assetPair changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetPair]);

  // Update line color and gradient when PnL changes
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.applyOptions({
        lineColor: chartLineColor,
        topColor: hexToRgba(chartLineColor, 0.4), // 40% opacity for more visible gradient
        bottomColor: hexToRgba(chartLineColor, 0.05), // 5% opacity at bottom for subtle fade
      });
    }
  }, [chartLineColor]);

  // Update chart height
  useEffect(() => {
    if (chartRef.current) {
      const currentHeight = chartDimensionsRef.current.height;
      const chartHeight = Math.max(height, 80);
      if (Math.abs(chartHeight - currentHeight) > 5) {
        chartRef.current.applyOptions({ height: chartHeight });
        chartDimensionsRef.current.height = chartHeight;
      }
    }
  }, [height]);

  // Load data when asset changes (separate from chart init) - optimized
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !assetPair) return;

    const candles = getChartData(assetPair, CHART_RESOLUTION);
    if (candles.length > 0) {
      const validCandles = candles.filter(candle => 
        candle && 
        !isNaN(candle.close) &&
        candle.close > 0
      );
      
      // Use fewer points for faster updates
      const visibleCandles = Math.min(30, validCandles.length);
      const slicedCandles = validCandles.slice(-visibleCandles);
      const lineData = slicedCandles.map(candle => ({
        time: candle.time as UTCTimestamp,
        value: candle.close,
      }));
      
      if (lineData.length > 0) {
        seriesRef.current.setData(lineData);
        
        // Fit content immediately (no requestAnimationFrame delay)
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }
    } else {
      // Show empty chart immediately
      seriesRef.current.setData([]);
    }
  }, [assetPair]);

  // Update price lines when entry/liquidation/takeProfit prices change
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    // Update entry price line
    if (entryPriceLineRef.current) {
      try {
        seriesRef.current.removePriceLine(entryPriceLineRef.current);
      } catch (err) {}
      entryPriceLineRef.current = null;
    }
    if (entryPrice !== null && entryPrice > 0) {
      try {
        entryPriceLineRef.current = seriesRef.current.createPriceLine({
          price: entryPrice,
          color: CHART_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `ENTRY: ${formatDisplayPrice(entryPrice)}`,
        });
      } catch (err) {
        console.error('[PriceChart] Error creating entry price line:', err);
      }
    }

    // Update liquidation price line
    if (liquidationPriceLineRef.current) {
      try {
        seriesRef.current.removePriceLine(liquidationPriceLineRef.current);
      } catch (err) {}
      liquidationPriceLineRef.current = null;
    }
    if (calculatedLiquidationPrice !== null && calculatedLiquidationPrice > 0) {
      try {
        liquidationPriceLineRef.current = seriesRef.current.createPriceLine({
          price: calculatedLiquidationPrice,
          color: CHART_COLORS.liquidation,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `LIQ: ${formatDisplayPrice(calculatedLiquidationPrice)}`,
        });
      } catch (err) {
        console.error('[PriceChart] Error creating liquidation price line:', err);
      }
    }

    // Update take profit price line
    if (takeProfitPriceLineRef.current) {
      try {
        seriesRef.current.removePriceLine(takeProfitPriceLineRef.current);
      } catch (err) {}
      takeProfitPriceLineRef.current = null;
    }
    if (takeProfitPrice !== null && takeProfitPrice > 0) {
      try {
        takeProfitPriceLineRef.current = seriesRef.current.createPriceLine({
          price: takeProfitPrice,
          color: CHART_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false, // Hide chart library label to reduce clutter
          title: '',
        });
      } catch (err) {
        console.error('[PriceChart] Error creating take profit price line:', err);
      }
    }

  }, [entryPrice, calculatedLiquidationPrice, takeProfitPrice]);

  // Format price for display
  const formatDisplayPrice = (price: number | null): string => {
    if (price === null || price === 0) return '';
    if (price >= 10000) return price.toFixed(2);
    if (price >= 100) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  return (
    <div 
      className="w-full relative" 
      style={{ 
        width: '100%', 
        height,
        margin: 0, 
        padding: 0,
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        background: 'transparent',
        borderRadius: 0,
        overflow: 'hidden',
      }}
      role="img"
      aria-label={`Price chart for ${assetPair || 'asset'}. Entry price: ${entryPrice?.toFixed(2) || 'not set'}. Current trend: ${pnl >= 0 ? 'up' : 'down'}.`}
    >
      {/* Chart Container - Clean, minimal */}
      <div 
        ref={containerRef}
        className="w-full"
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
