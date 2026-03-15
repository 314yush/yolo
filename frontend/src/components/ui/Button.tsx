'use client';

import React from 'react';
import { vibrateShort } from '@/lib/haptics';

type ButtonVariant = 'primary' | 'danger' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'brutal-button bg-[var(--color-brand)] text-black',
  danger: 'brutal-button-danger',
  secondary: 'brutal-button-secondary',
  ghost: 'bg-transparent text-white border-2 border-white/20 hover:border-white/40 transition-colors',
};

export function Button({ variant = 'primary', children, onClick, className = '', ...props }: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    vibrateShort();
    onClick?.(e);
  };

  return (
    <button
      className={`min-h-[44px] touch-manipulation font-bold uppercase ${variantClasses[variant]} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}
