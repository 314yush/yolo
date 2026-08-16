/**
 * Latency benchmark for the Avantis v2 trade path.
 *
 *   npx tsx scripts/bench-v2.ts
 *
 * Measures every stage we control end to end, plus the cost of the API
 * round-trip that local intent building lets us skip. Read-only: the one call
 * to the relayer carries a deliberately expired deadline so it is rejected at
 * validation, before anything touches the chain.
 *
 * Actual fill latency (accepted -> MarketOrderExecuted) needs a funded wallet
 * with a registered delegate and is not covered here.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { LocalIntentBuilder } from '../src/lib/avantisV2/localIntents';
import { signIntentWithPrivateKey } from '../src/lib/avantisV2/signIntent';
import { UPSIDE_PAIR_INDEX } from '../src/lib/avantisV2/pairs';

const TX_BUILDER = 'https://tx-builder.avantisfi.com';
const BATCHED_MARKET = 'https://prod-api.avantisfi.com/batched-market';
const FEED = 'https://feed-v3.avantisfi.com';

// Throwaway key, never funded. Used only to produce a well-formed signature.
const THROWAWAY_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const TRADER = privateKeyToAccount(THROWAWAY_KEY).address;

type Stats = {
  label: string;
  n: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
};

function stats(label: string, samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return {
    label,
    n: s.length,
    min: s[0],
    p50: at(0.5),
    p95: at(0.95),
    max: s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

function fmt(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function table(rows: Stats[]) {
  const w = Math.max(...rows.map((r) => r.label.length), 5);
  console.log(
    `${'stage'.padEnd(w)}  ${'n'.padStart(5)}  ${'min'.padStart(9)}  ${'p50'.padStart(9)}  ${'p95'.padStart(9)}  ${'max'.padStart(9)}`
  );
  console.log('-'.repeat(w + 50));
  for (const r of rows) {
    console.log(
      `${r.label.padEnd(w)}  ${String(r.n).padStart(5)}  ${fmt(r.min).padStart(9)}  ${fmt(r.p50).padStart(9)}  ${fmt(r.p95).padStart(9)}  ${fmt(r.max).padStart(9)}`
    );
  }
}

async function timeIt(fn: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

async function main() {
  console.log(`node ${process.version}  trader ${TRADER}\n`);

  // ---------------------------------------------------------------- bootstrap
  const bootRows: Stats[] = [];
  for (const [label, url] of [
    ['GET /v2/meta', `${TX_BUILDER}/v2/meta`],
    ['GET /v2/pairs', `${TX_BUILDER}/v2/pairs`],
  ] as const) {
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push(await timeIt(() => fetch(url).then((r) => r.json())));
    }
    bootRows.push(stats(label, samples));
  }

  const meta = await fetch(`${TX_BUILDER}/v2/meta`).then((r) => r.json());
  const builder = LocalIntentBuilder.fromMeta(meta.data);
  const pairIndex = UPSIDE_PAIR_INDEX.ETH;

  console.log('=== Bootstrap (once per session, cached afterwards) ===');
  table(bootRows);

  // ------------------------------------------------------- local hot path
  const openArgs = {
    trader: TRADER,
    pairIndex,
    isLong: true,
    collateralUsdc: 10,
    leverage: 200,
    openPrice: 1879.5,
    tp: 3759,
    sl: 0,
    slippagePercent: 1,
  };

  // Warm up JIT before measuring.
  for (let i = 0; i < 500; i++) builder.openTrade(openArgs);

  const buildSamples: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = performance.now();
    builder.openTrade(openArgs);
    buildSamples.push(performance.now() - t0);
  }

  const closeSamples: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = performance.now();
    builder.closeTrade({
      trader: TRADER,
      pairIndex,
      index: 0,
      openTimestamp: 1750000000,
      amountUsdc: 10,
      wantedPrice: 1879.5,
    });
    closeSamples.push(performance.now() - t0);
  }

  const signSamples: number[] = [];
  const payload = builder.openTrade(openArgs);
  for (let i = 0; i < 300; i++) {
    signSamples.push(
      await timeIt(() => signIntentWithPrivateKey(payload, THROWAWAY_KEY))
    );
  }

  const buildAndSign: number[] = [];
  for (let i = 0; i < 300; i++) {
    buildAndSign.push(
      await timeIt(async () => {
        const p = builder.openTrade(openArgs);
        await signIntentWithPrivateKey(p, THROWAWAY_KEY);
      })
    );
  }

  console.log('\n=== Local hot path (no network) ===');
  table([
    stats('build open intent', buildSamples),
    stats('build close intent', closeSamples),
    stats('sign (secp256k1 + digest verify)', signSamples),
    stats('build + sign', buildAndSign),
  ]);

  // ------------------------------------------- the round-trip we skip
  const apiBuild: number[] = [];
  for (let i = 0; i < 8; i++) {
    apiBuild.push(
      await timeIt(() =>
        fetch(`${TX_BUILDER}/v2/intents/open`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            trader: TRADER,
            pairIndex,
            collateralUsdc: '10',
            leverage: '200',
            side: 'long',
            orderType: 'market_pnl',
            openPrice: '1879.5',
            slippagePercent: '1',
            takeProfit: '3759',
            stopLoss: '0',
          }),
        }).then((r) => r.json())
      )
    );
  }

  console.log('\n=== The per-trade round-trip local building avoids ===');
  table([stats('POST /v2/intents/open', apiBuild)]);

  // ------------------------------------------------- relayer reachability
  // Expired deadline => rejected at validation, never reaches the chain.
  const relaySamples: number[] = [];
  let relayStatus = 0;
  let relayBody = '';
  for (let i = 0; i < 5; i++) {
    const expired = builder.openTrade({
      ...openArgs,
      deadlineMs: Date.now() - 120_000,
    });
    const signed = await signIntentWithPrivateKey(expired, THROWAWAY_KEY);
    const t0 = performance.now();
    const res = await fetch(`${BATCHED_MARKET}/market/execute-batched`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({
        orderType: 6,
        erc712: {
          userIntent: signed.payload.encodedIntent,
          userSignature: signed.signature,
        },
      }),
    });
    relayBody = await res.text();
    relaySamples.push(performance.now() - t0);
    relayStatus = res.status;
  }

  console.log('\n=== Relayer submission RTT (expired intent -> validation reject) ===');
  table([stats('POST /market/execute-batched', relaySamples)]);
  console.log(`  status ${relayStatus}: ${relayBody.replace(/\s+/g, ' ').slice(0, 160)}`);

  // ----------------------------------------------------- price feed freshness
  const feedSamples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const ctrl = new AbortController();
    const res = await fetch(
      `${FEED}/v1/stream?price_feed_ids=2&price_feed_ids=1&price_feed_ids=6`,
      { headers: { accept: 'text/event-stream' }, signal: ctrl.signal }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (buf.includes('priceFeeds')) break;
    }
    feedSamples.push(performance.now() - t0);
    ctrl.abort();
  }

  console.log('\n=== Price feed: connect -> first tick ===');
  table([stats('SSE first price_update', feedSamples)]);

  // ------------------------------------------------- settlement shape on Base
  const chain = await inspectSettlement();

  // ------------------------------------------------------------------ summary
  const b = stats('', buildAndSign);
  const r = stats('', relaySamples);
  const a = stats('', apiBuild);
  console.log('\n=== Summary ===');
  console.log(
    `Client work before the order leaves the browser: ~${fmt(b.p50)} (p95 ${fmt(b.p95)}).`
  );
  console.log(`Network hop to the relayer: ~${fmt(r.p50)} from this machine.`);
  console.log(
    `Local building saves ~${fmt(a.p50)} per trade vs calling /v2/intents/open first.`
  );
  if (chain) {
    console.log(
      `Settlement: ${chain.atomic}/${chain.total} sampled orders registered and filled in one tx, ` +
        `across ${chain.submitters} relayer signers. Base blocks ${chain.blockTime}s, so inclusion adds 0-${chain.blockTime}s.`
    );
  }
  console.log(
    'Relayer-internal time (price fetch -> tx broadcast) is not observable from outside.'
  );
}

/**
 * Avantis v2 market orders settle in a single Base transaction: the router
 * emits MarketOrderInitiated and the callbacks emit MarketExecuted in the same
 * receipt. Confirm that still holds and report the block cadence, since those
 * two facts bound how fast a fill can possibly come back.
 */
const BASE_RPC = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
const TRADING_ROUTER = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
const TOPIC_ORDER_INITIATED =
  '0xdf4eefe414d2dc9d6c031eb82661052d92b0a4f41e6b8a291d45045a000b90a3';
const TOPIC_MARKET_EXECUTED =
  '0x194c5538fd1fd53a5ec20cd85e48e0a542b1cbfb713ee866339c38465118308a';

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result: T; error?: unknown };
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

type Receipt = {
  from: string;
  blockNumber: string;
  logs: Array<{ topics: string[] }>;
};

async function inspectSettlement() {
  console.log('\n=== Settlement on Base (last ~900 blocks of live orders) ===');
  try {
    const head = Number(await rpc<string>('eth_blockNumber', []));
    const logs = await rpc<Array<{ transactionHash: string }>>('eth_getLogs', [
      {
        fromBlock: `0x${(head - 900).toString(16)}`,
        toBlock: `0x${head.toString(16)}`,
        address: TRADING_ROUTER,
        topics: [TOPIC_ORDER_INITIATED],
      },
    ]);

    const hashes = [...new Set(logs.map((l) => l.transactionHash))];
    if (hashes.length === 0) {
      console.log('  no orders in window');
      return null;
    }

    const receipts = await Promise.all(
      hashes.map((h) => rpc<Receipt | null>('eth_getTransactionReceipt', [h]))
    );

    let atomic = 0;
    const submitters = new Set<string>();
    const blockNums = new Set<number>();
    for (const r of receipts) {
      if (!r) continue;
      const topics = new Set(r.logs.map((l) => l.topics[0]));
      if (topics.has(TOPIC_MARKET_EXECUTED)) atomic++;
      submitters.add(r.from.toLowerCase());
      blockNums.add(Number(r.blockNumber));
    }

    const sorted = [...blockNums].sort((a, b) => a - b);
    const probe = sorted.slice(0, 12);
    const times = await Promise.all(
      probe.map((n) =>
        rpc<{ timestamp: string }>('eth_getBlockByNumber', [
          `0x${n.toString(16)}`,
          false,
        ]).then((b) => Number(b.timestamp))
      )
    );
    const deltas = probe
      .slice(1)
      .map((n, i) => (times[i + 1] - times[i]) / (n - probe[i]));
    const blockTime = deltas.length
      ? Math.round(deltas.reduce((a, c) => a + c, 0) / deltas.length)
      : 2;

    console.log(`  orders sampled:              ${receipts.length}`);
    console.log(`  filled in the same tx:       ${atomic}/${receipts.length}`);
    console.log(`  distinct relayer signers:    ${submitters.size}`);
    console.log(`  Base block time:             ${blockTime}s`);
    return {
      total: receipts.length,
      atomic,
      submitters: submitters.size,
      blockTime,
    };
  } catch (err) {
    console.log(`  skipped: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
