'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { loadPaperWallet, PAPER_STARTING_BALANCE, resetPaperWallet } from '@/lib/paperWallet';

export function usePaperBalance() {
  const { guestId } = usePaperTrading();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(() => {
    const wallet = loadPaperWallet(guestId);
    setBalance(wallet.balance);
    return wallet.balance;
  }, [guestId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetBalance = useCallback(() => {
    const wallet = resetPaperWallet(guestId);
    setBalance(wallet.balance);
    return wallet.balance;
  }, [guestId]);

  return {
    balance,
    isLoading: balance === null,
    refresh,
    resetBalance,
    startingBalance: PAPER_STARTING_BALANCE,
  };
}
