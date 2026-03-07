/**
 * Activity tracking API client.
 * Fire-and-forget for log calls - no blocking UX.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface LogTradeOpenParams {
  wallet: string;
  pair: string;
  pairIndex: number;
  tradeIndex: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  collateral: number;
  entryPrice: number;
  tpPrice?: number;
  liqPrice?: number;
  txHash?: string;
}

export interface LogTradeCloseByPositionParams {
  wallet: string;
  pairIndex: number;
  tradeIndex: number;
  exitPrice?: number;
  pnl?: number;
  closedAt?: string;
  txHash?: string;
  isLiquidated?: boolean;
}

export interface ActivityStats {
  total_trades: number;
  total_volume: number;
  total_pnl: number;
  win_rate: number;
  open_trades: number;
}

export interface ActivityTrade {
  id: string;
  wallet_address: string;
  pair: string;
  pair_index: number | null;
  trade_index: number | null;
  direction: string;
  leverage: number;
  collateral: number;
  volume: number;
  entry_price: number;
  tp_price: number | null;
  liq_price: number | null;
  exit_price: number | null;
  pnl: number | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  tx_hash_open: string | null;
  tx_hash_close: string | null;
}

export interface ActivityTradesResponse {
  trades: ActivityTrade[];
  total: number;
  page: number;
  has_more: boolean;
}

/**
 * Log an opened trade. Fire-and-forget - catches and logs errors.
 */
export async function logTradeOpen(params: LogTradeOpenParams): Promise<{ trade_id: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/trades/log-open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: params.wallet,
        pair: params.pair,
        pair_index: params.pairIndex,
        trade_index: params.tradeIndex,
        direction: params.direction,
        leverage: params.leverage,
        collateral: params.collateral,
        entry_price: params.entryPrice,
        tp_price: params.tpPrice ?? null,
        liq_price: params.liqPrice ?? null,
        tx_hash: params.txHash ?? null,
      }),
    });
    if (!res.ok) {
      console.warn('[activityApi] logTradeOpen failed:', res.status, await res.text());
      return null;
    }
    return (await res.json()) as { trade_id: string };
  } catch (err) {
    console.warn('[activityApi] logTradeOpen error:', err);
    return null;
  }
}

/**
 * Log a closed trade by position. Fire-and-forget - catches and logs errors.
 */
export async function logTradeCloseByPosition(
  params: LogTradeCloseByPositionParams
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/trades/log-close-by-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: params.wallet,
        pair_index: params.pairIndex,
        trade_index: params.tradeIndex,
        exit_price: params.exitPrice ?? null,
        pnl: params.pnl ?? null,
        closed_at: params.closedAt ?? null,
        tx_hash: params.txHash ?? null,
        is_liquidated: params.isLiquidated ?? false,
      }),
    });
    if (!res.ok) {
      console.warn('[activityApi] logTradeCloseByPosition failed:', res.status, await res.text());
    }
  } catch (err) {
    console.warn('[activityApi] logTradeCloseByPosition error:', err);
  }
}

/**
 * Get activity stats for a wallet.
 */
export async function getActivityStats(wallet: string): Promise<ActivityStats | null> {
  try {
    const res = await fetch(
      `${API_BASE}/activity/stats?wallet=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) return null;
    return (await res.json()) as ActivityStats;
  } catch (err) {
    console.warn('[activityApi] getActivityStats error:', err);
    return null;
  }
}

/**
 * Get paginated trade history for a wallet.
 */
export async function getActivityTrades(
  wallet: string,
  limit: number = 20,
  offset: number = 0
): Promise<ActivityTradesResponse | null> {
  try {
    const res = await fetch(
      `${API_BASE}/activity/trades?wallet=${encodeURIComponent(wallet)}&limit=${limit}&offset=${offset}`
    );
    if (!res.ok) return null;
    return (await res.json()) as ActivityTradesResponse;
  } catch (err) {
    console.warn('[activityApi] getActivityTrades error:', err);
    return null;
  }
}

/**
 * Check if a wallet has completed onboarding (backend source of truth).
 * Returns true if activity_users.onboarding_complete or wallet has any trades (legacy).
 */
export async function getOnboardingStatus(wallet: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/activity/onboarding-status?wallet=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { completed: boolean };
    return data.completed;
  } catch (err) {
    console.warn('[activityApi] getOnboardingStatus error:', err);
    return false;
  }
}

/**
 * Mark onboarding as complete for a wallet. Called when SetupFlow completes successfully.
 */
export async function markOnboardingCompleteApi(wallet: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/activity/onboarding-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
    if (!res.ok) {
      console.warn('[activityApi] markOnboardingCompleteApi failed:', res.status, await res.text());
    }
  } catch (err) {
    console.warn('[activityApi] markOnboardingCompleteApi error:', err);
  }
}
