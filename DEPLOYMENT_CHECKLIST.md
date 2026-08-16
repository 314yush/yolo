# Quick Deployment Checklist

## Backend (Railway) ✅

- [ ] Sign up/login to Railway.app
- [ ] Create new project from GitHub repo
- [ ] Set root directory to `backend`
- [ ] Add environment variables:
  - [ ] `BASE_RPC_URL` (your Alchemy RPC URL)
  - [ ] `CORS_ORIGINS` (will update after frontend deploy)
  - [ ] `DEBUG=false`
- [ ] Deploy and get Railway URL
- [ ] Test health endpoint: `https://your-url.up.railway.app/health`

## Frontend (Vercel) ✅

- [ ] Sign up/login to Vercel
- [ ] Import GitHub repository
- [ ] Set root directory to `frontend`
- [ ] Add environment variables:
  - [ ] `NEXT_PUBLIC_BASE_RPC_URL` (your Alchemy RPC URL)
  - [ ] `BACKEND_URL` (your Railway backend URL, e.g. https://your-app.up.railway.app)
- [ ] Deploy and get Vercel URL
- [ ] Test frontend loads correctly

## Final Steps ✅

- [ ] Update Railway `CORS_ORIGINS` with Vercel URL
- [ ] Verify frontend can connect to backend
- [ ] Test full application flow
- [ ] Monitor logs for any errors

## V2 launch (do this before prod)

Avantis v2 is live. Trades are local EIP-712 intents, self-signed by the Privy embedded wallet, and submitted to the batched-market relayer. There is no Tachyon and no delegate key.

- [ ] Privy dashboard: **turn OFF** embedded wallet confirmation / wallet UIs (silent signing)
- [ ] Privy dashboard: **enable gas sponsorship on Base** (one-time USDC approve)
- [ ] No `TACHYON_*` (or any Tachyon) env var on Vercel / Railway
- [ ] No Avantis API key / delegate key env var — do not point the app at `sdk.avantisfi.com` or `delegate.avantisfi.com`
- [ ] USDC spender is **TradingStorage** `0x8a311D7048c35985aa31C131B9A13e03a5f7422d` (not Trading)
- [ ] `NEXT_PUBLIC_BASE_RPC_URL` is an Alchemy (or equivalent) Base URL — not the public RPC
- [ ] From `frontend/`: `npm run verify:vectors` passes
- [ ] From `frontend/`: `npm run verify:v2` passes against live tx-builder + pair catalog
- [ ] Optional: `npm run probe:selfsign` — self-sign reaches execution; third-party sig is rejected

## Quick Commands Reference

### Test Backend Locally
```bash
cd backend
pip install -r requirements.txt
export BASE_RPC_URL="your-rpc-url"
uvicorn app.main:app --reload
```

### Test Frontend Locally
```bash
cd frontend
npm install
export NEXT_PUBLIC_BASE_RPC_URL="your-rpc-url"
export BACKEND_URL="http://localhost:8000"
npm run dev
```
