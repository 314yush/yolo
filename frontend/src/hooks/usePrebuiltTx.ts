'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from './useDelegateWallet';
import { 
  buildOpenTradeTx as buildOpenTradeTxDirect, 
  validatePositionSize,
} from '@/lib/avantisEncoder';

// How long a pre-built tx is considered valid (30 seconds)
const PREBUILD_TTL_MS = 30000;

// Debounce delay for rebuilding (100ms - fast since we're building locally now)
const REBUILD_DEBOUNCE_MS = 100;

// Price tolerance - rebuild if price moves more than this
const PRICE_TOLERANCE_PERCENT = 0.5;

/**
 * Hook that pre-builds trade transactions when selection changes.
 * 
 * NOW BUILDS DIRECTLY IN FRONTEND - No backend latency!
 * Uses the correct Avantis encoding format:
 * - 10 decimals for prices and leverage
 * - 0.00035 ETH execution fee
 * 
 * The hook automatically rebuilds when:
 * - Selection changes
 * - Price moves significantly (> 0.5%)
 * - TTL expires (30 seconds)
 */
export function usePrebuiltTx() {
  const { 
    selection, 
    userAddress, 
    collateral,
    prices,
    prebuiltTx,
    setPrebuiltTx, 
    setIsPrebuilding, 
    setPrebuildError,
  } = useTradeStore();
  
  const { delegateAddress } = useDelegateWallet();
  
  // Track when the tx was built and at what price
  const prebuildMetaRef = useRef<{
    timestamp: number;
    price: number;
    selectionKey: string;
  } | null>(null);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isBuildingRef = useRef(false);

  // Generate a key for the current selection
  const getSelectionKey = useCallback(() => {
    if (!selection) return '';
    return `${selection.asset.pairIndex}-${selection.leverage.value}-${selection.direction.isLong}-${collateral}`;
  }, [selection, collateral]);

  // Build the transaction (now entirely in frontend!)
  const buildTx = useCallback(() => {
    if (!selection || !userAddress || !delegateAddress) {
      setPrebuiltTx(null);
      return;
    }

    // Check if already building
    if (isBuildingRef.current) {
      return;
    }

    const pair = `${selection.asset.name}/USD`;
    const currentPrice = prices[pair]?.price;
    
    if (!currentPrice) return; // Wait for Pyth price

    isBuildingRef.current = true;
    setIsPrebuilding(true);
    setPrebuildError(null);

    try {
      // Validate position size
      const validation = validatePositionSize(collateral, selection.leverage.value);
      if (!validation.valid) {
        setPrebuildError(validation.error || 'Invalid position size');
        setPrebuiltTx(null);
        isBuildingRef.current = false;
        setIsPrebuilding(false);
        return;
      }

      // Build transaction directly in frontend (instant!)
      const tx = buildOpenTradeTxDirect({
        trader: userAddress,
        pairIndex: selection.asset.pairIndex,
        collateral,
        leverage: selection.leverage.value,
        isLong: selection.direction.isLong,
        openPrice: currentPrice,
      });

      setPrebuiltTx(tx);
      prebuildMetaRef.current = {
        timestamp: Date.now(),
        price: currentPrice,
        selectionKey: getSelectionKey(),
      };
    } catch (err) {
      console.error('[PrebuiltTx] Build failed:', err);
      setPrebuildError(err instanceof Error ? err.message : 'Build failed');
      setPrebuiltTx(null);
    } finally {
      isBuildingRef.current = false;
      setIsPrebuilding(false);
    }
  }, [
    selection,
    userAddress,
    delegateAddress,
    collateral,
    prices,
    setPrebuiltTx,
    setIsPrebuilding,
    setPrebuildError,
    getSelectionKey,
  ]);

  // Debounced build
  const debouncedBuild = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      buildTx();
    }, REBUILD_DEBOUNCE_MS);
  }, [buildTx]);

  // Rebuild when selection changes
  useEffect(() => {
    const currentKey = getSelectionKey();
    if (prebuildMetaRef.current?.selectionKey !== currentKey) {
      debouncedBuild();
    }
  }, [selection, collateral, getSelectionKey, debouncedBuild]);

  // Check for TTL expiry and price movement
  useEffect(() => {
    if (!selection || !prebuiltTx || !prebuildMetaRef.current) return;

    const pair = `${selection.asset.name}/USD`;
    const currentPrice = prices[pair]?.price;
    if (!currentPrice) return;

    const meta = prebuildMetaRef.current;
    const now = Date.now();
    
    // Check TTL or price movement
    const priceChange = Math.abs((currentPrice - meta.price) / meta.price) * 100;
    if (now - meta.timestamp > PREBUILD_TTL_MS || priceChange > PRICE_TOLERANCE_PERCENT) {
      debouncedBuild();
    }
  }, [selection, prebuiltTx, prices, debouncedBuild]);

  // Initial build when addresses become available
  useEffect(() => {
    if (selection && userAddress && delegateAddress && !prebuiltTx && !isBuildingRef.current) {
      debouncedBuild();
    }
  }, [selection, userAddress, delegateAddress, prebuiltTx, debouncedBuild]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    prebuiltTx,
    isPrebuilding: isBuildingRef.current,
    prebuildError: useTradeStore.getState().prebuildError,
    rebuildNow: buildTx,
  };
}
