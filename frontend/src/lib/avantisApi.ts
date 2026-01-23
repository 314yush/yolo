/**
 * Direct Avantis API Client
 * 
 * Bypasses our backend entirely for reading trades and PnL.
 * Uses Avantis's public API which returns positions with fees already calculated.
 */

import { ASSETS } from './constants';
import type { Trade, PnLData } from '@/types';

const AVANTIS_API_BASE = 'https://core.avantisfi.com';

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
 * Fetch user's open trades from Avantis API
 */
export async function fetchTrades(traderAddress: string): Promise<Trade[]> {
  const url = `${AVANTIS_API_BASE}/user-data?trader=${traderAddress}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Avantis API error: ${response.status}`);
  }
  
  const data: AvantisUserDataResponse = await response.json();
  
  return data.positions.map(parsePosition);
}

/**
 * Fetch user's positions with PnL from Avantis API
 * 
 * @param traderAddress - Trader's wallet address
 * @param prices - Map of pair name to current price (from Pyth)
 */
export async function fetchPnL(
  traderAddress: string,
  prices: Record<string, { price: number; timestamp: number }>
): Promise<PnLData[]> {
  const url = `${AVANTIS_API_BASE}/user-data?trader=${traderAddress}`;
  
  const response = await fetch(url);
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
