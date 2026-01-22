import type { TradeStats } from '@/types';

const STORAGE_KEY = 'yolo_stats';

const DEFAULT_STATS: TradeStats = {
  totalTrades: 0,
  activePositions: 0,
};

export function loadStats(): TradeStats {
  if (typeof window === 'undefined') {
    return DEFAULT_STATS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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
    };
  } catch (error) {
    console.error('Failed to load stats:', error);
    return DEFAULT_STATS;
  }
}

export function saveStats(stats: TradeStats): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (error) {
    console.error('Failed to save stats:', error);
  }
}

export function incrementTotalTrades(): void {
  const stats = loadStats();
  const newStats = {
    ...stats,
    totalTrades: stats.totalTrades + 1,
  };
  saveStats(newStats);
}

export function updateActivePositions(count: number): void {
  const stats = loadStats();
  const newStats = {
    ...stats,
    activePositions: count,
  };
  saveStats(newStats);
}
