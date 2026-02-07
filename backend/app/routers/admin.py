"""
Admin endpoints for managing access codes.
Protected by X-Admin-Key header.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
import secrets

from app.core.database import get_db, AccessCode
from app.core.config import get_settings


router = APIRouter(prefix="/admin", tags=["admin"])

# Memorable word lists for funny/memorable codes
TRADING_WORDS = [
    "MOON", "REKT", "BAG", "PUMP", "DIP", "HODL", "FOMO", "FUD", "APY", "TVL",
    "WEN", "NGMI", "GM", "GN", "SEND", "BASED", "CHAD", "DEGEN", "APE", "GIGA",
    "MAXI", "SHILL", "RUG", "SNIPE", "FLIP", "SWEEP", "DUMP", "CRASH", "RALLY", "SPIKE"
]

ADJECTIVES = [
    "MEGA", "ULTRA", "SUPER", "HYPER", "GIGA", "MAX", "MINI", "TURBO", "EPIC", "LEGEND",
    "WILD", "CRAZY", "INSANE", "BONKERS", "SICK", "FIRE", "LIT", "GOAT", "KING", "QUEEN"
]

NOUNS = [
    "CHAD", "APE", "DEGEN", "WHALE", "SHARK", "BULL", "BEAR", "CRAB", "FROG", "DOGE",
    "BAG", "DIAMOND", "PAPER", "HANDS", "FEET", "BRAIN", "SMOOTH", "WRINKLED", "ALPHA", "SIGMA"
]

ACTIONS = [
    "SEND", "HODL", "BUY", "SELL", "FLIP", "SWEEP", "SNIPE", "RUG", "PUMP", "DUMP",
    "MOON", "REKT", "CRASH", "RALLY", "SPIKE", "DIP", "BAG", "FOMO", "FUD", "NGMI"
]

# Combine all word lists for variety
ALL_WORDS = TRADING_WORDS + ADJECTIVES + NOUNS + ACTIONS


def generate_code() -> str:
    """
    Generate a memorable/funny access code.
    Format: YOLO-{WORD1}-{WORD2}
    Examples: YOLO-MOON-APE, YOLO-REKT-CHAD, YOLO-GIGA-DEGEN
    """
    word1 = secrets.choice(ALL_WORDS)
    word2 = secrets.choice(ALL_WORDS)
    
    # Avoid same word twice
    while word2 == word1:
        word2 = secrets.choice(ALL_WORDS)
    
    return f"YOLO-{word1}-{word2}"


async def verify_admin_key(x_admin_key: str = Header(...)):
    """Dependency to verify admin API key."""
    settings = get_settings()
    if not settings.admin_api_key:
        raise HTTPException(status_code=503, detail="Admin API not configured")
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")
    return True


# Request/Response models
class GenerateCodesRequest(BaseModel):
    count: int = 10
    campaign: Optional[str] = None


class GenerateCodesResponse(BaseModel):
    codes: list[str]
    count: int


class CodeStats(BaseModel):
    total: int
    used: int
    available: int
    by_campaign: dict[str, dict[str, int]]


class CodeInfo(BaseModel):
    code: str
    is_used: bool
    used_by_wallet: Optional[str]
    campaign: Optional[str]
    created_at: str


class ListCodesResponse(BaseModel):
    codes: list[CodeInfo]
    total: int
    page: int
    pages: int


@router.post("/codes/generate", response_model=GenerateCodesResponse)
async def generate_codes(
    request: GenerateCodesRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Generate new access codes."""
    if request.count < 1 or request.count > 1000:
        raise HTTPException(status_code=400, detail="Count must be between 1 and 1000")
    
    codes = []
    attempts = 0
    max_attempts = request.count * 3  # Allow some retries for collisions
    
    while len(codes) < request.count and attempts < max_attempts:
        attempts += 1
        code = generate_code()
        
        # Check if code already exists
        existing = await db.execute(
            select(AccessCode).where(AccessCode.code == code)
        )
        if existing.scalar_one_or_none():
            continue
        
        # Create new code
        access_code = AccessCode(
            code=code,
            campaign=request.campaign
        )
        db.add(access_code)
        codes.append(code)
    
    await db.commit()
    
    return GenerateCodesResponse(codes=codes, count=len(codes))


@router.get("/codes/stats", response_model=CodeStats)
async def get_code_stats(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get statistics about access codes."""
    # Total codes
    total_result = await db.execute(select(func.count(AccessCode.id)))
    total = total_result.scalar() or 0
    
    # Used codes
    used_result = await db.execute(
        select(func.count(AccessCode.id)).where(AccessCode.is_used == True)
    )
    used = used_result.scalar() or 0
    
    # By campaign
    campaign_stats = {}
    campaigns_result = await db.execute(
        select(
            AccessCode.campaign,
            func.count(AccessCode.id).label('total'),
            func.count(AccessCode.id).filter(AccessCode.is_used == True).label('used')
        ).group_by(AccessCode.campaign)
    )
    for row in campaigns_result:
        campaign_name = row.campaign or "none"
        campaign_stats[campaign_name] = {
            "total": row.total,
            "used": row.used
        }
    
    return CodeStats(
        total=total,
        used=used,
        available=total - used,
        by_campaign=campaign_stats
    )


@router.get("/codes", response_model=ListCodesResponse)
async def list_codes(
    page: int = 1,
    per_page: int = 50,
    used: Optional[bool] = None,
    campaign: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """List access codes with pagination and filters."""
    if page < 1:
        page = 1
    if per_page < 1 or per_page > 100:
        per_page = 50
    
    # Build query
    query = select(AccessCode)
    count_query = select(func.count(AccessCode.id))
    
    if used is not None:
        query = query.where(AccessCode.is_used == used)
        count_query = count_query.where(AccessCode.is_used == used)
    
    if campaign:
        query = query.where(AccessCode.campaign == campaign)
        count_query = count_query.where(AccessCode.campaign == campaign)
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Get codes
    offset = (page - 1) * per_page
    query = query.order_by(AccessCode.created_at.desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    codes = result.scalars().all()
    
    # Calculate pages
    pages = (total + per_page - 1) // per_page if total > 0 else 1
    
    return ListCodesResponse(
        codes=[
            CodeInfo(
                code=c.code,
                is_used=c.is_used,
                used_by_wallet=c.used_by_wallet,
                campaign=c.campaign,
                created_at=c.created_at.isoformat() if c.created_at else ""
            )
            for c in codes
        ],
        total=total,
        page=page,
        pages=pages
    )


@router.post("/grant-access")
async def grant_access_direct(
    wallet_address: str,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Grant access to a wallet directly (bypass code requirement)."""
    wallet_address = wallet_address.lower()
    
    # Check if already has access
    existing = await db.execute(
        select(AccessCode).where(
            AccessCode.used_by_wallet == wallet_address,
            AccessCode.is_used == True
        )
    )
    if existing.scalar_one_or_none():
        return {"success": True, "message": "Wallet already has access"}
    
    # Create a special code for this wallet
    from datetime import datetime, timezone
    code = generate_code()
    access_code = AccessCode(
        code=code,
        is_used=True,
        used_at=datetime.now(timezone.utc),
        used_by_wallet=wallet_address,
        campaign=f"direct:{reason}" if reason else "direct"
    )
    db.add(access_code)
    await db.commit()
    
    return {"success": True, "message": f"Access granted to {wallet_address}"}
