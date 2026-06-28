'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTradeStore } from '@/store/tradeStore';
import { usePaperTrading } from '@/context/PaperTradingContext';
import { usePaperBalance } from '@/hooks/usePaperBalance';
import { usePaperTradeExecution } from '@/hooks/usePaperTradeExecution';
import { usePaperPnL } from '@/hooks/usePaperPnL';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useChartDataCollector } from '@/hooks/useChartDataCollector';
import { useSound } from '@/hooks/useSound';
import { PickerWheel } from '@/components/PickerWheel';
import { ToastContainer } from '@/components/Toast';
import { AbstractBackground } from '@/components/AbstractBackground';
import { NavFooter } from '@/components/NavFooter';
import { FinancialInfoBar } from '@/components/FinancialInfoBar';
import { MusicToggleButton } from '@/components/MusicToggleButton';
import { StageRouter } from '@/components/StageRouter';
import { PnLScreen } from '@/components/PnLScreen';
import { PaperInsufficientFundsModal } from '@/components/PaperInsufficientFundsModal';
import { PaperIcon } from '@/components/PaperBadge';
import { loadPaperSettings } from '@/lib/paperSettings';
import { loadOpenPaperTrades, computeOpenTradesTotalPnL } from '@/lib/paperTrades';
import { loadPaperStats } from '@/lib/paperStats';
import { Dice5, Loader2 } from 'lucide-react';

const ShareBottomSheet = dynamic(
  () => import('@/components/ShareBottomSheet').then((m) => ({ default: m.ShareBottomSheet })),
  { ssr: false }
);

export default function PaperTradingPage() {
  const { guestId } = usePaperTrading();
  const { balance, refresh: refreshBalance, resetBalance } = usePaperBalance();
  const { isOnline } = useNetworkStatus();
  useChartDataCollector();

  const {
    stage,
    collateral,
    openTrades,
    prices,
    confirmationStage,
    setStage,
    setSettings,
    setCollateral,
    setOpenTrades,
    setTradeStats,
    reset,
    toasts,
    removeToast,
    showToast,
    lastClosedTradeForShare,
    setLastClosedTradeForShare,
  } = useTradeStore();

  const {
    handleSpinStart,
    handleSpinComplete,
    handleCloseTrade,
    handleFlipTrade,
    handleRollAgain,
    onConfirmationComplete,
    isClosing,
    isFlipping,
  } = usePaperTradeExecution();

  usePaperPnL({ enabled: true });

  const [shouldSpin, setShouldSpin] = useState(false);
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    const settings = loadPaperSettings(guestId);
    setSettings(settings);
    setCollateral(settings.collateral);
    setOpenTrades(loadOpenPaperTrades(guestId));
    setTradeStats(loadPaperStats(guestId));
    refreshBalance();
    setMounted(true);
  }, [guestId, setSettings, setCollateral, setOpenTrades, setTradeStats, refreshBalance]);

  const needsAddFunds = balance !== null && balance < collateral;

  useEffect(() => {
    if (confirmationStage === 'confirmed' && stage === 'executing') {
      onConfirmationComplete();
    }
  }, [confirmationStage, stage, onConfirmationComplete]);

  const totalOpenPnL = useMemo(
    () => computeOpenTradesTotalPnL(openTrades, prices),
    [openTrades, prices]
  );

  const openInsufficientFundsModal = useCallback(() => {
    setShowFundsModal(true);
  }, []);

  const handleResetBalance = useCallback(() => {
    resetBalance();
    showToast('Paper balance reset to $10,000', 'success');
  }, [resetBalance, showToast]);

  useEffect(() => {
    const shouldWarn = stage === 'spinning' || stage === 'executing' || isClosing;
    if (!shouldWarn) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [stage, isClosing]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[#CCFF00] text-2xl font-bold animate-pulse">LOADING...</div>
      </div>
    );
  }

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
        maxWidth: '32rem',
        width: '100%',
      }}
    >
      <AbstractBackground />

      {stage !== 'pnl' && (
        <header className="w-full flex justify-between items-center px-4 py-2 relative z-50 shrink-0">
          <div className="flex items-center gap-2">
            <Link href="/paper" className="text-[#CCFF00] text-xl sm:text-2xl font-bold hover:opacity-80 transition-opacity">
              YOLO
            </Link>
            <PaperIcon />
          </div>
        </header>
      )}

      {stage !== 'pnl' && (
        <FinancialInfoBar
          collateral={collateral}
          usdcBalance={balance}
          balanceLabel="PAPER BALANCE"
        />
      )}

      <main
        id="main-content"
        className={`flex-1 flex items-center justify-center w-full min-h-0 relative z-10 ${
          (stage === 'idle' || stage === 'spinning' || stage === 'executing' || stage === 'pnl')
            ? 'overflow-hidden'
            : 'overflow-y-auto'
        }`}
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
        {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
          <MusicToggleButton />
        )}

        <StageRouter stage={stage}>
          {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
            <section
              aria-label="Trade selection wheel"
              className="w-full h-full flex flex-col items-center justify-center"
              style={{ padding: 'clamp(0.5rem, 2vh, 1rem)', minHeight: 0, overflow: 'hidden' }}
            >
              {stage === 'idle' && openTrades.length > 0 && (
                <div className="shrink-0 mb-2 text-center" style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>
                  <span
                    className="font-semibold font-mono"
                    style={{ color: totalOpenPnL >= 0 ? '#CCFF00' : '#FF006E' }}
                  >
                    {openTrades.length} open • {totalOpenPnL >= 0 ? '+' : ''}${totalOpenPnL.toFixed(2)} P&L
                  </span>
                  {' '}
                  <Link
                    href="/paper/activity"
                    className="font-semibold underline hover:no-underline touch-manipulation font-mono"
                    style={{ color: totalOpenPnL >= 0 ? '#CCFF00' : '#FF006E' }}
                  >
                    view
                  </Link>
                </div>
              )}
              <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 0 }}>
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
            <section aria-label="Profit and loss display" className="w-full h-full" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
              <PnLScreen
                onClose={handleCloseTrade}
                onRollAgain={handleRollAgain}
                isClosing={isClosing}
                paperMode
                onFlip={handleFlipTrade}
                isFlippingExternal={isFlipping}
              />
            </section>
          )}

          {stage === 'error' && (
            <section role="alert" className="flex flex-col items-center gap-6 text-center px-4 pb-24">
              <h2 className="text-[#FF006E] text-3xl font-bold">ERROR</h2>
              <p className="text-white/70 text-base max-w-md">Something went wrong. Please try again.</p>
              <button
                onClick={reset}
                className="px-8 py-4 text-lg font-bold brutal-button bg-[#CCFF00] text-black min-h-[44px]"
              >
                TRY AGAIN
              </button>
            </section>
          )}
        </StageRouter>
      </main>

      {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
        <NavFooter
          basePath="/paper"
          openTradesCount={openTrades.length}
          showRollButton
          warnOnNavigate={stage === 'spinning' || stage === 'executing'}
          rollButton={
            <button
              onClick={() => {
                if (stage !== 'idle') return;
                if (needsAddFunds) {
                  openInsufficientFundsModal();
                  return;
                }
                setShouldSpin(true);
                setTimeout(() => setShouldSpin(false), 100);
              }}
              disabled={stage !== 'idle' || !isOnline}
              className="w-full py-3.5 px-6 font-black text-lg uppercase tracking-wider
                bg-[#CCFF00] text-black border-4 border-black
                shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px]
                active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px]
                transition-all disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 touch-manipulation min-h-[52px]"
            >
              {stage === 'spinning' || stage === 'executing' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  ROLLING...
                </>
              ) : (
                <>
                  <Dice5 className="w-5 h-5" strokeWidth={2.5} />
                  ROLL
                </>
              )}
            </button>
          }
        />
      )}

      <PaperInsufficientFundsModal
        isOpen={showFundsModal}
        onClose={() => setShowFundsModal(false)}
        currentBalance={balance ?? 0}
        requiredAmount={collateral}
        onResetBalance={handleResetBalance}
      />

      {lastClosedTradeForShare && (
        <ShareBottomSheet
          trade={lastClosedTradeForShare}
          onClose={() => setLastClosedTradeForShare(null)}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
