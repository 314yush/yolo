/**
 * Adapts a Privy embedded wallet into something that can sign Avantis intents.
 *
 * v2 accepts an intent signed by the trader or by a delegate registered on
 * chain. Since every YOLO user logs in with email or OAuth and therefore has an
 * embedded wallet, the trader can sign for themselves and we never register a
 * delegate at all.
 */

import type { Hex } from 'viem';
import type { Eip1193LikeProvider } from '@/lib/privyWallet';
import type { IntentSigner, IntentTypedData } from './signIntent';

/**
 * eth_signTypedData_v4 takes a JSON string, but intent messages are full of
 * bigints and the domain carries a bigint chainId. Decimal strings are the
 * canonical JSON encoding for uint256 in EIP-712 payloads.
 */
function serializeTypedData(typedData: IntentTypedData): string {
  return JSON.stringify(
    {
      domain: typedData.domain,
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...typedData.types,
      },
      primaryType: typedData.primaryType,
      message: typedData.message,
    },
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
  );
}

export function createPrivyIntentSigner(
  provider: Eip1193LikeProvider,
  address: `0x${string}`
): IntentSigner {
  return {
    address,
    async signTypedData(typedData) {
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, serializeTypedData(typedData)],
      });

      if (typeof signature !== 'string' || !signature.startsWith('0x')) {
        throw new Error(
          `Wallet returned an unusable signature for ${typedData.primaryType}`
        );
      }
      return signature as Hex;
    },
  };
}
