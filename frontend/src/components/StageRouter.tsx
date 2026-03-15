'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppStage } from '@/types';

interface StageRouterProps {
  stage: AppStage;
  children: React.ReactNode;
}

const variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const pnlVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/**
 * Wraps stage content with AnimatePresence for smooth transitions.
 * Respects prefers-reduced-motion by disabling animations.
 */
export function StageRouter({ stage, children }: StageRouterProps) {
  const isPnl = stage === 'pnl';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        variants={isPnl ? pnlVariants : variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
