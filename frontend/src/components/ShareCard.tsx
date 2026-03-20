'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ClosedTrade } from '@/types';
import { ASSETS, DIRECTIONS } from '@/lib/constants';
import { pickShareCardBackground } from '@/lib/shareCardBackgrounds';

const LIME = '#CCFF00';
const PINK = '#FF006E';

export type ShareCardFormat = 'square' | 'story';

const SHARE_CARD_SITE_LINE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '')) ||
  'tradeyolo.fun';

interface ShareCardProps {
  trade: ClosedTrade;
  format?: ShareCardFormat;
  className?: string;
}

export interface ShareCardRef {
  getElement: () => HTMLDivElement | null;
}

function normalizeToMs(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

export const ShareCard = forwardRef<ShareCardRef, ShareCardProps>(function ShareCard(
  { trade, format = 'square', className = '' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    getElement: () => containerRef.current,
  }));

  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex);
  const direction = DIRECTIONS.find((d) => d.isLong === trade.isLong);
  const isProfit = trade.finalPnL >= 0;
  const accent = isProfit ? LIME : PINK;

  const bgUrl = useMemo(
    () => pickShareCardBackground(isProfit, trade.pairIndex, trade.tradeIndex, trade.closedAt),
    [isProfit, trade.pairIndex, trade.tradeIndex, trade.closedAt]
  );

  const [imageError, setImageError] = useState(false);

  const pctStr =
    trade.finalPnLPercentage >= 0
      ? `+${trade.finalPnLPercentage.toFixed(1)}%`
      : `${trade.finalPnLPercentage.toFixed(1)}%`;

  const openedMs = normalizeToMs(trade.openedAt);
  const closedMs = trade.closedAt > 1e12 ? trade.closedAt : trade.closedAt * 1000;
  const durationStr = formatDuration(Math.max(0, closedMs - openedMs));

  const assetName = asset?.name ?? trade.pair.replace('/USD', '');
  const directionName = direction?.name ?? (trade.isLong ? 'LONG' : 'SHORT');
  const directionColor = trade.isLong ? LIME : PINK;

  const aspectClass = format === 'story' ? 'aspect-[4/5]' : 'aspect-square';

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${aspectClass} ${className}`}
      style={{
        fontFamily: 'var(--font-share-body), var(--font-sans), ui-sans-serif, system-ui, sans-serif',
        containerType: 'inline-size',
      }}
    >
      {/* Fallback gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: isProfit
            ? 'linear-gradient(160deg, #0d150d 0%, #0a0a0a 100%)'
            : 'linear-gradient(160deg, #150d10 0%, #0a0a0a 100%)',
        }}
        aria-hidden
      />

      {/* Background image */}
      {!imageError && (
        // eslint-disable-next-line @next/next/no-img-element -- canvas export compat + /public assets
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageError(true)}
          decoding="async"
        />
      )}

      {/* Scrim: softer top, strong bottom for text readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(0,0,0,0.35) 0%,
              rgba(0,0,0,0.05) 25%,
              transparent 40%,
              rgba(0,0,0,0.55) 65%,
              rgba(0,0,0,0.92) 100%
            )
          `,
        }}
        aria-hidden
      />

      {/* Top bar: Logo + Direction pill */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-[5%] pt-[5%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/yolo-logo.svg"
          alt="YOLO"
          width={80}
          height={28}
          className="w-[18%] h-auto opacity-95"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
        />
        <div
          className="font-bold uppercase tracking-wider"
          style={{
            fontFamily: 'var(--font-share-body), var(--font-sans), ui-sans-serif, system-ui, sans-serif',
            fontSize: 'clamp(0.5rem, 3.5cqw, 0.75rem)',
            padding: 'clamp(2px, 1cqw, 6px) clamp(6px, 3cqw, 14px)',
            color: '#000',
            backgroundColor: directionColor,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {directionName}
        </div>
      </div>

      {/* Bottom content zone */}
      <footer className="absolute bottom-0 left-0 right-0 z-10 px-[6%] pb-[6%]">
        {/* Asset + Leverage */}
        <p
          className="font-bold uppercase tracking-[0.15em] text-white/90"
          style={{
            fontFamily:
              'var(--font-share-body), var(--font-sans), ui-sans-serif, system-ui, sans-serif',
            fontSize: 'clamp(0.5rem, 3.8cqw, 0.8rem)',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          }}
        >
          {assetName} {trade.leverage}x
        </p>

        {/* PnL Percentage -- hero element */}
        <p
          className="font-black leading-[0.95] tracking-tight"
          style={{
            fontFamily: 'var(--font-display), Oswald, ui-sans-serif, system-ui, sans-serif',
            fontSize: 'clamp(1.8rem, 18cqw, 4.5rem)',
            color: accent,
            textShadow: `0 2px 16px rgba(0,0,0,0.9), 0 0 40px ${accent}33`,
            marginTop: '3cqw',
          }}
        >
          {pctStr}
        </p>

        {/* Duration + URL */}
        <div
          className="flex items-center gap-[2%]"
          style={{ marginTop: 'clamp(2px, 1.5cqw, 8px)' }}
        >
          <span
            className="text-white/50 font-bold tracking-wide"
            style={{
              fontFamily:
                'var(--font-share-body), var(--font-sans), ui-sans-serif, system-ui, sans-serif',
              fontSize: 'clamp(0.4rem, 3cqw, 0.65rem)',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}
          >
            {durationStr}
          </span>
          <span className="text-white/20" style={{ fontSize: 'clamp(0.35rem, 2.5cqw, 0.55rem)' }}>·</span>
          <span
            className="text-white/40 font-bold tracking-wide"
            style={{
              fontFamily:
                'var(--font-share-body), var(--font-sans), ui-sans-serif, system-ui, sans-serif',
              fontSize: 'clamp(0.4rem, 3cqw, 0.65rem)',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}
          >
            {SHARE_CARD_SITE_LINE}
          </span>
        </div>
      </footer>
    </div>
  );
});
