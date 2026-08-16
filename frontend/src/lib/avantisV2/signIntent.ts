import { privateKeyToAccount } from 'viem/accounts';
import { hashTypedData, type Hex } from 'viem';
import type { IntentPayload } from './localIntents';

export type IntentTypedData = Parameters<typeof hashTypedData>[0];

/**
 * Anything that can put an EIP-712 signature on an intent. In practice this is
 * the user's Privy embedded wallet; the private-key variant below exists for
 * scripts and the golden-vector tests.
 */
export type IntentSigner = {
  address: `0x${string}`;
  signTypedData: (typedData: IntentTypedData) => Promise<Hex>;
};

export type SignedIntent = {
  payload: IntentPayload;
  signature: Hex;
  signer: `0x${string}`;
};

export async function signIntentWithPrivateKey(
  payload: IntentPayload,
  privateKey: `0x${string}`
): Promise<SignedIntent> {
  const account = privateKeyToAccount(privateKey);
  return signIntentWithAccount(payload, {
    address: account.address,
    signTypedData: (typedData) => account.signTypedData(typedData as never),
  });
}

/**
 * Signature is 65-byte r||s||v with v ∈ {27,28}.
 *
 * The digest is recomputed here and checked against the one the builder
 * produced. A mismatch means the payload drifted between build and sign, and
 * the relayer would recover a signer we do not expect, so refuse to submit.
 */
export async function signIntentWithAccount(
  payload: IntentPayload,
  signer: IntentSigner
): Promise<SignedIntent> {
  const typedData = {
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
  } as IntentTypedData;

  const localDigest = hashTypedData(typedData);

  if (localDigest.toLowerCase() !== payload.digest.toLowerCase()) {
    throw new Error(
      `EIP-712 digest mismatch for ${payload.intent}: local ${localDigest} != ${payload.digest}. Do NOT submit.`
    );
  }

  const signature = await signer.signTypedData(typedData);

  return {
    payload,
    signature,
    signer: signer.address,
  };
}
