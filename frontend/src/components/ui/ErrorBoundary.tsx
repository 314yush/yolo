'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-6 p-8 text-center min-h-[300px]">
          <h2 className="text-[var(--color-danger)] text-2xl font-bold uppercase">Something went wrong</h2>
          <p className="text-white/50 text-sm max-w-sm">
            An unexpected error occurred. Your wallet connection is preserved.
          </p>
          <button
            onClick={this.handleRetry}
            className="brutal-button bg-[var(--color-brand)] text-black px-8 py-4 font-bold uppercase min-h-[44px] touch-manipulation"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
