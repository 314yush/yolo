import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { hashTypedData, type Hex } from 'viem';
import type { IntentPayload } from './localIntents';

export type SignedIntent = {
  payload: IntentPayload;
  signature: Hex;
  signer: `0x${string}`;
};

/**
 * Sign an intent with a local private key and verify digest matches.
 * Signature is 65-byte r||s||v with v ∈ {27,28} (viem default).
 */
export async function signIntentWithPrivateKey(
  payload: IntentPayload,
  privateKey: `0x${string}`
): Promise<SignedIntent> {
  const account = privateKeyToAccount(privateKey);
  return signIntentWithAccount(payload, account);
}

export async function signIntentWithAccount(
  payload: IntentPayload,
  account: Pick<PrivateKeyAccount, 'address' | 'signTypedData'>
): Promise<SignedIntent> {
  const typedData = {
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
  } as Parameters<typeof hashTypedData>[0];

  const localDigest = hashTypedData(typedData);

  if (localDigest.toLowerCase() !== payload.digest.toLowerCase()) {
    throw new Error(
      `EIP-712 digest mismatch for ${payload.intent}: local ${localDigest} != ${payload.digest}. Do NOT submit.`
    );
  }

  const signature = await account.signTypedData(typedData as never);

  return {
    payload,
    signature,
    signer: account.address,
  };
}
