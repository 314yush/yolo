/**
 * Anime / cartoon share card backgrounds.
 * Drop PNG/WebP files into public/share-cards/ — see README there.
 */

export const SHARE_CARD_POSITIVE_BACKGROUNDS = [
  '/share-cards/positive-1.png',
  '/share-cards/positive-2.png',
  '/share-cards/positive-3.png',
] as const;

export const SHARE_CARD_NEGATIVE_BACKGROUNDS = [
  '/share-cards/negative-1.png',
  '/share-cards/negative-2.png',
  '/share-cards/negative-3.png',
] as const;

function safeInt(n: unknown, fallback = 0): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.trunc(x);
}

/** Stable variant per trade (same card every time for the same close). */
export function pickShareCardBackground(
  isProfit: boolean,
  pairIndex: number,
  tradeIndex: number,
  closedAt: number
): string {
  const list = isProfit ? SHARE_CARD_POSITIVE_BACKGROUNDS : SHARE_CARD_NEGATIVE_BACKGROUNDS;
  const n = list.length;
  const pi = safeInt(pairIndex, 0);
  const ti = safeInt(tradeIndex, 0);
  const ca = Math.abs(safeInt(closedAt, 0));
  const seed = pi * 7919 + ti * 31 + (ca % 997);
  const idx = Math.abs(seed) % n;
  return list[idx] ?? list[0];
}
