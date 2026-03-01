# Analytics DB Scope: Trades, Volumes, Users

**Status:** Scoped (not implemented)  
**Purpose:** Own bookkeeping and analytics for YOLO trades; PnL per trade still comes from Avantis API.

---

## 1. Why We Need It

| Current State | With Analytics DB |
|---------------|-------------------|
| Trades, volume, stats live in **localStorage** (per device, can be cleared) | Persistent, cross-device, server-side truth |
| No leaderboards or global rankings | Volume leaderboards, top traders, retention metrics |
| No aggregate analytics for product decisions | DAU/MAU, volume trends, session depth, funnel analytics |
| Closed trades blend localStorage + Avantis API (inconsistent sources) | One canonical record per trade; Avantis API for live PnL only |
| Hard to reconcile or audit | Audit trail with tx hashes; can verify against chain/Avantis |

---

## 2. What We'd Store

### 2.1 Core Entities

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **users** | Wallet-first user identity | `wallet_address` (PK), `first_seen_at`, `last_active_at`, `total_trades`, `total_volume`, `chain_id` |
| **trades** | Every open/close event we observe | `user_wallet`, `pair_index`, `pair_name`, `trade_index`, `collateral`, `leverage`, `is_long`, `open_price`, `opened_at`, `open_tx_hash`, `closed_at`, `close_tx_hash`, `close_price`, `final_pnl`, `final_pnl_pct`, `is_liquidated`, `chain_id` |
| **daily_aggregates** (optional) | Pre-computed for fast dashboards | `date`, `user_wallet`, `trades_count`, `volume`, `pnl`, `unique_users` |

### 2.2 Trade Lifecycle

- **Open**: Record when a trade is successfully relayed (we have txHash, trade params from wheel).
- **Close**: Record when user closes/flips or we detect liquidation. **PnL comes from Avantis API** at close time—we store the final values we get.
- **Liquidation**: Same as close; we mark `is_liquidated = true`.

### 2.3 What We Do NOT Store

- Real-time PnL for open positions → always from Avantis API (or Pyth + calculation).
- Delegate private keys or sensitive wallet data.
- Raw price history (Pyth/chart) beyond `open_price`, `close_price` on trades.

---

## 3. Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (existing flow)                                            │
│                                                                      │
│  Open:  wheel roll → build tx → relay → txHash ✓                     │
│         → POST /api/analytics/trade-opened {...}  (new, fire-and-forget)
│                                                                      │
│  Close: user closes / flips → txHash ✓                               │
│         → get PnL from Avantis (existing)                             │
│         → POST /api/analytics/trade-closed {...}  (new, includes PnL)│
│                                                                      │
│  Liquidation: usePnL detects → saveClosedTrade (existing)            │
│         → POST /api/analytics/trade-closed {...}  (new, isLiquidated)  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND (PostgreSQL - existing)                                     │
│                                                                      │
│  - Upsert user on first trade                                        │
│  - Insert trade on open; update on close                             │
│  - Increment user aggregates (total_trades, total_volume)            │
│  - Optional: daily aggregation job                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. How We'd Use It

### 4.1 Product & Growth

- **Leaderboards**: Top volume, most trades, biggest single PnL (opt-in if needed).
- **Onboarding funnel**: First trade within 24h, 7d retention.
- **Session depth**: Trades per session, avg. volume per user.
- **Asset / leverage popularity**: What pairs and leverage users actually choose.

### 4.2 Operations & Support

- **Audit**: "Show me all trades for wallet X" with tx hashes for chain verification.
- **Reconciliation**: Compare our DB vs Avantis API / chain for missing or mismatched closes.
- **Support**: User reports issue → look up their trade history and tx hashes.

### 4.3 Analytics & Reporting

- **Volume metrics**: Total platform volume, volume over time, by asset.
- **User metrics**: DAU, MAU, new vs returning, churn.
- **Trade metrics**: Open rate, close rate, flip rate, liquidation rate.
- **PnL distribution**: Aggregate PnL, win rate, median PnL per user (for internal analysis).

### 4.4 Future Features

- Public leaderboard page.
- Per-user stats (e.g. total volume, total PnL) synced from DB instead of localStorage.
- Email/discord digests: "You did X volume this week".
- Referral / campaign attribution if we add UTM or referral codes.

---

## 5. API Surface (Proposed)

| Endpoint | Method | When Called | Purpose |
|----------|--------|-------------|---------|
| `/api/analytics/trade-opened` | POST | After relay success, from frontend | Record new trade |
| `/api/analytics/trade-closed` | POST | After close/flip/liquidation, from frontend | Record close + PnL from Avantis |
| `/api/analytics/user/:wallet` | GET | User profile, activity page | User's trade history + aggregates |
| `/api/analytics/leaderboard` | GET | Leaderboard page | Top users by volume, trades, etc. |
| `/api/analytics/stats` | GET | Admin / internal | Platform-wide aggregates |
| `/api/analytics/me` | GET | Settings / profile | Current user's stats (replacing localStorage for cross-device) |

All write endpoints should be **idempotent** (e.g. upsert by `user_wallet + pair_index + trade_index + open_tx_hash`) to handle retries and duplicates.

---

## 6. Schema Sketch (PostgreSQL)

```sql
-- Extends existing backend DB (same DATABASE_URL)

CREATE TABLE analytics_users (
  wallet_address VARCHAR(42) PRIMARY KEY,
  chain_id INT NOT NULL DEFAULT 8453,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_trades INT NOT NULL DEFAULT 0,
  total_volume NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_pnl NUMERIC(20,4) DEFAULT NULL  -- optional, summed from closed trades
);

CREATE TABLE analytics_trades (
  id BIGSERIAL PRIMARY KEY,
  user_wallet VARCHAR(42) NOT NULL REFERENCES analytics_users(wallet_address),
  chain_id INT NOT NULL DEFAULT 8453,
  pair_index INT NOT NULL,
  pair_name VARCHAR(32) NOT NULL,
  trade_index INT NOT NULL,
  collateral NUMERIC(20,4) NOT NULL,
  leverage NUMERIC(10,2) NOT NULL,
  is_long BOOLEAN NOT NULL,
  open_price NUMERIC(24,10) NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  open_tx_hash VARCHAR(66),
  closed_at TIMESTAMPTZ,
  close_tx_hash VARCHAR(66),
  close_price NUMERIC(24,10),
  final_pnl NUMERIC(20,4),
  final_pnl_pct NUMERIC(10,2),
  is_liquidated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_wallet, chain_id, pair_index, trade_index)
);

CREATE INDEX idx_analytics_trades_user ON analytics_trades(user_wallet);
CREATE INDEX idx_analytics_trades_opened_at ON analytics_trades(opened_at);
CREATE INDEX idx_analytics_trades_closed_at ON analytics_trades(closed_at) WHERE closed_at IS NOT NULL;
```

---

## 7. Integration Points in Codebase

| Location | Change |
|----------|--------|
| `useTxSigner` / `relayService.relayTrade` success | After txHash received, call `POST /api/analytics/trade-opened` with trade params |
| `page.tsx` close handler, `useFlipTrade` close path, `activity/page.tsx` close | After close txHash + PnL from Avantis, call `POST /api/analytics/trade-closed` |
| `usePnL` liquidation detection | When `saveClosedTrade(..., { isLiquidated: true })`, also call `POST /api/analytics/trade-closed` |
| `tradeStore` / `loadStats` | Optional: fetch `/api/analytics/me` instead of localStorage for totalTrades, totalVolume when DB is source of truth |
| New `/api/analytics/*` route handlers | Next.js API routes or proxy to FastAPI backend |

---

## 8. Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Fire-and-forget writes from frontend** | No blocking; user UX unchanged. Retries can be added later. |
| **Upsert by (user, pair_index, trade_index)** | Matches Avantis indexing; avoids duplicates from retries. |
| **PnL from Avantis at close time** | Single source of truth; we don't recompute. |
| **Separate `analytics_` prefix** | Keeps tables distinct from `access_codes`; easier to reason about. |
| **Optional daily aggregates** | Can add later if dashboard queries get slow. |
| **Chain ID on trades** | Future-proof for multi-chain. |

---

## 9. Out of Scope (For Now)

- Block or indexer-based backfill of historical trades.
- Real-time streaming / websockets for analytics.
- GDPR/data deletion flows (can add when needed).
- Per-trade fee tracking (unless Avantis exposes it clearly).

---

## 10. Implementation Phases (Suggested)

1. **Phase 1**: Schema + `trade-opened` / `trade-closed` API + frontend hooks. No UI changes.
2. **Phase 2**: `/api/analytics/user/:wallet` and `/api/analytics/me` for user stats.
3. **Phase 3**: Leaderboard API + optional public leaderboard page.
4. **Phase 4**: Admin dashboard, daily aggregates, reporting.

---

*Last updated: 2025-02*
