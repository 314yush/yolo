import type { Metadata, Viewport } from 'next';
import { Space_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Force dynamic rendering - app requires Privy auth
export const dynamic = 'force-dynamic';

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'YOLO - Hypercasual Leverage Trading',
  description: 'Spin the wheel, open a trade. Zero-fee perpetuals on Base.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={spaceMono.variable}>
      <body className="bg-black text-white font-mono antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
