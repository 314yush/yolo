# Tachyon Integration Testing Guide

## Prerequisites

✅ **API Key Added**: Make sure you've added `NEXT_PUBLIC_TACHYON_API_KEY` to `frontend/.env.local`

```bash
# frontend/.env.local
NEXT_PUBLIC_TACHYON_API_KEY=your_api_key_here
```

## Quick Start

1. **Start the dev server**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **Open browser console** (F12 or Cmd+Option+I) - you'll see detailed logs

3. **Check API key is loaded** - Look for this in console:
   ```
   [Tachyon] ✅ API key configured (length: XX)
   ```

## Testing Flow

### Step 1: Verify API Key ✅

When the app loads, check the browser console:

**✅ Success:**
```
[Tachyon] ✅ API key configured (length: 32)
```

**❌ Failure:**
```
[Tachyon] ❌ CRITICAL: No API key found!
[Tachyon] Set NEXT_PUBLIC_TACHYON_API_KEY in your .env.local file
```

**Fix:** Restart dev server after adding API key to `.env.local`

---

### Step 2: Complete Setup Flow (Privy Gas Sponsorship)

1. **Login** with Privy
2. **Complete Setup Flow** (Privy sponsors gas - first signing only):
   - ✅ Create delegate wallet (automatic)
   - ✅ Set delegate (Privy sponsors gas)
   - ✅ Approve USDC (Privy sponsors gas)

**Note:** Setup uses Privy's native gas sponsorship. After setup, Tachyon handles all trade transactions. Users with only USDC (no ETH) can complete setup.

---

### Step 3: First Trade (EIP-7702 Authorization) 🎯

This is the critical test! The first trade will:
1. Sign EIP-7702 authorization
2. Build UserOperation
3. Relay via Tachyon (with authorizationList)
4. Take ~150ms (standard relay, not flash-blocks)

**What to Watch:**

**Console Logs:**
```
[TachyonRelay] ═══════════════════════════════════════
[TachyonRelay] 🚀 Starting Tachyon relay...
[TachyonRelay] 📋 Transaction details:
[TachyonRelay]   Delegate: 0x...
[TachyonRelay]   Needs EIP-7702 auth: true
[TachyonRelay] 🔐 Signing EIP-7702 authorization...
[TachyonRelay] ✅ EIP-7702 authorization signed
[TachyonRelay] 🔧 Building UserOperation...
[TachyonRelay] 📡 Sending to Tachyon relay...
[TachyonRelay]   transactionType: standard (EIP-7702)
[TachyonRelay] ✅ Relay submitted, task ID: ...
[TachyonRelay] ⏳ Waiting for execution (timeout: 30s)...
[TachyonRelay] 🎉 Transaction executed!
[TachyonRelay]   TX Hash: 0x...
[TachyonRelay]   Explorer: https://basescan.org/tx/0x...
[TachyonRelay] ✅ EIP-7702 delegation marked as complete
```

**What to Check:**
- ✅ No errors in console
- ✅ Task ID is returned
- ✅ Transaction hash is returned
- ✅ Link to Basescan works
- ✅ Trade appears in your app

**Common Issues:**

**❌ "Tachyon not configured"**
- API key not loaded - restart dev server

**❌ "Relay failed"**
- Check API key is valid
- Check network (Base mainnet)
- Check Tachyon dashboard for errors

**❌ "Wait for execution failed"**
- Transaction might be stuck
- Check Basescan for transaction status
- Check Tachyon dashboard

---

### Step 4: Subsequent Trades (Flash-blocks) ⚡

After the first trade succeeds, all future trades use flash-blocks (sub-50ms!).

**Console Logs:**
```
[TachyonRelay]   Needs EIP-7702 auth: false
[TachyonRelay] ⚡ Subsequent trade - using flash-blocks for speed!
[TachyonRelay]   transactionType: flash-blocks
[TachyonRelay] ✅ Relay submitted, task ID: ...
[TachyonRelay] 🎉 Transaction executed!
```

**What to Check:**
- ✅ Much faster execution (~50ms vs ~150ms)
- ✅ No authorization step
- ✅ Still gasless!

---

## Debugging Checklist

### If Setup Fails

1. **Check API key is loaded:**
   ```javascript
   // In browser console:
   console.log(process.env.NEXT_PUBLIC_TACHYON_API_KEY)
   // Should show your key (or undefined if not loaded)
   ```

2. **Check delegate wallet exists:**
   ```javascript
   // In browser console:
   localStorage.getItem('yolo_delegate_key')
   // Should show private key (0x...)
   ```

3. **Check delegation status:**
   ```javascript
   // In browser console:
   localStorage.getItem('yolo_delegate_7702_delegated')
   // Should be 'true' after first trade, null before
   ```

### If First Trade Fails

1. **Check EIP-7702 authorization:**
   - Look for `🔐 Signing EIP-7702 authorization...` in logs
   - Should see `✅ EIP-7702 authorization signed`

2. **Check UserOperation building:**
   - Look for `🔧 Building UserOperation...`
   - Should see nonce, gas limits, etc.

3. **Check Tachyon relay:**
   - Look for `📡 Sending to Tachyon relay...`
   - Should see task ID returned

4. **Check execution:**
   - Look for `⏳ Waiting for execution...`
   - Should see transaction hash

### If Subsequent Trades Fail

1. **Check delegation status:**
   ```javascript
   localStorage.getItem('yolo_delegate_7702_delegated')
   // Should be 'true'
   ```

2. **If it's 'null', clear and retry:**
   ```javascript
   localStorage.removeItem('yolo_delegate_7702_delegated')
   // Then try trading again (will re-authorize)
   ```

3. **Check flash-blocks:**
   - Should see `⚡ Subsequent trade - using flash-blocks`
   - Should see `transactionType: flash-blocks`

---

## Testing on Base Sepolia (Recommended First)

Before testing on mainnet, test on Base Sepolia:

1. **Update chain config** in `frontend/src/lib/constants.ts`:
   ```typescript
   export const CHAIN_CONFIG = {
     chainId: 84532, // Base Sepolia
     // ...
   };
   ```

2. **Update delegation contract** (if different on Sepolia):
   ```typescript
   export const ERC4337_DELEGATION_CONTRACT = '0x...' // Sepolia address
   ```

3. **Get testnet ETH** for setup transactions (user still pays for setup)

4. **Test full flow** on Sepolia first

---

## Expected Gas Costs

| Transaction | Who Pays | Cost |
|-------------|----------|------|
| `setDelegate()` | User | ~$0.01-0.10 |
| `approveUSDC()` | User | ~$0.01-0.10 |
| **First trade** | **Tachyon** | **$0 (gasless!)** |
| **All future trades** | **Tachyon** | **$0 (gasless!)** |

**Total user cost:** ~$0.02-0.20 (one-time setup)

---

## Success Criteria ✅

- [ ] API key loads correctly
- [ ] Setup flow completes (user pays for 2 txs)
- [ ] First trade executes gaslessly (~150ms)
- [ ] EIP-7702 delegation is marked complete
- [ ] Subsequent trades use flash-blocks (~50ms)
- [ ] All trades are gasless
- [ ] No errors in console
- [ ] Transactions appear on Basescan

---

## Need Help?

1. **Check console logs** - they're very detailed!
2. **Check Basescan** - verify transactions are on-chain
3. **Check Tachyon dashboard** - see relay status
4. **Clear localStorage** if stuck:
   ```javascript
   localStorage.removeItem('yolo_delegate_7702_delegated')
   ```

---

## Quick Test Script

Run this in browser console after setup:

```javascript
// Check Tachyon config
console.log('API Key:', process.env.NEXT_PUBLIC_TACHYON_API_KEY ? '✅ Set' : '❌ Missing');
console.log('Delegate:', localStorage.getItem('yolo_delegate_address'));
console.log('Delegated:', localStorage.getItem('yolo_delegate_7702_delegated') || 'Not yet');
```
