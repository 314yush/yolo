/**
 * Export ShareCard to PNG and share utilities.
 * Uses canvas-based renderer for reliable capture (background + overlay).
 * Caches rendered blobs to avoid redundant work across copy/download/share taps.
 */

import type { ClosedTrade } from '@/types';
import type { ShareCardFormat } from '@/components/ShareCard';
import { renderShareCardToBlob } from '@/lib/shareCardCanvas';

const SHARE_TEXT = 'Check out my YOLO trade!';
const SHARE_URL =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '')) ||
  'tradeyolo.fun';

/** LRU-ish blob cache keyed by trade identity + format. Max 6 entries. */
const blobCache = new Map<string, Blob>();
const MAX_CACHE = 6;

function cacheKey(trade: ClosedTrade, format: ShareCardFormat): string {
  return `${trade.pairIndex}-${trade.tradeIndex}-${trade.closedAt}-${format}`;
}

async function getBlob(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): Promise<Blob> {
  const key = cacheKey(trade, format);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const blob = await renderShareCardToBlob(trade, format);

  if (blobCache.size >= MAX_CACHE) {
    const oldest = blobCache.keys().next().value;
    if (oldest !== undefined) blobCache.delete(oldest);
  }
  blobCache.set(key, blob);
  return blob;
}

/** Pre-render a blob for a given trade+format (call on sheet mount). */
export function preRenderShareCard(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): void {
  getBlob(trade, format).catch(() => {
    /* silent prerender failure */
  });
}

/** Copy share card image to clipboard. */
export async function copyShareCardToClipboard(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): Promise<void> {
  const blob = await getBlob(trade, format);
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard not supported');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}

/** Download share card as PNG file. */
export async function downloadShareCard(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): Promise<void> {
  const blob = await getBlob(trade, format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yolo-trade-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Share to X/Twitter with image.
 * Uses native share API (file goes straight into X app compose on mobile).
 * Falls back to clipboard copy + intent URL on desktop, returning 'clipboard'
 * so the caller can show a hint toast.
 */
export async function shareOnX(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): Promise<'native' | 'clipboard'> {
  const blob = await getBlob(trade, format);
  const file = new File([blob], 'yolo-trade.png', { type: 'image/png' });

  // Prefer native share — opens system sheet where user can pick X app directly
  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: 'YOLO Trade',
      text: `${SHARE_TEXT} https://${SHARE_URL}`,
    });
    return 'native';
  }

  // Desktop fallback: copy image to clipboard, then open X intent
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
  }

  const text = `${SHARE_TEXT} https://${SHARE_URL}`;
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(intentUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
  return 'clipboard';
}

/** Use native Web Share API when available (mobile share sheet). Falls back to download. */
export async function shareViaNativeSheet(
  trade: ClosedTrade,
  format: ShareCardFormat = 'square'
): Promise<void> {
  const blob = await getBlob(trade, format);
  const file = new File([blob], 'yolo-trade.png', { type: 'image/png' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: 'YOLO Trade',
      text: SHARE_TEXT,
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yolo-trade-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
