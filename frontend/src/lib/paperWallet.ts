const GUEST_ID_KEY = 'yolo_paper_guest_id';
const WALLET_KEY_PREFIX = 'yolo_paper_wallet_';

export const PAPER_STARTING_BALANCE = 10_000;

export interface PaperWallet {
  balance: number;
  tradeCounter: number;
}

function walletKey(guestId: string): string {
  return `${WALLET_KEY_PREFIX}${guestId}`;
}

export function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') {
    return 'ssr-guest';
  }

  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = crypto.randomUUID();
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

export function loadPaperWallet(guestId: string): PaperWallet {
  if (typeof window === 'undefined') {
    return { balance: PAPER_STARTING_BALANCE, tradeCounter: 0 };
  }

  try {
    const stored = localStorage.getItem(walletKey(guestId));
    if (!stored) {
      const initial: PaperWallet = { balance: PAPER_STARTING_BALANCE, tradeCounter: 0 };
      savePaperWallet(guestId, initial);
      return initial;
    }
    const parsed = JSON.parse(stored) as Partial<PaperWallet>;
    return {
      balance: typeof parsed.balance === 'number' ? parsed.balance : PAPER_STARTING_BALANCE,
      tradeCounter: typeof parsed.tradeCounter === 'number' ? parsed.tradeCounter : 0,
    };
  } catch {
    const initial: PaperWallet = { balance: PAPER_STARTING_BALANCE, tradeCounter: 0 };
    savePaperWallet(guestId, initial);
    return initial;
  }
}

export function savePaperWallet(guestId: string, wallet: PaperWallet): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(walletKey(guestId), JSON.stringify(wallet));
  } catch (error) {
    console.error('[paperWallet] Failed to save:', error);
  }
}

export function resetPaperWallet(guestId: string): PaperWallet {
  const wallet: PaperWallet = { balance: PAPER_STARTING_BALANCE, tradeCounter: 0 };
  savePaperWallet(guestId, wallet);
  return wallet;
}

export function deductCollateral(guestId: string, amount: number): PaperWallet | null {
  const wallet = loadPaperWallet(guestId);
  if (wallet.balance < amount) return null;
  const updated = { ...wallet, balance: wallet.balance - amount };
  savePaperWallet(guestId, updated);
  return updated;
}

export function creditBalance(guestId: string, amount: number): PaperWallet {
  const wallet = loadPaperWallet(guestId);
  const updated = { ...wallet, balance: wallet.balance + amount };
  savePaperWallet(guestId, updated);
  return updated;
}

export function nextTradeIndex(guestId: string): number {
  const wallet = loadPaperWallet(guestId);
  const updated = { ...wallet, tradeCounter: wallet.tradeCounter + 1 };
  savePaperWallet(guestId, updated);
  return updated.tradeCounter;
}
