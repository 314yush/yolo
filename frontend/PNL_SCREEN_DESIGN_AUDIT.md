# PnL Screen & PriceChart Design Audit

**Date:** January 30, 2026  
**Components:** `PnLScreen.tsx`, `PriceChart.tsx`  
**Reference:** `designguidelines.md`

---

## Executive Summary

The PnL Screen is the **critical real-time trading interface** where users monitor their active positions, view price action, and execute trade management actions (Close, Flip, Roll). It serves as the primary feedback mechanism for trade performance and requires **immediate visual clarity**, **dopamine-driven feedback**, and **high-energy presentation** aligned with YOLO's "Spin to Win" brand personality.

**Current State:** The screen is functionally complete but has several design guideline violations and optimization opportunities that impact brand consistency, visual hierarchy, and user engagement.

---

## 1. Purpose & User Goals

### Primary Purpose
- **Real-time PnL monitoring** - Show live profit/loss with immediate visual feedback
- **Price action visualization** - Display candlestick chart with entry/liquidation reference lines
- **Trade management** - Provide quick access to Close, Flip, and Roll actions
- **Risk awareness** - Highlight proximity to liquidation threshold
- **Dopamine engagement** - Create excitement through animations, colors, and visual feedback

### User Mental Model
Users expect:
1. **Instant clarity** - Can I see my PnL immediately? Is it profit or loss?
2. **Context** - Where is price relative to my entry? How close to liquidation?
3. **Control** - Can I quickly close or adjust my position?
4. **Excitement** - Does this feel like a high-stakes game?

---

## 2. Design Guideline Compliance Audit

### ✅ **COMPLIANT AREAS**

#### Typography
- ✅ Uses JetBrains Mono / monospace fonts throughout (`font-mono`)
- ✅ Font weights align with guidelines (900 for headers, 700 for body, 400 for labels)
- ✅ Font sizes use responsive clamp() for mobile-first approach

#### Color Palette
- ✅ Lime Green (#CCFF00) for positive PnL and primary actions
- ✅ Hot Pink (#FF006E) for negative PnL and liquidation warnings
- ✅ True Black (#000000) background
- ✅ Asset colors correctly applied to chips (XRP Blue, etc.)

#### Neobrutalism Principles
- ✅ Hard shadows (`box-shadow: 8px 8px 0px 0px rgba(0,0,0,1)`)
- ✅ No border radius (`borderRadius: 0`)
- ✅ Thick borders (8px on buttons, 4px on chips)
- ✅ High contrast throughout

#### Spacing
- ✅ Uses clamp() for responsive spacing
- ✅ Consistent padding scale (8px, 16px, 24px, 32px)

---

### ❌ **VIOLATIONS & ISSUES**

#### 2.1 Typography Violations

**Issue:** Inconsistent font family usage
- **Location:** `PriceChart.tsx` lines 279, 575, 605
- **Problem:** Uses `'JetBrains Mono', 'Space Mono', 'Courier New', monospace` fallback chain
- **Guideline:** Should use `'JetBrains Mono', 'Courier New', monospace` (no Space Mono)
- **Impact:** Minor inconsistency, but Space Mono not in brand guidelines

**Issue:** Font size not aligned with design system
- **Location:** `PriceChart.tsx` line 280
- **Problem:** Chart uses `fontSize: 14` (not in design system scale)
- **Guideline:** Should use design system sizes: `sm: 14px`, `base: 16px`, `lg: 18px`
- **Impact:** Chart text feels disconnected from brand typography scale

**Issue:** Letter spacing inconsistency
- **Location:** `PriceChart.tsx` line 579
- **Problem:** Resolution buttons use `letterSpacing: '-0.05em'` (tighter)
- **Guideline:** Headlines use `-0.05em`, everything else normal
- **Impact:** Buttons feel inconsistent with other UI elements

#### 2.2 Neobrutalism Violations

**Issue:** Missing rotation on key elements
- **Location:** `PnLScreen.tsx` header, `PriceChart.tsx` container
- **Problem:** No `transform: rotate(-2deg)` on key elements
- **Guideline:** "Slight Rotation - Key elements tilted 2-3° to create playful chaos"
- **Impact:** Missing playful brand personality, feels too serious

**Issue:** Shadow inconsistency
- **Location:** `PriceChart.tsx` line 542
- **Problem:** Chart container uses `boxShadow: '8px 8px 0px 0px rgba(0,0,0,1)'` (black shadow)
- **Guideline:** Should use colored shadows for brand elements: `12px 12px 0px 0px rgba(204,255,0,0.5)`
- **Impact:** Chart feels disconnected from brand energy

**Issue:** Border thickness inconsistency
- **Location:** `PriceChart.tsx` resolution switcher (line 549)
- **Problem:** Uses `padding: '4px'` but no explicit border
- **Guideline:** Everything should have thick borders (4-8px)
- **Impact:** Resolution switcher feels less "brutal"

#### 2.3 Color Usage Violations

**Issue:** Overlay backgrounds not using brand colors
- **Location:** `PriceChart.tsx` lines 602, 622
- **Problem:** Time range and price change overlays use `CHART_COLORS.overlayBg` (black)
- **Guideline:** Should use `Gray 900 (#111827)` for secondary backgrounds per guidelines
- **Impact:** Overlays blend too much with chart background

**Issue:** Button active state color
- **Location:** `PriceChart.tsx` line 568
- **Problem:** Active resolution button uses `CHART_COLORS.buttonActive` (#CCFF00) with black text
- **Guideline:** ✅ Actually correct per guidelines (Primary Button uses lime green with black text)
- **Impact:** None - this is correct

#### 2.4 Spacing Violations

**Issue:** Chart container padding
- **Location:** `PriceChart.tsx` line 646
- **Problem:** Uses `padding: '0 0 32px 0'` (only bottom)
- **Guideline:** Containers should use `16px all sides` per guidelines
- **Impact:** Chart feels cramped, especially on mobile

**Issue:** Resolution switcher padding
- **Location:** `PriceChart.tsx` line 578
- **Problem:** Uses `padding: '8px 16px'` (doesn't match button guidelines)
- **Guideline:** Buttons should use `padding: 24px vertical, 48px horizontal`
- **Impact:** Buttons feel too small, not "brutal" enough

#### 2.5 Component Style Violations

**Issue:** Chart header border
- **Location:** `PnLScreen.tsx` line 173
- **Problem:** Uses `border-b border-white/10` (subtle 1px border)
- **Guideline:** Neobrutalism requires thick borders (4-8px), no subtle borders
- **Impact:** Feels too refined, not "brutal" enough

**Issue:** Missing brutal card styling
- **Location:** `PnLScreen.tsx` info section (lines 348-386)
- **Problem:** Entry/Current price info uses plain text, no card styling
- **Guideline:** Should use `brutal-card` styling with borders and shadows
- **Impact:** Information hierarchy unclear, feels flat

---

## 3. Visual Hierarchy & Information Architecture

### Current Hierarchy (Top to Bottom)
1. **Header** - YOLO logo + Login (low priority)
2. **Chart Header** - Asset pair + Current price (medium priority)
3. **Chart** - Price action visualization (high priority)
4. **Chips** - Asset/Leverage/Direction (low-medium priority)
5. **PnL Display** - Large profit/loss (HIGHEST priority) ✅
6. **Info** - Entry/Current/TP (low priority)
7. **Liquidation Warning** - Conditional (high priority when shown)
8. **Action Buttons** - Fixed bottom (high priority)

### Issues

**Problem:** Chart takes too much vertical space
- **Current:** Chart uses `1fr` in grid, can be 200-400px
- **Impact:** PnL (the most important info) is pushed down
- **Recommendation:** Reduce chart max height, prioritize PnL visibility

**Problem:** Chips are too small
- **Current:** Uses `clamp(0.75rem, 2vw, 0.875rem)` font size
- **Impact:** Hard to read, doesn't match brand boldness
- **Recommendation:** Increase to `clamp(0.875rem, 2.5vw, 1rem)` with 700 weight

**Problem:** Info section lacks visual weight
- **Current:** Plain text with subtle colors
- **Impact:** Entry/Current price info feels secondary
- **Recommendation:** Use brutal card styling with borders

---

## 4. UX & Interaction Issues

### 4.1 Chart Interaction

**Issue:** Only 1 candle visible (from image)
- **Location:** `PriceChart.tsx` `convertToChartData` function
- **Problem:** Code targets 10-15 candles, but image shows only 1
- **Root Cause:** Likely data availability or chart zoom level
- **Impact:** Users can't see price context/history
- **Priority:** 🔴 CRITICAL

**Issue:** Chart resolution switcher positioning
- **Location:** `PriceChart.tsx` line 547
- **Problem:** Positioned `top-4 right-4` (absolute)
- **Impact:** May overlap with chart content on small screens
- **Recommendation:** Consider moving to chart header or using different positioning

**Issue:** Time range overlay positioning
- **Location:** `PriceChart.tsx` line 600
- **Problem:** Positioned `top-4 left-4` (absolute)
- **Impact:** May overlap with chart content
- **Recommendation:** Integrate into chart header for better hierarchy

### 4.2 PnL Display

**Issue:** PnL flash animation timing
- **Location:** `PnLScreen.tsx` lines 46-63
- **Problem:** Uses `setTimeout` with 0ms delay (hacky)
- **Impact:** May cause timing issues, not smooth
- **Recommendation:** Use CSS animations or proper React state batching

**Issue:** PnL glow effect may be too subtle
- **Location:** `globals.css` lines 303-314
- **Problem:** Text shadow glow may not be visible enough
- **Impact:** Doesn't create enough "dopamine hit" for wins
- **Recommendation:** Increase glow intensity, add pulse animation for large changes

### 4.3 Action Buttons

**Issue:** Button sizing inconsistency
- **Location:** `PnLScreen.tsx` lines 438-546
- **Problem:** Close button is square (3.5-4rem), Flip/Roll are rectangular
- **Impact:** Visual imbalance, Close button feels less important
- **Recommendation:** Make all buttons consistent size or emphasize Close more

**Issue:** Button positioning
- **Location:** `PnLScreen.tsx` line 424
- **Problem:** Fixed above nav bar, requires spacer div
- **Impact:** Complex layout, potential z-index issues
- **Recommendation:** Use CSS Grid or Flexbox for cleaner layout

---

## 5. Performance & Optimization

### 5.1 Chart Performance

**Issue:** Chart recreation on every resolution/asset change
- **Location:** `PriceChart.tsx` line 263 (useEffect dependencies)
- **Problem:** Chart is recreated when `assetPair`, `selectedResolution`, or `height` changes
- **Impact:** Potential flickering, loss of user's zoom/pan state
- **Recommendation:** Only recreate chart on `assetPair` change, update data/options for resolution/height

**Issue:** Multiple useEffect hooks for chart updates
- **Location:** `PriceChart.tsx` lines 477-521
- **Problem:** Separate effects for height, resolution, data, price lines
- **Impact:** Potential race conditions, unnecessary re-renders
- **Recommendation:** Consolidate into fewer, well-ordered effects

**Issue:** Resize debouncing may be too aggressive
- **Location:** `PriceChart.tsx` line 368 (150ms debounce, 5px threshold)
- **Problem:** May feel laggy on fast resize
- **Impact:** Chart may not feel responsive
- **Recommendation:** Reduce debounce to 100ms, keep 5px threshold

### 5.2 PnL Screen Performance

**Issue:** PnL polling every 1 second
- **Location:** `PnLScreen.tsx` line 37
- **Problem:** `usePnL({ enabled: true, interval: 1000 })`
- **Impact:** High API/network usage, battery drain
- **Recommendation:** Consider WebSocket or adaptive polling (faster when near liquidation)

**Issue:** Multiple store subscriptions
- **Location:** `PnLScreen.tsx` line 21
- **Problem:** Accesses multiple store values (`selection`, `pnlData`, `currentTrade`, `prices`, etc.)
- **Impact:** Re-renders on any store change
- **Recommendation:** Use selectors to subscribe only to needed values

---

## 6. Accessibility Issues

### 6.1 Screen Reader Support

**Issue:** Chart not accessible
- **Location:** `PriceChart.tsx` - entire component
- **Problem:** No ARIA labels, no data table alternative
- **Impact:** Screen reader users can't access price data
- **Recommendation:** Add `aria-label`, `role="img"`, and `aria-describedby` with data summary

**Issue:** Resolution switcher not keyboard accessible
- **Location:** `PriceChart.tsx` lines 560-593
- **Problem:** Buttons may not have proper focus states
- **Impact:** Keyboard users can't navigate
- **Recommendation:** Ensure focus-visible styles are applied

### 6.2 Color Contrast

**Issue:** White/80 text on black
- **Location:** `PnLScreen.tsx` line 181
- **Problem:** `text-white/80` (80% opacity) may not meet WCAG AA
- **Impact:** Low vision users may struggle
- **Recommendation:** Use `text-white` or ensure contrast ratio ≥ 4.5:1

**Issue:** Overlay text contrast
- **Location:** `PriceChart.tsx` lines 602-614
- **Problem:** White text on black background (should be fine, but verify)
- **Impact:** Should be OK, but verify WCAG compliance

---

## 7. Mobile Optimization Issues

### 7.1 Touch Targets

**Issue:** Resolution switcher buttons may be too small
- **Location:** `PriceChart.tsx` line 578
- **Problem:** `padding: '8px 16px'` may create <44px touch targets
- **Impact:** Hard to tap on mobile
- **Recommendation:** Ensure minimum 44x44px touch targets

**Issue:** Action buttons sizing
- **Location:** `PnLScreen.tsx` lines 438-546
- **Problem:** Uses `clamp(3.5rem, 10vw, 4rem)` - may be too small on some devices
- **Impact:** Hard to tap, especially Close button
- **Recommendation:** Ensure all buttons ≥44px minimum

### 7.2 Viewport Handling

**Issue:** Chart height calculation complexity
- **Location:** `PnLScreen.tsx` lines 106-129
- **Problem:** Complex calculation with multiple clamp() calls
- **Impact:** May not work correctly on all devices
- **Recommendation:** Simplify using CSS Grid with `minmax()` or `fr` units

**Issue:** Safe area handling
- **Location:** `PnLScreen.tsx` lines 207-209
- **Problem:** Manual safe area inset calculations
- **Impact:** May not work on all devices
- **Recommendation:** Use CSS `env(safe-area-inset-*)` utilities consistently

---

## 8. Brand Personality Alignment

### Current State: 6/10

**Missing Elements:**
- ❌ No rotation on key elements (playful chaos)
- ❌ Chart feels too "professional" (needs more energy)
- ❌ Missing "high-energy" animations (bounce, pulse, scale)
- ❌ PnL display could be more dramatic (larger, more glow, animations)

**Present Elements:**
- ✅ Bold colors (lime green, hot pink)
- ✅ Thick borders and shadows
- ✅ Monospace fonts
- ✅ High contrast

**Recommendations:**
1. Add rotation to chart container (-2deg)
2. Increase PnL font size (use 7xl or 8xl for dramatic effect)
3. Add bounce animation when PnL changes significantly
4. Add pulse animation to liquidation warning
5. Make price change indicator more prominent (larger, animated)

---

## 9. Prioritized Recommendations

### 🔴 **CRITICAL (Fix Immediately)**

1. **Fix Chart Candle Visibility**
   - **Issue:** Only 1 candle visible (should show 10-15)
   - **Location:** `PriceChart.tsx` `convertToChartData`, chart zoom logic
   - **Action:** Debug data flow, ensure `fitContent()` is called correctly
   - **Impact:** Users can't see price context

2. **Fix Typography Consistency**
   - **Issue:** Inconsistent font families and sizes
   - **Location:** `PriceChart.tsx` throughout
   - **Action:** Standardize to JetBrains Mono, use design system font sizes
   - **Impact:** Brand consistency

3. **Fix Neobrutalism Violations**
   - **Issue:** Missing rotation, inconsistent borders/shadows
   - **Location:** `PriceChart.tsx`, `PnLScreen.tsx`
   - **Action:** Add rotation to chart, use colored shadows, ensure thick borders
   - **Impact:** Brand personality

### 🟡 **HIGH PRIORITY (Fix Soon)**

4. **Improve Visual Hierarchy**
   - **Issue:** Chart takes too much space, PnL pushed down
   - **Action:** Reduce chart max height, increase PnL prominence
   - **Impact:** Better information hierarchy

5. **Enhance PnL Display**
   - **Issue:** Could be more dramatic and engaging
   - **Action:** Increase font size, enhance glow, add bounce animations
   - **Impact:** Better dopamine feedback

6. **Fix Chart Performance**
   - **Issue:** Chart recreation on every change
   - **Action:** Optimize useEffect dependencies, prevent unnecessary recreations
   - **Impact:** Smoother UX, better performance

### 🟢 **MEDIUM PRIORITY (Nice to Have)**

7. **Improve Accessibility**
   - **Issue:** Missing ARIA labels, keyboard navigation
   - **Action:** Add screen reader support, ensure keyboard accessibility
   - **Impact:** Better accessibility compliance

8. **Optimize Mobile Touch Targets**
   - **Issue:** Some buttons may be too small
   - **Action:** Ensure all interactive elements ≥44px
   - **Impact:** Better mobile UX

9. **Simplify Layout Code**
   - **Issue:** Complex height calculations, spacer divs
   - **Action:** Use CSS Grid/Flexbox more effectively
   - **Impact:** Cleaner code, easier maintenance

---

## 10. Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
- [ ] Fix chart candle visibility issue
- [ ] Standardize typography (fonts, sizes, letter spacing)
- [ ] Add neobrutalist rotation and colored shadows
- [ ] Fix border thickness consistency

### Phase 2: UX Improvements (Week 2)
- [ ] Optimize visual hierarchy (reduce chart height, increase PnL prominence)
- [ ] Enhance PnL display (larger font, better glow, animations)
- [ ] Improve chart performance (optimize useEffect dependencies)
- [ ] Fix chart header styling (thick borders, brutal card)

### Phase 3: Polish & Optimization (Week 3)
- [ ] Improve accessibility (ARIA labels, keyboard navigation)
- [ ] Optimize mobile touch targets
- [ ] Simplify layout code (remove spacer divs, use CSS Grid)
- [ ] Add performance monitoring

---

## 11. Success Metrics

### Design Compliance
- ✅ 100% typography consistency (JetBrains Mono, design system sizes)
- ✅ 100% neobrutalism principles (rotation, thick borders, colored shadows)
- ✅ 100% color palette usage (brand colors only)
- ✅ 100% spacing scale adherence

### UX Metrics
- ⏱️ Chart load time < 500ms
- 📊 Chart shows 10-15 candles consistently
- 🎯 PnL visible above fold (no scrolling)
- 📱 All touch targets ≥44px
- ♿ WCAG AA contrast compliance

### Performance Metrics
- 🚀 No chart flickering on resolution change
- ⚡ Smooth 60fps animations
- 🔋 Reduced API polling (consider WebSocket)
- 💾 Optimized re-renders (<5 per second)

---

## 12. Conclusion

The PnL Screen is **functionally complete** but requires **design guideline alignment** and **UX optimization** to fully embody YOLO's "Spin to Win" brand personality. The most critical issues are:

1. **Chart candle visibility** (only 1 candle shown)
2. **Typography inconsistency** (fonts, sizes)
3. **Missing neobrutalist elements** (rotation, colored shadows)
4. **Visual hierarchy** (chart too large, PnL not prominent enough)

Addressing these issues will create a more **engaging**, **on-brand**, and **performant** trading interface that delivers the high-energy, dopamine-driven experience YOLO aims for.

---

**Next Steps:**
1. Review this audit with the team
2. Prioritize fixes based on user impact
3. Create implementation tickets
4. Set up design review process to prevent future violations
