'use client';

import { PaperTradingProvider } from '@/context/PaperTradingContext';

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <PaperTradingProvider>{children}</PaperTradingProvider>;
}
