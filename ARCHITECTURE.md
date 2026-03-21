# YOLO Architecture Documentation

## System Overview

YOLO is a hypercasual leverage trading application built on Base chain using Avantis Protocol. The architecture is designed for instant, gasless trading with a focus on user experience and performance.

**Repository**: [github.com/314yush/yolo](https://github.com/314yush/yolo)

## Avantis Integration Overview

YOLO integrates with Avantis Protocol through **two parallel paths**:

| Path | Location | Method | Primary Use |
|------|----------|---------|-------------|
| **Frontend Direct** | `frontend/src/lib/avantisEncoder.ts` | viem ABI encoding, no SDK | **Main flow** – open, close, flip trades; delegate setup; USDC approval |
| **Backend SDK** | `backend/app/services/avantis.py` | `avantis-trader-sdk` (Python) | Alternative – API endpoints for tx building; used when frontend needs backend |

The **primary trading flow uses frontend-only direct contract encoding** for speed. The backend SDK is available as a fallback and for server-side operations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Next.js 16 Frontend                        │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Privy Auth   │  │ Picker Wheel │  │   PnL Screen     │  │  │
│  │  │ (External    │  │ (SVG +       │  │   + Chart        │  │  │
│  │  │  Wallets)    │  │  Animation)  │  │                  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │  │
│  │                                                               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │         State Management (Zustand)                   │   │  │
│  │  │  - Trade state                                        │   │  │
│  │  │  - Live marks (Avantis feed-v3 + Hermes fallback)      │   │  │
│  │  │  - Chart data (1-second ticks)                        │   │  │
│  │  │  - UI state                                           │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │    Avantis Direct Integration (Primary)               │   │  │
│  │  │  - avantisEncoder.ts: build tx via viem (no SDK)     │   │  │
│  │  │  - avantisApi.ts: REST API (trades, PnL, history)    │   │  │
│  │  │  - viem readContract: delegate status, USDC allowance │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │         Delegate Wallet System                        │   │  │
│  │  │  - Generated per user (localStorage)                 │   │  │
│  │  │  - EIP-7702 delegation (one-time)                    │   │  │
│  │  │  - Signs trades without user interaction              │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │         Relay Service (Modular)                       │   │  │
│  │  │  - Tachyon Provider (default)                         │   │  │
│  │  │  - Gelato Provider (alternative)                       │   │  │
│  │  │  - Gas sponsorship                                    │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
   Avantis feed-v3     Avantis REST API      Base RPC (viem)
   (+ Hermes fallback) (trades, history)     (contract reads)
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼ HTTP (optional)
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI) - Optional                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Avantis Trader SDK (Python)                        │  │
│  │  - Alternative tx building: /trade/build-open, build-close      │  │
│  │  - Delegate: /delegate/setup, approve-usdc                     │  │
│  │  - No private keys stored; builds unsigned tx only              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Avantis SDK feed client (server-side prices)        │  │
│  │  - Used when backend builds tx (price for build-open)          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Base Chain    │
                    │ Avantis Protocol│
                    └─────────────────┘
```

## Core Components

### Frontend Architecture

#### 1. **Authentication Layer** (`Privy`)
- External wallet connection only (MetaMask, Coinbase Wallet, etc.)
- No embedded wallets
- Wallet address stored in Zustand store

#### 2. **Delegate Wallet System**
- **Location**: `frontend/src/lib/delegateWallet.ts`
- **Storage**: localStorage (per user)
- **Purpose**: Sign trades without user interaction
- **Delegation**: EIP-7702 standard (one-time setup)
- **Security**: Each user has isolated delegate wallet

#### 3. **Relay Service** (`frontend/src/lib/relayService.ts`)
- **Modular Design**: Provider abstraction pattern
- **Providers**:
  - Tachyon (default) - `@rathfi/tachyon` SDK
  - Gelato (stub implementation)
- **Features**:
  - Gas sponsorship
  - Performance tracking
  - Provider switching
  - A/B testing support

#### 4. **State Management** (`frontend/src/store/tradeStore.ts`)
- **Library**: Zustand
- **Stores**:
  - Trade state (current trade, open trades)
  - Live marks (Avantis / Hermes on the client; SDK on the backend)
  - Chart data (1-second ticks)
  - UI state (stage, selection)
  - Settings (collateral, preferences)

#### 5. **Chart System** (`frontend/src/components/PriceChart.tsx`)
- **Library**: lightweight-charts 5.1.0
- **Type**: AreaSeries with gradient fill
- **Features**:
  - Entry/LIQ price line labels
  - Real-time price updates
  - Progressive loading (10 → 30 points)
  - 1-minute resolution (aggregated from 1-second ticks)

#### 6. **Price Data Collection** (`frontend/src/hooks/useChartDataCollector.ts`)
- **Granularity**: 1-second ticks
- **Storage**: In-memory Map (up to 5 hours)
- **Aggregation**: Client-side into time-based bars
- **Resolution**: 60 seconds (1 minute) default

### Backend Architecture

#### 1. **API Layer** (`backend/app/routers/`)
- **FastAPI** framework
- **Endpoints** (alternative to frontend direct – frontend primarily uses direct encoding/API):
  - `/trade/build-open`, `/trade/build-close`, `/trade/build-update-tpsl` – tx building via Avantis SDK
  - `/delegate/setup`, `/delegate/approve-usdc` – delegate/USDC tx building
  - `/trades/{address}`, `/trades/{address}/pnl` – trades and PnL via SDK
  - `/price/{pair}` – Single-pair price (Avantis SDK feed client)
  - `/pairs` – Available trading pairs

#### 2. **Avantis Integration** (Dual Path)

**Frontend – Direct Contract Encoding (Primary)**

- **Location**: `frontend/src/lib/avantisEncoder.ts`
- **Method**: viem `encodeFunctionData` with contract ABIs – no SDK
- **Contract addresses** (Base mainnet):
  - Trading: `0x44914408af82bC9983bbb330e3578E1105e11d4e`
  - TradingStorage: `0x8a311D7048c35985aa31C131B9A13e03a5f7422d`
  - USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Transaction format**: All trade txs use `delegatedAction(trader, innerCalldata)` so the delegate signs on behalf of the trader
- **Functions**:
  - `buildOpenTradeTx` → `delegatedAction(trader, openTrade(...))`
  - `buildCloseTradeTx` → `delegatedAction(trader, closeTradeMarket(...))`
  - `buildFlipTradeTxs` → close + open opposite direction
  - `buildSetDelegateTx` / `buildRemoveDelegateTx` → delegate setup
  - `buildUsdcApprovalTx` → approve TradingStorage to spend USDC
- **Decimal scaling** (from Avantis docs): prices 10 decimals, leverage 10 decimals, USDC 6 decimals, slippage 10 decimals
- **Execution fee**: 0 (Tachyon gas sponsorship)

**Backend – Avantis SDK (Alternative)**

- **Location**: `backend/app/services/avantis.py`
- **SDK**: avantis-trader-sdk 0.8.13+
- **Function**: Builds unsigned transactions via Python SDK
- **No Signing**: Backend never holds private keys
- **Endpoints**: `POST /trade/build-open`, `POST /trade/build-close`, `POST /trade/build-update-tpsl`, `POST /delegate/setup`, `POST /delegate/approve-usdc`
- **Fallback**: Manual encoding when SDK times out (e.g. `openTrade`, `closeTradeMarket` via contract ABI)

#### 3. **Direct Contract Reads** (Frontend)

- **Location**: `frontend/src/hooks/useAvantisAPI.ts` via `publicClient.readContract` (viem)
- **Reads**:
  - `delegations(trader)` on Trading → delegate status
  - `allowance(owner, spender)` on USDC → USDC allowance for TradingStorage
- **No backend**: All reads go directly to Base RPC

#### 4. **Avantis REST API** (Frontend)

- **Location**: `frontend/src/lib/avantisApi.ts`
- **Endpoints**:
  - `GET https://core.avantisfi.com/user-data?trader={address}` → open positions, PnL (rollover fees included)
  - `GET https://api.avantisfi.com/v2/history/portfolio/history/{address}/{page}` → closed trades
- **Bypasses backend**: Frontend calls Avantis APIs directly for trades and history

#### 5. **Price Feed Service** (`backend/app/services/price_feed.py`)
- **Source**: Avantis SDK `feed_client` when the backend resolves a mark for tx building
- **Protocol**: WebSocket
- **Caching**: In-memory cache with TTL
- **Timeout**: 10-12 second timeout for price fetches

## Avantis: Building Transactions vs Direct Calls

| Operation | Method | Where |
|-----------|--------|-------|
| **Open trade** | Build tx | Frontend: `avantisEncoder.buildOpenTradeTx` (viem) |
| **Close trade** | Build tx | Frontend: `avantisEncoder.buildCloseTradeTx` |
| **Flip trade** | Build tx | Frontend: `avantisEncoder.buildFlipTradeTxs` |
| **Delegate setup** | Build tx | Frontend: `avantisEncoder.buildSetDelegateTx` |
| **USDC approval** | Build tx | Frontend: `avantisEncoder.buildUsdcApprovalTx` |
| **Delegate status** | Direct read | Frontend: `readContract` → `delegations(trader)` |
| **USDC allowance** | Direct read | Frontend: `readContract` → `allowance(owner, spender)` |
| **Open trades** | REST API | Frontend: `avantisApi.fetchTrades` → `core.avantisfi.com` |
| **PnL** | REST API | Frontend: `avantisApi.fetchPnL` → `core.avantisfi.com` |
| **Closed trades** | REST API | Frontend: `avantisApi.fetchClosedTrades` → `api.avantisfi.com` |

All built transactions target the Avantis Trading contract and use `delegatedAction(trader, innerCalldata)` so the delegate wallet can sign on behalf of the trader.

## Data Flow

### Trading Flow (Primary – Frontend Direct)

1. **User Action**: User taps "ROLL" button
2. **Selection**: Random asset/leverage/direction selected
3. **Parallel Execution**:
   - Wheel animation starts
   - `usePrebuiltTx` / `avantisEncoder.buildOpenTradeTx` builds tx in frontend (no backend)
4. **Transaction Building** (frontend):
   - Price from live marks (`useLivePrices` → Avantis feed-v3 SSE, Hermes fallback)
   - `buildOpenTradeTx` encodes `delegatedAction(trader, openTrade(...))` via viem
   - Tx built locally – no network round-trip
5. **Frontend Signing**:
   - Delegate wallet signs transaction
6. **Relay**:
   - Transaction sent to Tachyon relay
   - Gas sponsored by Tachyon
7. **Confirmation**:
   - Transaction hash returned
   - PnL screen displayed
8. **Real-time Updates**:
   - Live marks update from SSE / REST (feed cadence)
   - Chart updates with new data
   - PnL from Avantis REST API (`core.avantisfi.com/user-data`)

### Alternative Trading Flow (Backend SDK)

If using backend for tx building: `POST /trade/build-open` → backend fetches price via Avantis SDK feed, builds tx via SDK, returns unsigned tx to frontend.

### Price Update Flow

1. **Frontend**: Avantis feed-v3 SSE (proxied), Hermes SSE/REST fallback — `useLivePrices`
2. **Frontend**: Prices stored in Zustand
3. **Chart Collector**: Collects 1-second ticks
4. **Chart**: Aggregates ticks into 1-minute bars
5. **PnL**: `avantisApi.fetchPnL` combines Avantis positions with live marks / Hermes when needed (Net PnL = Gross PnL − rolloverFee)
6. **UI**: Chart and PnL update in real-time

## Key Design Decisions

### 1. Delegate Wallet Pattern
**Why**: Enables instant trading without repeated wallet approvals
**How**: EIP-7702 delegation allows delegate to act on user's behalf
**Security**: Delegate can only interact with Avantis Trading contract

### 2. Gas Sponsorship
**Why**: Removes friction from trading (no gas fees for users)
**How**: Tachyon relay sponsors gas fees
**Cost**: Backend/relay provider covers gas costs

### 3. Progressive Chart Loading
**Why**: Faster perceived performance
**How**: Render with 10 points initially, enhance to 30
**Benefit**: Chart appears instantly, then improves

### 4. Rigged Wheel Animation
**Why**: Hide blockchain latency (8-10 seconds)
**How**: Pre-select outcome, fire trade immediately, animate to selection
**UX**: Feels instant despite blockchain delay

### 5. Modular Relay System
**Why**: Flexibility to switch providers, A/B testing
**How**: Provider abstraction pattern
**Benefit**: Easy to add new relay providers

## Performance Optimizations

1. **Frontend Direct Tx Building**: No backend round-trip – `avantisEncoder` builds tx in browser via viem
2. **Pre-built Transactions**: `usePrebuiltTx`, `usePrebuiltFlipTx`, `usePrebuiltCloseTx` build ahead of selection
3. **Progressive Chart Loading**: 10 → 30 data points
4. **Chart Data Caching**: 1-second ticks cached in memory
5. **Direct Avantis API**: Trades/PnL from Avantis REST API, bypassing backend
6. **Live prices**: Avantis feed-v3 SSE (+ Hermes fallback) into Zustand
7. **Debounced Updates**: Chart updates debounced to prevent jank

## Security Considerations

1. **No Backend Signing**: Backend never holds private keys
2. **Delegate Isolation**: Each user has separate delegate wallet
3. **Contract Restrictions**: Delegate can only call Avantis Trading contract
4. **USDC Approval**: Explicit user approval required
5. **EIP-7702**: Modern, secure delegation standard
6. **Gas Sponsorship**: Relay provider validates transactions

## Technology Versions

- **Next.js**: 16.1.4
- **React**: 19.2.3
- **TypeScript**: 5.x
- **Tailwind CSS**: 4.x
- **Privy**: 3.11.0
- **wagmi**: 3.3.4
- **viem**: 2.44.4
- **Zustand**: 5.0.10
- **lightweight-charts**: 5.1.0
- **FastAPI**: 0.109+
- **Avantis SDK**: 0.8.13+
- **Tachyon SDK**: 0.1.14

## Future Enhancements

- [ ] Gelato relay full implementation
- [ ] Additional chart resolutions (3m, 5m, 15m)
- [ ] Trade history persistence
- [ ] Social features (leaderboards)
- [ ] Mobile app (React Native)
