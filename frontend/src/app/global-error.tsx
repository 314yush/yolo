'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/logger';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: 'app/global-error', digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ backgroundColor: '#000000', color: '#FFFFFF' }}>
        <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-12 text-center">
          <div className="brutal-card-losing w-full max-w-sm px-6 py-8">
            <p className="text-[#FF006E] text-xs font-bold uppercase tracking-[0.3em]">
              Total Wipeout
            </p>
            <h1 className="mt-4 text-4xl font-bold uppercase leading-none text-white">
              App
              <br />
              Crashed
            </h1>
            <p className="mt-4 text-sm text-white/50">
              YOLO failed to start. Your funds live on-chain and are unaffected.
            </p>
          </div>

          <button
            onClick={reset}
            className="brutal-button min-h-[44px] w-full max-w-sm touch-manipulation bg-[#CCFF00] px-8 py-4 text-lg font-bold uppercase text-black"
          >
            Reload YOLO
          </button>

          {error.digest ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/25">
              ref {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
