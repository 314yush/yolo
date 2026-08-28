'use client';

import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { markOnboardingComplete } from '@/lib/onboarding';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type OnboardingStep = 0 | 1 | 2;

interface OnboardingScreen {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

const screens: OnboardingScreen[] = [
  {
    title: 'SPIN THE WHEEL, OPEN A TRADE',
    description: 'YOLO lets you trade perpetuals with zero fees. Spin the wheel to randomly select your asset, leverage, and direction—then watch your trade execute instantly.',
    icon: (
      <svg
        className="w-24 h-24 sm:w-32 sm:h-32 text-[#CCFF00]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2v20M2 12h20" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    title: 'ZERO FEES, INSTANT TRADES',
    description: 'Trades execute instantly with no gas fees and no wallet pop-ups. Your funds stay in your own wallet—we never hold them.',
    icon: (
      <svg
        className="w-24 h-24 sm:w-32 sm:h-32 text-[#CCFF00]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: 'READY TO TRADE?',
    description: 'Add USDC to your wallet on Base and you\u2019re live. No setup, no approvals, no gas—just spin.',
    icon: (
      <svg
        className="w-24 h-24 sm:w-32 sm:h-32 text-[#CCFF00]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
  },
];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { user } = usePrivy();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(0);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const userAddress = user?.wallet?.address as `0x${string}` | undefined;

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep((prev) => (prev + 1) as OnboardingStep);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    if (userAddress) {
      markOnboardingComplete(userAddress);
    }
    onComplete();
  };

  const handleSkipClick = () => {
    setShowSkipConfirm(true);
  };

  const handleSkipConfirm = () => {
    setShowSkipConfirm(false);
    handleComplete();
  };

  const handleSkipCancel = () => {
    setShowSkipConfirm(false);
  };

  const currentScreen = screens[currentStep];
  const isLastStep = currentStep === 2;

  return (
    <div className="relative flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-lg mx-auto w-full min-h-[60vh]">
      {/* Skip button - top right */}
      <button
        onClick={handleSkipClick}
        className="absolute top-4 right-4 text-white/60 text-sm font-bold hover:text-white/80 transition-colors touch-manipulation min-h-[44px] px-3"
        aria-label="Skip onboarding"
      >
        SKIP
      </button>

      {/* Skip confirmation modal */}
      {showSkipConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-confirm-title"
        >
          <div className="bg-black border-4 border-[#CCFF00] p-6 max-w-sm w-full">
            <h3 id="skip-confirm-title" className="text-[#CCFF00] font-black text-lg mb-4">
              SKIP TUTORIAL?
            </h3>
            <p className="text-white/80 text-sm mb-6">
              You&apos;ll figure it out — add USDC and spin.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSkipCancel}
                className="flex-1 py-3 font-bold border-4 border-white bg-black text-white hover:bg-white/10 transition-colors touch-manipulation"
              >
                GO BACK
              </button>
              <button
                onClick={handleSkipConfirm}
                className="flex-1 py-3 font-bold brutal-button bg-[#CCFF00] text-black touch-manipulation"
              >
                SKIP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Icon */}
      <div className="mb-6 sm:mb-8 flex items-center justify-center">
        {currentScreen.icon}
      </div>

      {/* Title */}
      <h2 className="text-2xl sm:text-3xl font-bold text-[#CCFF00] mb-4 sm:mb-6 leading-tight">
        {currentScreen.title}
      </h2>

      {/* Description */}
      <p className="text-white/80 text-base sm:text-lg mb-8 sm:mb-10 leading-relaxed max-w-sm">
        {currentScreen.description}
      </p>

      {/* Dot indicators */}
      <div className="flex gap-2 mb-8 sm:mb-10">
        {screens.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentStep(index as OnboardingStep)}
            className={`w-2 h-2 rounded-full transition-all touch-manipulation ${
              index === currentStep
                ? 'bg-[#CCFF00] w-8'
                : 'bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`Go to step ${index + 1}`}
            aria-current={index === currentStep ? 'step' : undefined}
          />
        ))}
      </div>

      {/* CTA Button */}
      <button
        onClick={handleNext}
        className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
        aria-label={isLastStep ? 'Get started' : 'Next'}
      >
        {isLastStep ? 'GET STARTED' : 'NEXT'}
      </button>

      {/* Swipe hint for mobile */}
      {currentStep < 2 && (
        <p className="mt-4 text-white/40 text-xs">
          Swipe or tap NEXT to continue
        </p>
      )}
    </div>
  );
}
