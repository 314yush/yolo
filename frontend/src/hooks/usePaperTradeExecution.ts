'use client';

import { useCallback, useRef, useState } from 'react';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { useTradeStore } from '@/store/tradeStore';
import { usePaperSimulatedConfirmation } from './usePaperSimulatedConfirmation';
import { usePaperBalance } from './usePaperBalance';
import { useSound } from './useSound';
import { getPairKey } from '@/lib/assetPair';
import { openPaperTrade, closePaperTrade } from '@/lib/paperTradeEngine';
import { computePaperPnL, loadOpenPaperTrades } from '@/lib/paperTrades';
import { refreshPaperStats } from '@/lib/paperStats';
import { ASSETS, DIRECTIONS, LEVERAGES } from '@/lib/constants';
import type { Trade, WheelSelection } from '@/types';

const MIN_POSITION_SIZE_USD = 100;

function buildFlipSelection(trade: Trade): WheelSelection {
  const asset = ASSETS.find((a) => a.pairIndex === trade.pairIndex) ?? ASSETS[0];
  const leverage = LEVERAGES.find((l) => l.value === trade.leverage) ?? LEVERAGES[0];
  const direction = trade.isLong ? DIRECTIONS[1] : DIRECTIONS[0];
  return { asset, leverage, direction };
}

export function usePaperTradeExecution() {
  const { guestId } = usePaperTrading();
  const { refresh: refreshBalance } = usePaperBalance();
  const { startConfirmation } = usePaperSimulatedConfirmation();
  const { playWin, playLose } = useSound();

  const {
    collateral,
    prices,
    settings,
    setStage,
    setError,
    setCurrentTrade,
    setPnLData,
    setPositionSource,
    setLastClosedTradeForShare,
    setIsIntentionalClose,
    setOpenTrades,
    showToast,
    reset,
  } = useTradeStore();

  const [isClosing, setIsClosing] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);

  const spinFinishedRef = useRef(false);
  const confirmedRef = useRef(false);
  const pendingTradeRef = useRef<Trade | null>(null);

  const syncOpenTrades = useCallback(() => {
    setOpenTrades(loadOpenPaperTrades(guestId));
    refreshPaperStats(guestId);
    refreshBalance();
  }, [guestId, setOpenTrades, refreshBalance]);

  const transitionToPnL = useCallback((trade: Trade) => {
    const livePrice = prices[trade.pair]?.price ?? trade.openPrice;
    setCurrentTrade(trade);
    setPnLData(computePaperPnL(trade, livePrice));
    setPositionSource('placeholder');
    setStage('pnl');
  }, [prices, setCurrentTrade, setPnLData, setPositionSource, setStage]);

  const handleSpinStart = useCallback(async () => {
    spinFinishedRef.current = false;
    confirmedRef.current = false;
    pendingTradeRef.current = null;

    const storeState = useTradeStore.getState();
    const currentSelection = storeState.selection;
    if (!currentSelection) return;

    const pairKey = getPairKey(currentSelection.asset);
    const openPrice = prices[pairKey]?.price ?? 0;
    if (openPrice <= 0) {
      setError('Price not available. Please wait for live prices.');
      setStage('error');
      return;
    }

    const positionSize = collateral * currentSelection.leverage.value;
    if (positionSize < MIN_POSITION_SIZE_USD) {
      setError(
        `Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE_USD.toFixed(2)}.`
      );
      setStage('error');
      return;
    }

    const trade = openPaperTrade({
      guestId,
      selection: currentSelection,
      collateral,
      openPrice,
      takeProfitPercent: settings.takeProfitPercent,
    });

    if (!trade) {
      setStage('idle');
      showToast('Insufficient paper balance', 'error');
      return;
    }

    pendingTradeRef.current = trade;
    startConfirmation();
    setStage('executing');
    syncOpenTrades();
  }, [
    guestId,
    collateral,
    prices,
    settings.takeProfitPercent,
    setStage,
    setError,
    showToast,
    startConfirmation,
    syncOpenTrades,
  ]);

  const handleSpinComplete = useCallback(async () => {
    spinFinishedRef.current = true;

    const { confirmationStage } = useTradeStore.getState();
    if (confirmationStage === 'confirmed' || confirmedRef.current) {
      const trade = pendingTradeRef.current;
      if (trade) transitionToPnL(trade);
      return;
    }

    const waitStart = Date.now();
    while (Date.now() - waitStart < 3000) {
      const state = useTradeStore.getState();
      if (state.confirmationStage === 'confirmed') {
        confirmedRef.current = true;
        const trade = pendingTradeRef.current;
        if (trade) transitionToPnL(trade);
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    setError('Simulated execution timed out. Please try again.');
    setStage('error');
  }, [transitionToPnL, setError, setStage]);

  // Transition when confirmation completes after spin finished
  const onConfirmationComplete = useCallback(() => {
    if (spinFinishedRef.current && pendingTradeRef.current) {
      confirmedRef.current = true;
      transitionToPnL(pendingTradeRef.current);
    }
  }, [transitionToPnL]);

  const handleCloseTrade = useCallback(async () => {
    const { currentTrade, pnlData } = useTradeStore.getState();
    if (!currentTrade) return;

    setIsIntentionalClose(true);
    setIsClosing(true);

    try {
      const closePrice = pnlData?.currentPrice ?? currentTrade.openPrice;
      const { closedTrade, pnlData: finalPnL } = closePaperTrade(
        guestId,
        currentTrade,
        closePrice
      );

      if (finalPnL.pnlPercentage >= 0) {
        playWin();
      } else {
        playLose();
      }

      setLastClosedTradeForShare(closedTrade);
      syncOpenTrades();
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to close trade';
      showToast(msg, 'error');
    } finally {
      setIsClosing(false);
      setIsIntentionalClose(false);
    }
  }, [
    guestId,
    setIsIntentionalClose,
    playWin,
    playLose,
    setLastClosedTradeForShare,
    syncOpenTrades,
    reset,
    showToast,
  ]);

  const handleFlipTrade = useCallback(async () => {
    const { currentTrade, pnlData } = useTradeStore.getState();
    if (!currentTrade) return;

    setIsIntentionalClose(true);
    setIsFlipping(true);

    try {
      const closePrice = pnlData?.currentPrice ?? currentTrade.openPrice;
      const flipSelection = buildFlipSelection(currentTrade);

      closePaperTrade(guestId, currentTrade, closePrice);

      await new Promise((r) => setTimeout(r, 400));

      const newTrade = openPaperTrade({
        guestId,
        selection: flipSelection,
        collateral: currentTrade.collateral,
        openPrice: closePrice,
        takeProfitPercent: settings.takeProfitPercent,
      });

      if (!newTrade) {
        showToast('Insufficient balance to flip', 'error');
        reset();
        return;
      }

      await new Promise((r) => setTimeout(r, 400));

      setCurrentTrade(newTrade);
      setPnLData(computePaperPnL(newTrade, closePrice));
      setPositionSource('placeholder');
      syncOpenTrades();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Flip failed', 'error');
    } finally {
      setIsFlipping(false);
      setIsIntentionalClose(false);
    }
  }, [
    guestId,
    settings.takeProfitPercent,
    setIsIntentionalClose,
    setCurrentTrade,
    setPnLData,
    setPositionSource,
    syncOpenTrades,
    reset,
    showToast,
  ]);

  const handleRollAgain = useCallback(() => {
    reset();
  }, [reset]);

  return {
    handleSpinStart,
    handleSpinComplete,
    handleCloseTrade,
    handleFlipTrade,
    handleRollAgain,
    onConfirmationComplete,
    isClosing,
    isFlipping,
    syncOpenTrades,
  };
}
