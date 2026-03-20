'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from './useAvantisAPI';
import { saveClosedTrade } from '@/lib/closedTrades';
import { logTradeCloseByPosition } from '@/lib/activityApi';
import { debug } from '@/lib/debug';

interface UsePnLOptions {
  enabled?: boolean;
  interval?: number; // polling interval in ms
}

export function usePnL(options: UsePnLOptions = {}) {
  const { enabled = true, interval = 2000 } = options;
  
  const { userAddress, currentTrade, pnlData, setPnLData, setCurrentTrade, setRememberedIndices, setIsLiquidated, setIsTakeProfitHit, lastKnownPnLPercentage, stage, rememberedPairIndex, rememberedTradeIndex, isIntentionalClose, flipExcludedPositionKey } = useTradeStore();
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
  }, [userAddress, currentTrade, pnlData, stage, getPnL, setPnLData, setCurrentTrade, setRememberedIndices, setIsLiquidated, setIsTakeProfitHit, lastKnownPnLPercentage, rememberedPairIndex, rememberedTradeIndex, isIntentionalClose, flipExcludedPositionKey]);

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
        positions = positions.filter(
          (p) => `${p.trade.pairIndex}-${p.trade.tradeIndex}` !== excludedKey
        );
        debug('[usePnL] Filtered out excluded position:', excludedKey, 'Remaining:', positions.length);
      }
      debug('[usePnL] Fetched positions:', positions.length, 'Current trade:', { 
        pairIndex: trade?.pairIndex, 
        tradeIndex: trade?.tradeIndex,
        rememberedPairIndex: rememberedPairIdx,
        rememberedTradeIndex: rememberedTradeIdx,
      });
      
      // Reset retry count on success
      retryCountRef.current = 0;
      lastErrorRef.current = null;
      
      // Use remembered indices if available (for multiple positions), otherwise fall back to currentTrade
      const pairIndexToMatch = rememberedPairIdx !== null ? rememberedPairIdx : trade?.pairIndex;
      const tradeIndexToMatch = rememberedTradeIdx !== null ? rememberedTradeIdx : trade?.tradeIndex;

      // Find the current trade's PnL: exact match first, then placeholder fallback
      let currentPnL = positions.find(
        (p) =>
          p.trade.pairIndex === pairIndexToMatch &&
          p.trade.tradeIndex === tradeIndexToMatch
      );

      // Placeholder fallback: tradeIndex 0 means we don't know the real index yet.
      // Match newest position on same pair opened within last 60s (our just-opened trade).
      if (!currentPnL && tradeIndexToMatch === 0 && pairIndexToMatch !== undefined && trade) {
        const nowSec = Math.floor(Date.now() / 1000);
        const recentPositions = positions
          .filter(
            (p) =>
              p.trade.pairIndex === pairIndexToMatch &&
              p.trade.openedAt >= nowSec - 60
          )
          .sort((a, b) => b.trade.openedAt - a.trade.openedAt);
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
        
        // Check if position has been liquidated by comparing current price to liquidation price
        const trade = currentTradeRef.current;
        const liquidationPrice = currentPnL.trade.liquidationPrice;
        const currentPrice = currentPnL.currentPrice;
        
        if (trade && liquidationPrice > 0 && currentPrice > 0) {
          // Skip liquidation detection if this is an intentional close (flip/manual close)
          if (isIntentionalCloseRef.current) {
            debug('[usePnL] Skipping liquidation check - intentional close in progress');
            setPnLDataRef.current(currentPnL);
            return;
          }
          
          let isLiquidatedByPrice = false;
          
          if (trade.isLong) {
            // For LONG: liquidated when price drops to or below liquidation price
            isLiquidatedByPrice = currentPrice <= liquidationPrice;
          } else {
            // For SHORT: liquidated when price rises to or above liquidation price
            isLiquidatedByPrice = currentPrice >= liquidationPrice;
          }
          
          // Also check if PnL percentage is at or below -85%
          const isLiquidatedByPnL = currentPnL.pnlPercentage <= -85;
          
          if (isLiquidatedByPrice || isLiquidatedByPnL) {
            debug('[usePnL] Position liquidated detected:', {
              isLiquidatedByPrice,
              isLiquidatedByPnL,
              currentPrice,
              liquidationPrice,
              pnlPercentage: currentPnL.pnlPercentage,
              isLong: trade.isLong,
            });
            
            setIsLiquidatedRef.current(true);
            
            // Update PnL data with final values (liquidation = -100% full loss)
            const liqPct = -100;
            const liqPnl = -trade.collateral;
            const finalPnLData = {
              ...currentPnL,
              pnlPercentage: liqPct,
              pnl: liqPnl,
              grossPnl: liqPnl,  // For losses, gross ≈ net (no tiered fee)
              grossPnlPercentage: liqPct,
            };
            setPnLDataRef.current(finalPnLData);
            
            // Save liquidated trade (capture path for share card)
            const userAddr = userAddressRef.current;
            if (userAddr && trade) {
              try {
                saveClosedTrade(userAddr, trade, finalPnLData, {
                  isLiquidated: true,
                });
                logTradeCloseByPosition({
                  wallet: userAddr,
                  pairIndex: trade.pairIndex,
                  tradeIndex: trade.tradeIndex,
                  exitPrice: currentPnL.currentPrice,
                  pnl: finalPnLData.grossPnl,
                  closedAt: new Date().toISOString(),
                  isLiquidated: true,
                });
              } catch (error) {
                console.error('[usePnL] Failed to save liquidated trade:', error);
              }
            }
            
            // Don't continue updating PnL once liquidated
            return;
          } else {
            // Only clear liquidation state if we're certain it's not liquidated
            // Check if PnL is significantly above -85% threshold (e.g., > -80%)
            if (currentPnL.pnlPercentage > -80) {
              setIsLiquidatedRef.current(false);
            }
            // Otherwise, keep liquidation state if we're close to threshold
          }
        }
        
        // Update PnL data (liquidation check already handled above)
        setPnLDataRef.current(currentPnL);
      } else {
        console.warn('[usePnL] No matching PnL found. Available positions:', positions.map(p => ({
          pairIndex: p.trade.pairIndex,
          tradeIndex: p.trade.tradeIndex
        })));
        
        // Check if this might be a liquidation
        // Skip if this is an intentional close (flip/manual close)
        if (isIntentionalCloseRef.current) {
          positionDisappearedAtRef.current = null;
          debug('[usePnL] Position not found - intentional close in progress, not marking as liquidated');
          return;
        }
        
        // Position disappeared - could be liquidation, take-profit hit, or manual close
        // Add 3s grace period to avoid false detection (API race with Close tx)
        const lastPnL = lastKnownPnLPercentageRef.current;
        const lastPnLData = pnlDataRef.current;
        const userAddr = userAddressRef.current;
        const trade = currentTradeRef.current;
        const now = Date.now();
        
        if (positionDisappearedAtRef.current === null && lastPnL !== null && lastPnLData && userAddr && trade) {
          positionDisappearedAtRef.current = now;
        }
        const elapsed = positionDisappearedAtRef.current ? now - positionDisappearedAtRef.current : 0;
        const LIQ_THRESHOLD = -75; // Avoid false positives at -65%; real liquidation is -85%
        
        // Position disappeared at a deep loss (not intentional close) = liquidated. We use lastPnL <= -75 to avoid
        // false positives when the API transiently returns empty (e.g. at -65%). Real liquidation is at -85%.
        if (lastPnL !== null && lastPnL <= LIQ_THRESHOLD && lastPnLData && userAddr && trade && elapsed >= LIQUIDATION_GRACE_MS) {
          debug('[usePnL] Position disappeared near liquidation threshold (after grace). Last PnL:', lastPnL, '- Marking as liquidated');
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
          // Position closed at significant profit - take profit hit (or manual close at profit)
          debug('[usePnL] Position disappeared at profit (after grace). Last PnL:', lastPnL, '- Marking as take profit hit');
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
          fetchPnL(true);
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
    const shouldPoll = enabled && stage === 'pnl' && userAddress && (currentTrade || (rememberedPairIndex !== null && rememberedTradeIndex !== null));
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
  }, [enabled, stage, userAddress, currentTrade, fetchPnL, interval, getTradeKey, rememberedPairIndex, rememberedTradeIndex]);

  return { fetchPnL, lastError: lastErrorRef.current };
}
