# 1.) Socket API – Pairs & Groups (Realtime + Snapshot)

API that returns the **current params/state** of all **pairs** and **groups**, plus a Socket.IO feed for realtime updates.

**HTTP Snapshot Endpoint**

```
GET https://socket-api-pub.avantisfi.com/socket-api/v1/data

```

**Socket.IO Realtime**

```
https://socket-api.avantisfi.com/socket.io

```

**Description**

- Returns a consolidated snapshot of group and pair configuration/state as derived from contracts.
- `overrides` apply on top of contract state (e.g., temporarily change a param or delist a pair).
- Socket.IO pushes **incremental changes** as they happen.

**Auth**

- None required (public endpoints).

---

## Response (Snapshot)

**Shape**

```json
{
  "data": {
    "dataVersion": 1.5,
    "groupInfo": {
      "0": {
        "groupMaxOI": 28271089.47,
        "groupOI": 14424987.62,
        "name": "CRYPTO1",
        "maxOpenInterestP": 28,
        "isSpreadDynamic": true
      },
      "1": {
        "groupMaxOI": 13125862.97,
        "groupOI": 5361155.26,
        "name": "CRYPTO2",
        "maxOpenInterestP": 13,
        "isSpreadDynamic": true
      }
    },
    "pairInfos": {
      "0": {
        "feed": {
          "maxOpenDeviationP": 1,
          "maxCloseDeviationP": 5,
          "feedId": "0x…",
          "attributes": {
            "symbol": "Crypto.ETH/USD",
            "asset_type": "Crypto",
            "is_open": true,
            "next_open": 0,
            "next_close": 0,
            "schedule": "America/New_York;O,O,O,O,O,O,O;"
          }
        },
        "backupFeed": { "maxDeviationP": 1.5, "feedId": "0x…" },
        "spreadP": 0.01,
        "pnlSpreadP": 0.01,
        "leverages": {
          "minLeverage": 1,
          "maxLeverage": 75,
          "pnlMinLeverage": 75,
          "pnlMaxLeverage": 500
        },
        "priceImpactMultiplier": 1.2,
        "skewImpactMultiplier": 0.25,
        "groupIndex": 0,
        "feeIndex": 0,
        "values": {
          "maxGainP": 2500,
          "maxSlP": 80,
          "maxLongOiP": 50,
          "maxShortOiP": 50,
          "groupOpenInterestPercentageP": 100,
          "maxWalletOIP": 50,
          "isUSDCAligned": false
        },
        "from": "ETH",
        "to": "USD",
        "timer": {
          "numTiers": 1,
          "positionSizeToThresholdTierMap": { "0": 0 },
          "thresholdTierToTimerMap": { "0": 0 }
        },
        "openInterest": { "long": 3479113.63, "short": 3222008.27 },
        "marginFee": {
          "long": 0.0017123287671232876,
          "short": 0.0017123287671232876
        },
        "pairOI": 6701121.9,
        "pairMaxOI": 28271089.47,
        "maxWalletOI": 45435679.51,
        "pairParams": {
          "onePercentDepthAbove": 19719825.472,
          "onePercentDepthBelow": 27371509.912
        },
        "blockOILimit": 2500000,
        "storagePairParams": {
          "posSpreadCap": 2,
          "negSpreadCap": 25,
          "isPnlTypeAllowed": 1,
          "pnlPriceImpactMultiplier": 1.2,
          "pnlSkewImpactMultiplier": 0,
          "pnlPosSpreadCap": 2,
          "pnlNegSpreadCap": 5,
          "minBorrowFee": 15
        },
        "openFeeP": 0.045,
        "closeFeeP": 0.045,
        "limitOrderFeeP": 0.01,
        "minLevPosUSDC": 10,
        "pnlFees": {
          "numTiers": 10,
          "tierP": [1, 5, 25, 50, 100, 250, 500, 1500, 2500, 3000],
          "feesP": [80, 50, 45, 37.5, 27.5, 25, 25, 22.5, 15, 2.5]
        },
        "lossProtectionMultiplier": { "0": 0, "1": 8, "2": 8, "3": 8 },
        "skewEqParams": [
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450],
          [0, 450]
        ],
        "longSkewConfig": { "0": 0, "1": 50, "2": 70, "3": 80 },
        "shortSkewConfig": { "0": 0, "1": 50, "2": 70, "3": 80 },
        "isPairListed": true,
        "index": 0,
        "pairSpreadP": 0.01,
        "pairLimitOrderFeeP": 0.01,
        "pairMinLevPosUSDC": 10,
        "pairMinLeverage": 1
      }
    },
    "pairCount": 90,
    "maxTradesPerPair": 40,
    "totalOi": 38934218.65,
    "maxOpenInterest": 90871359.02,
    "overrides": {
      "pairInfos": {
        "52": { "leverages": { "maxLeverage": 50 } },
        "65": { "from": "WTI", "to": "USD" },
        "78": { "isPairListed": false },
        "79": { "isPairListed": false }
      }
    }
  },
  "success": true
}
```

---

## Field Reference

### data

- `dataVersion` `number` – Version of the payload shape/content.
- `groupInfo` `object<groupIndex, Group>` – Map of **group index → group state**.
- `pairInfos` `object<pairIndex, Pair>` – Map of **pair index → pair state**.
- `pairCount` `number` – Total number of pairs in snapshot.
- `maxTradesPerPair` `number` – Max simultaneous trades per pair.
- `totalOi` `number` – Total open interest across all pairs.
- `maxOpenInterest` `number` – Global OI cap across all groups.
- `overrides` `object` – Values **overriding** contract state (apply after reading base values).

### Group

- `groupMaxOI` `number` – Max OI cap for the group.
- `groupOI` `number` – Current group OI.
- `name` `string` – Group name (e.g., `CRYPTO1`).
- `maxOpenInterestP` `number` – Group max OI percentage (policy metric).
- `isSpreadDynamic` `boolean` – Whether spread is dynamically adjusted for this group.

### Pair

- `index` `number` – Pair index. **Use in contracts/APIs**.
- `groupIndex` `number` – Group association for the pair.
- `isPairListed` `boolean` – If `false`, **ignore** this pair.
- `from` / `to` `string` – Base/quote symbols.
- `spreadP`, `pairSpreadP` `number` – Spread percentage for market orders.
- `pnlSpreadP` `number` – Spread percentage for zero-fee perp (ZFP) path.
- `leverages` `object` –
    - `minLeverage` / `maxLeverage` – For **fixed-fee** order type.
    - `pnlMinLeverage` / `pnlMaxLeverage` – For **zero-fee perp (ZFP)** order type.
- `values` `object` – Key trading limits:
    - `maxGainP` – Max TP %.
    - `maxSlP` – Max SL %.
    - `maxLongOiP`, `maxShortOiP` – Side OI caps (% of pair or group policy).
    - `maxWalletOI`, `maxWalletOIP` – Wallet-level OI cap (absolute / percent).
    - `groupOpenInterestPercentageP` – Group OI % used for policy.
    - `isUSDCAligned` – Price/settlement alignment flag.
- `openInterest` `object` – `long`, `short` current OI.
- `pairOI` `number` – Total OI on the pair.
- `pairMaxOI` `number` – Max OI allowed on the pair.
- `maxWalletOI` `number` – Max OI allowed per wallet for this pair.
- `marginFee` `object` – Hourly margin fee % for `long` and `short`.
- `openFeeP`, `closeFeeP`, `limitOrderFeeP` `number` – Fee percentages.
- `minLevPosUSDC` / `pairMinLevPosUSDC` `number` – Minimum USDC for leveraged positions.
- `priceImpactMultiplier`, `skewImpactMultiplier` `number` – Price/skew impact controls.
- `pairParams.onePercentDepthAbove/Below` `number` – Liquidity depth for ±1%.
- `blockOILimit` `number` – OI cap for a single block.
- `storagePairParams` `object` – Additional pair policy (caps, pnl multipliers, borrow fee min, etc.).
- `pnlFees` `object` – ZFP performance fee schedule: `tierP[]` thresholds vs `feesP[]`.
- `lossProtectionMultiplier` `map<tier, percent>` – Tier → **loss protection %**.
- `longSkewConfig` / `shortSkewConfig` `map<tier, skew%>` – Tier trigger per skew.
- `skewEqParams` `array` – Skew equalization parameters.
- `timer` `object` – Tiered timer configuration for thresholds.
- `feed` `object` – Primary Pyth price feed config (see **Feeds** below).
- `backupFeed` `object` – Backup feed config.

### Feeds

- `feed.feedId` – **Pyth price feed ID**. Use it to fetch latest or realtime prices (and price update data for contracts).
- `feed.attributes` – Metadata from Pyth (`symbol`, `asset_type`, market schedule fields).
    - `is_open` `boolean` – Current market-open flag.
    - `next_open` / `next_close` `unix` – Market schedule markers.
    - **Market-open logic**:
        - If `is_open == false` and `now < next_open ( if next_open > 0 )` → **market closed**.
        - If `is_open == true` OR (`now > next_open` AND `now < next_close`) → **market open**.

### Overrides

- `overrides.pairInfos[<pairIndex>]` – Values that **override** the base pair state (e.g., `maxLeverage`, `from/to`, `isPairListed`).

---

## Liquidity & OI Checks

- **Available pair liquidity** (USDC):
    - `pairAvail = pairMaxOI - pairOI`
- **Available group liquidity** for the pair’s group:
    - `groupAvail = groupInfo[groupIndex].groupMaxOI - groupInfo[groupIndex].groupOI`
- **Effective available liquidity** (what the UI should consider):
    - `available = min(pairAvail, groupAvail)`

**Skew tiers**

- Long skew % = `long / (long + short)`
- Short skew % = `short / (long + short)`
- With configs like `{0:0, 1:50, 2:70, 3:80}`, hitting ≥80% on one side → **tier 3**.

---

## Examples

### cURL (Snapshot)

```bash
curl -s "https://socket-api-pub.avantisfi.com/socket-api/v1/data"

```

### JavaScript (fetch snapshot)

```jsx
const res = await fetch("https://socket-api-pub.avantisfi.com/socket-api/v1/data");
const { data } = await res.json();

// Example: compute available liquidity for pair 0
const p = data.pairInfos[0];
const g = data.groupInfo[p.groupIndex];
const pairAvail = p.pairMaxOI - p.pairOI;
const groupAvail = g.groupMaxOI - g.groupOI;
const available = Math.min(pairAvail, groupAvail);

```

### JavaScript (Socket.IO realtime)

```jsx
import { io } from "socket.io-client";

// Socket.IO endpoint
const socket = io("https://socket-api.avantisfi.com", {
  path: "/socket.io",
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("connected", socket.id);
});

// Example: generic change stream (event name will match server-side emission)
socket.on("RES:DATA", (payload) => {
  // payload may include changed pair/group fields and/or overrides
  console.log("update", payload);
});

socket.on("disconnect", () => console.log("disconnected"));

```

---

## Status Codes (Snapshot)

- `200` – Success with payload shown above.
- `4xx/5xx` – Non-OK responses.

---

# 2.) User positions and open limit orders

API for fetching **open positions** and **limit orders** of a trader.

---

## 3) GET User Data

**Endpoint**

```
GET https://core.avantisfi.com/user-data?trader={trader}
```

**Example**

```
GET https://core.avantisfi.com/user-data?trader=0x8e1c4e0a7e85b2490f6d811824515d6fad3115a6
```

**Description**

Returns all **active positions** and **open limit orders** of a trader address.

**Query Parameters**

- `trader` `string` – EVM address of trader.

**Auth**

- None required (public endpoint).

---

## Response

**Shape**

```json
{
  "positions": [
    {
      "isOneCT": false,
      "liquidationPrice": "481278299403",
      "rolloverFee": "10908",
      "trader": "0x8E1c4e0a7e85b2490f6d811824515D6FAD3115A6",
      "pairIndex": 62,
      "index": 0,
      "buy": false,
      "collateral": "2000000000",
      "leverage": "100000000000",
      "openPrice": "443574692469",
      "sl": "479060667866",
      "tp": "222108938128",
      "lossProtection": "1",
      "openedAt": 1758710931,
      "isPnl": false}
  ],
  "limitOrders": [
    {
      "isOneCT": false,
      "trader": "0x8E1c4e0a7e85b2490f6d811824515D6FAD3115A6",
      "pairIndex": 21,
      "index": 0,
      "collateral": "30000000",
      "positionSize": "3000000000",
      "buy": false,
      "price": "37600000000000",
      "leverage": "1000000000000",
      "tp": "37528560000000",
      "sl": "37670000000000",
      "slippageP": "30000000000",
      "block": 35961058,
      "executionFee": "0",
      "liquidationPrice": "37919600000000"
    }
  ]
}

```

---

## Field Reference

### Positions

Each entry represents an **active position**.

- `isOneCT` – ignore (internal field).
- `liquidationPrice` `string` – Liquidation price, **10 decimals precision**. Divide by 1e10.
- `rolloverFee` `string` – Current accrued margin fee, **6 decimals precision**.
- `trader` `string` – Trader address.
- `pairIndex` `number` – Pair index identifier.
- `index` `number` – Index of trade for this pair.
- `buy` `boolean` – Trade direction (`true` = long, `false` = short).
- `collateral` `string` – Collateral in trade, **6 decimals**.
- `leverage` `string` – Leverage, **10 decimals**.
- `openPrice` `string` – Open price, **10 decimals**.
- `sl` `string` – Stop-loss price, **10 decimals** (0 if not set).
- `tp` `string` – Take-profit price, **10 decimals** (0 if not set).
- `lossProtection` `string` – Loss protection tier (`0` = none).
- `openedAt` `number` – Unix timestamp when trade was opened.
- `isPnl` `boolean` – `true` if **zero-fee perp (ZFP)**, `false` if fixed-fee trade.

---

### Limit Orders

Each entry represents an **open order to open a trade**.

- Fields are same as **Positions** except:
    - `slippageP` `string` – Slippage percentage (10 decimals).
    - `block` `number` – Block number when limit order was registered.
    - `executionFee` `string` – Execution fee (currently `0`).
    - `liquidationPrice` `string` – Liquidation price at execution (10 decimals).

---

## Examples

### cURL

```bash
curl -s "https://core.avantisfi.com/user-data?trader=0x8e1c4e0a7e85b2490f6d811824515d6fad3115a6"
```

### JavaScript (fetch)

```jsx
const base = "https://core.avantisfi.com/user-data";
const trader = "0x8e1c4e0a7e85b2490f6d811824515d6fad3115a6";

const res = await fetch(`${base}?trader=${trader}`);
const data = await res.json();

// Example: parse positions
for (const pos of data.positions) {
  console.log({
    pairIndex: pos.pairIndex,
    direction: pos.buy ? "LONG" : "SHORT",
    collateral: Number(pos.collateral) / 1e6,
    leverage: Number(pos.leverage) / 1e10,
    openPrice: Number(pos.openPrice) / 1e10,
    liqPrice: Number(pos.liquidationPrice) / 1e10,
    sl: Number(pos.sl) / 1e10,
    tp: Number(pos.tp) / 1e10,
    rolloverFee: Number(pos.rolloverFee) / 1e6,
    lossProtectionTier: Number(pos.lossProtection),
    openedAt: new Date(pos.openedAt * 1000),
    isZeroFeePerp: pos.isPnl
  });
}
```

---

## Status Codes

- `200` – Success with positions/limitOrders.
- `4xx/5xx` – Error responses.

---

# 3.) Portfolio/Trades History

API for fetching **closed trades** for a specific user’s portfolio.

---

## 1) GET Portfolio History

**Endpoint**

```
GET https://api.avantisfi.com/v2/history/portfolio/history/{userAddress}/{pageNumber}

```

**Example**

```
GET https://api.avantisfi.com/v2/history/portfolio/history/0x8E1c4e0a7e85b2490f6d811824515D6FAD3115A6/1

```

**Description**

Returns a paginated list of all **closed trades** for the given `userAddress`.

**Path Parameters**

- `userAddress` `string` – EVM address (checksum or lowercase) whose portfolio history will be fetched.
- `pageNumber` `integer` – 1-based page index.

**Auth**

- None required (public endpoint).

**Pagination**

- `count` `number` – total number of items across all pages.
- `pageCount` `number` – total number of pages.
- `portfolio.length` per page may vary.

---

## Response

**Shape**

```json
{
  "portfolio": [
    {
      "_id": "68d20becf00c296dc8522c8d",
      "event": {
        "args": {
          "t": {
            "index": 1,
            "initialPosToken": 0.98542,
            "leverage": 36,
            "openPrice": 113983.22122069,
            "pairIndex": 1,
            "positionSizeUSDC": 1757.600519,
            "sl": 0,
            "tp": 193090.9,
            "trader": "0xBc100e94cF6B0655e6eabb70F3b443b862D18397",
            "buy": true,
            "timestamp": 1757600519
          },
          "price": 112002.68,
          "positionSizeUSDC": 0.98542,
          "usdcSentToTrader": 0,
          "isPnl": false,
          "_feeInfo": {
            "closingFee": 0.147813,
            "r": 0.222313,
            "lossProtectionPSum": 0,
            "lossProtection": 0,
            "liquidationFee": 0.147813,
            "keeperFee": 0,
            "actualCloseFee": 0
          }
        }
      },
      "_grossPnl": -0.615294,
      "timeStamp": "2025-09-23T02:54:35.000Z"
    }
  ],
  "count": 70892,
  "pageCount": 7090,
  "success": true
}

```

---

## Field Reference

### Top-level

- `portfolio` `array<object>` – Closed trade entries.
- `count` `number` – Total items across all pages.
- `pageCount` `number` – Total pages available.
- `success` `boolean` – Request status.

### portfolio[i]

- `_id` `string` – Internal identifier of the history record.
- `event` `object` – On-chain/event payload.
- `_grossPnl` `number` – Gross PnL for this close **in USDC units** (negative if loss).
- `timeStamp` `string (ISO 8601)` – Close timestamp.

### portfolio[i].event.args (close context)

- `price` `number` – **Closing price** used for the trade close.
- `positionSizeUSDC` `number` – **Collateral closed** in this event (not position size).
- `usdcSentToTrader` `number` – Amount of USDC returned to trader on close.
- `isPnl` `boolean` – Whether this was a **zero-fee** perp trade settlement pathway.
- `_feeInfo` `object` – Breakdown of closing/liq/keeper fees.

### portfolio[i].event.args.t (trade at open)

- `index` `number` – Trade index.
- `initialPosToken` `number` – **Collateral in trade before closing** (opening collateral).
- `leverage` `number` – Leverage used at open (×).
- `openPrice` `number` – Open price of the trade.
- `pairIndex` `number` – Pair identifier.
- `positionSizeUSDC` `number` – **Ignore** (not used for calculations here).
- `sl` `number` – Stop-loss price (0 if not set).
- `tp` `number` – Take-profit price.
- `trader` `string` – Trader EVM address.
- `buy` `boolean` – Direction at open (`true` = long, `false` = short).
- `timestamp` `number (unix seconds)` – **Open** timestamp.

---

## Notes & Semantics

- **Collateral closed** comes from `event.args.positionSizeUSDC`.
- **Closing price** is `event.args.price`.
- **USDC to trader on close** is `event.args.usdcSentToTrader`.
- **Zero-fee indicator** is `event.args.isPnl` (true implies zero-fee path for the perp trade).

---

## Examples

### cURL

```bash
curl -s \
  "https://api.avantisfi.com/v2/history/portfolio/history/0x8E1c4e0a7e85b2490f6d811824515D6FAD3115A6/1"

```

### JavaScript (fetch)

```jsx
const base = "https://api.avantisfi.com/v2/history/portfolio/history";
const user = "0x8E1c4e0a7e85b2490f6d811824515D6FAD3115A6";
const page = 1;

const res = await fetch(`${base}/${user}/${page}`);
const data = await res.json();

// Example: iterate closed trades
for (const item of data.portfolio) {
  const t = item.event.args.t;
  const closedCollateral = item.event.args.positionSizeUSDC; // amount closed
  const closePrice = item.event.args.price;
  const returnedUSDC = item.event.args.usdcSentToTrader;
  const isZeroFee = item.event.args.isPnl;
  console.log({
    tradeIndex: t.index,
    direction: t.buy ? "LONG" : "SHORT",
    openPrice: t.openPrice,
    closePrice,
    leverage: t.leverage,
    closedCollateral,
    returnedUSDC,
    isZeroFee,
    grossPnl: item._grossPnl,
    closedAt: item.timeStamp,
  });
}

```

---

## Common Calculations (client-side examples)

- **Direction label**: `direction = t.buy ? "LONG" : "SHORT"`.
- **Has SL/TP**: `hasSL = t.sl > 0`, `hasTP = t.tp > 0`.
- **Opened at (Date)**: `new Date(t.timestamp * 1000)`.
- **Closed at (Date)**: `new Date(item.timeStamp)`.

---

## Status Codes

- `200` – Success with payload shown above.
- `4xx/5xx` – Non-OK responses (payload not guaranteed).