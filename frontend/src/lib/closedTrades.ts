import type { ClosedTrade, Trade, PnLData } from '@/types';

const STORAGE_KEY_PREFIX = 'yolo_closed_trades_';

function getStorageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

/**
 * Load closed trades from localStorage for a given address
 */
export function loadClosedTrades(address: string): ClosedTrade[] {
  if (typeof window === 'undefined' || !address) {
    return [];
  }

  try {
    const key = getStorageKey(address);
    const stored = localStorage.getItem(key);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error('[loadClosedTrades] Failed to load closed trades:', error);
    return [];
  }
}

/**
 * Save a closed trade to localStorage
 */
export function saveClosedTrade(
  address: string,
  trade: Trade,
  pnlData: PnLData | null
): void {
  if (typeof window === 'undefined' || !address) {
    return;
  }

  try {
    const closedTrade: ClosedTrade = {
      ...trade,
      closedAt: Date.now(),
      finalPnL: pnlData?.pnl ?? 0,
      finalPnLPercentage: pnlData?.pnlPercentage ?? 0,
      closePrice: pnlData?.currentPrice ?? trade.openPrice,
    };

    const existing = loadClosedTrades(address);
    
    // Check if this trade is already saved (by pairIndex + tradeIndex)
    const existingIndex = existing.findIndex(
      (t) => t.pairIndex === trade.pairIndex && t.tradeIndex === trade.tradeIndex
    );

    if (existingIndex >= 0) {
      // Update existing closed trade
      existing[existingIndex] = closedTrade;
    } else {
      // Add new closed trade at the beginning (most recent first)
      existing.unshift(closedTrade);
    }

    // Limit to last 100 closed trades to prevent localStorage bloat
    const limited = existing.slice(0, 100);

    const key = getStorageKey(address);
    localStorage.setItem(key, JSON.stringify(limited));
  } catch (error) {
    console.error('[saveClosedTrade] Failed to save closed trade:', error);
  }
}

/**
 * Clear all closed trades for an address
 */
export function clearClosedTrades(address: string): void {
  if (typeof window === 'undefined' || !address) {
    return;
  }

  try {
    const key = getStorageKey(address);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('[clearClosedTrades] Failed to clear closed trades:', error);
  }
}
