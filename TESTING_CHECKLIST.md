# Layout Optimization Testing Checklist

## Pre-Testing Setup

- [ ] Start dev server: `cd frontend && npm run dev`
- [ ] Open browser to `http://localhost:3000`
- [ ] Open browser DevTools (F12)
- [ ] Set device emulation to iPhone SE (375x667)

## Phase 1: Bottom Navigation Testing

### Visual Inspection
- [ ] Footer height is 72px (not 140px)
- [ ] Navigation icons (Activity, Settings) are on the left
- [ ] ROLL button is on the right
- [ ] Icons are 20px (5x5 in Tailwind)
- [ ] Badge on Activity icon is positioned correctly
- [ ] No duplicate navigation bars
- [ ] Safe-area-inset-bottom is applied once

### Interaction Testing
- [ ] Activity icon is clickable (44x44 touch target)
- [ ] Settings icon is clickable (44x44 touch target)
- [ ] ROLL button is clickable (48px height)
- [ ] Hover states work on desktop
- [ ] Focus states work with keyboard (Tab key)
- [ ] Navigation works correctly

### Responsive Testing
- [ ] Test on iPhone SE (375x667)
- [ ] Test on iPhone 14 Pro (393x852)
- [ ] Test on iPad (768x1024)
- [ ] Test on desktop (max-width: 28rem constraint)

## Phase 2: PnL Screen Testing

### Hero Section
- [ ] PnL hero is ~20vh (133px on iPhone SE)
- [ ] Trade info is inline: BTC • 10x • LONG • Good luck!
- [ ] Font sizes are reduced but still readable
- [ ] PnL number: clamp(2.5rem, 10vw, 4.5rem)
- [ ] Percentage: clamp(1.25rem, 5vw, 2rem)
- [ ] Gamification message appears inline
- [ ] Near-liquidation warning is prominent

### Chart Container
- [ ] Chart is 220-300px tall (not 140-180px)
- [ ] Chart is clearly visible and readable
- [ ] Entry price line is visible
- [ ] Liquidation price line is visible
- [ ] Current price updates in real-time
- [ ] Chart scales properly on resize

### Price Info Row
- [ ] Entry → Now display is compact
- [ ] "Show details" toggle works
- [ ] Details expand/collapse smoothly
- [ ] Max profit price shows correctly
- [ ] Liquidation price shows correctly

### Action Buttons
- [ ] CLOSE button is 48px height
- [ ] FLIP button is 48px height
- [ ] ROLL AGAIN button is 64px height
- [ ] Buttons are positioned correctly
- [ ] Spacing is 12px from bottom (+ safe-area)

### Liquidated State
- [ ] Trade info appears at top
- [ ] "LIQUIDATED" text is prominent
- [ ] Final PnL displays correctly
- [ ] Explanation text is visible
- [ ] Layout is compact

## Phase 3: PickerWheel Testing

### Selection Chips
- [ ] Chips appear inline (not stacked)
- [ ] "Good luck!" appears inline with selection
- [ ] Font size is reduced but readable
- [ ] Animation works smoothly
- [ ] No excessive padding

### Wheel Size
- [ ] Wheel is larger than before
- [ ] Wheel fits viewport without overflow
- [ ] Wheel is centered
- [ ] Pointer is positioned correctly
- [ ] Segments are readable

### Status Text
- [ ] "SPINNING ASSET..." appears
- [ ] "SPINNING LEVERAGE..." appears
- [ ] "SPINNING DIRECTION..." appears
- [ ] "OPENING POSITION..." appears
- [ ] Text is compact but readable

## Phase 4: Header & Info Bar Testing

### Header
- [ ] Height is ~48px (py-2)
- [ ] YOLO logo is visible
- [ ] Login button is positioned correctly
- [ ] Spacing is consistent

### Info Bar
- [ ] Height is ~40px (py-1.5)
- [ ] Collateral displays correctly
- [ ] Balance displays correctly
- [ ] Separator dot is visible
- [ ] Text is readable

## Cross-Screen Testing

### Navigation Flow
- [ ] Home → Activity → Home
- [ ] Home → Settings → Home
- [ ] Home → Spin → PnL → Roll Again → Home
- [ ] All transitions are smooth
- [ ] No layout shifts

### Viewport Utilization
- [ ] Measure total content height on iPhone SE
- [ ] Verify no unnecessary scrolling
- [ ] Check that chart is primary focus on PnL screen
- [ ] Verify wheel is prominent on home screen

## Device-Specific Testing

### iPhone SE (375x667)
- [ ] All content fits without overflow
- [ ] Chart is at least 220px
- [ ] Wheel is at least 200px
- [ ] Bottom nav is 72px
- [ ] Total height ≤ 667px

### iPhone 14 Pro (393x852)
- [ ] Content scales appropriately
- [ ] Safe-area-inset-top is applied
- [ ] Safe-area-inset-bottom is applied
- [ ] Dynamic Island doesn't interfere

### Android (various)
- [ ] Test on Chrome Android
- [ ] Test on Samsung Internet
- [ ] Verify safe-area fallbacks work
- [ ] Check navigation bar handling

### Desktop (max-width: 28rem)
- [ ] Content is centered
- [ ] Max-width constraint is enforced
- [ ] Hover states work
- [ ] Focus states work

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Focus indicators are visible
- [ ] Enter/Space activate buttons
- [ ] Escape closes modals (if any)

### Screen Reader
- [ ] ARIA labels are present
- [ ] Live regions announce updates
- [ ] Button labels are descriptive
- [ ] Status messages are announced

### Touch Targets
- [ ] All buttons are ≥44px
- [ ] Navigation icons are 44x44
- [ ] ROLL button is 48px height
- [ ] No overlapping touch targets

## Performance Testing

### Load Time
- [ ] Initial page load < 3s
- [ ] Chart renders quickly
- [ ] No layout shift on load
- [ ] Smooth animations

### Interaction
- [ ] Wheel spins smoothly
- [ ] Chart updates in real-time
- [ ] Button clicks are responsive
- [ ] No lag or jank

## Regression Testing

### Functionality
- [ ] Wheel spinning works
- [ ] Trade execution works
- [ ] PnL updates correctly
- [ ] Chart displays correctly
- [ ] Navigation works
- [ ] Login/logout works

### Visual
- [ ] Colors are correct
- [ ] Fonts are correct
- [ ] Spacing is consistent
- [ ] Borders are correct
- [ ] Shadows are correct

## Edge Cases

### Small Screens
- [ ] Test on 320px width (iPhone 5)
- [ ] Verify content doesn't break
- [ ] Check text wrapping

### Large Screens
- [ ] Test on 1920px width
- [ ] Verify max-width constraint
- [ ] Check centering

### Orientation
- [ ] Test portrait mode
- [ ] Test landscape mode (if applicable)
- [ ] Verify layout adapts

### Long Content
- [ ] Test with many open trades
- [ ] Test with long asset names
- [ ] Verify scrolling works

## Browser Testing

### Chrome
- [ ] Desktop Chrome
- [ ] Android Chrome
- [ ] iOS Chrome

### Safari
- [ ] Desktop Safari
- [ ] iOS Safari
- [ ] Check safe-area support

### Firefox
- [ ] Desktop Firefox
- [ ] Android Firefox

### Edge
- [ ] Desktop Edge

## Final Verification

### Measurements
- [ ] Bottom nav: 72px ✓
- [ ] PnL hero: ~20vh ✓
- [ ] Chart: 220-300px ✓
- [ ] Header: ~48px ✓
- [ ] Info bar: ~40px ✓
- [ ] Wheel: 200-450px ✓

### Space Savings
- [ ] Total vertical space saved: 272-312px ✓
- [ ] Viewport utilization: 95% ✓
- [ ] Chart is 2x larger ✓
- [ ] Wheel is 20-30% larger ✓

### User Experience
- [ ] Layout feels more spacious
- [ ] Chart is more readable
- [ ] Navigation is easier
- [ ] Interactions are smooth
- [ ] Design is cohesive

## Sign-Off

- [ ] All tests passed
- [ ] No regressions found
- [ ] Performance is acceptable
- [ ] Accessibility is maintained
- [ ] Ready for production

---

## Notes

Document any issues found during testing:

1. 
2. 
3. 

---

## Test Results

**Date:** ___________
**Tester:** ___________
**Browser:** ___________
**Device:** ___________
**Result:** PASS / FAIL

**Comments:**


