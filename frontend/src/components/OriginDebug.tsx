'use client';

import { useEffect, useState } from 'react';

/**
 * Temporary: shows the browser's reported origin so you can add it to Privy Dashboard
 * if you see "Origin not allowed" or CSP framing errors.
 * Remove this component after Privy is working.
 */
export function OriginDebug() {
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    queueMicrotask(() => {
      setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    });
  }, []);

  if (!origin) return null;

  const needsHttps =
    process.env.NODE_ENV === 'development' && origin.startsWith('http://');

  return (
    <div className="fixed bottom-2 left-2 z-[9999] max-w-[min(100vw-1rem,20rem)] space-y-1">
      <div
        className="rounded px-2 py-1 font-mono text-[10px] text-white/80 bg-black/80 border border-white/20"
        title="Add this exact URL to Privy Dashboard > Settings > Clients > Default web app client > Allowed origins"
      >
        origin: {origin}
      </div>
      {needsHttps && (
        <div
          className="rounded px-2 py-1 font-mono text-[10px] text-amber-200/95 bg-amber-950/90 border border-amber-600/40"
          title="Privy embedded wallets require HTTPS outside localhost"
        >
          Privy needs HTTPS on device. Tunnel:{' '}
          <code className="text-[9px] break-all">cloudflared tunnel --url http://localhost:3000</code>
          — then add the https://… URL to Privy allowed origins.
        </div>
      )}
    </div>
  );
}
