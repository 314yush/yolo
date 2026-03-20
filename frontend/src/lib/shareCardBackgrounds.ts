/**
 * Anime / cartoon share card backgrounds.
 * Drop PNG/WebP files into public/share-cards/ — see README there.
 */

export const SHARE_CARD_POSITIVE_BACKGROUNDS = [
  '/share-cards/positive-1.png',
  '/share-cards/positive-2.png',
] as const;

export const SHARE_CARD_NEGATIVE_BACKGROUNDS = [
  '/share-cards/negative-1.png',
  '/share-cards/negative-2.png',
] as const;

/** Stable variant per trade (same card every time for the same close). */
export function pickShareCardBackground(
  isProfit: boolean,
  pairIndex: number,
  tradeIndex: number,
  closedAt: number
): string {
  const list = isProfit ? SHARE_CARD_POSITIVE_BACKGROUNDS : SHARE_CARD_NEGATIVE_BACKGROUNDS;
  const n = list.length;
  const seed = pairIndex * 7919 + tradeIndex * 31 + (closedAt % 997);
  const idx = Math.abs(seed) % n;
  return list[idx];
}
