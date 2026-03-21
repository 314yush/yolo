'use client';

import { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { debug } from '@/lib/debug';

import { PYTH_FEED_IDS, fetchPythLatestAllParsed } from '@/lib/pythFeeds';

const PYTH_HERMES_BASE = 'https://hermes.pyth.network';
const PYTH_SSE_PATH = '/v2/updates/price/stream';

const REST_POLL_INTERVAL_MS = 2500;
const STALE_CONNECTION_THRESHOLD_MS = 30000;

const FEED_ID_TO_PAIR: Record<string, string> = Object.fromEntries(
  Object.entries(PYTH_FEED_IDS).map(([pair, id]) => [id.toLowerCase().replace(/^0x/, ''), pair])
);

/** Mobile / coarse pointer: Hermes SSE is unreliable — poll REST only. Desktop uses Hermes SSE. */
function pythUseRestInsteadOfSse(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/(iPhone|iPod|iPad|Android)/i.test(navigator.userAgent)) return true;
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return true;
  return false;
}

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

type HermesParsedBody = {
  parsed?: Array<{
    id: string;
    price?: { price: string; conf: string; expo: number; publish_time: number };
  }>;
};

/**
 * Pyth Hermes: **SSE** on desktop, **REST polling** on mobile (iOS/Android / coarse pointer).
 */
export function usePythPrices(): UsePythPricesReturn {
  const [prices, setPrices] = useState<Record<string, PythPrice>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const useRestOnly = useMemo(() => pythUseRestInsteadOfSse(), []);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const restPollInFlightRef = useRef(false);
  const restFailStreakRef = useRef(0);

  const getPrice = useCallback((pair: string): number | null => {
    const priceData = prices[pair];
    return priceData ? priceData.price : null;
  }, [prices]);

  const parsePriceUpdate = useCallback((data: HermesParsedBody) => {
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
      console.error('[PythPrices] Error parsing Hermes update:', err);
    }
  }, []);

  const connectRef = useRef<() => void>(() => {});

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
      } catch {
        /* ignore */
      }
      eventSourceRef.current = null;
    }

    isConnectingRef.current = true;
    setConnectionState('connecting');
    const feedIds = Object.values(PYTH_FEED_IDS);
    const params = new URLSearchParams();
    feedIds.forEach(id => params.append('ids[]', id));
    const url = `${PYTH_HERMES_BASE}${PYTH_SSE_PATH}?${params.toString()}`;
    debug('[PythPrices] Connecting to Hermes SSE...');

    const es = new EventSource(url);

    es.onopen = () => {
      debug('[PythPrices] Hermes SSE connected');
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
        if (es.readyState === EventSource.OPEN && timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD_MS && lastUpdateTime > 0) {
          console.warn(`[PythPrices] Stale Hermes SSE (${timeSinceLastUpdate}ms), reconnecting...`);
          es.close();
        }
      }, 10000);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as HermesParsedBody;
        parsePriceUpdate(data);
      } catch (err) {
        console.error('[PythPrices] Error processing Hermes SSE message:', err);
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
          debug(`[PythPrices] Hermes SSE reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            reconnectTimeoutRef.current = null;
            connectRef.current();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('[PythPrices] Max Hermes SSE reconnection attempts reached');
          setConnectionState('error');
        }
      }
    };

    eventSourceRef.current = es;
  }, [parsePriceUpdate]);

  useLayoutEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Mobile: Hermes REST only
  useEffect(() => {
    if (!useRestOnly) return;

    setConnectionState('connecting');
    debug('[PythPrices] Using Hermes REST polling (mobile)');

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      if (restPollInFlightRef.current) return;
      restPollInFlightRef.current = true;
      try {
        const data = await fetchPythLatestAllParsed();
        if (data?.parsed?.length) {
          parsePriceUpdate(data);
          restFailStreakRef.current = 0;
          setIsConnected(true);
          setConnectionState('connected');
        } else {
          restFailStreakRef.current += 1;
          if (restFailStreakRef.current >= 10) {
            console.error('[PythPrices] Hermes REST polling failed repeatedly');
            setConnectionState('error');
            setIsConnected(false);
          }
        }
      } catch {
        restFailStreakRef.current += 1;
        if (restFailStreakRef.current >= 10) {
          setConnectionState('error');
          setIsConnected(false);
        }
      } finally {
        restPollInFlightRef.current = false;
      }
    };

    void poll();
    const id = window.setInterval(poll, REST_POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void poll();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [parsePriceUpdate, useRestOnly]);

  // Desktop: Hermes SSE
  useEffect(() => {
    if (useRestOnly) return;

    queueMicrotask(() => connect());

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
  }, [connect, useRestOnly]);

  useEffect(() => {
    if (useRestOnly) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const es = eventSourceRef.current;
        const isActuallyConnected = es?.readyState === EventSource.OPEN;
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        const isStale = timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD_MS && lastUpdateTime > 0;

        if ((!isActuallyConnected || isStale || (!isConnected && connectionState !== 'connecting')) && !isConnectingRef.current) {
          debug('[PythPrices] Tab visible, reconnecting Hermes SSE...', {
            isActuallyConnected,
            isStale,
            connectionState,
            timeSinceLastUpdate,
          });
          reconnectAttempts.current = 0;
          if (es && (es.readyState === EventSource.CLOSED || isStale)) {
            try {
              es.close();
            } catch {
              /* ignore */
            }
          }
          setTimeout(() => connect(), 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect, isConnected, connectionState, useRestOnly]);

  useEffect(() => {
    if (useRestOnly) return;

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      reconnectAttempts.current = 0;
      try {
        eventSourceRef.current?.close();
      } catch {
        /* ignore */
      }
      eventSourceRef.current = null;
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      queueMicrotask(() => connectRef.current());
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [useRestOnly]);

  return {
    prices,
    isConnected,
    connectionState,
    getPrice,
    lastUpdate,
  };
}

export function usePythPricesSync(): UsePythPricesReturn {
  const pythPrices = usePythPrices();
  const setPrices = useTradeStore(state => state.setPrices);

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
