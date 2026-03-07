"""
Pytest configuration and fixtures for activity tracking tests.
Tests require DATABASE_URL to be set. Use a test wallet to avoid polluting prod data.
"""

import os
import pytest
import httpx
from httpx import ASGITransport

# Test wallet - distinct from any real user
TEST_WALLET = "0x1111111111111111111111111111111111111111"


@pytest.fixture(scope="session")
async def client():
    """Async HTTP client for FastAPI app. Skips if DATABASE_URL not set."""
    if not os.getenv("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set - cannot run activity tests")
    from app.main import app
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_wallet():
    """Wallet address for test data."""
    return TEST_WALLET
