'use client';

import React from 'react';
import type { AppStage } from '@/types';

interface StageRouterProps {
  stage: AppStage;
  children: React.ReactNode;
}

/**
 * Wraps stage content for centralized stage switching.
 * Phase 3 will add AnimatePresence transitions.
 */
export function StageRouter({ children }: StageRouterProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      {children}
    </div>
  );
}
