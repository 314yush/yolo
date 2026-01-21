import { create } from 'zustand';
import type { AppStage, WheelSelection, Trade, PnLData, DelegateStatus } from '@/types';
import { ASSETS, LEVERAGES, DIRECTIONS, DEFAULT_COLLATERAL } from '@/lib/constants';

interface TradeState {
  // App stage
  stage: AppStage;
  setStage: (stage: AppStage) => void;

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

  // Collateral amount
  collateral: number;
  setCollateral: (amount: number) => void;

  // User address (from Privy)
  userAddress: `0x${string}` | null;
  setUserAddress: (address: `0x${string}` | null) => void;

  // Reset state for new roll
  reset: () => void;
}

export const useTradeStore = create<TradeState>((set) => ({
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

  // Setters
  setStage: (stage) => set({ stage }),
  setSelection: (selection) => set({ selection }),
  setCurrentTrade: (currentTrade) => set({ currentTrade }),
  setPnLData: (pnlData) => set({ pnlData }),
  setTxHash: (txHash) => set({ txHash }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setError: (error) => set({ error }),
  setDelegateStatus: (delegateStatus) => set({ delegateStatus }),
  setCollateral: (collateral) => set({ collateral }),
  setUserAddress: (userAddress) => set({ userAddress }),

  // Randomly select asset, leverage, direction
  // Ensures leverage is compatible with the selected asset's max leverage
  randomizeSelection: () => {
    const asset = ASSETS[Math.floor(Math.random() * ASSETS.length)];
    
    // Filter leverages that are compatible with this asset's max leverage
    const compatibleLeverages = LEVERAGES.filter(l => l.value <= asset.maxLeverage);
    const leverage = compatibleLeverages[Math.floor(Math.random() * compatibleLeverages.length)];
    
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
  }),
}));
