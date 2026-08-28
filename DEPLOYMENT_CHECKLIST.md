# Production Deployment Checklist

Frontend → Vercel. Backend → Railway. Wallets + gas sponsorship → Privy.

Config now **fails closed**: the backend refuses to start in production if it is
misconfigured, rather than degrading into an open or permissive mode. A failed
boot is the expected, correct behaviour — read the error, don't work around it.

---

## 1. Privy dashboard (do this first — it is not enforced by code)

- [ ] **Gas sponsorship enabled on Base (8453)** and the sponsorship wallet is funded.
- [ ] **Set a sponsorship budget cap.** Approvals now fire automatically for anyone
      who reaches the deposit screen, so the cap is your backstop against scripted
      signups draining the wallet.
- [ ] **Embedded wallets → confirmation modals / wallet UIs OFF** (`showWalletUIs: false`).
      Without this, every spin raises a modal and the silent approval breaks.
- [ ] Login methods enabled: email, Google, X.

> A USDC approve on Base costs ~0.00000028 ETH (~$0.0008). Ten thousand users is
> roughly $8–11. If sponsorship lapses or runs dry, users hit a wall needing ETH.

## 2. Railway (backend)

Required — the app will not boot without these:

- [ ] `BASE_RPC_URL` — Alchemy/Base RPC. Must be a valid http(s) URL.
- [ ] `DATABASE_URL` — Postgres. Must start with `postgres://` or `postgresql://`.
      A malformed value is now a hard startup error, not a silent downgrade.
- [ ] `ENVIRONMENT=production` — this is the default; set it explicitly anyway.

Optional:

- [ ] `CORS_ORIGINS` — defaults to `https://tradeyolo.fun` + `https://www.tradeyolo.fun`.
      Set explicitly only if you serve additional origins. `*` is rejected in production.
- [ ] Rate-limit tuning: `RATE_LIMIT_DEFAULT` (240/min), `RATE_LIMIT_WRITE` (30/min),
      `WALLET_RATE_LIMIT_MAX` (60), `WALLET_RATE_LIMIT_WINDOW_SECONDS` (60),
      `MAX_REQUEST_BODY_BYTES` (16384).

Must be absent or false:

- [ ] `DEBUG` — `true` blocks the boot in production (it would expose `/docs`).
- [ ] `ADMIN_API_KEY` — **delete it**, no longer read. The admin router is gone.

## 3. Vercel (frontend)

- [ ] `NEXT_PUBLIC_PRIVY_APP_ID`
- [ ] `NEXT_PUBLIC_BASE_RPC_URL`
- [ ] `BACKEND_URL` — your Railway URL, **not** the frontend URL. In production the
      proxy returns 503 rather than silently falling back to localhost.
- [ ] `NEXT_PUBLIC_SITE_URL` — defaults to `https://www.tradeyolo.fun`. Drives OG/Twitter
      card URLs; a wrong value breaks every social share preview.
- [ ] Confirm `NEXT_PUBLIC_BYPASS_ACCESS_CODE` is **not set anywhere** — the access-code
      system is deleted and the variable is dead.

## 4. Post-deploy verification

- [ ] `GET /health` → 200.
- [ ] `GET /docs` → 404 (confirms `DEBUG=false`).
- [ ] `GET /access/check/x` and `GET /admin/codes` → 404 (confirms removal).
- [ ] CORS preflight from an unknown origin is rejected; from your real domain, allowed.
- [ ] Railway startup log shows the RPC host **without** the Alchemy key.
- [ ] Proxy: `/api/backend/admin/...` → 404 regardless of headers.
- [ ] End-to-end on a fresh wallet: sign up → deposit → ROLL with **no approval screen,
      no wallet modal, and no ETH in the wallet**. Confirm the approve tx appears on
      BaseScan paid by the Privy sponsor.
- [ ] Open a position, then close it — closing must work even if `setupStatus` is cleared
      from localStorage first.
- [ ] Watch CSP violation reports for a few days, then flip `Content-Security-Policy-Report-Only`
      to enforcing in `next.config.ts`.

## 5. Known follow-ups (not blockers)

- Rate limiting is in-memory: it resets on redeploy and does not hold across multiple
  instances. Move to Redis if you scale past one Railway instance.
- `/trades/*`, `/pairs`, `/price/*` are unauthenticated and proxy to Alchemy. They sit
  behind the default limit, but watch your Alchemy bill for amplification.
- The legacy `access_codes` table still holds wallet addresses. Dropping it is a separate,
  deliberate migration.
- `docs.tradeyolo.fun` (linked from the landing page) currently returns 404 — publish docs
  there or remove the link.
- `avantis_service.get_trades` returns `[]` on upstream failure, so an Avantis outage is
  indistinguishable from "no positions".
