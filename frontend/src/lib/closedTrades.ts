import type { ClosedTrade, Trade, PnLData } from '@/types';

const STORAGE_KEY_PREFIX = 'yolo_closed_trades_';

/** Minimal PnL snapshot when the indexer no longer returns the position (race after close). */
function syntheticPnLForClose(trade: Trade): PnLData {
  return {
    trade,
    currentPrice: trade.openPrice,
    pnl: 0,
    pnlPercentage: 0,
    grossPnl: 0,
    grossPnlPercentage: 0,
  };
}

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
  pnlData: PnLData | null,
  options?: {
    txHash?: `0x${string}`;
    closeTxHash?: `0x${string}`;
    isLiquidated?: boolean;
    isTakeProfitHit?: boolean;
  }
): void {
  if (typeof window === 'undefined' || !address) {
    return;
  }

  // Ignore optimistic placeholder trades; these are not canonical on-chain positions.
  if (trade.tradeIndex === 0) {
    return;
  }

  // After a successful close tx we always persist: API often drops the position immediately, so pnlData can be missing.
  const effectivePnL =
    pnlData ?? (options?.closeTxHash ? syntheticPnLForClose(trade) : null);
  if (!effectivePnL) {
    return;
  }

  try {
    const isLiquidated = options?.isLiquidated ?? false;
    const grossPnl = isLiquidated ? -trade.collateral : (Number.isFinite(Number(effectivePnL.grossPnl)) ? Number(effectivePnL.grossPnl) : 0);
    const grossPnlPct = isLiquidated ? -100 : (Number.isFinite(Number(effectivePnL.grossPnlPercentage)) ? Number(effectivePnL.grossPnlPercentage) : 0);
    const closedTrade: ClosedTrade = {
      ...trade,
      closedAt: Date.now(),
      finalPnL: grossPnl,
      finalPnLPercentage: grossPnlPct,
      closePrice: Number.isFinite(Number(effectivePnL.currentPrice)) ? Number(effectivePnL.currentPrice) : trade.openPrice,
      txHash: options?.txHash,
      closeTxHash: options?.closeTxHash,
      isLiquidated,
      isTakeProfitHit: options?.isTakeProfitHit ?? false,
    };

    const existing = loadClosedTrades(address);
    const closeTxHash = options?.closeTxHash;

    const existingIndex = existing.findIndex((t) => {
      if (closeTxHash && t.closeTxHash) {
        return t.closeTxHash.toLowerCase() === closeTxHash.toLowerCase();
      }
      // Match by pairIndex + tradeIndex + openedAt to avoid clobbering
      // when Avantis reuses the same trade slot (e.g. after a flip).
      if (trade.openedAt && trade.openedAt > 0 && t.openedAt && t.openedAt > 0) {
        return (
          t.pairIndex === trade.pairIndex &&
          t.tradeIndex === trade.tradeIndex &&
          t.openedAt === trade.openedAt
        );
      }
      return (
        t.pairIndex === trade.pairIndex &&
        t.tradeIndex === trade.tradeIndex
      );
    });

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
/** Merge two records for the same position (Activity API vs localStorage). Prefer non-zero PnL when one side is a stale $0 row. */
export function mergeClosedTradesDuplicate(a: ClosedTrade, b: ClosedTrade): ClosedTrade {
  if (a.isLiquidated || b.isLiquidated) {
    const liq = a.isLiquidated ? a : b;
    const other = liq === a ? b : a;
    return {
      ...liq,
      closedAt: Math.max(a.closedAt ?? 0, b.closedAt ?? 0),
      closeTxHash: liq.closeTxHash ?? other.closeTxHash,
      txHash: liq.txHash ?? other.txHash,
    };
  }
  const newer = (a.closedAt ?? 0) >= (b.closedAt ?? 0) ? a : b;
  const older = newer === a ? b : a;
  const finalPnL =
    newer.finalPnL !== 0 ? newer.finalPnL : older.finalPnL !== 0 ? older.finalPnL : 0;
  const finalPnLPercentage =
    newer.finalPnLPercentage !== 0
      ? newer.finalPnLPercentage
      : older.finalPnLPercentage !== 0
        ? older.finalPnLPercentage
        : 0;
  return {
    ...newer,
    closedAt: Math.max(a.closedAt ?? 0, b.closedAt ?? 0),
    closeTxHash: newer.closeTxHash ?? older.closeTxHash,
    txHash: newer.txHash ?? older.txHash,
    closePrice:
      newer.closePrice !== newer.openPrice
        ? newer.closePrice
        : older.closePrice !== older.openPrice
          ? older.closePrice
          : newer.closePrice,
    finalPnL,
    finalPnLPercentage,
    isTakeProfitHit: newer.isTakeProfitHit || older.isTakeProfitHit,
  };
}

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
