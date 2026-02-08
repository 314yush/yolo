/**
 * Avantis API Client
 *
 * When on tradeyolo.fun (whitelisted by Avantis), calls Avantis APIs directly for lower latency.
 * On localhost or other origins, uses backend proxy to avoid CORS.
 */

import { ASSETS } from './constants';
import type { Trade, PnLData, ClosedTrade } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const AVANTIS_PROXY_BASE = `${API_BASE}/avantis`;

// Direct Avantis API URLs (used when origin is whitelisted)
const AVANTIS_CORE_BASE = 'https://core.avantisfi.com';
const AVANTIS_HISTORY_BASE = 'https://api.avantisfi.com/v2/history/portfolio/history';

/** tradeyolo.fun is whitelisted by Avantis - use direct API calls for better latency */
function useDirectAvantis(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'tradeyolo.fun' || host === 'www.tradeyolo.fun';
}

// Decimal conversions
const USDC_DECIMALS = 1e6;
const PRICE_DECIMALS = 1e10;
const LEVERAGE_DECIMALS = 1e10;

/**
 * Raw position from Avantis API
 */
interface AvantisPosition {
  trader: string;
  pairIndex: number;
  index: number;
  buy: boolean;
  collateral: string;      // 6 decimals
  leverage: string;        // 10 decimals
  openPrice: string;       // 10 decimals
  sl: string;              // 10 decimals
  tp: string;              // 10 decimals
  liquidationPrice: string; // 10 decimals
  rolloverFee: string;     // 6 decimals - accumulated margin fee
  lossProtection: string;
  openedAt: number;        // unix timestamp
  isPnl: boolean;          // true = zero-fee perp
}

interface AvantisUserDataResponse {
  positions: AvantisPosition[];
  limitOrders: unknown[];
}

/**
 * Get pair name from pairIndex
 */
function getPairName(pairIndex: number): string {
  const asset = ASSETS.find(a => a.pairIndex === pairIndex);
  return asset ? `${asset.name}/USD` : `PAIR_${pairIndex}/USD`;
}

/**
 * Parse Avantis position to our Trade format
 */
function parsePosition(pos: AvantisPosition): Trade {
  return {
    tradeIndex: pos.index,
    pairIndex: pos.pairIndex,
    pair: getPairName(pos.pairIndex),
    collateral: Number(pos.collateral) / USDC_DECIMALS,
    leverage: Number(pos.leverage) / LEVERAGE_DECIMALS,
    isLong: pos.buy,
    openPrice: Number(pos.openPrice) / PRICE_DECIMALS,
    tp: Number(pos.tp) / PRICE_DECIMALS,
    sl: Number(pos.sl) / PRICE_DECIMALS,
    liquidationPrice: Number(pos.liquidationPrice) / PRICE_DECIMALS,
    openedAt: pos.openedAt,
  };
}

/**
 * Calculate PnL for a position
 * 
 * Formula (from Avantis):
 * - For LONG: PnL = collateral * leverage * (currentPrice - openPrice) / openPrice
 * - For SHORT: PnL = collateral * leverage * (openPrice - currentPrice) / openPrice
 * - Net PnL = PnL - rolloverFee (fees already accumulated by Avantis)
 */
function calculatePnL(
  pos: AvantisPosition,
  currentPrice: number
): { pnl: number; pnlPercentage: number } {
  const collateral = Number(pos.collateral) / USDC_DECIMALS;
  const leverage = Number(pos.leverage) / LEVERAGE_DECIMALS;
  const openPrice = Number(pos.openPrice) / PRICE_DECIMALS;
  const rolloverFee = Number(pos.rolloverFee) / USDC_DECIMALS;
  
  // Position size
  const positionSize = collateral * leverage;
  
  // Gross PnL calculation
  let grossPnl: number;
  if (pos.buy) {
    // LONG: profit when price goes up
    grossPnl = positionSize * (currentPrice - openPrice) / openPrice;
  } else {
    // SHORT: profit when price goes down
    grossPnl = positionSize * (openPrice - currentPrice) / openPrice;
  }
  
  // Net PnL = Gross PnL - Rollover Fee
  const pnl = grossPnl - rolloverFee;
  
  // PnL percentage relative to collateral
  const pnlPercentage = (pnl / collateral) * 100;
  
  return { pnl, pnlPercentage };
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - please check your connection');
    }
    throw error;
  }
}

/**
 * Fetch user's open trades from Avantis API (direct when whitelisted, else via proxy)
 */
export async function fetchTrades(traderAddress: string): Promise<Trade[]> {
  const url = useDirectAvantis()
    ? `${AVANTIS_CORE_BASE}/user-data?trader=${traderAddress}`
    : `${AVANTIS_PROXY_BASE}/user-data?trader=${traderAddress}`;
  
  const response = await fetchWithTimeout(url, 15000); // 15s - direct calls can be slower on cold start
  if (!response.ok) {
    throw new Error(`Avantis API error: ${response.status}`);
  }
  
  const data: AvantisUserDataResponse = await response.json();
  
  return data.positions.map(parsePosition);
}

/**
 * Fetch user's positions with PnL from Avantis API (direct when whitelisted, else via proxy)
 * 
 * @param traderAddress - Trader's wallet address
 * @param prices - Map of pair name to current price (from Pyth)
 */
export async function fetchPnL(
  traderAddress: string,
  prices: Record<string, { price: number; timestamp: number }>
): Promise<PnLData[]> {
  const url = useDirectAvantis()
    ? `${AVANTIS_CORE_BASE}/user-data?trader=${traderAddress}`
    : `${AVANTIS_PROXY_BASE}/user-data?trader=${traderAddress}`;
  
  const response = await fetchWithTimeout(url, 15000); // 15s
  if (!response.ok) {
    throw new Error(`Avantis API error: ${response.status}`);
  }
  
  const data: AvantisUserDataResponse = await response.json();
  
  return data.positions.map(pos => {
    const trade = parsePosition(pos);
    const pairName = trade.pair;
    const currentPrice = prices[pairName]?.price || trade.openPrice;
    
    const { pnl, pnlPercentage } = calculatePnL(pos, currentPrice);
    
    return {
      trade,
      currentPrice,
      pnl,
      pnlPercentage,
    };
  });
}

/**
 * Portfolio history item from Avantis API
 */
interface AvantisPortfolioItem {
  _id: string;
  event: {
    args: {
      t: {
        index: number;
        initialPosToken: number;
        leverage: number;
        openPrice: number;
        pairIndex: number;
        positionSizeUSDC: number;
        sl: number;
        tp: number;
        trader: string;
        buy: boolean;
        timestamp: number;
      };
      price: number;
      positionSizeUSDC: number;
      usdcSentToTrader: number;
      isPnl: boolean;
      _feeInfo: {
        closingFee: number;
        liquidationFee: number;
        keeperFee: number;
        actualCloseFee: number;
      };
    };
  };
  _grossPnl: number;
  timeStamp: string; // ISO 8601 string
}

interface AvantisPortfolioResponse {
  portfolio: AvantisPortfolioItem[];
  count: number;
  pageCount: number;
  success: boolean;
}

/**
 * Fetch closed trades from Avantis portfolio history API
 * 
 * @param traderAddress - Trader's wallet address
 * @param pageNumber - Page number (1-based, default: 1)
 */
export async function fetchClosedTrades(
  traderAddress: string,
  pageNumber: number = 1
): Promise<ClosedTrade[]> {
  const url = useDirectAvantis()
    ? `${AVANTIS_HISTORY_BASE}/${traderAddress}/${pageNumber}`
    : `${AVANTIS_PROXY_BASE}/history/portfolio/history/${traderAddress}/${pageNumber}`;
  
  try {
    const response = await fetchWithTimeout(url, 15000); // 15s
    if (!response.ok) {
      // If API returns error, return empty array (user might not have history yet)
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Avantis History API error: ${response.status}`);
    }
    
    const data: AvantisPortfolioResponse = await response.json();
    
    if (!data.success || !data.portfolio) {
      return [];
    }
    
    // Convert API response to ClosedTrade format
    return data.portfolio.map((item) => {
      const t = item.event.args.t;
      const asset = ASSETS.find(a => a.pairIndex === t.pairIndex);
      const pair = asset ? asset.name + '/USD' : `PAIR_${t.pairIndex}/USD`;
      
      // Calculate final PnL percentage
      const collateral = t.initialPosToken;
      const finalPnL = item._grossPnl;
      const finalPnLPercentage = collateral > 0 ? (finalPnL / collateral) * 100 : 0;
      
      // Check if liquidated (liquidationFee > 0 indicates liquidation)
      const isLiquidated = item.event.args._feeInfo.liquidationFee > 0;
      
      return {
        tradeIndex: t.index,
        pairIndex: t.pairIndex,
        pair,
        collateral,
        leverage: t.leverage,
        isLong: t.buy,
        openPrice: t.openPrice,
        tp: t.tp,
        sl: t.sl,
        liquidationPrice: 0, // Not available in history API
        openedAt: t.timestamp,
        closedAt: new Date(item.timeStamp).getTime(),
        finalPnL,
        finalPnLPercentage,
        closePrice: item.event.args.price,
        isLiquidated,
      } as ClosedTrade;
    });
  } catch (error) {
    console.error('[fetchClosedTrades] Failed to fetch closed trades:', error);
    // Return empty array on error (don't break the app)
    return [];
  }
}

/**
 * Fetch total historic volume from Avantis (all open + closed positions).
 * Volume = sum of position sizes (collateral * leverage) across entire history.
 */
export async function fetchTotalVolume(traderAddress: string): Promise<number> {
  const url = `${AVANTIS_PROXY_BASE}/volume/${traderAddress}`;
  try {
    const response = await fetchWithTimeout(url, 15000);
    if (!response.ok) {
      return 0;
    }
    const data = await response.json();
    return typeof data.totalVolume === 'number' ? data.totalVolume : 0;
  } catch (error) {
    console.error('[fetchTotalVolume] Failed to fetch volume:', error);
    return 0;
  }
}
