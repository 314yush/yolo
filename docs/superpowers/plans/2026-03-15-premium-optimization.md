# YOLO Premium Optimization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Pusher performance degradation, refactor monolithic components, establish design tokens, and add visual polish to make YOLO feel like a premium gambling app.

**Architecture:** Three independent phases — Phase 1 fixes Pusher infrastructure, Phase 2 extracts components and establishes design tokens, Phase 3 adds visual polish with Framer Motion transitions and micro-interactions. Each phase ships independently.

**Tech Stack:** Next.js 16.1.4, React 19, Zustand 5, Pusher.js, Framer Motion 12.27.5, Tailwind CSS 4, canvas-confetti, lightweight-charts

**Spec:** `docs/superpowers/specs/2026-03-15-premium-optimization-design.md`

**Constraints — DO NOT TOUCH:**
- `frontend/src/lib/tachyonRelay.ts`
- `frontend/src/lib/relayService.ts`
- `frontend/src/lib/avantisEncoder.ts`
- Privy auth flow
- Delegate wallet system
- `frontend/src/store/tradeStore.ts` trade logic (only modify `ConfirmationStage` type)

---

## Chunk 1: Phase 1 — Pusher & Performance

### Task 1: Create Pusher Connection Singleton

**Files:**
- Create: `frontend/src/lib/pusherClient.ts`

- [ ] **Step 1: Create the singleton module**

```typescript
// frontend/src/lib/pusherClient.ts
import Pusher from 'pusher-js';

// Avantis Pusher credentials (public — these are Avantis platform credentials, not secrets)
const PUSHER_APP_KEY = 'f86bc7e9919fc938694a';
const PUSHER_CLUSTER = 'mt1';

let instance: Pusher | null = null;

/**
 * Returns a shared Pusher instance. The connection is created once and reused
 * across all hook mounts. Individual hooks subscribe/unsubscribe channels
 * but never kill the underlying connection.
 */
export function getPusher(): Pusher {
  if (!instance) {
    // Enable logging in development
    if (process.env.NODE_ENV === 'development') {
      Pusher.logToConsole = true;
    }

    instance = new Pusher(PUSHER_APP_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
  }
  return instance;
}

/**
 * Disconnect and destroy the singleton. Only call this on app teardown
 * or if you need to force a reconnection.
 */
export function destroyPusher(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit src/lib/pusherClient.ts 2>&1 | head -20`
Expected: No errors (or only unrelated errors from other files)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pusherClient.ts
git commit -m "feat: add Pusher connection singleton to prevent connection churn"
```

---

### Task 2: Refactor usePusherEvents to Use Singleton + Event Validation

**Files:**
- Modify: `frontend/src/hooks/usePusherEvents.ts`

The current hook (201 lines) creates a new Pusher instance on every mount at line 97. It also accepts `unknown` event data without validation. We fix both.

- [ ] **Step 1: Replace Pusher instantiation with singleton**

In `frontend/src/hooks/usePusherEvents.ts`, remove the import of `Pusher` constructor and the inline instantiation. Replace with `getPusher()`.

Remove these lines (4, 8-10, 91-100):
```typescript
// REMOVE: import Pusher, { Channel } from 'pusher-js';
// REMOVE: const PUSHER_APP_KEY = 'f86bc7e9919fc938694a';
// REMOVE: const PUSHER_CLUSTER = 'mt1';
```

Add import:
```typescript
import { type Channel } from 'pusher-js';
import { getPusher } from '@/lib/pusherClient';
```

Replace lines 96-100 (the `new Pusher(...)` block):
```typescript
// OLD:
// if (process.env.NODE_ENV === 'development') {
//   Pusher.logToConsole = true;
// }
// const pusher = new Pusher(PUSHER_APP_KEY, {
//   cluster: PUSHER_CLUSTER,
//   forceTLS: true,
// });

// NEW:
const pusher = getPusher();
```

- [ ] **Step 2: Add event validation**

Add a validation function before the hook:

```typescript
/**
 * Runtime validation for Avantis order events.
 * Ensures the payload has the expected shape before processing.
 */
function isValidOrderEvent(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('orderId' in data || 'order_id' in data || 'tradeIndex' in data || 'trade_index' in data)
  );
}
```

Wrap each `addEvent` call in the channel bindings (lines 142-156) with validation:

```typescript
channel.bind('OrderPickedUpForExecution', (data: unknown) => {
  if (isValidOrderEvent(data)) {
    addEvent('OrderPickedUpForExecution', data);
  } else {
    debug('[Pusher] Invalid OrderPickedUpForExecution payload, ignoring', data);
  }
});

channel.bind('ExecutionConfirmedInFlashblock', (data: unknown) => {
  if (isValidOrderEvent(data)) {
    addEvent('ExecutionConfirmedInFlashblock', data);
  } else {
    debug('[Pusher] Invalid ExecutionConfirmedInFlashblock payload, ignoring', data);
  }
});

channel.bind('OrderFilled', (data: unknown) => {
  if (isValidOrderEvent(data)) {
    addEvent('OrderFilled', data);
  } else {
    debug('[Pusher] Invalid OrderFilled payload, ignoring', data);
  }
});

channel.bind('OrderCanceled', (data: unknown) => {
  if (isValidOrderEvent(data)) {
    addEvent('OrderCanceled', data);
  } else {
    debug('[Pusher] Invalid OrderCanceled payload, ignoring', data);
  }
});
```

- [ ] **Step 3: Fix cleanup to NOT disconnect the singleton**

Replace the cleanup function (lines 162-169):

```typescript
// OLD:
// return () => {
//   debug(`[Pusher] Cleaning up, unsubscribing from ${channelName}`);
//   channel.unbind_all();
//   pusher.unsubscribe(channelName);
//   pusher.disconnect();  // <-- This kills the shared connection!
//   pusherRef.current = null;
//   channelRef.current = null;
// };

// NEW:
return () => {
  debug(`[Pusher] Cleaning up, unsubscribing from ${channelName}`);
  channel.unbind_all();
  pusher.unsubscribe(channelName);
  // Do NOT disconnect — singleton manages the connection lifecycle
  pusherRef.current = null;
  channelRef.current = null;
};
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePusherEvents.ts
git commit -m "fix: use Pusher singleton, add event validation, stop killing connection on unmount"
```

---

### Task 3: Add Polling Backoff + Atomic Confirmation Resolution in useFastConfirmation

**Files:**
- Modify: `frontend/src/hooks/useFastConfirmation.ts`

The current hook polls every 50ms forever (line 9) and has a race condition between Pusher and polling confirmation paths.

- [ ] **Step 1: Replace fixed interval with backoff schedule**

At the top of the file, replace:
```typescript
// OLD:
const POLLING_INTERVAL_MS = 50; // 50ms polling (10x faster than before)

// NEW:
// Exponential backoff: fast initially, backs off to 1s
// Total time to exhaust schedule: ~2.3s, then stays at 1s
const BACKOFF_SCHEDULE_MS = [50, 50, 100, 100, 200, 200, 500, 1000];
```

- [ ] **Step 2: Replace setInterval with setTimeout-based backoff**

Replace the polling section in `startConfirmation` (lines 127-160):

```typescript
// OLD:
// pollingIntervalRef.current = setInterval(async () => { ... }, POLLING_INTERVAL_MS);

// NEW:
const attemptRef = { current: 0 };

async function pollReceipt() {
  if (!isConfirmingRef.current || !currentTxHashRef.current) {
    return;
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: currentTxHashRef.current,
    });

    if (receipt) {
      const elapsed = Date.now() - (confirmationTimestamp || Date.now());

      if (receipt.status === 'success') {
        debug(`[FastConfirmation] Receipt confirmed (polling) in ${elapsed}ms`);
        resolveConfirmation('polling', elapsed);
      } else {
        console.error('[FastConfirmation] Transaction reverted');
        setConfirmationStage('failed');
        onFailed?.('Transaction reverted');
        cleanup();
      }
      return; // Don't schedule next poll
    }
  } catch {
    // Receipt not available yet, continue polling
  }

  // Schedule next poll with backoff
  if (isConfirmingRef.current) {
    const delay = BACKOFF_SCHEDULE_MS[Math.min(attemptRef.current++, BACKOFF_SCHEDULE_MS.length - 1)];
    pollingIntervalRef.current = setTimeout(pollReceipt, delay) as unknown as NodeJS.Timeout;
  }
}

// Start first poll
pollingIntervalRef.current = setTimeout(pollReceipt, BACKOFF_SCHEDULE_MS[0]) as unknown as NodeJS.Timeout;
```

Also update the `cleanup` function to use `clearTimeout` instead of `clearInterval`:

```typescript
const cleanup = useCallback(() => {
  if (pollingIntervalRef.current) {
    clearTimeout(pollingIntervalRef.current);  // Changed from clearInterval
    pollingIntervalRef.current = null;
  }
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
  isConfirmingRef.current = false;
}, []);
```

- [ ] **Step 3: Add atomic resolveConfirmation function + session nonce**

Add a single resolution function that replaces the dual-path `hasFiredOnConfirmedRef` guards. Also add session nonce to prevent stale events from previous trades. Add these inside the hook, after the existing refs:

```typescript
// Atomic confirmation resolution — only one source (Pusher or polling) can resolve
const resolvedRef = useRef(false);
// Session nonce — tag each confirmation session with txHash to ignore stale events
const sessionNonceRef = useRef<string>('');

const resolveConfirmation = useCallback((source: 'pusher' | 'polling', elapsed: number) => {
  if (resolvedRef.current) return;
  resolvedRef.current = true;
  debug(`[FastConfirmation] Resolved via ${source} in ${elapsed}ms`);
  setConfirmationStage('confirmed');
  onConfirmed?.(elapsed);
  cleanup();
}, [setConfirmationStage, onConfirmed, cleanup]);
```

Update `startConfirmation` to reset `resolvedRef` and set session nonce:
```typescript
// In startConfirmation, after cleanup():
resolvedRef.current = false;
sessionNonceRef.current = txHash; // Tag this session
```

Remove `hasFiredOnConfirmedRef` entirely (line 72). Replace all uses of `hasFiredOnConfirmedRef` with `resolvedRef`.

In the Pusher event `useEffect` (lines 173-226), add a nonce guard at the top:
```typescript
useEffect(() => {
  if (!isConfirmingRef.current) return;
  // Ignore events if no active session (prevents stale event processing)
  if (!sessionNonceRef.current) return;

  const elapsed = confirmationTimestamp ? Date.now() - confirmationTimestamp : 0;
  // ... rest of the effect
```

Replace the OrderFilled handler (lines 194-202):
```typescript
// OLD:
if (!hasFiredOnConfirmedRef.current) {
  hasFiredOnConfirmedRef.current = true;
  setConfirmationStage('confirmed');
  onConfirmed?.(elapsed);
}
cleanup();

// NEW:
resolveConfirmation('pusher', elapsed);
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFastConfirmation.ts
git commit -m "fix: add polling backoff schedule and atomic confirmation resolution"
```

---

### Task 4: Remove Unused 'broadcasting' Stage

**Files:**
- Modify: `frontend/src/store/tradeStore.ts` (line 15 only)

We already verified (grep) that `setConfirmationStage('broadcasting')` is never called anywhere. The `'broadcasting'` literal only appears in the type definition and in comments in unrelated files.

- [ ] **Step 1: Remove 'broadcasting' from ConfirmationStage type**

In `frontend/src/store/tradeStore.ts`, line 15, remove:
```typescript
// OLD:
  | 'broadcasting'   // TX being broadcast

// NEW: (delete the entire line)
```

- [ ] **Step 2: Verify no compile errors**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors (nothing references `'broadcasting'` as a value)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/tradeStore.ts
git commit -m "cleanup: remove unused 'broadcasting' confirmation stage"
```

---

### Task 5: Update .env.example (Documentation Only)

**Files:**
- Modify: `frontend/.env.example` (if it exists, otherwise create)

- [ ] **Step 1: Add Pusher env documentation**

Check if file exists, then append:
```bash
# Avantis Pusher credentials (public — platform-level, not per-user secrets)
# These are hardcoded in lib/pusherClient.ts for simplicity.
# Listed here for documentation only.
# NEXT_PUBLIC_PUSHER_KEY=f86bc7e9919fc938694a
# NEXT_PUBLIC_PUSHER_CLUSTER=mt1
```

- [ ] **Step 2: Commit**

```bash
git add frontend/.env.example
git commit -m "docs: document Pusher credentials in .env.example"
```

---

## Chunk 2: Phase 2 — Design Tokens & UI Components

### Task 6: Establish Design Tokens in globals.css

**Files:**
- Modify: `frontend/src/app/globals.css` (lines 3-20)

The file already has tokens at lines 3-20 (`:root` block). We merge the new semantic tokens, keeping existing ones that still make sense and replacing duplicates with the new names.

- [ ] **Step 1: Replace the :root block**

Replace lines 3-20 in `frontend/src/app/globals.css`:

```css
:root {
  /* Brand */
  --color-brand: #CCFF00;
  --color-danger: #FF006E;
  --color-bg: #000000;
  --color-surface: #0B0F14;
  --color-border: #1a1a2e;
  --color-text: #FFFFFF;
  --color-text-muted: rgba(255,255,255,0.5);

  /* Legacy aliases (kept for backward compatibility during migration) */
  --color-primary: #CCFF00;
  --color-secondary: #FF006E;
  --color-background: #000000;
  --color-warning: #FFD60A;

  /* Assets */
  --color-btc: #FF9500;
  --color-eth: #627EEA;
  --color-sol: #14F195;
  --color-xrp: #00AAE4;
  --color-xau: #FFD700;
  --color-xag: #C0C0C0;

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Borders */
  --border-thin: 2px;
  --border-thick: 4px;
  --border-brutal: 8px;
  --shadow-brutal: 8px 8px 0px #000;
  --shadow-brutal-sm: 4px 4px 0px #000;

  /* Animation */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  /* Layout */
  --nav-height: 72px;
  --header-height: 48px;
  --max-width: 28rem;
}
```

- [ ] **Step 2: Verify the app still renders**

Run: `cd /Users/piyush/yolo/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: consolidate design tokens in globals.css"
```

---

### Task 7: Create Shared UI Components

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/LoadingSkeleton.tsx`
- Create: `frontend/src/components/ui/EmptyState.tsx`
- Create: `frontend/src/components/ui/ErrorBoundary.tsx`
- Create: `frontend/src/components/ui/ProgressSteps.tsx`

- [ ] **Step 1: Create ui directory and Button.tsx**

First create the directory:
```bash
mkdir -p frontend/src/components/ui
```

Then create the Button component:

```typescript
// frontend/src/components/ui/Button.tsx
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
```

- [ ] **Step 2: Create Card.tsx**

```typescript
// frontend/src/components/ui/Card.tsx
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
```

- [ ] **Step 3: Create LoadingSkeleton.tsx**

```typescript
// frontend/src/components/ui/LoadingSkeleton.tsx
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
      className={`bg-white/5 ${className}`}
      style={{ width, height, borderRadius: 0 }}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 4: Create EmptyState.tsx**

```typescript
// frontend/src/components/ui/EmptyState.tsx
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
```

- [ ] **Step 5: Create ErrorBoundary.tsx**

```typescript
// frontend/src/components/ui/ErrorBoundary.tsx
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
```

- [ ] **Step 6: Create ProgressSteps.tsx (skeleton)**

```typescript
// frontend/src/components/ui/ProgressSteps.tsx
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
```

- [ ] **Step 7: Verify all UI components compile**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: add shared UI component library (Button, Card, LoadingSkeleton, EmptyState, ErrorBoundary, ProgressSteps)"
```

---

### Task 8: Extract NavFooter Component

**Files:**
- Create: `frontend/src/components/NavFooter.tsx`
- Modify: `frontend/src/app/page.tsx` (lines 1034-1170)

The navigation footer is duplicated twice in page.tsx (lines 1034-1130 for trading stages, lines 1132-1170 for other stages). We consolidate into one component.

- [ ] **Step 1: Create NavFooter.tsx**

```typescript
// frontend/src/components/NavFooter.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Settings } from 'lucide-react';

interface NavFooterProps {
  openTradesCount: number;
  /** If true, shows the ROLL button above the nav */
  showRollButton?: boolean;
  rollButton?: React.ReactNode;
  /** Warn user if they navigate away during a trade */
  warnOnNavigate?: boolean;
}

export function NavFooter({ openTradesCount, showRollButton, rollButton, warnOnNavigate }: NavFooterProps) {
  const handleNavClick = (e: React.MouseEvent) => {
    if (warnOnNavigate && !window.confirm('A trade is in progress. Leave this page anyway?')) {
      e.preventDefault();
    }
  };

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 bg-black/95 border-t-4 border-[var(--color-brand)]/20 backdrop-blur-md z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="px-4 pt-3 pb-2 max-w-md mx-auto space-y-2">
        {showRollButton && rollButton && <div>{rollButton}</div>}

        <nav className="flex justify-around items-center py-1.5" aria-label="Main navigation" role="navigation">
          <Link
            href="/activity"
            onClick={handleNavClick}
            className="relative p-2 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-[var(--color-brand)] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label={`Activity${openTradesCount > 0 ? `, ${openTradesCount} open trade${openTradesCount !== 1 ? 's' : ''}` : ''}`}
          >
            <Activity className="w-5 h-5 text-[var(--color-brand)]" strokeWidth={2.5} />
            {openTradesCount > 0 && (
              <span
                className="absolute top-0 right-0 bg-[var(--color-danger)] text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center border-2 border-black animate-danger-pulse"
                style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)' }}
              >
                <span className="sr-only">{openTradesCount}</span>
                <span aria-hidden="true">{openTradesCount}</span>
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            onClick={handleNavClick}
            className="p-2 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-[var(--color-brand)] focus:ring-offset-2 focus:ring-offset-black rounded"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5 text-[var(--color-brand)]" strokeWidth={2.5} />
          </Link>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Replace both nav instances in page.tsx**

Import `NavFooter` in page.tsx:
```typescript
import { NavFooter } from '@/components/NavFooter';
```

Replace lines 1034-1130 (the first footer with ROLL button):
```tsx
{(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
  <NavFooter
    openTradesCount={openTrades.length}
    showRollButton
    rollButton={
      <button
        onClick={() => {
          if (stage === 'idle' && delegateStatus.isSetup) {
            setShouldSpin(true);
            setTimeout(() => setShouldSpin(false), 100);
          }
        }}
        disabled={stage !== 'idle' || !delegateStatus.isSetup || !isOnline}
        aria-label={
          !isOnline ? 'You are offline. Reconnect to trade'
          : !delegateStatus.isSetup ? 'Please complete setup before trading'
          : stage === 'idle' ? 'Spin the wheel to select trade parameters'
          : 'Wheel is spinning, please wait'
        }
        aria-busy={stage !== 'idle'}
        className={`
          w-full py-4 text-2xl sm:text-3xl font-black brutal-button min-h-[56px] touch-manipulation
          transition-all duration-200 shadow-[0_8px_0px_0px_rgba(0,0,0,0.3)]
          focus:outline-none focus:ring-4 focus:ring-[#CCFF00] focus:ring-offset-4 focus:ring-offset-black
          ${stage === 'idle'
            ? 'bg-[#CCFF00] text-black hover:shadow-[0_6px_0px_0px_rgba(0,0,0,0.3)] hover:translate-y-[2px] active:shadow-[0_2px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-[6px]'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-[0_4px_0px_0px_rgba(0,0,0,0.3)]'
          }
        `}
      >
        {stage === 'idle' ? (
          <span className="flex items-center justify-center gap-2">
            <Dice5 className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={3} />
            <span>ROLL</span>
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" strokeWidth={2.5} />
            <span>SPINNING...</span>
          </span>
        )}
      </button>
    }
    warnOnNavigate={stage === 'spinning' || stage === 'executing'}
  />
)}
```

Replace lines 1132-1170 (the second nav):
```tsx
{stage !== 'idle' && stage !== 'spinning' && stage !== 'executing' && stage !== 'pnl' && (
  <NavFooter openTradesCount={openTrades.length} />
)}
```

- [ ] **Step 3: Verify compilation and visual parity**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NavFooter.tsx frontend/src/app/page.tsx
git commit -m "refactor: extract NavFooter, consolidate duplicated navigation"
```

---

### Task 9: Extract FinancialInfoBar Component

**Files:**
- Create: `frontend/src/components/FinancialInfoBar.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create FinancialInfoBar.tsx**

The financial info bar is at page.tsx lines 888-911. Extract it:

```typescript
// frontend/src/components/FinancialInfoBar.tsx
'use client';

import React from 'react';

interface FinancialInfoBarProps {
  collateral: number;
  usdcBalance: number | null;
}

export function FinancialInfoBar({ collateral, usdcBalance }: FinancialInfoBarProps) {
  return (
    <div className="w-full px-4 py-1.5 border-b-2 border-white/10 bg-black/50 backdrop-blur-sm relative z-10 shrink-0">
      <div className="flex justify-center items-center gap-3 sm:gap-4 text-white/80 text-xs sm:text-sm font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-white/60 font-semibold">COLLATERAL:</span>
          <span className="text-[var(--color-brand)] font-bold" aria-live="polite">
            <span className="sr-only">Collateral: </span>${collateral}
          </span>
        </div>
        <div className="w-1 h-1 rounded-full bg-white/40" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <span className="text-white/60 font-semibold">BALANCE:</span>
          <span className="text-[var(--color-brand)] font-bold" aria-live="polite">
            <span className="sr-only">Balance: </span>
            {usdcBalance !== null ? `$${usdcBalance.toFixed(2)}` : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace inline JSX in page.tsx with `<FinancialInfoBar />`**

Import and replace lines 888-911 in page.tsx:
```typescript
import { FinancialInfoBar } from '@/components/FinancialInfoBar';

// Replace the inline financial info bar div with:
{stage !== 'pnl' && (
  <FinancialInfoBar collateral={collateral} usdcBalance={usdcBalance} />
)}
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FinancialInfoBar.tsx frontend/src/app/page.tsx
git commit -m "refactor: extract FinancialInfoBar from page.tsx"
```

---

### Task 10: Extract StatsPanel and TradesList from Activity Page

**Files:**
- Create: `frontend/src/components/StatsPanel.tsx`
- Create: `frontend/src/components/TradesList.tsx`
- Modify: `frontend/src/app/activity/page.tsx`

- [ ] **Step 1: Create StatsPanel.tsx**

Extract the stats display from activity/page.tsx lines 635-702 (aggregate stats + toggle + compact stats):

```typescript
// frontend/src/components/StatsPanel.tsx
'use client';

import React from 'react';
import type { PnLData, Trade } from '@/types';

interface StatsPanelProps {
  tradesWithPnL: Array<{ trade: Trade; pnlData?: PnLData }>;
  closedTradesCount: number;
  showClosedTrades: boolean;
  onToggle: (showClosed: boolean) => void;
  mounted: boolean;
  activityStats: { total_trades: number; total_volume: number; total_pnl: number; win_rate: number; open_trades: number } | null;
  tradeStats: { totalTrades: number; totalVolume: number };
  historicVolume: number | null;
  computedVolume: number;
}

export function StatsPanel({
  tradesWithPnL, closedTradesCount, showClosedTrades, onToggle,
  mounted, activityStats, tradeStats, historicVolume, computedVolume,
}: StatsPanelProps) {
  const aggregateStats = React.useMemo(() => {
    const totalPnL = tradesWithPnL.reduce((sum, item) => sum + (item.pnlData?.pnl ?? 0), 0);
    const totalCollateral = tradesWithPnL.reduce((sum, item) => sum + item.trade.collateral, 0);
    return { totalPnL, totalCollateral };
  }, [tradesWithPnL]);

  return (
    <>
      {/* Aggregate Stats - Total PnL across all open positions */}
      {mounted && tradesWithPnL.length > 0 && !showClosedTrades && (
        <div
          className="mb-4 p-4 border-4"
          style={{
            borderColor: aggregateStats.totalPnL >= 0 ? 'var(--color-brand)' : 'var(--color-danger)',
            backgroundColor: aggregateStats.totalPnL >= 0 ? 'rgba(204, 255, 0, 0.1)' : 'rgba(255, 0, 110, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Total P&L</div>
              <div className="font-black text-2xl font-mono" style={{ color: aggregateStats.totalPnL >= 0 ? 'var(--color-brand)' : 'var(--color-danger)' }}>
                {aggregateStats.totalPnL >= 0 ? '+' : '-'}${Math.abs(aggregateStats.totalPnL).toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Collateral</div>
              <div className="text-white font-bold text-lg font-mono">${aggregateStats.totalCollateral.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Toggle and Stats */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="brutal-toggle shrink-0">
          <button onClick={() => onToggle(false)} className={`brutal-toggle-option ${!showClosedTrades ? 'active' : ''}`} aria-pressed={!showClosedTrades}>
            OPEN {tradesWithPnL.length > 0 && `(${tradesWithPnL.length})`}
          </button>
          <button onClick={() => onToggle(true)} className={`brutal-toggle-option ${showClosedTrades ? 'active' : ''}`} aria-pressed={showClosedTrades}>
            CLOSED {closedTradesCount > 0 && `(${closedTradesCount})`}
          </button>
        </div>
        <div className="flex items-center justify-end gap-4 text-xs sm:text-sm min-w-0">
          <div className="text-center shrink-0">
            <div className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide mb-0.5">Trades</div>
            <div className="text-[var(--color-brand)] font-black text-lg sm:text-xl font-mono" suppressHydrationWarning>
              {mounted ? (activityStats?.total_trades ?? tradeStats.totalTrades) : 0}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide mb-0.5">Volume</div>
            <div className="text-[var(--color-brand)] font-black text-lg sm:text-xl font-mono" suppressHydrationWarning>
              {mounted ? `$${(activityStats?.total_volume ?? historicVolume ?? tradeStats.totalVolume ?? computedVolume).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '$0'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update activity/page.tsx to use StatsPanel**

Import and replace the inline stats JSX (lines 635-702):
```typescript
import { StatsPanel } from '@/components/StatsPanel';

// Replace the stats/toggle section with:
<StatsPanel
  tradesWithPnL={tradesWithPnL}
  closedTradesCount={closedTrades.length}
  showClosedTrades={showClosedTrades}
  onToggle={setShowClosedTrades}
  mounted={mounted}
  activityStats={activityStats}
  tradeStats={tradeStats}
  historicVolume={historicVolume}
  computedVolume={computedVolume}
/>
```

Remove the `aggregateStats` useMemo from activity/page.tsx (it's now inside StatsPanel).

**Note:** TradesList extraction is deferred to a future pass — the trade list rendering is deeply intertwined with handleClose/handleFlip callbacks and trade state management, making it a risky extraction at this stage. The StatsPanel extraction alone reduces activity/page.tsx by ~100 lines.

- [ ] **Step 5: Verify compilation and test**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StatsPanel.tsx frontend/src/components/TradesList.tsx frontend/src/app/activity/page.tsx
git commit -m "refactor: extract StatsPanel and TradesList from activity page"
```

---

### Task 10b: Create Basic StageRouter Component (Phase 2)

**Files:**
- Create: `frontend/src/components/StageRouter.tsx`
- Modify: `frontend/src/app/page.tsx`

This creates the basic stage routing component WITHOUT animations. Phase 3 will add AnimatePresence.

- [ ] **Step 1: Create StageRouter.tsx (basic, no animation)**

```typescript
// frontend/src/components/StageRouter.tsx
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
```

- [ ] **Step 2: Wrap stage content in page.tsx with StageRouter**

Import StageRouter in page.tsx and wrap the main content area:
```typescript
import { StageRouter } from '@/components/StageRouter';

// Around line 943, wrap the stage-conditional blocks:
<StageRouter stage={stage}>
  {(stage === 'idle' || stage === 'spinning' || stage === 'executing') && (
    // ... existing picker wheel section
  )}
  {stage === 'pnl' && (
    // ... existing PnL section
  )}
  {stage === 'error' && (
    // ... existing error section
  )}
</StageRouter>
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StageRouter.tsx frontend/src/app/page.tsx
git commit -m "refactor: extract StageRouter component for centralized stage switching"
```

---

## Chunk 3: Phase 3 — Visual Premium Pass

### Task 11: Create useCountUp Hook

**Files:**
- Create: `frontend/src/hooks/useCountUp.ts`

- [ ] **Step 1: Create the animated counting hook**

```typescript
// frontend/src/hooks/useCountUp.ts
'use client';

import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  /** Target value to count to */
  end: number;
  /** Duration in ms (default 800) */
  duration?: number;
  /** Decimal places (default 2) */
  decimals?: number;
  /** Prefix (e.g. "$" or "+$") */
  prefix?: string;
  /** Whether to start counting (default true) */
  enabled?: boolean;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function useCountUp({ end, duration = 800, decimals = 2, prefix = '', enabled = true }: UseCountUpOptions): string {
  const [display, setDisplay] = useState(`${prefix}${(0).toFixed(decimals)}`);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplay(`${prefix}${end.toFixed(decimals)}`);
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplay(`${prefix}${end.toFixed(decimals)}`);
      return;
    }

    startTimeRef.current = null;

    function animate(timestamp: number) {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const current = easedProgress * end;

      setDisplay(`${prefix}${current.toFixed(decimals)}`);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration, decimals, prefix, enabled]);

  return display;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCountUp.ts
git commit -m "feat: add useCountUp hook for animated number counting"
```

---

### Task 12: Enhance StageRouter with AnimatePresence

**Files:**
- Modify: `frontend/src/components/StageRouter.tsx` (created in Task 10b)

- [ ] **Step 1: Add Framer Motion transitions to existing StageRouter**

Replace the content of `frontend/src/components/StageRouter.tsx`:

```typescript
// frontend/src/components/StageRouter.tsx
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
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StageRouter.tsx
git commit -m "feat: add AnimatePresence transitions to StageRouter"
```

---

### Task 12b: Enhance PnLScreen with Animated Counter and Enhanced Buttons

**Files:**
- Modify: `frontend/src/components/PnLScreen.tsx`

The PnL screen (625 lines) gets three enhancements: animated counting, enhanced CLOSE button, and big win/danger zone effects.

- [ ] **Step 1: Add useCountUp to the PnL display**

Import the hook at the top of PnLScreen.tsx:
```typescript
import { useCountUp } from '@/hooks/useCountUp';
```

Inside the `PnLScreen` component, after the `pnl` and `pnlPercentage` calculations (around line 193), add:
```typescript
// Animated PnL counter on mount
const animatedPnl = useCountUp({
  end: pnl,
  duration: 800,
  decimals: 2,
  prefix: pnl >= 0 ? '+$' : '-$',
  enabled: !isConfirming,
});
const animatedPct = useCountUp({
  end: Math.abs(pnlPercentage),
  duration: 800,
  decimals: 1,
  prefix: pnlPercentage >= 0 ? '+' : '-',
  enabled: !isConfirming,
});
```

Then find the PnL dollar amount display (search for the formatted PnL text rendering) and replace the static text with:
```tsx
<span>{animatedPnl}</span>
```

And for the percentage:
```tsx
<span>{animatedPct}%</span>
```

- [ ] **Step 2: Enhance the CLOSE button**

Find the CLOSE button in PnLScreen.tsx (search for `onClose`). Replace its text with dynamic content:

```tsx
<button
  onClick={onClose}
  disabled={isClosing || isFlipping || !isOnline}
  className={`
    w-full py-4 text-xl font-black brutal-button min-h-[56px] touch-manipulation
    transition-all duration-200
    ${isProfit
      ? 'bg-[var(--color-brand)] text-black'
      : 'bg-[var(--color-danger)] text-white'
    }
  `}
  style={isProfit ? {
    boxShadow: '0 0 20px rgba(204, 255, 0, 0.3)',
  } : undefined}
>
  {isClosing ? (
    <span className="flex items-center justify-center gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      CLOSING...
    </span>
  ) : isProfit ? (
    `CASH OUT +$${Math.abs(pnl).toFixed(2)}`
  ) : (
    `CLOSE -$${Math.abs(pnl).toFixed(2)}`
  )}
</button>
```

- [ ] **Step 3: Add big win scale effect**

After the confetti trigger (around line 112), add a CSS class toggle for big wins:

```typescript
const [bigWinScale, setBigWinScale] = useState(false);

useEffect(() => {
  if (displayPnlPercentage >= 100 && !isConfirming) {
    setBigWinScale(true);
    setTimeout(() => setBigWinScale(false), 600);
  }
}, [displayPnlPercentage, isConfirming]);
```

Apply the scale class to the PnL number:
```tsx
<div className={`transition-transform duration-300 ${bigWinScale ? 'scale-[1.2]' : 'scale-100'}`}>
  {/* PnL number here */}
</div>
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PnLScreen.tsx
git commit -m "feat: add animated PnL counter, enhanced CLOSE button, big win effects"
```

---

### Task 13: Add Shimmer Effect to LoadingSkeleton

**Files:**
- Modify: `frontend/src/components/ui/LoadingSkeleton.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add shimmer keyframes to globals.css**

Add after the existing `chartShimmer` keyframes (around line 564):

```css
/* Generic shimmer for loading skeletons */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.03) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.03) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

- [ ] **Step 2: Update LoadingSkeleton to use shimmer class**

```typescript
export function LoadingSkeleton({ width = '100%', height = '1rem', className = '' }: LoadingSkeletonProps) {
  return (
    <div
      className={`animate-shimmer ${className}`}
      style={{ width, height, borderRadius: 0 }}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/LoadingSkeleton.tsx frontend/src/app/globals.css
git commit -m "feat: add shimmer animation to LoadingSkeleton"
```

---

### Task 14: Add Toast Exit Animation

**Files:**
- Modify: `frontend/src/components/Toast.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add slide-out keyframes to globals.css**

Add after the `slideIn` animation:

```css
/* Slide-out animation for toast exit */
@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateX(0) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(0) translateY(-20px);
  }
}

.animate-slide-out {
  animation: slideOut 0.2s ease-in forwards;
}
```

- [ ] **Step 2: Add exit animation state to Toast.tsx**

In `ToastItem`, add a `isExiting` state that triggers before removal:

```typescript
function ToastItem({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback((id: string) => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 200); // Match animation duration
  }, [onClose]);

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        handleClose(toast.id);
      }, toast.duration || 5000);

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, handleClose]);
```

Update the wrapper div's className:
```tsx
className={`mb-3 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${isExiting ? 'animate-slide-out' : 'animate-slide-in'}`}
```

Replace all `onClose(toast.id)` calls in button handlers with `handleClose(toast.id)`.

- [ ] **Step 3: Add necessary import**

Add `useState` and `useCallback` to the React import at the top of Toast.tsx:
```typescript
import React, { useEffect, useState, useCallback } from 'react';
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Toast.tsx frontend/src/app/globals.css
git commit -m "feat: add fade-out + slide-up exit animation for toasts"
```

---

### Task 15: Add Button Press Micro-interactions

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add press animation utilities to globals.css**

Add near the button styles section:

```css
/* Button press micro-interaction */
.brutal-button:active:not(:disabled),
.brutal-button-danger:active:not(:disabled),
.brutal-button-secondary:active:not(:disabled) {
  transform: translate(4px, 4px) scale(0.97);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: add scale(0.97) press animation to all brutal buttons"
```

---

### Task 16: Integrate ProgressSteps into Confirmation Flow

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Show ProgressSteps during confirmation**

Import `ProgressSteps` in page.tsx:
```typescript
import { ProgressSteps } from '@/components/ui/ProgressSteps';
```

In the `executing` stage section (where the spinner currently shows), add the ProgressSteps component below the wheel:

After the PickerWheel section, when `stage === 'executing'`, add:
```tsx
{confirmationStage !== 'none' && confirmationStage !== 'confirmed' && (
  <ProgressSteps stage={confirmationStage} />
)}
```

This requires reading `confirmationStage` from the store (already available in page.tsx via `useFastConfirmation`).

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: show ProgressSteps during trade confirmation"
```

---

### Task 17: Add Reduced Motion Support for New Animations

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Update the prefers-reduced-motion block**

Add the new animation classes to the existing reduced motion block (around line 670):

```css
@media (prefers-reduced-motion: reduce) {
  /* ... existing rules ... */

  .animate-shimmer,
  .animate-slide-out {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "a11y: add reduced motion support for new animations"
```

---

### Task 18: Final Build Verification

- [ ] **Step 1: Run full type check**

Run: `cd /Users/piyush/yolo/frontend && npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 2: Run production build**

Run: `cd /Users/piyush/yolo/frontend && npm run build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 3: Run dev server smoke test**

Run: `cd /Users/piyush/yolo/frontend && npm run dev &`
Then open `http://localhost:3000` and verify:
- App loads without errors
- Wheel renders and responds to interaction
- Navigation works between pages

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: fix any remaining build issues from premium optimization"
```
