# Investigation: Traders Unable to See Closed Trades on Prod

## Data Flow Summary

Closed trades are loaded from **three sources** (merged, deduped by `pairIndex-tradeIndex`):

| Source | API | When Used |
|--------|-----|-----------|
| **Activity API** (primary) | `GET /api/backend/activity/trades?wallet=...&limit=50&offset=0` | Backend DB - trades we logged via log-open / log-close-by-position |
| **Avantis API** (fallback) | `GET https://api.avantisfi.com/v2/history/portfolio/history/{address}/1` | Direct browser fetch to Avantis |
| **localStorage** | `yolo_closed_trades_{address}` | Client-side cache from saveClosedTrade() |

## Root Cause Hypotheses

### 1. Backend Unreachable (High likelihood)

- Activity API goes through `/api/backend` → `BACKEND_URL` (Railway in prod)
- `/api/proxy-status` returned **503** when tested
- **If backend is down or BACKEND_URL is wrong**: `getActivityTrades()` returns `null` → no closed trades from our DB
- **Check**: Visit `https://[your-frontend]/api/proxy-status` on prod. Verify `healthOk: true` and `backendUrlConfigured: true`

### 2. log-open Never Ran or Failed (Medium likelihood)

- `log-close-by-position` looks up trades by `wallet + pair_index + trade_index` where `status = 'open'`
- If `logTradeOpen()` never succeeded (network error, backend down, race), the trade won't exist → log-close returns **404**
- `logTradeOpen` is called from `useOpenTrades` only when `popPendingOpenTxHash()` returns a tx hash (confirmation flow)
- **Race**: User could close a trade before we've logged the open (e.g. very fast close after TP hit)

### 3. Avantis History API CORS (Medium likelihood)

- `fetchClosedTrades` runs **in the browser** and fetches directly from `api.avantisfi.com`
- `core.avantisfi.com` is documented as CORS-whitelisted for tradeyolo.fun; `api.avantisfi.com` may not be
- If CORS blocks the request, `fetchClosedTrades` throws → we catch and return `[]` (silent failure)
- **Check**: Open DevTools → Network on Activity page. Look for request to `api.avantisfi.com`. Check for CORS error in console.

### 4. Wrong Wallet Address (Low likelihood)

- We use `userAddress` (Privy trader) everywhere. Avantis positions are keyed by trader.
- Backend lowercases: `wallet = request.wallet.lower()`. Should match.

### 5. Activity DB Empty for New Users

- If the backend was recently deployed or DB was reset, there are no historic trades.
- Avantis API would still return closed trades (they have the history). So this only matters if Avantis also fails.

---

## Recommended Debugging Steps

### Step 1: Verify backend connectivity

```bash
# From your machine (or use curl in browser console on prod)
curl -s https://[YOUR-PROD-URL]/api/proxy-status
```

Expected: `healthOk: true`, `backendUrlConfigured: true`. If not, fix `BACKEND_URL` on Vercel.

### Step 2: Test Activity API directly

From browser console on prod (while logged in):

```javascript
const addr = '0x...'; // your wallet
const r = await fetch(`/api/backend/activity/trades?wallet=${addr}&limit=10&offset=0`);
console.log(await r.json());
```

- 200 + `trades` array → Activity API works
- 502 / timeout → backend unreachable
- 200 + empty `trades` → no trades in our DB (log-open may be failing)

### Step 3: Test Avantis history API (CORS check)

From browser console on prod:

```javascript
const addr = '0x...'; // your wallet
const url = `https://api.avantisfi.com/v2/history/portfolio/history/${addr}/1`;
try {
  const r = await fetch(url);
  console.log('Status:', r.status, await r.json());
} catch (e) {
  console.error('CORS or network error:', e);
}
```

- CORS error in console → Avantis history API blocks our origin. Need to proxy through backend.
- 200 + `portfolio` → Avantis works.

### Step 4: Check log-open / log-close success

- Add temporary logging in `logTradeOpen` and `logTradeCloseByPosition` (activityApi.ts) to log response status
- Or inspect backend logs for 404s on `log-close-by-position` (means open was never logged)

---

## Potential Fixes

### Fix A: Proxy Avantis history through backend (if CORS blocks)

- Add backend route: `GET /proxy/avantis-history/{address}/{page}`
- Backend fetches from `api.avantisfi.com` server-side (no CORS)
- Frontend calls `/api/backend/proxy/avantis-history/...` instead of direct Avantis URL

### Fix B: Ensure log-open before close

- Consider logging open earlier (e.g. when tx is submitted, not when confirmed)
- Or make log-close-by-position upsert: if trade not found, insert closed trade (needs schema support)

### Fix C: Improve fallback behavior

- When Activity API returns null, show clearer message: "Activity data unavailable. Closed trades from Avantis may not load."
- Ensure Avantis fallback is actually used (currently it is; verify it's not failing silently)

---

## Files to Review

| File | Purpose |
|------|---------|
| `frontend/src/lib/activityApi.ts` | getActivityTrades, logTradeOpen, logTradeCloseByPosition |
| `frontend/src/app/activity/page.tsx` | loadAllClosedTrades – merges Activity + Avantis + localStorage |
| `frontend/src/lib/avantisApi.ts` | fetchClosedTrades – direct call to api.avantisfi.com |
| `frontend/src/app/api/backend/[...path]/route.ts` | Proxies to BACKEND_URL |
| `frontend/src/app/api/proxy-status/route.ts` | Diagnostic for backend connectivity |
| `backend/app/routers/activity.py` | log-open, log-close-by-position, GET /activity/trades |
