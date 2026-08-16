// Asset types
export interface Asset {
  name: string;
  color: string;
  icon: string;
  /** Pair index new trades open on — the Upside market where one exists. */
  pairIndex: number;
  /** Pre-v2 indices this asset also answers to, so carried-over positions resolve. */
  legacyPairIndexes?: number[];
  /** When set (e.g. USD/JPY), used as the canonical pair key instead of `${name}/USD`. */
  pairKey?: string;
  maxLeverage: number; // Max leverage on the pair's active path (Upside where listed)
  fixedLeverage?: number; // If set, always use this leverage (ignores wheel randomization)
  hasMarketHours?: boolean; // If true, check market open/closed status before allowing trades
  /** When hasMarketHours — commodities NY schedule vs Fri–Sun forex closure */
  marketHoursKind?: 'commodities' | 'fx_weekends';
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
  liquidationPrice: number;
  openedAt: number;
  /**
   * Opened on the Upside (PnL) path. Decides the close order type — a v1
   * position can be PnL on a pair that is no longer PnL-capable, so this comes
   * from the position itself rather than from its pair.
   */
  isPnl?: boolean;
}

// Path point for share card chart imprint
export interface PathDataPoint {
  time: number;
  price: number;
}

// Closed trade (includes final PnL and close timestamp)
export interface ClosedTrade extends Trade {
  closedAt: number;
  finalPnL: number;
  finalPnLPercentage: number;
  closePrice: number;
  txHash?: `0x${string}`; // Transaction hash for opening the trade
  closeTxHash?: `0x${string}`; // Transaction hash for closing the trade
  isLiquidated?: boolean; // Whether the trade was liquidated vs manually closed
  isTakeProfitHit?: boolean; // Whether the trade was closed by TP target (vs manual close)
  pathData?: PathDataPoint[]; // Legacy: ignored by share card (anime backgrounds)
}

// PnL data - gross PnL shown everywhere; net kept for internal use
export interface PnLData {
  trade: Trade;
  currentPrice: number;
  pnl: number;
  pnlPercentage: number;
  grossPnl: number;
  grossPnlPercentage: number;
}

// App state
export type AppStage = 'idle' | 'spinning' | 'executing' | 'pnl' | 'error';

// Selection from wheel
export interface WheelSelection {
  asset: Asset;
  leverage: Leverage;
  direction: Direction;
}

/**
 * Whether the wallet is ready to trade. On v2 that means one thing: USDC is
 * approved to TradingStorage. Intents are signed by the user's own wallet, so
 * there is no delegate registration step.
 */
export interface SetupStatus {
  isSetup: boolean;
  usdcApproved: boolean;
}

// Settings
export interface Settings {
  collateral: number; // $5-$1000
  takeProfitPercent: number; // TP % (default 200), applied to all new trades
  audioEnabled: boolean;
  musicEnabled: boolean;
}

// Trade statistics (non-deterring)
export interface TradeStats {
  totalTrades: number; // Total trades ever opened
  activePositions: number; // Current open positions count
  totalVolume: number; // Total volume traded (sum of collateral * leverage for all trades)
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
