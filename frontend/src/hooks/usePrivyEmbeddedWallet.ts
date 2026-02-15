'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, type Hex, type Address } from 'viem';
import { base } from 'viem/chains';

export interface EIP7702Authorization {
  chainId: number;
  address: Address;
  nonce: number;
  r: Hex;
  s: Hex;
  v: number;
  yParity: 0 | 1;
}

export function usePrivyEmbeddedWallet() {
  const { wallets, ready } = useWallets();
  const [isReady, setIsReady] = useState(false);

  // Find the Privy embedded wallet
  const embeddedWallet = useMemo(() => {
    if (!ready || !wallets.length) return null;
    return wallets.find((w) => w.walletClientType === 'privy') ?? null;
  }, [wallets, ready]);

  const address = useMemo(() => {
    return embeddedWallet?.address as `0x${string}` | null ?? null;
  }, [embeddedWallet]);

  // Mark ready once we have the embedded wallet
  useEffect(() => {
    setIsReady(!!embeddedWallet && ready);
  }, [embeddedWallet, ready]);

  // Sign a message using the embedded wallet (server-side, no popup)
  const signMessage = useCallback(
    async (message: { raw: Hex }): Promise<Hex> => {
      if (!embeddedWallet) {
        throw new Error('Embedded wallet not available');
      }
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });
      return walletClient.signMessage({ message });
    },
    [embeddedWallet, address]
  );

  // Sign EIP-7702 authorization using the embedded wallet
  const signAuthorization = useCallback(
    async (contractAddress: Address): Promise<EIP7702Authorization> => {
      if (!embeddedWallet) {
        throw new Error('Embedded wallet not available');
      }
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });

      const authorization = await walletClient.signAuthorization({
        contractAddress,
      });

      return {
        chainId: authorization.chainId,
        address: authorization.address,
        nonce: Number(authorization.nonce),
        r: authorization.r,
        s: authorization.s,
        v: Number(authorization.v),
        yParity: Number(authorization.yParity) as 0 | 1,
      };
    },
    [embeddedWallet, address]
  );

  return {
    address,
    isReady,
    signMessage,
    signAuthorization,
  };
}
