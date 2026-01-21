"""
Delegation setup endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.schemas import (
    DelegateSetupRequest,
    BuildTxResponse,
    DelegateStatusResponse,
)
from app.services.avantis import avantis_service


router = APIRouter(prefix="/delegate", tags=["delegate"])


class ApprovalRequest(BaseModel):
    """Request to build a USDC approval transaction."""
    trader: str


class TradingContractResponse(BaseModel):
    """Response containing the Trading Storage contract address."""
    address: str


@router.post("/setup", response_model=BuildTxResponse)
async def build_delegate_setup_tx(request: DelegateSetupRequest):
    """
    Build unsigned transaction for setting up delegation.
    The trader signs this with their Privy wallet.
    """
    try:
        tx = await avantis_service.build_set_delegate_tx(request.delegate_address)
        return BuildTxResponse(tx=tx)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{trader}", response_model=DelegateStatusResponse)
async def get_delegate_status(trader: str):
    """
    Check if a trader has delegation set up.
    """
    try:
        delegate = await avantis_service.get_delegate(trader)
        return DelegateStatusResponse(
            is_setup=delegate is not None,
            delegate_address=delegate,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/approve-usdc", response_model=BuildTxResponse)
async def build_usdc_approval_tx(request: ApprovalRequest):
    """
    Build unsigned USDC approval transaction.
    The trader signs this with their Privy wallet to allow trading.
    
    Note: USDC must be approved for the Trading contract (not TradingStorage).
    The Trading contract is what actually transfers USDC when opening positions.
    """
    try:
        # Get the Trading contract address that needs approval
        trading_contract = await avantis_service.get_trading_contract_address()
        tx = avantis_service.build_usdc_approval_tx(trading_contract)
        return BuildTxResponse(tx=tx)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trading-contract", response_model=TradingContractResponse)
async def get_trading_contract():
    """
    Get the Trading contract address for USDC approval.
    """
    try:
        address = await avantis_service.get_trading_contract_address()
        return TradingContractResponse(address=address)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AllowanceResponse(BaseModel):
    allowance: float
    has_sufficient: bool


@router.get("/check-allowance/{trader}")
async def check_usdc_allowance(trader: str):
    """
    Check if trader has sufficient USDC allowance for trading.
    Returns allowance amount and whether it's sufficient.
    """
    try:
        trading_contract = await avantis_service.get_trading_contract_address()
        allowance = await avantis_service.client.read_contract(
            "USDC", "allowance", trader, trading_contract, decode=False
        )
        allowance_usdc = allowance / 10**6
        # Consider sufficient if allowance > 10000 USDC
        has_sufficient = allowance_usdc > 10000
        return AllowanceResponse(allowance=allowance_usdc, has_sufficient=has_sufficient)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
