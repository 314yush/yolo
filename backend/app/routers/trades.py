"""
Trade transaction building endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.schemas import (
    OpenTradeRequest,
    CloseTradeRequest,
    UpdateTPSLRequest,
    BuildTxResponse,
    TradesResponse,
    PnLResponse,
    PnLData,
)
from app.services.avantis import avantis_service
from app.services.price_feed import price_feed_service


router = APIRouter(prefix="/trade", tags=["trades"])


@router.post("/build-open", response_model=BuildTxResponse)
async def build_open_trade_tx(request: OpenTradeRequest):
    """
    Build unsigned transaction for opening a trade.
    The delegate wallet signs this.
    """
    print(f"📈 Build open trade request: {request}")
    try:
        # Get current price for the pair
        price_result = await price_feed_service.get_price(request.pair)
        if not price_result:
            raise HTTPException(status_code=400, detail=f"Could not fetch price for {request.pair}")
        
        current_price, _ = price_result
        print(f"   Current price for {request.pair}: ${current_price}")

        tx = await avantis_service.build_open_trade_tx_delegate(
            trader=request.trader,
            pair=request.pair,
            pair_index=request.pair_index,
            leverage=request.leverage,
            is_long=request.is_long,
            collateral=request.collateral,
            open_price=current_price,
        )
        
        print(f"   ✅ Built tx: to={tx.to}, data_len={len(tx.data)}, value={tx.value}")
        print(f"   📋 Transaction details:")
        print(f"      - To: {tx.to}")
        print(f"      - Data length: {len(tx.data)} bytes")
        print(f"      - Value: {tx.value}")
        print(f"      - Chain ID: {tx.chain_id}")
        return BuildTxResponse(tx=tx)
    except HTTPException:
        raise
    except Exception as e:
        print(f"   ❌ Error building trade tx: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/build-close", response_model=BuildTxResponse)
async def build_close_trade_tx(request: CloseTradeRequest):
    """
    Build unsigned transaction for closing a trade.
    The delegate wallet signs this.
    """
    print(f"📉 Build close trade request: {request}")
    try:
        tx = await avantis_service.build_close_trade_tx_delegate(
            trader=request.trader,
            pair_index=request.pair_index,
            trade_index=request.trade_index,
            collateral_to_close=request.collateral_to_close,
        )
        
        print(f"   Built close tx: to={tx.to}, data_len={len(tx.data)}")
        print(f"   Response validation: tx.to={tx.to}, tx.data={tx.data[:50]}..., tx.value={tx.value}, tx.chain_id={tx.chain_id}")
        
        response = BuildTxResponse(tx=tx)
        print(f"   Response created successfully")
        return response
    except ValidationError as e:
        print(f"   ❌ Validation error building close tx: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=422, detail=f"Validation error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"   ❌ Error building close tx: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/build-update-tpsl", response_model=BuildTxResponse)
async def build_update_tpsl_tx(request: UpdateTPSLRequest):
    """
    Build unsigned transaction for updating TP/SL.
    The delegate wallet signs this.
    """
    try:
        tx = await avantis_service.build_update_tpsl_tx_delegate(
            trader=request.trader,
            pair_index=request.pair_index,
            trade_index=request.trade_index,
            take_profit=request.take_profit,
            stop_loss=request.stop_loss,
        )
        
        return BuildTxResponse(tx=tx)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Additional router for fetching trades (could be separate module)
trades_router = APIRouter(prefix="/trades", tags=["trades"])


@trades_router.get("/{address}", response_model=TradesResponse)
async def get_trades(address: str):
    """
    Get open trades for a wallet address.
    """
    try:
        trades = await avantis_service.get_trades(address)
        return TradesResponse(trades=trades)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    except Exception as e:
        print(f"Error getting PnL: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
