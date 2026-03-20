/**
 * Export ShareCard to PNG and share utilities.
 * Uses canvas-based renderer for reliable capture (background + overlay).
 */

import type { ClosedTrade } from '@/types';
import { renderShareCardToBlob } from '@/lib/shareCardCanvas';

const SHARE_TEXT = 'Check out my YOLO trade!';
const SHARE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '')) || 'tradeyolo.fun';

/** Copy share card image to clipboard. Works on desktop; may fail on some mobile browsers. */
export async function copyShareCardToClipboard(trade: ClosedTrade): Promise<void> {
  const blob = await renderShareCardToBlob(trade);
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard not supported');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Download share card as PNG file. */
export async function downloadShareCard(trade: ClosedTrade): Promise<void> {
  const blob = await renderShareCardToBlob(trade);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yolo-trade-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open Twitter/X intent with pre-filled text. User can paste image from clipboard. */
export function openShareOnX(): void {
  const text = `${SHARE_TEXT} https://${SHARE_URL}`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420');
}

/** Use native Web Share API when available (mobile share sheet). Falls back to download on desktop. */
export async function shareViaNativeSheet(trade: ClosedTrade): Promise<void> {
  const blob = await renderShareCardToBlob(trade);
  const file = new File([blob], 'yolo-trade.png', { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
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
