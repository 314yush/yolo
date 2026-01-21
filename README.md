# YOLO - Hypercasual Leverage Trading Mini-App

Spin the wheel, open a trade. Zero-fee perpetuals on Base.

## Overview

YOLO is a hypercasual trading app where users spin a wheel to randomly select:
- **Asset**: BTC, ETH, SOL, XRP
- **Leverage**: 100x-250x
- **Direction**: LONG or SHORT

The trade executes automatically with zero opening fees using Avantis Protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Privy Auth  │  │ Picker Wheel│  │ PnL Screen              │ │
│  │ (Embedded   │  │ (SVG +      │  │ (Real-time updates)     │ │
│  │  Wallet)    │  │  Animation) │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Delegate Wallet (localStorage)               │  │
│  │         Signs trade txs without user interaction          │  │
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
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Privy (authentication + embedded wallets)
- wagmi + viem (Web3)
- Zustand (state management)
- Howler.js (sound effects)

### Backend
- FastAPI (Python)
- Avantis Trader SDK
- Pyth Network (price feeds)

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
```
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

### Backend (.env)
```
BASE_RPC_URL=https://mainnet.base.org
DEBUG=true
```

## How It Works

### One-Time Setup
1. User logs in via Privy → gets embedded wallet
2. Frontend generates a delegate wallet → stores in localStorage
3. User signs a delegation tx (allows delegate to trade on their behalf)
4. User approves USDC spending

### Trading Flow
1. User taps ROLL
2. **Immediately**: Select random asset/leverage/direction
3. **Immediately**: Send trade request to backend (parallel with animation)
4. Wheel animates for ~8 seconds (hides blockchain latency)
5. Trade confirms → Show PnL screen
6. PnL updates in real-time

### Key Innovation
The wheel animation is "rigged" - we pre-select the outcome and fire the trade immediately. The wheel just animates to land on that selection. This hides the 8-10 second blockchain latency.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/pairs` | GET | Available trading pairs |
| `/price/{pair}` | GET | Current price from Pyth |
| `/delegate/setup` | POST | Build delegation tx |
| `/delegate/status/{trader}` | GET | Check delegation status |
| `/trade/build-open` | POST | Build open trade tx |
| `/trade/build-close` | POST | Build close trade tx |
| `/trades/{address}` | GET | Get open trades |
| `/trades/{address}/pnl` | GET | Get PnL for positions |

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
- **Delegate isolation**: Each user has their own delegate wallet
- **Delegate permissions**: Can only trade, cannot withdraw funds
- **USDC approval**: User explicitly approves spending limit

## License

MIT
