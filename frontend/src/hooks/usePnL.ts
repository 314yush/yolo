'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useAvantisAPI } from './useAvantisAPI';

interface UsePnLOptions {
  enabled?: boolean;
  interval?: number; // polling interval in ms
}

export function usePnL(options: UsePnLOptions = {}) {
  const { enabled = true, interval = 2000 } = options;
  
  const { userAddress, currentTrade, setPnLData, stage, rememberedPairIndex, rememberedTradeIndex } = useTradeStore();
  const { getPnL } = useAvantisAPI();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const isPollingRef = useRef<boolean>(false);
  const lastErrorRef = useRef<Error | null>(null);
  const lastTradeKeyRef = useRef<string | null>(null);
  
  // Store latest values in refs to avoid dependency issues
  const userAddressRef = useRef(userAddress);
  const currentTradeRef = useRef(currentTrade);
  const stageRef = useRef(stage);
  const getPnLRef = useRef(getPnL);
  const setPnLDataRef = useRef(setPnLData);
  const rememberedPairIndexRef = useRef(rememberedPairIndex);
  const rememberedTradeIndexRef = useRef(rememberedTradeIndex);
  
  // Helper to create a unique key for a trade
  const getTradeKey = useCallback((trade: typeof currentTrade) => {
    if (!trade) return null;
    return `${trade.pairIndex}-${trade.tradeIndex}`;
  }, []);
  
  // Update refs when values change
  useEffect(() => {
    userAddressRef.current = userAddress;
    currentTradeRef.current = currentTrade;
    stageRef.current = stage;
    getPnLRef.current = getPnL;
    setPnLDataRef.current = setPnLData;
    rememberedPairIndexRef.current = rememberedPairIndex;
    rememberedTradeIndexRef.current = rememberedTradeIndex;
  }, [userAddress, currentTrade, stage, getPnL, setPnLData, rememberedPairIndex, rememberedTradeIndex]);

  const fetchPnL = useCallback(async (isRetry = false): Promise<void> => {
    const userAddr = userAddressRef.current;
    const trade = currentTradeRef.current;
    const rememberedPairIdx = rememberedPairIndexRef.current;
    const rememberedTradeIdx = rememberedTradeIndexRef.current;
    
    if (!userAddr || (!trade && (rememberedPairIdx === null || rememberedTradeIdx === null))) {
      console.log('[usePnL] Skipping fetch - missing userAddress or currentTrade/remembered indices', { 
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
      const positions = await getPnLRef.current(userAddr);
      console.log('[usePnL] Fetched positions:', positions.length, 'Current trade:', { 
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
      
      // Find the current trade's PnL using remembered indices or currentTrade
      const currentPnL = positions.find(
        (p) => 
          p.trade.pairIndex === pairIndexToMatch &&
          p.trade.tradeIndex === tradeIndexToMatch
      );
      
      if (currentPnL) {
        console.log('[usePnL] Found matching PnL:', currentPnL);
        setPnLDataRef.current(currentPnL);
      } else {
        console.warn('[usePnL] No matching PnL found. Available positions:', positions.map(p => ({
          pairIndex: p.trade.pairIndex,
          tradeIndex: p.trade.tradeIndex
        })));
        // Trade might have been closed - don't treat as error, just log
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[usePnL] Failed to fetch PnL:', err);
      lastErrorRef.current = err;
      
      // Exponential backoff retry: 1s, 2s, 4s, 8s, then give up
      if (retryCountRef.current < 4) {
        retryCountRef.current += 1;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 8000);
        console.log(`[usePnL] Retrying in ${retryDelay}ms (attempt ${retryCountRef.current}/4)`);
        
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
        console.log('[usePnL] Tab visible - refreshing PnL');
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
        retryCountRef.current = 0; // Reset retry count for new trade
        
        // Fetch immediately
        fetchPnL();
        
        // Then poll at interval
        intervalRef.current = setInterval(() => {
          // Only poll if tab is visible and still should poll
          if (!document.hidden && isPollingRef.current) {
            fetchPnL();
          }
        }, interval);
        
        console.log('[usePnL] Started polling with interval:', interval, 'Trade:', currentTradeKey);
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
        
        console.log('[usePnL] Stopped polling');
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
