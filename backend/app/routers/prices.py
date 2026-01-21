"""
Price and pairs endpoints.
"""

from fastapi import APIRouter, HTTPException

from app.models.schemas import PairsResponse, PairInfo, PriceResponse
from app.services.avantis import avantis_service
from app.services.price_feed import price_feed_service


router = APIRouter(tags=["prices"])


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/price/{pair:path}", response_model=PriceResponse)
async def get_price(pair: str):
    """
    Get current price for a trading pair.
    
    Args:
        pair: Trading pair in format "BTC/USD", "ETH/USD", etc.
    """
    # URL decode the pair (in case it's passed as BTC%2FUSD)
    pair = pair.replace("%2F", "/")
    
    try:
        result = await price_feed_service.get_price(pair)
        
        if result is None:
            raise HTTPException(status_code=404, detail=f"Price not found for {pair}")
        
        price, timestamp = result
        return PriceResponse(pair=pair, price=price, timestamp=timestamp)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
