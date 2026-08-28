# Avantis v2 client (YOLO)

Intent-based trading against Avantis v2, live on Base since 2026-08-12. This is
the only path: the v1 write path reverts against the upgraded contracts, so it
has been removed rather than left behind a flag.

## Flow

1. Bootstrap addresses from `GET /v2/meta` and the pair catalog from
   `GET /v2/pairs` (proxied at `/api/avantis/v2/*`, warmed on app mount)
2. Build EIP-712 intents locally (`LocalIntentBuilder`) — digests match on-chain golden vectors
3. Sign with the user's **own** Privy embedded wallet (`privySigner.ts`)
4. Submit to batched-market `POST /market/execute-batched` and wait for fill SSE
5. Onboarding is a single Privy-sponsored USDC approve, fired automatically in
   the background on the deposit screen — the user never sees or pays for it
   (`useUsdcApproval` in `hooks/useBatchedSetup.ts`)

## No delegate

v2 accepts an intent signed by the trader **or** by a registered delegate, and
rejects anything else with `Signature recovered to 0x…, which is neither the
trader nor an approved delegate`. Since YOLO authenticates with email/OAuth
only, every user has a Privy embedded wallet and can sign for themselves.

So there is no delegate: no generated key in `localStorage`, no `setDelegate`
transaction, no one-year expiry to renew, and nothing to re-register when a user
switches device or clears storage. `embeddedWallets.showWalletUIs: false` in
`providers.tsx` keeps signing silent — without it every spin raises a modal.

## Upside markets

What v1 called zero-fee perps (ZFP) are Upside markets in v2, and they are
**separate pairs**, not a flag: `ETH_UPSIDE/USD` (115) trades alongside
`ETH/USD` (0) on the same price feed, with no open/close fee and a tiered
profit share on gains instead.

| Asset | Upside index | Standard index | Max leverage (Upside) |
|-------|--------------|----------------|-----------------------|
| ETH   | 115          | 0              | 200x |
| BTC   | 116          | 1              | 250x |
| SOL   | 117          | 2              | 150x |
| XRP   | 118          | 59             | 75x  |
| HYPE  | 119          | 62             | 75x  |

Consequences the code has to respect:

- **The pair picks the order type.** `MARKET_OPEN_PNL` (6) / `MARKET_CLOSE_PNL`
  (7) are only valid on Upside pairs; the contract rejects a mismatch. See
  `isPnlPair()` in `pairs.ts`.
- **Closes follow the position, not the pair.** A position carried over from v1
  can be a PnL trade on a pair that is no longer PnL-capable, so the close order
  type comes from the position's own `isPnl` flag where we have it.
- **Leverage caps dropped.** v1 allowed 500x on ETH/BTC/SOL; Upside tops out at
  200x / 250x / 150x. `ASSETS[].maxLeverage` tracks the pair's `pnlMaxLeverage`.
- **No Upside listing for forex or commodities.** Those route as standard
  fee-paying perps at much lower caps.
- **Minimum notional is per-pair**: $100 crypto, $300 forex/commodities.

`pairs.ts` refreshes all of this from `/v2/pairs` at runtime; the hardcoded
values are only a fallback.

## Why local intents?

Local intent building is the documented MM fast path — no build round-trip
before submission. It also sidesteps the tx-builder write endpoints, which were
geo-restricted in the US during the v2 rollout.

## Env

No Avantis-specific env vars. Base mainnet is the only target, so there is no
enable flag and no testnet switch — the chain id, contract addresses and the
wagmi/Privy chain are all 8453, and moving only the API hosts would sign a
mainnet domain against testnet contracts.

## Verifying

`npx tsx scripts/verify-v2-live.ts` diffs the local intent builder against the
live tx-builder (digest + `encodedIntent` must match byte for byte) and checks
every wheel asset against the live catalog: listed, correct leverage cap, and a
reachable minimum notional at the default collateral.

`npx tsx scripts/probe-selfsign.ts` re-confirms the no-delegate assumption
against the live relayer: a self-signed intent must reach on-chain execution
(failing only on allowance), while a third-party signature must be rejected.
