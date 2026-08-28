"""
Activity tracking endpoints: log trades, fetch stats and history.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db, ActivityUser, ActivityTrade
from app.core.rate_limit import enforce_wallet_rate_limit, limiter
from app.models.schemas import (
    WALLET_REGEX,
    LogOpenRequest,
    LogOpenResponse,
    LogCloseRequest,
    LogCloseByPositionRequest,
    ActivityStatsResponse,
    ActivityTradeResponse,
    ActivityTradesResponse,
    OnboardingStatusResponse,
    OnboardingCompleteRequest,
)

logger = logging.getLogger(__name__)

WRITE_RATE_LIMIT = get_settings().rate_limit_write

# Router for log-open / log-close (under /trades)
trades_log_router = APIRouter(prefix="/trades", tags=["activity"])

# Router for stats and trades list (under /activity)
activity_router = APIRouter(prefix="/activity", tags=["activity"])


def _validated_wallet_query(wallet: str) -> str:
    """Normalise and validate a wallet supplied as a query parameter."""
    if not WALLET_REGEX.match(wallet or ""):
        raise HTTPException(status_code=400, detail="Invalid wallet address format")
    return wallet.lower()


def _parse_closed_at(closed_at_str: str | None) -> datetime | None:
    """Parse ISO 8601 timestamp to datetime."""
    if not closed_at_str:
        return None
    try:
        return datetime.fromisoformat(closed_at_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


# ---------- POST /trades/log-open ----------


@trades_log_router.post("/log-open", response_model=LogOpenResponse)
@limiter.limit(WRITE_RATE_LIMIT)
async def log_trade_open(
    request: Request,
    response: Response,
    payload: LogOpenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Log an opened trade. Upserts user and inserts trade. Returns trade_id.
    """
    wallet = payload.wallet
    enforce_wallet_rate_limit(wallet)
    direction = payload.direction

    volume = float(payload.collateral) * float(payload.leverage)

    try:
        # Upsert user
        result = await db.execute(select(ActivityUser).where(ActivityUser.wallet_address == wallet))
        user = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if user is None:
            user = ActivityUser(
                wallet_address=wallet,
                created_at=now,
                total_trades=1,
                total_volume=Decimal(str(volume)),
                total_pnl=Decimal("0"),
                last_trade_at=now,
            )
            db.add(user)
            await db.flush()  # Persist user before trade (FK requirement)
        else:
            await db.execute(
                update(ActivityUser)
                .where(ActivityUser.wallet_address == wallet)
                .values(
                    total_trades=ActivityUser.total_trades + 1,
                    total_volume=ActivityUser.total_volume + Decimal(str(volume)),
                    last_trade_at=now,
                )
            )

        # Insert trade
        trade = ActivityTrade(
            wallet_address=wallet,
            pair=payload.pair,
            pair_index=payload.pair_index,
            trade_index=payload.trade_index,
            direction=direction,
            leverage=payload.leverage,
            collateral=Decimal(str(payload.collateral)),
            volume=Decimal(str(volume)),
            entry_price=Decimal(str(payload.entry_price)),
            tp_price=Decimal(str(payload.tp_price)) if payload.tp_price is not None else None,
            liq_price=Decimal(str(payload.liq_price)) if payload.liq_price is not None else None,
            status="open",
            tx_hash_open=payload.tx_hash,
        )
        db.add(trade)
        await db.flush()  # Get trade.id
        trade_id = str(trade.id)

        await db.commit()
        return LogOpenResponse(trade_id=trade_id)
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception("log-open failed")
        raise HTTPException(status_code=500, detail="Failed to log trade open")


# ---------- POST /trades/log-close ----------


@trades_log_router.post("/log-close")
@limiter.limit(WRITE_RATE_LIMIT)
async def log_trade_close(
    request: Request,
    response: Response,
    payload: LogCloseRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Log a closed trade. Updates trade and user aggregates.
    pnl = gross PnL (pre-fee, pre-rollover): collateral * leverage * priceDelta / openPrice.
    """
    try:
        trade_uuid = UUID(payload.trade_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid trade_id UUID")

    result = await db.execute(select(ActivityTrade).where(ActivityTrade.id == trade_uuid))
    trade = result.scalar_one_or_none()
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")

    if trade.status != "open":
        raise HTTPException(status_code=400, detail=f"Trade already closed (status={trade.status})")

    enforce_wallet_rate_limit(trade.wallet_address)

    closed_at = _parse_closed_at(payload.closed_at) or datetime.now(timezone.utc)
    pnl = Decimal(str(payload.pnl)) if payload.pnl is not None else None
    exit_price = Decimal(str(payload.exit_price)) if payload.exit_price is not None else None
    status = "liquidated" if payload.is_liquidated else "closed"

    try:
        # Update trade
        trade.status = status
        trade.exit_price = exit_price
        trade.pnl = pnl
        trade.closed_at = closed_at
        trade.tx_hash_close = payload.tx_hash

        # Update user total_pnl
        await db.execute(
            update(ActivityUser)
            .where(ActivityUser.wallet_address == trade.wallet_address)
            .values(
                total_pnl=ActivityUser.total_pnl + (pnl if pnl is not None else Decimal("0")),
                last_trade_at=closed_at,
            )
        )

        await db.commit()
        return {"success": True}
    except Exception:
        await db.rollback()
        logger.exception("log-close failed")
        raise HTTPException(status_code=500, detail="Failed to log trade close")


# ---------- POST /trades/log-close-by-position ----------


@trades_log_router.post("/log-close-by-position")
@limiter.limit(WRITE_RATE_LIMIT)
async def log_trade_close_by_position(
    request: Request,
    response: Response,
    payload: LogCloseByPositionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Log a closed trade by Avantis position identifiers (wallet, pair_index, trade_index).
    Use when frontend does not have our trade_id from log-open.
    pnl = gross PnL (pre-fee, pre-rollover): collateral * leverage * priceDelta / openPrice.
    """
    wallet = payload.wallet
    enforce_wallet_rate_limit(wallet)

    result = await db.execute(
        select(ActivityTrade).where(
            ActivityTrade.wallet_address == wallet,
            ActivityTrade.pair_index == payload.pair_index,
            ActivityTrade.trade_index == payload.trade_index,
            ActivityTrade.status == "open",
        )
    )
    trade = result.scalar_one_or_none()
    if trade is None:
        raise HTTPException(
            status_code=404,
            detail="Open trade not found for this position. It may have been closed already.",
        )

    closed_at = _parse_closed_at(payload.closed_at) or datetime.now(timezone.utc)
    pnl = Decimal(str(payload.pnl)) if payload.pnl is not None else None
    exit_price = Decimal(str(payload.exit_price)) if payload.exit_price is not None else None
    status = "liquidated" if payload.is_liquidated else "closed"

    try:
        trade.status = status
        trade.exit_price = exit_price
        trade.pnl = pnl
        trade.closed_at = closed_at
        trade.tx_hash_close = payload.tx_hash

        await db.execute(
            update(ActivityUser)
            .where(ActivityUser.wallet_address == wallet)
            .values(
                total_pnl=ActivityUser.total_pnl + (pnl if pnl is not None else Decimal("0")),
                last_trade_at=closed_at,
            )
        )

        await db.commit()
        return {"success": True}
    except Exception:
        await db.rollback()
        logger.exception("log-close-by-position failed")
        raise HTTPException(status_code=500, detail="Failed to log trade close")


# ---------- GET /activity/onboarding-status ----------


@activity_router.get("/onboarding-status", response_model=OnboardingStatusResponse)
async def get_onboarding_status(
    wallet: str = Query(..., description="Wallet address (0x...)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Check if a wallet has completed onboarding.
    Returns true if: activity_users.onboarding_complete is true, OR wallet has any activity_trades (legacy).
    """
    wallet_lower = _validated_wallet_query(wallet)

    # Check activity_users for onboarding_complete
    result = await db.execute(select(ActivityUser).where(ActivityUser.wallet_address == wallet_lower))
    user = result.scalar_one_or_none()
    if user is not None and user.onboarding_complete:
        return OnboardingStatusResponse(completed=True)

    # Legacy: if wallet has any activity_trades, they've completed setup (they traded)
    trades_result = await db.execute(
        select(func.count(ActivityTrade.id)).where(ActivityTrade.wallet_address == wallet_lower)
    )
    trade_count = trades_result.scalar_one() or 0
    if trade_count > 0:
        return OnboardingStatusResponse(completed=True)

    return OnboardingStatusResponse(completed=False)


# ---------- POST /activity/onboarding-complete ----------


@activity_router.post("/onboarding-complete", response_model=OnboardingStatusResponse)
@limiter.limit(WRITE_RATE_LIMIT)
async def mark_onboarding_complete(
    request: Request,
    response: Response,
    payload: OnboardingCompleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mark onboarding as complete for a wallet. Upserts activity_users if needed.
    Called when SetupFlow completes successfully.
    """
    wallet = payload.wallet
    enforce_wallet_rate_limit(wallet)

    result = await db.execute(select(ActivityUser).where(ActivityUser.wallet_address == wallet))
    user = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if user is None:
        user = ActivityUser(
            wallet_address=wallet,
            created_at=now,
            total_trades=0,
            total_volume=Decimal("0"),
            total_pnl=Decimal("0"),
            onboarding_complete=True,
        )
        db.add(user)
    else:
        user.onboarding_complete = True

    await db.commit()
    return OnboardingStatusResponse(completed=True)


# ---------- GET /activity/stats ----------


@activity_router.get("/stats", response_model=ActivityStatsResponse)
async def get_activity_stats(
    wallet: str = Query(..., description="Wallet address (0x...)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get activity stats for a wallet: total_trades, volume, pnl, win_rate, open_trades.
    total_pnl and trade pnl = gross PnL (pre-fee, pre-rollover).
    """
    wallet_lower = _validated_wallet_query(wallet)

    # Get user aggregate
    result = await db.execute(select(ActivityUser).where(ActivityUser.wallet_address == wallet_lower))
    user = result.scalar_one_or_none()

    # Count open trades
    open_result = await db.execute(
        select(func.count(ActivityTrade.id)).where(
            ActivityTrade.wallet_address == wallet_lower,
            ActivityTrade.status == "open",
        )
    )
    open_trades = open_result.scalar_one() or 0

    if user is None:
        return ActivityStatsResponse(
            total_trades=0,
            total_volume=0.0,
            total_pnl=0.0,
            win_rate=0.0,
            open_trades=open_trades,
        )

    # Win rate from closed trades
    closed_result = await db.execute(
        select(ActivityTrade).where(
            ActivityTrade.wallet_address == wallet_lower,
            ActivityTrade.status.in_(["closed", "liquidated"]),
            ActivityTrade.pnl.isnot(None),
        )
    )
    closed_trades = closed_result.scalars().all()
    wins = sum(1 for t in closed_trades if float(t.pnl) > 0)
    total_closed = len(closed_trades)
    win_rate = wins / total_closed if total_closed > 0 else 0.0

    return ActivityStatsResponse(
        total_trades=int(user.total_trades),
        total_volume=float(user.total_volume),
        total_pnl=float(user.total_pnl),
        win_rate=round(win_rate, 2),
        open_trades=open_trades,
    )


# ---------- GET /activity/trades ----------


def _trade_to_response(t: ActivityTrade) -> ActivityTradeResponse:
    return ActivityTradeResponse(
        id=str(t.id),
        wallet_address=t.wallet_address,
        pair=t.pair,
        pair_index=int(t.pair_index) if t.pair_index is not None else None,
        trade_index=int(t.trade_index) if t.trade_index is not None else None,
        direction=t.direction,
        leverage=int(t.leverage),
        collateral=float(t.collateral),
        volume=float(t.volume),
        entry_price=float(t.entry_price),
        tp_price=float(t.tp_price) if t.tp_price is not None else None,
        liq_price=float(t.liq_price) if t.liq_price is not None else None,
        exit_price=float(t.exit_price) if t.exit_price is not None else None,
        pnl=float(t.pnl) if t.pnl is not None else None,
        opened_at=t.opened_at.isoformat() if t.opened_at else "",
        closed_at=t.closed_at.isoformat() if t.closed_at else None,
        status=t.status,
        tx_hash_open=t.tx_hash_open,
        tx_hash_close=t.tx_hash_close,
    )


@activity_router.get("/trades", response_model=ActivityTradesResponse)
async def get_activity_trades(
    wallet: str = Query(..., description="Wallet address (0x...)"),
    limit: int = Query(20, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get paginated trade history for a wallet, newest first.
    """
    wallet_lower = _validated_wallet_query(wallet)

    # Total count
    count_result = await db.execute(
        select(func.count(ActivityTrade.id)).where(ActivityTrade.wallet_address == wallet_lower)
    )
    total = count_result.scalar_one() or 0

    # Paginated trades (newest first)
    result = await db.execute(
        select(ActivityTrade)
        .where(ActivityTrade.wallet_address == wallet_lower)
        .order_by(ActivityTrade.opened_at.desc())
        .offset(offset)
        .limit(limit + 1)  # Fetch one extra to check has_more
    )
    rows = result.scalars().all()
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    trades = [_trade_to_response(t) for t in rows]
    page = (offset // limit) + 1 if limit > 0 else 1

    return ActivityTradesResponse(
        trades=trades,
        total=total,
        page=page,
        has_more=has_more,
    )

