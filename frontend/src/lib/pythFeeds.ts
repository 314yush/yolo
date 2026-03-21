/**
 * Pyth Hermes feed IDs and REST helpers (used by usePythPrices and avantisApi).
 */

const PYTH_HERMES_BASE = 'https://hermes.pyth.network';

export const PYTH_FEED_IDS: Record<string, string> = {
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'XRP/USD': '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
  'XAU/USD': '0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
  'XAG/USD': '0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
};

/**
 * Fetch latest price for a pair from Pyth REST API.
 *
 * @param pair - Pair name (e.g. 'ETH/USD')
 * @returns Price or null if fetch fails / pair not supported
 */
export type HermesParsedPriceBody = {
  parsed?: Array<{
    id: string;
    price?: { price: string; conf: string; expo: number; publish_time: number };
  }>;
};

export async function fetchPythPrice(pair: string): Promise<number | null> {
  const feedId = PYTH_FEED_IDS[pair];
  if (!feedId) return null;

  try {
    const url = `${PYTH_HERMES_BASE}/v2/updates/price/latest?ids[]=${encodeURIComponent(feedId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = (await res.json()) as HermesParsedPriceBody;

    const item = data?.parsed?.[0];
    if (!item?.price) return null;

    const price = parseFloat(item.price.price);
    const expo = item.price.expo ?? -8;
    const adjustedPrice = price * Math.pow(10, expo);
    return Number.isFinite(adjustedPrice) ? adjustedPrice : null;
  } catch {
    return null;
  }
}

/**
 * One Hermes REST round-trip for all configured feeds (mobile polling + cold fallbacks).
 */
export async function fetchPythLatestAllParsed(): Promise<HermesParsedPriceBody | null> {
  const params = new URLSearchParams();
  Object.values(PYTH_FEED_IDS).forEach((id) => params.append('ids[]', id));
  const url = `${PYTH_HERMES_BASE}/v2/updates/price/latest?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as HermesParsedPriceBody;
    return data?.parsed?.length ? data : null;
  } catch {
    return null;
  }
}
