# YOLO Premium Optimization — Design Spec

## Overview

Optimize the YOLO trading app for premium quality: fix Pusher performance degradation, refactor monolithic components, establish design tokens, and add visual polish. All changes preserve Tachyon relay, trade building, and Privy auth.

## Constraints

- **DO NOT TOUCH**: `tachyonRelay.ts`, `relayService.ts`, `avantisEncoder.ts`, Privy auth flow, delegate wallet system, `tradeStore.ts` trade logic
- **SAFE TO MODIFY**: Pusher event hooks, UI components, styling, page composition, loading/error states
- **No new dependencies**: Framer Motion (v12.27.5), canvas-confetti, Howler already installed

## Approach: Layered Polish (3 Phases)

Each phase ships independently. Phase 1 fixes infrastructure, Phase 2 restructures code, Phase 3 adds visual polish.

---

## Phase 1 — Pusher & Performance

**Goal**: Make confirmations fast again. Fix connection churn, race conditions, and aggressive polling.

### 1.1 Pusher Connection Singleton

**Problem**: `usePusherEvents.ts` creates a new Pusher instance on every mount/remount. React re-renders cause connection churn, which is likely the #1 cause of slowdown.

**Solution**: Create `lib/pusherClient.ts` — a singleton that returns a shared Pusher instance. The hook subscribes/unsubscribes channels but never kills the connection.

```typescript
// lib/pusherClient.ts
let instance: Pusher | null = null;

export function getPusher(): Pusher {
  if (!instance) {
    instance = new Pusher(
      process.env.NEXT_PUBLIC_PUSHER_KEY!,
      { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!, forceTLS: true }
    );
  }
  return instance;
}
```

**Files**:
- NEW `frontend/src/lib/pusherClient.ts`
- MOD `frontend/src/hooks/usePusherEvents.ts` — use `getPusher()` instead of `new Pusher()`

### 1.2 Smart Polling Backoff

**Problem**: `useFastConfirmation.ts` polls every 50ms forever until confirmed. Burns CPU and hammers the RPC node.

**Solution**: Exponential backoff — fast initially (50ms), backs off to 1s.

```typescript
const BACKOFF = [50, 50, 100, 100, 200, 200, 500, 1000];
let attempt = 0;

function scheduleNext() {
  const delay = BACKOFF[Math.min(attempt++, BACKOFF.length - 1)];
  setTimeout(pollReceipt, delay);
}
```

**Files**:
- MOD `frontend/src/hooks/useFastConfirmation.ts` — replace `setInterval(50)` with backoff schedule

### 1.3 Race Condition Fix

**Problem**: Both Pusher event AND polling can trigger `confirmed` simultaneously. Current guard (`hasFiredOnConfirmedRef`) has a window where both can slip through.

**Solution**: Single `resolveConfirmation()` function with atomic guard.

```typescript
function resolveConfirmation(source: 'pusher' | 'polling') {
  if (resolvedRef.current) return;
  resolvedRef.current = true;
  cleanup();
  setConfirmationStage('confirmed');
  onConfirmed?.(elapsed);
}
```

**Files**:
- MOD `frontend/src/hooks/useFastConfirmation.ts` — replace dual-path with single resolution

### 1.4 Event Validation & Stale Filtering

**Problem**: No validation of Pusher event payload shape. Events from previous trades can leak through on reconnection.

**Solution**:
1. Runtime validation of event shape before processing
2. Tag each confirmation session with the txHash as a nonce
3. Clear stale events when starting a new confirmation

```typescript
function isValidOrderEvent(data: unknown): data is OrderEvent {
  return typeof data === 'object' && data !== null
    && 'orderId' in data;
}

// Session tagging
const sessionNonce = useRef<string>('');
function startConfirmation(txHash: string) {
  sessionNonce.current = txHash;
  clearEvents();
}
```

Validation is added in `usePusherEvents.ts` before emitting events to consumers. Session nonce is managed in `useFastConfirmation.ts` which passes it down.

**Files**:
- MOD `frontend/src/hooks/usePusherEvents.ts` — validate event shape before adding to state
- MOD `frontend/src/hooks/useFastConfirmation.ts` — manage session nonce, ignore stale events

### 1.5 Cleanup

- Verify `'broadcasting'` confirmation stage is unused by grepping the codebase for `setConfirmationStage('broadcasting')`. If confirmed unused, remove from the `ConfirmationStage` type in `tradeStore.ts`. If used anywhere, keep it.
- Note: Pusher key/cluster are Avantis PUBLIC credentials (not secrets). Keep them hardcoded in the singleton `pusherClient.ts` rather than adding env var complexity. Only add to `.env.example` as documentation.

**Files**:
- MOD `frontend/src/store/tradeStore.ts` — remove `'broadcasting'` from type (after verification)
- MOD `frontend/.env.example` — document Pusher credentials (informational only)

### Phase 1 File Summary

| Action | File | Change |
|--------|------|--------|
| NEW | `lib/pusherClient.ts` | Singleton Pusher instance |
| MOD | `hooks/usePusherEvents.ts` | Use singleton, validate events, session nonce |
| MOD | `hooks/useFastConfirmation.ts` | Backoff polling, atomic resolution |
| MOD | `store/tradeStore.ts` | Remove unused 'broadcasting' stage |
| MOD | `.env.example` | Add Pusher env vars |

---

## Phase 2 — Component Architecture

**Goal**: Break monolithic pages into focused components. Establish design tokens. Create shared UI library.

### 2.1 page.tsx Decomposition (1173 → ~500 lines)

Extract from `app/page.tsx`:

| Component | Lines Extracted | Responsibility |
|-----------|----------------|---------------|
| `components/FinancialInfoBar.tsx` | ~80 | Balance display, collateral info, pair prices |
| `components/StageRouter.tsx` | ~60 | Renders correct stage component (idle/spinning/pnl/error) |
| `components/NavFooter.tsx` | ~80 | Bottom navigation (currently duplicated 2x — consolidate to 1) |
| `hooks/useTradeExecution.ts` | ~200 | Open/close/flip trade logic (currently duplicated 3x — consolidate to 1) |
| Inline handler logic | ~250 | Setup/deposit flow conditionals, toast helpers, polling setup |

**page.tsx after**: ~500 lines — still the main orchestrator, but with clear delegation to sub-components. Further extraction possible in future passes.

Note: `lib/pusherClient.ts` (Phase 1) is imported by hooks in the `hooks/` directory — this cross-directory dependency is intentional (lib = shared utilities, hooks = React-specific).

### 2.2 activity/page.tsx Decomposition (815 → ~200 lines)

Extract from `app/activity/page.tsx`:

| Component | Lines | Responsibility |
|-----------|-------|---------------|
| `components/StatsPanel.tsx` | ~100 | Trade stats display (total trades, volume, PnL, win rate) |
| `components/TradesList.tsx` | ~120 | Open + closed trades tabs with pagination |
| `components/ui/EmptyState.tsx` | ~40 | Reusable empty state (icon + message + CTA) |
| `components/ui/SkeletonCard.tsx` | ~30 | Reusable loading placeholder |

### 2.3 Design Tokens

Merge with existing tokens in `globals.css` (some spacing vars already exist on lines 3-20). Replace duplicates with the new semantic names below. New tokens are additive — existing tokens that aren't listed here should be kept.

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

  /* Assets */
  --color-btc: #FF9500;
  --color-eth: #627EEA;
  --color-sol: #14F195;
  --color-xrp: #00AAE4;
  --color-xau: #FFD700;
  --color-xag: #C0C0C0;

  /* Spacing */
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

Then replace all inline hex values across components with `var(--color-*)`.

### 2.4 Shared UI Component Library

Create `frontend/src/components/ui/` directory (does not exist yet — must be created).

| Component | Purpose | Phase 2 Scope |
|-----------|---------|--------------|
| `Button.tsx` | Variants: primary (lime), danger (pink), secondary (dark), ghost. Consistent sizing (min-h 44px), touch-manipulation | Full implementation |
| `Card.tsx` | Brutal card with win/lose/neutral border variants | Full implementation |
| `LoadingSkeleton.tsx` | Shimmer placeholder matching content dimensions | Skeleton component, shimmer CSS added in Phase 3 |
| `EmptyState.tsx` | Icon + message + optional CTA button | Full implementation |
| `ErrorBoundary.tsx` | Catches runtime errors, shows retry UI, preserves wallet state | Skeleton — error UI polished in Phase 3 |
| `ProgressSteps.tsx` | Maps Pusher confirmation stages to visual step indicator | Skeleton — visual polish and animation in Phase 3 |

### Phase 2 File Summary

| Action | File | Change |
|--------|------|--------|
| NEW | `components/ui/Button.tsx` | Shared button variants |
| NEW | `components/ui/Card.tsx` | Brutal card component |
| NEW | `components/ui/LoadingSkeleton.tsx` | Shimmer skeleton |
| NEW | `components/ui/EmptyState.tsx` | Empty state pattern |
| NEW | `components/ui/ErrorBoundary.tsx` | Error catch + retry |
| NEW | `components/ui/ProgressSteps.tsx` | Confirmation step indicator |
| NEW | `components/FinancialInfoBar.tsx` | Extracted from page.tsx |
| NEW | `components/NavFooter.tsx` | Extracted, deduplicated |
| NEW | `components/StageRouter.tsx` | Stage switching logic |
| NEW | `components/StatsPanel.tsx` | Extracted from activity |
| NEW | `components/TradesList.tsx` | Extracted from activity |
| NEW | `hooks/useTradeExecution.ts` | Extracted, deduplicated trade logic |
| MOD | `app/page.tsx` | 1173 → ~300 lines |
| MOD | `app/activity/page.tsx` | 815 → ~200 lines |
| MOD | `app/globals.css` | Design tokens consolidated |

---

## Phase 3 — Visual Premium Pass

**Goal**: Make every interaction feel premium. Smooth transitions, animated numbers, loading states, micro-interactions.

### 3.1 Confirmation UX — ProgressSteps

Replace the invisible confirmation wait with a live progress indicator showing Pusher stages.

The `ProgressSteps` component (created in Phase 2) renders 3 steps:
- **Step 1 "Sent"** — active when `confirmationStage === 'submitted'`
- **Step 2 "Picked up"** — active when `confirmationStage === 'picked_up'`
- **Step 3 "Confirming"** — active when `confirmationStage === 'preconfirmed'`
- **All complete** — when `confirmationStage === 'confirmed'`, transition to PnL screen

Renders as circles connected by lines, with active step pulsing.

### 3.2 Stage Transitions — Framer Motion AnimatePresence

Wrap stage components in `StageRouter.tsx` with `AnimatePresence mode="wait"`:

- **idle → spinning**: fade + slide-up (300ms)
- **spinning → confirming**: crossfade (300ms)
- **confirming → pnl**: scale-up from 0.95 + fade (300ms)
- **pnl → idle**: fade + slide-down (300ms)

Uses Framer Motion (already installed v12.27.5).

### 3.3 PnL Screen Enhancements

**Animated PnL counter**: New `hooks/useCountUp.ts` hook that animates a number from 0 to target value with easing. Used for the PnL dollar amount and percentage on mount. Rolls up like a slot machine counter.

**Enhanced CLOSE button**:
- In profit: lime glow pulse, text shows "CASH OUT +$X.XX"
- In loss: solid pink, text shows "CLOSE -$X.XX"
- Press state: `transform: scale(0.95)` + haptic feedback

**Big win (>100% PnL)**:
- PnL number briefly scales to 1.2x
- Gold border glow on the card
- Existing confetti burst continues

**Danger zone (<10% from liquidation)**:
- Card border pulses red (existing `dangerPulse` animation)
- Warning icon animates in
- Subtle screen shake via CSS transform

### 3.4 Loading & Error States

**LoadingSkeleton** — CSS shimmer animation (gradient slide), matches actual content dimensions. Used in:
- Activity page (trade cards)
- PnL screen (chart area during load)
- Settings page (balance fetching)

**ErrorBoundary** — Wraps each page. Catches runtime errors, shows "Something went wrong" with a retry button. Preserves Privy wallet connection so user doesn't have to re-auth.

**EmptyState** — Consistent pattern used for:
- No open trades: wheel icon + "No active positions — spin the wheel!"
- No closed trades: history icon + "No trade history yet — keep rolling!"

**Success feedback**:
- Toast for completed close/flip actions
- Checkmark animation on settings save
- Green flash on successful withdrawal

### 3.5 Micro-interactions

**Buttons**: All buttons get `transform: scale(0.97)` on `:active` with `transition: var(--duration-fast)`. Haptic feedback via existing `haptics.ts`.

**NavFooter**: Active tab gets a lime underline that slides to position. Badge count bounces in when changing. Icons scale subtly on tap.

**ROLL button**: Keep existing pulse glow. Add `scale(0.95)` press state + strong haptic.

**Toast exit**: Verify current exit behavior — Toast.tsx has `animate-slide-in` for entry but may lack exit animation. If no exit animation exists, add fade-out + slide-up. If one exists, refine it.

**Selection chips**: Refine existing staggered bounce-in timing — 100ms delay between each chip appearance.

### Phase 3 File Summary

| Action | File | Change |
|--------|------|--------|
| NEW | `hooks/useCountUp.ts` | Animated number counting hook |
| MOD | `components/StageRouter.tsx` | Add AnimatePresence transitions |
| MOD | `components/PnLScreen.tsx` | Counting PnL, enhanced buttons, danger zone |
| MOD | `components/ui/Button.tsx` | Press animations, haptic integration |
| MOD | `components/ui/LoadingSkeleton.tsx` | Shimmer effect CSS |
| MOD | `components/ui/ErrorBoundary.tsx` | Error UI with retry |
| MOD | `components/NavFooter.tsx` | Active tab animation, badge bounce |
| MOD | `components/Toast.tsx` | Exit animation |
| MOD | `app/globals.css` | Shimmer keyframes, micro-interaction utilities |
| MOD | `app/activity/page.tsx` | Use LoadingSkeleton, EmptyState |
| MOD | `app/settings/page.tsx` | Loading feedback, success states |

---

## Testing Strategy

### Phase 1 (Pusher)
- Verify Pusher connects once and maintains connection across re-renders
- Verify polling starts at 50ms and backs off correctly
- Verify only one `onConfirmed` callback fires (not duplicates)
- Verify stale events from previous trades are ignored
- Verify 30s timeout still works

### Phase 2 (Architecture)
- Verify all pages render identically before/after extraction
- Verify trade execution (open/close/flip) works through extracted hook
- Verify design token colors match existing hardcoded values exactly
- Verify no visual regression on any screen

### Phase 3 (Visual)
- Verify stage transitions animate smoothly (no jank on iPhone SE)
- Verify PnL counter animates on mount
- Verify loading skeletons show during data fetch
- Verify error boundary catches and displays errors with retry
- Verify button press animations feel responsive
- Verify no performance regression from Framer Motion

### Cross-phase Integration
- After Phase 1+2: Verify Pusher singleton still works correctly with extracted components
- After Phase 2+3: Verify animations don't interfere with Pusher event handling
- Full regression: Verify Tachyon relay works end-to-end (open trade → confirm → PnL → close)

### Cross-cutting
- Test on iPhone SE (375x667) — smallest supported viewport
- Test on iPhone 14 Pro (393x852) — primary target
- Test with `prefers-reduced-motion: reduce` — all animations should be instant
- Verify Tachyon relay still works end-to-end (open trade → confirm → PnL → close)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase 2 extraction breaks trade flow | Medium | Extract as pure refactor, test each extraction independently |
| Framer Motion causes jank on low-end devices | Low | Use `will-change`, test on iPhone SE, respect reduced-motion |
| Pusher singleton causes stale connections | Low | Add health check ping, reconnect on stale threshold |
| Design token migration misses a color | Low | Grep for all hex values, systematic replacement |

---

## Execution Order

1. **Phase 1** — Pusher fixes (can ship immediately, independent)
2. **Phase 2** — Component extraction + design tokens (requires careful testing)
3. **Phase 3** — Visual polish (builds on Phase 2 component structure)

Each phase is a separate PR. Phase 2 and 3 can be combined into one PR if preferred.
