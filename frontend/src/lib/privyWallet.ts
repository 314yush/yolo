import type { Address } from 'viem';

export interface Eip1193LikeProvider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
}

export interface PrivyWalletLike {
  address?: string;
  walletClientType?: string;
  connectorType?: string;
  getEthereumProvider?: () => Promise<Eip1193LikeProvider>;
}

export interface ResolvePrivyEmbeddedWalletResult {
  wallet: PrivyWalletLike | null;
  error?: string;
}

/**
 * Resolve the best wallet for embedded Privy signing.
 * Preference order:
 * 1) Wallet marked as Privy embedded
 * 2) Wallet matching authenticated user address
 * 3) First available wallet
 */
export function resolvePrivyEmbeddedWallet(
  wallets: PrivyWalletLike[] | undefined,
  userAddress: Address
): ResolvePrivyEmbeddedWalletResult {
  if (!wallets || wallets.length === 0) {
    return { wallet: null, error: 'No wallets found in Privy session.' };
  }

  const embedded = wallets.find((wallet) => wallet.walletClientType === 'privy');
  if (embedded) return { wallet: embedded };

  const byAddress = wallets.find(
    (wallet) => wallet.address?.toLowerCase() === userAddress.toLowerCase()
  );
  if (byAddress) return { wallet: byAddress };

  return { wallet: wallets[0] ?? null };
}

export async function getWalletProvider(wallet: PrivyWalletLike): Promise<Eip1193LikeProvider> {
  if (wallet?.getEthereumProvider) {
    const provider = await wallet.getEthereumProvider();
    if (provider) return provider;
  }

  if (typeof window !== 'undefined' && (window as unknown as { ethereum?: Eip1193LikeProvider }).ethereum) {
    return (window as unknown as { ethereum: Eip1193LikeProvider }).ethereum;
  }

  throw new Error('Unable to get wallet provider from Privy wallet.');
}
