'use client';

import React from 'react';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[#050505] text-white font-mono">
      <header className="sticky top-0 z-10 w-full max-w-2xl mx-auto px-4 py-4 flex items-center justify-between border-b border-white/10 bg-[#050505]/95 backdrop-blur-sm safe-area-top">
        <Link
          href="/"
          className="font-extrabold text-lg sm:text-xl uppercase tracking-tight text-[#C6FF00] hover:text-[#C6FF00]/90 transition-colors"
        >
          YOLO
        </Link>
        <Link
          href="/"
          className="text-sm text-white/60 hover:text-white/90 transition-colors"
        >
          ← Back
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12 md:py-16">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#C6FF00] mb-6 sm:mb-8">
          Privacy Policy
        </h1>
        <div className="space-y-4 sm:space-y-6 text-sm sm:text-base text-white/80 leading-relaxed">
          <p>
            This Privacy Policy describes how YOLO (&quot;we&quot;, &quot;our&quot;) collects, uses,
            and shares information when you use our service.
          </p>
          <p>
            <strong className="text-white/90">Wallet &amp; On-Chain Data.</strong> We access
            blockchain data associated with your connected wallet. This includes transaction history,
            balances, and position data. We do not store your private keys.
          </p>
          <p>
            <strong className="text-white/90">Authentication.</strong> We use Privy for authentication.
            Please refer to Privy&apos;s privacy policy for how they process your data.
          </p>
          <p>
            <strong className="text-white/90">Analytics.</strong> We may collect usage data to improve
            the Service. We do not sell your personal information.
          </p>
          <p className="text-white/60 text-xs sm:text-sm pt-4">
            Last updated: March 2025. For questions, contact us through the platform.
          </p>
        </div>
      </main>
    </div>
  );
}
