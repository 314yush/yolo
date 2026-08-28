"""
Price and pairs endpoints.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import PairsResponse, PairInfo, PriceResponse
from app.services.avantis import avantis_service
from app.services.price_feed import price_feed_service

logger = logging.getLogger(__name__)


router = APIRouter(tags=["prices"])

MAX_PAIR_LENGTH = 32


@router.get("/pairs", response_model=PairsResponse)
async def get_pairs():
    """
    Get available trading pairs for zero-fee perps.
    """
    try:
        pairs = await avantis_service.get_available_pairs()
        return PairsResponse(
            pairs=[PairInfo(name=p["name"], pair_index=p["pair_index"]) for p in pairs]
        )
    except Exception:
        logger.exception("Failed to fetch pairs")
        raise HTTPException(status_code=500, detail="Unable to fetch pairs right now")


@router.get("/price/{pair:path}", response_model=PriceResponse)
async def get_price(pair: str):
    """
    Get current price for a trading pair.

    Args:
        pair: Trading pair in format "BTC/USD", "ETH/USD", etc.
    """
    # URL decode the pair (in case it's passed as BTC%2FUSD)
    pair = pair.replace("%2F", "/")

    if len(pair) > MAX_PAIR_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid pair")

    try:
        result = await price_feed_service.get_price(pair)
    except Exception:
        logger.exception("Failed to fetch price for %s", pair)
        raise HTTPException(status_code=500, detail="Unable to fetch price right now")

    if result is None:
        raise HTTPException(status_code=404, detail=f"Price not found for {pair}")

    price, timestamp = result
    return PriceResponse(pair=pair, price=price, timestamp=timestamp)
