import type { Asset } from '@/types';

/** Canonical pair string for prices / backend (e.g. BTC/USD, USD/JPY). */
export function getPairKey(asset: Pick<Asset, 'name' | 'pairKey'>): string {
  return asset.pairKey ?? `${asset.name}/USD`;
}
