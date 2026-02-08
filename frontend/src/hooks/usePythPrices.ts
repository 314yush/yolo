'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { debug } from '@/lib/debug';

// Pyth Hermes SSE streaming endpoint (WebSocket at /ws is NOT part of Hermes API)
const PYTH_HERMES_BASE = 'https://hermes.pyth.network';
const PYTH_SSE_PATH = '/v2/updates/price/stream';

// Pyth price feed IDs for supported assets (mainnet)
// These are the canonical feed IDs from Pyth
const PYTH_FEED_IDS: Record<string, string> = {
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'XRP/USD': '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
  // Commodities - XAU (Gold) and XAG (Silver)
  'XAU/USD': '0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
  'XAG/USD': '0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
};

// Reverse mapping for quick lookup (strip 0x for matching - Hermes returns id without 0x)
const FEED_ID_TO_PAIR: Record<string, string> = Object.fromEntries(
  Object.entries(PYTH_FEED_IDS).map(([pair, id]) => [id.toLowerCase().replace(/^0x/, ''), pair])
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
 * Hook for streaming real-time prices from Pyth Network via SSE.
 *
 * Hermes provides streaming via Server-Sent Events at /v2/updates/price/stream.
 * The legacy WebSocket endpoint (wss://hermes.pyth.network/ws) is NOT part of
 * the Hermes API and will fail to connect.
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

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const STALE_CONNECTION_THRESHOLD = 30000; // 30 seconds without updates = stale

  // Get price for a pair
  const getPrice = useCallback((pair: string): number | null => {
    const priceData = prices[pair];
    return priceData ? priceData.price : null;
  }, [prices]);

  // Parse Hermes SSE price update (parsed format from /v2/updates/price/stream)
  const parsePriceUpdate = useCallback((data: { parsed?: Array<{ id: string; price?: { price: string; conf: string; expo: number; publish_time: number } }> }): void => {
    try {
      if (!data.parsed || !Array.isArray(data.parsed)) return;

      for (const item of data.parsed) {
        if (!item?.price) continue;
        const feedId = (item.id || '').toLowerCase().replace(/^0x/, '');
        const pair = FEED_ID_TO_PAIR[feedId];
        if (!pair) continue;

        const price = parseFloat(item.price.price);
        const expo = item.price.expo ?? -8;
        const confidence = parseFloat(item.price.conf || '0');
        const timestamp = (item.price.publish_time || 0) * 1000;

        const adjustedPrice = price * Math.pow(10, expo);
        const adjustedConfidence = confidence * Math.pow(10, expo);

        setPrices(prev => ({
          ...prev,
          [pair]: {
            price: adjustedPrice,
            confidence: adjustedConfidence,
            timestamp,
            expo,
          },
        }));

        const now = Date.now();
        setLastUpdate(now);
        lastUpdateRef.current = now;
      }
    } catch (err) {
      console.error('[PythPrices] Error parsing price update:', err);
    }
  }, []);

  // Connect to Pyth Hermes SSE stream
  const connect = useCallback(() => {
    const currentEs = eventSourceRef.current;
    if (currentEs?.readyState === EventSource.OPEN) return;
    if (isConnectingRef.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (currentEs) {
      try {
        currentEs.close();
      } catch (e) {
        /* ignore */
      }
      eventSourceRef.current = null;
    }

    isConnectingRef.current = true;
    setConnectionState('connecting');
    debug('[PythPrices] Connecting to Pyth Hermes SSE...');

    const feedIds = Object.values(PYTH_FEED_IDS);
    const params = new URLSearchParams();
    feedIds.forEach(id => params.append('ids[]', id));
    const url = `${PYTH_HERMES_BASE}${PYTH_SSE_PATH}?${params.toString()}`;

    const es = new EventSource(url);

    es.onopen = () => {
      debug('[PythPrices] Connected to Pyth Hermes SSE');
      isConnectingRef.current = false;
      setIsConnected(true);
      setConnectionState('connected');
      reconnectAttempts.current = 0;

      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
      healthCheckIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        if (es.readyState === EventSource.OPEN && timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD && lastUpdateTime > 0) {
          console.warn(`[PythPrices] Stale connection detected (${timeSinceLastUpdate}ms since last update), reconnecting...`);
          es.close();
        }
      }, 10000);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        parsePriceUpdate(data);
      } catch (err) {
        console.error('[PythPrices] Error processing message:', err);
      }
    };

    es.onerror = () => {
      isConnectingRef.current = false;
      setIsConnected(false);
      setConnectionState('disconnected');
      es.close();
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current);
          healthCheckIntervalRef.current = null;
        }
        if (!reconnectTimeoutRef.current && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          debug(`[PythPrices] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
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

    eventSourceRef.current = es;
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [connect]);

  // Reconnect on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const es = eventSourceRef.current;
        const isActuallyConnected = es?.readyState === EventSource.OPEN;
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        const isStale = timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD && lastUpdateTime > 0;

        if ((!isActuallyConnected || isStale || (!isConnected && connectionState !== 'connecting')) && !isConnectingRef.current) {
          debug('[PythPrices] Tab visible, reconnecting...', {
            isActuallyConnected,
            isStale,
            connectionState,
            timeSinceLastUpdate,
          });
          reconnectAttempts.current = 0;
          if (es && (es.readyState === EventSource.CLOSED || isStale)) {
            try {
              es.close();
            } catch (e) {
              /* ignore */
            }
          }
          setTimeout(() => connect(), 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
