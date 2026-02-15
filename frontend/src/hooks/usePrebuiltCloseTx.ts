'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { usePrivyEmbeddedWallet } from './usePrivyEmbeddedWallet';
import { buildCloseTradeTx } from '@/lib/avantisEncoder';
import { debug } from '@/lib/debug';

const REBUILD_DEBOUNCE_MS = 100;

/**
 * Pre-builds close transaction for the current trade.
 * 
 * Automatically rebuilds when:
 * - currentTrade changes
 * - openTrades changes (in case tradeIndex changes)
 */
export function usePrebuiltCloseTx() {
  const {
    currentTrade,
    openTrades,
    userAddress,
    prebuiltCloseTx,
    setPrebuiltCloseTx,
    setIsPrebuildingClose,
  } = useTradeStore();
  
  const { address: embeddedAddress } = usePrivyEmbeddedWallet();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isBuildingRef = useRef(false);

  // Generate a key for the current trade
  const getTradeKey = useCallback(() => {
    if (!currentTrade) return '';
    return `${currentTrade.pairIndex}-${currentTrade.tradeIndex}-${currentTrade.collateral}`;
  }, [currentTrade]);

  const prebuildMetaRef = useRef<{ tradeKey: string } | null>(null);

  // Build close transaction
  const buildTx = useCallback(() => {
    if (!currentTrade || !userAddress || !embeddedAddress) {
      setPrebuiltCloseTx(null);
      return;
    }

    // Validate trade has required fields
    if (currentTrade.pairIndex === undefined || currentTrade.tradeIndex === undefined) {
      debug('[PrebuiltCloseTx] Missing pairIndex or tradeIndex, skipping build');
      setPrebuiltCloseTx(null);
      return;
    }

    if (isBuildingRef.current) return;

    isBuildingRef.current = true;
    setIsPrebuildingClose(true);

    try {
      const tx = buildCloseTradeTx({
        trader: userAddress,
        pairIndex: currentTrade.pairIndex,
        tradeIndex: currentTrade.tradeIndex,
        collateralToClose: currentTrade.collateral,
      });

      setPrebuiltCloseTx(tx);
      prebuildMetaRef.current = { tradeKey: getTradeKey() };
    } catch (err) {
      console.error('[PrebuiltCloseTx] Build failed:', err);
      setPrebuiltCloseTx(null);
    } finally {
      isBuildingRef.current = false;
      setIsPrebuildingClose(false);
    }
  }, [currentTrade, userAddress, embeddedAddress, setPrebuiltCloseTx, setIsPrebuildingClose, getTradeKey]);

  // Debounced build
  const debouncedBuild = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(buildTx, REBUILD_DEBOUNCE_MS);
  }, [buildTx]);

  // Rebuild when trade changes
  useEffect(() => {
    const currentKey = getTradeKey();
    if (currentKey && prebuildMetaRef.current?.tradeKey !== currentKey) {
      debouncedBuild();
    } else if (!currentKey) {
      setPrebuiltCloseTx(null);
    }
  }, [currentTrade, openTrades, getTradeKey, debouncedBuild, setPrebuiltCloseTx]);

  // Initial build
  useEffect(() => {
    if (currentTrade && userAddress && embeddedAddress && !prebuiltCloseTx && !isBuildingRef.current) {
      debouncedBuild();
    }
  }, [currentTrade, userAddress, embeddedAddress, prebuiltCloseTx, debouncedBuild]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    prebuiltCloseTx,
    isPrebuildingClose: isBuildingRef.current,
    rebuildCloseNow: buildTx,
  };
}
