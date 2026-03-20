'use client';

import React, { useState } from 'react';
import type { ClosedTrade } from '@/types';
import { ShareCard } from '@/components/ShareCard';
import {
  copyShareCardToClipboard,
  downloadShareCard,
  openShareOnX,
  shareViaNativeSheet,
} from '@/lib/shareCardExport';

interface ShareCardModalProps {
  trade: ClosedTrade;
  onClose: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onShareOnX?: () => void;
}

export function ShareCardModal({
  trade,
  onClose,
  onCopy,
  onDownload,
  onShare,
  onShareOnX,
}: ShareCardModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (action: string, fn: () => Promise<void> | void) => {
    if (loading) return;
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  };

  const handleCopy = () =>
    run('copy', async () => {
      await copyShareCardToClipboard(trade);
      onCopy?.();
    });

  const handleDownload = () =>
    run('download', async () => {
      await downloadShareCard(trade);
      onDownload?.();
    });

  const handleShare = () =>
    run('share', async () => {
      await shareViaNativeSheet(trade);
      onShare?.();
    });

  const handleShareOnX = async () => {
    if (hasClipboard) {
      try {
        await copyShareCardToClipboard(trade);
        onCopy?.();
      } catch {
        // Ignore copy failure
      }
    }
    openShareOnX();
    onShareOnX?.();
  };

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  const hasClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.write;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 safe-area-inset animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-title"
    >
      <div className="flex flex-col items-center gap-5 w-full max-w-[420px] animate-fade-in">
        <h2 id="share-card-title" className="sr-only">
          Share your trade
        </h2>
        {/* Frame: neo-brutalist border + inner mat */}
        <div
          className="relative w-full max-w-[400px] p-2 sm:p-3 rounded-lg"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.3) 100%)',
            border: '4px solid #CCFF00',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.6), 4px 4px 0 rgba(0,0,0,0.8)',
          }}
        >
          <ShareCard
            trade={trade}
            className="rounded-md overflow-hidden block w-full"
          />
        </div>

        <div className="flex flex-col gap-3 w-full">
          {/* Primary actions row */}
          <div className="flex gap-2">
            {hasClipboard && (
              <button
                onClick={handleCopy}
                disabled={!!loading}
                className="flex-1 py-3 px-4 font-bold font-mono uppercase brutal-button bg-white/10 text-white border-2 border-white/30 touch-manipulation min-h-[48px] disabled:opacity-60"
                aria-label="Copy image"
              >
                {loading === 'copy' ? '…' : 'COPY'}
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={!!loading}
              className="flex-1 py-3 px-4 font-bold font-mono uppercase brutal-button bg-white/10 text-white border-2 border-white/30 touch-manipulation min-h-[48px] disabled:opacity-60"
              aria-label="Download image"
            >
              {loading === 'download' ? '…' : 'DOWNLOAD'}
            </button>
            {hasNativeShare && (
              <button
                onClick={handleShare}
                disabled={!!loading}
                className="flex-1 py-3 px-4 font-bold font-mono uppercase brutal-button bg-white/10 text-white border-2 border-white/30 touch-manipulation min-h-[48px] disabled:opacity-60"
                aria-label="Share via system"
              >
                {loading === 'share' ? '…' : 'SHARE'}
              </button>
            )}
            <button
              onClick={handleShareOnX}
              className="flex-1 py-3 px-4 font-bold font-mono uppercase brutal-button bg-black text-white border-2 border-white/40 touch-manipulation min-h-[48px] hover:bg-white/10"
              aria-label="Share on X"
            >
              𝕏
            </button>
          </div>

          {/* DONE - full width */}
          <button
            onClick={onClose}
            className="w-full py-3 px-4 font-bold font-mono uppercase brutal-button bg-[#CCFF00] text-black touch-manipulation min-h-[48px]"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
