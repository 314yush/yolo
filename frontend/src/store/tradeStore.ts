import { create } from 'zustand';
import type { AppStage, WheelSelection, Trade, PnLData, SetupStatus, Settings, TradeStats, ClosedTrade } from '@/types';
import { ASSETS, LEVERAGES, DIRECTIONS, DEFAULT_COLLATERAL, COLORS } from '@/lib/constants';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { loadStats, saveStats } from '@/lib/stats';
import { loadSetupStatus, saveSetupStatus } from '@/lib/setupStatus';
import { isCommoditiesMarketOpen, isFxWeekendMarketOpen } from '@/lib/marketHours';
import { debug } from '@/lib/debug';
import type { Toast } from '@/components/Toast';

// Confirmation stages for fast trading feedback
export type ConfirmationStage = 
  | 'none'           // No active confirmation
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

  // Remembered trade indices for PnL matching (when multiple positions exist)
  rememberedPairIndex: number | null;
  rememberedTradeIndex: number | null;
  setRememberedIndices: (pairIndex: number | null, tradeIndex: number | null) => void;

  // PnL data for display
  pnlData: PnLData | null;
  setPnLData: (data: PnLData | null) => void;
  
  // Liquidation state
  isLiquidated: boolean;
  setIsLiquidated: (liquidated: boolean) => void;
  lastKnownPnLPercentage: number | null; // Track last PnL % to detect liquidation
  setLastKnownPnLPercentage: (percentage: number | null) => void;
  /** Most negative net/gross PnL % seen this position (PnL stage); for liquidation-on-vanish heuristic */
  sessionMinPnlPercentage: number | null;
  resetSessionMinPnlPercentage: () => void;
  
  // Take profit hit state (position closed at profit by TP target)
  isTakeProfitHit: boolean;
  setIsTakeProfitHit: (hit: boolean) => void;
  
  // Intentional close flag - prevents false liquidation detection during flip/close
  isIntentionalClose: boolean;
  setIsIntentionalClose: (intentional: boolean) => void;

  // Position key to exclude from PnL matching during flip (e.g. "0-5" = pairIndex 0, tradeIndex 5)
  // Prevents showing old position while close propagates — stops entry price jump
  flipExcludedPositionKey: string | null;
  setFlipExcludedPositionKey: (key: string | null) => void;

  // Tracks where currentTrade data originated so polling doesn't overwrite fresher Pusher data
  positionSource: 'placeholder' | 'pusher' | 'poll';
  setPositionSource: (source: 'placeholder' | 'pusher' | 'poll') => void;
  lastPositionEventAt: number | null;
  setLastPositionEventAt: (ts: number | null) => void;

  // Trade execution state
  txHash: `0x${string}` | null;
  setTxHash: (hash: `0x${string}` | null) => void;
  
  isExecuting: boolean;
  setIsExecuting: (executing: boolean) => void;
  
  error: string | null;
  setError: (error: string | null) => void;

  // Trading readiness (USDC allowance)
  setupStatus: SetupStatus;
  setSetupStatus: (status: SetupStatus) => void;
  loadSetupStatusForUser: (userAddress: string | null) => void;

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

  // Pending OPEN tx hashes for activity log-open (FIFO - only open txs, not close)
  pendingOpenTxHashes: `0x${string}`[];
  addPendingOpenTxHash: (hash: `0x${string}`) => void;
  popPendingOpenTxHash: () => `0x${string}` | undefined;

  // Settings
  settings: Settings;
  setSettings: (settings: Settings) => void;

  // Trade statistics
  tradeStats: TradeStats;
  setTradeStats: (stats: TradeStats) => void;
  incrementTotalTrades: () => void;
  incrementVolume: (collateral: number, leverage: number) => void;
  updateActivePositions: (count: number) => void;

  // Toast notifications
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number, action?: { label: string; onClick: () => void }) => void;
  removeToast: (id: string) => void;

  // Real-time prices (Avantis feed-v3 stream, Hermes fallback)
  prices: Record<string, { price: number; timestamp: number }>;
  setPrices: (prices: Record<string, { price: number; timestamp: number }>) => void;
  
  // Last closed trade for share card modal (set when trade closes)
  lastClosedTradeForShare: ClosedTrade | null;
  setLastClosedTradeForShare: (trade: ClosedTrade | null) => void;

  // Reset state for new roll
  reset: () => void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  // Initial state
  stage: 'idle',
  selection: null,
  currentTrade: null,
  rememberedPairIndex: null,
  rememberedTradeIndex: null,
  pnlData: null,
  isLiquidated: false,
  lastKnownPnLPercentage: null,
  sessionMinPnlPercentage: null,
  isTakeProfitHit: false,
  isIntentionalClose: false,
  flipExcludedPositionKey: null,
  positionSource: 'placeholder',
  lastPositionEventAt: null,
  txHash: null,
  isExecuting: false,
  error: null,
  // Hydrated from localStorage once userAddress is known.
  setupStatus: { isSetup: false, usdcApproved: false },
  collateral: (() => {
    // Load collateral from settings to stay in sync
    if (typeof window !== 'undefined') {
      return loadSettings().collateral;
    }
    return DEFAULT_COLLATERAL;
  })(),
  userAddress: null,
  openTrades: [],
  pendingTradeHashes: (() => {
    // Create Set in a way that works with Zustand
    if (typeof window !== 'undefined') {
      return new Set<`0x${string}`>();
    }
    return new Set<`0x${string}`>();
  })(),
  pendingOpenTxHashes: [],
  // Fast trading confirmation state
  confirmationStage: 'none',
  confirmationTimestamp: null,
  // Real-time prices (Avantis feed-v3 stream, Hermes fallback)
  prices: {},
  settings: (() => {
    // Load settings from localStorage on store init
    if (typeof window !== 'undefined') {
      return loadSettings();
    }
    return DEFAULT_SETTINGS;
  })(),
  tradeStats: {
    totalTrades: 0,
    activePositions: 0,
    totalVolume: 0,
  },
  lastClosedTradeForShare: null,

  // Setters
  setStage: (stage) => set({ stage }),
  setSelection: (selection) => set({ selection }),
  setConfirmationStage: (confirmationStage) => set({ confirmationStage }),
  setConfirmationTimestamp: (confirmationTimestamp) => set({ confirmationTimestamp }),
  setCurrentTrade: (currentTrade) => {
    // When setting currentTrade, also remember the indices for PnL matching
    if (currentTrade && currentTrade.pairIndex !== undefined && currentTrade.tradeIndex !== undefined) {
      set({
        currentTrade,
        rememberedPairIndex: currentTrade.pairIndex,
        rememberedTradeIndex: currentTrade.tradeIndex,
        // New live position supersedes any pending "share last close" from a prior session
        lastClosedTradeForShare: null,
      });
    } else if (currentTrade == null) {
      set({
        currentTrade: null,
        rememberedPairIndex: null,
        rememberedTradeIndex: null,
        pnlData: null,
      });
    } else {
      set({ currentTrade });
    }
  },
  setRememberedIndices: (pairIndex, tradeIndex) => set({ rememberedPairIndex: pairIndex, rememberedTradeIndex: tradeIndex }),
  setPnLData: (pnlData) =>
    set((state) => {
      if (!pnlData) {
        return { pnlData };
      }
      const net = pnlData.pnlPercentage;
      const gross = pnlData.grossPnlPercentage;
      const candidates = [net, gross].filter((n) => Number.isFinite(n)) as number[];
      const pollMin = candidates.length ? Math.min(...candidates) : null;
      const nextSessionMin =
        pollMin === null
          ? state.sessionMinPnlPercentage
          : state.sessionMinPnlPercentage === null
            ? pollMin
            : Math.min(state.sessionMinPnlPercentage, pollMin);
      return {
        pnlData,
        lastKnownPnLPercentage: pnlData.pnlPercentage,
        sessionMinPnlPercentage: nextSessionMin,
      };
    }),
  setIsLiquidated: (isLiquidated) => set({ isLiquidated }),
  resetSessionMinPnlPercentage: () => set({ sessionMinPnlPercentage: null }),
  setLastKnownPnLPercentage: (lastKnownPnLPercentage) => set({ lastKnownPnLPercentage }),
  setIsTakeProfitHit: (isTakeProfitHit) => set({ isTakeProfitHit }),
  setIsIntentionalClose: (isIntentionalClose) => set({ isIntentionalClose }),
  setFlipExcludedPositionKey: (flipExcludedPositionKey) => set({ flipExcludedPositionKey }),
  setPositionSource: (positionSource) => set({ positionSource }),
  setLastPositionEventAt: (lastPositionEventAt) => set({ lastPositionEventAt }),
  setTxHash: (txHash) => set({ txHash }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setError: (error) => set({ error }),
  setSetupStatus: (setupStatus) => {
    const state = get();
    if (state.userAddress) {
      saveSetupStatus(state.userAddress, setupStatus);
    }
    set({ setupStatus });
  },
  loadSetupStatusForUser: (userAddress) => {
    if (!userAddress) {
      set({ setupStatus: { isSetup: false, usdcApproved: false } });
      return;
    }

    const cached = loadSetupStatus(userAddress);
    if (cached) {
      debug('📦 Loaded cached setup status:', cached);
      set({ setupStatus: cached });
    } else {
      set({ setupStatus: { isSetup: false, usdcApproved: false } });
    }
  },
  setCollateral: (collateral) => set({ collateral }),
  setUserAddress: (userAddress) => {
    set({ userAddress });
    // Load trade stats for this user when address changes
    if (userAddress) {
      const loaded = loadStats(userAddress);
      set({
        tradeStats: {
          totalTrades: loaded.totalTrades ?? 0,
          activePositions: loaded.activePositions ?? 0,
          totalVolume: loaded.totalVolume ?? 0,
        },
      });
    } else {
      set({
        tradeStats: {
          totalTrades: 0,
          activePositions: 0,
          totalVolume: 0,
        },
      });
    }
  },
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
  addPendingOpenTxHash: (hash) => set((state) => ({
    pendingOpenTxHashes: [...state.pendingOpenTxHashes, hash],
  })),
  popPendingOpenTxHash: () => {
    const state = get();
    const hashes = state.pendingOpenTxHashes;
    if (hashes.length === 0) return undefined;
    const [head, ...rest] = hashes;
    set({ pendingOpenTxHashes: rest });
    return head;
  },
  setSettings: (settings) => {
    set({ settings });
    // Also update collateral when settings change
    set({ collateral: settings.collateral });
  },
  setTradeStats: (tradeStats) => set({ tradeStats }),
  setLastClosedTradeForShare: (lastClosedTradeForShare) => set({ lastClosedTradeForShare }),
  incrementTotalTrades: () => {
    set((state) => {
      const newStats = {
        ...state.tradeStats,
        totalTrades: state.tradeStats.totalTrades + 1,
      };
      if (typeof window !== 'undefined' && state.userAddress) {
        saveStats(state.userAddress, newStats);
      }
      return { tradeStats: newStats };
    });
  },
  incrementVolume: (collateral, leverage) => {
    set((state) => {
      const positionSize = collateral * leverage;
      const newStats = {
        ...state.tradeStats,
        totalVolume: state.tradeStats.totalVolume + positionSize,
      };
      if (typeof window !== 'undefined' && state.userAddress) {
        saveStats(state.userAddress, newStats);
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
      if (typeof window !== 'undefined' && state.userAddress) {
        saveStats(state.userAddress, newStats);
      }
      return { tradeStats: newStats };
    });
  },

  // Toast notifications
  toasts: [],
  showToast: (message, type = 'info', duration = 5000, action) => {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration, action };
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

  // Randomly select asset, leverage, direction
  // Uses weighted random selection for leverage - higher leverage = more likely
  // Filters out assets with closed markets (commodities vs forex weekend schedules)
  randomizeSelection: () => {
    const availableAssets = ASSETS.filter((asset) => {
      if (!asset.hasMarketHours) return true;
      const kind = asset.marketHoursKind ?? 'commodities';
      const open =
        kind === 'fx_weekends' ? isFxWeekendMarketOpen() : isCommoditiesMarketOpen();
      return open;
    });

    // Random asset selection from available assets
    const asset = availableAssets[Math.floor(Math.random() * availableAssets.length)];

    let leverage;

    // Fixed leverage — synthesize tier if not on the wheel list (e.g. 50x forex)
    if (asset.fixedLeverage) {
      leverage =
        LEVERAGES.find((l) => l.value === asset.fixedLeverage) ?? {
          name: `${asset.fixedLeverage}x`,
          value: asset.fixedLeverage,
          color: COLORS.WARNING,
          weight: 0,
        };
    } else {
      // Filter leverages that are compatible with this asset's max leverage.
      // Falls back to a synthesized tier at the cap when the wheel's lowest tier
      // still exceeds it, so a protocol cap cut can never leave this empty.
      const compatibleLeverages = LEVERAGES.filter(l => l.value <= asset.maxLeverage);

      if (compatibleLeverages.length === 0) {
        leverage = {
          name: `${asset.maxLeverage}x`,
          value: asset.maxLeverage,
          color: COLORS.WARNING,
          weight: 0,
        };
      } else {
        // Weighted random selection for leverage
        const totalWeight = compatibleLeverages.reduce((sum, l) => sum + l.weight, 0);
        let random = Math.random() * totalWeight;
        leverage = compatibleLeverages[0];

        for (const l of compatibleLeverages) {
          random -= l.weight;
          if (random <= 0) {
            leverage = l;
            break;
          }
        }
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
    rememberedPairIndex: null,
    rememberedTradeIndex: null,
    pnlData: null,
    isLiquidated: false,
    lastKnownPnLPercentage: null,
    sessionMinPnlPercentage: null,
    isTakeProfitHit: false,
    isIntentionalClose: false,
    txHash: null,
    isExecuting: false,
    error: null,
    confirmationStage: 'none',
    confirmationTimestamp: null,
    flipExcludedPositionKey: null,
    positionSource: 'placeholder',
    lastPositionEventAt: null,
  }),
}));
