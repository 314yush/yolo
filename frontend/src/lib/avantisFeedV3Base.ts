/**
 * Browser-facing Avantis feed-v3 base URL (stream + TradingView shim).
 * Override with NEXT_PUBLIC_AVANTIS_FEED_V3_URL if needed.
 */
export function getAvantisFeedV3Base(): string {
  const raw = (process.env.NEXT_PUBLIC_AVANTIS_FEED_V3_URL ?? 'https://feed-v3.avantisfi.com').trim();
  const noSlash = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(noSlash)) {
    return `https://${noSlash}`;
  }
  return noSlash;
}
