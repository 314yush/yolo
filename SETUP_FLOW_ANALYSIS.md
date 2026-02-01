# Setup Flow Analysis - Three User Scenarios

## Overview
This document analyzes how the setup flow handles three different user scenarios before committing changes.

## Setup Flow Components

### 1. Status Check (`SetupFlow.tsx` - `checkStatusOnChain()`)
- **USDC Allowance Check**: Checks if user has approved USDC to `TradingStorage` contract (minimum 10,000 USDC)
- **Delegate Status Check**: Checks if user has a delegate set up on-chain via `Trading.delegations(trader)`
- **Local Delegate**: Ensures a delegate wallet exists locally (stored in localStorage)

### 2. Batched Setup (`useBatchedSetup.ts` - `executeBatchedSetup()`)
- Uses EIP-5792 `wallet_sendCalls` for batching (falls back to sequential if not supported)
- Conditionally includes USDC approval based on current allowance
- Always includes `setDelegate` transaction

## Scenario Analysis

### Scenario 1: New Wallet (to Avantis and this game)
**State:**
- ❌ No delegate set up on-chain
- ❌ No USDC approval to TradingStorage
- ✅ Local delegate wallet created (on first check)

**Flow:**
1. `checkStatusOnChain()` detects:
   - `hasUsdcApproved = false`
   - `status.isSetup = false`
2. User sees "SETUP REQUIRED" screen
3. User clicks "ENABLE TRADING"
4. `executeBatchedSetup()`:
   - Checks: `needsUsdcApproval = true`
   - Builds calls array with:
     - `setDelegate(delegateAddress)` ✅
     - `approve(TradingStorage, 10000 USDC)` ✅
   - User signs **once** (batched via `wallet_sendCalls`)
5. Result: Both delegate and USDC approval set up ✅

**Expected Behavior:** ✅ Works correctly - user signs once for both operations

---

### Scenario 2: Wallet that has traded on Avantis but not this app
**State:**
- ✅ Has delegate set up on-chain (different address than our local delegate)
- ✅ Has USDC approval to TradingStorage (from previous Avantis trading)

**Flow:**
1. `checkStatusOnChain()` detects:
   - `hasUsdcApproved = true` ✅ (checked via `allowance(userAddress, TradingStorage) >= 10,000 USDC`)
   - `status.isSetup = true`
   - `onChainDelegate !== localDelegate` ⚠️ (mismatch detected)
2. Code path: Lines 232-246 in `SetupFlow.tsx`
   - Logs: "Delegate mismatch detected! On-chain: [old], Local: [new]"
   - Logs: "✅ USDC already approved - user only needs to set up new delegate"
   - Proceeds to setup step
3. User sees "SETUP REQUIRED" screen with warning:
   - "⚠️ Existing delegate detected. Setup will replace it with the new delegate automatically."
4. User clicks "ENABLE TRADING"
5. `executeBatchedSetup()`:
   - **Line 170**: Checks USDC allowance: `checkUsdcAllowance(userAddress)` → returns `{ hasSufficient: true }`
   - **Line 174**: Sets `needsUsdcApproval = !usdcAllowanceCheck.hasSufficient` → `false` ✅
   - **Line 172-173**: Detects `hasExistingDelegate = true` (different address)
   - **Lines 183-189**: Builds calls array with only `setDelegate(newDelegateAddress)` ✅
   - **Line 192**: USDC approval is **SKIPPED** because `needsUsdcApproval = false` ✅
   - **Line 205**: Status message: "Replacing existing delegate (USDC already approved)..."
   - User signs **once** (only setDelegate, NO USDC approval transaction)
6. Result: New delegate set up, USDC approval remains (reused from Avantis) ✅

**Expected Behavior:** ✅ **CONFIRMED** - Code correctly skips USDC approval when already approved to TradingStorage. User only signs setDelegate transaction.

**Note:** The `setDelegate` call should automatically replace the old delegate. No explicit removal step needed.

---

### Scenario 3: User that uses both (this app and Avantis)
**Sub-scenario 3a: Same delegate address**
**State:**
- ✅ Has delegate set up on-chain (same address as our local delegate)
- ✅ Has USDC approval to TradingStorage

**Flow:**
1. `checkStatusOnChain()` detects:
   - `hasUsdcApproved = true` ✅
   - `status.isSetup = true`
   - `onChainDelegate === localDelegate` ✅ (match!)
2. Code path: Lines 252-264 in `SetupFlow.tsx`
   - Logs: "Delegation already set up with: [delegate]"
   - Logs: "✅ Setup verified and cached"
   - Sets step to 'complete'
   - Calls `onSetupComplete()`
3. Result: Setup skipped, user proceeds directly to app ✅

**Expected Behavior:** ✅ Works correctly - no setup needed, instant access

---

**Sub-scenario 3b: Different delegate address**
**State:**
- ✅ Has delegate set up on-chain (different address than our local delegate)
- ✅ Has USDC approval to TradingStorage

**Flow:**
1. Same as Scenario 2 (mismatch detected)
2. User replaces delegate with new one
3. USDC approval remains (reused)

**Expected Behavior:** ✅ Works correctly - same as Scenario 2

---

## Key Implementation Details

### USDC Approval Check
```typescript
// Checks: allowance(userAddress, TradingStorage) >= 10,000 USDC
checkUsdcAllowance(userAddress)
```
- Checks if EOA has approved USDC to `TradingStorage` contract (line 94 in useAvantisAPI.ts)
- Minimum threshold: 10,000 USDC (10,000,000,000 in 6 decimals)
- This is a **one-time approval** that persists across sessions
- **Key Point**: If user already approved USDC to TradingStorage (e.g., from Avantis trading), this check returns `hasSufficient: true` and the approval transaction is **skipped** (line 192 in useBatchedSetup.ts)

### Delegate Check
```typescript
// Checks: Trading.delegations(userAddress) != 0x0000...
checkDelegateStatus(userAddress)
```
- Reads on-chain delegate address from `Trading` contract
- If returns non-zero address, delegate is set up
- `setDelegate(newAddress)` automatically replaces old delegate (no removal needed)

### Batched Setup Logic
```typescript
// Line 170: Check current USDC allowance to TradingStorage
const usdcAllowanceCheck = await checkUsdcAllowance(userAddress);
// Line 174: Determine if approval is needed
const needsUsdcApproval = !usdcAllowanceCheck.hasSufficient;

// Line 183-189: Always includes setDelegate
calls.push(setDelegateTx);

// Lines 191-199: Only includes USDC approval if not already approved
if (needsUsdcApproval) {
  calls.push(usdcApprovalTx);
}
// If needsUsdcApproval = false, USDC approval is SKIPPED ✅
```

### Transaction Batching
- Uses EIP-5792 `wallet_sendCalls` when supported
- Falls back to sequential transactions if not supported
- Preserves `msg.sender` context for `setDelegate` call

## Potential Issues & Edge Cases

### Issue 1: Delegate Mismatch Handling ⚠️ NEEDS VERIFICATION
**Current Behavior:** 
- If on-chain delegate doesn't match local delegate, setup proceeds
- `setDelegate(newAddress)` is called directly (no explicit removal)
- Comment in code says "remove old delegate (if needed)" but implementation doesn't remove it

**Question:** Does Avantis `setDelegate` automatically replace the old delegate, or do we need to remove it first?

**Current Implementation:**
- `buildRemoveDelegateTx()` function exists but is **NOT used** in batched setup
- Code assumes `setDelegate(newAddress)` automatically replaces old delegate
- Error message mentions "will automatically remove the old delegate" (line 389 in SetupFlow.tsx)

**Recommendation:** 
- **TEST THIS** - Verify that calling `setDelegate(newAddress)` when an old delegate exists actually replaces it
- If not, we may need to add explicit removal: `removeDelegate()` → `setDelegate(newAddress)`
- This would require 2 transactions instead of 1, but might be necessary

### Issue 2: USDC Approval Persistence
**Current Behavior:**
- USDC approval is checked on-chain each time
- If approved, it's reused (not re-approved)

**Potential Issue:** If user previously approved USDC to TradingStorage but then revoked it, the check should detect this correctly.

**Verification:** ✅ The code checks on-chain state, so revoked approvals will be detected.

### Issue 3: Cache vs On-Chain Verification
**Current Behavior:**
- Cache is checked first (for performance)
- But **always verified on-chain** before trusting cache (line 166-175 in SetupFlow.tsx)

**Verification:** ✅ Cache is never trusted without on-chain verification

## Testing Checklist

### Scenario 1: New Wallet
- [ ] Verify no delegate on-chain
- [ ] Verify no USDC approval
- [ ] Click "ENABLE TRADING"
- [ ] Verify both transactions in batch (setDelegate + approve)
- [ ] Verify single signature request
- [ ] Verify setup completes successfully

### Scenario 2: Avantis User (Different Delegate)
- [ ] Set up delegate on-chain manually (different address)
- [ ] Approve USDC to TradingStorage manually
- [ ] Open app with new wallet
- [ ] Verify mismatch warning appears
- [ ] Click "ENABLE TRADING"
- [ ] Verify only setDelegate transaction (no USDC approval)
- [ ] Verify single signature request
- [ ] Verify new delegate replaces old one

### Scenario 3a: Returning User (Same Delegate)
- [ ] Complete setup once
- [ ] Refresh page / return later
- [ ] Verify instant access (no setup screen)
- [ ] Verify cache is verified on-chain

### Scenario 3b: Returning User (Different Delegate)
- [ ] Complete setup with delegate A
- [ ] Manually change delegate to delegate B on-chain
- [ ] Return to app
- [ ] Verify mismatch detected
- [ ] Verify setup flow replaces delegate

## Recommendations

1. **Add explicit delegate removal** (if needed):
   - If Avantis requires explicit removal before setting new delegate, add `removeDelegate` call before `setDelegate`
   - Currently assumes `setDelegate` handles replacement automatically

2. **Improve status messages**:
   - More specific messages based on scenario (e.g., "Replacing existing delegate from Avantis...")

3. **Add logging**:
   - Log which scenario path is taken for debugging

4. **Test delegate replacement**:
   - Verify that `setDelegate(newAddress)` actually replaces old delegate without explicit removal

## Conclusion

The setup flow appears to handle all three scenarios correctly:
- ✅ New users: Both delegate and USDC approval in one batch
- ✅ Avantis users: Only delegate setup needed (USDC approval reused)
- ✅ Returning users: Instant access if delegate matches, replacement if mismatch

The key insight is that USDC approval is **persistent** and **reusable** across different delegate addresses, which makes the flow efficient for users who have already traded on Avantis.
