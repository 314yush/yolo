# YOLO - Hypercasual Leverage Trading Mini-App

Spin the wheel, open a trade. Zero-fee perpetuals on Base.

## Overview

YOLO is a hypercasual trading app where users spin a wheel to randomly select:
- **Asset**: BTC, ETH, SOL, XRP, XAU (Gold), XAG (Silver)
- **Leverage**: 100x-500x
- **Direction**: LONG or SHORT

The trade executes automatically with zero opening fees using Avantis Protocol. Gas fees are sponsored via Tachyon relay.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Privy Auth  │  │ Picker Wheel│  │ PnL Screen              │ │
│  │ (External   │  │ (SVG +      │  │ (Real-time updates)     │ │
│  │  Wallets)   │  │  Animation) │  │ Price Chart             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Delegate Wallet (localStorage)               │  │
│  │         Signs trade txs without user interaction          │  │
│  │         Uses EIP-7702 delegation (one-time setup)       │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Relay Service (Tachyon/Gelato)                    │  │
│  │         Sponsors gas fees for trade transactions         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ API Calls
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Python)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Avantis Trader SDK                    │   │
│  │         Builds unsigned transactions only                │   │
│  │         (No private keys on backend)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Pyth Network Price Feed                      │   │
│  │         Real-time price updates via WebSocket            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Base Chain    │
                    │ Avantis Protocol│
                    └─────────────────┘
```

## Tech Stack

### Frontend
- **Next.js 16.1.4** (App Router, React Server Components)
- **React 19.2.3** + **TypeScript 5**
- **Tailwind CSS 4** (PostCSS)
- **Privy 3.11.0** (authentication - external wallets only)
- **wagmi 3.3.4** + **viem 2.44.4** (Web3)
- **Zustand 5.0.10** (state management)
- **lightweight-charts 5.1.0** (price charts with area series)
- **Howler.js 2.2.4** (sound effects)
- **Framer Motion 12.27.5** (animations)
- **Tachyon SDK** (`@rathfi/tachyon`) (gas sponsorship relay)
- **Pusher** (real-time price updates)
- **PostHog** (analytics)

### Backend
- **FastAPI 0.109+** (Python web framework)
- **Avantis Trader SDK 0.8.13+** (transaction building)
- **Pyth Network** (price feeds via WebSocket)
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
# Edit .env.local with your Privy App ID
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
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# API Configuration (used by /api/backend proxy)
BACKEND_URL=http://localhost:8000

# Blockchain RPC
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org

# Tachyon Relay (Gas Sponsorship)
NEXT_PUBLIC_TACHYON_API_KEY=your-tachyon-api-key

# Pusher (Real-time Price Updates)
NEXT_PUBLIC_PUSHER_KEY=your-pusher-key
NEXT_PUBLIC_PUSHER_CLUSTER=your-pusher-cluster

# PostHog Analytics (Optional)
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

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
1. User connects external wallet via Privy (MetaMask, Coinbase Wallet, etc.)
2. Frontend generates a delegate wallet → stores in localStorage
3. User signs EIP-7702 delegation tx (allows delegate to trade on their behalf)
4. User approves USDC spending to Avantis Trading contract
5. Setup can be batched (delegate + approval in one transaction) if wallet supports EIP-5792

### Trading Flow
1. User taps ROLL
2. **Immediately**: Select random asset/leverage/direction
3. **Immediately**: Send trade request to backend (parallel with animation)
4. Wheel animates for ~8 seconds (hides blockchain latency)
5. Backend builds unsigned transaction
6. Delegate wallet signs transaction
7. Transaction relayed via Tachyon (gas sponsored)
8. Trade confirms → Show PnL screen
9. PnL updates in real-time via Pyth price feeds
10. Price chart displays with Entry/LIQ labels

### Key Innovations
- **Rigged Wheel Animation**: Pre-selects outcome and fires trade immediately. The wheel animates to land on that selection, hiding 8-10 second blockchain latency.
- **Gas Sponsorship**: Tachyon relay sponsors gas fees, making trades feel instant and free for users.
- **Delegate Wallet Pattern**: One-time delegation allows instant trading without repeated wallet approvals.
- **Progressive Chart Loading**: Charts load with 10 data points initially, then enhance to 30 for faster perceived performance.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/pairs` | GET | Available trading pairs |
| `/price/{pair}` | GET | Current price from Pyth |
| `/prices` | GET | Batch price fetch for multiple pairs |
| `/delegate/setup` | POST | Build delegation tx |
| `/delegate/status/{trader}` | GET | Check delegation status |
| `/trade/build-open` | POST | Build open trade tx |
| `/trade/build-close` | POST | Build close trade tx |
| `/trades/{address}` | GET | Get open trades |
| `/trades/{address}/pnl` | GET | Get PnL for positions |

## Key Features

### Chart System
- **Area Chart with Gradient**: Visual price movement with gradient fill
- **Entry/LIQ Labels**: Built-in chart labels showing entry and liquidation prices
- **Real-time Updates**: Chart updates every second with latest price data
- **Progressive Loading**: Renders with 10 points initially, then enhances to 30
- **1-minute Resolution**: Aggregated from 1-second tick data

### Relay System
- **Tachyon Relay**: Primary gas sponsorship provider (default)
- **Gelato Relay**: Alternative provider (stub implementation)
- **Modular Architecture**: Easy to switch between providers
- **Performance Tracking**: Built-in timing instrumentation

### State Management
- **Zustand Store**: Centralized trade state, prices, and UI state
- **Real-time Price Sync**: Pyth prices synced to store via WebSocket
- **Chart Data Collector**: Background collection of 1-second tick data
- **Pre-built Transactions**: Transactions pre-built for instant execution

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

## Security Notes

- **No backend signing**: Backend only builds unsigned transactions
- **Delegate isolation**: Each user has their own delegate wallet (stored in localStorage)
- **Delegate permissions**: Can only trade via Avantis contract, cannot withdraw funds
- **USDC approval**: User explicitly approves spending limit to Trading contract
- **EIP-7702 Delegation**: One-time delegation using modern Ethereum standard
- **Gas Sponsorship**: Tachyon sponsors gas, but delegate must have ETH for transaction value

## Project Structure

```
yolo/
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js app router pages
│   │   │   ├── page.tsx     # Main trading interface
│   │   │   ├── activity/    # Trade history page
│   │   │   └── settings/    # Settings page
│   │   ├── components/      # React components
│   │   │   ├── PickerWheel.tsx    # Wheel selection component
│   │   │   ├── PnLScreen.tsx       # Profit/Loss display
│   │   │   ├── PriceChart.tsx     # Price chart with Entry/LIQ labels
│   │   │   └── SetupFlow.tsx      # One-time setup flow
│   │   ├── hooks/           # Custom React hooks
│   │   │   ├── useChartDataCollector.ts  # Chart data collection
│   │   │   ├── usePythPrices.ts          # Real-time price updates
│   │   │   ├── useTxSigner.ts            # Transaction signing
│   │   │   └── useRelayProvider.ts       # Relay provider management
│   │   ├── lib/             # Utility libraries
│   │   │   ├── providers/   # Relay provider implementations
│   │   │   │   ├── tachyonProvider.ts
│   │   │   │   └── gelatoProvider.ts
│   │   │   ├── relayService.ts    # Relay service abstraction
│   │   │   └── avantisApi.ts      # Backend API client
│   │   └── store/           # Zustand state store
│   │       └── tradeStore.ts
│   └── public/              # Static assets
│       ├── sounds/          # Sound effects
│       └── logos/           # Asset logos
│
└── backend/                 # FastAPI backend
    ├── app/
    │   ├── routers/         # API route handlers
    │   │   ├── trades.py    # Trade endpoints
    │   │   ├── delegate.py # Delegation endpoints
    │   │   └── prices.py     # Price endpoints
    │   ├── services/         # Business logic
    │   │   ├── avantis.py   # Avantis SDK integration
    │   │   └── price_feed.py # Pyth price feed
    │   └── main.py          # FastAPI app
    └── Dockerfile           # Container configuration
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
