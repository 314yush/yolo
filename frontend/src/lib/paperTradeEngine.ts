import type { ClosedTrade, Trade, WheelSelection } from '@/types';
import { getPairKey } from './assetPair';
import {
  calculateLiquidationPrice,
  calculateTakeProfitPrice,
} from './paperLiquidation';
import {
  addOpenPaperTrade,
  buildClosedTradeFromPnL,
  computePaperPnL,
  removeOpenPaperTrade,
  saveClosedPaperTrade,
} from './paperTrades';
import {
  creditBalance,
  deductCollateral,
  nextTradeIndex,
} from './paperWallet';

export interface OpenPaperTradeParams {
  guestId: string;
  selection: WheelSelection;
  collateral: number;
  openPrice: number;
  takeProfitPercent: number;
}

export interface ClosePaperTradeResult {
  closedTrade: ClosedTrade;
  pnlData: ReturnType<typeof computePaperPnL>;
}

export function openPaperTrade(params: OpenPaperTradeParams): Trade | null {
  const { guestId, selection, collateral, openPrice, takeProfitPercent } = params;

  if (deductCollateral(guestId, collateral) === null) {
    return null;
  }

  const tradeIndex = nextTradeIndex(guestId);
  const isLong = selection.direction.isLong;
  const leverage = selection.leverage.value;

  const trade: Trade = {
    tradeIndex,
    pairIndex: selection.asset.pairIndex,
    pair: getPairKey(selection.asset),
    collateral,
    leverage,
    isLong,
    openPrice,
    tp: calculateTakeProfitPrice(openPrice, isLong, leverage, takeProfitPercent),
    sl: 0,
    liquidationPrice: calculateLiquidationPrice(openPrice, leverage, isLong),
    openedAt: Math.floor(Date.now() / 1000),
  };

  addOpenPaperTrade(guestId, trade);
  return trade;
}

export function closePaperTrade(
  guestId: string,
  trade: Trade,
  currentPrice: number,
  options: { isLiquidated?: boolean; isTakeProfitHit?: boolean } = {}
): ClosePaperTradeResult {
  removeOpenPaperTrade(guestId, trade.pairIndex, trade.tradeIndex, trade.openedAt);

  const pnlData = computePaperPnL(trade, currentPrice);
  const closedTrade = buildClosedTradeFromPnL(trade, pnlData, {
    ...options,
    closePrice: currentPrice,
  });

  saveClosedPaperTrade(guestId, closedTrade);

  const returnAmount = options.isLiquidated
    ? 0
    : trade.collateral + closedTrade.finalPnL;
  if (returnAmount > 0) {
    creditBalance(guestId, returnAmount);
  }

  return { closedTrade, pnlData };
}

export function flipPaperTrade(
  guestId: string,
  trade: Trade,
  currentPrice: number,
  newSelection: WheelSelection,
  takeProfitPercent: number
): Trade | null {
  closePaperTrade(guestId, trade, currentPrice);

  return openPaperTrade({
    guestId,
    selection: newSelection,
    collateral: trade.collateral,
    openPrice: currentPrice,
    takeProfitPercent,
  });
}
