'use client';

/**
 * Open/close execution against Avantis v2: build an EIP-712 intent locally,
 * sign it with the user's own embedded wallet, hand it to the batched-market
 * relayer. No delegate key and no gas — the relayer pays and settles the
 * registration and the fill in a single Base transaction.
 */

import { useCallback, useMemo, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { executeOpenTradeV2, executeCloseTradeV2 } from '@/lib/avantisV2';
import { createPrivyIntentSigner } from '@/lib/avantisV2/privySigner';
import {
  getWalletProvider,
  resolvePrivyEmbeddedWallet,
  type PrivyWalletLike,
} from '@/lib/privyWallet';
import type { IntentSigner } from '@/lib/avantisV2/signIntent';
import { useTradeStore } from '@/store/tradeStore';
import { debug } from '@/lib/debug';

export type OpenExecutionParams = {
  trader: `0x${string}`;
  pairIndex: number;
  collateral: number;
  leverage: number;
  isLong: boolean;
  openPrice: number;
  takeProfitPercent?: number;
};

export type CloseExecutionParams = {
  trader: `0x${string}`;
  pairIndex: number;
  tradeIndex: number;
  collateralToClose: number;
  openTimestamp: number;
  expectedPrice: number;
  isPnl?: boolean;
};

export function useAvantisTradeExecution() {
  const { wallets, ready: walletsReady } = useWallets();
  const [isPending, setIsPending] = useState(false);

  const resolveSigner = useCallback(
    async (trader: `0x${string}`): Promise<IntentSigner> => {
      if (!walletsReady) {
        throw new Error('Wallet still initializing. Please retry in a moment.');
      }
      const { wallet, error } = resolvePrivyEmbeddedWallet(
        wallets as PrivyWalletLike[] | undefined,
        trader
      );
      if (!wallet) {
        throw new Error(error || 'No wallet available to sign this trade');
      }

      // The intent names `trader` as the owner, and the relayer only accepts a
      // signature from the trader or a registered delegate. We register no
      // delegates, so a wallet mismatch would come back as an opaque 400 —
      // catch it here instead.
      if (wallet.address?.toLowerCase() !== trader.toLowerCase()) {
        throw new Error(
          `Wallet mismatch: signed-in wallet is ${wallet.address}, but the trade is for ${trader}. Please sign out and back in.`
        );
      }

      const provider = await getWalletProvider(wallet);
      return createPrivyIntentSigner(provider, trader);
    },
    [wallets, walletsReady]
  );

  const openMarket = useCallback(
    async (params: OpenExecutionParams): Promise<`0x${string}`> => {
      setIsPending(true);
      try {
        const signer = await resolveSigner(params.trader);
        debug('[AvantisV2] openMarket via self-signed intent');
        const result = await executeOpenTradeV2({
          ...params,
          signer,
          takeProfitPercent:
            params.takeProfitPercent ??
            useTradeStore.getState().settings.takeProfitPercent ??
            200,
        });
        return result.txHash;
      } finally {
        setIsPending(false);
      }
    },
    [resolveSigner]
  );

  const closeMarket = useCallback(
    async (params: CloseExecutionParams): Promise<`0x${string}`> => {
      setIsPending(true);
      try {
        const signer = await resolveSigner(params.trader);
        debug('[AvantisV2] closeMarket via self-signed intent');
        const result = await executeCloseTradeV2({
          trader: params.trader,
          signer,
          pairIndex: params.pairIndex,
          tradeIndex: params.tradeIndex,
          collateralToClose: params.collateralToClose,
          openTimestamp: params.openTimestamp,
          expectedPrice: params.expectedPrice,
          // Undefined on purpose when unknown: executeCloseTradeV2 then derives
          // it from the pair rather than assuming Upside.
          isPnl: params.isPnl,
        });
        return result.txHash;
      } finally {
        setIsPending(false);
      }
    },
    [resolveSigner]
  );

  return useMemo(
    () => ({ openMarket, closeMarket, isPending }),
    [openMarket, closeMarket, isPending]
  );
}
