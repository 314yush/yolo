'use client';

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from './useAvantisAPI';
import { saveClosedTrade } from '@/lib/closedTrades';
import { logTradeCloseByPosition } from '@/lib/activityApi';
import { debug } from '@/lib/debug';
import { shouldExcludePositionForFlip } from '@/lib/flipExcludedPosition';

interface UsePnLOptions {
  enabled?: boolean;
  interval?: number; // polling interval in ms
}

export function usePnL(options: UsePnLOptions = {}) {
  const { enabled = true, interval = 4000 } = options;
  
  const { userAddress, currentTrade, pnlData, setPnLData, setCurrentTrade, setRememberedIndices, setIsLiquidated, setIsTakeProfitHit, lastKnownPnLPercentage, stage, rememberedPairIndex, rememberedTradeIndex, isIntentionalClose, flipExcludedPositionKey, positionSource, lastPositionEventAt } = useTradeStore();
  const { getPnL } = useAvantisAPI();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const isPollingRef = useRef<boolean>(false);
  const lastErrorRef = useRef<Error | null>(null);
  const lastTradeKeyRef = useRef<string | null>(null);
  const pnlDataRef = useRef(pnlData);
  const positionDisappearedAtRef = useRef<number | null>(null);
  const LIQUIDATION_GRACE_MS = 3000;
  
  // Store latest values in refs to avoid dependency issues
  const userAddressRef = useRef(userAddress);
  const currentTradeRef = useRef(currentTrade);
  const stageRef = useRef(stage);
  const getPnLRef = useRef(getPnL);
  const setPnLDataRef = useRef(setPnLData);
  const setCurrentTradeRef = useRef(setCurrentTrade);
  const setRememberedIndicesRef = useRef(setRememberedIndices);
  const setIsLiquidatedRef = useRef(setIsLiquidated);
  const setIsTakeProfitHitRef = useRef(setIsTakeProfitHit);
  const lastKnownPnLPercentageRef = useRef(lastKnownPnLPercentage);
  const rememberedPairIndexRef = useRef(rememberedPairIndex);
  const rememberedTradeIndexRef = useRef(rememberedTradeIndex);
  const isIntentionalCloseRef = useRef(isIntentionalClose);
  const flipExcludedPositionKeyRef = useRef(flipExcludedPositionKey);
  const positionSourceRef = useRef(positionSource);
  const lastPositionEventAtRef = useRef(lastPositionEventAt);
  const fetchPnLRef = useRef<(isRetry?: boolean) => Promise<void>>(async () => {});

  // Helper to create a unique key for a trade
  const getTradeKey = useCallback((trade: typeof currentTrade) => {
    if (!trade) return null;
    return `${trade.pairIndex}-${trade.tradeIndex}`;
  }, []);
  
  // Update refs when values change
  useEffect(() => {
    userAddressRef.current = userAddress;
    currentTradeRef.current = currentTrade;
    pnlDataRef.current = pnlData;
    stageRef.current = stage;
    getPnLRef.current = getPnL;
    setPnLDataRef.current = setPnLData;
    setCurrentTradeRef.current = setCurrentTrade;
    setRememberedIndicesRef.current = setRememberedIndices;
    setIsLiquidatedRef.current = setIsLiquidated;
    setIsTakeProfitHitRef.current = setIsTakeProfitHit;
    lastKnownPnLPercentageRef.current = lastKnownPnLPercentage;
    rememberedPairIndexRef.current = rememberedPairIndex;
    rememberedTradeIndexRef.current = rememberedTradeIndex;
    isIntentionalCloseRef.current = isIntentionalClose;
    flipExcludedPositionKeyRef.current = flipExcludedPositionKey;
    positionSourceRef.current = positionSource;
    lastPositionEventAtRef.current = lastPositionEventAt;
  }, [userAddress, currentTrade, pnlData, stage, getPnL, setPnLData, setCurrentTrade, setRememberedIndices, setIsLiquidated, setIsTakeProfitHit, lastKnownPnLPercentage, rememberedPairIndex, rememberedTradeIndex, isIntentionalClose, flipExcludedPositionKey, positionSource, lastPositionEventAt]);

  const fetchPnL = useCallback(async (isRetry = false): Promise<void> => {
    const userAddr = userAddressRef.current;
    const trade = currentTradeRef.current;
    const rememberedPairIdx = rememberedPairIndexRef.current;
    const rememberedTradeIdx = rememberedTradeIndexRef.current;
    
    if (!userAddr || (!trade && (rememberedPairIdx === null || rememberedTradeIdx === null))) {
      debug('[usePnL] Skipping fetch - missing userAddress or currentTrade/remembered indices', { 
        userAddress: userAddr, 
        currentTrade: trade,
        rememberedPairIndex: rememberedPairIdx,
        rememberedTradeIndex: rememberedTradeIdx,
      });
      return;
    }
    
    // Don't fetch if tab is hidden (will resume when visible)
    if (document.hidden && !isRetry) {
      return;
    }
    
    try {
      let positions = await getPnLRef.current(userAddr);
      const excludedKey = flipExcludedPositionKeyRef.current;
      if (excludedKey) {
        const before = positions.length;
        positions = positions.filter((p) => !shouldExcludePositionForFlip(p, excludedKey));
        debug('[usePnL] Flip exclusion applied:', excludedKey, 'before:', before, 'after:', positions.length);
      }
      // Re-read focus AFTER network — avoids matching/applying PnL for a stale trade when
      // the user opened a new position while getPnL was in flight (multi-position / roll-again).
      const tradeNow = currentTradeRef.current;
      const rememberedPairNow = rememberedPairIndexRef.current;
      const rememberedTradeNow = rememberedTradeIndexRef.current;

      debug('[usePnL] Fetched positions:', positions.length, 'Current trade (at fetch start / after await):', {
        pairIndexAtStart: trade?.pairIndex,
        tradeIndexAtStart: trade?.tradeIndex,
        pairIndexNow: tradeNow?.pairIndex,
        tradeIndexNow: tradeNow?.tradeIndex,
        rememberedPairIndex: rememberedPairNow,
        rememberedTradeIndex: rememberedTradeNow,
      });
      
      // Reset retry count on success
      retryCountRef.current = 0;
      lastErrorRef.current = null;
      
      // Prefer currentTrade for match keys; remembered only when trade is null.
      const pairIndexToMatch =
        tradeNow != null ? tradeNow.pairIndex : rememberedPairNow ?? undefined;
      const tradeIndexToMatch =
        tradeNow != null ? tradeNow.tradeIndex : rememberedTradeNow ?? undefined;

      // Find the current trade's PnL: exact match first, then placeholder fallback
      let currentPnL = positions.find(
        (p) =>
          p.trade.pairIndex === pairIndexToMatch &&
          p.trade.tradeIndex === tradeIndexToMatch
      );

      // Placeholder fallback: tradeIndex 0 means we don't know the real index yet.
      // Match newest position on same pair opened within last 60s (our just-opened trade).
      if (!currentPnL && tradeIndexToMatch === 0 && pairIndexToMatch !== undefined && tradeNow) {
        const nowSec = Math.floor(Date.now() / 1000);
        const targetOpenedAt = tradeNow.openedAt;
        const recentPositions = positions
          .filter(
            (p) =>
              p.trade.pairIndex === pairIndexToMatch &&
              p.trade.openedAt >= nowSec - 60
          )
          .sort((a, b) => {
            // Same pair can have multiple opens in the window — pick the slot closest in time
            // to this placeholder's openedAt (set at roll), not blindly "newest".
            if (targetOpenedAt > 0) {
              const da = Math.abs(a.trade.openedAt - targetOpenedAt);
              const db = Math.abs(b.trade.openedAt - targetOpenedAt);
              if (da !== db) return da - db;
            }
            return b.trade.openedAt - a.trade.openedAt;
          });
        const match = recentPositions[0];
        if (match) {
          debug('[usePnL] Placeholder match: found newest position on pair', {
            pairIndex: pairIndexToMatch,
            tradeIndex: match.trade.tradeIndex,
            openedAt: match.trade.openedAt,
          });
          currentPnL = match;
          // Sync currentTrade and remembered indices with real data
          setCurrentTradeRef.current(match.trade);
          setRememberedIndicesRef.current(match.trade.pairIndex, match.trade.tradeIndex);
        }
      }
      
      if (currentPnL) {
        positionDisappearedAtRef.current = null;
        debug('[usePnL] Found matching PnL:', currentPnL);

        // Always use the polled row for this match — not currentTradeRef (can lag after
        // setCurrentTrade in the same tick, or diverge when multiple positions share a pair).
        const tradeRow = currentPnL.trade;

        if (isIntentionalCloseRef.current) {
          debug('[usePnL] Skipping liquidation check - intentional close in progress');
          setPnLDataRef.current(currentPnL);
          return;
        }

        const persistLiquidation = (reason: { byPrice: boolean; byPnL: boolean }) => {
          const liquidationPrice = tradeRow.liquidationPrice;
          const currentPrice = currentPnL.currentPrice;
          debug('[usePnL] Position liquidated detected:', {
            ...reason,
            currentPrice,
            liquidationPrice,
            pnlPercentage: currentPnL.pnlPercentage,
            grossPnlPercentage: currentPnL.grossPnlPercentage,
            isLong: tradeRow.isLong,
          });

          setIsLiquidatedRef.current(true);

          const liqPct = -100;
          const liqPnl = -tradeRow.collateral;
          const finalPnLData = {
            ...currentPnL,
            pnlPercentage: liqPct,
            pnl: liqPnl,
            grossPnl: liqPnl,
            grossPnlPercentage: liqPct,
          };
          setPnLDataRef.current(finalPnLData);

          const userAddr = userAddressRef.current;
          if (userAddr) {
            try {
              saveClosedTrade(userAddr, tradeRow, finalPnLData, {
                isLiquidated: true,
              });
              logTradeCloseByPosition({
                wallet: userAddr,
                pairIndex: tradeRow.pairIndex,
                tradeIndex: tradeRow.tradeIndex,
                exitPrice: currentPnL.currentPrice,
                pnl: finalPnLData.grossPnl,
                closedAt: new Date().toISOString(),
                isLiquidated: true,
              });
            } catch (error) {
              console.error('[usePnL] Failed to save liquidated trade:', error);
            }
          }
        };

        const isLiquidatedByPnL =
          (Number.isFinite(currentPnL.pnlPercentage) && currentPnL.pnlPercentage <= -85) ||
          (Number.isFinite(currentPnL.grossPnlPercentage) && currentPnL.grossPnlPercentage <= -85);

        let isLiquidatedByPrice = false;
        const liquidationPrice = tradeRow.liquidationPrice;
        const currentPrice = currentPnL.currentPrice;
        if (liquidationPrice > 0 && currentPrice > 0) {
          if (tradeRow.isLong) {
            isLiquidatedByPrice = currentPrice <= liquidationPrice;
          } else {
            isLiquidatedByPrice = currentPrice >= liquidationPrice;
          }
        }

        if (isLiquidatedByPnL || isLiquidatedByPrice) {
          persistLiquidation({ byPrice: isLiquidatedByPrice, byPnL: isLiquidatedByPnL });
          return;
        }

        if (currentPnL.pnlPercentage > -80 && currentPnL.grossPnlPercentage > -80) {
          setIsLiquidatedRef.current(false);
        }

        // When Pusher already delivered authoritative data recently, don't overwrite currentTrade
        // from a potentially-stale poll response. Still update PnL numbers for liquidation monitoring.
        const PUSHER_FRESHNESS_MS = 5000;
        const pusherIsFresh =
          positionSourceRef.current === 'pusher' &&
          lastPositionEventAtRef.current != null &&
          Date.now() - lastPositionEventAtRef.current < PUSHER_FRESHNESS_MS;

        if (!pusherIsFresh) {
          setCurrentTradeRef.current(currentPnL.trade);
        }
        setPnLDataRef.current(currentPnL);
      } else {
        console.warn('[usePnL] No matching PnL found. Available positions:', positions.map(p => ({
          pairIndex: p.trade.pairIndex,
          tradeIndex: p.trade.tradeIndex
        })));
        
        // Skip if this is an intentional close (flip/manual close)
        if (isIntentionalCloseRef.current) {
          positionDisappearedAtRef.current = null;
          debug('[usePnL] Position not found - intentional close in progress, not marking as liquidated');
          return;
        }

        // If usePositionSync already detected liquidation/TP via Pusher, don't run heuristics.
        // Pusher resolves instantly; polling here is just catching up to the same conclusion.
        const storeState = useTradeStore.getState();
        if (storeState.isLiquidated || storeState.isTakeProfitHit) {
          debug('[usePnL] Position vanished but Pusher already resolved (liq:', storeState.isLiquidated, 'tp:', storeState.isTakeProfitHit, ')');
          positionDisappearedAtRef.current = null;
          return;
        }
        
        // Fallback heuristic: position disappeared and Pusher hasn't resolved it yet.
        // This covers edge cases where Pusher event was missed or delayed.
        const lastPnL = lastKnownPnLPercentageRef.current;
        const lastPnLData = pnlDataRef.current;
        const userAddr = userAddressRef.current;
        const trade = currentTradeRef.current;
        const now = Date.now();
        
        if (positionDisappearedAtRef.current === null && lastPnL !== null && lastPnLData && userAddr && trade) {
          positionDisappearedAtRef.current = now;
        }
        const elapsed = positionDisappearedAtRef.current ? now - positionDisappearedAtRef.current : 0;
        const LIQ_THRESHOLD = -75;

        const sessionMin = storeState.sessionMinPnlPercentage;
        const sawDeepLoss =
          (lastPnL !== null && lastPnL <= LIQ_THRESHOLD) ||
          (sessionMin !== null && Number.isFinite(sessionMin) && sessionMin <= LIQ_THRESHOLD);

        if (sawDeepLoss && lastPnLData && userAddr && trade && elapsed >= LIQUIDATION_GRACE_MS) {
          debug('[usePnL] Fallback: position disappeared near liquidation threshold (after grace). Last PnL:', lastPnL);
          setIsLiquidatedRef.current(true);
          try {
            const liqPnLData = {
              ...lastPnLData,
              pnlPercentage: -100,
              grossPnlPercentage: -100,
              pnl: -trade.collateral,
              grossPnl: -trade.collateral,
            };
            saveClosedTrade(userAddr, trade, liqPnLData, {
              isLiquidated: true,
            });
            logTradeCloseByPosition({
              wallet: userAddr,
              pairIndex: trade.pairIndex,
              tradeIndex: trade.tradeIndex,
              exitPrice: lastPnLData.currentPrice,
              pnl: -trade.collateral,
              closedAt: new Date().toISOString(),
              isLiquidated: true,
            });
          } catch (error) {
            console.error('[usePnL] Failed to save liquidated trade:', error);
          }
        } else if (lastPnL !== null && lastPnL >= 50 && lastPnLData && userAddr && trade && elapsed >= LIQUIDATION_GRACE_MS) {
          debug('[usePnL] Fallback: position disappeared at profit (after grace). Last PnL:', lastPnL);
          setIsTakeProfitHitRef.current(true);
          try {
            saveClosedTrade(userAddr, trade, lastPnLData, {
              isLiquidated: false,
              isTakeProfitHit: true,
            });
          } catch (error) {
            console.error('[usePnL] Failed to save closed trade (TP hit):', error);
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[usePnL] Failed to fetch PnL:', err);
      lastErrorRef.current = err;
      
      // Exponential backoff retry: 1s, 2s, 4s, 8s, then give up
      if (retryCountRef.current < 4) {
        retryCountRef.current += 1;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 8000);
        debug(`[usePnL] Retrying in ${retryDelay}ms (attempt ${retryCountRef.current}/4)`);
        
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          void fetchPnLRef.current(true);
        }, retryDelay);
      } else {
        console.error('[usePnL] Max retries reached. PnL data may be stale.');
        // Reset retry count after a longer delay to allow recovery
        setTimeout(() => {
          retryCountRef.current = 0;
        }, 30000); // Reset after 30s
      }
    }
  }, []); // Empty deps - we use refs for all values

  useLayoutEffect(() => {
    fetchPnLRef.current = fetchPnL;
  }, [fetchPnL]);

  // Handle visibility changes - pause/resume polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isPollingRef.current) {
        // Tab became visible - fetch immediately and resume polling
        debug('[usePnL] Tab visible - refreshing PnL');
        fetchPnL();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchPnL]);

  // Start/stop polling based on stage
  useEffect(() => {
    // Use current values from props/state, not refs (refs are for the fetch function)
    const shouldPoll = enabled && stage === 'pnl' && userAddress && currentTrade;
    const currentTradeKey = getTradeKey(currentTrade);
    const tradeChanged = currentTradeKey !== lastTradeKeyRef.current;
    
    if (shouldPoll) {
      // Restart polling if trade changed or not currently polling
      if (tradeChanged || !isPollingRef.current) {
        // Stop existing polling if any
        if (isPollingRef.current) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }
        
        // Update trade key
        lastTradeKeyRef.current = currentTradeKey;
        isPollingRef.current = true;
        retryCountRef.current = 0;
        positionDisappearedAtRef.current = null;
        setIsLiquidatedRef.current(false);
        setIsTakeProfitHitRef.current(false);
        useTradeStore.getState().resetSessionMinPnlPercentage();

        // Fetch immediately
        fetchPnL();
        
        // Then poll at interval
        intervalRef.current = setInterval(() => {
          // Only poll if tab is visible and still should poll
          if (!document.hidden && isPollingRef.current) {
            fetchPnL();
          }
        }, interval);
        
        debug('[usePnL] Started polling with interval:', interval, 'Trade:', currentTradeKey);
      }
    } else {
      // Stop polling if conditions no longer met
      if (isPollingRef.current) {
        isPollingRef.current = false;
        lastTradeKeyRef.current = null;
        
        // Clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        // Clear retry timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // Reset retry count
        retryCountRef.current = 0;
        
        debug('[usePnL] Stopped polling');
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, [enabled, stage, userAddress, currentTrade, fetchPnL, interval, getTradeKey]);

  return { fetchPnL };
}
