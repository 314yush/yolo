'use client';

import React from 'react';
import type { ConfirmationStage } from '@/store/tradeStore';

interface ProgressStepsProps {
  stage: ConfirmationStage;
}

const STEPS = [
  { key: 'submitted', label: 'Sent' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'preconfirmed', label: 'Confirming' },
] as const;

const STAGE_ORDER: Record<string, number> = {
  none: -1,
  submitted: 0,
  picked_up: 1,
  preconfirmed: 2,
  confirmed: 3,
  failed: -1,
};

export function ProgressSteps({ stage }: ProgressStepsProps) {
  const currentIndex = STAGE_ORDER[stage] ?? -1;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isComplete = currentIndex > i;
          const isActive = currentIndex === i;

          return (
            <React.Fragment key={step.key}>
              {i > 0 && (
                <div
                  className="w-8 h-0.5"
                  style={{
                    backgroundColor: isComplete ? 'var(--color-brand)' : 'rgba(255,255,255,0.15)',
                  }}
                />
              )}
              <div
                className="w-7 h-7 flex items-center justify-center text-xs font-bold"
                style={{
                  border: `2px solid ${isComplete || isActive ? 'var(--color-brand)' : 'rgba(255,255,255,0.15)'}`,
                  backgroundColor: isComplete ? 'var(--color-brand)' : 'transparent',
                  color: isComplete ? '#000' : isActive ? 'var(--color-brand)' : 'rgba(255,255,255,0.3)',
                }}
              >
                {isComplete ? '\u2713' : i + 1}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex gap-6 text-[10px] uppercase tracking-wider">
        {STEPS.map((step, i) => {
          const isActive = currentIndex === i;
          const isComplete = currentIndex > i;
          return (
            <span
              key={step.key}
              style={{
                color: isActive ? 'var(--color-brand)' : isComplete ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
              }}
            >
              {step.label}{isActive ? '...' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
