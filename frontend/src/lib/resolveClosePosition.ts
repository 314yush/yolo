import type { Trade } from '@/types';

export type ClosePositionSource = 'placeholder' | 'pusher' | 'poll';

export const POSITION_NOT_READY_MESSAGE =
  'Position still confirming — try again in a moment';

const RECENT_OPEN_WINDOW_SEC = 60;

/**
 * True when store identity is safe to sign a V2 close/flip.
 * `tradeIndex === 0` is a real slot when source is pusher/poll — do not treat
 * it as the home-screen placeholder. Require liquidationPrice > 0 so a partial
 * Pusher patch (index only, still Date.now() openedAt) is not treated as synced.
 */
export function hasSyncedCloseIdentity(
  trade: Trade | null | undefined,
  positionSource: ClosePositionSource
): trade is Trade {
  if (!trade) return false;
  if (positionSource !== 'pusher' && positionSource !== 'poll') return false;
  if (!(trade.openedAt > 0)) return false;
  if (!(trade.liquidationPrice > 0)) return false;
  return Number.isInteger(trade.tradeIndex) && trade.tradeIndex >= 0;
}

export function matchPositionForClose(
  trades: Trade[],
  hint: Pick<Trade, 'pairIndex' | 'isLong' | 'openedAt' | 'tradeIndex'>
): Trade | null {
  const nowSec = Math.floor(Date.now() / 1000);

  if (hint.tradeIndex > 0) {
    const exact = trades.find(
      (t) =>
        t.pairIndex === hint.pairIndex &&
        t.tradeIndex === hint.tradeIndex &&
        t.openedAt > 0
    );
    if (exact) return exact;
  }

  const recent = trades
    .filter(
      (t) =>
        t.pairIndex === hint.pairIndex &&
        t.isLong === hint.isLong &&
        t.openedAt > 0 &&
        t.openedAt >= nowSec - RECENT_OPEN_WINDOW_SEC
    )
    .sort((a, b) => {
      if (hint.openedAt > 0) {
        const da = Math.abs(a.openedAt - hint.openedAt);
        const db = Math.abs(b.openedAt - hint.openedAt);
        if (da !== db) return da - db;
      }
      return b.openedAt - a.openedAt;
    });

  return recent[0] ?? null;
}

/**
 * Resolve on-chain openedAt + tradeIndex before signing CloseTradeReq.
 * Prefers synced store fields; otherwise re-fetches user-data and matches
 * pairIndex + side + recent open.
 */
export async function resolveClosePosition(args: {
  trade: Trade;
  positionSource: ClosePositionSource;
  fetchTrades: () => Promise<Trade[]>;
}): Promise<Trade | null> {
  if (hasSyncedCloseIdentity(args.trade, args.positionSource)) {
    return args.trade;
  }

  try {
    const trades = await args.fetchTrades();
    return matchPositionForClose(trades, args.trade);
  } catch {
    return null;
  }
}
