/**
 * ZFP (zero-fee perp) performance fee schedule.
 * "The More You Win, the More You Keep" - higher ROI = lower fee %.
 * From AVANTISAPI.md / Avantis pair pnlFees.
 */
export const PNL_FEES = {
  tierP: [1, 5, 25, 50, 100, 250, 500, 1500, 2500, 3000],
  feesP: [80, 50, 45, 37.5, 27.5, 25, 25, 22.5, 15, 2.5],
} as const;

function isFiniteNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Get the fee percentage to deduct from gross profit for a zfp trade.
 * Uses linear interpolation between tier thresholds.
 *
 * @param grossPnlP - Gross profit as percentage of collateral (e.g. 100 = 100% ROI)
 * @param tierP - Tier thresholds (Trader ROI %)
 * @param feesP - Fee % at each tier (amount taken from gross profit)
 * @returns Fee percentage (0-100) to apply to gross profit
 */
export function pnlFeeByGrossProfitP(
  grossPnlP: number,
  tierP: readonly number[],
  feesP: readonly number[]
): number {
  if (!isFiniteNumber(grossPnlP)) {
    console.warn('[pnlFeeByGrossProfitP] Invalid grossPnlP:', grossPnlP);
    return 0;
  }

  if (tierP.length !== feesP.length || tierP.length === 0) {
    console.warn('[pnlFeeByGrossProfitP] Invalid tier/fees arrays: length mismatch or empty');
    return 0;
  }

  if (grossPnlP <= tierP[0]) {
    return feesP[0];
  }

  const lastIdx = tierP.length - 1;
  if (grossPnlP >= tierP[lastIdx]) {
    return feesP[lastIdx];
  }

  // Find bracket: tierP[i] <= grossPnlP < tierP[i+1]
  for (let i = 0; i < lastIdx; i++) {
    if (grossPnlP < tierP[i + 1]) {
      const t0 = tierP[i];
      const t1 = tierP[i + 1];
      const f0 = feesP[i];
      const f1 = feesP[i + 1];
      const denom = t1 - t0;
      if (!isFiniteNumber(denom) || denom === 0) {
        console.warn('[pnlFeeByGrossProfitP] Invalid tier bracket: t0=', t0, 't1=', t1);
        return f0;
      }
      const t = (grossPnlP - t0) / denom;
      const fee = f0 + t * (f1 - f0);
      return isFiniteNumber(fee) ? fee : f0;
    }
  }

  return feesP[lastIdx];
}

/**
 * Solve for gross PnL % that yields a target net PnL % (after ZFP fees).
 * netPnlP = grossPnlP × (1 - feeP(grossPnlP) / 100)
 * Solves iteratively since feeP depends on grossPnlP (tier is gross-based).
 *
 * @param targetNetPnlP - Desired net PnL % (e.g. 50 = user sees 50% profit when TP hits)
 * @param tierP - Fee tier thresholds (gross ROI % at each tier)
 * @param feesP - Fee % at each tier (taken from gross profit)
 * @returns Gross PnL % needed to achieve target net %
 */
export function grossPnlPForNetPnlP(
  targetNetPnlP: number,
  tierP: readonly number[],
  feesP: readonly number[]
): number {
  if (!isFiniteNumber(targetNetPnlP) || targetNetPnlP <= 0) {
    return targetNetPnlP;
  }
  if (tierP.length !== feesP.length || tierP.length === 0) {
    return targetNetPnlP;
  }

  // Fixed-point iteration: gross = targetNet / (1 - feeP(gross)/100)
  let gross = targetNetPnlP;
  for (let i = 0; i < 50; i++) {
    const feeP = pnlFeeByGrossProfitP(gross, tierP, feesP);
    const factor = 1 - feeP / 100;
    if (factor <= 0 || !Number.isFinite(factor)) {
      return gross;
    }
    const nextGross = targetNetPnlP / factor;
    if (!Number.isFinite(nextGross)) return gross;
    if (Math.abs(nextGross - gross) < 0.01) {
      return nextGross;
    }
    gross = nextGross;
  }
  return gross;
}
