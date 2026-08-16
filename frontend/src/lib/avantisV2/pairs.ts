/**
 * Upside (PnL) pair catalog.
 *
 * v2 moved zero-fee perps off the standard pairs and onto dedicated `_UPSIDE`
 * markets: BTC_UPSIDE/USD trades alongside BTC/USD on the same price feed, with
 * no open/close fee and a tiered profit share on gains instead. The order type
 * is a property of the pair — the contract rejects a PnL order on a non-PnL
 * pair and vice versa — so the pair index is what decides how an order routes.
 *
 * The indices and leverage caps below are the fallback; `loadPairCatalog()`
 * refreshes them from /v2/pairs so a protocol-side change doesn't need a deploy.
 */

import { getAvantisV2Config } from './config';

/** Upside market index by base asset. */
export const UPSIDE_PAIR_INDEX = {
  ETH: 115,
  BTC: 116,
  SOL: 117,
  XRP: 118,
  HYPE: 119,
} as const;

export type UpsideAsset = keyof typeof UPSIDE_PAIR_INDEX;

/**
 * Standard pair index for each upside market, i.e. its fixed-fee twin.
 * Positions opened before the v2 cutover carry over on these indices, so the
 * UI still has to resolve them to an asset.
 */
export const BASE_PAIR_INDEX: Record<UpsideAsset, number> = {
  ETH: 0,
  BTC: 1,
  SOL: 2,
  XRP: 59,
  HYPE: 62,
};

/** Max leverage on the PnL path, per upside pair (pnlMaxLeverage in the catalog). */
export const UPSIDE_MAX_LEVERAGE: Record<number, number> = {
  [UPSIDE_PAIR_INDEX.ETH]: 200,
  [UPSIDE_PAIR_INDEX.BTC]: 250,
  [UPSIDE_PAIR_INDEX.SOL]: 150,
  [UPSIDE_PAIR_INDEX.XRP]: 75,
  [UPSIDE_PAIR_INDEX.HYPE]: 75,
};

/** Minimum leveraged notional the protocol accepts, in USDC. */
export const MIN_POSITION_USDC = 100;

const FALLBACK_PNL_PAIRS = new Set<number>(Object.values(UPSIDE_PAIR_INDEX));

export type PairInfo = {
  index: number;
  symbol: string;
  isPairListed: boolean;
  closeOnly: boolean;
  isPnlTypeAllowed: boolean;
  minLeverage: number;
  maxLeverage: number;
  pnlMinLeverage: number;
  pnlMaxLeverage: number;
  minPositionUsdc: number;
  isMarketOpen: boolean;
};

let catalog: Map<number, PairInfo> | null = null;
let inflight: Promise<Map<number, PairInfo> | null> | null = null;

type RawPair = {
  index: number;
  symbol: string;
  isPairListed?: boolean;
  closeOnly?: boolean;
  isPnlTypeAllowed?: boolean;
  pairMinLevPosUSDC?: number;
  leverages?: {
    minLeverage?: number;
    maxLeverage?: number;
    pnlMinLeverage?: number;
    pnlMaxLeverage?: number;
  };
  schedule?: { isOpen?: boolean };
};

function normalize(raw: RawPair): PairInfo {
  const lev = raw.leverages ?? {};
  return {
    index: raw.index,
    symbol: raw.symbol,
    isPairListed: raw.isPairListed !== false,
    closeOnly: Boolean(raw.closeOnly),
    isPnlTypeAllowed: Boolean(raw.isPnlTypeAllowed),
    minLeverage: Number(lev.minLeverage ?? 1),
    maxLeverage: Number(lev.maxLeverage ?? 0),
    pnlMinLeverage: Number(lev.pnlMinLeverage ?? 1),
    pnlMaxLeverage: Number(lev.pnlMaxLeverage ?? 0),
    minPositionUsdc: Number(raw.pairMinLevPosUSDC ?? MIN_POSITION_USDC),
    isMarketOpen: raw.schedule?.isOpen !== false,
  };
}

/**
 * Fetch and cache the pair catalog. Safe to call repeatedly; concurrent callers
 * share one request. Failures leave the static fallback in place.
 */
export async function loadPairCatalog(
  force = false
): Promise<Map<number, PairInfo> | null> {
  if (!force && catalog) return catalog;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    const urls = [
      '/api/avantis/v2/pairs',
      `${getAvantisV2Config().txBuilderUrl}/v2/pairs`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok || body?.ok === false) continue;
        const rows: RawPair[] = body.data ?? body;
        if (!Array.isArray(rows) || rows.length === 0) continue;
        catalog = new Map(rows.map((r) => [r.index, normalize(r)]));
        return catalog;
      } catch {
        // try next
      }
    }
    return catalog;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function getPairInfo(pairIndex: number): PairInfo | null {
  return catalog?.get(pairIndex) ?? null;
}

/**
 * Whether this pair takes PnL (Upside) order types. Synchronous so the trade
 * hot path never waits: falls back to the static set until the catalog loads.
 */
export function isPnlPair(pairIndex: number): boolean {
  const info = catalog?.get(pairIndex);
  if (info) return info.isPnlTypeAllowed;
  return FALLBACK_PNL_PAIRS.has(pairIndex);
}

/** Max leverage allowed on this pair, accounting for which path it routes down. */
export function maxLeverageFor(pairIndex: number): number {
  const info = catalog?.get(pairIndex);
  if (info) {
    return info.isPnlTypeAllowed ? info.pnlMaxLeverage : info.maxLeverage;
  }
  return UPSIDE_MAX_LEVERAGE[pairIndex] ?? 0;
}

/** Minimum leveraged notional for this pair, in USDC. */
export function minPositionUsdcFor(pairIndex: number): number {
  return catalog?.get(pairIndex)?.minPositionUsdc ?? MIN_POSITION_USDC;
}

/** True when the pair is listed and accepting new opens. */
export function isPairTradable(pairIndex: number): boolean {
  const info = catalog?.get(pairIndex);
  if (!info) return FALLBACK_PNL_PAIRS.has(pairIndex);
  return info.isPairListed && !info.closeOnly && info.isMarketOpen;
}
