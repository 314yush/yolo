'use client';

import React from 'react';

// Matches reference: multipliers + crypto logos, dark metallic with golden outlines
const SEGMENTS = [
  { label: '250x', type: 'multiplier', color: '#1a1a1a' },
  { label: 'BTC', type: 'logo', icon: '/logos/btc.svg', color: '#1a1a1a' },
  { label: '500x', type: 'multiplier', color: '#1a1a1a' },
  { label: 'ETH', type: 'logo', icon: '/logos/eth.svg', color: '#1a1a1a' },
  { label: '300x', type: 'multiplier', color: '#1a1a1a' },
  { label: 'SOL', type: 'logo', icon: '/logos/sol.svg', color: '#1a1a1a' },
  { label: '250x', type: 'multiplier', color: '#1a1a1a' },
  { label: 'USDJPY', type: 'logo', icon: '/logos/usdjpy.svg', color: '#1a1a1a' },
];

const SIZE = 200;
const CX = 100;
const CY = 100;
const INNER = 58;
const OUTER = 95;

function buildSegmentPath(index: number, total: number) {
  const step = 360 / total;
  const startAngle = (index * step - 90) * (Math.PI / 180);
  const endAngle = ((index + 1) * step - 90) * (Math.PI / 180);
  const largeArc = step > 180 ? 1 : 0;
  const x1 = CX + OUTER * Math.cos(startAngle);
  const y1 = CY + OUTER * Math.sin(startAngle);
  const x2 = CX + OUTER * Math.cos(endAngle);
  const y2 = CY + OUTER * Math.sin(endAngle);
  const x3 = CX + INNER * Math.cos(endAngle);
  const y3 = CY + INNER * Math.sin(endAngle);
  const x4 = CX + INNER * Math.cos(startAngle);
  const y4 = CY + INNER * Math.sin(startAngle);
  return `M ${x1} ${y1} A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${INNER} ${INNER} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

export function LandingWheel() {
  return (
    <div className="relative flex items-center justify-center w-[220px] h-[220px] sm:w-[260px] sm:h-[260px]">
      {/* Static wheel - dark metallic segments with golden outlines */}
      <div className="absolute inset-0">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full">
          <defs>
            <filter id="wheel-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="segment-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD60A" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#B8860B" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          <g filter="url(#wheel-glow)">
            {SEGMENTS.map((seg, i) => {
              const step = 360 / SEGMENTS.length;
              const textAngle = i * step + step / 2 - 90;
              const textRadius = (INNER + OUTER) / 2;
              const textX = CX + textRadius * Math.cos((textAngle * Math.PI) / 180);
              const textY = CY + textRadius * Math.sin((textAngle * Math.PI) / 180);
              const imgSize = 18;
              return (
                <g key={i}>
                  <path
                    d={buildSegmentPath(i, SEGMENTS.length)}
                    fill={seg.color}
                    stroke="url(#segment-gold)"
                    strokeWidth="2"
                  />
                  {seg.type === 'logo' && seg.icon ? (
                    <image
                      href={seg.icon}
                      x={textX - imgSize / 2}
                      y={textY - imgSize / 2}
                      width={imgSize}
                      height={imgSize}
                      transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                    />
                  ) : (
                    <text
                      x={textX}
                      y={textY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#FFD60A"
                      fontSize="12"
                      fontWeight="bold"
                      transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                    >
                      {seg.label}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Inner cutout - metallic */}
            <circle
              cx={CX}
              cy={CY}
              r={INNER - 6}
              fill="#0a0a0a"
              stroke="url(#segment-gold)"
              strokeWidth="2"
            />
            <text
              x={CX}
              y={CY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#CCFF00"
              fontSize="14"
              fontWeight="900"
              className="font-mono"
            >
              YOLO
            </text>
          </g>
        </svg>
      </div>

      {/* Rotating arrow only - neon green, addictive variable-speed sweep */}
      <div
        className="landing-wheel-spin absolute inset-0 flex items-start justify-center pt-0"
        style={{
          animation: 'addictiveSpin 8s infinite',
          transformOrigin: '50% 50%',
        }}
        aria-hidden
      >
        <div
          className="relative -translate-y-[1px]"
          style={{
            filter: 'drop-shadow(0 0 12px rgba(204,255,0,0.9)) drop-shadow(0 0 24px rgba(204,255,0,0.5)) drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
          }}
        >
          <div
            className="w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-b-[24px] border-b-[#CCFF00]"
            style={{
              boxShadow: '0 0 20px rgba(204,255,0,0.8)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
