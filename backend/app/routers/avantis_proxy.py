"""
Avantis API Proxy

Proxies requests to Avantis APIs (core.avantisfi.com, api.avantisfi.com) to avoid
CORS issues when the frontend runs on origins not whitelisted by Avantis.
tradeyolo.fun is whitelisted; this proxy allows localhost/dev to work.
"""

import logging
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
import httpx

logger = logging.getLogger(__name__)

AVANTIS_CORE_BASE = "https://core.avantisfi.com"
AVANTIS_HISTORY_BASE = "https://api.avantisfi.com/v2/history/portfolio/history"

router = APIRouter(prefix="/avantis", tags=["avantis-proxy"])


@router.get("/user-data")
async def proxy_user_data(trader: str = Query(..., description="Trader wallet address")):
    """
    Proxy /user-data from core.avantisfi.com (open positions, limit orders).
    """
    url = f"{AVANTIS_CORE_BASE}/user-data?trader={trader}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            return JSONResponse(content=data)
    except httpx.HTTPStatusError as e:
        logger.warning(f"Avantis user-data proxy error: {e.response.status_code}")
        return JSONResponse(
            content={"error": f"Avantis API error: {e.response.status_code}"},
            status_code=e.response.status_code,
        )
    except Exception as e:
        logger.exception(f"Avantis user-data proxy failed: {e}")
        return JSONResponse(
            content={"error": "Failed to fetch from Avantis"},
            status_code=502,
        )


@router.get("/history/portfolio/history/{trader_address}/{page}")
async def proxy_portfolio_history(trader_address: str, page: int = 1):
    """
    Proxy portfolio history from api.avantisfi.com (closed trades).
    """
    url = f"{AVANTIS_HISTORY_BASE}/{trader_address}/{page}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            if response.status_code == 404:
                return JSONResponse(content={"portfolio": [], "count": 0, "pageCount": 0, "success": True})
            response.raise_for_status()
            data = response.json()
            return JSONResponse(content=data)
    except httpx.HTTPStatusError as e:
        logger.warning(f"Avantis history proxy error: {e.response.status_code}")
        return JSONResponse(
            content={"error": f"Avantis History API error: {e.response.status_code}"},
            status_code=e.response.status_code,
        )
    except Exception as e:
        logger.exception(f"Avantis history proxy failed: {e}")
        return JSONResponse(
            content={"error": "Failed to fetch closed trades from Avantis"},
            status_code=502,
        )


@router.get("/volume/{trader_address}")
async def get_total_volume(trader_address: str):
    """
    Compute total historic volume from Avantis (open + closed positions).
    Volume = sum of position sizes (collateral * leverage) for all trades.
    """
    total = 0.0
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Open positions from user-data
            url = f"{AVANTIS_CORE_BASE}/user-data?trader={trader_address}"
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                for pos in data.get("positions", []):
                    collateral = float(pos.get("collateral", 0)) / 1e6
                    leverage = float(pos.get("leverage", 0)) / 1e10
                    total += collateral * leverage

            # 2. Closed trades from portfolio history (paginate)
            page = 1
            while True:
                url = f"{AVANTIS_HISTORY_BASE}/{trader_address}/{page}"
                resp = await client.get(url)
                if resp.status_code == 404:
                    break
                resp.raise_for_status()
                data = resp.json()
                if not data.get("success") or not data.get("portfolio"):
                    break
                for item in data["portfolio"]:
                    args = item.get("event", {}).get("args", {})
                    t = args.get("t", {})
                    psize = args.get("positionSizeUSDC") or t.get("positionSizeUSDC")
                    if psize is None:
                        # Fallback: collateral * leverage
                        collateral = float(t.get("initialPosToken", 0))
                        leverage = float(t.get("leverage", 0))
                        psize = collateral * leverage
                    if isinstance(psize, (int, float)):
                        total += float(psize)
                page_count = data.get("pageCount", 0)
                if page >= page_count:
                    break
                page += 1

        return JSONResponse(content={"totalVolume": round(total, 2)})
    except httpx.HTTPStatusError as e:
        logger.warning(f"Avantis volume proxy error: {e.response.status_code}")
        return JSONResponse(
            content={"error": f"Avantis API error: {e.response.status_code}"},
            status_code=e.response.status_code,
        )
    except Exception as e:
        logger.exception(f"Avantis volume proxy failed: {e}")
        return JSONResponse(
            content={"error": "Failed to fetch volume from Avantis"},
            status_code=502,
        )
