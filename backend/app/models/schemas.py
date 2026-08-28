import re
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional

# Ethereum address: 0x + 40 hex chars
WALLET_REGEX = re.compile(r"^0x[a-fA-F0-9]{40}$")

# Pair names are stored in a varchar(20) column
PAIR_REGEX = re.compile(r"^[A-Z0-9_]{2,12}/[A-Z0-9_]{2,7}$")

# 32-byte transaction hash
TX_HASH_REGEX = re.compile(r"^0x[a-fA-F0-9]{64}$")

MAX_LEVERAGE = 1000
MAX_COLLATERAL = 1_000_000.0
MAX_PRICE = 1e12
MAX_ABS_PNL = 1e12


def _validate_wallet(v: str) -> str:
    if not WALLET_REGEX.match(v):
        raise ValueError("Invalid wallet address: must be 0x followed by 40 hex characters")
    return v.lower()


def _validate_tx_hash(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    if not TX_HASH_REGEX.match(v):
        raise ValueError("Invalid tx_hash: must be 0x followed by 64 hex characters")
    return v.lower()


def _validate_pair(v: str) -> str:
    s = v.strip().upper()
    if not PAIR_REGEX.match(s):
        raise ValueError("Invalid pair: expected format like BTC/USD")
    return s


# ============ Response Schemas ============

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


# ============ Activity Tracking Schemas ============

class LogOpenRequest(BaseModel):
    """Request to log an opened trade."""

    model_config = ConfigDict(extra="forbid")

    wallet: str = Field(..., description="Wallet address (0x...)")
    pair: str = Field(..., max_length=20, description="Trading pair e.g. BTC/USD")
    pair_index: int = Field(..., ge=0, le=10_000, description="Avantis pair index")
    trade_index: int = Field(..., ge=0, le=10_000, description="Avantis trade index")
    direction: str = Field(..., description="LONG or SHORT")
    leverage: int = Field(..., ge=1, le=MAX_LEVERAGE, description="Leverage")
    collateral: float = Field(..., gt=0, le=MAX_COLLATERAL, description="Collateral in USDC")
    entry_price: float = Field(..., gt=0, le=MAX_PRICE, description="Entry price")
    tp_price: Optional[float] = Field(None, ge=0, le=MAX_PRICE)
    liq_price: Optional[float] = Field(None, ge=0, le=MAX_PRICE)
    tx_hash: Optional[str] = Field(None, description="Open transaction hash")

    @field_validator("wallet")
    @classmethod
    def validate_wallet(cls, v: str) -> str:
        return _validate_wallet(v)

    @field_validator("pair")
    @classmethod
    def validate_pair(cls, v: str) -> str:
        return _validate_pair(v)

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, v: str) -> str:
        s = v.strip().upper()
        if s not in ("LONG", "SHORT"):
            raise ValueError("direction must be LONG or SHORT")
        return s

    @field_validator("tx_hash")
    @classmethod
    def validate_tx_hash(cls, v: Optional[str]) -> Optional[str]:
        return _validate_tx_hash(v)


UUID_REGEX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class LogCloseRequest(BaseModel):
    """Request to log a closed trade."""

    model_config = ConfigDict(extra="forbid")

    trade_id: str = Field(..., description="UUID of the trade from log-open")
    exit_price: Optional[float] = Field(None, ge=0, le=MAX_PRICE)
    pnl: Optional[float] = Field(
        None, ge=-MAX_ABS_PNL, le=MAX_ABS_PNL, description="Gross PnL (pre-fee, pre-rollover)"
    )
    closed_at: Optional[str] = Field(None, max_length=40, description="ISO 8601 timestamp")
    tx_hash: Optional[str] = Field(None, description="Close transaction hash")
    is_liquidated: bool = Field(False, description="If true, set status to liquidated")

    @field_validator("trade_id")
    @classmethod
    def validate_trade_id(cls, v: str) -> str:
        if not UUID_REGEX.match(v):
            raise ValueError("Invalid trade_id: must be a valid UUID")
        return v

    @field_validator("tx_hash")
    @classmethod
    def validate_tx_hash(cls, v: Optional[str]) -> Optional[str]:
        return _validate_tx_hash(v)


class LogCloseByPositionRequest(BaseModel):
    """Request to log a closed trade by position identifiers."""

    model_config = ConfigDict(extra="forbid")

    wallet: str = Field(..., description="Wallet address (0x...)")
    pair_index: int = Field(..., ge=0, le=10_000)
    trade_index: int = Field(..., ge=0, le=10_000)
    exit_price: Optional[float] = Field(None, ge=0, le=MAX_PRICE)
    pnl: Optional[float] = Field(
        None, ge=-MAX_ABS_PNL, le=MAX_ABS_PNL, description="Gross PnL (pre-fee, pre-rollover)"
    )
    closed_at: Optional[str] = Field(None, max_length=40, description="ISO 8601 timestamp")
    tx_hash: Optional[str] = Field(None, description="Close transaction hash")
    is_liquidated: bool = Field(False, description="If true, set status to liquidated")

    @field_validator("wallet")
    @classmethod
    def validate_wallet(cls, v: str) -> str:
        return _validate_wallet(v)

    @field_validator("tx_hash")
    @classmethod
    def validate_tx_hash(cls, v: Optional[str]) -> Optional[str]:
        return _validate_tx_hash(v)


class LogOpenResponse(BaseModel):
    """Response from log-open."""
    trade_id: str = Field(..., description="UUID of the created trade")


class ActivityStatsResponse(BaseModel):
    """Activity stats for a wallet."""
    total_trades: int = 0
    total_volume: float = 0.0
    total_pnl: float = 0.0
    win_rate: float = 0.0
    open_trades: int = 0


class ActivityTradeResponse(BaseModel):
    """Single trade in activity list."""
    id: str
    wallet_address: str
    pair: str
    pair_index: Optional[int] = None
    trade_index: Optional[int] = None
    direction: str
    leverage: int
    collateral: float
    volume: float
    entry_price: float
    tp_price: Optional[float] = None
    liq_price: Optional[float] = None
    exit_price: Optional[float] = None
    pnl: Optional[float] = None  # Gross PnL (pre-fee, pre-rollover)
    opened_at: str
    closed_at: Optional[str] = None
    status: str
    tx_hash_open: Optional[str] = None
    tx_hash_close: Optional[str] = None


class ActivityTradesResponse(BaseModel):
    """Paginated trades list."""
    trades: list[ActivityTradeResponse]
    total: int
    page: int
    has_more: bool


class OnboardingStatusResponse(BaseModel):
    """Response for onboarding status check."""
    completed: bool = Field(..., description="Whether user has completed onboarding")


class OnboardingCompleteRequest(BaseModel):
    """Request to mark onboarding as complete."""

    model_config = ConfigDict(extra="forbid")

    wallet: str = Field(..., description="Wallet address (0x...)")

    @field_validator("wallet")
    @classmethod
    def validate_wallet(cls, v: str) -> str:
        return _validate_wallet(v)
