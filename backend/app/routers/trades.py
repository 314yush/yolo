"""
Trade transaction building endpoints.
"""

import logging
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

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/trade", tags=["trades"])


@router.post("/build-open", response_model=BuildTxResponse)
async def build_open_trade_tx(request: OpenTradeRequest):
    """
    Build unsigned transaction for opening a trade.
    The delegate wallet signs this.
    """
    import time
    import json
    start_time = time.time()
    request_id = f"{int(time.time()*1000)}-{id(request)}"
    
    # #region agent log
    with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
        f.write(json.dumps({"location":"trades.py:28","message":"build_open_trade_tx started","data":{"requestId":request_id,"pair":request.pair,"pairIndex":request.pair_index},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
    # #endregion
    
    logger.info(f"Build open trade request: pair={request.pair}, trader={request.trader[:10]}...")
    try:
        # Get current price for the pair with timeout handling
        import asyncio
        price_start = time.time()
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:38","message":"Price fetch started","data":{"requestId":request_id,"pair":request.pair},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        try:
            price_result = await asyncio.wait_for(
                price_feed_service.get_price(request.pair),
                timeout=12.0  # 12 second timeout for price fetch
            )
        except asyncio.TimeoutError:
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"trades.py:44","message":"Price fetch timeout","data":{"requestId":request_id,"pair":request.pair,"elapsedMs":int((time.time()-price_start)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
            logger.warning(f"Price fetch timeout for {request.pair}")
            raise HTTPException(status_code=408, detail=f"Price feed timeout for {request.pair}. Please try again.")
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:48","message":"Price fetch completed","data":{"requestId":request_id,"pair":request.pair,"elapsedMs":int((time.time()-price_start)*1000),"hasResult":price_result is not None},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        if not price_result:
            raise HTTPException(status_code=400, detail=f"Could not fetch price for {request.pair}")
        
        current_price, _ = price_result
        logger.debug(f"Current price for {request.pair}: ${current_price}")

        tx_start = time.time()
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:54","message":"build_open_trade_tx_delegate started","data":{"requestId":request_id},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        tx = await avantis_service.build_open_trade_tx_delegate(
            trader=request.trader,
            pair=request.pair,
            pair_index=request.pair_index,
            leverage=request.leverage,
            is_long=request.is_long,
            collateral=request.collateral,
            open_price=current_price,
        )
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:62","message":"build_open_trade_tx_delegate completed","data":{"requestId":request_id,"elapsedMs":int((time.time()-tx_start)*1000),"totalElapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        logger.debug(f"Built tx: to={tx.to}, data_len={len(tx.data)} bytes, value={tx.value}, chain_id={tx.chain_id}")
        return BuildTxResponse(tx=tx)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building trade tx: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/build-close", response_model=BuildTxResponse)
async def build_close_trade_tx(request: CloseTradeRequest):
    """
    Build unsigned transaction for closing a trade.
    The delegate wallet signs this.
    """
    logger.info(f"Build close trade request: trader={request.trader[:10]}..., pair_index={request.pair_index}, trade_index={request.trade_index}")
    try:
        tx = await avantis_service.build_close_trade_tx_delegate(
            trader=request.trader,
            pair_index=request.pair_index,
            trade_index=request.trade_index,
            collateral_to_close=request.collateral_to_close,
        )
        
        logger.debug(f"Built close tx: to={tx.to}, data_len={len(tx.data)} bytes")
        response = BuildTxResponse(tx=tx)
        return response
    except ValidationError as e:
        logger.error(f"Validation error building close tx: {e}", exc_info=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=422, detail=f"Validation error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building close tx: {e}", exc_info=True)
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
    import time
    import json
    start_time = time.time()
    request_id = f"{int(time.time()*1000)}-{id(address)}"
    
    # #region agent log
    with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
        f.write(json.dumps({"location":"trades.py:163","message":"get_trades started","data":{"requestId":request_id,"address":address},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
    # #endregion
    
    try:
        trades = await avantis_service.get_trades(address)
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:170","message":"get_trades completed","data":{"requestId":request_id,"address":address,"tradeCount":len(trades),"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        return TradesResponse(trades=trades)
    except Exception as e:
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:172","message":"get_trades error","data":{"requestId":request_id,"address":address,"error":str(e),"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/debug/encode-trade")
async def debug_encode_trade(request: OpenTradeRequest):
    """
    Debug endpoint to test MANUAL encoding (no SDK simulation).
    
    Compares two encoding approaches:
    1. Backend's current approach (8 decimals for price, raw leverage)
    2. Guide's approach (10 decimals for price and leverage)
    
    This helps verify which format the contract actually expects.
    """
    from eth_abi import encode, decode
    from web3 import Web3
    import time as time_module
    
    logger.info(f"Debug encode trade: pair={request.pair}, trader={request.trader[:10]}...")
    
    try:
        # Get current price
        import asyncio
        try:
            price_result = await asyncio.wait_for(
                price_feed_service.get_price(request.pair),
                timeout=12.0
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408, detail=f"Price feed timeout for {request.pair}")
        
        if not price_result:
            raise HTTPException(status_code=400, detail=f"Could not fetch price for {request.pair}")
        
        current_price, _ = price_result
        
        # Contract addresses from guide
        TRADING_CONTRACT = "0x44914408af82bC9983bbb330e3578E1105e11d4e"
        
        # Function selectors (first 4 bytes of keccak256 hash of signature)
        # openTrade((address,uint256,uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256),uint8,uint256)
        OPEN_TRADE_SELECTOR = Web3.keccak(text="openTrade((address,uint256,uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256),uint8,uint256)")[:4]
        # delegatedAction(address,bytes)
        DELEGATED_ACTION_SELECTOR = Web3.keccak(text="delegatedAction(address,bytes)")[:4]
        
        # Calculate TP (5x price for long, 0.2x for short)
        if request.is_long:
            tp_price = current_price * 5
        else:
            tp_price = current_price * 0.2
        
        # ============================================
        # APPROACH 1: Backend's current format
        # - Price: 8 decimals
        # - Leverage: raw integer
        # - Execution fee: ~0.000002 ETH
        # ============================================
        backend_price_scaled = int(current_price * (10**8))
        backend_tp_scaled = int(tp_price * (10**8))
        backend_leverage = request.leverage  # Raw: 250 = 250x
        backend_collateral = int(request.collateral * (10**6))
        backend_position_size = int(request.collateral * request.leverage * (10**6))
        backend_slippage = 1  # Raw: 1 = 1%
        backend_execution_fee = 100000000000000  # ~0.0001 ETH (updated based on real tx analysis)
        
        # ============================================
        # APPROACH 2: Guide's format
        # - Price: 10 decimals
        # - Leverage: 10 decimals (2x = 20000000000)
        # - Slippage: 10 decimals (1% = 10000000000)
        # - Execution fee: ~0.00035 ETH
        # ============================================
        guide_price_scaled = int(current_price * (10**10))
        guide_tp_scaled = int(tp_price * (10**10))
        guide_leverage = int(request.leverage * (10**10))  # 250x = 2500000000000
        guide_collateral = int(request.collateral * (10**6))  # Still 6 decimals for USDC
        guide_position_size = int(request.collateral * (10**6))  # positionSizeUSDC = collateral (not * leverage)
        guide_slippage = int(1 * (10**10))  # 1% = 10000000000
        guide_execution_fee = int(0.00035 * (10**18))  # 0.00035 ETH in wei
        
        timestamp = int(time_module.time())
        trader = Web3.to_checksum_address(request.trader)
        
        # Build both versions of the trade struct
        def build_trade_tuple(price, tp, leverage, collateral, position_size):
            return (
                trader,           # address trader
                request.pair_index,  # uint256 pairIndex
                0,                # uint256 index
                0,                # uint256 initialPosToken (0 for USDC)
                position_size,    # uint256 positionSizeUSDC
                price,            # uint256 openPrice
                request.is_long,  # bool buy
                leverage,         # uint256 leverage
                tp,               # uint256 tp
                0,                # uint256 sl
                timestamp,        # uint256 timestamp
            )
        
        backend_trade = build_trade_tuple(
            backend_price_scaled, backend_tp_scaled, backend_leverage, 
            backend_collateral, backend_position_size
        )
        
        guide_trade = build_trade_tuple(
            guide_price_scaled, guide_tp_scaled, guide_leverage,
            guide_collateral, guide_position_size
        )
        
        # Encode the inner openTrade call
        def encode_open_trade(trade_tuple, slippage):
            # Encode the struct and parameters
            encoded_params = encode(
                ['(address,uint256,uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256)', 'uint8', 'uint256'],
                [trade_tuple, 3, slippage]  # 3 = MARKET_ZERO_FEE
            )
            return OPEN_TRADE_SELECTOR + encoded_params
        
        backend_inner = encode_open_trade(backend_trade, backend_slippage)
        guide_inner = encode_open_trade(guide_trade, guide_slippage)
        
        # Wrap in delegatedAction
        def encode_delegated_action(trader_addr, inner_calldata):
            encoded_params = encode(
                ['address', 'bytes'],
                [trader_addr, inner_calldata]
            )
            return DELEGATED_ACTION_SELECTOR + encoded_params
        
        backend_calldata = encode_delegated_action(trader, backend_inner)
        guide_calldata = encode_delegated_action(trader, guide_inner)
        
        return {
            "input": {
                "trader": request.trader,
                "pair": request.pair,
                "pair_index": request.pair_index,
                "leverage": request.leverage,
                "is_long": request.is_long,
                "collateral": request.collateral,
                "current_price": current_price,
                "tp_price": tp_price,
            },
            "backend_encoding": {
                "description": "Current backend format (8 decimals for price, raw leverage)",
                "tx": {
                    "to": TRADING_CONTRACT,
                    "data": "0x" + backend_calldata.hex(),
                    "value": hex(backend_execution_fee),
                    "chain_id": 8453,
                },
                "decoded_values": {
                    "openPrice_raw": backend_price_scaled,
                    "openPrice_human": backend_price_scaled / (10**8),
                    "leverage_raw": backend_leverage,
                    "leverage_human": f"{backend_leverage}x",
                    "positionSizeUSDC_raw": backend_position_size,
                    "positionSizeUSDC_human": backend_position_size / (10**6),
                    "slippage_raw": backend_slippage,
                    "execution_fee_wei": backend_execution_fee,
                    "execution_fee_eth": backend_execution_fee / (10**18),
                },
            },
            "guide_encoding": {
                "description": "Guide format (10 decimals for price and leverage)",
                "tx": {
                    "to": TRADING_CONTRACT,
                    "data": "0x" + guide_calldata.hex(),
                    "value": hex(guide_execution_fee),
                    "chain_id": 8453,
                },
                "decoded_values": {
                    "openPrice_raw": guide_price_scaled,
                    "openPrice_human": guide_price_scaled / (10**10),
                    "leverage_raw": guide_leverage,
                    "leverage_human": f"{guide_leverage / (10**10)}x",
                    "positionSizeUSDC_raw": guide_position_size,
                    "positionSizeUSDC_human": guide_position_size / (10**6),
                    "slippage_raw": guide_slippage,
                    "slippage_human": f"{guide_slippage / (10**10)}%",
                    "execution_fee_wei": guide_execution_fee,
                    "execution_fee_eth": guide_execution_fee / (10**18),
                },
            },
            "comparison": {
                "price_difference": f"Backend uses {backend_price_scaled}, Guide uses {guide_price_scaled} (100x difference)",
                "leverage_difference": f"Backend uses {backend_leverage} (raw), Guide uses {guide_leverage} (10 decimals)",
                "execution_fee_difference": f"Backend: {backend_execution_fee / (10**18):.8f} ETH, Guide: {guide_execution_fee / (10**18):.5f} ETH",
            },
            "next_steps": [
                "1. Find a successful trade tx hash on Basescan",
                "2. Decode its calldata to see which format matches",
                "3. Or try both formats with a small test trade",
            ],
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in debug encode: {e}", exc_info=True)
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


@trades_router.get("/{address}/pnl", response_model=PnLResponse)
async def get_pnl(address: str):
    """
    Get PnL for all open positions - fetch gross PnL directly from Avantis SDK.
    """
    import time
    import json
    start_time = time.time()
    request_id = f"{int(time.time()*1000)}-{id(address)}"
    
    # #region agent log
    with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
        f.write(json.dumps({"location":"trades.py:175","message":"get_pnl started","data":{"requestId":request_id,"address":address},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
    # #endregion
    
    try:
        # Get trades with PnL data from SDK
        trades_with_pnl_start = time.time()
        trades_with_pnl = await avantis_service.get_trades_with_pnl(address)
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:182","message":"get_trades_with_pnl completed","data":{"requestId":request_id,"address":address,"tradeCount":len(trades_with_pnl),"elapsedMs":int((time.time()-trades_with_pnl_start)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        if not trades_with_pnl:
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"trades.py:185","message":"get_pnl completed (no trades)","data":{"requestId":request_id,"address":address,"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
            return PnLResponse(positions=[])
        
        # Get current prices for display
        pair_names = list(set(item['trade'].pair for item in trades_with_pnl))
        prices_start = time.time()
        prices = await price_feed_service.get_prices(pair_names)
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:189","message":"get_prices completed","data":{"requestId":request_id,"pairCount":len(pair_names),"elapsedMs":int((time.time()-prices_start)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
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
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:208","message":"get_pnl completed","data":{"requestId":request_id,"address":address,"positionCount":len(positions),"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        return PnLResponse(positions=positions)
    except Exception as e:
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"trades.py:210","message":"get_pnl error","data":{"requestId":request_id,"address":address,"error":str(e),"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        logger.error(f"Error getting PnL: {e}", exc_info=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
