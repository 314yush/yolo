import type { Asset, Leverage, Direction } from '@/types';

// Assets available for zero-fee perps (PnL order type)
// Data from Avantis SDK - pairIndex and max leverage verified
// All assets support 500x leverage for maximum degen energy
export const ASSETS: Asset[] = [
  { name: 'ETH', color: '#627EEA', icon: '/logos/eth.svg', pairIndex: 0, maxLeverage: 500 },
  { name: 'BTC', color: '#FF9500', icon: '/logos/btc.svg', pairIndex: 1, maxLeverage: 500 },
  { name: 'SOL', color: '#14F195', icon: '/logos/sol.svg', pairIndex: 2, maxLeverage: 500 },
  { name: 'XRP', color: '#00AAE4', icon: '/logos/xrp.svg', pairIndex: 59, maxLeverage: 500 },
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

// Default collateral amount
// Minimum position size is $100, so with max leverage (500x), minimum collateral is $0.20
// We use $10 to provide a comfortable buffer and ensure trades succeed
export const DEFAULT_COLLATERAL = 10; // $10 USDC (ensures $5,000 position at 500x, well above $100 minimum)

// Animation timings (in ms) - Fast mode for instant trading
export const WHEEL_TIMINGS = {
  ASSET_STOP: 1000,       // 1s
  LEVERAGE_STOP: 2000,    // 2s  
  DIRECTION_STOP: 3000,   // 3s
  TOTAL_DURATION: 3500,   // 3.5s total
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
};
