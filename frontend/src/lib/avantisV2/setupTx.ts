/**
 * One-time onboarding tx for v2 (Privy-sponsored).
 *
 * Only the USDC allowance is needed. Trades are EIP-712 intents signed by the
 * trader's own wallet, so no delegate is ever registered — and a delegate could
 * not approve USDC anyway.
 */

import { encodeFunctionData, maxUint256 } from 'viem';
import { AVANTIS_V2_FALLBACK_ADDRESSES, CHAIN_ID_BASE } from './config';
import type { UnsignedTx } from '@/types';

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
