'use client';

import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useLivePricesSync } from '@/hooks/useLivePrices';

/** Routes that need live prices (Avantis feed-v3 SSE, Hermes fallback) in the client store. */
function needsLivePrices(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  if (pathname === '/activity' || pathname.startsWith('/activity/')) return true;
  if (pathname === '/paper' || pathname.startsWith('/paper/')) return true;
  return false;
}

function LivePricesSyncInner() {
  useLivePricesSync();
  return null;
}

/**
 * Mounts live oracle sync when signed in on trading surfaces, or on paper routes (guest).
 */
export function AuthenticatedPriceSync() {
  const { authenticated, ready } = usePrivy();
  const pathname = usePathname();

  const isPaperRoute = pathname === '/paper' || pathname?.startsWith('/paper/');
  const shouldSync = ready && needsLivePrices(pathname) && (authenticated || isPaperRoute);

  if (!shouldSync) {
    return null;
  }

  return <LivePricesSyncInner />;
}
