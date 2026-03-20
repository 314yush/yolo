'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { ClosedTrade } from '@/types';
import { ShareCard } from '@/components/ShareCard';
import type { ShareCardFormat } from '@/components/ShareCard';
import {
  copyShareCardToClipboard,
  downloadShareCard,
  shareOnX,
  shareViaNativeSheet,
  preRenderShareCard,
} from '@/lib/shareCardExport';
import { Share2, Copy, Download } from 'lucide-react';

interface ShareBottomSheetProps {
  trade: ClosedTrade;
  onClose: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onShareOnX?: (method: 'native' | 'clipboard') => void;
}

const SPRING_CONFIG = { type: 'spring' as const, damping: 32, stiffness: 340 };
const REDUCED_MOTION_CONFIG = { duration: 0.15 };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    queueMicrotask(() => setReduced(mq.matches));
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export function ShareBottomSheet({
  trade,
  onClose,
  onCopy,
  onDownload,
  onShare,
  onShareOnX,
}: ShareBottomSheetProps) {
  const [format, setFormat] = useState<ShareCardFormat>('square');
  const [loading, setLoading] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const reducedMotion = useReducedMotion();

  // Lock body scroll while sheet is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Pre-render blob for the default format on mount
  useEffect(() => {
    preRenderShareCard(trade, format);
  }, [trade, format]);

  // Escape key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const run = async (action: string, fn: () => Promise<void> | void) => {
    if (loading) return;
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  };

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  const hasClipboard =
    typeof navigator !== 'undefined' && !!navigator.clipboard?.write;

  const handleShare = () =>
    run('share', async () => {
      await shareViaNativeSheet(trade, format);
      onShare?.();
    });

  const handleCopy = () =>
    run('copy', async () => {
      await copyShareCardToClipboard(trade, format);
      onCopy?.();
    });

  const handleDownload = () =>
    run('download', async () => {
      await downloadShareCard(trade, format);
      onDownload?.();
    });

  const handleShareOnX = () =>
    run('x', async () => {
      const method = await shareOnX(trade, format);
      onShareOnX?.(method);
    });

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      dismiss();
    }
  };

  const transition = reducedMotion ? REDUCED_MOTION_CONFIG : SPRING_CONFIG;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
          />

          {/* Sheet */}
          <motion.div
            className="relative z-10 bg-[#0B0F14] border-t-2 border-white/8 rounded-t-2xl max-h-[92vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={transition}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            role="dialog"
            aria-modal="true"
            aria-label="Share your trade"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* Format toggle */}
            <div className="flex justify-center gap-2 px-5 py-3">
              {(['square', 'story'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-5 py-1.5 text-xs font-bold font-mono uppercase tracking-wider transition-all touch-manipulation min-h-[36px] ${
                    format === f
                      ? 'bg-[#CCFF00] text-black'
                      : 'bg-white/5 text-white/40 hover:text-white/60 border border-white/8'
                  }`}
                >
                  {f === 'square' ? '1:1' : '4:5'}
                </button>
              ))}
            </div>

            {/* Card preview */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 flex justify-center min-h-0">
              <div
                className={`w-full transition-all duration-200 ${
                  format === 'story' ? 'max-w-[280px]' : 'max-w-[300px]'
                }`}
              >
                <ShareCard
                  trade={trade}
                  format={format}
                  className="rounded-lg overflow-hidden w-full"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div
              className="px-5 space-y-2 shrink-0"
              style={{
                paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {/* Primary row */}
              <div className="flex gap-2">
                {hasNativeShare ? (
                  <button
                    onClick={handleShare}
                    disabled={!!loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 font-bold font-mono uppercase brutal-button bg-[#CCFF00] text-black touch-manipulation min-h-[48px] disabled:opacity-50"
                  >
                    {loading === 'share' ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Share2 className="w-4 h-4" strokeWidth={2.5} />
                    )}
                    <span>SHARE</span>
                  </button>
                ) : (
                  <button
                    onClick={handleDownload}
                    disabled={!!loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 font-bold font-mono uppercase brutal-button bg-[#CCFF00] text-black touch-manipulation min-h-[48px] disabled:opacity-50"
                  >
                    {loading === 'download' ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" strokeWidth={2.5} />
                    )}
                    <span>SAVE</span>
                  </button>
                )}

                {hasClipboard && (
                  <button
                    onClick={handleCopy}
                    disabled={!!loading}
                    className="flex items-center justify-center gap-2 py-3 px-4 font-bold font-mono uppercase brutal-button bg-white/8 text-white border border-white/10 touch-manipulation min-h-[48px] disabled:opacity-50"
                    aria-label="Copy image to clipboard"
                  >
                    {loading === 'copy' ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Copy className="w-4 h-4" strokeWidth={2.5} />
                    )}
                  </button>
                )}

                <button
                  onClick={handleShareOnX}
                  disabled={!!loading}
                  className="flex items-center justify-center gap-2 py-3 px-4 font-bold font-mono uppercase brutal-button bg-white/8 text-white border border-white/10 touch-manipulation min-h-[48px] disabled:opacity-50"
                  aria-label="Share on X"
                >
                  <span className="text-base leading-none">𝕏</span>
                </button>
              </div>

              {/* Done */}
              <button
                onClick={dismiss}
                className="w-full py-2.5 text-xs font-bold font-mono uppercase text-white/30 hover:text-white/50 transition-colors touch-manipulation min-h-[40px]"
              >
                DONE
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
