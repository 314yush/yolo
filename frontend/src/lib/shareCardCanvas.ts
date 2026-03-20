/**
 * Canvas-based share card renderer.
 * Bypasses html2canvas to reliably capture background + overlay (PnL, text, logo).
 */

import type { ClosedTrade } from '@/types';
import { ASSETS, DIRECTIONS } from '@/lib/constants';
import { pickShareCardBackground } from '@/lib/shareCardBackgrounds';

const LIME = '#CCFF00';
const PINK = '#FF006E';
const SIZE = 400;
const SCALE = 2;

const SHARE_CARD_SITE_LINE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '')) ||
  'tradeyolo.fun';

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

function loadImage(src: string): Promise<HTMLImageElement> {
  if (!src || typeof src !== 'string') {
    return Promise.reject(new Error('Image src is required'));
  }
  const url = src.startsWith('/') ? `${window.location.origin}${src}` : src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith(window.location.origin)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = url;
  });
}

export async function renderShareCardToBlob(trade: ClosedTrade): Promise<Blob> {
  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex);
  const direction = DIRECTIONS.find((d) => d.isLong === trade.isLong);
  const isProfit = trade.finalPnL >= 0;
  const accent = isProfit ? LIME : PINK;

  const closedAt = trade.closedAt ?? Date.now();
  const bgUrl = pickShareCardBackground(
    isProfit,
    trade.pairIndex ?? 0,
    trade.tradeIndex ?? 0,
    closedAt
  );

  const pctStr =
    trade.finalPnLPercentage >= 0
      ? `+${trade.finalPnLPercentage.toFixed(2)}%`
      : `-${Math.abs(trade.finalPnLPercentage).toFixed(2)}%`;

  const openedMs = normalizeToMs(trade.openedAt);
  const closedMs = trade.closedAt > 1e12 ? trade.closedAt : trade.closedAt * 1000;
  const durationStr = formatDuration(Math.max(0, closedMs - openedMs));

  const pairLabel = `${asset?.name ?? (trade.pair ?? '').replace('/USD', '')} ${trade.leverage}x ${direction?.name ?? (trade.isLong ? 'LONG' : 'SHORT')}`;

  await document.fonts.ready;

  const [bgImg, logoImg] = await Promise.all([
    loadImage(bgUrl),
    loadImage('/yolo-logo.svg'),
  ]);

  const w = SIZE * SCALE;
  const h = SIZE * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context not available');

  const s = (n: number) => n * SCALE;

  // 1. Fallback gradient (if image fails, we still have bg)
  const fallbackGradient = ctx.createLinearGradient(0, 0, w, h);
  fallbackGradient.addColorStop(0, isProfit ? '#0d150d' : '#150d10');
  fallbackGradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = fallbackGradient;
  ctx.fillRect(0, 0, w, h);

  // 2. Background image
  ctx.drawImage(bgImg, 0, 0, w, h);

  // 3. Scrim gradient
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(0,0,0,0.4)');
  scrim.addColorStop(0.3, 'transparent');
  scrim.addColorStop(0.5, 'transparent');
  scrim.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);

  // 4. Logo (top-left)
  const logoW = s(72);
  const logoH = s(24);
  ctx.drawImage(logoImg, s(16), s(16), logoW, logoH);

  // 5. Text (bottom-left) - match ShareCard: PnL larger, tighter PnL↔duration
  const left = s(20);
  const baseY = h - s(24); // pb-6
  const pnlSize = s(48); // 3rem at scale 2 (was 36)
  const pnlToDurationGap = s(8); // reduced from ~40px

  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';

  // URL (bottom)
  ctx.font = `600 ${s(9)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(SHARE_CARD_SITE_LINE, left, baseY);

  // Duration (tighter to PnL)
  ctx.font = `600 ${s(10)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = s(2);
  const durationY = baseY - s(20);
  ctx.fillText(durationStr, left, durationY);

  // PnL % (larger, closer to duration)
  ctx.font = `bold ${pnlSize}px system-ui, sans-serif`;
  ctx.fillStyle = accent;
  ctx.shadowBlur = s(12);
  ctx.fillText(pctStr, left, durationY - s(10) - pnlToDurationGap);

  // Pair label (top of text block)
  ctx.font = `600 ${s(11)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.shadowBlur = s(3);
  ctx.fillText(pairLabel, left, durationY - s(10) - pnlToDurationGap - pnlSize - s(12));

  ctx.shadowBlur = 0;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      'image/png',
      1.0
    );
  });
}
