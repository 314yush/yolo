# Avantis v2 client (YOLO)

Intent-based trading against Avantis v2. Enabled with `NEXT_PUBLIC_AVANTIS_V2=true`.

## Flow

1. Bootstrap addresses from `GET /v2/meta` (proxied at `/api/avantis/v2/meta`)
2. Build EIP-712 intents locally (`LocalIntentBuilder`) — digests match on-chain golden vectors
3. Sign with the per-user delegate key
4. Submit to batched-market `POST /market/execute-batched` and wait for fill SSE
5. Onboarding still uses Privy-sponsored `setDelegate(delegate, expiry)` + USDC approve

## Why local intents?

Tx-builder **write** endpoints are geo-restricted in the US. Meta/delegation reads and batched-market submission are not. Local intent building is also the documented MM fast path (no build RTT).

## Env

| Variable | Values | Notes |
|----------|--------|-------|
| `NEXT_PUBLIC_AVANTIS_V2` | `true` / unset | Feature flag; unset keeps v1 Tachyon+encoder path |
| `NEXT_PUBLIC_AVANTIS_NETWORK` | `testnet` / `mainnet` | Defaults to testnet when v2 is on |

## Cutover (Aug 12, 2026)

1. Dry-run on testnet with `AVANTIS_V2=true` + `NETWORK=testnet`
2. On unpause: set `NETWORK=mainnet` and ship
3. Positions / USDC approvals carry over (proxy upgrade)
