# Setup Flow Test Plan

## Pre-Testing Checklist

Before testing, ensure:
- [ ] Backend is running (if needed for API calls)
- [ ] Base network is accessible
- [ ] Test wallets have some ETH for gas (or Tachyon sponsorship is working)
- [ ] Test wallets have some USDC (for Scenario 1)

## Test Scenarios

### Scenario 1: New Wallet (Never used Avantis or this app)

**Setup:**
1. Use a fresh wallet that has never interacted with Avantis contracts
2. Ensure wallet has some USDC (for testing)

**Steps:**
1. Connect wallet to app
2. Observe initial state:
   - Should show "CHECKING SETUP..." briefly
   - Then show "SETUP REQUIRED" screen
3. Check console logs:
   - Should see: "Local delegate wallet: [address]"
   - Should see: "USDC allowance check: { hasSufficient: false, allowance: 0 }"
   - Should see: "Delegation status: { isSetup: false, delegateAddress: null }"
   - Should see: "⚠️ Need both delegate setup and USDC approval"
4. Click "ENABLE TRADING"
5. Observe:
   - Status message: "Setting up delegate wallet and approving USDC..."
   - Wallet should prompt for signature
   - Should be **ONE signature request** (batched)
6. After signing:
   - Should show "Transaction sent! Waiting for confirmation..."
   - Should poll for on-chain verification
7. Verify completion:
   - Should see "✅ Setup verified and cached"
   - Should proceed to main app

**Expected Result:** ✅ Both delegate and USDC approval set up in single batch

---

### Scenario 2: Avantis User (Different Delegate)

**Setup:**
1. Use a wallet that has traded on Avantis before
2. Manually set a delegate on-chain (different from app's local delegate):
   ```javascript
   // Using Avantis contract directly
   Trading.setDelegate(oldDelegateAddress)
   ```
3. Ensure USDC is already approved to TradingStorage (from previous Avantis trading)

**Steps:**
1. Connect wallet to app
2. Observe initial state:
   - Should show "CHECKING SETUP..." briefly
   - Then show "SETUP REQUIRED" screen
3. Check console logs:
   - Should see: "USDC allowance check: { hasSufficient: true, allowance: [>10000] }"
   - Should see: "Delegation status: { isSetup: true, delegateAddress: [oldDelegate] }"
   - Should see: "Delegate mismatch detected! On-chain: [old], Local: [new]"
   - Should see: "✅ USDC already approved - user only needs to set up new delegate"
4. Check UI:
   - Should show warning: "⚠️ Existing delegate detected. Setup will replace it with the new delegate automatically."
5. Click "ENABLE TRADING"
6. Observe:
   - Status message: "Replacing existing delegate (USDC already approved)..."
   - Wallet should prompt for signature
   - Should be **ONE signature request** (only setDelegate, no USDC approval)
7. After signing:
   - Should poll for on-chain verification
   - Should verify delegate was replaced
8. Verify completion:
   - Should see delegate replaced on-chain
   - Should proceed to main app

**Expected Result:** ✅ Only delegate setup needed, USDC approval reused

**Critical Test:** Verify that `setDelegate(newAddress)` actually replaces the old delegate without explicit removal.

---

### Scenario 3a: Returning User (Same Delegate)

**Setup:**
1. Complete Scenario 1 first (set up delegate and USDC approval)
2. Refresh page or return later with same wallet

**Steps:**
1. Connect wallet to app
2. Observe initial state:
   - Should show "CHECKING SETUP..." briefly
   - Should verify cache against on-chain state
3. Check console logs:
   - Should see: "📦 Found cached setup status, verifying on-chain..."
   - Should see: "USDC allowance check: { hasSufficient: true }"
   - Should see: "Delegation status: { isSetup: true, delegateAddress: [matches local] }"
   - Should see: "✅ Setup verified and cached"
4. Should **NOT** show setup screen
5. Should proceed directly to main app

**Expected Result:** ✅ Instant access, no setup needed

---

### Scenario 3b: Returning User (Delegate Changed Externally)

**Setup:**
1. Complete Scenario 1 first
2. Manually change delegate on-chain to a different address (simulating external change)

**Steps:**
1. Connect wallet to app
2. Observe initial state:
   - Should show "CHECKING SETUP..." briefly
   - Should verify cache against on-chain state
3. Check console logs:
   - Should see: "Delegate mismatch detected! On-chain: [new], Local: [old]"
   - Should detect mismatch
4. Should show "SETUP REQUIRED" screen
5. Should proceed as Scenario 2

**Expected Result:** ✅ Mismatch detected, setup flow triggered

---

## Edge Cases to Test

### Edge Case 1: USDC Approval Revoked
**Setup:** User previously approved USDC but then revoked it

**Test:**
1. Set up delegate and approve USDC
2. Manually revoke USDC approval (set allowance to 0)
3. Return to app
4. Should detect missing approval and require re-approval

### Edge Case 2: Partial USDC Approval
**Setup:** User has approved USDC but less than 10,000 USDC

**Test:**
1. Approve only 5,000 USDC to TradingStorage
2. Connect to app
3. Should detect insufficient allowance and require approval

### Edge Case 3: Wallet Doesn't Support EIP-5792
**Setup:** Use a wallet that doesn't support `wallet_sendCalls`

**Test:**
1. Should fall back to sequential transactions
2. Should send setDelegate first, then USDC approval (if needed)
3. Should require 2 signatures if both needed

### Edge Case 4: Network Switch Required
**Setup:** User is on wrong network

**Test:**
1. Connect wallet on wrong network (e.g., Ethereum mainnet)
2. Should prompt to switch to Base
3. Should handle network switch gracefully

---

## Verification Commands

### Check Delegate On-Chain
```javascript
// Using viem/ethers
const delegate = await publicClient.readContract({
  address: '0x44914408af82bC9983bbb330e3578E1105e11d4e', // Trading
  abi: [{ name: 'delegations', type: 'function', inputs: [{ name: 'trader', type: 'address' }], outputs: [{ name: '', type: 'address' }] }],
  functionName: 'delegations',
  args: [userAddress]
});
console.log('Delegate:', delegate);
```

### Check USDC Allowance
```javascript
const allowance = await publicClient.readContract({
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
  functionName: 'allowance',
  args: [userAddress, '0x8a311D7048c35985aa31C131B9A13e03a5f7422d'] // TradingStorage
});
console.log('Allowance:', Number(allowance) / 1e6, 'USDC');
```

---

## Success Criteria

- ✅ Scenario 1: New users can set up in one signature
- ✅ Scenario 2: Avantis users only need delegate setup (USDC reused)
- ✅ Scenario 3a: Returning users get instant access
- ✅ Scenario 3b: Mismatches are detected and handled
- ✅ Edge cases handled gracefully
- ✅ No unnecessary transactions sent
- ✅ Clear status messages for each scenario
