/**
 * Asserts LocalIntentBuilder matches on-chain golden vectors.
 *
 *   npx tsx scripts/verify-vectors.ts
 *
 * golden-vectors.json stores digests from the deployed SignatureHelpers
 * library. Kinds that LocalIntentBuilder does not implement are skipped
 * (the schema in intentsSchema.ts is the YOLO subset: open / close / delegate).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalIntentBuilder, hashIntentDigest } from '../src/lib/avantisV2/localIntents';
import { INTENT_TYPES } from '../src/lib/avantisV2/intentsSchema';

type GoldenFile = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  vectors: Array<{
    kind: string;
    message: Record<string, unknown>;
    digest: string;
    structHash?: string;
  }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../src/lib/avantisV2/golden-vectors.json');

/** JSON stores uints as decimal strings; viem wants bigint. Leave 0x / text alone. */
function hydrate(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(hydrate);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = hydrate(v);
  }
  return out;
}

function isHex(value: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

function main() {
  const file = JSON.parse(readFileSync(vectorsPath, 'utf8')) as GoldenFile;
  const builder = new LocalIntentBuilder(
    file.domain.chainId,
    file.domain.verifyingContract
  );

  let failures = 0;
  let checked = 0;
  let skipped = 0;

  for (const vector of file.vectors) {
    if (!INTENT_TYPES[vector.kind]) {
      skipped += 1;
      console.log(`SKIP  ${vector.kind} (not in LocalIntentBuilder)`);
      continue;
    }

    checked += 1;
    const message = hydrate(vector.message) as Record<string, unknown>;
    const payload = builder.build(vector.kind, message);
    const hashed = hashIntentDigest(vector.kind, payload.domain, message);

    const digestOk = payload.digest.toLowerCase() === vector.digest.toLowerCase();
    const hashOk = hashed.toLowerCase() === vector.digest.toLowerCase();
    const encodedOk = isHex(payload.encodedIntent) && payload.encodedIntent.length > 10;

    if (!digestOk || !hashOk || !encodedOk) failures += 1;

    console.log(`${digestOk && hashOk && encodedOk ? 'PASS' : 'FAIL'}  ${vector.kind}`);
    if (!digestOk) {
      console.log(`        digest    local: ${payload.digest}`);
      console.log(`        digest  golden: ${vector.digest}`);
    }
    if (!hashOk) {
      console.log(`        hashIntentDigest: ${hashed}`);
    }
    if (!encodedOk) {
      console.log(`        encodedIntent missing or not hex: ${payload.encodedIntent}`);
    } else {
      console.log(`        encodedIntent ${payload.encodedIntent.length - 2} hex chars`);
    }
  }

  if (checked === 0) {
    console.error('No golden vectors matched LocalIntentBuilder kinds.');
    process.exit(1);
  }

  console.log(
    failures === 0
      ? `\n${checked} vector(s) passed, ${skipped} skipped.`
      : `\n${failures} check(s) failed (${checked} checked, ${skipped} skipped).`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
