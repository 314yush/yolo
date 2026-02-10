'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { useState, type ReactNode } from 'react';
import { OfflineBanner } from '@/components/OfflineBanner';
import { usePythPricesSync } from '@/hooks/usePythPrices';

/** Runs Pyth price streaming at app level so all pages have fresh prices */
function GlobalPriceSync() {
  usePythPricesSync();
  return null;
}

// Wagmi config for Base
const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
  },
});

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());
  
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  
  // If no Privy App ID, show error (dev mode)
  if (!privyAppId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-[#CCFF00] text-4xl font-bold mb-4">YOLO</h1>
          <p className="text-white/70 mb-4">
            Missing NEXT_PUBLIC_PRIVY_APP_ID environment variable.
          </p>
          <p className="text-white/50 text-sm">
            Get your Privy App ID at{' '}
            <a href="https://privy.io" className="text-[#CCFF00] underline">
              privy.io
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#CCFF00',
          logo: '/yolo-logo.svg',
        },
        loginMethods: ['wallet'], // Only external wallets (MetaMask, WalletConnect, etc.)
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <OfflineBanner />
          <GlobalPriceSync />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
