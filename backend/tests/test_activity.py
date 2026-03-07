"""
Basic tests for activity tracking endpoints.
Requires DATABASE_URL. Uses test wallet 0x11...11.
"""

import pytest
import httpx

TEST_WALLET = "0x1111111111111111111111111111111111111111"

pytestmark = pytest.mark.asyncio


async def test_log_open_invalid_wallet(client: httpx.AsyncClient):
    """Reject invalid wallet format."""
    resp = await client.post(
        "/trades/log-open",
        json={
            "wallet": "invalid",
            "pair": "BTC/USD",
            "pair_index": 1,
            "trade_index": 0,
            "direction": "LONG",
            "leverage": 300,
            "collateral": 5.0,
            "entry_price": 95000.0,
            "tp_price": 285000.0,
            "liq_price": 94683.33,
            "tx_hash": "0xabc",
        },
    )
    assert resp.status_code == 422
    assert "wallet" in resp.text.lower() or "valid" in resp.text.lower()


async def test_log_open_success(client: httpx.AsyncClient):
    """Log open returns trade_id."""
    resp = await client.post(
        "/trades/log-open",
        json={
            "wallet": TEST_WALLET,
            "pair": "BTC/USD",
            "pair_index": 1,
            "trade_index": 0,
            "direction": "LONG",
            "leverage": 300,
            "collateral": 5.0,
            "entry_price": 95000.0,
            "tp_price": 285000.0,
            "liq_price": 94683.33,
            "tx_hash": "0xabcdef1234567890abcdef1234567890abcdef12",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "trade_id" in data
    assert len(data["trade_id"]) == 36  # UUID format


async def test_log_close_not_found(client: httpx.AsyncClient):
    """Log close with non-existent trade_id returns 404."""
    resp = await client.post(
        "/trades/log-close",
        json={
            "trade_id": "00000000-0000-0000-0000-000000000000",
            "exit_price": 96000.0,
            "pnl": 15.0,
            "closed_at": "2026-03-04T10:54:00Z",
            "tx_hash": "0xabcd1234",
        },
    )
    assert resp.status_code == 404


async def test_log_close_invalid_trade_id(client: httpx.AsyncClient):
    """Log close with invalid UUID returns 422."""
    resp = await client.post(
        "/trades/log-close",
        json={
            "trade_id": "not-a-uuid",
            "exit_price": 96000.0,
            "pnl": 15.0,
        },
    )
    assert resp.status_code == 422


async def test_log_open_and_close(client: httpx.AsyncClient):
    """Full flow: log open, log close, verify stats and trades."""
    # Log open
    open_resp = await client.post(
        "/trades/log-open",
        json={
            "wallet": TEST_WALLET,
            "pair": "ETH/USD",
            "pair_index": 0,
            "trade_index": 99,  # Use high index to avoid collision with other tests
            "direction": "SHORT",
            "leverage": 250,
            "collateral": 10.0,
            "entry_price": 3500.0,
            "tp_price": 1000.0,
            "liq_price": 3550.0,
            "tx_hash": "0xopen123",
        },
    )
    assert open_resp.status_code == 200
    trade_id = open_resp.json()["trade_id"]

    # Log close
    close_resp = await client.post(
        "/trades/log-close",
        json={
            "trade_id": trade_id,
            "exit_price": 3400.0,
            "pnl": 7.14,
            "closed_at": "2026-03-04T10:54:00Z",
            "tx_hash": "0xclose456",
        },
    )
    assert close_resp.status_code == 200

    # Get stats
    stats_resp = await client.get(f"/activity/stats?wallet={TEST_WALLET}")
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["total_trades"] >= 1
    assert stats["total_volume"] >= 2500.0  # 10 * 250
    assert stats["total_pnl"] >= 0
    assert "win_rate" in stats
    assert "open_trades" in stats

    # Get trades
    trades_resp = await client.get(f"/activity/trades?wallet={TEST_WALLET}&limit=10&offset=0")
    assert trades_resp.status_code == 200
    data = trades_resp.json()
    assert "trades" in data
    assert "total" in data
    assert "page" in data
    assert "has_more" in data
    assert len(data["trades"]) >= 1
    t = data["trades"][0]
    assert t["pair"] == "ETH/USD"
    assert t["direction"] == "SHORT"
    assert t["status"] == "closed"
    assert t["pnl"] == 7.14
    assert t["tx_hash_open"] == "0xopen123"
    assert t["tx_hash_close"] == "0xclose456"


async def test_activity_stats_invalid_wallet(client: httpx.AsyncClient):
    """Stats with invalid wallet returns 400."""
    resp = await client.get("/activity/stats?wallet=bad")
    assert resp.status_code == 400


async def test_activity_stats_new_wallet(client: httpx.AsyncClient):
    """Stats for wallet with no activity returns zeros."""
    new_wallet = "0x2222222222222222222222222222222222222222"
    resp = await client.get(f"/activity/stats?wallet={new_wallet}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 0
    assert data["total_volume"] == 0.0
    assert data["total_pnl"] == 0.0
    assert data["win_rate"] == 0.0


async def test_activity_trades_pagination(client: httpx.AsyncClient):
    """Trades endpoint supports limit and offset."""
    resp = await client.get(f"/activity/trades?wallet={TEST_WALLET}&limit=5&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["trades"]) <= 5
    assert data["page"] == 1


async def test_log_close_by_position(client: httpx.AsyncClient):
    """Full flow: log open, log close by position (no trade_id)."""
    # Log open with pair_index and trade_index
    open_resp = await client.post(
        "/trades/log-open",
        json={
            "wallet": TEST_WALLET,
            "pair": "SOL/USD",
            "pair_index": 2,
            "trade_index": 88,
            "direction": "LONG",
            "leverage": 500,
            "collateral": 5.0,
            "entry_price": 200.0,
            "tp_price": 400.0,
            "liq_price": 198.0,
            "tx_hash": "0xopen-by-pos",
        },
    )
    assert open_resp.status_code == 200

    # Close by position (no trade_id needed)
    close_resp = await client.post(
        "/trades/log-close-by-position",
        json={
            "wallet": TEST_WALLET,
            "pair_index": 2,
            "trade_index": 88,
            "exit_price": 210.0,
            "pnl": 12.5,
            "closed_at": "2026-03-04T12:00:00Z",
            "tx_hash": "0xclose-by-pos",
            "is_liquidated": False,
        },
    )
    assert close_resp.status_code == 200

    # Verify in trades list
    trades_resp = await client.get(f"/activity/trades?wallet={TEST_WALLET}&limit=20&offset=0")
    assert trades_resp.status_code == 200
    trades = [t for t in trades_resp.json()["trades"] if t.get("pair_index") == 2 and t.get("trade_index") == 88]
    assert len(trades) == 1
    assert trades[0]["status"] == "closed"
    assert trades[0]["pnl"] == 12.5
