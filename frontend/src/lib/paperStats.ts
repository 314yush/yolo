import type { TradeStats } from '@/types';
import { loadClosedPaperTrades, loadOpenPaperTrades } from './paperTrades';

const STATS_KEY_PREFIX = 'yolo_paper_stats_';

function statsKey(guestId: string): string {
  return `${STATS_KEY_PREFIX}${guestId}`;
}

export function computePaperStats(guestId: string): TradeStats {
  const openTrades = loadOpenPaperTrades(guestId);
  const closedTrades = loadClosedPaperTrades(guestId);
  const totalVolume = closedTrades.reduce(
    (sum, t) => sum + t.collateral * t.leverage,
    0
  ) + openTrades.reduce((sum, t) => sum + t.collateral * t.leverage, 0);

  return {
    totalTrades: closedTrades.length + openTrades.length,
    activePositions: openTrades.length,
    totalVolume,
  };
}

export function loadPaperStats(guestId: string): TradeStats {
  if (typeof window === 'undefined') {
    return { totalTrades: 0, activePositions: 0, totalVolume: 0 };
  }

  try {
    const stored = localStorage.getItem(statsKey(guestId));
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TradeStats>;
      return {
        totalTrades: typeof parsed.totalTrades === 'number' ? parsed.totalTrades : 0,
        activePositions: typeof parsed.activePositions === 'number' ? parsed.activePositions : 0,
        totalVolume: typeof parsed.totalVolume === 'number' ? parsed.totalVolume : 0,
      };
    }
  } catch {
    // fall through to compute
  }

  const computed = computePaperStats(guestId);
  savePaperStats(guestId, computed);
  return computed;
}

export function savePaperStats(guestId: string, stats: TradeStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(statsKey(guestId), JSON.stringify(stats));
  } catch (error) {
    console.error('[paperStats] Failed to save:', error);
  }
}

export function refreshPaperStats(guestId: string): TradeStats {
  const stats = computePaperStats(guestId);
  savePaperStats(guestId, stats);
  return stats;
}
