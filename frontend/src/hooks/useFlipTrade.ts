'use client';

import { useCallback, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from './useDelegateWallet';
import { useAvantisAPI } from './useAvantisAPI';
import { useTxSigner } from './useTxSigner';
import { saveClosedTrade } from '@/lib/closedTrades';
import type { Trade } from '@/types';
import { DIRECTIONS, ASSETS, LEVERAGES } from '@/lib/constants';

export function useFlipTrade() {
  const { userAddress, setCurrentTrade, setPnLData, incrementTotalTrades, setSelection, selection, addPendingTradeHash, removePendingTradeHash, showToast } = useTradeStore();
  const { delegateAddress } = useDelegateWallet();
  const { buildCloseTradeTx, buildOpenTradeTx, getTrades, getPnL } = useAvantisAPI();
  const { signAndWait, signAndBroadcast } = useTxSigner();
  const [isFlipping, setIsFlipping] = useState(false);

  const flipTrade = useCallback(async (trade: Trade) => {
    if (!userAddress || !delegateAddress) {
      throw new Error('Missing user address or delegate address');
    }

    // Validate trade has required fields
    if (trade.pairIndex === undefined || trade.tradeIndex === undefined) {
      throw new Error(`Invalid trade data: missing pairIndex or tradeIndex. Trade: ${JSON.stringify(trade)}`);
    }

    // Double-check: Verify we're closing the correct trade by fetching current trades
    // This ensures we're closing the trade that matches both pairIndex AND tradeIndex
    const currentTrades = await getTrades(userAddress);
    const matchingTrade = currentTrades.find(
      t => t.pairIndex === trade.pairIndex && t.tradeIndex === trade.tradeIndex
    );
    
    if (!matchingTrade) {
      throw new Error(
        `Trade not found! Cannot flip trade with pairIndex=${trade.pairIndex}, tradeIndex=${trade.tradeIndex}. ` +
        `Available trades: ${currentTrades.map(t => `${t.pair} (pairIndex=${t.pairIndex}, tradeIndex=${t.tradeIndex})`).join(', ')}`
      );
    }
    
    // Verify the trade matches what we expect
    if (matchingTrade.pair !== trade.pair || matchingTrade.isLong !== trade.isLong) {
      console.warn(
        `[flipTrade] Trade mismatch! Expected: ${trade.pair} ${trade.isLong ? 'LONG' : 'SHORT'}, ` +
        `Found: ${matchingTrade.pair} ${matchingTrade.isLong ? 'LONG' : 'SHORT'}. ` +
        `Using found trade data.`
      );
      // Use the matching trade's data to ensure we close the right one
      trade = matchingTrade;
    }

    console.log(`[flipTrade] Closing trade: pairIndex=${trade.pairIndex}, tradeIndex=${trade.tradeIndex}, pair=${trade.pair}, isLong=${trade.isLong}`);

    setIsFlipping(true);

    try {
      // Get final PnL before closing
      const positions = await getPnL(userAddress);
      const pnlMap = new Map();
      positions.forEach((pos) => {
        const key = `${pos.trade.pairIndex}-${pos.trade.tradeIndex}`;
        pnlMap.set(key, pos);
      });
      const tradeKey = `${trade.pairIndex}-${trade.tradeIndex}`;
      const finalPnL = pnlMap.get(tradeKey) || null;

      // 1. Close current trade - ensure we're closing the correct trade by pairIndex and tradeIndex
      const closeTx = await buildCloseTradeTx(
        userAddress,
        delegateAddress,
        trade.pairIndex,
        trade.tradeIndex,
        trade.collateral
      );

      if (!closeTx) {
        throw new Error('Failed to build close transaction');
      }

      await signAndWait(closeTx);

      // Save closed trade (flip closes the original trade)
      saveClosedTrade(userAddress, trade, finalPnL);

      // 2. Open opposite direction
      const openTx = await buildOpenTradeTx({
        trader: userAddress,
        delegate: delegateAddress,
        pair: trade.pair,
        pairIndex: trade.pairIndex,
        leverage: trade.leverage,
        isLong: !trade.isLong, // Flip direction
        collateral: trade.collateral,
      });

      if (!openTx) {
        throw new Error('Failed to build open transaction');
      }

      const hash = await signAndBroadcast(openTx);

      // Add to pending trades for tracking
      addPendingTradeHash(hash);

      // 3. Poll aggressively for the new trade (similar to handleSpinComplete)
      let attempts = 0;
      const maxAttempts = 20; // 20 * 500ms = 10 seconds
      let notificationShown = false; // Track if we've shown the success notification
      
      const pollForTrade = async (): Promise<boolean> => {
        attempts++;
        
        // Try fetching trades first
        const trades = await getTrades(userAddress);
        
        if (trades.length > 0) {
          // Find the trade that matches our flipped parameters (opposite direction, same pair/leverage)
          const flippedTrade = trades.find(
            t => t.pairIndex === trade.pairIndex && 
                 t.leverage === trade.leverage && 
                 t.isLong === !trade.isLong
          ) || trades[trades.length - 1]; // Fallback to latest if not found
          
          setCurrentTrade(flippedTrade);
          setPnLData({
            trade: flippedTrade,
            currentPrice: flippedTrade.openPrice,
            pnl: 0,
            pnlPercentage: 0,
          });
          
          // Update selection to reflect the flipped trade's direction, asset, and leverage
          if (selection) {
            const newDirection = DIRECTIONS.find(d => d.isLong === flippedTrade.isLong) || DIRECTIONS[0];
            const asset = ASSETS.find(a => a.pairIndex === flippedTrade.pairIndex) || selection.asset;
            const leverage = LEVERAGES.find(l => l.value === flippedTrade.leverage) || selection.leverage;
            
            setSelection({
              asset,
              leverage,
              direction: newDirection,
            });
          }
          
          incrementTotalTrades();
          removePendingTradeHash(hash);
          
          // Show success notification only once
          if (!notificationShown) {
            const directionText = flippedTrade.isLong ? 'LONG' : 'SHORT';
            showToast(
              `Flip trade opened! ${flippedTrade.pair} ${directionText} at ${flippedTrade.leverage}x leverage`,
              'success',
              5000
            );
            notificationShown = true;
          }
          
          return true;
        }
        
        // Also try PnL endpoint
        const positions = await getPnL(userAddress);
        if (positions.length > 0) {
          const flippedPosition = positions.find(
            p => p.trade.pairIndex === trade.pairIndex && 
                 p.trade.leverage === trade.leverage && 
                 p.trade.isLong === !trade.isLong
          ) || positions[positions.length - 1];
          
          setCurrentTrade(flippedPosition.trade);
          setPnLData(flippedPosition);
          
          // Update selection
          if (selection) {
            const newDirection = DIRECTIONS.find(d => d.isLong === flippedPosition.trade.isLong) || DIRECTIONS[0];
            const asset = ASSETS.find(a => a.pairIndex === flippedPosition.trade.pairIndex) || selection.asset;
            const leverage = LEVERAGES.find(l => l.value === flippedPosition.trade.leverage) || selection.leverage;
            
            setSelection({
              asset,
              leverage,
              direction: newDirection,
            });
          }
          
          incrementTotalTrades();
          removePendingTradeHash(hash);
          
          // Show success notification only once
          if (!notificationShown) {
            const directionText = flippedPosition.trade.isLong ? 'LONG' : 'SHORT';
            showToast(
              `Flip trade opened! ${flippedPosition.trade.pair} ${directionText} at ${flippedPosition.trade.leverage}x leverage`,
              'success',
              5000
            );
            notificationShown = true;
          }
          
          return true;
        }
        
        return false;
      };
      
      // Try immediately
      if (await pollForTrade()) {
        return;
      }
      
      // Poll every 500ms
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await pollForTrade()) {
          return;
        }
      }
      
      // Still no trade after aggressive polling - remove pending hash and let PnL hook handle it
      console.warn('[flipTrade] New trade not found after aggressive polling');
      removePendingTradeHash(hash);
    } catch (error) {
      console.error('Flip trade error:', error);
      throw error;
    } finally {
      setIsFlipping(false);
    }
  }, [
    userAddress,
    delegateAddress,
    buildCloseTradeTx,
    buildOpenTradeTx,
    getTrades,
    getPnL,
    signAndWait,
    signAndBroadcast,
    setCurrentTrade,
    setPnLData,
    incrementTotalTrades,
    setSelection,
    selection,
    addPendingTradeHash,
    removePendingTradeHash,
    showToast,
  ]);

  return { flipTrade, isFlipping };
}
