import Pusher from 'pusher-js';

// Avantis Pusher credentials (public — these are Avantis platform credentials, not secrets)
const PUSHER_APP_KEY = 'f86bc7e9919fc938694a';
const PUSHER_CLUSTER = 'mt1';

let instance: Pusher | null = null;

/**
 * Returns a shared Pusher instance. The connection is created once and reused
 * across all hook mounts. Individual hooks subscribe/unsubscribe channels
 * but never kill the underlying connection.
 */
export function getPusher(): Pusher {
  if (!instance) {
    // Enable logging in development
    if (process.env.NODE_ENV === 'development') {
      Pusher.logToConsole = true;
    }

    instance = new Pusher(PUSHER_APP_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
  }
  return instance;
}

/**
 * Disconnect and destroy the singleton. Only call this on app teardown
 * or if you need to force a reconnection.
 */
export function destroyPusher(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
