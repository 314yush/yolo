# YOLO Architecture Documentation

## System Overview

YOLO is a hypercasual leverage trading application built on Base chain using Avantis Protocol. The architecture is designed for instant, gasless trading with a focus on user experience and performance.

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
│  │  │  - Price data (Pyth)                                  │   │  │
│  │  │  - Chart data (1-second ticks)                        │   │  │
│  │  │  - UI state                                           │   │  │
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
                              ▼ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Avantis Trader SDK                                │  │
│  │  - Builds unsigned transactions                                │  │
│  │  - No private keys stored                                     │  │
│  │  - Transaction encoding                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Pyth Network Integration                         │  │
│  │  - WebSocket price feeds                                     │  │
│  │  - Real-time price updates                                    │  │
│  │  - Multiple asset pairs                                      │  │
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
  - Price data (Pyth prices)
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
- **Endpoints**:
  - `/trades/*` - Trade operations
  - `/delegate/*` - Delegation management
  - `/prices/*` - Price feeds
  - `/pairs` - Available trading pairs

#### 2. **Avantis Integration** (`backend/app/services/avantis.py`)
- **SDK**: avantis-trader-sdk 0.8.13+
- **Function**: Builds unsigned transactions
- **No Signing**: Backend never holds private keys

#### 3. **Price Feed Service** (`backend/app/services/price_feed.py`)
- **Source**: Pyth Network
- **Protocol**: WebSocket
- **Caching**: In-memory cache with TTL
- **Timeout**: 10-12 second timeout for price fetches

## Data Flow

### Trading Flow

1. **User Action**: User taps "ROLL" button
2. **Selection**: Random asset/leverage/direction selected
3. **Parallel Execution**:
   - Wheel animation starts
   - Trade request sent to backend
4. **Backend Processing**:
   - Fetches current price from Pyth
   - Builds unsigned transaction via Avantis SDK
   - Returns transaction data
5. **Frontend Signing**:
   - Delegate wallet signs transaction
6. **Relay**:
   - Transaction sent to Tachyon relay
   - Gas sponsored by Tachyon
7. **Confirmation**:
   - Transaction hash returned
   - PnL screen displayed
8. **Real-time Updates**:
   - Pyth prices update every second
   - Chart updates with new data
   - PnL recalculated

### Price Update Flow

1. **Backend**: Pyth WebSocket connection
2. **Backend**: Price updates cached
3. **Frontend**: Polls `/prices` endpoint (or WebSocket)
4. **Frontend**: Prices stored in Zustand
5. **Chart Collector**: Collects 1-second ticks
6. **Chart**: Aggregates ticks into 1-minute bars
7. **UI**: Chart and PnL update in real-time

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

1. **Pre-built Transactions**: Transactions built ahead of time
2. **Progressive Chart Loading**: 10 → 30 data points
3. **Chart Data Caching**: 1-second ticks cached in memory
4. **Price Caching**: Backend caches Pyth prices
5. **Batch Price Fetching**: Multiple pairs fetched in one request
6. **Debounced Updates**: Chart updates debounced to prevent jank

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
