'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { loadClosedTrades, mergeClosedTradesDuplicate } from '@/lib/closedTrades';
import { getActivityStats, getActivityTrades, type ActivityTrade } from '@/lib/activityApi';
import { ASSETS } from '@/lib/constants';
import { findAssetByPairIndex, getPairKey } from '@/lib/assetPair';
import type { Trade, PnLData, ClosedTrade } from '@/types';

/** Map Activity API trade to ClosedTrade for TradeCard. */
function activityTradeToClosedTrade(at: ActivityTrade): ClosedTrade {
  const assetMatch =
    (at.pair_index != null ? findAssetByPairIndex(at.pair_index) : undefined) ??
    ASSETS.find((a) => at.pair === getPairKey(a)) ??
    ASSETS.find((a) => !a.pairKey && at.pair.includes(a.name));
  const pairIndex = assetMatch?.pairIndex ?? at.pair_index ?? 0;
  const collateral = Math.max(Number(at.collateral) || 1, 1e-10);
  const pnlRaw = at.pnl;
  const pnl = Number.isFinite(Number(pnlRaw)) ? Number(pnlRaw) : 0;
  const closedAtMs = at.closed_at ? new Date(at.closed_at).getTime() : 0;
  const openedAtSec = at.opened_at ? Math.floor(new Date(at.opened_at).getTime() / 1000) : 0;
  const isLiquidated = at.status === 'liquidated';
  const finalPnLPercentage = isLiquidated ? -100 : (Number.isFinite(pnl / collateral) ? (pnl / collateral) * 100 : 0);
  const finalPnL = isLiquidated ? -collateral : pnl;
  return {
    tradeIndex: at.trade_index ?? 0,
    pairIndex,
    pair: at.pair,
    collateral,
    leverage: at.leverage,
    isLong: at.direction === 'LONG',
    openPrice: at.entry_price,
    tp: at.tp_price ?? 0,
    sl: 0,
    liquidationPrice: at.liq_price ?? 0,
    openedAt: openedAtSec,
    closedAt: closedAtMs,
    finalPnL,
    finalPnLPercentage,
    closePrice: at.exit_price ?? at.entry_price,
    txHash: at.tx_hash_open as `0x${string}` | undefined,
    closeTxHash: at.tx_hash_close as `0x${string}` | undefined,
    isLiquidated,
  };
}

export interface ActivityStats {
  total_trades: number;
  total_volume: number;
  total_pnl: number;
  win_rate: number;
  open_trades: number;
}

export interface UseActivityDataReturn {
  openTrades: Array<{ trade: Trade; pnlData?: PnLData }>;
  closedTrades: ClosedTrade[];
  stats: ActivityStats | null;
  isLoadingOpen: boolean;
  isLoadingClosed: boolean;
  isLoadingStats: boolean;
  error: string | null;
  computedVolume: number;
  refresh: () => void;
  /** Immediately re-fetch open trades (for event-driven updates via usePositionSync). */
  refetchOpenTrades: () => Promise<void>;
  setClosedTrades: React.Dispatch<React.SetStateAction<ClosedTrade[]>>;
  setOpenTrades: React.Dispatch<React.SetStateAction<Array<{ trade: Trade; pnlData?: PnLData }>>>;
}

export function useActivityData(userAddress: string | null): UseActivityDataReturn {
  const { getPnL, getClosedTrades: getAvantisClosedTrades } = useAvantisAPI();
  const pendingTradeHashes = useTradeStore((s) => s.pendingTradeHashes);
  const pendingOpenTxCount = useTradeStore((s) => s.pendingOpenTxHashes.length);
  const updateActivePositions = useTradeStore((s) => s.updateActivePositions);

  const [openTrades, setOpenTrades] = useState<Array<{ trade: Trade; pnlData?: PnLData }>>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [isLoadingOpen, setIsLoadingOpen] = useState(true);
  const [isLoadingClosed, setIsLoadingClosed] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const prevOpenPositionKeysRef = useRef<Set<string>>(new Set());
  const deferPendingHashClearRef = useRef(true);
  const activityPollWalletRef = useRef<string | null>(null);
  const closedTradesLoadIdRef = useRef(0);

  const refresh = useCallback(() => {
    setRetryTrigger((t) => t + 1);
  }, []);

  // Reset state when user logs out
  useEffect(() => {
    if (!userAddress) {
      setIsLoadingOpen(false);
      setIsLoadingClosed(false);
      setIsLoadingStats(false);
      setStats(null);
      setError(null);
      setOpenTrades([]);
      setClosedTrades([]);
    }
  }, [userAddress]);

  // Fetch stats from Activity API
  useEffect(() => {
    if (!userAddress) return;

    const loadStats = async () => {
      setIsLoadingStats(true);
      setError(null);
      try {
        const statsResult = await getActivityStats(userAddress);
        if (statsResult) {
          setStats(statsResult);
        } else {
          setError('Activity data temporarily unavailable. Check your connection.');
        }
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [userAddress, retryTrigger]);

  // Retry on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && userAddress) {
        setRetryTrigger((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userAddress]);

  // Load closed trades: Activity API primary, merge localStorage + Avantis for legacy/fallback
  useEffect(() => {
    if (!userAddress) {
      setIsLoadingClosed(false);
      return;
    }

    const loadId = ++closedTradesLoadIdRef.current;
    setIsLoadingClosed(true);

    const loadAllClosedTrades = async () => {
      try {
        const mergedMap = new Map<string, ClosedTrade>();

        const localClosed = loadClosedTrades(userAddress);
        const [activityRes, apiClosed] = await Promise.all([
          getActivityTrades(userAddress, 50, 0),
          getAvantisClosedTrades(userAddress, 1).catch((err) => {
            console.error('[useActivityData] Failed to fetch closed trades from Avantis:', err);
            return [] as ClosedTrade[];
          }),
        ]);

        if (loadId !== closedTradesLoadIdRef.current) return;

        if (!activityRes) {
          setError('Activity data temporarily unavailable. Check your connection.');
        } else {
          setError(null);
        }

        const activityClosed = activityRes?.trades
          ?.filter((t) => t.status === 'closed' || t.status === 'liquidated')
          .map(activityTradeToClosedTrade) ?? [];

        // Include openedAt in the key so that slot-reused positions (e.g. flip: close LONG at
        // index 0, open+close SHORT at index 0) are tracked separately.
        const closedTradeKey = (t: ClosedTrade) =>
          t.openedAt && t.openedAt > 0
            ? `${t.pairIndex}-${t.tradeIndex}-${t.openedAt}`
            : `${t.pairIndex}-${t.tradeIndex}`;

        const mergePut = (trade: ClosedTrade) => {
          const key = closedTradeKey(trade);
          const existing = mergedMap.get(key);
          mergedMap.set(key, existing ? mergeClosedTradesDuplicate(existing, trade) : trade);
        };

        activityClosed.forEach(mergePut);
        apiClosed.forEach(mergePut);
        localClosed.forEach(mergePut);

        const merged = Array.from(mergedMap.values()).map((t) => {
          const isLiq = t.isLiquidated ?? false;
          return {
            ...t,
            finalPnL: isLiq ? -t.collateral : (Number.isFinite(Number(t.finalPnL)) ? Number(t.finalPnL) : 0),
            finalPnLPercentage: isLiq ? -100 : (Number.isFinite(Number(t.finalPnLPercentage)) ? Number(t.finalPnLPercentage) : 0),
          };
        }).sort((a, b) => {
          const aTime = (a.closedAt && a.closedAt > 0) ? a.closedAt : (a.openedAt && a.openedAt > 0 ? a.openedAt * 1000 : 0);
          const bTime = (b.closedAt && b.closedAt > 0) ? b.closedAt : (b.openedAt && b.openedAt > 0 ? b.openedAt * 1000 : 0);
          return bTime - aTime;
        });

        if (loadId !== closedTradesLoadIdRef.current) return;
        setClosedTrades(merged);
      } finally {
        if (loadId === closedTradesLoadIdRef.current) {
          setIsLoadingClosed(false);
        }
      }
    };

    void loadAllClosedTrades();
  }, [userAddress, getAvantisClosedTrades, retryTrigger]);

  // Load open trades with PnL - adaptive polling
  useEffect(() => {
    if (!userAddress) {
      activityPollWalletRef.current = null;
      return;
    }

    if (activityPollWalletRef.current !== userAddress) {
      activityPollWalletRef.current = userAddress;
      prevOpenPositionKeysRef.current = new Set();
      deferPendingHashClearRef.current = true;
    }

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;
    let hasLoadedOnce = false;

    const loadTrades = async () => {
      if (!isMounted || !userAddress) return;

      if (!hasLoadedOnce) {
        setIsLoadingOpen(true);
      }
      try {
        const positions = await getPnL(userAddress);

        if (!isMounted) return;

        const currentKeys = new Set(
          positions.map((p) => `${p.trade.pairIndex}-${p.trade.tradeIndex}`)
        );
        const newKeys: string[] = [];
        currentKeys.forEach((k) => {
          if (!prevOpenPositionKeysRef.current.has(k)) newKeys.push(k);
        });

        hasLoadedOnce = true;
        const combined = positions.map((pos) => ({
          trade: pos.trade,
          pnlData: pos,
        }));

        setOpenTrades(combined);
        updateActivePositions(positions.length);
        setIsLoadingOpen(false);

        // Clear pending hashes when new positions appear
        if (deferPendingHashClearRef.current) {
          deferPendingHashClearRef.current = false;
        } else if (newKeys.length > 0) {
          const { pendingTradeHashes: pending, removePendingTradeHash: removePending } =
            useTradeStore.getState();
          if (pending.size > 0) {
            const toClear = [...pending].slice(0, newKeys.length);
            toClear.forEach((h) => removePending(h));
          }
        }
        prevOpenPositionKeysRef.current = currentKeys;
      } catch (err) {
        console.error('[useActivityData] Failed to load trades:', err);
        setIsLoadingOpen(false);
      }
    };

    // usePositionSync handles the fast path via Pusher events.
    // Polling here is reconciliation-only: faster when pending txs, slower otherwise.
    const hasPending = pendingTradeHashes.size > 0 || pendingOpenTxCount > 0;
    const interval = hasPending ? 2000 : 5000;

    loadTrades();

    intervalId = setInterval(() => {
      if (isMounted) {
        loadTrades();
      }
    }, interval);

    const handleVisibilityChange = () => {
      if (!document.hidden && isMounted) {
        loadTrades();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, pendingTradeHashes.size, pendingOpenTxCount]);

  const computedVolume = useMemo(() => {
    const openVol = openTrades.reduce((sum, item) => sum + item.trade.collateral * item.trade.leverage, 0);
    const closedVol = closedTrades.reduce((sum, t) => sum + t.collateral * t.leverage, 0);
    return openVol + closedVol;
  }, [openTrades, closedTrades]);

  const refetchOpenTrades = useCallback(async () => {
    if (!userAddress) return;
    try {
      const positions = await getPnL(userAddress);
      const combined = positions.map((pos) => ({
        trade: pos.trade,
        pnlData: pos,
      }));
      setOpenTrades(combined);
      updateActivePositions(positions.length);
    } catch (err) {
      console.error('[useActivityData] refetchOpenTrades failed:', err);
    }
  }, [userAddress, getPnL, updateActivePositions]);

  return {
    openTrades,
    closedTrades,
    stats,
    isLoadingOpen,
    isLoadingClosed,
    isLoadingStats,
    error,
    computedVolume,
    refresh,
    refetchOpenTrades,
    setClosedTrades,
    setOpenTrades,
  };
}
