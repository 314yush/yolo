'use client';

import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useLivePricesSync } from '@/hooks/useLivePrices';

/** Routes that need live prices (Avantis feed-v3 SSE, Hermes fallback) in the client store. */
function needsLivePrices(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  return pathname === '/activity' || pathname.startsWith('/activity/');
}

function LivePricesSyncInner() {
  useLivePricesSync();
  return null;
}

/**
 * Mounts live oracle sync only when the user is signed in and on a trading surface.
 * Avoids price traffic on landing and static pages (privacy, terms, settings).
 */
export function AuthenticatedPriceSync() {
  const { authenticated, ready } = usePrivy();
  const pathname = usePathname();

  if (!ready || !authenticated || !needsLivePrices(pathname)) {
    return null;
  }

  return <LivePricesSyncInner />;
}
