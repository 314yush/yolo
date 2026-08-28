"""
YOLO Trading API - FastAPI Backend

Activity logging and optional price/trade reads. Signup is open: there is no
access-code gate. Trade execution is client-side: the frontend builds EIP-712
intents, signs them with the user's Privy embedded wallet, and submits them to
the Avantis batched-market relayer. No private keys are stored or used here.
"""

import ssl
import certifi

# Fix SSL certificate verification on macOS - must be done before other imports
ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from app.core.config import get_settings
from app.core.rate_limit import MaxBodySizeMiddleware, limiter
from app.models.schemas import HealthResponse
from app.routers import trades, prices, activity


settings = get_settings()

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("%s starting (environment=%s, debug=%s)", settings.app_name, settings.environment, settings.debug)
    logger.info("Chain: Base (id=%s), RPC: %s", settings.chain_id, settings.redacted_rpc_url)

    if settings.database_url:
        from app.core.database import init_db, check_db_connection

        if await check_db_connection():
            await init_db()
            logger.info("Database connected; activity logging enabled")
        elif settings.is_production:
            raise RuntimeError(
                "DATABASE_URL is set but the database is unreachable; refusing to serve "
                "in production without activity storage."
            )
        else:
            logger.warning("Database unreachable; activity routes will return 500")
    else:
        logger.warning("DATABASE_URL not set; activity routes are not mounted (non-production only)")

    yield

    logger.info("Shutting down")


app = FastAPI(
    title=settings.app_name,
    description="Activity tracking and optional Avantis price helpers",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_request_body_bytes)

_cors_origins = settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


@app.get("/health", response_model=HealthResponse, tags=["health"])
@limiter.exempt
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="ok", version="1.0.0")


app.include_router(trades.trades_router)
app.include_router(prices.router)

# Activity tracking needs Postgres. Production startup already fails without
# DATABASE_URL, so this branch only skips the routes in local/dev runs.
if settings.database_url:
    app.include_router(activity.trades_log_router)
    app.include_router(activity.activity_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
