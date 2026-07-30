'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePrivy } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useTxSigner } from '@/hooks/useTxSigner';
import { useAvantisTradeExecution } from '@/hooks/useAvantisTradeExecution';
import { useSound } from '@/hooks/useSound';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useOpenTrades } from '@/hooks/useOpenTrades';
import { useFastConfirmation } from '@/hooks/useFastConfirmation';
import { useChartDataCollector } from '@/hooks/useChartDataCollector';
import { usePrebuiltTx } from '@/hooks/usePrebuiltTx';
import { useAccessCheck } from '@/hooks/useAccessCheck';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePositionSync } from '@/hooks/usePositionSync';
import { PickerWheel } from '@/components/PickerWheel';
import { AccessCodeGate } from '@/components/AccessCodeGate';
import { LoginButton } from '@/components/LoginButton';
import { SetupFlow } from '@/components/SetupFlow';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import { DepositUSDC } from '@/components/DepositUSDC';
import { ToastContainer } from '@/components/Toast';
import { AbstractBackground } from '@/components/AbstractBackground';
import { LandingPremium } from '@/components/LandingPremium';
import { InsufficientFundsModal } from '@/components/InsufficientFundsModal';
import { NavFooter } from '@/components/NavFooter';
import { FinancialInfoBar } from '@/components/FinancialInfoBar';
import { MusicToggleButton } from '@/components/MusicToggleButton';
import { StageRouter } from '@/components/StageRouter';
import { PnLScreen } from '@/components/PnLScreen';
import { hasCompletedOnboarding, markOnboardingComplete, clearOnboardingStatus } from '@/lib/onboarding';
import { hasDelegateWallet, getDelegateAddress } from '@/lib/delegateWallet';
import { clearLocalAccess } from '@/lib/access';
import { vibrateDouble } from '@/lib/haptics';
import { saveClosedTrade } from '@/lib/closedTrades';
import { logTradeCloseByPosition, getOnboardingStatus } from '@/lib/activityApi';
import { 
  buildCloseTradeTx as buildCloseTradeTxDirect,
  buildOpenTradeTx as buildOpenTradeTxDirect,
  calculateTakeProfitMultiplier,
} from '@/lib/avantisEncoder';
import { AVANTIS_V2_ENABLED } from '@/lib/avantisV2';
import type { Trade, ClosedTrade, PnLData } from '@/types';
import { fetchRecentClosedTradeMatch } from '@/lib/avantisApi';
import { MIN_DEPOSIT, POST_CLOSE_SHARE_DELAY_MS } from '@/lib/constants';
import { getPairKey } from '@/lib/assetPair';
import { debug } from '@/lib/debug';
import { Dice5, Loader2, Wallet } from 'lucide-react';

const ShareBottomSheet = dynamic(
  () => import('@/components/ShareBottomSheet').then((m) => ({ default: m.ShareBottomSheet })),
  { ssr: false }
);

export default function HomePage() {
  const { authenticated, ready, user, login } = usePrivy();
  const {
    stage,
    flipExcludedPositionKey,
    setStage,
    userAddress,
    delegateStatus,
    loadDelegateStatusForUser,
    collateral,
    currentTrade,
    setCurrentTrade,
    setPnLData,
    setTxHash,
    setError,
    openTrades,
    addPendingTradeHash,
    addPendingOpenTxHash,
    reset,
    toasts,
    removeToast,
    showToast,
    prices,
    lastClosedTradeForShare,
    setLastClosedTradeForShare,
    setPositionSource,
  } = useTradeStore();

  /** Latest trade while on PnL — read inside async after await (avoids stale effect closure). */
  const pnlStageTradeRef = useRef(currentTrade);
  pnlStageTradeRef.current = currentTrade;
  const flipExcludedKeyRef = useRef(flipExcludedPositionKey);
  flipExcludedKeyRef.current = flipExcludedPositionKey;
  
  const { delegateAddress } = useDelegateWallet();
  const { isOnline } = useNetworkStatus();
  const { checkDelegateStatus } = useAvantisAPI();
  
  // Load cached delegate status for authenticated user; verify on-chain when cache says setup is complete.
  useEffect(() => {
    async function verifyDelegateStatus() {
      if (authenticated && user?.wallet?.address) {
        const address = user.wallet.address as `0x${string}`;
        // Always refresh delegate cache from localStorage when wallet is known (do not gate on
        // address !== userAddress — Strict Mode / re-renders can skip that branch and leave stale
        // delegateStatus so SetupFlow never appears.)
        loadDelegateStatusForUser(address);

        // Onboarding: once per wallet per mount session
        if (onboardingBootstrappedForRef.current !== address) {
          if (hasCompletedOnboarding(address)) {
            onboardingBootstrappedForRef.current = address;
            setIsOnboardingComplete(true);
            setIsReturningUser(true);
          } else {
            setIsCheckingOnboarding(true);
            try {
              const completed = await getOnboardingStatus(address);
              if (completed) {
                setIsOnboardingComplete(true);
                setIsReturningUser(true);
                markOnboardingComplete(address);
              }
            } catch (err) {
              console.warn('[page] getOnboardingStatus failed:', err);
            } finally {
              setIsCheckingOnboarding(false);
              onboardingBootstrappedForRef.current = address;
            }
          }
        }

        // CRITICAL FIX: Always verify on-chain delegate status if cache says setup is complete
        // This prevents delegate mismatch issues
        const { delegateStatus: cachedStatus } = useTradeStore.getState();
        if (cachedStatus.isSetup && cachedStatus.delegateAddress) {
          // Prevent multiple simultaneous verifications for the same address
          if (verifyingRef.current === address) {
            return; // Already verifying this address
          }
          
          // Set verifying state to prevent trading during verification
          verifyingRef.current = address;
          setIsVerifyingDelegate(true);
          
          try {
            // Use the hook's checkDelegateStatus function
            const status = await checkDelegateStatus(address);
            
            // Check for delegate mismatch
            const onChainDelegate = status.delegateAddress?.toLowerCase();
            const cachedDelegate = cachedStatus.delegateAddress?.toLowerCase();
            const localDelegate = delegateAddress?.toLowerCase();
            
            if (!status.isSetup) {
              // On-chain says not set up, but cache says it is - clear cache
              useTradeStore.getState().setDelegateStatus({
                isSetup: false,
                delegateAddress: null,
                usdcApproved: false,
              });
            } else if (onChainDelegate && cachedDelegate && onChainDelegate !== cachedDelegate) {
              // Delegate mismatch - clear cache and force re-setup
              // User will see error message in SetupFlow guiding them to remove old delegate
              useTradeStore.getState().setDelegateStatus({
                isSetup: false,
                delegateAddress: null,
                usdcApproved: false,
              });
            } else if (onChainDelegate && localDelegate && onChainDelegate !== localDelegate) {
              // On-chain delegate doesn't match local delegate - clear cache and force re-setup
              useTradeStore.getState().setDelegateStatus({
                isSetup: false,
                delegateAddress: null,
                usdcApproved: false,
              });
            }
          } catch (err) {
            console.error('Failed to verify delegate status:', err);
            // On error, don't trust cache - force re-verification
            useTradeStore.getState().setDelegateStatus({
              isSetup: false,
              delegateAddress: null,
              usdcApproved: false,
            });
          } finally {
            // Always clear verifying state
            verifyingRef.current = null;
            setIsVerifyingDelegate(false);
          }
        } else {
          // No cached status to verify, clear verifying state
          verifyingRef.current = null;
          setIsVerifyingDelegate(false);
        }
      } else if (!authenticated) {
        onboardingBootstrappedForRef.current = null;
        // Clear delegate status, onboarding status, and access cache when logged out
        if (userAddress) {
          clearOnboardingStatus(userAddress);
          clearLocalAccess(userAddress);
        }
        loadDelegateStatusForUser(null);
        setIsOnboardingComplete(false);
        setIsCheckingOnboarding(false);
        setIsReturningUser(false);
        setIsDepositComplete(false);
        reset();
      }
    }

    verifyDelegateStatus();
  }, [authenticated, user, userAddress, loadDelegateStatusForUser, delegateAddress, checkDelegateStatus, reset]);
  const { signAndBroadcast, signAndWait } = useTxSigner();
  const { openMarket, closeMarket } = useAvantisTradeExecution();
  const { playWin, playLose } = useSound();
  const {
    balance: usdcBalance,
    refetch: refetchUsdcBalance,
    error: usdcBalanceError,
  } = useUsdcBalance();
  
  // Access code check (for gating app access)
  const walletAddress = authenticated ? user?.wallet?.address || null : null;
  const { hasAccess, isChecking: isCheckingAccess, grantAccess } = useAccessCheck(walletAddress);
  
  // Start fetching open trades + PnL immediately when user logs in
  const { fetchTrades: refetchOpenTrades } = useOpenTrades();

  // Pusher-driven position sync: on OrderFilled, immediately resolve position + refresh balance
  usePositionSync({
    enabled: stage === 'pnl' || stage === 'executing',
    onFilled: () => {
      refetchUsdcBalance();
      refetchOpenTrades();
    },
    onClose: (closedTrade) => {
      if (userAddress) {
        saveClosedTrade(userAddress, closedTrade, null, {
          closeTxHash: closedTrade.closeTxHash,
          isLiquidated: closedTrade.isLiquidated,
        });
      }

      // Reconcile the pending share card with authoritative Pusher data
      const store = useTradeStore.getState();
      const pending = store.lastClosedTradeForShare;
      if (pending) {
        const samePosition =
          pending.pairIndex === closedTrade.pairIndex &&
          pending.tradeIndex === closedTrade.tradeIndex;
        const sameTx =
          pending.closeTxHash && closedTrade.closeTxHash &&
          pending.closeTxHash.toLowerCase() === closedTrade.closeTxHash.toLowerCase();
        if (samePosition || sameTx) {
          store.setLastClosedTradeForShare({
            ...pending,
            finalPnL: closedTrade.finalPnL,
            finalPnLPercentage: closedTrade.finalPnLPercentage,
            closePrice: closedTrade.closePrice,
            isLiquidated: closedTrade.isLiquidated,
            isTakeProfitHit: closedTrade.isTakeProfitHit,
          });
        }
      }

      refetchUsdcBalance();
      refetchOpenTrades();
    },
    onCanceled: () => {
      refetchUsdcBalance();
    },
  });
  
  // Live marks: AuthenticatedPriceSync in providers (home + /activity only)

  // Collect chart data in background for all assets (pre-load for instant charts)
  useChartDataCollector();
  
  // Pre-build transactions when selection changes
  usePrebuiltTx();
  
  // Track if trade was confirmed via Pusher before wheel finished
  const tradeConfirmedRef = useRef(false);
  const confirmationLatencyRef = useRef<number | null>(null);
  // Track when wheel spin animation finishes
  const spinFinishedRef = useRef(false);
  // Track when spin started to filter out old trades
  const spinStartTimeRef = useRef<number | null>(null);
  // Track which trades we've already incremented volume for (by txHash)
  const volumeIncrementedRef = useRef<Set<`0x${string}`>>(new Set());
  // Track timing milestones for debugging
  const timingRef = useRef<{
    spinStart: number | null;
    txSent: number | null;
    txConfirmed: number | null;
    tradeFound: number | null;
    pnlStageSet: number | null;
  }>({
    spinStart: null,
    txSent: null,
    txConfirmed: null,
    tradeFound: null,
    pnlStageSet: null,
  });
  
  // Fast confirmation via Pusher events
  const { startConfirmation, confirmationStage } = useFastConfirmation(userAddress, {
    onPickedUp: () => {},
    onPreconfirmed: () => {},
    onConfirmed: (latency) => {
      const txConfirmedTime = Date.now();
      timingRef.current.txConfirmed = txConfirmedTime;
      const elapsedFromSpinStart = timingRef.current.spinStart ? txConfirmedTime - timingRef.current.spinStart : 0;
      const elapsedFromTxSent = timingRef.current.txSent ? txConfirmedTime - timingRef.current.txSent : null;
      debug(`✅ [Trade Timing] Transaction confirmed (${elapsedFromSpinStart}ms from spin start${elapsedFromTxSent ? `, ${elapsedFromTxSent}ms from tx sent` : ''})`);
      tradeConfirmedRef.current = true;
      confirmationLatencyRef.current = latency;
      vibrateDouble();
    },
    onFailed: (reason) => {
      setError(reason || 'Trade failed');
      setStage('error');
    },
  });
  
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isDepositComplete, setIsDepositComplete] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldSpin, setShouldSpin] = useState(false);
  const [isVerifyingDelegate, setIsVerifyingDelegate] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false);
  const [showPostCloseShare, setShowPostCloseShare] = useState(false);
  const verifyingRef = useRef<string | null>(null); // Track which address is being verified
  /** Ensures onboarding bootstrap runs once per wallet (avoids skipping when userAddress already matched Privy). */
  const onboardingBootstrappedForRef = useRef<string | null>(null);

  // Calculate total gross PnL for open trades (for warning banner)
  const totalOpenPnL = React.useMemo(() => {
    return openTrades.reduce((sum, trade) => {
      try {
        const currentPrice = prices[trade.pair]?.price;
        if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) return sum;
        if (!trade.openPrice || !Number.isFinite(trade.openPrice) || trade.openPrice <= 0) return sum;
        if (!Number.isFinite(trade.collateral) || !Number.isFinite(trade.leverage)) return sum;

        const positionSize = trade.collateral * trade.leverage;
        const grossPnl = trade.isLong
          ? positionSize * (currentPrice - trade.openPrice) / trade.openPrice
          : positionSize * (trade.openPrice - currentPrice) / trade.openPrice;
        return sum + (Number.isFinite(grossPnl) ? grossPnl : 0);
      } catch (err) {
        console.warn('[totalOpenPnL] Failed for trade:', trade.pairIndex, trade.tradeIndex, err);
        return sum;
      }
    }, 0);
  }, [openTrades, prices]);

  const needsAddFunds = useMemo(
    () => delegateStatus.isSetup && usdcBalance !== null && usdcBalance < collateral,
    [delegateStatus.isSetup, usdcBalance, collateral]
  );

  const openInsufficientFundsModal = useCallback(() => {
    setShowInsufficientFundsModal(true);
  }, []);

  // Handle spin start - fire trade immediately
  const handleSpinStart = useCallback(async () => {
    // CRITICAL: Prevent trading if setup is not complete
    if (!delegateStatus.isSetup) {
      console.error('[handleSpinStart] Trading blocked: Setup not complete');
      setError('Please complete setup before trading. Enable trading in the setup flow first.');
      setStage('error');
      return;
    }

    const spinStartTime = Date.now();
    // Reset timing tracking
    timingRef.current = {
      spinStart: spinStartTime,
      txSent: null,
      txConfirmed: null,
      tradeFound: null,
      pnlStageSet: null,
    };
    debug('🚀 [Trade Timing] Spin started');
    // Reset confirmation tracking
    tradeConfirmedRef.current = false;
    confirmationLatencyRef.current = null;
    spinFinishedRef.current = false;
    // Record spin start time to filter out old trades
    spinStartTimeRef.current = spinStartTime;
    
    // Get selection directly from store to avoid stale closure
    const storeState = useTradeStore.getState();
    const currentSelection = storeState.selection;
    const storedPrebuiltTx = storeState.prebuiltTx;
    
    // Get user address - from store or directly from Privy user
    const traderAddress = userAddress || (user?.wallet?.address as `0x${string}` | undefined);
    
    if (!traderAddress || !delegateAddress || !currentSelection) return;

    // Check USDC balance before proceeding
    if (usdcBalance !== null && usdcBalance < collateral) {
      debug(`[handleSpinStart] Insufficient funds: balance=${usdcBalance}, required=${collateral}`);
      setStage('idle');
      useTradeStore.getState().showToast('Insufficient USDC balance', 'error');
      setShowInsufficientFundsModal(true);
      return;
    }

    // Validate minimum position size ($100 minimum)
    const MIN_POSITION_SIZE_USD = 100;
    const positionSize = collateral * currentSelection.leverage.value;
    if (positionSize < MIN_POSITION_SIZE_USD) {
      const minCollateral = MIN_POSITION_SIZE_USD / currentSelection.leverage.value;
      setError(
        `Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE_USD.toFixed(2)}. ` +
        `With ${currentSelection.leverage.value}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC.`
      );
      setStage('error');
      return;
    }

    try {
      const txBuildStart = Date.now();
      const openPrice = prices[getPairKey(currentSelection.asset)]?.price || 0;
      const signStart = Date.now();

      let hash: `0x${string}`;
      if (AVANTIS_V2_ENABLED) {
        hash = await openMarket({
          trader: traderAddress,
          pairIndex: currentSelection.asset.pairIndex,
          collateral,
          leverage: currentSelection.leverage.value,
          isLong: currentSelection.direction.isLong,
          openPrice,
          takeProfitPercent: useTradeStore.getState().settings.takeProfitPercent,
        });
      } else {
        // v1: Use pre-built tx if available, otherwise build on-demand
        const unsignedTx = storedPrebuiltTx ?? buildOpenTradeTxDirect({
          trader: traderAddress,
          pairIndex: currentSelection.asset.pairIndex,
          collateral: collateral,
          leverage: currentSelection.leverage.value,
          isLong: currentSelection.direction.isLong,
          openPrice,
          takeProfitMultiplier: calculateTakeProfitMultiplier(
            currentSelection.direction.isLong,
            currentSelection.leverage.value,
            useTradeStore.getState().settings.takeProfitPercent
          ),
        });
        if (!unsignedTx) {
          setError('Failed to build trade transaction');
          setStage('error');
          return;
        }
        hash = await signAndBroadcast({
          to: unsignedTx.to as `0x${string}`,
          data: unsignedTx.data as `0x${string}`,
          value: unsignedTx.value,
          chainId: unsignedTx.chainId,
        });
      }

      const txEncodeTime = Date.now() - txBuildStart;
      const txSentTime = Date.now();
      const signAndRelayTime = txSentTime - signStart;
      timingRef.current.txSent = txSentTime;
      const elapsedFromSpinStart = timingRef.current.spinStart ? txSentTime - timingRef.current.spinStart : 0;
      debug(`📤 [Trade Timing] Transaction sent (${elapsedFromSpinStart}ms from spin start)`);
      debug(`   ⏱️  Breakdown: Encoding=${txEncodeTime}ms, Sign+Relay=${signAndRelayTime}ms`);
      setTxHash(hash);
      
      // Clear the pre-built tx (it's been used)
      useTradeStore.getState().setPrebuiltTx(null);
      
      // Start fast confirmation tracking via Pusher + polling
      startConfirmation(hash);
      
      // Add to pending trades for optimistic update
      addPendingTradeHash(hash);
      addPendingOpenTxHash(hash);
      
      setStage('executing');
    } catch (err) {
      console.error('Trade execution error:', err);
      setError(err instanceof Error ? err.message : 'Trade failed');
      setStage('error');
    }
  }, [
    userAddress,
    user,
    delegateAddress,
    delegateStatus.isSetup,
    collateral,
    usdcBalance,
    prices,
    signAndBroadcast,
    openMarket,
    setTxHash,
    setStage,
    setError,
    addPendingTradeHash,
    addPendingOpenTxHash,
    startConfirmation,
  ]);

  // Transition to PnL — called when BOTH wheel finished AND confirmation received
  const transitionToPnL = useCallback(() => {
    const storeState = useTradeStore.getState();
    // Always bind placeholder to current selection so a second open while another
    // position is still tracked does not leave stale currentTrade / pnlData.
    if (storeState.selection) {
      const openPrice = prices[getPairKey(storeState.selection.asset)]?.price || 0;
      const tpPercent = storeState.settings.takeProfitPercent ?? 200;
      const tpPrice = openPrice * calculateTakeProfitMultiplier(
        storeState.selection.direction.isLong,
        storeState.selection.leverage.value,
        tpPercent
      );
      const tempTrade: Trade = {
        tradeIndex: 0,
        pairIndex: storeState.selection.asset.pairIndex,
        pair: getPairKey(storeState.selection.asset),
        collateral: collateral,
        leverage: storeState.selection.leverage.value,
        isLong: storeState.selection.direction.isLong,
        openPrice,
        tp: tpPrice,
        sl: 0,
        liquidationPrice: 0,
        openedAt: Math.floor(Date.now() / 1000),
      };
      setCurrentTrade(tempTrade);
      setPnLData({
        trade: tempTrade,
        currentPrice: tempTrade.openPrice,
        pnl: 0,
        pnlPercentage: 0,
        grossPnl: 0,
        grossPnlPercentage: 0,
      });
      setPositionSource('placeholder');
    }
    setStage('pnl');
  }, [prices, collateral, setCurrentTrade, setPnLData, setStage, setPositionSource]);

  // Handle spin complete — wheel animation finished
  const handleSpinComplete = useCallback(async () => {
    if (!userAddress) {
      setError('User address not available');
      setStage('error');
      return;
    }

    spinFinishedRef.current = true;

    // If confirmation already arrived while wheel was spinning, transition now
    if (tradeConfirmedRef.current) {
      transitionToPnL();
      return;
    }

    // Otherwise wait for txHash at least
    const storeState = useTradeStore.getState();
    if (!storeState.txHash) {
      const WAIT_FOR_TX_TIMEOUT = 3000;
      const waitStart = Date.now();
      while (Date.now() - waitStart < WAIT_FOR_TX_TIMEOUT) {
        if (useTradeStore.getState().txHash) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (!useTradeStore.getState().txHash) {
        setError('Trade execution may have failed. Please check your wallet and try again.');
        setStage('error');
        return;
      }
    }
    // Wheel done, waiting for confirmation — effect below will handle it
  }, [userAddress, setStage, setError, transitionToPnL]);

  // When confirmation arrives: transition only if wheel already finished
  useEffect(() => {
    if (stage !== 'executing' || confirmationStage !== 'confirmed' || !userAddress) return;

    if (spinFinishedRef.current) {
      transitionToPnL();
    }
    // If spin hasn't finished, handleSpinComplete will call transitionToPnL when it does
  }, [stage, confirmationStage, userAddress, transitionToPnL]);

  useEffect(() => {
    if (stage === 'pnl') {
      const pnlRenderTime = Date.now();
      const timing = timingRef.current;
      const elapsedFromSpinStart = timing.spinStart ? pnlRenderTime - timing.spinStart : null;
      
      // Calculate phase durations
      const txBuildTime = timing.txSent && timing.spinStart ? timing.txSent - timing.spinStart : null;
      const txConfirmTime = timing.txConfirmed && timing.txSent ? timing.txConfirmed - timing.txSent : null;
      const tradeDiscoveryTime = timing.tradeFound && timing.txConfirmed ? timing.tradeFound - timing.txConfirmed : null;
      const pnlRenderDelay = timing.tradeFound ? pnlRenderTime - timing.tradeFound : null;
      
      // Console log summary
      debug('📊 [Trade Timing] PnL Screen Rendered - Summary:');
      debug(`   Total time: ${elapsedFromSpinStart ? (elapsedFromSpinStart / 1000).toFixed(2) : 'N/A'}s`);
      if (txBuildTime) debug(`   ⏱️  TX Build: ${txBuildTime}ms`);
      if (txConfirmTime) debug(`   ⏱️  TX Confirm: ${txConfirmTime}ms`);
      if (tradeDiscoveryTime) debug(`   ⏱️  Trade Discovery: ${tradeDiscoveryTime}ms`);
      if (pnlRenderDelay) debug(`   ⏱️  PnL Render Delay: ${pnlRenderDelay}ms`);
    }
  }, [stage]);

  // Ref for retry handler to avoid stale closure in toast
  const handleCloseTradeRef = useRef<(() => Promise<void>) | null>(null);

  // Handle close trade - uses pre-built tx or direct encoding (no SDK)
  // Optimized: Show success immediately using pnlData, reconcile in background
  const handleCloseTrade = useCallback(async () => {
    // CRITICAL: Prevent closing trades if setup is not complete (defensive check)
    if (!delegateStatus.isSetup) {
      console.error('[handleCloseTrade] Trade close blocked: Setup not complete');
      setError('Please complete setup before closing trades. Enable trading in the setup flow first.');
      return;
    }

    const { currentTrade, pnlData, prebuiltCloseTx, setPrebuiltCloseTx, setIsIntentionalClose } = useTradeStore.getState();
    if (!userAddress || !delegateAddress || !currentTrade) return;

    // Set BEFORE any await - prevents PnL poll from false liquidation during close
    setIsIntentionalClose(true);
    setIsClosing(true);

    try {
      let closeTxHash: `0x${string}`;
      if (AVANTIS_V2_ENABLED) {
        const expectedPrice =
          pnlData?.currentPrice ??
          prices[currentTrade.pair]?.price ??
          currentTrade.openPrice;
        closeTxHash = await closeMarket({
          trader: userAddress,
          pairIndex: currentTrade.pairIndex,
          tradeIndex: currentTrade.tradeIndex,
          collateralToClose: currentTrade.collateral,
          openTimestamp: currentTrade.openedAt,
          expectedPrice,
          isPnl: true,
        });
        setPrebuiltCloseTx(null);
      } else {
        // Use pre-built tx if available, otherwise build on-demand
        const closeTx = prebuiltCloseTx 
          ? (setPrebuiltCloseTx(null), prebuiltCloseTx)
          : buildCloseTradeTxDirect({
              trader: userAddress,
              pairIndex: currentTrade.pairIndex,
              tradeIndex: currentTrade.tradeIndex,
              collateralToClose: currentTrade.collateral,
            });
        ({ hash: closeTxHash } = await signAndWait(closeTx));
      }

      // Use existing pnlData for immediate feedback (Avantis v3 feed prices)
      // Use NET PnL (what user sees on screen) for share card consistency
      const closePrice = pnlData?.currentPrice ?? currentTrade.openPrice;
      const netPnl = pnlData?.pnl ?? 0;
      const netPnlPct = pnlData?.pnlPercentage ?? 0;

      if (netPnlPct >= 0) {
        playWin();
      } else {
        playLose();
      }

      const pnlStr = netPnl >= 0 ? `+$${netPnl.toFixed(2)}` : `-$${Math.abs(netPnl).toFixed(2)}`;
      showToast(`Closed! PnL: ${pnlStr}`, 'success');

      if (userAddress && currentTrade) {
        saveClosedTrade(userAddress, currentTrade, pnlData, {
          closeTxHash,
          isLiquidated: false,
        });
        const closedTrade: ClosedTrade = {
          ...currentTrade,
          closedAt: Date.now(),
          finalPnL: netPnl,
          finalPnLPercentage: netPnlPct,
          closePrice,
          closeTxHash,
          isLiquidated: false,
          isTakeProfitHit: false,
        };
        setLastClosedTradeForShare(closedTrade);
        logTradeCloseByPosition({
          wallet: userAddress,
          pairIndex: currentTrade.pairIndex,
          tradeIndex: currentTrade.tradeIndex,
          exitPrice: closePrice,
          pnl: netPnl,
          closedAt: new Date().toISOString(),
          txHash: closeTxHash,
          isLiquidated: false,
        });
      }

      // Reset and go back to idle immediately (don't wait for reconciliation)
      reset();
      void refetchOpenTrades();

      // Background reconciliation: update saved trade if API shows different data (e.g., liquidation)
      const tradeToReconcile = currentTrade;
      const userToReconcile = userAddress;
      void (async () => {
        try {
          const reconciled = await fetchRecentClosedTradeMatch(
            userToReconcile,
            tradeToReconcile.pairIndex,
            tradeToReconcile.tradeIndex
          );
          if (reconciled && reconciled.isLiquidated) {
            // Update saved trade with liquidation data
            saveClosedTrade(userToReconcile, tradeToReconcile, null, {
              closeTxHash,
              isLiquidated: true,
            });
          }
        } catch {
          // Ignore reconciliation errors — we already saved with best-effort data
        }
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to close trade';
      setError(msg);
      showToast(msg, 'error', undefined, { label: 'RETRY', onClick: () => handleCloseTradeRef.current?.() });
    } finally {
      setIsClosing(false);
      setIsIntentionalClose(false); // Clear flag after close attempt
    }
  }, [userAddress, delegateAddress, delegateStatus.isSetup, signAndWait, closeMarket, prices, setError, reset, playWin, playLose, showToast, setLastClosedTradeForShare, refetchOpenTrades]);

  handleCloseTradeRef.current = handleCloseTrade;

  // Show share card after close notification (toast + sound) has a moment to land
  useEffect(() => {
    if (!lastClosedTradeForShare) {
      setShowPostCloseShare(false);
      return;
    }
    setShowPostCloseShare(false);
    const timer = window.setTimeout(() => setShowPostCloseShare(true), POST_CLOSE_SHARE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [lastClosedTradeForShare]);

  // Handle roll again
  const handleRollAgain = useCallback(() => {
    reset();
  }, [reset]);

  // Warn before closing tab/window when trade is in progress
  useEffect(() => {
    const shouldWarn =
      stage === 'spinning' || stage === 'executing' || isClosing;
    if (!shouldWarn) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stage, isClosing]);

  // Loading state
  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center safe-area-top safe-area-bottom" role="status" aria-live="polite" aria-label="Loading application">
        <div className="text-[#CCFF00] text-2xl sm:text-3xl font-bold animate-pulse" aria-hidden="true">LOADING...</div>
        <span className="sr-only">Loading YOLO trading application</span>
      </div>
    );
  }

  // Not authenticated - show premium landing
  if (!authenticated) {
    return (
      <div className="safe-area-top safe-area-bottom">
        <LandingPremium onLogin={login} />
      </div>
    );
  }

  // Embedded wallet created after login — wait before access check / redeem
  const bypassAccess = process.env.NEXT_PUBLIC_BYPASS_ACCESS_CODE === 'true';
  if (authenticated && !user?.wallet?.address && !bypassAccess) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center safe-area-top safe-area-bottom">
        <div className="text-xl sm:text-2xl font-bold text-[#CCFF00] mb-4 animate-pulse">PREPARING WALLET...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Checking access status
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center safe-area-top safe-area-bottom">
        <div className="text-xl sm:text-2xl font-bold text-[#CCFF00] mb-4 animate-pulse">CHECKING ACCESS...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No access - show access code gate
  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-black flex flex-col safe-area-top safe-area-bottom">
        <header className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-6">
          <Link href="/" className="text-[#CCFF00] text-2xl sm:text-3xl font-black font-mono tracking-tighter hover:opacity-80 transition-opacity">YOLO</Link>
          <LoginButton />
        </header>
        <main className="flex-1 flex items-center justify-center px-4" id="main-content">
          <AccessCodeGate 
            walletAddress={walletAddress as string} 
            onAccessGranted={() => grantAccess(walletAddress as string)} 
          />
        </main>
      </div>
    );
  }

  if (hasAccess !== true) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center safe-area-top safe-area-bottom">
        <div className="text-xl sm:text-2xl font-bold text-[#CCFF00] mb-4 animate-pulse">CHECKING ACCESS...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show loading while checking onboarding status from backend (new device / cleared storage)
  if (isCheckingOnboarding) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center safe-area-top safe-area-bottom">
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">CHECKING...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Authenticated - check onboarding first (only if delegate not set up)
  // If delegate is already set up, skip onboarding (returning user)
  // Backend API is source of truth for returning users (new device); localStorage is fast path for same device
  const needsOnboarding = userAddress && !delegateStatus.isSetup && !isOnboardingComplete;
  if (needsOnboarding) {
    return (
      <div className="min-h-screen bg-black flex flex-col safe-area-top safe-area-bottom">
        <header className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-6">
          <Link href="/" className="text-[#CCFF00] text-xl sm:text-2xl font-bold hover:opacity-80 transition-opacity">YOLO</Link>
          <LoginButton />
        </header>
        <main className="flex-1 flex items-center justify-center px-4" id="main-content">
          <OnboardingFlow onComplete={() => {
            setIsReturningUser(false); // New user - they need deposit
            setIsOnboardingComplete(true);
          }} />
        </main>
      </div>
    );
  }

  // Show loading while verifying delegate status (prevents race condition)
  if (isVerifyingDelegate) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center safe-area-top safe-area-bottom">
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">VERIFYING SETUP...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // After onboarding: prompt to deposit USDC before setup (until they have enough and click Continue)
  // Only for first-time new users - returning users skip deposit
  // If USDC balance RPC fails locally (bad key, rate limit), balance stays null and users were
  // stuck on DEPOSIT forever while production skips this screen for returning users. Allow setup.
  const needsDeposit =
    isOnboardingComplete &&
    !isReturningUser &&
    !delegateStatus.isSetup &&
    !isSetupComplete &&
    !usdcBalanceError &&
    (usdcBalance === null || usdcBalance < MIN_DEPOSIT || !isDepositComplete);
  if (needsDeposit) {
    return (
      <div className="min-h-screen bg-black flex flex-col safe-area-top safe-area-bottom">
        <header className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-6">
          <Link href="/" className="text-[#CCFF00] text-xl sm:text-2xl font-bold hover:opacity-80 transition-opacity">YOLO</Link>
          <LoginButton />
        </header>
        <main className="flex-1 flex items-center justify-center px-4" id="main-content">
          <DepositUSDC onDeposited={() => setIsDepositComplete(true)} />
        </main>
      </div>
    );
  }

  // Authenticated but not set up (onboarding complete, deposit done)
  if (!delegateStatus.isSetup && !isSetupComplete) {
    return (
      <div className="min-h-screen bg-black flex flex-col safe-area-top safe-area-bottom">
        <header className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-6">
          <Link href="/" className="text-[#CCFF00] text-xl sm:text-2xl font-bold hover:opacity-80 transition-opacity">YOLO</Link>
          <LoginButton />
        </header>
        <main className="flex-1 flex items-center justify-center px-4" id="main-content">
          <SetupFlow onSetupComplete={() => setIsSetupComplete(true)} />
        </main>
      </div>
    );
  }

  // Main app
  return (
    <div 
      className="bg-black flex flex-col relative w-full safe-area-top safe-area-bottom max-w-lg mx-auto"
      style={{
        height: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl') 
          ? '100dvh' 
          : 'min-h-screen',
        maxHeight: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl') 
          ? '100dvh' 
          : 'none',
        overflow: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl') 
          ? 'hidden' 
          : 'auto',
        // Enforce mobile constraints on desktop
        maxWidth: '32rem', // 512px - desktop max width
        width: '100%',
      }}
    >
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:px-4 focus:py-2 focus:bg-[#CCFF00] focus:text-black focus:font-bold focus:border-4 focus:border-black focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      >
        Skip to main content
      </a>
      
      {/* Abstract Background */}
      <AbstractBackground />
      
      {/* Header - Compact and always visible */}
      {stage !== 'pnl' && (
        <header className="w-full flex justify-between items-center px-4 py-2 relative z-50 shrink-0">
          <Link href="/" className="text-[#CCFF00] text-xl sm:text-2xl font-bold hover:opacity-80 transition-opacity">YOLO</Link>
          <LoginButton />
        </header>
      )}

      {/* Financial Info Bar */}
      {stage !== 'pnl' && (
        <FinancialInfoBar collateral={collateral} usdcBalance={usdcBalance} />
      )}

      {/* Main content - No scroll for picker/pnl screens */}
      <main 
        id="main-content"
        className={`flex-1 flex items-center justify-center w-full min-h-0 relative z-10 ${
          (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl')
            ? 'overflow-hidden'
            : 'overflow-y-auto'
        }`}
        role="main"
        aria-label="Trading interface"
        style={{
          paddingBottom: (stage === 'idle' || stage === 'spinning' || stage === 'executing')
            ? '120px'
            : stage === 'pnl'
            ? '0'
            : '72px',
          height: (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl')
            ? '100%'
            : 'auto',
        }}
      >
        {/* Live region for status updates */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          id="status-announcements"
        />

        {/* Floating mute button - only on picker wheel / home screen */}
        {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
          <MusicToggleButton />
        )}

        <StageRouter stage={stage}>
          {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
            <section
              aria-label="Trade selection wheel"
              className="w-full h-full flex flex-col items-center justify-center"
              style={{
                padding: 'clamp(0.5rem, 2vh, 1rem)',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {/* Simple inline text for open positions */}
              {stage === 'idle' && openTrades.length > 0 && (
                <div
                  className="shrink-0 mb-2 text-center"
                  style={{
                    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                  }}
                >
                  <span
                    className="font-semibold font-mono"
                    style={{
                      color: totalOpenPnL >= 0 ? '#CCFF00' : '#FF006E',
                    }}
                  >
                    {openTrades.length} open • {totalOpenPnL >= 0 ? '+' : ''}${totalOpenPnL.toFixed(2)} P&L
                  </span>
                  {' '}
                  <Link
                    href="/activity"
                    className="font-semibold underline hover:no-underline touch-manipulation font-mono"
                    style={{
                      color: totalOpenPnL >= 0 ? '#CCFF00' : '#FF006E',
                    }}
                    aria-label={`View ${openTrades.length} open position${openTrades.length !== 1 ? 's' : ''}`}
                  >
                    view
                  </Link>
                </div>
              )}
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ minHeight: 0 }}
              >
                <PickerWheel
                  onSpinStart={handleSpinStart}
                  onSpinComplete={handleSpinComplete}
                  triggerSpin={shouldSpin}
                  blockSpinForFunds={needsAddFunds}
                  onBlockedByFunds={openInsufficientFundsModal}
                />
              </div>
            </section>
          )}

          {stage === 'pnl' && (
            <section
              aria-label="Profit and loss display"
              className="w-full h-full"
              style={{
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <PnLScreen
                onClose={handleCloseTrade}
                onRollAgain={handleRollAgain}
                isClosing={isClosing}
              />
            </section>
          )}

          {stage === 'error' && (
            <section
              role="alert"
              aria-live="assertive"
              className="flex flex-col items-center gap-6 sm:gap-8 text-center px-4 pb-24"
            >
              <h2 className="text-[#FF006E] text-3xl sm:text-4xl font-bold">ERROR</h2>
              <p className="text-white/70 text-base sm:text-lg max-w-md">
                Something went wrong. Please try again.
              </p>
              <button
                onClick={reset}
                className="px-8 sm:px-10 py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button bg-[#CCFF00] text-black min-h-[44px] touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-4 focus:ring-offset-black"
                aria-label="Try again to reset and return to trading"
              >
                TRY AGAIN
              </button>
            </section>
          )}
        </StageRouter>
      </main>

      {/* Bottom Action Area - NavFooter with ROLL Button */}
      {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
        <NavFooter
          openTradesCount={openTrades.length}
          showRollButton
          rollButton={
            <button
              onClick={() => {
                if (stage !== 'idle' || !delegateStatus.isSetup) return;
                if (needsAddFunds) {
                  openInsufficientFundsModal();
                  return;
                }
                setShouldSpin(true);
                setTimeout(() => setShouldSpin(false), 100);
              }}
              disabled={stage !== 'idle' || !delegateStatus.isSetup || !isOnline}
              aria-label={
                !isOnline
                  ? 'You are offline. Reconnect to trade'
                  : !delegateStatus.isSetup
                  ? 'Please complete setup before trading'
                  : stage === 'idle' && needsAddFunds
                  ? 'Add USDC to meet collateral requirement'
                  : stage === 'idle'
                  ? 'Spin the wheel to select trade parameters'
                  : 'Wheel is spinning, please wait'
              }
              aria-busy={stage !== 'idle'}
              className={`
                w-full py-4 text-2xl sm:text-3xl font-black brutal-button min-h-[56px] touch-manipulation
                transition-all duration-200 shadow-[0_8px_0px_0px_rgba(0,0,0,0.3)]
                focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-4 focus:ring-offset-black
                ${stage === 'idle'
                  ? 'bg-[#CCFF00] text-black hover:shadow-[0_6px_0px_0px_rgba(0,0,0,0.3)] hover:translate-y-[2px] active:shadow-[0_2px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-[6px]'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-[0_4px_0px_0px_rgba(0,0,0,0.3)]'
                }
              `}
            >
              {stage === 'idle' ? (
                <span className="flex items-center justify-center gap-2">
                  {needsAddFunds ? (
                    <>
                      <Wallet className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
                      <span>ADD FUNDS</span>
                    </>
                  ) : (
                    <>
                      <Dice5 className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={3} />
                      <span>ROLL</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" strokeWidth={2.5} />
                  <span>SPINNING...</span>
                </span>
              )}
            </button>
          }
          warnOnNavigate={stage === 'spinning' || stage === 'executing'}
        />
      )}

      {/* Bottom Navigation Bar - Only shown when not in trading stage */}
      {stage !== 'idle' && stage !== 'spinning' && stage !== 'executing' && stage !== 'pnl' && (
        <NavFooter openTradesCount={openTrades.length} />
      )}


      {/* Confirmation Modal for Rolling with Open Trades */}

      {/* Insufficient Funds Modal */}
      <InsufficientFundsModal
        isOpen={showInsufficientFundsModal}
        onClose={() => setShowInsufficientFundsModal(false)}
        currentBalance={usdcBalance ?? 0}
        requiredAmount={collateral}
        userAddress={userAddress ?? ''}
        onFundingComplete={refetchUsdcBalance}
        onFundingError={(msg) => showToast(msg, 'error')}
      />

      {/* Share card after user-initiated close */}
      {showPostCloseShare && lastClosedTradeForShare && (
        <ShareBottomSheet
          trade={lastClosedTradeForShare}
          onClose={() => {
            setShowPostCloseShare(false);
            setLastClosedTradeForShare(null);
          }}
          onCopy={() => showToast('Copied to clipboard', 'success')}
          onDownload={() => showToast('Downloaded', 'success')}
          onShare={() => showToast('Shared!', 'success')}
          onShareOnX={(m) => m === 'clipboard' && showToast('Image copied — paste it in your tweet', 'info')}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
