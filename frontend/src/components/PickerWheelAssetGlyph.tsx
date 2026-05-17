import React from 'react';

/** Inline SVGs for the picker outer ring — avoids async <image href> fetches so icons paint with the wheel. */
export function PickerWheelAssetGlyph({
  name,
  x,
  y,
  size,
}: {
  name: string;
  x: number;
  y: number;
  size: number;
}) {
  const common = {
    x,
    y,
    width: size,
    height: size,
    pointerEvents: 'none' as const,
  };

  switch (name) {
    case 'ETH':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="#000000">
          <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.37 4.35z" />
          <path d="M11.944 0L4.58 12.22l7.364 4.353 7.365-4.354L11.943 0z" />
        </svg>
      );
    case 'BTC':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path
            fill="#000000"
            d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"
          />
        </svg>
      );
    case 'SOL':
      return (
        <svg {...common} viewBox="0 0 397.7 311.7">
          <path
            fill="#000000"
            d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"
          />
          <path
            fill="#000000"
            d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"
          />
          <path
            fill="#000000"
            d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"
          />
        </svg>
      );
    case 'USDJPY':
      return (
        <svg {...common} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="26" stroke="#000000" strokeWidth="3" fill="#E0FDFA" />
          <text x="32" y="40" textAnchor="middle" fontSize="22" fontWeight={700} fill="#000000" fontFamily="system-ui,sans-serif">
            &#165;
          </text>
        </svg>
      );
    case 'XAU':
      return (
        <svg {...common} viewBox="0 0 100 100" fill="none">
          <defs>
            <linearGradient id="pw-xau-g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#FFE55C' }} />
              <stop offset="50%" style={{ stopColor: '#FFD700' }} />
              <stop offset="100%" style={{ stopColor: '#C9A227' }} />
            </linearGradient>
            <linearGradient id="pw-xau-s" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: '#C9A227' }} />
              <stop offset="100%" style={{ stopColor: '#8B7500' }} />
            </linearGradient>
          </defs>
          <polygon points="50,15 85,35 50,55 15,35" fill="url(#pw-xau-g)" stroke="#8B7500" strokeWidth="2" />
          <polygon points="85,35 85,65 50,85 50,55" fill="url(#pw-xau-s)" stroke="#8B7500" strokeWidth="2" />
          <polygon points="15,35 50,55 50,85 15,65" fill="#B8960C" stroke="#8B7500" strokeWidth="2" />
          <polygon points="50,20 70,32 50,44 30,32" fill="#FFF8DC" opacity="0.4" />
        </svg>
      );
    case 'XAG':
      return (
        <svg {...common} viewBox="0 0 100 100" fill="none">
          <defs>
            <linearGradient id="pw-xag-g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#F0F0F0' }} />
              <stop offset="50%" style={{ stopColor: '#C0C0C0' }} />
              <stop offset="100%" style={{ stopColor: '#909090' }} />
            </linearGradient>
            <linearGradient id="pw-xag-s" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: '#909090' }} />
              <stop offset="100%" style={{ stopColor: '#606060' }} />
            </linearGradient>
          </defs>
          <polygon points="50,15 85,35 50,55 15,35" fill="url(#pw-xag-g)" stroke="#606060" strokeWidth="2" />
          <polygon points="85,35 85,65 50,85 50,55" fill="url(#pw-xag-s)" stroke="#606060" strokeWidth="2" />
          <polygon points="15,35 50,55 50,85 15,65" fill="#808080" stroke="#606060" strokeWidth="2" />
          <polygon points="50,20 70,32 50,44 30,32" fill="#FFFFFF" opacity="0.5" />
        </svg>
      );
    default:
      return null;
  }
}
