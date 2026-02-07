'use client';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-[100] py-3 px-4 bg-[#FF1493] text-white font-bold text-center text-sm"
        role="alert"
      >
        You&apos;re offline. Reconnect to trade.
      </div>
      {/* Spacer so content is not hidden behind fixed banner */}
      <div className="h-12" aria-hidden="true" />
    </>
  );
}
