/**
 * One-time onboarding txs for v2 (Privy-sponsored).
 * setDelegate now requires an expiry (unix seconds).
 */

import { encodeFunctionData, maxUint256 } from 'viem';
import {
  AVANTIS_V2_FALLBACK_ADDRESSES,
  CHAIN_ID_BASE,
  DEFAULT_DELEGATE_TTL_SECONDS,
} from './config';
import type { UnsignedTx } from '@/types';

const SET_DELEGATE_ABI = [
  {
    name: 'setDelegate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'expiry', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const REMOVE_DELEGATE_ABI = [
  {
    name: 'removeDelegate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'delegate', type: 'address' }],
    outputs: [],
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export function buildSetDelegateTxV2(
  delegateAddress: `0x${string}`,
  expirySeconds?: number,
  tradingRouter: `0x${string}` = AVANTIS_V2_FALLBACK_ADDRESSES.tradingRouter
): UnsignedTx {
  const expiry =
    expirySeconds ??
    Math.floor(Date.now() / 1000) + DEFAULT_DELEGATE_TTL_SECONDS;

  return {
    to: tradingRouter,
    data: encodeFunctionData({
      abi: SET_DELEGATE_ABI,
      functionName: 'setDelegate',
      args: [delegateAddress, BigInt(expiry)],
    }),
    value: '0x0',
    chainId: CHAIN_ID_BASE,
  };
}

export function buildRemoveDelegateTxV2(
  delegateAddress: `0x${string}`,
  tradingRouter: `0x${string}` = AVANTIS_V2_FALLBACK_ADDRESSES.tradingRouter
): UnsignedTx {
  return {
    to: tradingRouter,
    data: encodeFunctionData({
      abi: REMOVE_DELEGATE_ABI,
      functionName: 'removeDelegate',
      args: [delegateAddress],
    }),
    value: '0x0',
    chainId: CHAIN_ID_BASE,
  };
}

export function buildUsdcApprovalTxV2(
  amount: bigint = maxUint256,
  tradingStorage: `0x${string}` = AVANTIS_V2_FALLBACK_ADDRESSES.tradingStorage,
  usdc: `0x${string}` = AVANTIS_V2_FALLBACK_ADDRESSES.usdc
): UnsignedTx {
  return {
    to: usdc,
    data: encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [tradingStorage, amount],
    }),
    value: '0x0',
    chainId: CHAIN_ID_BASE,
  };
}
