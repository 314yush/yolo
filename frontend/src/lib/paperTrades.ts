import type { ClosedTrade, Trade, PnLData } from '@/types';
import { computeClientPnL } from './pnlFees';

const OPEN_KEY_PREFIX = 'yolo_paper_open_';
const CLOSED_KEY_PREFIX = 'yolo_paper_closed_';

function openKey(guestId: string): string {
  return `${OPEN_KEY_PREFIX}${guestId}`;
}

function closedKey(guestId: string): string {
  return `${CLOSED_KEY_PREFIX}${guestId}`;
}

export function loadOpenPaperTrades(guestId: string): Trade[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(openKey(guestId));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOpenPaperTrades(guestId: string, trades: Trade[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(openKey(guestId), JSON.stringify(trades));
  } catch (error) {
    console.error('[paperTrades] Failed to save open trades:', error);
  }
}

export function addOpenPaperTrade(guestId: string, trade: Trade): void {
  const existing = loadOpenPaperTrades(guestId);
  saveOpenPaperTrades(guestId, [...existing, trade]);
}

export function removeOpenPaperTrade(
  guestId: string,
  pairIndex: number,
  tradeIndex: number,
  openedAt?: number
): Trade | null {
  const existing = loadOpenPaperTrades(guestId);
  const idx = existing.findIndex((t) => {
    if (openedAt && t.openedAt) {
      return t.pairIndex === pairIndex && t.tradeIndex === tradeIndex && t.openedAt === openedAt;
    }
    return t.pairIndex === pairIndex && t.tradeIndex === tradeIndex;
  });
  if (idx < 0) return null;
  const [removed] = existing.splice(idx, 1);
  saveOpenPaperTrades(guestId, existing);
  return removed;
}

export function loadClosedPaperTrades(guestId: string): ClosedTrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(closedKey(guestId));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveClosedPaperTrade(guestId: string, closedTrade: ClosedTrade): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadClosedPaperTrades(guestId);
    const key = (t: ClosedTrade) =>
      t.openedAt ? `${t.pairIndex}-${t.tradeIndex}-${t.openedAt}` : `${t.pairIndex}-${t.tradeIndex}`;
    const idx = existing.findIndex((t) => key(t) === key(closedTrade));
    if (idx >= 0) {
      existing[idx] = closedTrade;
    } else {
      existing.unshift(closedTrade);
    }
    localStorage.setItem(closedKey(guestId), JSON.stringify(existing.slice(0, 100)));
  } catch (error) {
    console.error('[paperTrades] Failed to save closed trade:', error);
  }
}

export function buildClosedTradeFromPnL(
  trade: Trade,
  pnlData: PnLData | null,
  options: {
    isLiquidated?: boolean;
    isTakeProfitHit?: boolean;
    closePrice?: number;
  } = {}
): ClosedTrade {
  const isLiquidated = options.isLiquidated ?? false;
  const netPnl = isLiquidated
    ? -trade.collateral
    : (pnlData?.pnl ?? 0);
  const netPnlPct = isLiquidated
    ? -100
    : (pnlData?.pnlPercentage ?? 0);
  const closePrice = options.closePrice ?? pnlData?.currentPrice ?? trade.openPrice;

  return {
    ...trade,
    closedAt: Date.now(),
    finalPnL: netPnl,
    finalPnLPercentage: netPnlPct,
    closePrice,
    isLiquidated,
    isTakeProfitHit: options.isTakeProfitHit ?? false,
  };
}

export function computePaperPnL(trade: Trade, currentPrice: number): PnLData {
  const { pnl, pnlPercentage } = computeClientPnL(
    trade.collateral,
    trade.leverage,
    trade.isLong,
    trade.openPrice,
    currentPrice,
    true,
    0
  );

  const positionSize = trade.collateral * trade.leverage;
  const grossPnl = trade.isLong
    ? positionSize * (currentPrice - trade.openPrice) / trade.openPrice
    : positionSize * (trade.openPrice - currentPrice) / trade.openPrice;
  const grossPnlPct = trade.collateral > 0 ? (grossPnl / trade.collateral) * 100 : 0;

  return {
    trade,
    currentPrice,
    pnl,
    pnlPercentage,
    grossPnl,
    grossPnlPercentage: grossPnlPct,
  };
}

export function computeOpenTradesTotalPnL(
  trades: Trade[],
  prices: Record<string, { price: number; timestamp: number }>
): number {
  return trades.reduce((sum, trade) => {
    const price = prices[trade.pair]?.price;
    if (!price) return sum;
    const { pnl } = computePaperPnL(trade, price);
    return sum + pnl;
  }, 0);
}
