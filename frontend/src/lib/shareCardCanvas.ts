/**
 * Canvas-based share card renderer.
 * Produces PNG blobs for export/sharing in both square (1:1) and portrait (4:5) formats.
 *
 * All sizing is proportional to the canvas width (matching the React preview's cqw units)
 * so the output looks identical to the preview at any resolution.
 */

import type { ClosedTrade } from '@/types';
import type { ShareCardFormat } from '@/components/ShareCard';
import { DIRECTIONS } from '@/lib/constants';
import { findAssetByPairIndex } from '@/lib/assetPair';
import {
  pickShareCardBackground,
  SHARE_CARD_NEGATIVE_BACKGROUNDS,
  SHARE_CARD_POSITIVE_BACKGROUNDS,
} from '@/lib/shareCardBackgrounds';

const LIME = '#CCFF00';
const PINK = '#FF006E';

const CANVAS_W = 1080;
const CANVAS_DIMS: Record<ShareCardFormat, { w: number; h: number }> = {
  square: { w: CANVAS_W, h: CANVAS_W },
  story: { w: CANVAS_W, h: Math.round(CANVAS_W * (5 / 4)) },
};

const SHARE_CARD_SITE_LINE =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '')) ||
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

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvasW / canvasH;
  let sw: number, sh: number, sx: number, sy: number;

  if (imgRatio > canvasRatio) {
    sh = img.naturalHeight;
    sw = sh * canvasRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
}

async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    await document.fonts.ready;
  } catch {
    /* continue with system fonts */
  }
}

export async function renderShareCardToBlob(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): Promise<Blob> {
  const asset = findAssetByPairIndex(trade.pairIndex);
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
      ? `+${trade.finalPnLPercentage.toFixed(1)}%`
      : `${trade.finalPnLPercentage.toFixed(1)}%`;

  const openedMs = normalizeToMs(trade.openedAt);
  const closedMs = trade.closedAt > 1e12 ? trade.closedAt : trade.closedAt * 1000;
  const durationStr = formatDuration(Math.max(0, closedMs - openedMs));

  const assetName = asset?.name ?? (trade.pair ?? '').replace('/USD', '');
  const directionName = direction?.name ?? (trade.isLong ? 'LONG' : 'SHORT');
  const directionColor = trade.isLong ? LIME : PINK;

  await ensureFonts();

  async function loadBackgroundWithFallback(): Promise<HTMLImageElement | null> {
    const fallbacks = isProfit
      ? [...SHARE_CARD_POSITIVE_BACKGROUNDS]
      : [...SHARE_CARD_NEGATIVE_BACKGROUNDS];
    const tryOrder = [bgUrl, ...fallbacks.filter((u) => u !== bgUrl)];
    for (const src of tryOrder) {
      if (!src) continue;
      try {
        return await loadImage(src);
      } catch {
        /* try next */
      }
    }
    return null;
  }

  const [bgImg, logoImg] = await Promise.all([
    loadBackgroundWithFallback(),
    loadImage('/yolo-logo.svg').catch(() => null),
  ]);

  const { w, h } = CANVAS_DIMS[format];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context not available');

  const pw = (pct: number) => Math.round(w * pct);

  const displayFont = 'Oswald, "Helvetica Neue", Arial, sans-serif';
  const bodyFont = '"IBM Plex Sans", "Outfit", system-ui, sans-serif';

  // --- 1. Fallback gradient ---
  const fallbackGrad = ctx.createLinearGradient(0, 0, w, h);
  fallbackGrad.addColorStop(0, isProfit ? '#0d150d' : '#150d10');
  fallbackGrad.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = fallbackGrad;
  ctx.fillRect(0, 0, w, h);

  // --- 2. Background image (cover-fit) ---
  if (bgImg && bgImg.naturalWidth > 0) {
    drawImageCover(ctx, bgImg, w, h);
  }

  // --- 3. Scrim gradient ---
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(0,0,0,0.35)');
  scrim.addColorStop(0.25, 'rgba(0,0,0,0.05)');
  scrim.addColorStop(0.4, 'rgba(0,0,0,0)');
  scrim.addColorStop(0.65, 'rgba(0,0,0,0.55)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);

  // --- Layout constants ---
  const pad = pw(0.06); // 6% edge padding

  // --- 4. Logo (top-left, 18% of width) ---
  const logoW = pw(0.18);
  const logoH = Math.round(logoW * (28 / 80));
  if (logoImg && logoImg.naturalWidth > 0) {
    ctx.drawImage(logoImg, pw(0.05), pw(0.05), logoW, logoH);
  }

  // --- 5. Direction pill (top-right) ---
  const pillFontSize = pw(0.035);
  ctx.font = `bold ${pillFontSize}px ${bodyFont}`;
  const pillMetrics = ctx.measureText(directionName);
  const pillPadX = pw(0.03);
  const pillPadY = pw(0.01);
  const pillW = pillMetrics.width + pillPadX * 2;
  const pillH = pillFontSize + pillPadY * 2;
  const pillX = w - pw(0.05) - pillW;
  const pillY = pw(0.05);

  ctx.fillStyle = directionColor;
  ctx.fillRect(pillX, pillY, pillW, pillH);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `bold ${pillFontSize}px ${bodyFont}`;
  ctx.fillText(directionName, pillX + pillW / 2, pillY + pillH / 2);

  // --- 6. Bottom content zone (builds from bottom up) ---
  let curY = h - pad;

  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = pw(0.006);

  // Footer: duration · tradeyolo.fun
  const footerSize = pw(0.03);
  ctx.font = `bold ${footerSize}px ${bodyFont}`;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(durationStr, pad, curY);
  const durW = ctx.measureText(durationStr).width;

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText(' · ', pad + durW, curY);
  const dotW = ctx.measureText(' · ').width;

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(SHARE_CARD_SITE_LINE, pad + durW + dotW, curY);

  curY -= Math.round(footerSize * 1.8);

  // PnL percentage (hero) -- 18cqw
  const pnlSize = pw(0.18);
  ctx.font = `900 ${pnlSize}px ${displayFont}`;
  ctx.fillStyle = accent;
  ctx.shadowBlur = pw(0.02);
  ctx.shadowColor = `${accent}33`;
  ctx.fillText(pctStr, pad, curY);

  curY -= pnlSize + Math.round(pw(0.03));

  // Reset shadow
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = pw(0.006);

  // Asset label (no dot)
  const assetLabel = `${assetName} ${trade.leverage}x`;
  const assetFontSize = pw(0.038);
  ctx.font = `bold ${assetFontSize}px ${bodyFont}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(assetLabel, pad, curY);

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

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
