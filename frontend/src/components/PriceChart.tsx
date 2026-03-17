'use client';

import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
  AreaSeries,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineData,
  LineStyle,
  UTCTimestamp,
} from 'lightweight-charts';
import { getTickData, type Resolution } from '@/hooks/useChartDataCollector';

interface PricePoint {
  time: number;
  price: number;
}

interface PriceChartProps {
  assetPair: string | null;
  entryPrice?: number | null;
  liquidationPrice?: number | null;
  targetPrice?: number | null;
  height?: number;
  pnl?: number;
  resolution?: Resolution;
  stream?: PricePoint[];
}

const STREAM_SYNC_MS = 200; // 5x faster visual updates – feels alive
const VISIBLE_POINTS = 60; // ~1 min window – tighter = more dramatic swings
const RIGHT_OFFSET_BARS = 2; // Price at right edge – line runs left-to-right across screen
const VERTICAL_PADDING_RATIO = 0.12; // Less dead space – price fills the chart
const MIN_RANGE_RATIO = 0.001; // Tighter range when flat
const RANGE_SMOOTHING_ALPHA = 0.45; // Faster Y-axis response to moves

/** Chart Y-axis range presets:
 * - default: range follows price movement only
 * - fullReferenceLines: range always includes entry, liquidation, and target (all lines visible)
 */
const CHART_RANGE_PRESET = 'default' as 'default' | 'fullReferenceLines';

const COLORS = {
  background: '#0B0F14',
  scaleText: 'rgba(226, 232, 240, 0.7)',
  grid: 'rgba(255,255,255,0.04)',
  lineUp: '#CCFF00',   // Lime - brand
  lineDown: '#FF006E', // Hot pink - brand
  areaTopUp: 'rgba(204, 255, 0, 0.28)',
  areaBottomUp: 'rgba(204, 255, 0, 0.0)',
  areaTopDown: 'rgba(255, 0, 110, 0.28)',
  areaBottomDown: 'rgba(255, 0, 110, 0.0)',
  entry: 'rgba(204, 255, 0, 0.6)',
  liquidation: 'rgba(255, 0, 110, 0.7)',
  target: 'rgba(204, 255, 0, 0.85)',
};

function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function getPrecision(price: number): number {
  if (price >= 10000) return 2;
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  return 6;
}

function toSecondTimestamp(time: number): number {
  return time > 1e12 ? Math.floor(time / 1000) : Math.floor(time);
}

function PriceChartComponent({
  assetPair,
  entryPrice = null,
  liquidationPrice = null,
  targetPrice = null,
  height = 140,
  pnl = 0,
  stream,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);
  const liqLineRef = useRef<IPriceLine | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);
  const seriesMarkersRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const previousLineColorRef = useRef<string>(COLORS.lineUp);
  const lastLogicalRangeToRef = useRef<number | null>(null);
  const seriesBufferRef = useRef<LineData[]>([]);
  const streamCursorRef = useRef(0);
  const lastKnownPriceRef = useRef<number | null>(null);
  const lastEmittedSecondRef = useRef<number | null>(null);
  const smoothedVisibleRangeRef = useRef<{ min: number; max: number } | null>(null);

  const initialLineColor = useMemo(() => (pnl >= 0 ? COLORS.lineUp : COLORS.lineDown), [pnl]);

  useEffect(() => {
    if (!containerRef.current || !assetPair || chartRef.current) return;

    const container = containerRef.current;
    const width = Math.max(container.clientWidth || 0, 200);
    const chart = createChart(container, {
      width,
      height,
      layout: {
        // Transparent canvas avoids any embedded-library panel effect.
        background: { color: 'transparent' },
        textColor: COLORS.scaleText,
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: true, color: COLORS.grid },
      },
      leftPriceScale: {
        visible: false,
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        ticksVisible: false,
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
        autoScale: false,
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
        lockVisibleTimeRangeOnResize: true,
        rightOffset: RIGHT_OFFSET_BARS,
      },
      crosshair: {
        mode: CrosshairMode.Hidden,
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
        priceFormatter: formatPrice,
        timeFormatter: (time: UTCTimestamp) => {
          const d = new Date(time * 1000);
          return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        },
      },
    });

    const isUp = pnl >= 0;
    const series = chart.addSeries(AreaSeries, {
      lineColor: initialLineColor,
      lineWidth: 3,
      topColor: isUp ? COLORS.areaTopUp : COLORS.areaTopDown,
      bottomColor: isUp ? COLORS.areaBottomUp : COLORS.areaBottomDown,
      priceLineVisible: false,
      lastValueVisible: true,
      pointMarkersVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'price',
        precision: getPrecision(entryPrice ?? liquidationPrice ?? 100),
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    previousLineColorRef.current = initialLineColor;
    // Type assertion: lightweight-charts Time generic mismatch between series and plugin API
    seriesMarkersRef.current = createSeriesMarkers(series, []) as NonNullable<typeof seriesMarkersRef.current>;

    resizeObserverRef.current = new ResizeObserver(() => {
      const nextWidth = Math.max(container.clientWidth || 0, 200);
      chart.applyOptions({ width: nextWidth, height });
    });
    resizeObserverRef.current.observe(container);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (seriesMarkersRef.current) {
        seriesMarkersRef.current.detach();
        seriesMarkersRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      entryLineRef.current = null;
      liqLineRef.current = null;
      targetLineRef.current = null;
      lastLogicalRangeToRef.current = null;
      seriesBufferRef.current = [];
      streamCursorRef.current = 0;
      lastKnownPriceRef.current = null;
      lastEmittedSecondRef.current = null;
      smoothedVisibleRangeRef.current = null;
    };
  }, [assetPair]);

  useEffect(() => {
    if (!seriesRef.current) return;

    if (entryLineRef.current) {
      try {
        seriesRef.current.removePriceLine(entryLineRef.current);
      } catch {
        // no-op
      }
      entryLineRef.current = null;
    }

    if (liqLineRef.current) {
      try {
        seriesRef.current.removePriceLine(liqLineRef.current);
      } catch {
        // no-op
      }
      liqLineRef.current = null;
    }

    if (targetLineRef.current) {
      try {
        seriesRef.current.removePriceLine(targetLineRef.current);
      } catch {
        // no-op
      }
      targetLineRef.current = null;
    }

    if (entryPrice && entryPrice > 0) {
      entryLineRef.current = seriesRef.current.createPriceLine({
        price: entryPrice,
        color: COLORS.entry,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Entry',
      });
    }

    if (liquidationPrice && liquidationPrice > 0) {
      liqLineRef.current = seriesRef.current.createPriceLine({
        price: liquidationPrice,
        color: COLORS.liquidation,
        lineWidth: 1,
        lineStyle: LineStyle.SparseDotted,
        axisLabelVisible: true,
        title: 'Liq',
      });
    }

    if (targetPrice && targetPrice > 0) {
      targetLineRef.current = seriesRef.current.createPriceLine({
        price: targetPrice,
        color: COLORS.target,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'Target',
      });
    }
  }, [entryPrice, liquidationPrice, targetPrice]);

  useEffect(() => {
    if (!assetPair || !seriesRef.current || !chartRef.current) return;

    const appendPoint = (timeSec: number, price: number) => {
      const nextPoint: LineData = { time: timeSec as UTCTimestamp, value: price };
      const buffer = seriesBufferRef.current;
      const previous = buffer[buffer.length - 1];
      if (previous && previous.time === nextPoint.time) {
        buffer[buffer.length - 1] = nextPoint;
      } else {
        buffer.push(nextPoint);
      }
      if (buffer.length > VISIBLE_POINTS * 6) {
        seriesBufferRef.current = buffer.slice(-VISIBLE_POINTS * 4);
      }
    };

    const emitFlatThrough = (targetSecond: number) => {
      if (lastKnownPriceRef.current === null || lastEmittedSecondRef.current === null) return;
      for (let sec = lastEmittedSecondRef.current + 1; sec <= targetSecond; sec += 1) {
        appendPoint(sec, lastKnownPriceRef.current);
        lastEmittedSecondRef.current = sec;
      }
    };

    const seedFromChartCollector = () => {
      const ticks = getTickData(assetPair, VISIBLE_POINTS * 2);
      const points = ticks
        .map(tick => ({ time: toSecondTimestamp(tick.time), price: tick.price }))
        .filter(point => point.price > 0 && Number.isFinite(point.price))
        .sort((a, b) => a.time - b.time);

      if (points.length === 0) return;

      // Seed history once, then keep movement alive with 1s cadence.
      if (seriesBufferRef.current.length === 0) {
        seriesBufferRef.current = points.slice(-VISIBLE_POINTS).map(point => ({
          time: point.time as UTCTimestamp,
          value: point.price,
        }));
      }

      const latest = points[points.length - 1];
      if (lastEmittedSecondRef.current === null || latest.time > lastEmittedSecondRef.current) {
        emitFlatThrough(latest.time - 1);
        appendPoint(latest.time, latest.price);
        lastKnownPriceRef.current = latest.price;
        lastEmittedSecondRef.current = latest.time;
      } else if (latest.price !== lastKnownPriceRef.current) {
        // Price changed but time already emitted (emitFlatThrough ran ahead).
        // Update the current-second point and lastKnownPrice so future
        // flat-fills use the fresh value instead of the stale one.
        lastKnownPriceRef.current = latest.price;
        appendPoint(lastEmittedSecondRef.current, latest.price);
      }
    };

    const applyLineColor = (lastValue: number) => {
      const hasExplicitPnl = Number.isFinite(pnl);
      const derivedPnl = entryPrice ? lastValue - entryPrice : 0;
      const isPositive = hasExplicitPnl ? pnl >= 0 : derivedPnl >= 0;
      const nextColor = isPositive ? COLORS.lineUp : COLORS.lineDown;

      if (previousLineColorRef.current === nextColor || !seriesRef.current) return;
      seriesRef.current.applyOptions({
        lineColor: nextColor,
        topColor: isPositive ? COLORS.areaTopUp : COLORS.areaTopDown,
        bottomColor: isPositive ? COLORS.areaBottomUp : COLORS.areaBottomDown,
      });
      previousLineColorRef.current = nextColor;
    };

    const sync = () => {
      if (!seriesRef.current || !chartRef.current) return;

      if (stream && stream.length > 0) {
        if (stream.length < streamCursorRef.current) {
          streamCursorRef.current = 0;
        }
        const nextTicks = stream.slice(streamCursorRef.current);
        for (const tick of nextTicks) {
          const timeSec = toSecondTimestamp(tick.time);
          if (!Number.isFinite(timeSec) || !Number.isFinite(tick.price) || tick.price <= 0) continue;

          if (lastEmittedSecondRef.current !== null && timeSec > lastEmittedSecondRef.current + 1) {
            emitFlatThrough(timeSec - 1);
          }

          appendPoint(timeSec, tick.price);
          lastKnownPriceRef.current = tick.price;
          lastEmittedSecondRef.current = timeSec;
        }
        streamCursorRef.current = stream.length;
      } else {
        seedFromChartCollector();
      }

      const nowSec = Math.floor(Date.now() / 1000);
      emitFlatThrough(nowSec);

      const visibleData = seriesBufferRef.current.slice(-VISIBLE_POINTS);
      if (visibleData.length === 0) return;

      seriesRef.current.setData(visibleData);

      const values = visibleData.map(point => point.value);
      const refPrices =
        CHART_RANGE_PRESET === 'fullReferenceLines'
          ? [entryPrice, liquidationPrice, targetPrice].filter(
              (p): p is number => typeof p === 'number' && p > 0
            )
          : [];
      const allValues = [...values, ...refPrices];
      const rawMin = Math.min(...allValues);
      const rawMax = Math.max(...allValues);
      const latestValue = values[values.length - 1];
      const baseRange = Math.max(rawMax - rawMin, Math.abs(latestValue) * MIN_RANGE_RATIO);
      const paddedMin = rawMin - baseRange * VERTICAL_PADDING_RATIO;
      const paddedMax = rawMax + baseRange * VERTICAL_PADDING_RATIO;

      const previousRange = smoothedVisibleRangeRef.current;
      const smoothedMin = previousRange
        ? previousRange.min + (paddedMin - previousRange.min) * RANGE_SMOOTHING_ALPHA
        : paddedMin;
      const smoothedMax = previousRange
        ? previousRange.max + (paddedMax - previousRange.max) * RANGE_SMOOTHING_ALPHA
        : paddedMax;

      chartRef.current.priceScale('right').setVisibleRange({
        from: smoothedMin,
        to: smoothedMax,
      });
      smoothedVisibleRangeRef.current = { min: smoothedMin, max: smoothedMax };

      const latestPoint = visibleData[visibleData.length - 1];
      applyLineColor(latestPoint.value);

      const markerColor = previousLineColorRef.current;
      seriesMarkersRef.current?.setMarkers([
        {
          time: latestPoint.time,
          position: 'atPriceMiddle' as const,
          price: latestPoint.value,
          shape: 'circle' as const,
          color: markerColor,
        },
      ]);

      const logicalTo = visibleData.length;
      if (lastLogicalRangeToRef.current !== logicalTo) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, logicalTo - VISIBLE_POINTS),
          to: logicalTo + RIGHT_OFFSET_BARS,
        });
        lastLogicalRangeToRef.current = logicalTo;
      }
    };

    sync();
    const intervalId = window.setInterval(sync, STREAM_SYNC_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [assetPair, stream, pnl, entryPrice, liquidationPrice, targetPrice]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({ height });
  }, [height]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, background: 'transparent' }}
      role="img"
      aria-label={`Price chart for ${assetPair || 'asset'} with entry and liquidation levels.`}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export const PriceChart = memo(PriceChartComponent);
export default PriceChart;
