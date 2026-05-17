import { getAvantisFeedV3Base } from '@/lib/avantisFeedV3Base';

/**
 * Avantis TradingView-compatible history from feed-v3.
 *
 * `resolution` is bar size in minutes (e.g. 1 = 1m, 60 = 1h).
 * Response: array of { time: ms, open, high, low, close, source }.
 */

/** App pair → TradingView symbol string (path segment before encoding). */
const TV_SYMBOL_BY_PAIR: Record<string, string> = {
  'BTC/USD': 'Crypto.BTC/USD',
  'ETH/USD': 'Crypto.ETH/USD',
  'SOL/USD': 'Crypto.SOL/USD',
  'USD/JPY': 'FX.USD/JPY',
  'XAU/USD': 'Metal.XAU/USD',
  'XAG/USD': 'Metal.XAG/USD',
};

export type AvantisTvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  source?: number;
};

export function avantisPairToTvSymbol(pair: string): string {
  return TV_SYMBOL_BY_PAIR[pair] ?? `Crypto.${pair}`;
}

export async function fetchAvantisTradingViewHistory(
  pair: string,
  options?: {
    resolutionMinutes?: number;
    lookbackSec?: number;
    signal?: AbortSignal;
  }
): Promise<AvantisTvBar[]> {
  const resolution = options?.resolutionMinutes ?? 1;
  const lookback = options?.lookbackSec ?? 5400; // 90 minutes of 1m bars
  const to = Math.floor(Date.now() / 1000);
  const from = to - lookback;
  const symbol = encodeURIComponent(avantisPairToTvSymbol(pair));
  const url = `${getAvantisFeedV3Base()}/v1/shims/tradingview/history?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`;

  try {
    const res = await fetch(url, {
      signal: options?.signal ?? AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    const out: AvantisTvBar[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const time = Number(o.time);
      const close = Number(o.close);
      if (!Number.isFinite(time) || !Number.isFinite(close)) continue;
      out.push({
        time,
        open: Number(o.open) || close,
        high: Number(o.high) || close,
        low: Number(o.low) || close,
        close,
        source: typeof o.source === 'number' ? o.source : undefined,
      });
    }
    return out.sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}
