'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { type Channel } from 'pusher-js';
import { getPusher } from '@/lib/pusherClient';
import { useTradeStore } from '@/store/tradeStore';
import { debug } from '@/lib/debug';

// Event types from Avantis
export type PusherEventType = 
  | 'OrderPickedUpForExecution'
  | 'ExecutionConfirmedInFlashblock'
  | 'OrderFilled'
  | 'OrderCanceled';

/**
 * Avantis OrderFilled payload shape (from real Pusher traffic).
 *
 * Position data lives in the nested `t` object with 10-decimal encoded prices
 * and 6-decimal USDC amounts. Top-level fields provide event metadata.
 * The `open` flag distinguishes trade-open fills from trade-close fills.
 */
export interface OrderFilledRaw {
  eventType?: string;
  eventId?: string;
  trader?: string;
  orderId?: number;
  pairIndex?: number;
  timestamp?: number;
  transactionHash?: string;
  /** true = position opened, false = position closed */
  open?: boolean;
  price?: string;
  positionSizeUSDC?: string;
  percentProfit?: string;
  usdcSentToTrader?: string;
  isPnl?: boolean;
  /** Nested trade struct — contains canonical position data */
  t?: {
    index?: number;
    initialPosToken?: string;
    leverage?: string;
    openPrice?: string;
    pairIndex?: number;
    positionSizeUSDC?: string;
    sl?: string;
    tp?: string;
    trader?: string;
    buy?: boolean;
    timestamp?: number;
  };
}

const PRICE_DECIMALS = 1e10;
const USDC_DECIMALS = 1e6;
const LEVERAGE_DECIMALS = 1e10;

/** Normalized, human-readable fields from an OrderFilled event payload. */
export interface ParsedOrderFilled {
  /** Whether this fill opened a new position (true) or closed one (false). null if unknown. */
  isOpen: boolean | null;
  tradeIndex: number | null;
  pairIndex: number | null;
  /** Canonical open price (human-readable, already divided by 1e10). */
  openPrice: number | null;
  orderId: number | null;
  isLong: boolean | null;
  /** Collateral in USDC (human-readable). */
  collateral: number | null;
  /** Leverage as a multiplier (e.g. 250). */
  leverage: number | null;
  tp: number | null;
  sl: number | null;
  /** Close/mark price for close events (human-readable). */
  closePrice: number | null;
  /** PnL percentage (raw from Avantis, 10-decimal encoded). Decoded to human-readable. */
  percentProfit: number | null;
  /** USDC returned to trader on close (human-readable). */
  usdcSentToTrader: number | null;
  /** Position opened-at timestamp in seconds (from t.timestamp). */
  openedAt: number | null;
  /** Event-level timestamp in seconds. */
  eventTimestamp: number | null;
  transactionHash: string | null;
  raw: unknown;
}

/** Parse the 10-decimal encoded string Avantis uses for prices. Returns null for invalid input. */
function parsePrice(v: unknown): number | null {
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v) / PRICE_DECIMALS;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return v / PRICE_DECIMALS;
  }
  return null;
}

/** Parse Avantis OrderFilled Pusher payload into a normalized shape. */
export function parseOrderFilledPayload(data: unknown): ParsedOrderFilled {
  const d = (data && typeof data === 'object' ? data : {}) as OrderFilledRaw;
  const t = (d.t && typeof d.t === 'object' ? d.t : null);

  const tradeIndex = typeof t?.index === 'number' ? t.index : null;
  const pairIndex = typeof d.pairIndex === 'number' ? d.pairIndex : (typeof t?.pairIndex === 'number' ? t.pairIndex : null);
  const openPrice = parsePrice(t?.openPrice);
  const tp = parsePrice(t?.tp);
  const sl = parsePrice(t?.sl);
  const closePrice = parsePrice(d.price);
  const orderId = typeof d.orderId === 'number' ? d.orderId : null;
  const isLong = typeof t?.buy === 'boolean' ? t.buy : null;
  const isOpen = typeof d.open === 'boolean' ? d.open : null;
  const transactionHash = typeof d.transactionHash === 'string' ? d.transactionHash : null;

  let collateral: number | null = null;
  if (typeof t?.initialPosToken === 'string') {
    const c = Number(t.initialPosToken) / USDC_DECIMALS;
    if (Number.isFinite(c) && c > 0) collateral = c;
  }

  let leverage: number | null = null;
  if (typeof t?.leverage === 'string') {
    const l = Number(t.leverage) / LEVERAGE_DECIMALS;
    if (Number.isFinite(l) && l > 0) leverage = l;
  }

  let percentProfit: number | null = null;
  if (typeof d.percentProfit === 'string' && d.percentProfit.length > 0) {
    const pp = Number(d.percentProfit) / PRICE_DECIMALS;
    if (Number.isFinite(pp)) percentProfit = pp;
  }

  let usdcSentToTrader: number | null = null;
  if (typeof d.usdcSentToTrader === 'string' && d.usdcSentToTrader.length > 0) {
    const u = Number(d.usdcSentToTrader) / USDC_DECIMALS;
    if (Number.isFinite(u) && u >= 0) usdcSentToTrader = u;
  }

  const openedAt = typeof t?.timestamp === 'number' ? t.timestamp : null;
  const eventTimestamp = typeof d.timestamp === 'number' ? d.timestamp : null;

  return {
    isOpen,
    tradeIndex,
    pairIndex,
    openPrice,
    orderId,
    isLong,
    collateral,
    leverage,
    tp,
    sl,
    closePrice,
    percentProfit,
    usdcSentToTrader,
    openedAt,
    eventTimestamp,
    transactionHash,
    raw: data,
  };
}

export interface PusherEvent {
  type: PusherEventType;
  data: unknown;
  timestamp: number;
}

export interface UsePusherEventsReturn {
  isConnected: boolean;
  connectionState: string;
  events: PusherEvent[];
  lastEvent: PusherEvent | null;
  clearEvents: () => void;
  // Confirmation helpers
  hasPickedUp: boolean;
  hasPreconfirmed: boolean;
  hasFilled: boolean;
  hasCanceled: boolean;
  /** Parsed payload of the most recent OrderFilled event (null if none). */
  lastFilledPayload: ParsedOrderFilled | null;
}

/**
 * Runtime validation for Avantis order events.
 * Ensures the payload has the expected shape before processing.
 */
function isValidOrderEvent(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('orderId' in data || 'order_id' in data || 'tradeIndex' in data || 'trade_index' in data)
  );
}

/**
 * Hook for subscribing to Avantis Pusher events for a wallet address.
 * 
 * Avantis broadcasts order lifecycle events via Pusher:
 * - OrderPickedUpForExecution: Keeper bot picked up the order (~100-200ms)
 * - ExecutionConfirmedInFlashblock: Flashblock preconfirmation (~200-400ms)
 * - OrderFilled: Final on-chain confirmation (~500-800ms)
 * - OrderCanceled: Order failed or was rejected
 * 
 * @param walletAddress - The wallet address to subscribe to (user's Privy wallet, not delegate)
 */
const EVENTS_CAP = 50;

export function usePusherEvents(walletAddress?: string | null): UsePusherEventsReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [events, setEvents] = useState<PusherEvent[]>([]);
  const stage = useTradeStore((s) => s.stage);
  const prevStageRef = useRef<string>('idle');

  const channelRef = useRef<Channel | null>(null);

  // Add event to list
  const addEvent = useCallback((type: PusherEventType, data: unknown) => {
    const event: PusherEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    debug(`[Pusher] Event received: ${type}`, data);
    setEvents((prev) => [...prev, event].slice(-50));
  }, []);

  // Clear events (call before starting a new trade)
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Clear events when stage transitions from pnl → idle
  useEffect(() => {
    if (prevStageRef.current === 'pnl' && stage === 'idle') {
      queueMicrotask(() => setEvents([]));
    }
    prevStageRef.current = stage;
  }, [stage]);

  // Connect to Pusher and subscribe to wallet channel
  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    const pusher = getPusher();

    // Connection state handlers
    pusher.connection.bind('connected', () => {
      debug('[Pusher] Connected');
      setIsConnected(true);
      setConnectionState('connected');
    });

    pusher.connection.bind('disconnected', () => {
      debug('[Pusher] Disconnected');
      setIsConnected(false);
      setConnectionState('disconnected');
    });

    pusher.connection.bind('error', (err: Error) => {
      console.error('[Pusher] Connection error:', err);
      setConnectionState('error');
    });

    pusher.connection.bind('state_change', (states: { current: string; previous: string }) => {
      debug(`[Pusher] State change: ${states.previous} -> ${states.current}`);
      setConnectionState(states.current);
    });

    // Subscribe to wallet's event channel
    // IMPORTANT: This should be the USER's wallet address (Privy), not the delegate
    // Avantis sends events to events-{traderAddress} where trader is who the trade is for
    const channelName = `events-${walletAddress}`;
    debug(`[Pusher] Subscribing to channel: ${channelName}`);
    
    const channel = pusher.subscribe(channelName);

    channel.bind('pusher:subscription_succeeded', () => {
      debug(`[Pusher] Successfully subscribed to ${channelName}`);
    });

    channel.bind('pusher:subscription_error', (err: Error) => {
      console.error(`[Pusher] Subscription error for ${channelName}:`, err);
    });

    // Bind to Avantis order events
    channel.bind('OrderPickedUpForExecution', (data: unknown) => {
      if (isValidOrderEvent(data)) {
        addEvent('OrderPickedUpForExecution', data);
      } else {
        debug('[Pusher] Invalid OrderPickedUpForExecution payload, ignoring', data);
      }
    });

    channel.bind('ExecutionConfirmedInFlashblock', (data: unknown) => {
      if (isValidOrderEvent(data)) {
        addEvent('ExecutionConfirmedInFlashblock', data);
      } else {
        debug('[Pusher] Invalid ExecutionConfirmedInFlashblock payload, ignoring', data);
      }
    });

    channel.bind('OrderFilled', (data: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Pusher][DEV] OrderFilled raw payload:', JSON.stringify(data, null, 2));
        console.log('[Pusher][DEV] OrderFilled parsed:', parseOrderFilledPayload(data));
      }
      if (isValidOrderEvent(data)) {
        addEvent('OrderFilled', data);
      } else {
        debug('[Pusher] Invalid OrderFilled payload, ignoring', data);
      }
    });

    channel.bind('OrderCanceled', (data: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Pusher][DEV] OrderCanceled raw payload:', JSON.stringify(data, null, 2));
      }
      if (isValidOrderEvent(data)) {
        addEvent('OrderCanceled', data);
      } else {
        debug('[Pusher] Invalid OrderCanceled payload, ignoring', data);
      }
    });

    channelRef.current = channel;

    // Cleanup
    return () => {
      debug(`[Pusher] Cleaning up, unsubscribing from ${channelName}`);
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      // Do NOT disconnect — singleton manages the connection lifecycle
      channelRef.current = null;
    };
  }, [walletAddress, addEvent]);

  // Compute confirmation states
  const hasPickedUp = events.some(e => e.type === 'OrderPickedUpForExecution');
  const hasPreconfirmed = events.some(e => e.type === 'ExecutionConfirmedInFlashblock');
  const hasFilled = events.some(e => e.type === 'OrderFilled');
  const hasCanceled = events.some(e => e.type === 'OrderCanceled');

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  const lastFilledEvent = [...events].reverse().find(e => e.type === 'OrderFilled');
  const lastFilledPayload = lastFilledEvent
    ? parseOrderFilledPayload(lastFilledEvent.data)
    : null;

  return {
    isConnected,
    connectionState,
    events,
    lastEvent,
    clearEvents,
    hasPickedUp,
    hasPreconfirmed,
    hasFilled,
    hasCanceled,
    lastFilledPayload,
  };
}

/**
 * Hook that automatically connects to Pusher using the user's address from the store.
 * Use this in components that need Pusher events without manually passing the address.
 */
export function useAutoPusherEvents(): UsePusherEventsReturn {
  const { userAddress } = useTradeStore();
  return usePusherEvents(userAddress);
}
