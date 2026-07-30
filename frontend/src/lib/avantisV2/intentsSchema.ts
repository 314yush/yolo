/**
 * EIP-712 intent schemas mirrored from avantis-contracts-v2 SignatureHelpers
 * (via avantis_trader_sdk intents_schema.py). Do not rename fields.
 */

export type Eip712Field = { name: string; type: string };

export const TNC_STRING =
  'I accept the Avantis Terms of Service: https://www.avantisfi.com/docs/tos.' +
  'I confirm that I am not a resident of any of the following countries/regions: ' +
  'Belarus, Cuba, Iran, North Korea, Russia, Syria, Crimea, United Kingdom, ' +
  'United States of America.';

const TRADE_TYPE: Eip712Field[] = [
  { name: 'trader', type: 'address' },
  { name: 'pairIndex', type: 'uint256' },
  { name: 'index', type: 'uint256' },
  { name: 'initialPosToken', type: 'uint256' },
  { name: 'positionSizeUSDC', type: 'uint256' },
  { name: 'openPrice', type: 'uint256' },
  { name: 'buy', type: 'bool' },
  { name: 'leverage', type: 'uint256' },
  { name: 'tp', type: 'uint256' },
  { name: 'sl', type: 'uint256' },
  { name: 'timestamp', type: 'uint256' },
];

export const INTENT_TYPES: Record<string, Record<string, Eip712Field[]>> = {
  OpenTradeReq: {
    OpenTradeReq: [
      { name: '_t', type: 'Trade' },
      { name: '_type', type: 'uint8' },
      { name: '_slippageP', type: 'uint256' },
      { name: '_deadline', type: 'uint256' },
      { name: '_nonce', type: 'uint256' },
    ],
    Trade: TRADE_TYPE,
  },
  CloseTradeReq: {
    CloseTradeReq: [
      { name: '_trader', type: 'address' },
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_openTimestamp', type: 'uint256' },
      { name: '_amount', type: 'uint256' },
      { name: '_wantedPrice', type: 'uint256' },
      { name: '_deadline', type: 'uint256' },
      { name: '_nonce', type: 'uint256' },
    ],
  },
  DelegateReq: {
    DelegateReq: [
      { name: 'trader', type: 'address' },
      { name: 'delegate', type: 'address' },
      { name: 'expiry', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'tnc', type: 'string' },
      { name: 'nonce', type: 'uint256' },
    ],
  },
};

/** ABI encode field order differs from typed-data order only for DelegateReq. */
export const ABI_FIELD_ORDERS: Record<string, string[]> = {
  DelegateReq: ['trader', 'delegate', 'expiry', 'tnc', 'deadline', 'nonce'],
};

export function tradingDomain(chainId: number, tradingRouter: `0x${string}`) {
  return {
    name: 'AvantisTrading',
    version: '1',
    chainId: BigInt(chainId),
    verifyingContract: tradingRouter,
  };
}
