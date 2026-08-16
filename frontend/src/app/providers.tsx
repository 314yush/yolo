'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { useEffect, useState, type ReactNode } from 'react';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AuthenticatedPriceSync } from '@/components/AuthenticatedPriceSync';
import { PrivyWalletAddressSync } from '@/components/PrivyWalletAddressSync';
import { primeAvantisV2 } from '@/lib/avantisV2';
import { missingBaseRpcUrl } from '@/lib/constants';

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

  // Warm the v2 meta + pair caches so the first spin doesn't wait on them.
  useEffect(() => {
    void primeAvantisV2();
  }, []);

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
        // Auth only via email + OAuth (Google/X). No wallet login methods.
        loginMethods: ['email', 'google', 'twitter'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          // Every trade is an EIP-712 intent signed by this wallet. A modal per
          // spin would defeat the point, and the user already confirmed the
          // trade by spinning, so sign without prompting.
          showWalletUIs: false,
        },
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <PrivyWalletAddressSync />
          <OfflineBanner />
          {missingBaseRpcUrl && (
            <div
              className="fixed top-0 left-0 right-0 z-[90] py-1 px-3 bg-[#FFD60A] text-black text-center text-[11px] font-mono font-bold"
              role="status"
            >
              Public Base RPC — set NEXT_PUBLIC_BASE_RPC_URL (Alchemy preferred)
            </div>
          )}
          <AuthenticatedPriceSync />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
