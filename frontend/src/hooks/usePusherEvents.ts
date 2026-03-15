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
      setEvents([]);
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
      if (isValidOrderEvent(data)) {
        addEvent('OrderFilled', data);
      } else {
        debug('[Pusher] Invalid OrderFilled payload, ignoring', data);
      }
    });

    channel.bind('OrderCanceled', (data: unknown) => {
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
