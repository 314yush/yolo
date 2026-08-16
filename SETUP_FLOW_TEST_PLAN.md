# Setup Flow Test Plan

v2 onboarding is **approve-only**. The user's Privy embedded wallet signs its own EIP-712 intents, so there is no `setDelegate`, no delegate key in `localStorage`, and no second transaction.

Privy sponsors the approve (`sendTransaction(..., { sponsor: true })`). Testers do **not** need ETH in the embedded wallet.

## Pre-Testing Checklist

- [ ] Frontend running against Base mainnet
- [ ] Privy dashboard: embedded wallet confirmation UIs **OFF**; gas sponsorship **ON** for Base
- [ ] `NEXT_PUBLIC_BASE_RPC_URL` set (Alchemy preferred)
- [ ] Test wallets have USDC for Scenario 1 (deposit can be done in-app)
- [ ] Spender under test is **TradingStorage** `0x8a311D7048c35985aa31C131B9A13e03a5f7422d`

## Test Scenarios

### Scenario 1: New wallet (never approved TradingStorage)

**Setup:** Fresh Privy login. Wallet has some USDC. Allowance to TradingStorage is 0.

**Steps:**
1. Sign in (email or OAuth). Privy creates an embedded wallet.
2. Observe: brief "CHECKING SETUP...", then "SETUP REQUIRED".
3. Console: USDC allowance `{ hasSufficient: false, allowance: 0 }`. No "Local delegate wallet" / `setDelegate` logs.
4. Click "ENABLE TRADING".
5. Status: "Approving USDC spending...". **One** Privy-sponsored transaction. No signature modal if confirmation UIs are off.
6. After confirm: setup cached, main app loads.

**Expected:** Single USDC approve to TradingStorage. No delegate write. User still has no ETH.

---

### Scenario 2: Returning user (already approved)

**Setup:** Complete Scenario 1. Refresh or return later with the same wallet.

**Steps:**
1. Sign in.
2. Console: cached setup verified on-chain; `hasSufficient: true`.
3. Setup screen does **not** appear. Main app loads.

**Expected:** Instant access. No transaction.

---

### Scenario 3: Allowance revoked

**Setup:** Previously approved, then allowance set to 0 on-chain.

**Steps:**
1. Sign in.
2. App detects insufficient allowance and shows setup.
3. Enable trading → one sponsored approve.
4. Main app loads.

**Expected:** Re-approval only. No delegate repair flow.

---

### Scenario 4: Partial allowance (below the 10,000 USDC threshold)

**Setup:** Approve e.g. 5,000 USDC to TradingStorage.

**Steps:**
1. Sign in.
2. App treats allowance as insufficient.
3. Enable trading → approve again (app requests 10,000 USDC).

**Expected:** One approve. No second tx.

---

### Scenario 5: Already trading on Avantis (TradingStorage approved, no YOLO cache)

**Setup:** Wallet that approved TradingStorage on Avantis directly. Empty YOLO `localStorage`.

**Steps:**
1. Sign in.
2. On-chain allowance check passes.
3. Setup skipped (or completes with "already approved, nothing to do").

**Expected:** No transaction. Prior Avantis allowance is reused. There is no "replace delegate" warning — YOLO does not register a delegate.

---

## Edge Cases

### Wrong network
User somehow not on Base. App should prompt a switch to Base and not send the approve on another chain.

### Privy confirmation UIs left ON
Every approve (and later every spin) shows a wallet modal. This is a dashboard misconfig, not an app bug. Turn them off.

### Gas sponsorship disabled
Approve fails if the embedded wallet has no ETH. Enable Base sponsorship in Privy.

### No USDC
Setup can still approve. Deposit gate / insufficient-funds UI should block trading until the wallet can meet the $100 min notional at the asset's leverage cap.

---

## Verification

### USDC allowance (TradingStorage)

```javascript
const allowance = await publicClient.readContract({
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
  functionName: 'allowance',
  args: [userAddress, '0x8a311D7048c35985aa31C131B9A13e03a5f7422d'] // TradingStorage
});
console.log('Allowance:', Number(allowance) / 1e6, 'USDC');
```

Do **not** check `Trading.delegations(trader)` as a setup requirement. A leftover v1 delegate is ignored; intents are self-signed.

Confirm `localStorage` has no delegate private key (no `yolo_delegate_*` / similar). Setup cache is `yolo_setup_status_<address>` with `usdcApproved` only.

---

## Success Criteria

- [ ] New users set up with one sponsored USDC approve
- [ ] Returning users with allowance skip setup
- [ ] Revoked / partial allowance re-approves once
- [ ] Existing Avantis TradingStorage allowance is reused
- [ ] No `setDelegate` transaction
- [ ] No delegate key written to `localStorage`
- [ ] No ETH required in the embedded wallet
- [ ] Status copy talks about approving USDC, not "setting up a delegate"
