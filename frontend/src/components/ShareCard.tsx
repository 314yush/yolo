'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ClosedTrade } from '@/types';
import { ASSETS, DIRECTIONS } from '@/lib/constants';
import { pickShareCardBackground } from '@/lib/shareCardBackgrounds';

const LIME = '#CCFF00';
const PINK = '#FF006E';

const SHARE_CARD_SITE_LINE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '')) ||
  'tradeyolo.fun';

interface ShareCardProps {
  trade: ClosedTrade;
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

export const ShareCard = forwardRef<ShareCardRef, ShareCardProps>(function ShareCard({ trade, className = '' }, ref) {
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

  const pctStr = trade.finalPnLPercentage >= 0
    ? `+${trade.finalPnLPercentage.toFixed(2)}%`
    : `-${Math.abs(trade.finalPnLPercentage).toFixed(2)}%`;

  const openedMs = normalizeToMs(trade.openedAt);
  const closedMs = trade.closedAt > 1e12 ? trade.closedAt : trade.closedAt * 1000;
  const durationStr = formatDuration(Math.max(0, closedMs - openedMs));

  const pairLabel = `${asset?.name ?? trade.pair.replace('/USD', '')} ${trade.leverage}x ${direction?.name ?? (trade.isLong ? 'LONG' : 'SHORT')}`;

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-[400px] aspect-square overflow-hidden ${className}`}
      style={{ fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Fallback */}
      <div
        className="absolute inset-0"
        style={{
          background: isProfit
            ? 'linear-gradient(160deg, #0d150d 0%, #0a0a0a 100%)'
            : 'linear-gradient(160deg, #150d10 0%, #0a0a0a 100%)',
        }}
        aria-hidden
      />

      {!imageError && (
        // eslint-disable-next-line @next/next/no-img-element -- html2canvas + /public assets
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageError(true)}
          decoding="async"
        />
      )}

      {/* Scrim: soft top, stronger bottom */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(0,0,0,0.4) 0%,
              transparent 30%,
              transparent 50%,
              rgba(0,0,0,0.85) 100%
            )
          `,
        }}
        aria-hidden
      />

      {/* Logo: corner, no box */}
      <div className="absolute top-4 left-4 z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/yolo-logo.svg"
          alt="YOLO"
          width={72}
          height={24}
          className="h-6 w-auto opacity-95"
          style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
        />
      </div>

      {/* Bottom: minimal stats — hierarchy: PnL #1 (largest), proximity: PnL+duration grouped */}
      <footer className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-6 pt-8">
        <div className="space-y-1">
          <p
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/75"
            style={{
              fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}
          >
            {pairLabel}
          </p>

          <p
            className="font-bold leading-none tracking-tight"
            style={{
              fontFamily: 'var(--font-display), ui-sans-serif, system-ui, sans-serif',
              fontSize: '3rem',
              color: accent,
              textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            }}
          >
            {pctStr}
          </p>

          <p
            className="text-[10px] font-medium tracking-[0.12em] text-white/55 -mt-1"
            style={{
              fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {durationStr}
          </p>

          <p
            className="pt-2 text-[9px] font-medium tracking-[0.12em] text-white/40"
            style={{
              fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {SHARE_CARD_SITE_LINE}
          </p>
        </div>
      </footer>
    </div>
  );
});
