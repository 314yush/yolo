'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from './useDelegateWallet';
import { buildFlipTradeTxs } from '@/lib/avantisEncoder';

const REBUILD_DEBOUNCE_MS = 100;
const PRICE_TOLERANCE_PERCENT = 0.5;
const TTL_MS = 30000; // 30 seconds

/**
 * Pre-builds flip trade transactions (close + open opposite).
 * 
 * Automatically rebuilds when:
 * - currentTrade changes
 * - Price moves significantly (> 0.5%)
 * - TTL expires (30 seconds)
 */
export function usePrebuiltFlipTx() {
  const {
    currentTrade,
    userAddress,
    prices,
    prebuiltFlipTxs,
    setPrebuiltFlipTxs,
    setIsPrebuildingFlip,
  } = useTradeStore();
  
  const { delegateAddress } = useDelegateWallet();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isBuildingRef = useRef(false);

  const prebuildMetaRef = useRef<{
    timestamp: number;
    price: number;
    tradeKey: string;
  } | null>(null);

  const getTradeKey = useCallback(() => {
    if (!currentTrade) return '';
    return `${currentTrade.pairIndex}-${currentTrade.tradeIndex}-${currentTrade.isLong}`;
  }, [currentTrade]);

  // Build flip transactions
  const buildTxs = useCallback(() => {
    if (!currentTrade || !userAddress || !delegateAddress) {
      setPrebuiltFlipTxs(null);
      return;
    }

    // Validate trade has required fields
    if (currentTrade.pairIndex === undefined || currentTrade.tradeIndex === undefined) {
      console.log('[PrebuiltFlipTx] Missing pairIndex or tradeIndex, skipping build');
      setPrebuiltFlipTxs(null);
      return;
    }

    // Get current price from Pyth
    const pair = currentTrade.pair;
    const currentPrice = prices[pair]?.price;
    
    if (!currentPrice) return; // Wait for Pyth price

    if (isBuildingRef.current) return;

    isBuildingRef.current = true;
    setIsPrebuildingFlip(true);

    try {
      const txs = buildFlipTradeTxs({
        trader: userAddress,
        pairIndex: currentTrade.pairIndex,
        tradeIndex: currentTrade.tradeIndex,
        collateral: currentTrade.collateral,
        leverage: currentTrade.leverage,
        currentIsLong: currentTrade.isLong,
        currentPrice,
      });

      setPrebuiltFlipTxs(txs);
      prebuildMetaRef.current = {
        timestamp: Date.now(),
        price: currentPrice,
        tradeKey: getTradeKey(),
      };
    } catch (err) {
      console.error('[PrebuiltFlipTx] Build failed:', err);
      setPrebuiltFlipTxs(null);
    } finally {
      isBuildingRef.current = false;
      setIsPrebuildingFlip(false);
    }
  }, [currentTrade, userAddress, delegateAddress, prices, setPrebuiltFlipTxs, setIsPrebuildingFlip, getTradeKey]);

  // Debounced build
  const debouncedBuild = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(buildTxs, REBUILD_DEBOUNCE_MS);
  }, [buildTxs]);

  // Rebuild when trade changes
  useEffect(() => {
    const currentKey = getTradeKey();
    if (currentKey && prebuildMetaRef.current?.tradeKey !== currentKey) {
      debouncedBuild();
    } else if (!currentKey) {
      setPrebuiltFlipTxs(null);
    }
  }, [currentTrade, getTradeKey, debouncedBuild, setPrebuiltFlipTxs]);

  // Check price movement and TTL
  useEffect(() => {
    if (!currentTrade || !prebuiltFlipTxs || !prebuildMetaRef.current) return;

    const pair = currentTrade.pair;
    const currentPrice = prices[pair]?.price;
    if (!currentPrice) return;

    const meta = prebuildMetaRef.current;
    const now = Date.now();

    // Check TTL or price movement
    const priceChange = Math.abs((currentPrice - meta.price) / meta.price) * 100;
    if (now - meta.timestamp > TTL_MS || priceChange > PRICE_TOLERANCE_PERCENT) {
      debouncedBuild();
    }
  }, [currentTrade, prebuiltFlipTxs, prices, debouncedBuild]);

  // Initial build
  useEffect(() => {
    if (currentTrade && userAddress && delegateAddress && !prebuiltFlipTxs && !isBuildingRef.current) {
      debouncedBuild();
    }
  }, [currentTrade, userAddress, delegateAddress, prebuiltFlipTxs, debouncedBuild]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    prebuiltFlipTxs,
    isPrebuildingFlip: isBuildingRef.current,
    rebuildFlipNow: buildTxs,
  };
}
