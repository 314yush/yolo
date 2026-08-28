"""
Pytest configuration and fixtures for activity tracking tests.
Tests require DATABASE_URL to be set. Use a test wallet to avoid polluting prod data.
"""

import os

# Set before anything imports app.core.config: CI has no .env, and Settings
# refuses to build without BASE_RPC_URL. No test performs a real RPC call.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("BASE_RPC_URL", "https://base-mainnet.invalid/v2/test-key")

import pytest
import httpx
from httpx import ASGITransport

# Test wallets - distinct from any real user
TEST_WALLET = "0x1111111111111111111111111111111111111111"
UNUSED_WALLET = "0x2222222222222222222222222222222222222222"


async def _reset_test_wallets():
    """
    Delete rows for the synthetic wallets so the suite is idempotent. The partial
    unique index on open positions otherwise makes a second run fail.
    """
    from sqlalchemy import delete

    from app.core.database import ActivityTrade, ActivityUser, _get_session_factory

    session_factory = _get_session_factory()
    async with session_factory() as session:
        wallets = [TEST_WALLET, UNUSED_WALLET]
        await session.execute(delete(ActivityTrade).where(ActivityTrade.wallet_address.in_(wallets)))
        await session.execute(delete(ActivityUser).where(ActivityUser.wallet_address.in_(wallets)))
        await session.commit()


@pytest.fixture(scope="session")
async def client():
    """Async HTTP client for FastAPI app. Skips if DATABASE_URL not set."""
    if not os.getenv("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set - cannot run activity tests")
    from app.main import app
    from app.core.database import init_db

    # ASGITransport does not run the lifespan, so set up schema and data here.
    await init_db()
    await _reset_test_wallets()

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_wallet():
    """Wallet address for test data."""
    return TEST_WALLET
