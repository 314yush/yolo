'use client';

import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  message: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, message, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="text-4xl opacity-40">{icon}</div>
      <p className="text-white/50 text-sm font-semibold uppercase">{message}</p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="brutal-button bg-[var(--color-brand)] text-black px-6 py-3 font-bold uppercase min-h-[44px] touch-manipulation"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
