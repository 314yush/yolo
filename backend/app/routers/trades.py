"""
Read-only trade endpoints (open positions and PnL via the v1 SDK).

Write paths (build-open / build-close / build-update-tpsl) were removed:
v1 calldata reverts on the v2 contracts. The frontend builds and signs
EIP-712 intents itself and submits them to the batched-market relayer.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    TradesResponse,
    PnLResponse,
    PnLData,
)
from app.services.avantis import avantis_service
from app.services.price_feed import price_feed_service

logger = logging.getLogger(__name__)


trades_router = APIRouter(prefix="/trades", tags=["trades"])


@trades_router.get("/{address}", response_model=TradesResponse)
async def get_trades(address: str):
    """
    Get open trades for a wallet address.
    """
    try:
        trades = await avantis_service.get_trades(address)
        return TradesResponse(trades=trades)
    except Exception:
        logger.exception("Failed to fetch trades")
        raise HTTPException(status_code=500, detail="Unable to fetch trades right now")


@trades_router.get("/{address}/pnl", response_model=PnLResponse)
async def get_pnl(address: str):
    """
    Get PnL for all open positions - fetch gross PnL directly from Avantis SDK.
    """
    try:
        # Get trades with PnL data from SDK
        trades_with_pnl = await avantis_service.get_trades_with_pnl(address)
        
        if not trades_with_pnl:
            return PnLResponse(positions=[])
        
        # Get current prices for display
        pair_names = list(set(item['trade'].pair for item in trades_with_pnl))
        prices = await price_feed_service.get_prices(pair_names)
        
        positions = []
        for item in trades_with_pnl:
            trade = item['trade']
            gross_pnl = item['gross_pnl']
            gross_pnl_percentage = item['gross_pnl_percentage']
            
            # Get current price for display
            price_data = prices.get(trade.pair)
            current_price = price_data[0] if price_data else trade.openPrice
            
            positions.append(PnLData(
                trade=trade,
                current_price=current_price,
                pnl=gross_pnl,
                pnl_percentage=gross_pnl_percentage,
            ))
        
        return PnLResponse(positions=positions)
    except Exception:
        logger.exception("Failed to compute PnL")
        raise HTTPException(status_code=500, detail="Unable to fetch PnL right now")
