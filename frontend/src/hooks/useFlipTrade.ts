'use client';

import { useCallback, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from './useDelegateWallet';
import { useAvantisAPI } from './useAvantisAPI';
import { useTxSigner } from './useTxSigner';
import { useSound } from './useSound';
import { saveClosedTrade } from '@/lib/closedTrades';
import { buildCloseTradeTx as buildCloseTradeTxDirect, buildOpenTradeTx as buildOpenTradeTxDirect, AVANTIS_CONTRACTS } from '@/lib/avantisEncoder';
import type { Trade } from '@/types';
import { DIRECTIONS, ASSETS, LEVERAGES } from '@/lib/constants';
import { publicClient } from '@/lib/viemClient';

export function useFlipTrade() {
  const { 
    userAddress, 
    setCurrentTrade, 
    setPnLData, 
    incrementTotalTrades, 
    setSelection, 
    selection, 
    addPendingTradeHash, 
    removePendingTradeHash, 
    showToast,
    prices,           // Real-time Pyth prices
  } = useTradeStore();
  const { delegateAddress } = useDelegateWallet();
  const { getTrades, getPnL } = useAvantisAPI();  // Only need read operations now
  const { signAndWait, signAndBroadcast } = useTxSigner();
  const { playFlip } = useSound();
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

    // Ensure we're using the matching trade's pair (which matches the pairIndex)
    const pairToUse = matchingTrade.pair; // Use the verified trade's pair
    
    console.log(`[flipTrade] Closing trade: pairIndex=${trade.pairIndex}, tradeIndex=${trade.tradeIndex}, pair=${pairToUse}, isLong=${trade.isLong}`);

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

      // Validate minimum position size before proceeding
      // Avantis requires minimum position size of $100
      const MIN_POSITION_SIZE_USD = 100.0;
      const positionSize = trade.collateral * trade.leverage;
      if (positionSize < MIN_POSITION_SIZE_USD) {
        const minCollateral = MIN_POSITION_SIZE_USD / trade.leverage;
        throw new Error(
          `Cannot flip trade: Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE_USD.toFixed(2)}. ` +
          `With ${trade.leverage}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC. ` +
          `Current collateral: $${trade.collateral.toFixed(2)} USDC`
        );
      }

      // Build close transaction
      const closeTx = buildCloseTradeTxDirect({
        trader: userAddress,
        pairIndex: trade.pairIndex,
        tradeIndex: trade.tradeIndex,
        collateralToClose: trade.collateral,
      });

      // Close position first
      await signAndWait(closeTx);
      saveClosedTrade(userAddress, trade, finalPnL);

      // Wait a moment for the close to settle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check actual USDC balance after closing
      let actualUsdcBalance = 0;
      try {
        const balanceBigInt = await publicClient.readContract({
          address: AVANTIS_CONTRACTS.USDC,
          abi: [
            {
              constant: true,
              inputs: [{ name: '_owner', type: 'address' }],
              name: 'balanceOf',
              outputs: [{ name: 'balance', type: 'uint256' }],
              type: 'function',
            },
          ],
          functionName: 'balanceOf',
          args: [userAddress],
        });
        actualUsdcBalance = Number(balanceBigInt) / 1e6; // USDC has 6 decimals
      } catch (err) {
        console.warn('Failed to check USDC balance:', err);
      }

      // Rebuild open transaction with fresh price data after closing
      // This ensures we use the latest price and that the close has completed
      const currentPrice = prices[pairToUse]?.price;
      if (!currentPrice) {
        throw new Error(`No price available for ${pairToUse}. Wait for Pyth connection.`);
      }

      // Use actual available balance, but cap at original collateral
      // If user had a loss, they might not have enough for the same collateral
      const availableCollateral = Math.min(actualUsdcBalance, trade.collateral);
      
      // Validate minimum position size with available collateral
      const positionSizeWithAvailable = availableCollateral * trade.leverage;
      if (positionSizeWithAvailable < 100) {
        throw new Error(
          `Cannot flip trade: After closing, available balance (${actualUsdcBalance.toFixed(2)} USDC) ` +
          `is insufficient for minimum position size. With ${trade.leverage}x leverage, ` +
          `you need at least ${(100 / trade.leverage).toFixed(2)} USDC.`
        );
      }

      // Build open transaction with fresh price and available collateral
      const openTx = buildOpenTradeTxDirect({
        trader: userAddress,
        pairIndex: trade.pairIndex,
        collateral: availableCollateral, // Use available balance, capped at original
        leverage: trade.leverage,
        isLong: !trade.isLong, // Flip direction
        openPrice: currentPrice, // Use current price
      });

      // Open opposite position
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
          let flippedTrade = trades.find(
            t => t.pairIndex === trade.pairIndex && 
                 t.leverage === trade.leverage && 
                 t.isLong === !trade.isLong
          );
          
          // FIX: Fallback to newest trade by timestamp, not array order
          if (!flippedTrade) {
            const sortedTrades = [...trades].sort((a, b) => b.openedAt - a.openedAt);
            flippedTrade = sortedTrades[0];
          }
          
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
            playFlip();
            notificationShown = true;
          }
          
          return true;
        }
        
        // Also try PnL endpoint
        const positions = await getPnL(userAddress);
        if (positions.length > 0) {
          let flippedPosition = positions.find(
            p => p.trade.pairIndex === trade.pairIndex && 
                 p.trade.leverage === trade.leverage && 
                 p.trade.isLong === !trade.isLong
          );
          
          // FIX: Fallback to newest position by timestamp, not array order
          if (!flippedPosition) {
            const sortedPositions = [...positions].sort((a, b) => b.trade.openedAt - a.trade.openedAt);
            flippedPosition = sortedPositions[0];
          }
          
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
            playFlip();
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
    prices,
    playFlip,
  ]);

  return { flipTrade, isFlipping };
}
