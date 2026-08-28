import type { NextConfig } from "next";

/**
 * External origins the app actually talks to, derived from grepping src/ for
 * absolute URLs:
 *   - Privy (auth iframe, embedded wallet, Cloudflare Turnstile challenge)
 *   - Avantis (feed-v3 SSE, prod-api, tx-builder, core, history)
 *   - Pyth Hermes (price updates + SSE)
 *   - Base RPC + Flashblock preconf RPC + Alchemy (NEXT_PUBLIC_BASE_RPC_URL)
 *   - Pusher (Avantis realtime channels, incl. websocket + sockjs fallback)
 */
const CONNECT_SRC = [
  "'self'",
  'https://auth.privy.io',
  'https://*.privy.io',
  'wss://*.privy.io',
  'https://*.privy.systems',
  'https://explorer-api.walletconnect.com',
  'https://feed-v3.avantisfi.com',
  'https://prod-api.avantisfi.com',
  'https://tx-builder.avantisfi.com',
  'https://core.avantisfi.com',
  'https://api.avantisfi.com',
  'https://hermes.pyth.network',
  'https://mainnet.base.org',
  'https://mainnet-preconf.base.org',
  'https://*.g.alchemy.com',
  'wss://*.pusher.com',
  'https://*.pusher.com',
  'https://*.pusherapp.com',
];

const FRAME_SRC = [
  "'self'",
  'https://auth.privy.io',
  'https://*.privy.io',
  'https://challenges.cloudflare.com',
];

/**
 * Report-Only for now. The allowlist above is derived from static analysis, and
 * third-party SDKs (Privy in particular) can reach origins we have not observed
 * yet. Promote to enforcing `Content-Security-Policy` only after reviewing real
 * violation reports from production.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval'/'unsafe-inline' are required by Next.js runtime chunks and the
  // Privy SDK; removing them needs a nonce-based setup first.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC.join(' ')}`,
  `frame-src ${FRAME_SRC.join(' ')}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
