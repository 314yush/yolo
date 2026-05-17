import { getAvantisFeedV3Base } from '@/lib/avantisFeedV3Base';

/** Avantis v3 price stream (SSE). Events: `price_update` with JSON body { timestampUs, priceFeeds: [...] }. */

/**
 * Full subscription list (same set as Avantis curl example).
 */
export const AVANTIS_V3_PRICE_FEED_IDS: readonly number[] = [
  2, 1, 6, 15, 37, 13, 18, 41, 32, 48, 51, 327, 340, 333, 338, 339, 1517, 315, 337, 342, 345, 346, 20, 4, 9, 10, 34, 104, 79, 64, 201, 83, 95, 45, 85, 179, 87, 92, 539, 19, 50, 27, 46, 159, 105, 29, 11, 36, 84, 1518, 108, 130, 437, 71, 28, 402, 203, 182, 110, 308, 306, 657, 1508, 1512, 341, 343, 97, 107, 1506, 1511, 1578, 646, 1519, 1398, 1363, 1042, 1314, 922, 954, 1292, 1272, 1435, 1162, 2319, 2310, 2312, 1182, 66, 200, 2396, 2921,
] as const;

/** Numeric feed id → pair keys used in the app (slash form). */
export const AVANTIS_V3_PAIR_BY_FEED_ID: Readonly<Record<number, string>> = {
  1: 'BTC/USD',
  2: 'ETH/USD',
  6: 'SOL/USD',
  340: 'USD/JPY',
  345: 'XAG/USD',
  346: 'XAU/USD',
};

export type AvantisV3PriceFeedRow = {
  priceFeedId: number;
  price: string;
  exponent: number;
  confidence: number;
  feedUpdateTimestamp: number;
};

export type AvantisV3PriceUpdatePayload = {
  timestampUs?: string;
  priceFeeds?: AvantisV3PriceFeedRow[];
};

export function getAvantisV3StreamUrl(): string {
  const q = AVANTIS_V3_PRICE_FEED_IDS.map((id) => `price_feed_ids=${id}`).join('&');
  return `${getAvantisFeedV3Base()}/v1/stream?${q}`;
}

export const AVANTIS_V3_SSE_EVENT = 'price_update';
