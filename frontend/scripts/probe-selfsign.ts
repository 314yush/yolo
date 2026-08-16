/**
 * Does the batched-market relayer accept an intent signed by the trader
 * themselves, with no delegate registered?
 *
 *   npx tsx scripts/probe-selfsign.ts
 *
 * Both probes use unfunded throwaway wallets with no USDC and no approval, so
 * neither can open a position. What matters is *which* error comes back:
 * a signature/delegation rejection means self-signing is not allowed, while a
 * balance/allowance rejection means it got past auth and the delegate is
 * optional.
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { LocalIntentBuilder } from '../src/lib/avantisV2/localIntents';
import { signIntentWithPrivateKey } from '../src/lib/avantisV2/signIntent';
import { UPSIDE_PAIR_INDEX } from '../src/lib/avantisV2/pairs';

const TX_BUILDER = 'https://tx-builder.avantisfi.com';
const BATCHED_MARKET = 'https://prod-api.avantisfi.com/batched-market';
const MARKET_OPEN_PNL = 6;

async function probe(
  label: string,
  builder: LocalIntentBuilder,
  traderKey: `0x${string}`,
  signerKey: `0x${string}`
) {
  const trader = privateKeyToAccount(traderKey).address;
  const signer = privateKeyToAccount(signerKey).address;

  const payload = builder.openTrade({
    trader,
    pairIndex: UPSIDE_PAIR_INDEX.ETH,
    isLong: true,
    collateralUsdc: 10,
    leverage: 200,
    openPrice: 1879.5,
    tp: 3759,
    sl: 0,
    slippagePercent: 1,
  });

  const signed = await signIntentWithPrivateKey(payload, signerKey);

  const res = await fetch(`${BATCHED_MARKET}/market/execute-batched`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      orderType: MARKET_OPEN_PNL,
      erc712: {
        userIntent: signed.payload.encodedIntent,
        userSignature: signed.signature,
      },
    }),
  });

  const body = await res.text();
  console.log(`\n--- ${label} ---`);
  console.log(`trader ${trader}`);
  console.log(`signer ${signer}  ${trader === signer ? '(self)' : '(unregistered delegate)'}`);
  console.log(`HTTP ${res.status}`);
  console.log(body.replace(/\s+/g, ' ').trim().slice(0, 500));
}

async function main() {
  const meta = await fetch(`${TX_BUILDER}/v2/meta`).then((r) => r.json());
  const builder = LocalIntentBuilder.fromMeta(meta.data);

  const traderKey = generatePrivateKey();
  const otherKey = generatePrivateKey();

  await probe('A. self-signed (trader signs own intent)', builder, traderKey, traderKey);
  await probe('B. signed by unregistered third party', builder, traderKey, otherKey);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
