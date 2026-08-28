"""
Tests for the public-endpoint defences: rate limiting and body size caps.
"""

import httpx
import pytest

from app.core.rate_limit import _wallet_hits, enforce_wallet_rate_limit, limiter

RATE_LIMIT_WALLET = "0x3333333333333333333333333333333333333333"


@pytest.fixture(autouse=True)
def clean_limiter_state():
    limiter.reset()
    _wallet_hits.clear()
    yield
    limiter.reset()
    _wallet_hits.clear()


async def test_oversized_body_is_rejected(client: httpx.AsyncClient):
    resp = await client.post(
        "/activity/onboarding-complete",
        content=b'{"wallet": "' + b"x" * 100_000 + b'"}',
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413


async def test_write_endpoint_is_rate_limited(client: httpx.AsyncClient):
    statuses = []
    for _ in range(35):
        resp = await client.post(
            "/activity/onboarding-complete",
            json={"wallet": RATE_LIMIT_WALLET},
        )
        statuses.append(resp.status_code)
        if resp.status_code == 429:
            break

    assert 429 in statuses, f"expected a 429 within 35 requests, saw {sorted(set(statuses))}"


def test_per_wallet_limit_raises_after_threshold(monkeypatch):
    from app.core import rate_limit

    monkeypatch.setattr(rate_limit.settings, "wallet_rate_limit_max", 3)
    monkeypatch.setattr(rate_limit.settings, "wallet_rate_limit_window_seconds", 60)

    for _ in range(3):
        enforce_wallet_rate_limit(RATE_LIMIT_WALLET)

    with pytest.raises(Exception) as exc:
        enforce_wallet_rate_limit(RATE_LIMIT_WALLET)
    assert getattr(exc.value, "status_code", None) == 429
