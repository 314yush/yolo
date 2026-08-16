/**
 * Diffs the local intent builder against the live tx-builder canonical payloads.
 *
 *   npx tsx scripts/verify-v2-live.ts
 *
 * Builds an open and a close intent for an Upside pair on mainnet, asks the API
 * to build the same thing, and asserts the digest + encodedIntent match byte for
 * byte. Also asserts every pair YOLO trades resolves to a PnL-capable index.
 */

import { LocalIntentBuilder } from '../src/lib/avantisV2/localIntents';
import { UPSIDE_PAIR_INDEX } from '../src/lib/avantisV2/pairs';

const TX_BUILDER = 'https://tx-builder.avantisfi.com';
const TRADER = '0x1111111111111111111111111111111111111111' as const;

let failures = 0;

function check(label: string, actual: string, expected: string) {
  const ok = actual.toLowerCase() === expected.toLowerCase();
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        local: ${actual}`);
    console.log(`          api: ${expected}`);
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${TX_BUILDER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${path}: ${JSON.stringify(json.error)}`);
  return json.data;
}

async function main() {
  const metaRes = await fetch(`${TX_BUILDER}/v2/meta`).then((r) => r.json());
  const meta = metaRes.data;
  const builder = LocalIntentBuilder.fromMeta(meta);
  console.log(`chainId=${meta.chainId} router=${meta.addresses.tradingRouter}\n`);

  // --- open on an Upside pair -------------------------------------------
  const pairIndex = UPSIDE_PAIR_INDEX.ETH;
  const api = await post('/v2/intents/open', {
    trader: TRADER,
    pairIndex,
    collateralUsdc: '100',
    leverage: '100',
    side: 'long',
    orderType: 'market_pnl',
    openPrice: '3000',
    slippagePercent: '1',
    takeProfit: '6000',
    stopLoss: '0',
  });

  const local = builder.openTrade({
    trader: TRADER,
    pairIndex,
    isLong: true,
    collateralUsdc: 100,
    leverage: 100,
    openPrice: 3000,
    orderType: api.message._type,
    tp: 6000,
    sl: 0,
    slippagePercent: 1,
    // Pin the non-deterministic fields to the API's so the diff is meaningful.
    nonce: BigInt(api.message._nonce),
    deadlineMs: Number(api.message._deadline),
  });

  console.log(`OpenTradeReq (pair ${pairIndex}, _type=${api.message._type})`);
  check('  digest', local.digest, api.digest);
  check('  encodedIntent', local.encodedIntent, api.encodedIntent);

  // --- close ------------------------------------------------------------
  const apiClose = await post('/v2/intents/close', {
    trader: TRADER,
    pairIndex,
    tradeIndex: 0,
    collateralToCloseUsdc: '100',
    openTimestamp: 1750000000,
    expectedPrice: '3100',
  });

  const localClose = builder.closeTrade({
    trader: TRADER,
    pairIndex,
    index: 0,
    openTimestamp: 1750000000,
    amountUsdc: 100,
    wantedPrice: 3100,
    nonce: BigInt(apiClose.message._nonce),
    deadlineMs: Number(apiClose.message._deadline),
  });

  console.log(`\nCloseTradeReq (pair ${pairIndex})`);
  check('  digest', localClose.digest, apiClose.digest);
  check('  encodedIntent', localClose.encodedIntent, apiClose.encodedIntent);

  // --- every pair the app trades must exist and allow the type it sends --
  type RawPair = {
    index: number;
    symbol: string;
    isPairListed: boolean;
    closeOnly: boolean;
    isPnlTypeAllowed: boolean;
    pairMinLevPosUSDC: number;
    leverages: { maxLeverage: number; pnlMaxLeverage: number };
  };
  const pairs = await fetch(`${TX_BUILDER}/v2/pairs`)
    .then((r) => r.json())
    .then(
      (j) => new Map<number, RawPair>(j.data.map((p: RawPair) => [p.index, p]))
    );

  console.log('\nUpside pair catalog');
  for (const [name, index] of Object.entries(UPSIDE_PAIR_INDEX)) {
    const p = pairs.get(index);
    const ok = Boolean(p?.isPnlTypeAllowed && p?.isPairListed && !p?.closeOnly);
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${name} -> ${index} ${p?.symbol ?? 'MISSING'}` +
        ` (pnlMaxLeverage=${p?.leverages.pnlMaxLeverage})`
    );
  }

  // The wheel's own table: every asset must be listed, and its maxLeverage must
  // match the cap on whichever path that pair actually routes down.
  console.log('\nWheel assets (src/lib/constants.ts)');
  const { ASSETS, LEVERAGES, DEFAULT_COLLATERAL } = await import('../src/lib/constants');
  for (const asset of ASSETS) {
    const p = pairs.get(asset.pairIndex);
    if (!p) {
      failures += 1;
      console.log(`FAIL  ${asset.name} -> ${asset.pairIndex} MISSING FROM CATALOG`);
      continue;
    }
    const cap = p.isPnlTypeAllowed ? p.leverages.pnlMaxLeverage : p.leverages.maxLeverage;
    const tiers = asset.fixedLeverage
      ? [asset.fixedLeverage]
      : LEVERAGES.filter((l) => l.value <= asset.maxLeverage).map((l) => l.value);
    const problems: string[] = [];
    if (!p.isPairListed || p.closeOnly) problems.push('not open for new trades');
    if (asset.maxLeverage > cap) problems.push(`maxLeverage ${asset.maxLeverage} > cap ${cap}`);
    if (tiers.length === 0) problems.push('no usable leverage tier');
    const minNotional = DEFAULT_COLLATERAL * Math.min(...tiers);
    if (tiers.length > 0 && minNotional < p.pairMinLevPosUSDC) {
      problems.push(
        `$${DEFAULT_COLLATERAL} x ${Math.min(...tiers)} = $${minNotional} < min $${p.pairMinLevPosUSDC}`
      );
    }
    if (problems.length > 0) failures += 1;
    console.log(
      `${problems.length === 0 ? 'PASS' : 'FAIL'}  ${asset.name.padEnd(7)} -> ${String(asset.pairIndex).padEnd(4)}` +
        ` ${p.symbol.padEnd(16)} ${p.isPnlTypeAllowed ? 'upside' : 'standard'}` +
        ` cap=${cap} tiers=[${tiers.join(',')}]` +
        (problems.length > 0 ? `\n        ${problems.join('; ')}` : '')
    );
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
