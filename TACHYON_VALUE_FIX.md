# Tachyon Value Fix

## Issue Fixed

The transaction value (0.0001 ETH execution fee) was not being passed to the UserOperation. This is now fixed.

## Current Behavior

1. ✅ Transaction value is now passed through correctly
2. ⚠️ **If execution fee > 0, delegate wallet needs ETH**

## Important Decision Needed

You mentioned: **"there is no execution fee on avantis anymore"**

### Option 1: Set Execution Fee to 0 (Recommended if true)

If Avantis doesn't require an execution fee:

```typescript
// frontend/src/lib/avantisEncoder.ts
export const DEFAULT_EXECUTION_FEE = BigInt(0); // No execution fee
```

**Also update backend** (`backend/app/services/avantis.py`):
```python
execution_fee = 0  # No execution fee
```

### Option 2: Keep Execution Fee (If Avantis Still Requires It)

If Avantis still requires 0.0001 ETH:

1. **Delegate wallet needs ETH** - Add back funding step OR
2. **Fund delegate wallet** - User sends 0.0001 ETH to delegate before trading

## Current Status

- ✅ Value is now passed correctly to UserOperation
- ✅ Better error logging if delegate lacks ETH
- ⚠️ Need to decide: execution fee = 0 or keep it?

## Testing

After fixing, try placing a trade and check console logs:

```
[TachyonRelay]   Value: 100000000000000 wei ( 0.0001 ETH)
```

If you see an error about insufficient balance, either:
1. Set execution fee to 0 (if Avantis doesn't need it)
2. Fund the delegate wallet with 0.0001 ETH
