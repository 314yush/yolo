"""
Access code endpoints for gating app access.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import time

from app.core.database import get_db, AccessCode
from app.core.config import get_settings


router = APIRouter(prefix="/access", tags=["access"])


# Simple in-memory rate limiting
_rate_limit_store: dict[str, list[float]] = {}
RATE_LIMIT_WINDOW = 300  # 5 minutes
RATE_LIMIT_MAX_ATTEMPTS = 5


def _check_rate_limit(ip: str) -> bool:
    """Check if IP is rate limited. Returns True if allowed, False if limited."""
    now = time.time()
    
    # Clean old entries
    if ip in _rate_limit_store:
        _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if now - t < RATE_LIMIT_WINDOW]
    
    # Check limit
    attempts = _rate_limit_store.get(ip, [])
    if len(attempts) >= RATE_LIMIT_MAX_ATTEMPTS:
        return False
    
    # Record attempt
    if ip not in _rate_limit_store:
        _rate_limit_store[ip] = []
    _rate_limit_store[ip].append(now)
    
    return True


# Request/Response models
class CheckAccessResponse(BaseModel):
    hasAccess: bool


class RedeemCodeRequest(BaseModel):
    code: str
    wallet_address: str


class RedeemCodeResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    message: Optional[str] = None


@router.get("/check/{wallet_address}", response_model=CheckAccessResponse)
async def check_wallet_access(
    wallet_address: str,
    db: AsyncSession = Depends(get_db)
):
    """Check if a wallet address has access (was used to redeem a code)."""
    # Normalize address to lowercase
    wallet_address = wallet_address.lower()
    
    # Query for any code redeemed by this wallet
    result = await db.execute(
        select(AccessCode).where(
            AccessCode.used_by_wallet == wallet_address,
            AccessCode.is_used == True
        ).limit(1)
    )
    code = result.scalar_one_or_none()
    
    return CheckAccessResponse(hasAccess=code is not None)


@router.post("/redeem", response_model=RedeemCodeResponse)
async def redeem_access_code(
    request: RedeemCodeRequest,
    req: Request,
    db: AsyncSession = Depends(get_db)
):
    """Redeem an access code and bind it to a wallet address."""
    # Get client IP for rate limiting
    client_ip = req.client.host if req.client else "unknown"
    
    # Check rate limit
    if not _check_rate_limit(client_ip):
        return RedeemCodeResponse(
            success=False,
            error="rate_limited",
            message="Too many attempts. Please wait a few minutes."
        )
    
    # Normalize inputs
    code = request.code.upper().strip()
    wallet_address = request.wallet_address.lower()
    
    # Validate code format (YOLO-WORD-WORD)
    # Format: YOLO-{word}-{word} (e.g., YOLO-MOON-APE, YOLO-GIGA-DEGEN)
    if not code.startswith("YOLO-"):
        return RedeemCodeResponse(
            success=False,
            error="invalid_code",
            message="Invalid code format. Codes start with YOLO-"
        )
    
    # Check format: YOLO-{word}-{word} (at least 13 chars, max 30)
    parts = code.split("-")
    if len(parts) != 3 or len(code) < 13 or len(code) > 30:
        return RedeemCodeResponse(
            success=False,
            error="invalid_code",
            message="Invalid code format. Expected: YOLO-WORD-WORD"
        )
    
    # Check if wallet already has access
    existing_access = await db.execute(
        select(AccessCode).where(
            AccessCode.used_by_wallet == wallet_address,
            AccessCode.is_used == True
        ).limit(1)
    )
    if existing_access.scalar_one_or_none():
        return RedeemCodeResponse(
            success=True,
            message="You already have access!"
        )
    
    # Find the code
    result = await db.execute(
        select(AccessCode).where(AccessCode.code == code)
    )
    access_code = result.scalar_one_or_none()
    
    if not access_code:
        return RedeemCodeResponse(
            success=False,
            error="invalid_code",
            message="Code not recognized. Check for typos."
        )
    
    if access_code.is_used:
        return RedeemCodeResponse(
            success=False,
            error="already_used",
            message="This code has already been used."
        )
    
    # Redeem the code
    access_code.is_used = True
    access_code.used_at = datetime.now(timezone.utc)
    access_code.used_by_wallet = wallet_address
    
    await db.commit()
    
    return RedeemCodeResponse(
        success=True,
        message="Access granted! Welcome to YOLO."
    )
