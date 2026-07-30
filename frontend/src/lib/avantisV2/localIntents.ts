/**
 * Local EIP-712 intent builder (market-maker fast path).
 * Zero HTTP on the hot path after /v2/meta bootstrap.
 */

import {
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  type Hex,
} from 'viem';
import {
  ABI_FIELD_ORDERS,
  INTENT_TYPES,
  TNC_STRING,
  tradingDomain,
  type Eip712Field,
} from './intentsSchema';
import {
  DEFAULT_INTENT_DEADLINE_MS,
  OPEN_ORDER_TYPE,
} from './config';

const USDC = 10n ** 6n;
const P10 = 10n ** 10n;

export type IntentPayload = {
  intent: string;
  signerRule: 'trader-or-delegate' | 'trader-only';
  domain: {
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: `0x${string}`;
  };
  primaryType: string;
  types: Record<string, Eip712Field[]>;
  message: Record<string, unknown>;
  digest: Hex;
  encodedIntent: Hex;
};

function randomNonce(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function toScaled(value: number, scale: bigint): bigint {
  // Avoid float precision issues for typical USD/leverage inputs
  const s = value.toFixed(10);
  const [whole, frac = ''] = s.split('.');
  const scaleDigits = scale === USDC ? 6 : 10;
  const padded = (frac + '0'.repeat(scaleDigits)).slice(0, scaleDigits);
  return BigInt(whole) * scale + BigInt(padded || '0');
}

function fieldComponents(fields: Eip712Field[], types: Record<string, Eip712Field[]>): unknown[] {
  return fields.map((f) => {
    if (types[f.type]) {
      return {
        type: 'tuple',
        components: fieldComponents(types[f.type], types),
      };
    }
    return { type: f.type, name: f.name };
  });
}

function abiValues(
  kind: string,
  message: Record<string, unknown>
): unknown[] {
  const types = INTENT_TYPES[kind];
  const fields = types[kind];
  const order = ABI_FIELD_ORDERS[kind] ?? fields.map((f) => f.name);
  const fieldTypes = Object.fromEntries(fields.map((f) => [f.name, f.type]));

  return order.map((name) => {
    const t = fieldTypes[name];
    const v = message[name];
    if (types[t]) {
      const inner = types[t];
      const nested = v as Record<string, unknown>;
      return inner.map((f) => nested[f.name]);
    }
    return v;
  });
}

export class LocalIntentBuilder {
  chainId: number;
  tradingRouter: `0x${string}`;
  defaultDeadlineMs: number;

  constructor(
    chainId: number,
    tradingRouter: `0x${string}`,
    defaultDeadlineMs = DEFAULT_INTENT_DEADLINE_MS
  ) {
    this.chainId = chainId;
    this.tradingRouter = getAddress(tradingRouter);
    this.defaultDeadlineMs = defaultDeadlineMs;
  }

  static fromMeta(meta: {
    chainId: number;
    addresses: { tradingRouter: string };
    defaults?: { intentDeadlineMs?: number };
  }): LocalIntentBuilder {
    return new LocalIntentBuilder(
      meta.chainId,
      meta.addresses.tradingRouter as `0x${string}`,
      meta.defaults?.intentDeadlineMs ?? DEFAULT_INTENT_DEADLINE_MS
    );
  }

  private deadline(deadlineMs?: number): bigint {
    return BigInt(
      deadlineMs ?? Date.now() + this.defaultDeadlineMs
    );
  }

  private nonce(nonce?: bigint): bigint {
    return nonce ?? randomNonce();
  }

  build(kind: string, message: Record<string, unknown>): IntentPayload {
    const types = INTENT_TYPES[kind];
    if (!types) throw new Error(`Unknown intent kind: ${kind}`);

    const domain = tradingDomain(this.chainId, this.tradingRouter);
    // Dynamic intent kinds — viem's typed-data generics can't follow runtime schemas.
    const digest = hashTypedData({
      domain,
      types,
      primaryType: kind,
      message,
    } as Parameters<typeof hashTypedData>[0]);

    const fields = types[kind];
    const order = ABI_FIELD_ORDERS[kind] ?? fields.map((f) => f.name);
    const orderedFields = order.map((name) => {
      const f = fields.find((x) => x.name === name);
      if (!f) throw new Error(`Missing field ${name} in ${kind}`);
      return f;
    });

    const encodedIntent = encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: fieldComponents(orderedFields, types) as never,
        },
      ],
      [abiValues(kind, message) as never]
    );

    return {
      intent: kind,
      signerRule: kind === 'DelegateReq' ? 'trader-only' : 'trader-or-delegate',
      domain,
      primaryType: kind,
      types,
      message,
      digest,
      encodedIntent,
    };
  }

  private tradeStruct(params: {
    trader: `0x${string}`;
    pairIndex: number;
    isLong: boolean;
    collateralUsdc: number;
    leverage: number;
    openPrice: number;
    tp: number;
    sl: number;
  }) {
    return {
      trader: getAddress(params.trader),
      pairIndex: BigInt(params.pairIndex),
      index: 0n,
      initialPosToken: 0n,
      positionSizeUSDC: toScaled(params.collateralUsdc, USDC),
      openPrice: toScaled(params.openPrice, P10),
      buy: params.isLong,
      leverage: toScaled(params.leverage, P10),
      tp: toScaled(params.tp, P10),
      sl: toScaled(params.sl, P10),
      timestamp: 0n,
    };
  }

  openTrade(params: {
    trader: `0x${string}`;
    pairIndex: number;
    isLong: boolean;
    collateralUsdc: number;
    leverage: number;
    openPrice: number;
    orderType?: number;
    tp?: number;
    sl?: number;
    slippagePercent?: number;
    nonce?: bigint;
    deadlineMs?: number;
  }): IntentPayload {
    const message = {
      _t: this.tradeStruct({
        trader: params.trader,
        pairIndex: params.pairIndex,
        isLong: params.isLong,
        collateralUsdc: params.collateralUsdc,
        leverage: params.leverage,
        openPrice: params.openPrice,
        tp: params.tp ?? 0,
        sl: params.sl ?? 0,
      }),
      _type: params.orderType ?? OPEN_ORDER_TYPE.MARKET_PNL,
      _slippageP: toScaled(params.slippagePercent ?? 1, P10),
      _deadline: this.deadline(params.deadlineMs),
      _nonce: this.nonce(params.nonce),
    };
    return this.build('OpenTradeReq', message);
  }

  closeTrade(params: {
    trader: `0x${string}`;
    pairIndex: number;
    index: number;
    openTimestamp: number;
    amountUsdc: number;
    wantedPrice: number;
    nonce?: bigint;
    deadlineMs?: number;
  }): IntentPayload {
    const message = {
      _trader: getAddress(params.trader),
      _pairIndex: BigInt(params.pairIndex),
      _index: BigInt(params.index),
      _openTimestamp: BigInt(params.openTimestamp),
      _amount: toScaled(params.amountUsdc, USDC),
      _wantedPrice: toScaled(params.wantedPrice, P10),
      _deadline: this.deadline(params.deadlineMs),
      _nonce: this.nonce(params.nonce),
    };
    return this.build('CloseTradeReq', message);
  }

  delegateReq(params: {
    trader: `0x${string}`;
    delegate: `0x${string}`;
    expirySeconds: number;
    nonce?: bigint;
    deadlineMs?: number;
  }): IntentPayload {
    const message = {
      trader: getAddress(params.trader),
      delegate: getAddress(params.delegate),
      expiry: BigInt(params.expirySeconds),
      deadline: this.deadline(params.deadlineMs),
      tnc: TNC_STRING,
      nonce: this.nonce(params.nonce),
    };
    return this.build('DelegateReq', message);
  }
}

/** Exported for golden-vector tests. */
export function hashIntentDigest(
  kind: string,
  domain: IntentPayload['domain'],
  message: Record<string, unknown>
): Hex {
  const types = INTENT_TYPES[kind];
  return hashTypedData({
    domain,
    types,
    primaryType: kind,
    message,
  } as Parameters<typeof hashTypedData>[0]);
}
