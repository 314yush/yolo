import { create } from 'zustand';
import type { AppStage, WheelSelection, Trade, PnLData, DelegateStatus, Settings, TradeStats } from '@/types';
import { ASSETS, LEVERAGES, DIRECTIONS, DEFAULT_COLLATERAL } from '@/lib/constants';
import { loadSettings } from '@/lib/settings';
import { loadStats, saveStats } from '@/lib/stats';
import type { Toast } from '@/components/Toast';
import type { EncodedTransaction, FlipTradeResult } from '@/lib/avantisEncoder';

// Confirmation stages for fast trading feedback
export type ConfirmationStage = 
  | 'none'           // No active confirmation
  | 'broadcasting'   // TX being broadcast
  | 'submitted'      // TX submitted to mempool
  | 'picked_up'      // Keeper picked up order (Pusher: OrderPickedUpForExecution)
  | 'preconfirmed'   // Flashblock preconfirmation (Pusher: ExecutionConfirmedInFlashblock)
  | 'confirmed'      // Final confirmation (Pusher: OrderFilled)
  | 'failed';        // Order canceled/failed (Pusher: OrderCanceled)

interface TradeState {
  // App stage
  stage: AppStage;
  setStage: (stage: AppStage) => void;
  
  // Fast trading confirmation stage
  confirmationStage: ConfirmationStage;
  setConfirmationStage: (stage: ConfirmationStage) => void;
  confirmationTimestamp: number | null; // When confirmation started (for latency tracking)
  setConfirmationTimestamp: (ts: number | null) => void;

  // Wheel selection (determined immediately on roll)
  selection: WheelSelection | null;
  setSelection: (selection: WheelSelection) => void;
  randomizeSelection: () => WheelSelection;

  // Current trade being executed
  currentTrade: Trade | null;
  setCurrentTrade: (trade: Trade | null) => void;

  // PnL data for display
  pnlData: PnLData | null;
  setPnLData: (data: PnLData | null) => void;

  // Trade execution state
  txHash: `0x${string}` | null;
  setTxHash: (hash: `0x${string}` | null) => void;
  
  isExecuting: boolean;
  setIsExecuting: (executing: boolean) => void;
  
  error: string | null;
  setError: (error: string | null) => void;

  // Delegate setup status
  delegateStatus: DelegateStatus;
  setDelegateStatus: (status: DelegateStatus) => void;

  // Collateral amount (now part of settings)
  collateral: number;
  setCollateral: (amount: number) => void;

  // User address (from Privy)
  userAddress: `0x${string}` | null;
  setUserAddress: (address: `0x${string}` | null) => void;

  // Open trades (for open trades page)
  openTrades: Trade[];
  setOpenTrades: (trades: Trade[]) => void;
  
  // Pending trade transaction hashes (for optimistic updates)
  pendingTradeHashes: Set<`0x${string}`>;
  addPendingTradeHash: (hash: `0x${string}`) => void;
  removePendingTradeHash: (hash: `0x${string}`) => void;

  // Settings
  settings: Settings;
  setSettings: (settings: Settings) => void;

  // Trade statistics
  tradeStats: TradeStats;
  setTradeStats: (stats: TradeStats) => void;
  incrementTotalTrades: () => void;
  updateActivePositions: (count: number) => void;

  // Toast notifications
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  removeToast: (id: string) => void;

  // Real-time prices from Pyth
  prices: Record<string, { price: number; timestamp: number }>;
  setPrices: (prices: Record<string, { price: number; timestamp: number }>) => void;
  
  // Pre-built transaction for instant execution
  prebuiltTx: { to: string; data: string; value: string; chainId: number } | null;
  setPrebuiltTx: (tx: { to: string; data: string; value: string; chainId: number } | null) => void;
  isPrebuilding: boolean;
  setIsPrebuilding: (building: boolean) => void;
  prebuildError: string | null;
  setPrebuildError: (error: string | null) => void;

  // Pre-built CLOSE transaction (for current trade)
  prebuiltCloseTx: EncodedTransaction | null;
  setPrebuiltCloseTx: (tx: EncodedTransaction | null) => void;
  isPrebuildingClose: boolean;
  setIsPrebuildingClose: (building: boolean) => void;

  // Pre-built FLIP transactions (close + open opposite)
  prebuiltFlipTxs: FlipTradeResult | null;
  setPrebuiltFlipTxs: (txs: FlipTradeResult | null) => void;
  isPrebuildingFlip: boolean;
  setIsPrebuildingFlip: (building: boolean) => void;

  // Reset state for new roll
  reset: () => void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  // Initial state
  stage: 'idle',
  selection: null,
  currentTrade: null,
  pnlData: null,
  txHash: null,
  isExecuting: false,
  error: null,
  delegateStatus: {
    isSetup: false,
    delegateAddress: null,
    usdcApproved: false,
  },
  collateral: DEFAULT_COLLATERAL,
  userAddress: null,
  openTrades: [],
  pendingTradeHashes: (() => {
    // Create Set in a way that works with Zustand
    if (typeof window !== 'undefined') {
      return new Set<`0x${string}`>();
    }
    return new Set<`0x${string}`>();
  })(),
  // Fast trading confirmation state
  confirmationStage: 'none',
  confirmationTimestamp: null,
  // Real-time prices from Pyth
  prices: {},
  // Pre-built transaction
  prebuiltTx: null,
  isPrebuilding: false,
  prebuildError: null,
  // Pre-built close/flip transactions
  prebuiltCloseTx: null,
  isPrebuildingClose: false,
  prebuiltFlipTxs: null,
  isPrebuildingFlip: false,
  settings: (() => {
    // Load settings from localStorage on store init
    if (typeof window !== 'undefined') {
      return loadSettings();
    }
    return {
      collateral: DEFAULT_COLLATERAL,
      audioEnabled: true,
      musicEnabled: false,
    };
  })(),
  tradeStats: (() => {
    // Load stats from localStorage on store init
    if (typeof window !== 'undefined') {
      return loadStats();
    }
    return {
      totalTrades: 0,
      activePositions: 0,
    };
  })(),

  // Setters
  setStage: (stage) => set({ stage }),
  setSelection: (selection) => set({ selection }),
  setConfirmationStage: (confirmationStage) => set({ confirmationStage }),
  setConfirmationTimestamp: (confirmationTimestamp) => set({ confirmationTimestamp }),
  setCurrentTrade: (currentTrade) => set({ currentTrade }),
  setPnLData: (pnlData) => set({ pnlData }),
  setTxHash: (txHash) => set({ txHash }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setError: (error) => set({ error }),
  setDelegateStatus: (delegateStatus) => set({ delegateStatus }),
  setCollateral: (collateral) => set({ collateral }),
  setUserAddress: (userAddress) => set({ userAddress }),
  setOpenTrades: (openTrades) => set({ openTrades }),
  addPendingTradeHash: (hash) => set((state) => {
    const newSet = new Set(state.pendingTradeHashes);
    newSet.add(hash);
    return { pendingTradeHashes: newSet };
  }),
  removePendingTradeHash: (hash) => set((state) => {
    const newSet = new Set(state.pendingTradeHashes);
    newSet.delete(hash);
    return { pendingTradeHashes: newSet };
  }),
  setSettings: (settings) => {
    set({ settings });
    // Also update collateral when settings change
    set({ collateral: settings.collateral });
  },
  setTradeStats: (tradeStats) => set({ tradeStats }),
  incrementTotalTrades: () => {
    set((state) => {
      const newStats = {
        ...state.tradeStats,
        totalTrades: state.tradeStats.totalTrades + 1,
      };
      // Save to localStorage
      if (typeof window !== 'undefined') {
        saveStats(newStats);
      }
      return { tradeStats: newStats };
    });
  },
  updateActivePositions: (count) => {
    set((state) => {
      const newStats = {
        ...state.tradeStats,
        activePositions: count,
      };
      // Save to localStorage
      if (typeof window !== 'undefined') {
        saveStats(newStats);
      }
      return { tradeStats: newStats };
    });
  },

  // Toast notifications
  toasts: [],
  showToast: (message, type = 'info', duration = 5000) => {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration };
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  // Real-time prices
  setPrices: (prices) => set({ prices }),
  
  // Pre-built transaction
  setPrebuiltTx: (prebuiltTx) => set({ prebuiltTx }),
  setIsPrebuilding: (isPrebuilding) => set({ isPrebuilding }),
  setPrebuildError: (prebuildError) => set({ prebuildError }),

  // Pre-built close/flip transactions
  setPrebuiltCloseTx: (prebuiltCloseTx) => set({ prebuiltCloseTx }),
  setIsPrebuildingClose: (isPrebuildingClose) => set({ isPrebuildingClose }),
  setPrebuiltFlipTxs: (prebuiltFlipTxs) => set({ prebuiltFlipTxs }),
  setIsPrebuildingFlip: (isPrebuildingFlip) => set({ isPrebuildingFlip }),

  // Randomly select asset, leverage, direction
  // Uses weighted random selection for leverage - higher leverage = more likely
  randomizeSelection: () => {
    const asset = ASSETS[Math.floor(Math.random() * ASSETS.length)];
    
    // Filter leverages that are compatible with this asset's max leverage
    const compatibleLeverages = LEVERAGES.filter(l => l.value <= asset.maxLeverage);
    
    // Weighted random selection for leverage
    const totalWeight = compatibleLeverages.reduce((sum, l) => sum + l.weight, 0);
    let random = Math.random() * totalWeight;
    let leverage = compatibleLeverages[0];
    
    for (const l of compatibleLeverages) {
      random -= l.weight;
      if (random <= 0) {
        leverage = l;
        break;
      }
    }
    
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    
    const selection = { asset, leverage, direction };
    set({ selection });
    return selection;
  },

  // Reset for new roll
  reset: () => set({
    stage: 'idle',
    selection: null,
    currentTrade: null,
    pnlData: null,
    txHash: null,
    isExecuting: false,
    error: null,
    confirmationStage: 'none',
    confirmationTimestamp: null,
    prebuiltTx: null,
    isPrebuilding: false,
    prebuildError: null,
    prebuiltCloseTx: null,
    isPrebuildingClose: false,
    prebuiltFlipTxs: null,
    isPrebuildingFlip: false,
  }),
}));
