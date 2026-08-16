import { ASSETS } from './constants';
import type { Asset } from '@/types';

/** Canonical pair string for prices / backend (e.g. BTC/USD, USD/JPY). */
export function getPairKey(asset: Pick<Asset, 'name' | 'pairKey'>): string {
  return asset.pairKey ?? `${asset.name}/USD`;
}

/**
 * Resolve a pair index to a wheel asset.
 *
 * Matches the asset's current index first, then any pre-v2 index it carries.
 * ETH now trades as ETH_UPSIDE/USD (115), but positions opened before the v2
 * cutover still report ETH/USD (0) and must render as ETH, not `PAIR_0`.
 */
export function findAssetByPairIndex(pairIndex: number): Asset | undefined {
  return (
    ASSETS.find((a) => a.pairIndex === pairIndex) ??
    ASSETS.find((a) => a.legacyPairIndexes?.includes(pairIndex))
  );
}

/** Display pair string for a pair index, falling back to `PAIR_<n>`. */
export function getPairKeyByIndex(pairIndex: number): string {
  const asset = findAssetByPairIndex(pairIndex);
  return asset ? getPairKey(asset) : `PAIR_${pairIndex}`;
}
