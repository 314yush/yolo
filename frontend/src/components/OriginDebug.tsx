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
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  if (!origin) return null;

  return (
    <div
      className="fixed bottom-2 left-2 z-[9999] rounded px-2 py-1 font-mono text-[10px] text-white/80 bg-black/80 border border-white/20"
      title="Add this exact URL to Privy Dashboard > Settings > Clients > Default web app client > Allowed origins"
    >
      origin: {origin}
    </div>
  );
}
