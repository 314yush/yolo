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
  
  const { userAddress, currentTrade, setPnLData, stage } = useTradeStore();
  const { getPnL } = useAvantisAPI();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPnL = useCallback(async () => {
    if (!userAddress || !currentTrade) return;
    
    try {
      const positions = await getPnL(userAddress);
      
      // Find the current trade's PnL
      const currentPnL = positions.find(
        (p) => 
          p.trade.pairIndex === currentTrade.pairIndex &&
          p.trade.tradeIndex === currentTrade.tradeIndex
      );
      
      if (currentPnL) {
        setPnLData(currentPnL);
      }
    } catch (error) {
      console.error('Failed to fetch PnL:', error);
    }
  }, [userAddress, currentTrade, getPnL, setPnLData]);

  // Start/stop polling based on stage
  useEffect(() => {
    const shouldPoll = enabled && stage === 'pnl' && userAddress && currentTrade;
    
    if (shouldPoll) {
      // Fetch immediately
      fetchPnL();
      
      // Then poll at interval
      intervalRef.current = setInterval(fetchPnL, interval);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, stage, userAddress, currentTrade, fetchPnL, interval]);

  return { fetchPnL };
}
