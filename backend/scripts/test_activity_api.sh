#!/bin/bash
# Manual test script for Activity API endpoints.
# Usage: ./scripts/test_activity_api.sh [BASE_URL]
# Example: ./scripts/test_activity_api.sh http://localhost:8000
# Example: ./scripts/test_activity_api.sh https://your-app.railway.app

BASE_URL="${1:-http://localhost:8000}"
WALLET="0x1234567890123456789012345678901234567890"
# tx_hash must be a 32-byte hex hash
TX_OPEN_1="0x$(printf 'aa%.0s' {1..32})"
TX_OPEN_2="0x$(printf 'bb%.0s' {1..32})"
TX_CLOSE_2="0x$(printf 'cc%.0s' {1..32})"

echo "Testing Activity API at $BASE_URL"
echo "Wallet: $WALLET"
echo ""

# 1. Health check
echo "1. Health check..."
curl -s "$BASE_URL/health" | head -c 200
echo -e "\n"

# 2. Log open
echo "2. POST /trades/log-open..."
OPEN_RESP=$(curl -s -X POST "$BASE_URL/trades/log-open" \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"$WALLET\",
    \"pair\": \"BTC/USD\",
    \"pair_index\": 1,
    \"trade_index\": 0,
    \"direction\": \"LONG\",
    \"leverage\": 300,
    \"collateral\": 5.0,
    \"entry_price\": 95000.0,
    \"tp_price\": 285000.0,
    \"liq_price\": 94683.33,
    \"tx_hash\": \"$TX_OPEN_1\"
  }")
echo "$OPEN_RESP" | python3 -m json.tool 2>/dev/null || echo "$OPEN_RESP"

TRADE_ID=$(echo "$OPEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('trade_id',''))" 2>/dev/null)
if [ -n "$TRADE_ID" ]; then
  echo "   -> trade_id: $TRADE_ID"
fi
echo ""

# 3. Log close by position (alternate: use trade_id from step 2 if you have it)
echo "3. POST /trades/log-open (another trade for close-by-position)..."
curl -s -X POST "$BASE_URL/trades/log-open" \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"$WALLET\",
    \"pair\": \"ETH/USD\",
    \"pair_index\": 0,
    \"trade_index\": 42,
    \"direction\": \"SHORT\",
    \"leverage\": 250,
    \"collateral\": 10.0,
    \"entry_price\": 3500.0,
    \"tp_price\": 1000.0,
    \"liq_price\": 3550.0,
    \"tx_hash\": \"$TX_OPEN_2\"
  }" | python3 -m json.tool 2>/dev/null || echo "Response above"
echo ""

echo "4. POST /trades/log-close-by-position..."
curl -s -X POST "$BASE_URL/trades/log-close-by-position" \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"$WALLET\",
    \"pair_index\": 0,
    \"trade_index\": 42,
    \"exit_price\": 3400.0,
    \"pnl\": 7.14,
    \"closed_at\": \"2026-03-04T10:54:00Z\",
    \"tx_hash\": \"$TX_CLOSE_2\",
    \"is_liquidated\": false
  }"
echo -e "\n"

# 5. Get stats
echo "5. GET /activity/stats?wallet=..."
curl -s "$BASE_URL/activity/stats?wallet=$WALLET" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/activity/stats?wallet=$WALLET"
echo ""

# 6. Get trades
echo "6. GET /activity/trades?wallet=...&limit=10"
curl -s "$BASE_URL/activity/trades?wallet=$WALLET&limit=10&offset=0" | python3 -m json.tool 2>/dev/null | head -80
echo ""

echo "Done. Check responses above for 200 status / valid JSON."
