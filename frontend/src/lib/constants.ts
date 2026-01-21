import type { Asset, Leverage, Direction } from '@/types';

// Assets available for zero-fee perps (PnL order type)
// Data from Avantis SDK - pairIndex and max leverage verified
// PnL mode requires minimum 75x leverage
export const ASSETS: Asset[] = [
  { name: 'ETH', color: '#627EEA', icon: 'Ξ', pairIndex: 0, maxLeverage: 500 },   // pnl_max: 500x
  { name: 'BTC', color: '#FF9500', icon: '₿', pairIndex: 1, maxLeverage: 500 },   // pnl_max: 500x
  { name: 'SOL', color: '#14F195', icon: '◎', pairIndex: 2, maxLeverage: 500 },   // pnl_max: 500x
  { name: 'DOGE', color: '#C3A634', icon: 'Ð', pairIndex: 5, maxLeverage: 100 },  // pnl_max: 100x (LOWER!)
  { name: 'XRP', color: '#00AAE4', icon: '✕', pairIndex: 59, maxLeverage: 500 },  // pnl_max: 500x
];

// Leverage options (color-coded by risk)
// Note: Must be between 75x (min for ZFP) and asset's max leverage
// DOGE only supports up to 100x, so we use 75x and 100x as safe options
export const LEVERAGES: Leverage[] = [
  { name: '75x', value: 75, color: '#CCFF00' },   // Safest - works for all assets
  { name: '100x', value: 100, color: '#CCFF00' }, // Max for DOGE
  { name: '150x', value: 150, color: '#FFD60A' }, // Works for ETH, BTC, SOL, XRP
  { name: '200x', value: 200, color: '#FFD60A' }, // Works for ETH, BTC, SOL, XRP
  { name: '250x', value: 250, color: '#FF006E' }, // Works for ETH, BTC, SOL, XRP
];

// Direction options
export const DIRECTIONS: Direction[] = [
  { name: 'LONG', symbol: '↑', color: '#CCFF00', isLong: true },
  { name: 'SHORT', symbol: '↓', color: '#FF006E', isLong: false },
];

// Default collateral amount
export const DEFAULT_COLLATERAL = 10; // $10 USDC

// Animation timings (in ms)
export const WHEEL_TIMINGS = {
  ASSET_STOP: 2500,
  LEVERAGE_STOP: 5000,
  DIRECTION_STOP: 7500,
  TOTAL_DURATION: 8000,
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

export const CHAIN_CONFIG = {
  chainId: 8453,
  name: 'Base',
  // Use Alchemy RPC to avoid rate limiting from public endpoint
  rpcUrl: baseRpcUrl,
};

// Contract addresses on Base
export const CONTRACTS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  // Avantis contracts - these will be used by the backend
};

// API URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Local storage keys
export const STORAGE_KEYS = {
  DELEGATE_KEY: 'yolo_delegate_key',
  DELEGATE_ADDRESS: 'yolo_delegate_address',
};
