'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Pusher, { Channel } from 'pusher-js';
import { useTradeStore } from '@/store/tradeStore';

// Avantis Pusher credentials (public)
const PUSHER_APP_KEY = 'f86bc7e9919fc938694a';
const PUSHER_CLUSTER = 'mt1';

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
export function usePusherEvents(walletAddress?: string | null): UsePusherEventsReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [events, setEvents] = useState<PusherEvent[]>([]);
  
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);

  // Add event to list
  const addEvent = useCallback((type: PusherEventType, data: unknown) => {
    const event: PusherEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    console.log(`[Pusher] Event received: ${type}`, data);
    setEvents(prev => [...prev, event]);
  }, []);

  // Clear events (call before starting a new trade)
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Connect to Pusher and subscribe to wallet channel
  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    // Enable Pusher logging in development
    if (process.env.NODE_ENV === 'development') {
      Pusher.logToConsole = true;
    }

    // Create Pusher instance
    const pusher = new Pusher(PUSHER_APP_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });

    // Connection state handlers
    pusher.connection.bind('connected', () => {
      console.log('[Pusher] Connected');
      setIsConnected(true);
      setConnectionState('connected');
    });

    pusher.connection.bind('disconnected', () => {
      console.log('[Pusher] Disconnected');
      setIsConnected(false);
      setConnectionState('disconnected');
    });

    pusher.connection.bind('error', (err: Error) => {
      console.error('[Pusher] Connection error:', err);
      setConnectionState('error');
    });

    pusher.connection.bind('state_change', (states: { current: string; previous: string }) => {
      console.log(`[Pusher] State change: ${states.previous} -> ${states.current}`);
      setConnectionState(states.current);
    });

    // Subscribe to wallet's event channel
    // IMPORTANT: This should be the USER's wallet address (Privy), not the delegate
    // Avantis sends events to events-{traderAddress} where trader is who the trade is for
    const channelName = `events-${walletAddress}`;
    console.log(`[Pusher] Subscribing to channel: ${channelName}`);
    
    const channel = pusher.subscribe(channelName);

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[Pusher] Successfully subscribed to ${channelName}`);
    });

    channel.bind('pusher:subscription_error', (err: Error) => {
      console.error(`[Pusher] Subscription error for ${channelName}:`, err);
    });

    // Bind to Avantis order events
    channel.bind('OrderPickedUpForExecution', (data: unknown) => {
      addEvent('OrderPickedUpForExecution', data);
    });

    channel.bind('ExecutionConfirmedInFlashblock', (data: unknown) => {
      addEvent('ExecutionConfirmedInFlashblock', data);
    });

    channel.bind('OrderFilled', (data: unknown) => {
      addEvent('OrderFilled', data);
    });

    channel.bind('OrderCanceled', (data: unknown) => {
      addEvent('OrderCanceled', data);
    });

    pusherRef.current = pusher;
    channelRef.current = channel;

    // Cleanup
    return () => {
      console.log(`[Pusher] Cleaning up, unsubscribing from ${channelName}`);
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
      pusherRef.current = null;
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
