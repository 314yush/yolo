import type { TradeStats } from '@/types';

function getStorageKey(address: string): string {
  return `yolo_stats_${address.toLowerCase()}`;
}

const DEFAULT_STATS: TradeStats = {
  totalTrades: 0,
  activePositions: 0,
  totalVolume: 0,
};

export function loadStats(address: string | null | undefined): TradeStats {
  if (typeof window === 'undefined' || !address) {
    return DEFAULT_STATS;
  }

  try {
    const key = getStorageKey(address);
    const stored = localStorage.getItem(key);
    if (!stored) {
      return DEFAULT_STATS;
    }

    const parsed = JSON.parse(stored);
    // Validate and merge with defaults
    return {
      totalTrades: typeof parsed.totalTrades === 'number' && parsed.totalTrades >= 0 
        ? parsed.totalTrades 
        : 0,
      activePositions: typeof parsed.activePositions === 'number' && parsed.activePositions >= 0
        ? parsed.activePositions
        : 0,
      totalVolume: typeof parsed.totalVolume === 'number' && parsed.totalVolume >= 0
        ? parsed.totalVolume
        : 0,
    };
  } catch (error) {
    console.error('Failed to load stats:', error);
    return DEFAULT_STATS;
  }
}

export function saveStats(address: string | null | undefined, stats: TradeStats): void {
  if (typeof window === 'undefined' || !address) {
    return;
  }

  try {
    const key = getStorageKey(address);
    localStorage.setItem(key, JSON.stringify(stats));
  } catch (error) {
    console.error('Failed to save stats:', error);
  }
}

export function incrementTotalTrades(address: string | null | undefined): void {
  const stats = loadStats(address);
  const newStats = {
    ...stats,
    totalTrades: stats.totalTrades + 1,
  };
  saveStats(address, newStats);
}

export function updateActivePositions(address: string | null | undefined, count: number): void {
  const stats = loadStats(address);
  const newStats = {
    ...stats,
    activePositions: count,
  };
  saveStats(address, newStats);
}

/**
 * Increment volume when a trade is opened
 * Volume = position size (collateral * leverage) of the opened trade
 */
export function incrementVolume(
  address: string | null | undefined,
  collateral: number,
  leverage: number
): void {
  const stats = loadStats(address);
  const positionSize = collateral * leverage;
  const newStats = {
    ...stats,
    totalVolume: stats.totalVolume + positionSize,
  };
  saveStats(address, newStats);
}
