"""
Database configuration and session management using SQLAlchemy async.
"""

from uuid import uuid4
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, Integer, String, Boolean, DateTime, text, Numeric, CheckConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


class AccessCode(Base):
    """Access code model for gating app access."""
    __tablename__ = "access_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False, index=True)  # Increased for memorable codes like YOLO-GIGA-DEGEN
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    used_by_wallet = Column(String(42), nullable=True, index=True)
    campaign = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ActivityUser(Base):
    """Activity user model for tracking trades and volume."""
    __tablename__ = "activity_users"

    wallet_address = Column(String(42), primary_key=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    total_trades = Column(Integer, default=0, nullable=False)
    total_volume = Column(Numeric(20, 6), default=0, nullable=False)
    total_pnl = Column(Numeric(20, 6), default=0, nullable=False)
    last_trade_at = Column(DateTime(timezone=True), nullable=True)
    onboarding_complete = Column(Boolean, default=False, nullable=False)


class ActivityTrade(Base):
    """Activity trade model for tracking individual trades."""
    __tablename__ = "activity_trades"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    wallet_address = Column(String(42), ForeignKey("activity_users.wallet_address", ondelete="CASCADE"), nullable=False, index=True)
    pair = Column(String(20), nullable=False)
    pair_index = Column(Integer, nullable=True)  # Avantis pair index for close-by-position
    trade_index = Column(Integer, nullable=True)  # Avantis trade index for close-by-position
    direction = Column(String(5), nullable=False)
    leverage = Column(Integer, nullable=False)
    collateral = Column(Numeric(20, 6), nullable=False)
    volume = Column(Numeric(20, 6), nullable=False)
    entry_price = Column(Numeric(20, 10), nullable=False)
    tp_price = Column(Numeric(20, 10), nullable=True)
    liq_price = Column(Numeric(20, 10), nullable=True)
    exit_price = Column(Numeric(20, 10), nullable=True)
    pnl = Column(Numeric(20, 6), nullable=True)
    opened_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="open", nullable=False)
    tx_hash_open = Column(String(66), nullable=True)
    tx_hash_close = Column(String(66), nullable=True)

    __table_args__ = (
        CheckConstraint("direction IN ('LONG', 'SHORT')", name="activity_trades_direction_check"),
        CheckConstraint("status IN ('open', 'closed', 'liquidated')", name="activity_trades_status_check"),
    )


# Engine and session factory (initialized lazily)
_engine = None
_async_session_factory = None


def _get_async_engine():
    """Get or create the async engine."""
    global _engine
    if _engine is None:
        settings = get_settings()
        if not settings.database_url:
            raise ValueError("DATABASE_URL environment variable is not set")
        
        # Convert postgres:// to postgresql+asyncpg:// for async support
        db_url = settings.database_url
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif db_url.startswith("postgresql://") and "+asyncpg" not in db_url:
            db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        _engine = create_async_engine(
            db_url,
            echo=settings.debug,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _engine


def _get_session_factory():
    """Get or create the session factory."""
    global _async_session_factory
    if _async_session_factory is None:
        engine = _get_async_engine()
        _async_session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session."""
    session_factory = _get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def run_activity_position_migration():
    """Run migration 002: add pair_index, trade_index, and unique index for close-by-position."""
    engine = _get_async_engine()
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE activity_trades ADD COLUMN IF NOT EXISTS pair_index INTEGER"))
        await conn.execute(text("ALTER TABLE activity_trades ADD COLUMN IF NOT EXISTS trade_index INTEGER"))
        await conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_trades_position_open "
                "ON activity_trades(wallet_address, pair_index, trade_index) "
                "WHERE status = 'open'"
            )
        )
    print("✅ Activity position migration (002) applied")


async def run_onboarding_migration():
    """Run migration 003: add onboarding_complete to activity_users."""
    engine = _get_async_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE activity_users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false")
        )
    print("✅ Onboarding migration (003) applied")


async def init_db():
    """Initialize database tables."""
    engine = _get_async_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Run activity position migration if activity_trades exists
    try:
        await run_activity_position_migration()
    except Exception as e:
        print(f"⚠️ Activity migration skipped (may already be applied): {e}")
    try:
        await run_onboarding_migration()
    except Exception as e:
        print(f"⚠️ Onboarding migration skipped (may already be applied): {e}")
    print("✅ Database tables initialized")


async def check_db_connection() -> bool:
    """Check if database connection is working."""
    try:
        engine = _get_async_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False
