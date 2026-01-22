// Asset types
export interface Asset {
  name: string;
  color: string;
  icon: string;
  pairIndex: number;
  maxLeverage: number; // Max leverage for ZFP (PnL mode)
}

// Leverage types
export interface Leverage {
  name: string;
  value: number;
  color: string;
  weight: number; // Probability weight for weighted random selection
}

// Direction types
export interface Direction {
  name: 'LONG' | 'SHORT';
  symbol: string;
  color: string;
  isLong: boolean;
}

// Trade input for API
export interface TradeParams {
  trader: string;
  delegate: string;
  pair: string;
  pairIndex: number;
  leverage: number;
  isLong: boolean;
  collateral: number;
}

// Unsigned transaction from backend
export interface UnsignedTx {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  chainId: number;
}

// Trade response
export interface Trade {
  tradeIndex: number;
  pairIndex: number;
  pair: string;
  collateral: number;
  leverage: number;
  isLong: boolean;
  openPrice: number;
  tp: number;
  sl: number;
  openedAt: number;
}

// Closed trade (includes final PnL and close timestamp)
export interface ClosedTrade extends Trade {
  closedAt: number;
  finalPnL: number;
  finalPnLPercentage: number;
  closePrice: number;
}

// PnL data
export interface PnLData {
  trade: Trade;
  currentPrice: number;
  pnl: number;
  pnlPercentage: number;
}

// App state
export type AppStage = 'idle' | 'spinning' | 'executing' | 'pnl' | 'error';

// Selection from wheel
export interface WheelSelection {
  asset: Asset;
  leverage: Leverage;
  direction: Direction;
}

// Delegate status
export interface DelegateStatus {
  isSetup: boolean;
  delegateAddress: string | null;
  usdcApproved: boolean;
}

// Settings
export interface Settings {
  collateral: number; // $5-$1000
  audioEnabled: boolean;
  musicEnabled: boolean;
}

// Trade statistics (non-deterring)
export interface TradeStats {
  totalTrades: number; // Total trades ever opened
  activePositions: number; // Current open positions count
  // NO PnL, win-rate, streaks, best/worst trades
}

// API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BuildTxResponse {
  tx: UnsignedTx;
}

export interface TradesResponse {
  trades: Trade[];
}

export interface PnLResponse {
  positions: PnLData[];
}

export interface PriceResponse {
  pair: string;
  price: number;
  timestamp: number;
}

export interface PairsResponse {
  pairs: Array<{
    name: string;
    pairIndex: number;
  }>;
}
