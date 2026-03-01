'use client';

import React from 'react';
import Link from 'next/link';

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <div className="space-y-4 sm:space-y-6 text-sm sm:text-base text-white/80 leading-relaxed">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of YOLO (&quot;Service&quot;).
            By accessing or using the Service, you agree to be bound by these Terms.
          </p>
          <p>
            <strong className="text-white/90">Trading Risks.</strong> Leverage trading involves
            significant risk. You may lose some or all of your invested capital. Past performance
            does not guarantee future results.
          </p>
          <p>
            <strong className="text-white/90">Eligibility.</strong> You must be of legal age in your
            jurisdiction and comply with all applicable laws to use the Service.
          </p>
          <p>
            <strong className="text-white/90">Modifications.</strong> We may update these Terms from
            time to time. Continued use of the Service after changes constitutes acceptance of the
            revised Terms.
          </p>
          <p className="text-white/60 text-xs sm:text-sm pt-4">
            Last updated: March 2025. For questions, contact us through the platform.
          </p>
        </div>
      </main>
    </div>
  );
}
