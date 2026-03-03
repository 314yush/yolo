import type { Metadata, Viewport } from 'next';
import { Outfit, Oswald } from 'next/font/google';
import Script from 'next/script';
import { Providers } from './providers';
import './globals.css';

// Force dynamic rendering - app requires Privy auth
export const dynamic = 'force-dynamic';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tradeonyolo.fun';
const disableClientConsole = process.env.NODE_ENV === 'production';

export const metadata: Metadata = {
  title: 'YOLO - Hypercasual Leverage Trading',
  description: 'Spin the wheel, open a trade. Zero-fee perpetuals on Base.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/icons/icon-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-96x96.png?v=2', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#CCFF00',
      },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'YOLO',
    title: 'YOLO - Hypercasual Leverage Trading',
    description: 'Spin the wheel, open a trade. Zero-fee perpetuals on Base.',
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'YOLO - Hypercasual Leverage Trading',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YOLO - Hypercasual Leverage Trading',
    description: 'Spin the wheel, open a trade. Zero-fee perpetuals on Base.',
    images: [`${siteUrl}/twitter-image.png`],
    creator: '@yolo', // Update with actual Twitter handle
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  keywords: ['trading', 'crypto', 'leverage', 'perpetuals', 'Base', 'DeFi', 'hypercasual', 'gaming', 'BTC', 'ETH', 'SOL', 'XRP'],
  authors: [{ name: 'YOLO' }],
  creator: 'YOLO',
  publisher: 'YOLO',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#CCFF00',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${oswald.variable}`}>
      <body className="bg-black text-white font-sans antialiased">
        {disableClientConsole ? (
          <Script id="disable-client-console" strategy="beforeInteractive">
            {`(() => {
  const noop = () => {};
  const methods = ['log', 'debug', 'info', 'warn', 'error'];
  for (const method of methods) {
    try {
      console[method] = noop;
    } catch (_) {
      // Ignore assignment failures in locked-down environments.
    }
  }
})();`}
          </Script>
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
