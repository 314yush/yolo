from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ============ Request Schemas ============

class DelegateSetupRequest(BaseModel):
    """Request to build a delegate setup transaction."""
    trader: str = Field(..., description="Trader wallet address (user's Privy wallet)")
    delegate_address: str = Field(..., description="Delegate wallet address")


class OpenTradeRequest(BaseModel):
    """Request to build an open trade transaction."""
    trader: str = Field(..., description="Trader wallet address")
    delegate: str = Field(..., description="Delegate wallet address")
    pair: str = Field(..., description="Trading pair (e.g., 'BTC/USD')")
    pair_index: int = Field(..., description="Pair index from Avantis")
    leverage: int = Field(..., ge=75, le=250, description="Leverage (75-250)")
    is_long: bool = Field(..., description="True for long, False for short")
    collateral: float = Field(..., gt=0, description="Collateral amount in USDC")


class CloseTradeRequest(BaseModel):
    """Request to build a close trade transaction."""
    trader: str = Field(..., description="Trader wallet address")
    delegate: str = Field(..., description="Delegate wallet address")
    pair_index: int = Field(..., description="Pair index")
    trade_index: int = Field(..., description="Trade index")
    collateral_to_close: float = Field(..., gt=0, description="Collateral to close")


class UpdateTPSLRequest(BaseModel):
    """Request to build a TP/SL update transaction."""
    trader: str = Field(..., description="Trader wallet address")
    delegate: str = Field(..., description="Delegate wallet address")
    pair_index: int = Field(..., description="Pair index")
    trade_index: int = Field(..., description="Trade index")
    take_profit: float = Field(..., ge=0, description="Take profit price")
    stop_loss: float = Field(..., ge=0, description="Stop loss price")


# ============ Response Schemas ============

class UnsignedTx(BaseModel):
    """Unsigned transaction data to be signed by frontend."""
    to: str = Field(..., description="Contract address")
    data: str = Field(..., description="Encoded calldata")
    value: str = Field(default="0x0", description="ETH value to send")
    chain_id: int = Field(default=8453, description="Chain ID (Base)")


class BuildTxResponse(BaseModel):
    """Response containing an unsigned transaction."""
    tx: UnsignedTx


class DelegateStatusResponse(BaseModel):
    """Response for delegate status check."""
    is_setup: bool = Field(..., description="Whether delegation is set up")
    delegate_address: Optional[str] = Field(None, description="Current delegate address")


class PairInfo(BaseModel):
    """Trading pair information."""
    name: str
    pair_index: int


class PairsResponse(BaseModel):
    """Response containing available pairs."""
    pairs: list[PairInfo]


class PriceResponse(BaseModel):
    """Response containing price data."""
    pair: str
    price: float
    timestamp: int


class Trade(BaseModel):
    """Open trade information."""
    trade_index: int
    pair_index: int
    pair: str
    collateral: float
    leverage: int
    is_long: bool
    open_price: float
    tp: float
    sl: float
    opened_at: int


class TradesResponse(BaseModel):
    """Response containing open trades."""
    trades: list[Trade]


class PnLData(BaseModel):
    """PnL data for a single trade."""
    trade: Trade
    current_price: float
    pnl: float
    pnl_percentage: float


class PnLResponse(BaseModel):
    """Response containing PnL for all positions."""
    positions: list[PnLData]


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "1.0.0"


class ErrorResponse(BaseModel):
    """Error response."""
    detail: str
