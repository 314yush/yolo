/**
 * Avantis API Client
 *
 * Uses /api/avantis/* proxies to avoid CORS (browser cannot call Avantis directly from prod).
 * Prices come exclusively from Avantis v3 feed (via store) — no Hermes fallback.
 */

import { ASSETS } from './constants';
import { getPairKey } from './assetPair';
import { PNL_FEES, pnlFeeByGrossProfitP } from './pnlFees';
import { logger } from './logger';
import type { Trade, PnLData, ClosedTrade } from '@/types';

const AVANTIS_PROXY_USER_DATA = '/api/avantis/user-data';
const AVANTIS_PROXY_HISTORY = '/api/avantis/history';

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
  return asset ? getPairKey(asset) : `PAIR_${pairIndex}`;
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
    logger.warn('[calculatePnL] Invalid openPrice:', pos.openPrice, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  if (!Number.isFinite(collateral) || collateral <= 0) {
    logger.warn('[calculatePnL] Invalid collateral:', pos.collateral, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    logger.warn('[calculatePnL] Invalid currentPrice:', currentPrice, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
    return { pnl: 0, pnlPercentage: 0, grossPnl: 0, grossPnlPercentage: 0 };
  }

  if (!Number.isFinite(leverage) || leverage <= 0) {
    logger.warn('[calculatePnL] Invalid leverage:', pos.leverage, 'pairIndex:', pos.pairIndex, 'index:', pos.index);
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
      throw new Error(
        `Cannot reach API at ${url} - check your network. Original: ${(error as Error).message}`
      );
    }
    throw error;
  }
}

/**
 * Fetch user-data from Avantis via our proxy (avoids CORS in browser).
 */
async function fetchUserData(traderAddress: string): Promise<AvantisUserDataResponse> {
  const url = `${AVANTIS_PROXY_USER_DATA}?trader=${encodeURIComponent(traderAddress)}`;
  const response = await fetchWithTimeout(url, 15000, 'user-data');
  if (!response.ok) {
    throw new Error(`Avantis API error: ${response.status}`);
  }
  return await response.json();
}

/**
 * Fetch user's open trades from Avantis.
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
 *
 * @param traderAddress - Trader's wallet address
 * @param prices - Map of pair name to current price (Avantis v3 feed via store)
 */
export async function fetchPnL(
  traderAddress: string,
  prices: Record<string, { price: number; timestamp: number }>
): Promise<PnLData[]> {
  let data: AvantisUserDataResponse;
  try {
    data = await fetchUserData(traderAddress);
  } catch (e) {
    logger.error('[fetchPnL] Failed to fetch user-data:', e);
    throw e;
  }

  const positions = data?.positions;
  if (!Array.isArray(positions)) {
    logger.warn('[fetchPnL] API returned no positions array, using empty list');
    return [];
  }

  const results: PnLData[] = [];
  for (const pos of positions) {
    if (!pos || typeof pos !== 'object') {
      logger.warn('[fetchPnL] Skipping invalid position: malformed data');
      continue;
    }
    let trade: Trade;
    try {
      trade = parsePosition(pos);
    } catch (parseErr) {
      logger.error('[fetchPnL] Failed to parse position:', parseErr);
      continue;
    }
    try {
      const pairName = trade.pair;
      // Use Avantis v3 feed prices from store — no Hermes fallback
      const storePrice = prices[pairName]?.price;
      const currentPrice = storePrice != null && storePrice > 0 ? storePrice : trade.openPrice;
      
      if (storePrice == null) {
        logger.warn(`[fetchPnL] No price for ${pairName} — using open price`);
      }

      const { pnl, pnlPercentage, grossPnl, grossPnlPercentage } = calculatePnL(pos, currentPrice);

      results.push({ trade, currentPrice, pnl, pnlPercentage, grossPnl, grossPnlPercentage });
    } catch (calcErr) {
      logger.error(`[fetchPnL] Failed to compute PnL for pairIndex=${trade.pairIndex} index=${trade.tradeIndex}:`, calcErr);
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
  const url = `${AVANTIS_PROXY_HISTORY}/${traderAddress}/${pageNumber}`;
  
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
      const pair = asset ? getPairKey(asset) : `PAIR_${t.pairIndex}`;
      
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
      const finalPnLVal = isLiquidated ? -collateral : finalPnL;
      const finalPnLPct = isLiquidated ? -100 : finalPnLPercentage;
      
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
        finalPnL: finalPnLVal,
        finalPnLPercentage: finalPnLPct,
        closePrice: args.price ?? t.openPrice,
        isLiquidated,
      } as ClosedTrade;
    });
  } catch (error) {
    logger.error('[fetchClosedTrades] Failed to fetch closed trades:', error);
    // Return empty array on error (don't break the app)
    return [];
  }
}

/**
 * Poll portfolio history until a closed trade matching pair/trade index appears (indexing lag after close).
 * Optimized: 3 attempts with 400ms delay (was 5 × 700ms = 3.5s, now 3 × 400ms = 1.2s worst case).
 */
export async function fetchRecentClosedTradeMatch(
  traderAddress: string,
  pairIndex: number,
  tradeIndex: number,
  options?: { attempts?: number; delayMs?: number }
): Promise<ClosedTrade | null> {
  const attempts = options?.attempts ?? 3;
  const delayMs = options?.delayMs ?? 400;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const closed = await fetchClosedTrades(traderAddress, 1);
    const match = closed.find((c) => c.pairIndex === pairIndex && c.tradeIndex === tradeIndex);
    if (match) {
      return match;
    }
  }
  return null;
}

/**
 * Fetch total historic volume (open + closed positions) - computed client-side.
 */
export async function fetchTotalVolume(traderAddress: string): Promise<number> {
  let total = 0;
  try {
    // 1. Open positions from user-data
    const userData = await fetchUserData(traderAddress);
    for (const pos of userData?.positions ?? []) {
      const collateral = Number(pos?.collateral ?? 0) / USDC_DECIMALS;
      const leverage = Number(pos?.leverage ?? 0) / LEVERAGE_DECIMALS;
      if (Number.isFinite(collateral) && Number.isFinite(leverage) && collateral > 0 && leverage > 0) {
        total += collateral * leverage;
      }
    }

    // 2. Closed trades from portfolio history (paginate, via proxy)
    let page = 1;
    while (true) {
      const url = `${AVANTIS_PROXY_HISTORY}/${traderAddress}/${page}`;
      const response = await fetchWithTimeout(url, 15000);
      if (response.status === 404) break;
      if (!response.ok) break;
      const data: AvantisPortfolioResponse = await response.json();
      if (!data?.success || !data?.portfolio?.length) break;
      for (const item of data.portfolio) {
        const args = item?.event?.args;
        const t = args?.t;
        const collateral = Number(args?.positionSizeUSDC ?? t?.initialPosToken ?? 0) || 1e-10;
        const leverage = Number(t?.leverage ?? 0) || 1;
        if (Number.isFinite(collateral) && Number.isFinite(leverage)) {
          total += collateral * leverage;
        }
      }
      if (page >= (data.pageCount ?? 0)) break;
      page += 1;
    }
    return Math.round(total * 100) / 100;
  } catch (error) {
    logger.warn('[fetchTotalVolume] Failed to fetch volume:', error);
    return 0;
  }
}
