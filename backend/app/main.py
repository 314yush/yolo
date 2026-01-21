"""
YOLO Trading API - FastAPI Backend

This API builds unsigned transactions for the frontend to sign.
No private keys are stored or used on the backend.
"""

import ssl
import certifi

# Fix SSL certificate verification on macOS - must be done before other imports
ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.models.schemas import HealthResponse
from app.routers import delegate, trades, prices


settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="API for building unsigned Avantis trading transactions",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True if settings.cors_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="ok", version="1.0.0")


# Include routers
app.include_router(delegate.router)
app.include_router(trades.router)
app.include_router(trades.trades_router)
app.include_router(prices.router)


# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    print(f"🚀 {settings.app_name} starting...")
    print(f"   Chain: Base (ID: {settings.chain_id})")
    print(f"   RPC: {settings.base_rpc_url}")
    print(f"   Debug: {settings.debug}")


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    print("👋 Shutting down...")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
