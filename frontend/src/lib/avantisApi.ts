/**
 * Avantis API Client
 *
 * Routes all Avantis API calls through our backend proxy to avoid
 * the browser contacting Avantis directly (which can confuse Privy's
 * origin detection). The proxy also avoids CORS for non-whitelisted origins.
 */

import { ASSETS } from './constants';
import { fetchPythPrice } from './pythFeeds';
import { PNL_FEES, pnlFeeByGrossProfitP } from './pnlFees';
import type { Trade, PnLData, ClosedTrade } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const AVANTIS_PROXY_BASE = `${API_URL}/avantis`;

// Direct Avantis API (used as fallback when proxy unreachable - e.g. backend not running)
// Per AVANTISAPI.md: https://core.avantisfi.com/user-data
const AVANTIS_CORE_BASE = 'https://core.avantisfi.com';

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

function isFinitePositive(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Calculate PnL for a position
 *
 * Formula (from Avantis):
 * - For LONG: grossPnl = collateral * leverage * (currentPrice - openPrice) / openPrice
 * - For SHORT: grossPnl = collateral * leverage * (openPrice - currentPrice) / openPrice
 *
 * For zfp (isPnl) trades with profit: deduct tiered performance fee from gross.
 * "The More You Win, the More You Keep" - higher ROI = lower fee %.
 * Net = grossPnl * (1 - feeP/100) - rolloverFee
 *
 * For losses or non-zfp: Net = grossPnl - rolloverFee
 */
function calculatePnL(
  pos: AvantisPosition,
  currentPrice: number
): { pnl: number; pnlPercentage: number; grossPnl: number; grossPnlPercentage: number } {
  const collateral = Number(pos.collateral) / USDC_DECIMALS;
  const leverage = Number(pos.leverage) / LEVERAGE_DECIMALS;
  const openPrice = Number(pos.openPrice) / PRICE_DECIMALS;
  const rolloverFee = Number(pos.rolloverFee) / USDC_DECIMALS;

  if (!isFinitePositive(openPrice)) {
    console.warn('[calculatePnL] Invalid openPrice:', pos.openPrice, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  if (!Number.isFinite(collateral) || collateral <= 0) {
    console.warn('[calculatePnL] Invalid collateral:', pos.collateral, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    console.warn('[calculatePnL] Invalid currentPrice:', currentPrice, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  if (!Number.isFinite(leverage) || leverage <= 0) {
    console.warn('[calculatePnL] Invalid leverage:', pos.leverage, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  const positionSize = collateral * leverage;
  let grossPnl: number;
  if (pos.buy) {
    grossPnl = positionSize * (currentPrice - openPrice) / openPrice;
  } else {
    grossPnl = positionSize * (openPrice - currentPrice) / openPrice;
  }

  let pnl: number;
  if (pos.isPnl && grossPnl > 0) {
    const grossPnlP = (grossPnl / collateral) * 100;
    const feeP = pnlFeeByGrossProfitP(grossPnlP, PNL_FEES.tierP, PNL_FEES.feesP);
    pnl = grossPnl * (1 - feeP / 100) - rolloverFee;
  } else {
    pnl = grossPnl - rolloverFee;
  }

  const pnlPercentage = Number.isFinite(pnl) ? (pnl / collateral) * 100 : 0;
  const safePnl = Number.isFinite(pnl) ? pnl : 0;
  const grossPnlPercentage = Number.isFinite(grossPnl) ? (grossPnl / collateral) * 100 : 0;

  return { pnl: safePnl, pnlPercentage, grossPnl, grossPnlPercentage };
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message?.toLowerCase() ?? '';
  return (
    error.name === 'TypeError' &&
    (msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('networkerror'))
  );
}

/**
 * Fetch with timeout wrapper.
 * Throws a clear error for network/connection failures (e.g. backend not running).
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10000,
  context?: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Request timeout${context ? ` (${context})` : ''} - check your connection`
      );
    }
    if (isNetworkError(error)) {
      const hint =
        url.startsWith('http://localhost') || url.includes('localhost')
          ? ' Is the backend server running? (e.g. cd backend && uvicorn app.main:app)'
          : ' Check your network and that the API URL is correct.';
      throw new Error(
        `Cannot reach API at ${url}${hint} Original: ${(error as Error).message}`
      );
    }
    throw error;
  }
}

/**
 * Fetch user-data from Avantis. Tries backend proxy first; falls back to
 * direct Avantis API if proxy is unreachable (e.g. backend not running).
 */
async function fetchUserData(traderAddress: string): Promise<AvantisUserDataResponse> {
  const proxyUrl = `${AVANTIS_PROXY_BASE}/user-data?trader=${traderAddress}`;
  const directUrl = `${AVANTIS_CORE_BASE}/user-data?trader=${traderAddress}`;

  try {
    const response = await fetchWithTimeout(proxyUrl, 15000, 'user-data via proxy');
    if (!response.ok) {
      throw new Error(`Avantis API error: ${response.status}`);
    }
    return await response.json();
  } catch (proxyError) {
    if (isNetworkError(proxyError) || (proxyError instanceof Error && proxyError.message.includes('Cannot reach API'))) {
      console.warn('[avantisApi] Proxy unreachable, trying direct Avantis API:', (proxyError as Error).message);
      try {
        const response = await fetchWithTimeout(directUrl, 15000, 'user-data direct');
        if (!response.ok) {
          throw new Error(`Avantis API error: ${response.status}`);
        }
        return await response.json();
      } catch (directError) {
        console.error('[avantisApi] Direct Avantis API also failed:', directError);
        throw proxyError;
      }
    }
    throw proxyError;
  }
}

/**
 * Fetch user's open trades via backend proxy (or direct Avantis API fallback).
 */
export async function fetchTrades(traderAddress: string): Promise<Trade[]> {
  const data = await fetchUserData(traderAddress);
  const positions = data?.positions;
  if (!Array.isArray(positions)) {
    return [];
  }
  return positions.map(parsePosition);
}

/**
 * Fetch user's positions with PnL from Avantis API.
 * Uses backend proxy first; falls back to direct Avantis API if proxy unreachable.
 *
 * @param traderAddress - Trader's wallet address
 * @param prices - Map of pair name to current price (from Pyth)
 */
export async function fetchPnL(
  traderAddress: string,
  prices: Record<string, { price: number; timestamp: number }>
): Promise<PnLData[]> {
  let data: AvantisUserDataResponse;
  try {
    data = await fetchUserData(traderAddress);
  } catch (e) {
    console.error('[fetchPnL] Failed to fetch user-data:', e);
    throw e;
  }

  const positions = data?.positions;
  if (!Array.isArray(positions)) {
    console.warn('[fetchPnL] API returned no positions array, using empty list');
    return [];
  }

  const results: PnLData[] = [];
  for (const pos of positions) {
    if (!pos || typeof pos !== 'object') {
      console.warn('[fetchPnL] Skipping invalid position: malformed data');
      continue;
    }
    let trade: Trade;
    try {
      trade = parsePosition(pos);
    } catch (parseErr) {
      console.error('[fetchPnL] Failed to parse position:', parseErr);
      continue;
    }
    try {
      const pairName = trade.pair;
      let currentPrice: number;
      const storePrice = prices[pairName]?.price;
      if (storePrice != null) {
        currentPrice = storePrice;
      } else {
        const restPrice = await fetchPythPrice(pairName);
        if (restPrice != null) {
          currentPrice = restPrice;
        } else {
          console.warn(`[fetchPnL] No Pyth price for ${pairName} — PnL uses open price as fallback`);
          currentPrice = trade.openPrice;
        }
      }

      const { pnl, pnlPercentage, grossPnl, grossPnlPercentage } = calculatePnL(pos, currentPrice);

      results.push({ trade, currentPrice, pnl, pnlPercentage, grossPnl, grossPnlPercentage });
    } catch (calcErr) {
      console.error(`[fetchPnL] Failed to compute PnL for pairIndex=${trade.pairIndex} index=${trade.tradeIndex}:`, calcErr);
      results.push({ trade, currentPrice: trade.openPrice, pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 });
    }
  }
  return results;
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
      _feeInfo?: {
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
  const url = `${AVANTIS_PROXY_BASE}/history/portfolio/history/${traderAddress}/${pageNumber}`;
  
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
      const args = item.event.args;
      const asset = ASSETS.find(a => a.pairIndex === t.pairIndex);
      const pair = asset ? asset.name + '/USD' : `PAIR_${t.pairIndex}/USD`;
      
      // Avantis history: closed collateral is args.positionSizeUSDC (fallback to initialPosToken)
      const collateral = Math.max(args.positionSizeUSDC > 0 ? args.positionSizeUSDC : t.initialPosToken, 1e-10);
      // _grossPnl can be missing in some API responses; fallback: usdcSentToTrader - collateral
      const rawGrossPnl = (item as { _grossPnl?: number })._grossPnl;
      const finalPnL = Number.isFinite(Number(rawGrossPnl))
        ? Number(rawGrossPnl)
        : (Number.isFinite(args.usdcSentToTrader) && Number.isFinite(collateral)
          ? args.usdcSentToTrader - collateral
          : 0);
      const finalPnLPercentage = Number.isFinite(finalPnL / collateral)
        ? (finalPnL / collateral) * 100
        : 0;
      
      // _feeInfo can be absent in some records. Treat missing as not-liquidated.
      const isLiquidated = (args._feeInfo?.liquidationFee ?? 0) > 0;
      
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
        closePrice: args.price ?? t.openPrice,
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
 * Fetch total historic volume via backend proxy (all open + closed positions).
 */
export async function fetchTotalVolume(traderAddress: string): Promise<number> {
  const url = `${AVANTIS_PROXY_BASE}/volume/${traderAddress}`;
  try {
    const response = await fetchWithTimeout(url, 15000);
    if (!response.ok) {
      throw new Error(`Volume API error: ${response.status}`);
    }
    const data = await response.json();
    return Number.isFinite(data?.totalVolume) ? data.totalVolume : 0;
  } catch (error) {
    console.warn('[fetchTotalVolume] Failed to fetch volume:', error);
    return 0;
  }
}
