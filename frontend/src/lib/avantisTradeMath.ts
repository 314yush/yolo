/**
 * Avantis trade math and contract constants.
 *
 * This used to encode v1 `openTrade` / `closeTradeMarket` / `delegatedAction`
 * calldata. Those builders are gone: v2 takes signed EIP-712 intents instead,
 * and the old calldata reverts against the live contracts. What is left is the
 * pure math the UI still needs plus the addresses we read from.
 */

import { PNL_FEES, grossPnlPForNetPnlP } from './pnlFees';
import { MIN_POSITION_USDC, minPositionUsdcFor } from './avantisV2/pairs';

export const AVANTIS_CONTRACTS = {
  TradingStorage: '0x8a311D7048c35985aa31C131B9A13e03a5f7422d' as `0x${string}`,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
};

export const ERC20_ALLOWANCE_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Take-profit price multiplier, solved against NET PnL rather than gross.
 *
 * Avantis charges a tiered performance fee, and the number the user sees on
 * screen is after that fee. So we look up the fee at the target net tier, gross
 * it up, and convert that to a price multiple — otherwise a "200%" TP would
 * fire while the user is still looking at something well short of 200%.
 */
export function calculateTakeProfitMultiplier(
  isLong: boolean,
  leverage: number,
  targetNetPnlP: number = 200
): number {
  const grossPnlP = grossPnlPForNetPnlP(targetNetPnlP, PNL_FEES.tierP, PNL_FEES.feesP);
  const ratio = grossPnlP / (100 * leverage);
  return isLong ? 1 + ratio : 1 - ratio;
}

/**
 * Validate minimum position size (collateral × leverage).
 *
 * The minimum is per-pair, not global: $100 on crypto, $300 on forex and
 * commodities, $10 on the long tail. Pass `pairIndex` to use the pair's real
 * value from the catalog; without it this falls back to the crypto minimum.
 */
export function validatePositionSize(
  collateral: number,
  leverage: number,
  pairIndex?: number
): { valid: boolean; error?: string; positionSize: number } {
  const minPositionSize =
    pairIndex == null ? MIN_POSITION_USDC : minPositionUsdcFor(pairIndex);
  const positionSize = collateral * leverage;

  if (positionSize < minPositionSize) {
    const minCollateral = minPositionSize / leverage;
    return {
      valid: false,
      error:
        `Position size $${positionSize.toFixed(2)} is below minimum $${minPositionSize}. ` +
        `With ${leverage}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC.`,
      positionSize,
    };
  }

  return { valid: true, positionSize };
}
