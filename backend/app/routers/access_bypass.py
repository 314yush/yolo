"""
Bypass access control when DATABASE_URL is not set.
Returns open access (everyone passes) for local dev without Postgres.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/access", tags=["access-bypass"])


class CheckAccessResponse(BaseModel):
    hasAccess: bool


class RedeemCodeRequest(BaseModel):
    code: str
    wallet_address: str


class RedeemCodeResponse(BaseModel):
    success: bool
    error: str | None = None
    message: str | None = None


@router.get("/check/{wallet_address}", response_model=CheckAccessResponse)
async def check_wallet_access(wallet_address: str):
    """Bypass: always grant access when DB not configured."""
    return CheckAccessResponse(hasAccess=True)


@router.post("/redeem", response_model=RedeemCodeResponse)
async def redeem_access_code(request: RedeemCodeRequest):
    """Bypass: always success when DB not configured."""
    return RedeemCodeResponse(success=True, message="Access granted (bypass mode - no DB)")
