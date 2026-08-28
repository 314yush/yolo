import type { Asset, Leverage, Direction } from '@/types';

// Assets traded on Avantis Upside markets (the v2 name for zero-fee perps).
// Upside is a property of the pair, not a flag: ETH_UPSIDE/USD (115) is a
// separate market from ETH/USD (0), sharing its price feed. `maxLeverage` is
// the pair's pnlMaxLeverage; `legacyPairIndexes` are the pre-v2 indices that
// carried-over positions still report, kept so the UI can resolve them.
// Verified against https://tx-builder.avantisfi.com/v2/pairs.
// Every wheel asset is an Upside market, so every trade is zero-fee, $100
// minimum notional, and open 24/7 — no market-hours handling needed. Each one
// is pinned to its pair's `pnlMaxLeverage`, so the leverage ring is decided by
// the asset that lands. Forex and commodities were dropped at the v2 cutover:
// they have no Upside listing, and their $300 minimum against the new caps
// needs $6–$30 of collateral against a $5 default.
export const ASSETS: Asset[] = [
  { name: 'BTC', color: '#FF9500', icon: '/logos/btc.svg', pairIndex: 116, legacyPairIndexes: [1], maxLeverage: 250, fixedLeverage: 250 },
  { name: 'ETH', color: '#627EEA', icon: '/logos/eth.svg', pairIndex: 115, legacyPairIndexes: [0], maxLeverage: 200, fixedLeverage: 200 },
  { name: 'SOL', color: '#14F195', icon: '/logos/sol.svg', pairIndex: 117, legacyPairIndexes: [2], maxLeverage: 150, fixedLeverage: 150 },
  { name: 'XRP', color: '#23292F', icon: '/logos/xrp.svg', pairIndex: 118, legacyPairIndexes: [59], maxLeverage: 75, fixedLeverage: 75 },
  { name: 'HYPE', color: '#97FCE4', icon: '/logos/hype.svg', pairIndex: 119, legacyPairIndexes: [62], maxLeverage: 75, fixedLeverage: 75 },
];

// Leverage ring: the distinct Upside caps across the assets above. Each asset
// pins its own, so this list exists to render the ring and land the spin on it.
export const LEVERAGES: Leverage[] = [
  { name: '75x', value: 75, color: '#FFD60A', weight: 0 },
  { name: '150x', value: 150, color: '#FF9500', weight: 0 },
  { name: '200x', value: 200, color: '#FF006E', weight: 0 },
  { name: '250x', value: 250, color: '#FF006E', weight: 0 }, // MAX DEGEN — BTC only
];

// Direction options
export const DIRECTIONS: Direction[] = [
  { name: 'LONG', symbol: 'LONG', color: '#CCFF00', isLong: true },
  { name: 'SHORT', symbol: 'SHORT', color: '#FF006E', isLong: false },
];

// Minimum deposit to pass the deposit gate (first-time users)
export const MIN_DEPOSIT = 5;

// Default collateral amount when spinning. Matched to MIN_DEPOSIT so a user who
// deposits the minimum can immediately trade. At the lowest wheel tier (75x)
// this is $375 notional, well clear of Avantis's $100 Upside minimum.
export const DEFAULT_COLLATERAL = MIN_DEPOSIT; // $5 USDC

// Animation timings (in ms) - Slower spin builds anticipation
export const WHEEL_TIMINGS = {
  ASSET_STOP: 2500,       // 2.5s
  LEVERAGE_STOP: 4500,    // 4.5s
  DIRECTION_STOP: 7000,   // 7s
  TOTAL_DURATION: 7500,   // 7.5s total
};

// Colors
export const COLORS = {
  PRIMARY: '#CCFF00',
  SECONDARY: '#FF006E',
  BACKGROUND: '#000000',
  SUCCESS: '#CCFF00',
  DANGER: '#FF006E',
  WARNING: '#FFD60A',
};

// Chain config
// Alchemy is preferred to avoid public-endpoint rate limits. Fall back to
// Base's public RPC so a missing env does not blank the app at import time.
const configuredBaseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
export const missingBaseRpcUrl = !configuredBaseRpcUrl;
const baseRpcUrl = configuredBaseRpcUrl || 'https://mainnet.base.org';

// Flashblock RPC for faster preconfirmations (optional)
// Base Flashblocks provide ~200ms preconfirmation vs ~2s block time
const flashblockRpcUrl = process.env.NEXT_PUBLIC_FLASHBLOCK_RPC_URL || 'https://mainnet-preconf.base.org';

export const CHAIN_CONFIG = {
  chainId: 8453,
  name: 'Base',
  // Use Alchemy RPC to avoid rate limiting from public endpoint
  rpcUrl: baseRpcUrl,
  // Flashblock RPC for faster preconfirmations (used for tx broadcast)
  flashblockRpcUrl,
  // Whether to use Flashblock RPC for broadcasting (can be toggled)
  useFlashblock: process.env.NEXT_PUBLIC_USE_FLASHBLOCK === 'true',
};

// Contract addresses on Base
export const CONTRACTS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
};

/** Delay after close toast/sound before opening the share card. */
export const POST_CLOSE_SHARE_DELAY_MS = 1200;
