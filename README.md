# YOLO - Hypercasual Leverage Trading Mini-App

Spin the wheel, open a trade. Zero-fee perpetuals on Base.

## Overview

YOLO is a hypercasual trading app where users spin a wheel to randomly select:
- **Asset**: BTC, ETH, SOL, XRP, HYPE — all Avantis Upside markets (pair indexes 115–119)
- **Leverage**: fixed per asset at that market's cap (BTC 250x, ETH 200x, SOL 150x, XRP/HYPE 75x)
- **Direction**: LONG or SHORT

Minimum notional is **$100**. The trade executes automatically with zero opening fees on Avantis v2. Gas is paid by the Avantis batched-market relayer, so users never hold ETH.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Privy Auth  │  │ Picker Wheel│  │ PnL Screen              │
│  │ (email +    │  │ (SVG +      │  │ (Real-time updates)     │
│  │  OAuth)     │  │  Animation) │  │ Price Chart             │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        Privy embedded wallet (no delegate key)            │  │
│  │   Signs an EIP-712 intent per trade, silently (~1ms)      │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │      Avantis batched-market relayer (gasless)             │  │
│  │   https://prod-api.avantisfi.com/batched-market           │  │
│  │   Registers + fills the order in one Base transaction     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ access / activity (optional)
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Python)                  │
│  Access codes, activity logging, optional price/trade reads     │
│  No private keys. Does not build or sign trades.                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Base Chain    │
                    │ Avantis Protocol│
                    └─────────────────┘
```

Trades never go through the backend. The frontend builds the EIP-712 intent locally (`LocalIntentBuilder`), the Privy embedded wallet self-signs it, and the batched-market relayer submits it on Base. There is no Tachyon, no Gelato, and no delegate key.

YOLO does **not** use the Avantis Python SDK 2.x on the frontend, and does not call `sdk.avantisfi.com` or `delegate.avantisfi.com`. Those hosts generate API keys (delegate keys); this app signs as the trader.

## Tech Stack

### Frontend
- **Next.js 16.1.4** (App Router, React Server Components)
- **React 19.2.3** + **TypeScript 5**
- **Tailwind CSS 4** (PostCSS)
- **Privy 3.15** (authentication + embedded wallets; email and OAuth only)
- **wagmi 3.3.4** + **viem 2.44.4** (Web3)
- **Zustand 5.0.10** (state management)
- **lightweight-charts 5.1.0** (price charts with area series)
- **Howler.js 2.2.4** (sound effects)
- **Framer Motion 12.27.5** (animations)
- **Pusher** (real-time price updates)
- **PostHog** (analytics)

### Backend
- **FastAPI 0.109+** (Python web framework)
- **Avantis Trader SDK 0.8.16+** (read-only: pairs, trades, PnL — pinned `<2`)
- **Uvicorn** (ASGI server)

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- Privy App ID ([Get one here](https://privy.io))

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your Privy App ID and Alchemy Base RPC URL
npm run dev
```

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Environment Variables

### Frontend (.env.local)
```bash
# Privy Authentication
# Dashboard requirements (trades break without these):
#   1. Turn OFF embedded wallet confirmation UIs (silent EIP-712 signing)
#   2. Enable gas sponsorship on Base (one-time USDC approve is sponsored)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# API Configuration (used by /api/backend proxy)
BACKEND_URL=http://localhost:8000

# Blockchain RPC — required in production. Alchemy preferred.
# Public Base RPC (https://mainnet.base.org) is a last-resort fallback.
NEXT_PUBLIC_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
```

There is no `TACHYON` key and no Avantis API key. Signing is the user's own embedded wallet.

### Backend (.env)
```bash
# Blockchain RPC
BASE_RPC_URL=https://mainnet.base.org

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,https://your-domain.vercel.app

# Debug Mode
DEBUG=true
```

## How It Works

### One-Time Setup
1. User signs in with email or OAuth; Privy creates an embedded wallet
2. User deposits USDC
3. User approves USDC to Avantis **TradingStorage** — one Privy-sponsored transaction

That is the whole setup. There is no delegate key and no `setDelegate`: Avantis v2 accepts an intent signed by the trader, and every user has an embedded wallet that can sign for itself.

### Trading Flow
1. User taps ROLL
2. **Immediately**: Select random asset/leverage/direction
3. **Immediately**: Build the EIP-712 intent locally and sign it with the embedded wallet (~1ms)
4. Submit to the Avantis batched-market relayer while the wheel animates
5. Relayer registers and fills the order in a single Base transaction
6. Trade confirms → Show PnL screen
7. PnL updates in real-time via live marks (Avantis feed-v3 + Hermes fallback)
8. Price chart displays with Entry/LIQ labels

### Key Innovations
- **Rigged Wheel Animation**: Pre-selects outcome and fires trade immediately. The wheel animates to land on that selection, hiding blockchain latency.
- **Local intent building**: Intents are built and signed in-browser in under a millisecond, skipping a ~120ms round-trip to the tx-builder.
- **Gasless by default**: The Avantis relayer pays gas and settles registration plus fill atomically, so tap-to-fill is dominated by Base's 2s block time.
- **Progressive Chart Loading**: Charts load with 10 data points initially, then enhance to 30 for faster perceived performance.

## API Endpoints

Backend is access codes + activity + optional reads. It does not build trades.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/access/check/{wallet}` | GET | Whether the wallet has redeemed an access code |
| `/access/redeem` | POST | Redeem an access code |
| `/activity/stats` | GET | Per-wallet activity stats |
| `/activity/trades` | GET | Logged trade history |
| `/activity/onboarding-status` | GET | Onboarding flag |
| `/activity/onboarding-complete` | POST | Mark onboarding done |
| `/trades/log-open` | POST | Fire-and-forget open-trade log |
| `/trades/log-close-by-position` | POST | Fire-and-forget close-trade log |
| `/trades/{address}` | GET | Open trades (SDK read, optional) |
| `/trades/{address}/pnl` | GET | PnL for open positions (optional) |
| `/pairs` | GET | Available trading pairs (optional) |
| `/price/{pair}` | GET | Current price (optional) |

## Key Features

### Chart System
- **Area Chart with Gradient**: Visual price movement with gradient fill
- **Entry/LIQ Labels**: Built-in chart labels showing entry and liquidation prices
- **Real-time Updates**: Chart updates every second with latest price data
- **Progressive Loading**: Renders with 10 points initially, then enhances to 30
- **1-minute Resolution**: Aggregated from 1-second tick data

### Execution
- **Local EIP-712 intents**: Built in-browser via `LocalIntentBuilder`
- **Silent self-sign**: Privy embedded wallet, no confirmation modal
- **Batched-market relayer**: Gasless register+fill on Base
- **No delegate**: trader signature only

### State Management
- **Zustand Store**: Centralized trade state, prices, and UI state
- **Real-time Price Sync**: Live marks (Avantis SSE + Hermes fallback) into Zustand
- **Chart Data Collector**: Background collection of 1-second tick data

## Deployment

### Frontend (Vercel)
```bash
vercel --prod
```

### Backend (Railway/Render)
```bash
docker build -t yolo-api .
docker run -p 8000:8000 yolo-api
```

See `DEPLOYMENT_CHECKLIST.md` for the v2 launch checklist (Privy silent signing + Base gas sponsorship, TradingStorage spender, `verify:vectors` / `verify:v2`).

## Security Notes

- **No backend signing**: Backend never holds private keys and does not build trade transactions
- **No delegate key**: The user's Privy embedded wallet signs its own intents
- **USDC approval**: User explicitly approves spending to **TradingStorage** (not Trading)
- **Gas**: Relayer pays trade gas; Privy sponsors the one-time approve. Users never need ETH

## Project Structure

```
yolo/
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js app router pages
│   │   │   ├── page.tsx     # Main trading interface
│   │   │   ├── activity/    # Trade history page
│   │   │   ├── settings/    # Settings page
│   │   │   └── api/         # Proxies (Avantis v2 meta/pairs, backend, user-data)
│   │   ├── components/      # React components
│   │   │   ├── PickerWheel.tsx
│   │   │   ├── PnLScreen.tsx
│   │   │   ├── PriceChart.tsx
│   │   │   └── SetupFlow.tsx
│   │   ├── hooks/           # Custom React hooks
│   │   │   ├── useAvantisTradeExecution.ts
│   │   │   ├── useBatchedSetup.ts   # One-time USDC approve
│   │   │   └── useLivePrices.ts
│   │   ├── lib/
│   │   │   ├── avantisV2/   # Local intents, Privy signer, batched-market
│   │   │   ├── avantisApi.ts
│   │   │   └── setupStatus.ts
│   │   └── store/
│   │       └── tradeStore.ts
│   ├── scripts/             # verify-vectors, verify-v2-live, probe-selfsign
│   └── public/
│
└── backend/                 # FastAPI backend
    ├── app/
    │   ├── routers/
    │   │   ├── trades.py    # GET /trades/{address}, /pnl
    │   │   ├── prices.py
    │   │   ├── access.py
    │   │   ├── admin.py
    │   │   └── activity.py
    │   ├── services/
    │   │   ├── avantis.py   # SDK reads only
    │   │   └── price_feed.py
    │   └── main.py
    └── Dockerfile
```

## Development

### Running Locally

1. **Start Backend**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Access App**: http://localhost:3000

### Verification

```bash
cd frontend
npm run verify:vectors   # golden EIP-712 digests (offline)
npm run verify:v2        # live tx-builder + pair catalog
npm run probe:selfsign   # live relayer: self-sign vs third-party
```

### Building for Production

```bash
# Frontend
cd frontend
npm run build
npm start

# Backend
cd backend
docker build -t yolo-api .
docker run -p 8000:8000 yolo-api
```

## License

MIT
