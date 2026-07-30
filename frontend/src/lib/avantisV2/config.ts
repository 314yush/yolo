/**
 * Avantis v2 network + feature-flag config.
 *
 * Enable with NEXT_PUBLIC_AVANTIS_V2=true.
 * Network: NEXT_PUBLIC_AVANTIS_NETWORK=testnet|mainnet (default testnet while v2 rolls out).
 */

export type AvantisNetwork = 'testnet' | 'mainnet';

export const AVANTIS_V2_ENABLED =
  process.env.NEXT_PUBLIC_AVANTIS_V2 === 'true';

export const AVANTIS_NETWORK: AvantisNetwork =
  process.env.NEXT_PUBLIC_AVANTIS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

const PROFILES = {
  testnet: {
    name: 'testnet' as const,
    apiBaseUrl: 'https://staging-api.avantisfi.com',
    txBuilderUrl: 'https://tx-builder-testnet.avantisfi.com',
    batchedMarketUrl: 'https://batched-market-testnet.avantisfi.com',
    relayerUrl: 'https://relayer-testnet.avantisfi.com',
    coreApiUrl: 'https://core-testnet.avantisfi.com',
    historyApiUrl: 'https://testnet-api.avantisfi.com',
    feedUrl: 'https://feed-v3.avantisfi.com',
  },
  mainnet: {
    name: 'mainnet' as const,
    apiBaseUrl: 'https://prod-api.avantisfi.com',
    txBuilderUrl: 'https://tx-builder.avantisfi.com',
    batchedMarketUrl: 'https://prod-api.avantisfi.com/batched-market',
    relayerUrl: 'https://prod-api.avantisfi.com/blitz',
    coreApiUrl: 'https://core.avantisfi.com',
    historyApiUrl: 'https://api.avantisfi.com',
    feedUrl: 'https://feed-v3.avantisfi.com',
  },
} as const;

export function getAvantisV2Config() {
  return PROFILES[AVANTIS_NETWORK];
}

/** Fallback addresses from /v2/meta (proxies unchanged across v1→v2). */
export const AVANTIS_V2_FALLBACK_ADDRESSES = {
  tradingRouter: '0x44914408af82bC9983bbb330e3578E1105e11d4e' as `0x${string}`,
  tradingStorage: '0x8a311D7048c35985aa31C131B9A13e03a5f7422d' as `0x${string}`,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  referral: '0x1A110bBA13A1f16cCa4b79758BD39290f29De82D' as `0x${string}`,
};

export const CHAIN_ID_BASE = 8453;

/** OpenOrderType for OpenTradeReq._type (from /v2/meta enums). */
export const OPEN_ORDER_TYPE = {
  MARKET: 0,
  STOP_LIMIT: 1,
  LIMIT: 2,
  MARKET_PNL: 3, // zero-fee / ZFP
} as const;

/**
 * AggregatorOrderType for POST /market/execute-batched.
 * ZFP open = MARKET_OPEN_PNL (6), ZFP close = MARKET_CLOSE_PNL (7).
 */
export const AGGREGATOR_ORDER_TYPE = {
  MARKET_OPEN: 0,
  MARKET_CLOSE: 1,
  MARKET_OPEN_PNL: 6,
  MARKET_CLOSE_PNL: 7,
} as const;

export const DEFAULT_INTENT_DEADLINE_MS = 120_000;
/** Default delegate expiry: 1 year from registration. */
export const DEFAULT_DELEGATE_TTL_SECONDS = 365 * 24 * 60 * 60;
