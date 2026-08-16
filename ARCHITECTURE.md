# YOLO Architecture

Hypercasual leverage trading on Base via Avantis v2. Users spin a wheel; the app opens a zero-fee Upside perp. Gas is paid by the Avantis relayer. Users never hold ETH and never manage a delegate key.

**Repository**: [github.com/314yush/yolo](https://github.com/314yush/yolo)

## Execution path

```
ROLL
  → pick asset / leverage / direction
  → LocalIntentBuilder (in-browser EIP-712, ~1ms)
  → Privy embedded wallet self-signs (silent; showWalletUIs: false)
  → POST https://prod-api.avantisfi.com/batched-market  (gasless register+fill)
  → Base confirmation → PnL screen
```

There is no Tachyon, no Gelato, no pre-built calldata, and no delegate wallet in `localStorage`. Avantis v2 accepts an intent signed by the trader. Every YOLO user has a Privy embedded wallet, so they sign for themselves.

The Python SDK at `sdk.avantisfi.com` and the API-key generator at `delegate.avantisfi.com` are **not** used. Those issue delegate keys; this app does not.

## Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 16 (browser)                    │
│  Privy (email/OAuth + embedded wallet)                      │
│  Picker wheel → PnL + chart                                 │
│  Zustand (trade / live marks / UI)                          │
│                                                             │
│  avantisV2/                                                 │
│    localIntents.ts   build EIP-712 intent                   │
│    privySigner.ts    silent personal_sign / signTypedData   │
│    batchedMarket.ts  submit + wait for fill SSE             │
│    setupTx.ts        USDC approve → TradingStorage          │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
   Avantis feed-v3 + Hermes          batched-market relayer
   core.avantisfi.com (positions)    Base RPC (allowance reads)
                │
                ▼ optional HTTP
┌─────────────────────────────────────────────────────────────┐
│  FastAPI — access codes, activity log, optional SDK reads   │
│  No private keys. Does not build or sign trades.            │
└─────────────────────────────────────────────────────────────┘
```

## Onboarding

One Privy-sponsored transaction: `USDC.approve(TradingStorage, amount)`.

- Spender is **TradingStorage** (`0x8a311D7048c35985aa31C131B9A13e03a5f7422d`), not Trading.
- No `setDelegate`. No EIP-7702. No second signature.
- Returning users with a sufficient allowance skip setup.

## Markets

Upside pairs (formerly “zero-fee perps”) are separate indexes, not a flag on the standard pair. Minimum notional is $100.

| Asset | Upside index | Max leverage |
|-------|--------------|--------------|
| ETH   | 115          | 200x         |
| BTC   | 116          | 250x         |
| SOL   | 117          | 150x         |
| XRP   | 118          | 75x          |
| HYPE  | 119          | 75x          |

Open/close order types are the PnL variants, valid only on these pairs. `pairs.ts` refreshes caps and min notional from `/v2/pairs` at runtime.

## Frontend

| Piece | Role |
|-------|------|
| `lib/avantisV2/localIntents.ts` | `LocalIntentBuilder` — digest + `encodedIntent` |
| `lib/avantisV2/privySigner.ts` | Sign as the embedded wallet |
| `lib/avantisV2/batchedMarket.ts` | Relayer submit + SSE wait |
| `lib/avantisV2/setupTx.ts` | Approve-only onboarding tx |
| `lib/avantisApi.ts` | Positions / history via Avantis REST (proxied) |
| `hooks/useAvantisTradeExecution.ts` | Open/close/flip on the hot path |
| `hooks/useBatchedSetup.ts` | Sponsored USDC approve |
| `hooks/useLivePrices.ts` | feed-v3 SSE, Hermes fallback |
| `store/tradeStore.ts` | Zustand |

Contract reads (USDC allowance) go through viem to Base RPC. Open positions and closed-trade history come from Avantis REST (`core.avantisfi.com`, `api.avantisfi.com`), proxied under `/api/avantis/*`.

## Backend

FastAPI is **not** on the trade path. It serves:

- `/health`
- `/access/*` — invite codes
- `/activity/*` and `/trades/log-*` — fire-and-forget activity
- `GET /trades/{address}`, `GET /trades/{address}/pnl`, `/pairs`, `/price/{pair}` — optional SDK reads

`avantis-trader-sdk` stays pinned `>=0.8.16,<2`. Do not migrate this process to SDK 2.x without a separate task. v1 write builders (`openTrade` / `delegatedAction`) were removed; they revert on v2.

## Data flow

1. User taps ROLL. Outcome is chosen immediately; the wheel is animation only.
2. `LocalIntentBuilder.openTrade` (or close) produces `digest` + `encodedIntent`.
3. Privy signs. `embeddedWallets.showWalletUIs` must be `false` or every spin shows a modal.
4. Relayer accepts the signed intent, pays gas, and emits fill over SSE.
5. Live marks update PnL; chart collector aggregates 1-second ticks into 1-minute bars.

## Design choices

- **Self-sign, no delegate** — embedded wallets already can sign; a stored delegate key was a footgun (device switch, expiry, leaked localStorage).
- **Local intents** — documented MM fast path; also avoids geo-restricted tx-builder writes.
- **Relayer gas** — removes ETH from the user story. Privy sponsorship covers only the one-time approve.
- **Rigged wheel** — hides Base’s ~2s block time behind the spin.

## Verification

```bash
cd frontend
npm run verify:vectors   # golden-vectors.json vs LocalIntentBuilder
npm run verify:v2        # live tx-builder digest + pair catalog
npm run probe:selfsign   # relayer accepts self-sign, rejects third-party
```

## Versions

- Next.js 16.1.4 · React 19.2.3 · TypeScript 5 · Tailwind 4
- Privy 3.15 · wagmi 3.3.4 · viem 2.44.4 · Zustand 5.0.10
- FastAPI 0.109+ · avantis-trader-sdk `>=0.8.16,<2`
