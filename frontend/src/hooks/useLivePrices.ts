'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { debug } from '@/lib/debug';

import { HERMES_FEED_IDS, fetchHermesLatestAllParsed } from '@/lib/hermesFeeds';
import {
  getAvantisV3StreamUrl,
  AVANTIS_V3_SSE_EVENT,
  AVANTIS_V3_PAIR_BY_FEED_ID,
  type AvantisV3PriceUpdatePayload,
} from '@/lib/avantisRealtimeFeed';

const HERMES_API_BASE = 'https://hermes.pyth.network';
const HERMES_SSE_PATH = '/v2/updates/price/stream';

const REST_POLL_INTERVAL_MS = 2500;
const STALE_CONNECTION_THRESHOLD_MS = 30000;
const SSE_REST_COMPLEMENT_AFTER_MS = 10000;
const SSE_REST_COMPLEMENT_TICK_MS = 4000;

const HERMES_FEED_ID_TO_PAIR: Record<string, string> = Object.fromEntries(
  Object.entries(HERMES_FEED_IDS).map(([pair, id]) => [id.toLowerCase().replace(/^0x/, ''), pair])
);

function hermesUseRestInsteadOfSse(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/(iPhone|iPod|iPad|Android)/i.test(navigator.userAgent)) return true;
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return true;
  return false;
}

export interface LiveMark {
  price: number;
  confidence: number;
  timestamp: number;
  expo: number;
}

export interface UseLivePricesReturn {
  prices: Record<string, LiveMark>;
  isConnected: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  getPrice: (pair: string) => number | null;
  lastUpdate: number | null;
  priceSource: 'avantis' | 'hermes';
}

type HermesParsedBody = {
  parsed?: Array<{
    id: string;
    price?: { price: string; conf: string; expo: number; publish_time: number };
  }>;
};

/**
 * Live prices: **Avantis feed-v3 SSE** (primary), **Hermes** (fallback).
 */
export function useLivePrices(): UseLivePricesReturn {
  const [prices, setPrices] = useState<Record<string, LiveMark>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [priceSource, setPriceSource] = useState<'avantis' | 'hermes'>('avantis');

  const useRestOnly = useMemo(() => hermesUseRestInsteadOfSse(), []);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const restPollInFlightRef = useRef(false);
  const restFailStreakRef = useRef(0);
  const sseComplementInFlightRef = useRef(false);
  /** Per-pair feedUpdateTimestamp (µs) — Avantis stream merge */
  const avantisLastUsRef = useRef<Record<string, number>>({});

  const getPrice = useCallback((pair: string): number | null => {
    const priceData = prices[pair];
    return priceData ? priceData.price : null;
  }, [prices]);

  const applyAvantisUpdate = useCallback((payload: AvantisV3PriceUpdatePayload) => {
    const feeds = payload.priceFeeds;
    if (!Array.isArray(feeds)) return;

    const lastUs = avantisLastUsRef.current;
    const updates: Record<string, LiveMark> = {};

    for (const row of feeds) {
      const pair = AVANTIS_V3_PAIR_BY_FEED_ID[row.priceFeedId];
      if (!pair) continue;

      const tsUs = Number(row.feedUpdateTimestamp);
      if (!Number.isFinite(tsUs)) continue;
      if (tsUs < (lastUs[pair] ?? 0)) continue;

      const expo = row.exponent ?? -8;
      const mantissa = parseFloat(String(row.price));
      if (!Number.isFinite(mantissa)) continue;

      const price = mantissa * Math.pow(10, expo);
      if (!(price > 0)) continue;

      const confRaw = Number(row.confidence);
      const confidence = Number.isFinite(confRaw) ? confRaw * Math.pow(10, expo) : 0;
      const tsMs = Math.floor(tsUs / 1000);

      lastUs[pair] = tsUs;
      updates[pair] = {
        price,
        confidence,
        timestamp: tsMs,
        expo,
      };
    }

    if (Object.keys(updates).length === 0) return;

    const now = Date.now();
    setPrices(prev => {
      const next = { ...prev };
      for (const [pair, p] of Object.entries(updates)) {
        next[pair] = p;
      }
      return next;
    });
    setLastUpdate(now);
    lastUpdateRef.current = now;
  }, []);

  const parseHermesPriceUpdate = useCallback((data: HermesParsedBody) => {
    try {
      if (!data.parsed || !Array.isArray(data.parsed)) return;

      for (const item of data.parsed) {
        if (!item?.price) continue;
        const feedId = (item.id || '').toLowerCase().replace(/^0x/, '');
        const pair = HERMES_FEED_ID_TO_PAIR[feedId];
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
      console.error('[LivePrices] Error parsing Hermes update:', err);
    }
  }, []);

  const connectHermesRef = useRef<() => void>(() => {});

  const connectHermes = useCallback(() => {
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
    const feedIds = Object.values(HERMES_FEED_IDS);
    const params = new URLSearchParams();
    feedIds.forEach(id => params.append('ids[]', id));
    const url = `${HERMES_API_BASE}${HERMES_SSE_PATH}?${params.toString()}`;
    debug('[LivePrices] Connecting to Hermes SSE (fallback)...');

    const es = new EventSource(url);

    es.onopen = () => {
      debug('[LivePrices] Hermes SSE connected');
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
          console.warn(`[LivePrices] Stale Hermes SSE (${timeSinceLastUpdate}ms), reconnecting...`);
          es.close();
        }
      }, 10000);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as HermesParsedBody;
        parseHermesPriceUpdate(data);
      } catch (err) {
        console.error('[LivePrices] Error processing Hermes SSE message:', err);
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
          debug(`[LivePrices] Hermes SSE reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            reconnectTimeoutRef.current = null;
            connectHermesRef.current();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('[LivePrices] Max Hermes SSE reconnection attempts reached');
          setConnectionState('error');
        }
      }
    };

    eventSourceRef.current = es;
  }, [parseHermesPriceUpdate]);

  const connectAvantisRef = useRef<() => void>(() => {});

  const connectAvantis = useCallback(() => {
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
    const url = getAvantisV3StreamUrl();
    debug('[LivePrices] Connecting to Avantis feed-v3 SSE...');

    const es = new EventSource(url);

    const onPriceUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as AvantisV3PriceUpdatePayload;
        applyAvantisUpdate(payload);
      } catch (err) {
        console.error('[LivePrices] Error processing Avantis price_update:', err);
      }
    };

    es.addEventListener(AVANTIS_V3_SSE_EVENT, onPriceUpdate);

    es.onopen = () => {
      debug('[LivePrices] Avantis SSE connected');
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
          console.warn(`[LivePrices] Stale Avantis SSE (${timeSinceLastUpdate}ms), reconnecting...`);
          es.close();
        }
      }, 10000);
    };

    es.onerror = () => {
      isConnectingRef.current = false;
      setIsConnected(false);
      setConnectionState('disconnected');
      es.removeEventListener(AVANTIS_V3_SSE_EVENT, onPriceUpdate);
      es.close();
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current);
          healthCheckIntervalRef.current = null;
        }

        reconnectAttempts.current += 1;
        if (reconnectAttempts.current > maxReconnectAttempts) {
          console.warn('[LivePrices] Avantis SSE failed — falling back to Hermes');
          setPriceSource('hermes');
          reconnectAttempts.current = 0;
          return;
        }

        if (!reconnectTimeoutRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          debug(`[LivePrices] Avantis SSE reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectAvantisRef.current();
          }, delay);
        }
      }
    };

    eventSourceRef.current = es;
  }, [applyAvantisUpdate]);

  useLayoutEffect(() => {
    connectHermesRef.current = connectHermes;
  }, [connectHermes]);

  useLayoutEffect(() => {
    connectAvantisRef.current = connectAvantis;
  }, [connectAvantis]);

  // Hermes mobile REST
  useEffect(() => {
    if (priceSource !== 'hermes' || !useRestOnly) return;

    setConnectionState('connecting');
    debug('[LivePrices] Hermes REST polling (mobile)');

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      if (restPollInFlightRef.current) return;
      restPollInFlightRef.current = true;
      try {
        const data = await fetchHermesLatestAllParsed();
        if (data?.parsed?.length) {
          parseHermesPriceUpdate(data);
          restFailStreakRef.current = 0;
          setIsConnected(true);
          setConnectionState('connected');
        } else {
          restFailStreakRef.current += 1;
          if (restFailStreakRef.current >= 10) {
            console.error('[LivePrices] Hermes REST polling failed repeatedly');
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
  }, [priceSource, parseHermesPriceUpdate, useRestOnly]);

  // Avantis SSE (desktop + mobile — same stream)
  useEffect(() => {
    if (priceSource !== 'avantis') return;

    queueMicrotask(() => connectAvantis());

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      const es = eventSourceRef.current;
      if (es) {
        es.close();
        eventSourceRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [connectAvantis, priceSource]);

  // Hermes desktop SSE
  useEffect(() => {
    if (priceSource !== 'hermes' || useRestOnly) return;

    queueMicrotask(() => connectHermes());

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
  }, [connectHermes, priceSource, useRestOnly]);

  // Hermes desktop: REST complement
  useEffect(() => {
    if (priceSource !== 'hermes' || useRestOnly) return;

    const complement = async () => {
      if (document.visibilityState !== 'visible') return;
      const es = eventSourceRef.current;
      if (!es || es.readyState !== EventSource.OPEN) return;
      const last = lastUpdateRef.current ?? 0;
      if (last === 0) return;
      const age = Date.now() - last;
      if (age < SSE_REST_COMPLEMENT_AFTER_MS) return;
      if (sseComplementInFlightRef.current) return;
      sseComplementInFlightRef.current = true;
      try {
        const data = await fetchHermesLatestAllParsed();
        if (data?.parsed?.length) {
          parseHermesPriceUpdate(data);
          debug('[LivePrices] Hermes SSE quiet; applied REST complement');
        }
      } catch {
        /* ignore */
      } finally {
        sseComplementInFlightRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      void complement();
    }, SSE_REST_COMPLEMENT_TICK_MS);
    return () => clearInterval(id);
  }, [priceSource, useRestOnly, parseHermesPriceUpdate]);

  // Avantis: Hermes REST complement when stream goes quiet
  useEffect(() => {
    if (priceSource !== 'avantis') return;

    const complement = async () => {
      if (document.visibilityState !== 'visible') return;
      const es = eventSourceRef.current;
      if (!es || es.readyState !== EventSource.OPEN) return;
      const last = lastUpdateRef.current ?? 0;
      if (last === 0) return;
      const age = Date.now() - last;
      if (age < SSE_REST_COMPLEMENT_AFTER_MS) return;
      if (sseComplementInFlightRef.current) return;
      sseComplementInFlightRef.current = true;
      try {
        const data = await fetchHermesLatestAllParsed();
        if (data?.parsed?.length) {
          parseHermesPriceUpdate(data);
          debug('[LivePrices] Avantis SSE quiet; applied Hermes REST complement');
        }
      } catch {
        /* ignore */
      } finally {
        sseComplementInFlightRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      void complement();
    }, SSE_REST_COMPLEMENT_TICK_MS);
    return () => clearInterval(id);
  }, [priceSource, parseHermesPriceUpdate]);

  // Visibility — Avantis
  useEffect(() => {
    if (priceSource !== 'avantis') return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const es = eventSourceRef.current;
        const isActuallyConnected = es?.readyState === EventSource.OPEN;
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        const isStale = timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD_MS && lastUpdateTime > 0;

        if ((!isActuallyConnected || isStale || (!isConnected && connectionState !== 'connecting')) && !isConnectingRef.current) {
          debug('[LivePrices] Tab visible, reconnecting Avantis SSE...');
          reconnectAttempts.current = 0;
          if (es && (es.readyState === EventSource.CLOSED || isStale)) {
            try {
              es.close();
            } catch {
              /* ignore */
            }
          }
          setTimeout(() => connectAvantis(), 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connectAvantis, isConnected, connectionState, priceSource]);

  // Visibility — Hermes desktop
  useEffect(() => {
    if (priceSource !== 'hermes' || useRestOnly) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const es = eventSourceRef.current;
        const isActuallyConnected = es?.readyState === EventSource.OPEN;
        const now = Date.now();
        const lastUpdateTime = lastUpdateRef.current ?? 0;
        const timeSinceLastUpdate = now - lastUpdateTime;
        const isStale = timeSinceLastUpdate > STALE_CONNECTION_THRESHOLD_MS && lastUpdateTime > 0;

        if ((!isActuallyConnected || isStale || (!isConnected && connectionState !== 'connecting')) && !isConnectingRef.current) {
          debug('[LivePrices] Tab visible, reconnecting Hermes SSE...');
          reconnectAttempts.current = 0;
          if (es && (es.readyState === EventSource.CLOSED || isStale)) {
            try {
              es.close();
            } catch {
              /* ignore */
            }
          }
          setTimeout(() => connectHermes(), 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connectHermes, isConnected, connectionState, priceSource, useRestOnly]);

  // pageshow — Avantis
  useEffect(() => {
    if (priceSource !== 'avantis') return;

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
      queueMicrotask(() => connectAvantisRef.current());
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [priceSource]);

  // pageshow — Hermes
  useEffect(() => {
    if (priceSource !== 'hermes' || useRestOnly) return;

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
      queueMicrotask(() => connectHermesRef.current());
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [priceSource, useRestOnly]);

  return {
    prices,
    isConnected,
    connectionState,
    getPrice,
    lastUpdate,
    priceSource,
  };
}

export function useLivePricesSync(): UseLivePricesReturn {
  const livePrices = useLivePrices();
  const setPrices = useTradeStore(state => state.setPrices);

  useLayoutEffect(() => {
    if (Object.keys(livePrices.prices).length > 0) {
      const storePrices: Record<string, { price: number; timestamp: number }> = {};

      for (const [pair, data] of Object.entries(livePrices.prices)) {
        storePrices[pair] = {
          price: data.price,
          timestamp: data.timestamp,
        };
      }

      setPrices(storePrices);
    }
  }, [livePrices.prices, setPrices]);

  return livePrices;
}
