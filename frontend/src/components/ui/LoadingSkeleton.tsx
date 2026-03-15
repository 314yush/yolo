'use client';

import React from 'react';

interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export function LoadingSkeleton({ width = '100%', height = '1rem', className = '' }: LoadingSkeletonProps) {
  return (
    <div
      className={`animate-shimmer ${className}`}
      style={{ width, height, borderRadius: 0 }}
      aria-hidden="true"
    />
  );
}
