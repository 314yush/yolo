import type { Asset, Leverage, Direction } from '@/types';

// Assets available for zero-fee perps (PnL order type)
// Pair indices verified via Avantis pairs_cache on Base; leverage capped per asset (protocol limits).
export const ASSETS: Asset[] = [
  { name: 'ETH', color: '#627EEA', icon: '/logos/eth.svg', pairIndex: 0, maxLeverage: 500 },
  { name: 'BTC', color: '#FF9500', icon: '/logos/btc.svg', pairIndex: 1, maxLeverage: 500 },
  { name: 'SOL', color: '#14F195', icon: '/logos/sol.svg', pairIndex: 2, maxLeverage: 500 },
  // Forex — closed Fri 17:00 ET – Sun 17:00 ET; protocol caps ZFP leverage (~50x on socket)
  {
    name: 'USDJPY',
    pairKey: 'USD/JPY',
    color: '#2DD4BF',
    icon: '/logos/usdjpy.svg',
    pairIndex: 12,
    maxLeverage: 50,
    fixedLeverage: 50,
    hasMarketHours: true,
    marketHoursKind: 'fx_weekends',
  },
  // Commodities - fixed 250x leverage, market hours restricted (closed on weekends)
  { name: 'XAU', color: '#FFD700', icon: '/logos/xau.svg', pairIndex: 21, maxLeverage: 250, fixedLeverage: 250, hasMarketHours: true },
  { name: 'XAG', color: '#C0C0C0', icon: '/logos/xag.svg', pairIndex: 20, maxLeverage: 250, fixedLeverage: 250, hasMarketHours: true },
];

// Leverage options (color-coded by risk level)
// High leverage only - minimum 250x for maximum excitement
// Weights determine probability: higher leverage = more likely to be selected
export const LEVERAGES: Leverage[] = [
  { name: '250x', value: 250, color: '#FFD60A', weight: 20 },  // 20% chance
  { name: '300x', value: 300, color: '#FF9500', weight: 20 },  // 20% chance
  { name: '400x', value: 400, color: '#FF006E', weight: 25 },  // 25% chance
  { name: '500x', value: 500, color: '#FF006E', weight: 35 },  // 35% chance - MAX DEGEN
];

// Direction options
export const DIRECTIONS: Direction[] = [
  { name: 'LONG', symbol: 'LONG', color: '#CCFF00', isLong: true },
  { name: 'SHORT', symbol: 'SHORT', color: '#FF006E', isLong: false },
];

// Minimum deposit to pass the deposit gate (first-time users)
export const MIN_DEPOSIT = 5;

// Default collateral amount when spinning
export const DEFAULT_COLLATERAL = 10; // $10 USDC

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
// Set NEXT_PUBLIC_BASE_RPC_URL environment variable in your .env.local file
const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
if (!baseRpcUrl) {
  throw new Error(
    'NEXT_PUBLIC_BASE_RPC_URL environment variable is required. ' +
    'Please create a .env.local file in the frontend directory and add: ' +
    'NEXT_PUBLIC_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY'
  );
}

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

// Local storage keys
export const STORAGE_KEYS = {
  DELEGATE_KEY: 'yolo_delegate_key',
  DELEGATE_ADDRESS: 'yolo_delegate_address',
  DELEGATE_7702_DELEGATED: 'yolo_delegate_7702_delegated', // EIP-7702 delegation status
};

// ============================================================
// TACHYON CONFIGURATION (Gas Sponsorship)
// ============================================================

// Tachyon API key - get from https://rath.fi
export const TACHYON_API_KEY = process.env.NEXT_PUBLIC_TACHYON_API_KEY || '';

// ERC-4337 Account implementation to delegate to (Base mainnet)
// From official Rath Finance example: https://github.com/RathFinance/tachyon-examples
export const ERC4337_DELEGATION_CONTRACT = '0xd6CEDDe84be40893d153Be9d467CD6aD37875b28' as `0x${string}`;

// EntryPoint v0.7 address on Base (same across all EVM chains)
export const ENTRY_POINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as `0x${string}`;

// Beneficiary for handleOps (receives leftover gas) - set to your own address
export const TACHYON_BENEFICIARY = '0x4C16955d8A0DcB2e7826d50f4114990c787b21E7' as `0x${string}`;

// Toggle Privy embedded-wallet execution path for trade relay.
// Keep off by default so existing delegate flow remains unchanged unless explicitly enabled.
export const USE_PRIVY_EXECUTION_WALLET = process.env.NEXT_PUBLIC_USE_PRIVY_EXECUTION_WALLET === 'true';

/** Delay after close toast/sound before opening the share card. */
export const POST_CLOSE_SHARE_DELAY_MS = 1200;
