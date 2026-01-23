'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';

// Pyth Hermes WebSocket endpoint
const PYTH_WS_URL = 'wss://hermes.pyth.network/ws';

// Pyth price feed IDs for supported assets (mainnet)
// These are the canonical feed IDs from Pyth
const PYTH_FEED_IDS: Record<string, string> = {
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'XRP/USD': '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
};

// Reverse mapping for quick lookup
const FEED_ID_TO_PAIR: Record<string, string> = Object.fromEntries(
  Object.entries(PYTH_FEED_IDS).map(([pair, id]) => [id, pair])
);

export interface PythPrice {
  price: number;
  confidence: number;
  timestamp: number;
  expo: number;
}

export interface UsePythPricesReturn {
  prices: Record<string, PythPrice>;
  isConnected: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  getPrice: (pair: string) => number | null;
  lastUpdate: number | null;
}

/**
 * Hook for streaming real-time prices from Pyth Network via WebSocket.
 * 
 * Connects to Pyth Hermes and subscribes to price feeds for all supported assets.
 * Prices update approximately every 400ms.
 * 
 * @example
 * const { prices, getPrice, isConnected } = usePythPrices();
 * const ethPrice = getPrice('ETH/USD'); // Returns current ETH price or null
 */
export function usePythPrices(): UsePythPricesReturn {
  const [prices, setPrices] = useState<Record<string, PythPrice>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Get price for a pair
  const getPrice = useCallback((pair: string): number | null => {
    const priceData = prices[pair];
    return priceData ? priceData.price : null;
  }, [prices]);

  // Parse Pyth price update
  const parsePriceUpdate = useCallback((data: any): void => {
    try {
      if (data.type === 'price_update' && data.price_feed) {
        const feed = data.price_feed;
        const feedId = '0x' + feed.id;
        const pair = FEED_ID_TO_PAIR[feedId];
        
        if (pair && feed.price) {
          const price = parseFloat(feed.price.price);
          const expo = feed.price.expo;
          const confidence = parseFloat(feed.price.conf);
          const timestamp = feed.price.publish_time * 1000;
          
          // Convert price using exponent (Pyth uses negative exponents)
          const adjustedPrice = price * Math.pow(10, expo);
          const adjustedConfidence = confidence * Math.pow(10, expo);
          
          setPrices(prev => ({
            ...prev,
            [pair]: {
              price: adjustedPrice,
              confidence: adjustedConfidence,
              timestamp,
              expo,
            }
          }));
          
          setLastUpdate(Date.now());
        }
      }
    } catch (err) {
      console.error('[PythPrices] Error parsing price update:', err);
    }
  }, []);

  // Connect to Pyth WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');
    console.log('[PythPrices] Connecting to Pyth Hermes...');

    const ws = new WebSocket(PYTH_WS_URL);

    ws.onopen = () => {
      console.log('[PythPrices] Connected to Pyth Hermes');
      setIsConnected(true);
      setConnectionState('connected');
      reconnectAttempts.current = 0;

      // Subscribe to all price feeds
      const feedIds = Object.values(PYTH_FEED_IDS);
      const subscribeMsg = {
        type: 'subscribe',
        ids: feedIds,
      };
      
      console.log('[PythPrices] Subscribing to feeds:', Object.keys(PYTH_FEED_IDS));
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        parsePriceUpdate(data);
      } catch (err) {
        console.error('[PythPrices] Error processing message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[PythPrices] WebSocket error:', error);
      setConnectionState('error');
    };

    ws.onclose = (event) => {
      console.log('[PythPrices] WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      setConnectionState('disconnected');
      wsRef.current = null;

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`[PythPrices] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      } else {
        console.error('[PythPrices] Max reconnection attempts reached');
        setConnectionState('error');
      }
    };

    wsRef.current = ws;
  }, [parsePriceUpdate]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Reconnect on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !isConnected) {
        console.log('[PythPrices] Tab visible, reconnecting...');
        reconnectAttempts.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, isConnected]);

  return {
    prices,
    isConnected,
    connectionState,
    getPrice,
    lastUpdate,
  };
}

/**
 * Hook that syncs Pyth prices to the trade store.
 * Use this at app level to keep store prices updated.
 */
export function usePythPricesSync(): UsePythPricesReturn {
  const pythPrices = usePythPrices();
  const setPrices = useTradeStore(state => state.setPrices);
  
  // Sync prices to store
  useEffect(() => {
    if (Object.keys(pythPrices.prices).length > 0) {
      const storePrices: Record<string, { price: number; timestamp: number }> = {};
      
      for (const [pair, data] of Object.entries(pythPrices.prices)) {
        storePrices[pair] = {
          price: data.price,
          timestamp: data.timestamp,
        };
      }
      
      setPrices(storePrices);
    }
  }, [pythPrices.prices, setPrices]);
  
  return pythPrices;
}
