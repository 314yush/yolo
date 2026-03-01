'use client';

import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineData,
  LineSeries,
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
  height?: number;
  pnl?: number;
  resolution?: Resolution;
  stream?: PricePoint[];
}

const STREAM_SYNC_MS = 1000;
const VISIBLE_POINTS = 300; // 5 minutes at 1-second cadence
const RIGHT_OFFSET_BARS = 14;
const VERTICAL_PADDING_RATIO = 0.2;
const MIN_RANGE_RATIO = 0.0015;
const RANGE_SMOOTHING_ALPHA = 0.22;

const COLORS = {
  background: '#0B0F14',
  scaleText: 'rgba(226, 232, 240, 0.34)',
  grid: 'rgba(255,255,255,0.025)',
  lineUp: '#2CCB6F',
  lineDown: '#F04452',
  entry: 'rgba(148, 163, 184, 0.40)',
  liquidation: 'rgba(240, 68, 82, 0.58)',
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
  height = 140,
  pnl = 0,
  stream,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);
  const liqLineRef = useRef<IPriceLine | null>(null);
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
        fontSize: 10,
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
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: initialLineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'price',
        precision: getPrecision(entryPrice ?? liquidationPrice ?? 100),
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    previousLineColorRef.current = initialLineColor;

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
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      entryLineRef.current = null;
      liqLineRef.current = null;
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

    if (entryPrice && entryPrice > 0) {
      entryLineRef.current = seriesRef.current.createPriceLine({
        price: entryPrice,
        color: COLORS.entry,
        lineWidth: 1,
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
  }, [entryPrice, liquidationPrice]);

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
      }
    };

    const applyLineColor = (lastValue: number) => {
      const hasExplicitPnl = Number.isFinite(pnl);
      const derivedPnl = entryPrice ? lastValue - entryPrice : 0;
      const isPositive = hasExplicitPnl ? pnl >= 0 : derivedPnl >= 0;
      const nextColor = isPositive ? COLORS.lineUp : COLORS.lineDown;

      if (previousLineColorRef.current === nextColor || !seriesRef.current) return;
      seriesRef.current.applyOptions({ color: nextColor });
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
      const rawMin = Math.min(...values);
      const rawMax = Math.max(...values);
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
  }, [assetPair, stream, pnl, entryPrice]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({ height });
  }, [height]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-none"
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
