'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useTradeStore } from '@/store/tradeStore';
import type { TradeParams, UnsignedTx } from '@/types';

export function useAvantisAPI() {
  const { setError } = useTradeStore();

  // Build delegation setup transaction
  const buildDelegateSetupTx = useCallback(
    async (trader: string, delegateAddress: string): Promise<UnsignedTx | null> => {
      const response = await api.buildDelegateSetupTx(trader, delegateAddress);
      
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to build delegate setup tx');
        return null;
      }
      
      return response.data.tx;
    },
    [setError]
  );

  // Check delegate status
  const checkDelegateStatus = useCallback(
    async (trader: string) => {
      const response = await api.getDelegateStatus(trader);
      
      if (!response.success || !response.data) {
        console.warn('Failed to check delegate status:', response.error);
        // Return error info so caller can decide what to do
        return { isSetup: false, delegateAddress: null, error: response.error };
      }
      
      return {
        isSetup: response.data.is_setup,
        delegateAddress: response.data.delegate_address,
        error: null,
      };
    },
    []
  );

  // Build USDC approval transaction
  const buildUsdcApprovalTx = useCallback(
    async (trader: string): Promise<UnsignedTx | null> => {
      const response = await api.buildUsdcApprovalTx(trader);
      
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to build USDC approval tx');
        return null;
      }
      
      return response.data.tx;
    },
    [setError]
  );

  // Check if trader has sufficient USDC allowance
  const checkUsdcAllowance = useCallback(
    async (trader: string): Promise<{ hasSufficient: boolean; allowance: number }> => {
      const response = await api.checkUsdcAllowance(trader);
      
      if (!response.success || !response.data) {
        console.warn('Failed to check USDC allowance:', response.error);
        return { hasSufficient: false, allowance: 0 };
      }
      
      return {
        hasSufficient: response.data.has_sufficient,
        allowance: response.data.allowance,
      };
    },
    []
  );

  // Build open trade transaction
  const buildOpenTradeTx = useCallback(
    async (params: TradeParams): Promise<UnsignedTx | null> => {
      console.log('[buildOpenTradeTx] Starting with params:', params);
      try {
        const response = await api.buildOpenTradeTx(params);
        console.log('[buildOpenTradeTx] Response:', response);
        
        if (!response.success || !response.data) {
          console.error('[buildOpenTradeTx] Failed:', response.error);
          setError(response.error || 'Failed to build open trade tx');
          return null;
        }
        
        console.log('[buildOpenTradeTx] Success, tx:', response.data.tx);
        return response.data.tx;
      } catch (err) {
        console.error('[buildOpenTradeTx] Exception:', err);
        throw err;
      }
    },
    [setError]
  );

  // Build close trade transaction
  const buildCloseTradeTx = useCallback(
    async (
      trader: string,
      delegate: string,
      pairIndex: number,
      tradeIndex: number,
      collateralToClose: number
    ): Promise<UnsignedTx | null> => {
      const response = await api.buildCloseTradeTx(
        trader,
        delegate,
        pairIndex,
        tradeIndex,
        collateralToClose
      );
      
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to build close trade tx');
        return null;
      }
      
      return response.data.tx;
    },
    [setError]
  );

  // Get open trades
  const getTrades = useCallback(async (address: string) => {
    const response = await api.getTrades(address);
    
    if (!response.success || !response.data) {
      return [];
    }
    
    return response.data.trades;
  }, []);

  // Get PnL for all positions
  const getPnL = useCallback(async (address: string) => {
    const response = await api.getPnL(address);
    
    if (!response.success || !response.data) {
      return [];
    }
    
    return response.data.positions;
  }, []);

  // Get current price
  const getPrice = useCallback(async (pair: string) => {
    const response = await api.getPrice(pair);
    
    if (!response.success || !response.data) {
      return null;
    }
    
    return response.data;
  }, []);

  return {
    buildDelegateSetupTx,
    checkDelegateStatus,
    buildUsdcApprovalTx,
    checkUsdcAllowance,
    buildOpenTradeTx,
    buildCloseTradeTx,
    getTrades,
    getPnL,
    getPrice,
  };
}
