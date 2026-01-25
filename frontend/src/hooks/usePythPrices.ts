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
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false); // Guard against multiple simultaneous connections
  const STALE_CONNECTION_THRESHOLD = 30000; // 30 seconds without updates = stale

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
          lastUpdateRef.current = Date.now();
        }
      }
    } catch (err) {
      console.error('[PythPrices] Error parsing price update:', err);
    }
  }, []);

  // Connect to Pyth WebSocket
  const connect = useCallback(() => {
    // Guard: Don't connect if already connected or connecting
    const currentWs = wsRef.current;
    if (currentWs?.readyState === WebSocket.OPEN) {
      return;
    }
    
    // Guard: Don't connect if already connecting
    if (isConnectingRef.current) {
      return;
    }
    
    // Clear any pending reconnection timeout to prevent race conditions
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close any existing connection that's not already closed
    if (currentWs && currentWs.readyState !== WebSocket.CLOSED && currentWs.readyState !== WebSocket.CLOSING) {
      try {
        currentWs.close();
      } catch (e) {
        // Ignore errors when closing
      }
    }

    isConnectingRef.current = true;
    setConnectionState('connecting');
    console.log('[PythPrices] Connecting to Pyth Hermes...');

    const ws = new WebSocket(PYTH_WS_URL);

    ws.onopen = () => {
      console.log('[PythPrices] Connected to Pyth Hermes');
      isConnectingRef.current = false;
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
      try {
        ws.send(JSON.stringify(subscribeMsg));
      } catch (err) {
        console.error('[PythPrices] Error sending subscribe message:', err);
      }
      
      // Start health check interval to detect stale connections
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
      healthCheckIntervalRef.current = setInterval(() => {
        const currentWs = wsRef.current;
        if (!currentWs) return;
        
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // If we haven't received updates in a while and connection appears open, it might be stale
        if (currentWs.readyState === WebSocket.OPEN && timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD && lastUpdateTime > 0) {
          console.warn(`[PythPrices] Stale connection detected (${timeSinceLastUpdate}ms since last update), reconnecting...`);
          currentWs.close(); // This will trigger onclose and reconnect
        }
      }, 10000); // Check every 10 seconds
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
      console.error('[PythPrices] WebSocket error details:', {
        type: error.type,
        readyState: ws.readyState,
        url: ws.url,
        protocol: ws.protocol,
      });
      isConnectingRef.current = false;
      setConnectionState('error');
    };

    ws.onclose = (event) => {
      console.log('[PythPrices] WebSocket closed:', event.code, event.reason);
      isConnectingRef.current = false;
      setIsConnected(false);
      setConnectionState('disconnected');
      
      // Only process this close event if it's for the current WebSocket instance
      if (wsRef.current === ws) {
        wsRef.current = null;
        
        // Clear health check interval
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current);
          healthCheckIntervalRef.current = null;
        }

        // Attempt to reconnect with exponential backoff (only if no timeout already scheduled)
        if (!reconnectTimeoutRef.current && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[PythPrices] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            reconnectTimeoutRef.current = null;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('[PythPrices] Max reconnection attempts reached');
          setConnectionState('error');
        }
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
        reconnectTimeoutRef.current = null;
      }
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [connect]);

  // Reconnect on visibility change - improved to handle stale connections
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible - check connection health
        const ws = wsRef.current;
        const isActuallyConnected = ws?.readyState === WebSocket.OPEN;
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        const isStale = timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD && lastUpdateTime > 0;
        
        // Reconnect if: not connected, stale connection, or WebSocket is not actually open
        // But only if we're not already connecting
        if ((!isActuallyConnected || isStale || (!isConnected && connectionState !== 'connecting')) && !isConnectingRef.current) {
          console.log('[PythPrices] Tab visible, reconnecting...', { 
            isActuallyConnected, 
            isStale, 
            connectionState,
            timeSinceLastUpdate 
          });
          reconnectAttempts.current = 0; // Reset attempts when user returns
          
          // Close existing connection if it's stale or dead
          if (ws && (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED || isStale)) {
            try {
              ws.close();
            } catch (e) {
              // Ignore errors when closing
            }
          }
          
          // Small delay to ensure cleanup, then reconnect
          setTimeout(() => {
            connect();
          }, 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, isConnected, connectionState]);

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
