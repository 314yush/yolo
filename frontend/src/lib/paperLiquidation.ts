import { calculateTakeProfitMultiplier } from './avantisTradeMath';

/**
 * Approximate Upside liquidation distance for high-leverage positions.
 * At 250x (BTC cap) liq is ~0.4% from entry; at 75x (XRP/HYPE) ~1.3%.
 */
export function calculateLiquidationPrice(
  openPrice: number,
  leverage: number,
  isLong: boolean
): number {
  if (!Number.isFinite(openPrice) || openPrice <= 0 || !Number.isFinite(leverage) || leverage <= 0) {
    return 0;
  }

  const liqDistancePct = 100 / leverage;

  if (isLong) {
    return openPrice * (1 - liqDistancePct / 100);
  }
  return openPrice * (1 + liqDistancePct / 100);
}

export function calculateTakeProfitPrice(
  openPrice: number,
  isLong: boolean,
  leverage: number,
  takeProfitPercent: number
): number {
  const multiplier = calculateTakeProfitMultiplier(isLong, leverage, takeProfitPercent);
  return openPrice * multiplier;
}

export function isLiquidatedByPrice(
  currentPrice: number,
  liquidationPrice: number,
  isLong: boolean
): boolean {
  if (liquidationPrice <= 0 || currentPrice <= 0) return false;
  if (isLong) return currentPrice <= liquidationPrice;
  return currentPrice >= liquidationPrice;
}

export function isTakeProfitHitByPrice(
  currentPrice: number,
  tpPrice: number,
  isLong: boolean
): boolean {
  if (tpPrice <= 0 || currentPrice <= 0) return false;
  if (isLong) return currentPrice >= tpPrice;
  return currentPrice <= tpPrice;
}
