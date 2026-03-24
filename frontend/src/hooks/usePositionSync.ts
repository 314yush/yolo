'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from './useAvantisAPI';
import { useAutoPusherEvents, parseOrderFilledPayload } from './usePusherEvents';
import type { PusherEvent, ParsedOrderFilled } from './usePusherEvents';
import type { ClosedTrade } from '@/types';
import { ASSETS } from '@/lib/constants';
import { debug } from '@/lib/debug';

/** Build a ClosedTrade from an OrderFilled close event's parsed payload. */
function closedTradeFromEvent(parsed: ParsedOrderFilled): ClosedTrade | null {
  if (
    parsed.pairIndex == null ||
    parsed.openPrice == null ||
    parsed.collateral == null ||
    parsed.leverage == null ||
    parsed.isLong == null
  ) {
    return null;
  }

  const asset = ASSETS.find((a) => a.pairIndex === parsed.pairIndex);
  const pair = asset ? `${asset.name}/USD` : `Pair ${parsed.pairIndex}`;
  const closePrice = parsed.closePrice ?? parsed.openPrice;

  const pnlUsd = parsed.usdcSentToTrader != null
    ? parsed.usdcSentToTrader - parsed.collateral
    : 0;
  const pnlPct = parsed.percentProfit ?? (parsed.collateral > 0 ? (pnlUsd / parsed.collateral) * 100 : 0);

  // Liquidation: PnL at or near -100% (protocol takes full collateral, usdcSentToTrader ≈ 0)
  const isLiquidated = pnlPct <= -90 || (parsed.usdcSentToTrader != null && parsed.usdcSentToTrader < parsed.collateral * 0.05);

  // TP hit: close price matches TP target (within 0.1% tolerance) and trade was profitable
  let isTakeProfitHit = false;
  if (!isLiquidated && parsed.tp != null && parsed.tp > 0 && closePrice > 0 && pnlPct > 0) {
    const tpDiff = Math.abs(closePrice - parsed.tp) / parsed.tp;
    isTakeProfitHit = tpDiff < 0.001;
  }

  return {
    tradeIndex: parsed.tradeIndex ?? 0,
    pairIndex: parsed.pairIndex,
    pair,
    collateral: parsed.collateral,
    leverage: parsed.leverage,
    isLong: parsed.isLong,
    openPrice: parsed.openPrice,
    tp: parsed.tp ?? 0,
    sl: parsed.sl ?? 0,
    liquidationPrice: 0,
    openedAt: parsed.openedAt ?? 0,
    closedAt: Date.now(),
    finalPnL: isLiquidated ? -parsed.collateral : pnlUsd,
    finalPnLPercentage: isLiquidated ? -100 : pnlPct,
    closePrice,
    closeTxHash: parsed.transactionHash as `0x${string}` | undefined,
    isLiquidated,
    isTakeProfitHit,
  };
}

interface UsePositionSyncOptions {
  /** Only process events when enabled (e.g. during PnL stage). Default true. */
  enabled?: boolean;
  /** Called after an open-fill event is processed — wire to useUsdcBalance.refetch, etc. */
  onFilled?: () => void;
  /** Called when a position is closed (OrderFilled open=false) with the constructed ClosedTrade. */
  onClose?: (trade: ClosedTrade) => void;
  /** Called after a cancel event is processed. */
  onCanceled?: () => void;
}

/**
 * Bridges Pusher order-lifecycle events to authoritative store updates.
 *
 * On OrderFilled:
 *   1. Parse payload for tradeIndex / pairIndex / openPrice
 *   2. Immediately patch the placeholder currentTrade with any known fields
 *   3. Trigger a targeted getPnL fetch
 *   4. Exact-match by tradeIndex from event, fall back to time-based heuristic
 *   5. Update currentTrade + pnlData + openTrades in the store
 *
 * On OrderCanceled: invoke the onCanceled callback (e.g. refetch balance).
 */
export function usePositionSync(options: UsePositionSyncOptions = {}) {
  const { enabled = true, onFilled, onClose, onCanceled } = options;

  const pusher = useAutoPusherEvents();
  const { getPnL } = useAvantisAPI();

  const {
    userAddress,
    currentTrade,
    stage,
    flipExcludedPositionKey,
    isIntentionalClose,
    setCurrentTrade,
    setPnLData,
    setOpenTrades,
    updateActivePositions,
    setPositionSource,
    setLastPositionEventAt,
    setIsLiquidated,
    setIsTakeProfitHit,
  } = useTradeStore();

  // Refs to avoid stale closures in async code
  const userAddressRef = useRef(userAddress);
  const currentTradeRef = useRef(currentTrade);
  const stageRef = useRef(stage);
  const flipExcludedKeyRef = useRef(flipExcludedPositionKey);
  const isIntentionalCloseRef = useRef(isIntentionalClose);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    userAddressRef.current = userAddress;
    currentTradeRef.current = currentTrade;
    stageRef.current = stage;
    flipExcludedKeyRef.current = flipExcludedPositionKey;
    isIntentionalCloseRef.current = isIntentionalClose;
  }, [userAddress, currentTrade, stage, flipExcludedPositionKey, isIntentionalClose]);

  // Track which events we've already processed (by timestamp) to avoid re-processing
  const processedTimestampsRef = useRef<Set<number>>(new Set());
  // Events that were skipped because a fetch was in-flight — retry after current fetch completes
  const pendingRetryRef = useRef<PusherEvent | null>(null);

  const handleFilledEvent = useCallback(async (event: PusherEvent) => {
    const addr = userAddressRef.current;
    if (!addr) return;

    // Queue for retry instead of dropping when a fetch is in-flight
    if (isFetchingRef.current) {
      debug('[PositionSync] Fetch in-flight — queuing event for retry');
      pendingRetryRef.current = event;
      return;
    }
    isFetchingRef.current = true;

    try {
      const parsed = parseOrderFilledPayload(event.data);
      debug('[PositionSync] Processing OrderFilled:', {
        isOpen: parsed.isOpen,
        tradeIndex: parsed.tradeIndex,
        pairIndex: parsed.pairIndex,
        openPrice: parsed.openPrice,
        leverage: parsed.leverage,
        isLong: parsed.isLong,
      });

      // For close fills, construct a ClosedTrade and notify consumers immediately.
      // Also detect liquidation / TP hit for the currently-viewed position.
      if (parsed.isOpen === false) {
        const closed = closedTradeFromEvent(parsed);
        if (closed) {
          debug('[PositionSync] Close fill detected:', {
            pairIndex: closed.pairIndex,
            tradeIndex: closed.tradeIndex,
            finalPnL: closed.finalPnL,
            closePrice: closed.closePrice,
            isLiquidated: closed.isLiquidated,
            isTakeProfitHit: closed.isTakeProfitHit,
          });

          // If this close matches the position the user is currently viewing on the PnL screen
          // AND the user didn't initiate it → it's a liquidation or TP/SL hit.
          const viewing = currentTradeRef.current;
          const isCurrentPosition = viewing && (
            (parsed.tradeIndex != null && parsed.pairIndex != null &&
              viewing.pairIndex === parsed.pairIndex && viewing.tradeIndex === parsed.tradeIndex) ||
            (viewing.tradeIndex === 0 && viewing.pairIndex === parsed.pairIndex)
          );

          if (isCurrentPosition && !isIntentionalCloseRef.current) {
            if (closed.isLiquidated) {
              debug('[PositionSync] Liquidation detected via Pusher for current position');
              setIsLiquidated(true);
              setPnLData({
                trade: viewing,
                currentPrice: closed.closePrice,
                pnl: -viewing.collateral,
                pnlPercentage: -100,
                grossPnl: -viewing.collateral,
                grossPnlPercentage: -100,
              });
            } else if (closed.isTakeProfitHit) {
              debug('[PositionSync] Take-profit hit detected via Pusher for current position');
              setIsTakeProfitHit(true);
              setPnLData({
                trade: viewing,
                currentPrice: closed.closePrice,
                pnl: closed.finalPnL,
                pnlPercentage: closed.finalPnLPercentage,
                grossPnl: closed.finalPnL,
                grossPnlPercentage: closed.finalPnLPercentage,
              });
            }
          }

          onClose?.(closed);
        }
      }

      // Step 1: For open fills, immediately patch placeholder with canonical data from event
      if (parsed.isOpen !== false) {
        const trade = currentTradeRef.current;
        if (trade && trade.tradeIndex === 0 && parsed.openPrice != null && parsed.openPrice > 0) {
          debug('[PositionSync] Patching placeholder with event data — openPrice:', parsed.openPrice);
          setCurrentTrade({
            ...trade,
            openPrice: parsed.openPrice,
            ...(parsed.tradeIndex != null ? { tradeIndex: parsed.tradeIndex } : {}),
            ...(parsed.tp != null && parsed.tp > 0 ? { tp: parsed.tp } : {}),
            ...(parsed.sl != null && parsed.sl > 0 ? { sl: parsed.sl } : {}),
            ...(parsed.leverage != null ? { leverage: parsed.leverage } : {}),
            ...(parsed.isLong != null ? { isLong: parsed.isLong } : {}),
          });
          setPositionSource('pusher');
          setLastPositionEventAt(Date.now());
        }
      }

      // Step 2: Targeted fetch for full position data (gets liq price, accurate PnL, etc.)
      let positions = await getPnL(addr);

      // Apply flip exclusion filter
      const excl = flipExcludedKeyRef.current;
      if (excl) {
        positions = positions.filter(
          (p) => `${p.trade.pairIndex}-${p.trade.tradeIndex}` !== excl
        );
      }

      // Step 3: Update open trades list (benefits /activity + home banner) regardless of match
      setOpenTrades(positions.map((p) => p.trade));
      updateActivePositions(positions.length);

      if (positions.length === 0) {
        debug('[PositionSync] No positions from API after OrderFilled');
        onFilled?.();
        return;
      }

      // Re-read current trade after async gap
      const tradeNow = currentTradeRef.current;

      // Step 4: Match — prefer exact tradeIndex from event, fall back to heuristic
      let match = null;
      if (parsed.tradeIndex != null && parsed.pairIndex != null) {
        match = positions.find(
          (p) =>
            p.trade.pairIndex === parsed.pairIndex &&
            p.trade.tradeIndex === parsed.tradeIndex
        );
      }

      // Fallback: time-based match on same pair (same as existing placeholder logic)
      if (!match && tradeNow) {
        const nowSec = Math.floor(Date.now() / 1000);
        const targetOpenedAt = tradeNow.openedAt;
        const recent = positions
          .filter(
            (p) =>
              p.trade.pairIndex === tradeNow.pairIndex &&
              p.trade.openedAt >= nowSec - 60
          )
          .sort((a, b) => {
            if (targetOpenedAt > 0) {
              const da = Math.abs(a.trade.openedAt - targetOpenedAt);
              const db = Math.abs(b.trade.openedAt - targetOpenedAt);
              if (da !== db) return da - db;
            }
            return b.trade.openedAt - a.trade.openedAt;
          });
        match = recent[0] ?? null;
      }

      // Step 5: Patch store with authoritative data
      if (match) {
        debug('[PositionSync] Resolved position:', {
          pairIndex: match.trade.pairIndex,
          tradeIndex: match.trade.tradeIndex,
          openPrice: match.trade.openPrice,
        });
        setCurrentTrade(match.trade);
        setPnLData(match);
        setPositionSource('pusher');
        setLastPositionEventAt(Date.now());
      }

      // Notify consumers (balance refresh, etc.)
      onFilled?.();
    } catch (err) {
      console.error('[PositionSync] Error processing OrderFilled:', err);
    } finally {
      isFetchingRef.current = false;

      // Process any event that was queued while this fetch was in-flight
      const retry = pendingRetryRef.current;
      if (retry) {
        pendingRetryRef.current = null;
        debug('[PositionSync] Processing queued retry event');
        handleFilledEvent(retry);
      }
    }
  }, [getPnL, setCurrentTrade, setPnLData, setOpenTrades, updateActivePositions, setPositionSource, setLastPositionEventAt, setIsLiquidated, setIsTakeProfitHit, onFilled, onClose]);

  const handleCanceledEvent = useCallback(() => {
    debug('[PositionSync] OrderCanceled received');
    onCanceled?.();
  }, [onCanceled]);

  // React to new Pusher events
  useEffect(() => {
    if (!enabled) return;

    const events = pusher.events;
    if (events.length === 0) return;

    for (const event of events) {
      if (processedTimestampsRef.current.has(event.timestamp)) continue;

      if (event.type === 'OrderFilled') {
        // Only mark as processed once actually handled (not queued for retry)
        if (!isFetchingRef.current) {
          processedTimestampsRef.current.add(event.timestamp);
        }
        handleFilledEvent(event);
      } else if (event.type === 'OrderCanceled') {
        processedTimestampsRef.current.add(event.timestamp);
        handleCanceledEvent();
      }
    }

    // Prevent unbounded growth of processed set
    if (processedTimestampsRef.current.size > 100) {
      const arr = [...processedTimestampsRef.current];
      processedTimestampsRef.current = new Set(arr.slice(-50));
    }
  }, [enabled, pusher.events, handleFilledEvent, handleCanceledEvent]);

  // Clear processed timestamps when events are cleared (stage transitions)
  useEffect(() => {
    if (pusher.events.length === 0) {
      processedTimestampsRef.current.clear();
    }
  }, [pusher.events.length]);
}
