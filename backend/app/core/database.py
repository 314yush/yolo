"""
Database configuration and session management using SQLAlchemy async.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, Integer, String, Boolean, DateTime, text
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


async def init_db():
    """Initialize database tables."""
    engine = _get_async_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
