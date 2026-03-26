/**
 * Flip flow temporarily excludes the *closed* position from getPnL matching so a stale
 * API row doesn't overwrite the UI with the old entry price.
 *
 * Excluding by pairIndex-tradeIndex alone is wrong: Avantis reuses the same slot after a
 * flip, so the NEW position shares indices with the OLD one. We key the exclusion by
 * openedAt when available so only the pre-flip row is filtered out.
 */

import type { Trade } from '@/types';

/** Key for the position being closed at flip start (prefer triple when openedAt is known). */
export function buildFlipExcludedPositionKey(trade: Trade): string {
  if (trade.openedAt && trade.openedAt > 0) {
    return `${trade.pairIndex}-${trade.tradeIndex}-${trade.openedAt}`;
  }
  return `${trade.pairIndex}-${trade.tradeIndex}`;
}

/** Returns true if this API row should be dropped while the exclusion is active. */
export function shouldExcludePositionForFlip(
  position: { trade: Pick<Trade, 'pairIndex' | 'tradeIndex' | 'openedAt'> },
  flipExcludedKey: string | null
): boolean {
  if (!flipExcludedKey) return false;

  const parts = flipExcludedKey.split('-');
  if (parts.length >= 3) {
    const pairIndex = Number(parts[0]);
    const tradeIndex = Number(parts[1]);
    const openedAt = Number(parts[2]);
    if (
      !Number.isFinite(pairIndex) ||
      !Number.isFinite(tradeIndex) ||
      !Number.isFinite(openedAt)
    ) {
      return false;
    }
    const t = position.trade;
    return t.pairIndex === pairIndex && t.tradeIndex === tradeIndex && t.openedAt === openedAt;
  }

  return `${position.trade.pairIndex}-${position.trade.tradeIndex}` === flipExcludedKey;
}
