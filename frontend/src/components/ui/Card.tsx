'use client';

import React from 'react';

type CardVariant = 'neutral' | 'winning' | 'losing';

interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<CardVariant, string> = {
  neutral: 'brutal-card',
  winning: 'brutal-card-winning',
  losing: 'brutal-card-losing',
};

export function Card({ variant = 'neutral', children, className = '' }: CardProps) {
  return (
    <div className={`${variantClasses[variant]} p-4 ${className}`}>
      {children}
    </div>
  );
}
