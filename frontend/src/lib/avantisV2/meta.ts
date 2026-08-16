import {
  AVANTIS_V2_FALLBACK_ADDRESSES,
  CHAIN_ID_BASE,
  DEFAULT_INTENT_DEADLINE_MS,
  getAvantisV2Config,
} from './config';

export type AvantisMeta = {
  chainId: number;
  addresses: {
    tradingRouter: `0x${string}`;
    tradingStorage: `0x${string}`;
    usdc: `0x${string}`;
    referral: `0x${string}`;
  };
  defaults: {
    intentDeadlineMs: number;
    slippagePercent: string;
  };
};

let cachedMeta: AvantisMeta | null = null;
let inflight: Promise<AvantisMeta> | null = null;

function normalizeMeta(raw: Record<string, unknown>): AvantisMeta {
  const addresses = (raw.addresses ?? {}) as Record<string, string>;
  const defaults = (raw.defaults ?? {}) as Record<string, unknown>;
  return {
    chainId: Number(raw.chainId ?? CHAIN_ID_BASE),
    addresses: {
      tradingRouter: (addresses.tradingRouter ??
        AVANTIS_V2_FALLBACK_ADDRESSES.tradingRouter) as `0x${string}`,
      tradingStorage: (addresses.tradingStorage ??
        AVANTIS_V2_FALLBACK_ADDRESSES.tradingStorage) as `0x${string}`,
      usdc: (addresses.usdc ?? AVANTIS_V2_FALLBACK_ADDRESSES.usdc) as `0x${string}`,
      referral: (addresses.referral ??
        AVANTIS_V2_FALLBACK_ADDRESSES.referral) as `0x${string}`,
    },
    defaults: {
      intentDeadlineMs: Number(
        defaults.intentDeadlineMs ?? DEFAULT_INTENT_DEADLINE_MS
      ),
      slippagePercent: String(defaults.slippagePercent ?? '1'),
    },
  };
}

export async function fetchAvantisMeta(force = false): Promise<AvantisMeta> {
  if (!force && cachedMeta) return cachedMeta;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      // Prefer same-origin proxy (avoids CORS surprises); fall back to direct.
      const urls = [
        '/api/avantis/v2/meta',
        `${getAvantisV2Config().txBuilderUrl}/v2/meta`,
      ];
      let lastErr: unknown;
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          const body = await res.json();
          if (!res.ok || body?.ok === false) {
            throw new Error(body?.error?.message || `meta failed (${res.status})`);
          }
          cachedMeta = normalizeMeta(body.data ?? body);
          return cachedMeta;
        } catch (err) {
          lastErr = err;
        }
      }
      console.warn('[avantisV2] meta fetch failed, using fallback addresses', lastErr);
      cachedMeta = {
        chainId: CHAIN_ID_BASE,
        addresses: { ...AVANTIS_V2_FALLBACK_ADDRESSES },
        defaults: {
          intentDeadlineMs: DEFAULT_INTENT_DEADLINE_MS,
          slippagePercent: '1',
        },
      };
      return cachedMeta;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
