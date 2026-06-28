'use client';

import Link from 'next/link';
import React, { useCallback, useMemo } from 'react';
import { motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { BookOpen, FileText } from 'lucide-react';
import { ASSETS } from '@/lib/constants';

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const EASE_SMOOTH = [0.22, 1, 0.36, 1] as const;
const BG = '#050505';

// --- Background Layer ---
function BackgroundLayer({
  parallaxX,
  parallaxY,
}: {
  parallaxX: MotionValue<number>;
  parallaxY: MotionValue<number>;
}) {
  return (
    <div
      className="absolute inset-0 -z-10"
      style={{
        background: BG,
        backgroundImage: `
          radial-gradient(ellipse 120% 80% at 50% 25%, rgba(198,255,0,0.12), transparent 55%),
          radial-gradient(circle at 50% 30%, rgba(198,255,0,0.08), transparent 50%)
        `,
      }}
    >
      {/* Vignette - focus toward center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 45%, transparent 40%, rgba(0,0,0,0.4) 100%)',
        }}
      />
      {/* Grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Faint green particle dust */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 85%, rgba(198,255,0,0.15) 0%, transparent 45%),
            radial-gradient(circle at 85% 15%, rgba(178,255,0,0.1) 0%, transparent 40%)`,
        }}
      />
      {/* Floating coin silhouettes - subtle, parallax */}
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{ x: parallaxX, y: parallaxY }}
      >
        {useMemo(
          () =>
            [...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full border border-[#C6FF00]/20 opacity-[0.04]"
                style={{
                  width: 28 + i * 8,
                  height: 28 + i * 8,
                  left: `${12 + (i * 19) % 75}%`,
                  top: `${18 + ((i * 7) % 5) * 18}%`,
                  boxShadow: 'inset 0 0 12px rgba(198,255,0,0.1)',
                }}
              />
            )),
          []
        )}
      </motion.div>
      {/* Spark particles drifting up */}
      <div className="absolute inset-0 overflow-hidden">
        {useMemo(() =>
          [...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-[#C6FF00]"
              style={{
                left: `${5 + (i * 7) % 90}%`,
                bottom: '-10%',
                opacity: 0.15 + (i % 3) * 0.05,
                boxShadow: '0 0 6px rgba(198,255,0,0.5)',
              }}
              animate={{
                y: [-20, -120],
                opacity: [0.2, 0],
              }}
              transition={{
                duration: 4 + (i % 3),
                repeat: Infinity,
                delay: i * 0.4,
              }}
            />
          )),
        []
        )}
      </div>
    </div>
  );
}

// --- Inline crypto icons with fill for reliable brand colors (avoids mask quirks in foreignObject) ---
const CRYPTO_ICONS: Record<string, React.ReactNode> = {
  ETH: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.37 4.35z" />
      <path d="M11.944 0L4.58 12.22l7.364 4.353 7.365-4.354L11.943 0z" />
    </svg>
  ),
  BTC: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z" />
    </svg>
  ),
  SOL: (
    <svg viewBox="0 0 397.7 311.7" fill="currentColor" className="w-full h-full">
      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" />
      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" />
      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" />
    </svg>
  ),
};

// --- Premium Wheel: Semi-circle, 5 assets in fixed order ---
const WHEEL_ASSETS = ['ETH', 'XAG', 'BTC', 'SOL', 'XAU'] as const;

function PremiumWheel() {
  const SEGMENTS = useMemo(
    () => WHEEL_ASSETS.map((name) => ASSETS.find((a) => a.name === name)!),
    []
  );
  const segmentCount = SEGMENTS.length;
  const iconSize = segmentCount <= 6 ? 16 : 14;

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Semi-circle wheel container - responsive for mobile, tablet, web */}
      <div
        className="relative overflow-hidden w-[min(90vw,340px)] h-[min(45vw,170px)] md:w-[min(85vw,420px)] md:h-[min(42vw,210px)] lg:w-[min(75vw,480px)] lg:h-[min(38vw,240px)]"
      >
        <svg
          viewBox="0 0 200 110"
          preserveAspectRatio="xMidYMax meet"
          className="w-full h-full"
          style={{
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4)) drop-shadow(0 0 40px rgba(198,255,0,0.12))',
          }}
        >
          <defs>
            {/* Clip to show only top half of circle */}
            <clipPath id="wheel-semicircle-clip">
              <path d="M 4 100 A 96 96 0 0 1 100 4 A 96 96 0 0 1 196 100 L 100 100 Z" />
            </clipPath>
            <radialGradient id="wheel-inner-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(198,255,0,0.18)" />
              <stop offset="70%" stopColor="rgba(198,255,0,0.04)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="wheel-rim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C6FF00" />
              <stop offset="50%" stopColor="#B2FF00" />
              <stop offset="100%" stopColor="#9FE000" />
            </linearGradient>
          </defs>
          <g clipPath="url(#wheel-semicircle-clip)">
            {/* Outer glow ring */}
            <circle cx="100" cy="100" r="96" fill="none" stroke="url(#wheel-rim)" strokeWidth="4" opacity="0.9" />
            <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(198,255,0,0.3)" strokeWidth="1" />
            <path d="M 30 60 Q 100 42 170 60" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="100" cy="100" r="88" fill="url(#wheel-inner-glow)" />
            <circle cx="100" cy="100" r="88" fill="#0a0a0a" fillOpacity="0.85" />
            {/* Segment dividers - radial lines between each asset */}
            {(() => {
              const arcStart = 210;
              const arcEnd = 330;
              const arcSpan = arcEnd - arcStart;
              const step = segmentCount > 1 ? arcSpan / (segmentCount - 1) : 0;
              const innerR = 52;
              const outerR = 78;
              return [...Array(segmentCount - 1)].map((_, i) => {
                const angleDeg = arcStart + (i + 0.5) * step;
                const rad = (angleDeg * Math.PI) / 180;
                const x1 = 100 + innerR * Math.cos(rad);
                const y1 = 100 + innerR * Math.sin(rad);
                const x2 = 100 + outerR * Math.cos(rad);
                const y2 = 100 + outerR * Math.sin(rad);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(198,255,0,0.45)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                );
              });
            })()}
            {/* Asset icons - narrower arc (210°–330°) for tighter spacing */}
            {SEGMENTS.map((asset, i) => {
              const arcStart = 210;
              const arcEnd = 330;
              const arcSpan = arcEnd - arcStart;
              const step = segmentCount > 1 ? arcSpan / (segmentCount - 1) : 0;
              const angle = arcStart + i * step;
              const textRadius = 78;
              const cx = 100 + textRadius * Math.cos((angle * Math.PI) / 180);
              const cy = 100 + textRadius * Math.sin((angle * Math.PI) / 180);
              const size = iconSize;
              return (
                <g key={asset.name} transform={`rotate(${angle + 90}, ${cx}, ${cy})`}>
                  <foreignObject
                    x={cx - size / 2}
                    y={cy - size / 2}
                    width={size}
                    height={size}
                  >
                    {asset.name === 'XAU' || asset.name === 'XAG' ? (
                      <img
                        src={asset.icon}
                        alt={asset.name}
                        width={size}
                        height={size}
                        style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
                      />
                    ) : CRYPTO_ICONS[asset.name] ? (
                      <div
                        role="img"
                        aria-label={asset.name}
                        style={{
                          width: size,
                          height: size,
                          color: asset.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {CRYPTO_ICONS[asset.name]}
                      </div>
                    ) : (
                      <div
                        role="img"
                        aria-label={asset.name}
                        style={{
                          width: size,
                          height: size,
                          backgroundColor: asset.color,
                          maskImage: `url("${asset.icon}")`,
                          WebkitMaskImage: `url("${asset.icon}")`,
                          maskSize: 'contain',
                          WebkitMaskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          WebkitMaskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          WebkitMaskPosition: 'center',
                        }}
                      />
                    )}
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Speedometer needle - same responsive dimensions as wheel */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 flex justify-center items-end pointer-events-none w-[min(90vw,340px)] h-[min(45vw,170px)] md:w-[min(85vw,420px)] md:h-[min(42vw,210px)] lg:w-[min(75vw,480px)] lg:h-[min(38vw,240px)]"
        >
          <motion.div
            className="landing-wheel-spin landing-arrow-sweep flex justify-center"
            style={{
              animation: 'arrowSweep 6s ease-in-out infinite',
              transformOrigin: '50% 100%',
              paddingBottom: '2%',
            }}
          >
            {/* Triangle pointing UP (like speedometer needle from hub into dial) */}
            <div
              className="w-0 h-0 border-l-8 sm:border-l-[10px] md:border-l-[12px] border-l-transparent border-r-8 sm:border-r-[10px] md:border-r-[12px] border-r-transparent border-t-[#C6FF00] [border-top-width:min(32vw,120px)] md:[border-top-width:min(28vw,150px)] lg:[border-top-width:min(22vw,180px)]"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(198,255,0,0.9)) drop-shadow(0 -2px 4px rgba(0,0,0,0.4))',
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Ambient fog glow */}
      <div
        className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[120%] h-16 -z-10 opacity-50"
        style={{
          background: 'radial-gradient(ellipse 80% 100%, rgba(198,255,0,0.15) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

// --- Main Landing ---
export function LandingPremium({ onLogin }: { onLogin: () => void }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const parallaxX = useTransform(mouseX, [-0.5, 0.5], [6, -6]);
  const parallaxY = useTransform(mouseY, [-0.5, 0.5], [6, -6]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX.set(x);
      mouseY.set(y);
    },
    [mouseX, mouseY]
  );

  return (
    <div
      className="min-h-dvh w-full overflow-x-hidden overflow-y-auto flex flex-col"
      onPointerMove={handlePointerMove}
      style={{ background: BG }}
    >
      {/* Layer 1: Background */}
      <BackgroundLayer parallaxX={parallaxX} parallaxY={parallaxY} />

      {/* Header - fixed/sticky for web, compact for mobile */}
      <header className="sticky top-0 z-30 w-full max-w-[480px] md:max-w-[560px] lg:max-w-[640px] mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4 safe-area-top bg-[#050505]/80 backdrop-blur-md border-b border-white/5">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="font-extrabold text-lg sm:text-xl md:text-2xl uppercase tracking-tight text-[#C6FF00] hover:text-[#C6FF00]/90 transition-colors shrink-0"
          style={{ fontFamily: 'var(--font-display), var(--font-sans), system-ui' }}
        >
          YOLO
        </a>
        <nav className="flex items-center gap-3 sm:gap-4 md:gap-6">
          <a
            href="https://docs.tradeonyolo.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors touch-manipulation"
            aria-label="Docs"
          >
            <BookOpen className="w-5 h-5 sm:w-5 sm:h-5" />
          </a>
          <a
            href="https://x.com/yolotradefun"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors touch-manipulation"
            aria-label="X / Twitter"
          >
            <XIcon className="w-5 h-5 sm:w-5 sm:h-5" />
          </a>
          <Link
            href="/paper"
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-white/60 hover:text-[#C6FF00] hover:bg-[#C6FF00]/10 transition-colors touch-manipulation border border-transparent hover:border-[#C6FF00]/30"
            aria-label="Try paper trading — no wallet needed, live prices"
            title="Paper Trading"
          >
            <FileText className="w-5 h-5 sm:w-5 sm:h-5" strokeWidth={2} />
          </Link>
        </nav>
      </header>

      {/* Content container - scales up for tablet and web */}
      <div className="relative flex-1 flex flex-col w-full max-w-[480px] md:max-w-[560px] lg:max-w-[640px] mx-auto min-h-dvh">
        {/* Top - Logo */}
        <div className="h-[30dvh] min-h-[140px] sm:h-[32dvh] flex items-end justify-center pb-2 sm:pb-4">
          <motion.div
            className="relative -translate-x-1"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, ease: EASE_SMOOTH }}
          >
            <motion.div
              className="absolute inset-0 -m-10 rounded-sm blur-xl -z-10"
              style={{
                background: 'radial-gradient(circle, rgba(198,255,0,0.22) 0%, transparent 65%)',
              }}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.h1
              className="relative px-10 sm:px-14 py-4 sm:py-6 text-[2.5rem] sm:text-[3rem] md:text-5xl font-extrabold uppercase tracking-[-0.04em] text-[#C6FF00] border-[3px] border-[#C6FF00]"
              style={{
                transform: 'rotate(-1.8deg)',
                fontFamily: 'var(--font-display), var(--font-sans), system-ui',
                boxShadow: '0 0 40px rgba(198,255,0,0.45), 0 0 80px rgba(198,255,0,0.15), inset 0 0 24px rgba(198,255,0,0.06)',
              }}
            >
              YOLO
            </motion.h1>
          </motion.div>
        </div>

        {/* Tagline */}
        <div className="min-h-[100px] sm:min-h-[120px] flex flex-col items-center justify-center gap-3 sm:gap-4 px-4 py-2">
          <p className="text-lg sm:text-xl md:text-2xl font-medium tracking-[0.12em] text-white/90 flex flex-wrap justify-center gap-x-2">
            {['Spin.', 'Trade.', 'Win.'].map((word, i) => (
              <motion.span
                key={word}
                className="tagline-opacity-wave"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25 + i * 0.08, ease: EASE_SMOOTH }}
              >
                {word}
              </motion.span>
            ))}
          </p>
          <motion.p
            className="text-xs sm:text-sm md:text-base font-mono text-white/55 tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35, ease: EASE_SMOOTH }}
          >
            Zero-fee perpetuals on Base
          </motion.p>
          <motion.a
            href="https://avantisfi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/50 hover:text-white/70 transition-colors"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5, ease: EASE_SMOOTH }}
            aria-label="Built on Avantis Finance"
          >
            <span className="text-xs sm:text-sm font-mono uppercase tracking-wider">
              built on
            </span>
            <img
              src="/avantis-logo.svg"
              alt="Avantis"
              className="h-4 sm:h-5 w-auto"
            />
          </motion.a>
        </div>

        {/* Wheel + CTA - semi-circle wheel, CTA above overlapping */}
        <div className="flex-1 flex flex-col items-center justify-end safe-area-bottom pt-4 pb-4">
          {/* Semi-circle wheel - aligned to bottom of this section */}
          <div className="w-full flex justify-center flex-shrink-0">
            <PremiumWheel />
          </div>
          {/* CTA - above wheel, centered, thumb zone on mobile */}
          <motion.div
            className="relative z-20 w-[85%] max-w-[340px] md:max-w-[400px] lg:max-w-[440px] flex justify-center -mt-6 sm:-mt-8 md:-mt-10 mb-6 sm:mb-8 md:mb-10 lg:mb-12"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE_SMOOTH }}
          >
            <LandingCTA onClick={onLogin} />
          </motion.div>
        </div>

        {/* Footer - Terms, Privacy, Avantis */}
        <footer className="mt-auto pt-6 pb-6 sm:pt-8 sm:pb-8 safe-area-bottom px-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 md:gap-8">
            <a
              href="/terms"
              className="text-xs sm:text-sm font-mono text-white/50 hover:text-white/80 transition-colors uppercase tracking-wider"
            >
              Terms
            </a>
            <span className="hidden sm:inline text-white/30">·</span>
            <a
              href="/privacy"
              className="text-xs sm:text-sm font-mono text-white/50 hover:text-white/80 transition-colors uppercase tracking-wider"
            >
              Privacy
            </a>
            <span className="hidden sm:inline text-white/30">·</span>
            <a
              href="https://avantisfi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs sm:text-sm font-mono text-white/50 hover:text-white/80 transition-colors uppercase tracking-wider"
              aria-label="Built on Avantis Finance"
            >
              Built on
              <img src="/avantis-logo.svg" alt="Avantis" className="h-3.5 sm:h-4 w-auto" />
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

// --- Premium CTA Button ---
function LandingCTA({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative w-full h-14 md:h-16 lg:h-[72px] rounded-[14px] font-black uppercase tracking-[0.14em] text-black overflow-hidden touch-manipulation flex items-center justify-center gap-3 cta-glow-pulse group"
      style={{
        background: 'linear-gradient(180deg, #C6FF00, #AEEA00)',
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'tween', duration: 0.12 }}
    >
      {/* Inner highlight - top 30% white fade per spec */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 32%)',
          borderRadius: 'inherit',
        }}
      />
      <span className="relative z-10 flex items-center gap-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-black group-hover:scale-105 transition-transform duration-200">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        </svg>
        PLAY NOW
      </span>
    </motion.button>
  );
}
