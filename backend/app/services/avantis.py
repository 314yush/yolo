"""
Avantis SDK wrapper service.
Builds unsigned transactions for frontend signing.
"""

import ssl
import certifi

# Fix SSL certificate issue on macOS
# Create a proper SSL context with certifi's CA bundle
def _create_ssl_context():
    ctx = ssl.create_default_context(cafile=certifi.where())
    return ctx

# Monkey-patch ssl to use certifi certificates by default
ssl._create_default_https_context = _create_ssl_context

from typing import Optional
from avantis_trader_sdk import TraderClient
from avantis_trader_sdk.types import TradeInput, TradeInputOrderType
from eth_utils import to_checksum_address

from app.core.config import get_settings
from app.models.schemas import UnsignedTx, Trade

# USDC contract address on Base
USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# ERC20 approve function selector and max amount
APPROVE_SELECTOR = "0x095ea7b3"  # approve(address,uint256)
MAX_UINT256 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

# Dummy private key - only used to initialize the SDK client
# We NEVER sign anything with this, only build unsigned transactions
DUMMY_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001"


class AvantisService:
    """Service for interacting with Avantis SDK."""

    def __init__(self):
        self.settings = get_settings()
        self._client: Optional[TraderClient] = None

    @property
    def client(self) -> TraderClient:
        """Lazy-load the TraderClient with a dummy signer."""
        if self._client is None:
            self._client = TraderClient(self.settings.base_rpc_url)
            # Set a dummy signer to enable tx building methods
            # We ONLY use this to build transactions, never to sign them
            self._client.set_local_signer(DUMMY_PRIVATE_KEY)
        return self._client

    async def get_pair_index(self, pair: str) -> int:
        """Get pair index from pair name (e.g., 'BTC/USD' -> 0)."""
        try:
            return await self.client.pairs_cache.get_pair_index(pair)
        except Exception:
            # Fallback mapping for common pairs
            pair_map = {
                "BTC/USD": 0,
                "ETH/USD": 1,
                "SOL/USD": 2,
                "XRP/USD": 3,
            }
            return pair_map.get(pair, 0)

    async def get_available_pairs(self) -> list[dict]:
        """Get list of available trading pairs."""
        return [
            {"name": "BTC/USD", "pair_index": 0},
            {"name": "ETH/USD", "pair_index": 1},
            {"name": "SOL/USD", "pair_index": 2},
            {"name": "XRP/USD", "pair_index": 3},
        ]

    def _extract_tx_data(self, tx: dict) -> UnsignedTx:
        """Extract transaction data from SDK response."""
        return UnsignedTx(
            to=tx.get("to", ""),
            data=tx.get("data", ""),
            value=hex(tx.get("value", 0)) if isinstance(tx.get("value"), int) else tx.get("value", "0x0"),
            chain_id=self.settings.chain_id,
        )

    async def build_set_delegate_tx(self, delegate_address: str) -> UnsignedTx:
        """
        Build unsigned transaction for setting a delegate.
        The trader signs this with their Privy wallet.
        """
        # Convert to checksum address
        delegate_address = to_checksum_address(delegate_address)
        tx = await self.client.trade.build_set_delegate_tx(delegate_address)
        return self._extract_tx_data(tx)

    async def build_remove_delegate_tx(self) -> UnsignedTx:
        """Build unsigned transaction for removing a delegate."""
        tx = await self.client.trade.build_remove_delegate_tx()
        return self._extract_tx_data(tx)

    async def get_delegate(self, trader: str) -> Optional[str]:
        """Get current delegate for a trader."""
        try:
            trader = to_checksum_address(trader)
            delegate = await self.client.trade.get_delegate(trader)
            # Zero address means no delegate
            if delegate == "0x0000000000000000000000000000000000000000":
                return None
            return delegate
        except Exception as e:
            print(f"Error getting delegate: {e}")
            return None

    def calculate_take_profit(
        self, entry_price: float, is_long: bool, leverage: int
    ) -> float:
        """
        Calculate take profit price for zero-fee perps.
        
        For zero-fee perps with high leverage, we need to be careful about TP limits.
        Max TP is typically 500% of open price (5x), but for high leverage,
        we use a more conservative approach to avoid WRONG_TP errors.
        
        We'll target a 100% ROI (doubling collateral) which at high leverage
        means a small price movement.
        """
        # Target 100% profit on collateral
        # At leverage X, need price move of 100% / X = 1/X
        target_profit_pct = 1.0 / leverage  # e.g., 1% for 100x leverage
        
        if is_long:
            return entry_price * (1 + target_profit_pct)
        else:
            return entry_price * (1 - target_profit_pct)

    async def build_open_trade_tx_delegate(
        self,
        trader: str,
        pair: str,
        pair_index: int,
        leverage: int,
        is_long: bool,
        collateral: float,
        open_price: float,
    ) -> UnsignedTx:
        """
        Build unsigned open trade transaction for delegate signing.
        
        This builds a delegatedAction(trader, innerCalldata) transaction.
        The delegate signs this, and the contract:
        1. Verifies delegate is authorized for trader
        2. Executes the inner openTrade call on behalf of trader
        3. USDC is transferred from trader's wallet (not delegate)
        """
        trader = to_checksum_address(trader)
        
        # Calculate TP - for high leverage, use a conservative target
        tp = self.calculate_take_profit(open_price, is_long, leverage)
        print(f"   TP calculation: price={open_price}, is_long={is_long}, leverage={leverage}, tp={tp}")

        trade_input = TradeInput(
            trader=trader,
            open_price=open_price,
            pair_index=pair_index,
            collateral_in_trade=collateral,
            is_long=is_long,
            leverage=leverage,
            index=0,
            tp=tp,
            sl=0,
        )

        # Step 1: Build the inner openTrade transaction (this gives us the calldata)
        # Try SDK method first, but it may hang on gas estimation
        # If it hangs, we'll manually encode similar to close trade
        import asyncio
        try:
            inner_tx = await asyncio.wait_for(
                self.client.trade.build_trade_open_tx(
                    trade_input,
                    TradeInputOrderType.MARKET_ZERO_FEE,
                    slippage_percentage=1,
                ),
                timeout=10.0  # 10 second timeout
            )
            
            inner_calldata = inner_tx.get("data")
            execution_fee = inner_tx.get("value", 0)
            # Ensure execution_fee is an integer
            if isinstance(execution_fee, str):
                execution_fee = int(execution_fee, 16) if execution_fee.startswith('0x') else int(execution_fee)
            execution_fee = int(execution_fee)
        except asyncio.TimeoutError:
            print(f"   ⚠️ build_trade_open_tx timed out, manually encoding...")
            
            # Manual encoding fallback - use TradeInput object directly
            # Get execution fee separately
            try:
                execution_fee = await self.client.trade.get_trade_execution_fee()
                # Ensure execution_fee is an integer
                if isinstance(execution_fee, str):
                    execution_fee = int(execution_fee, 16) if execution_fee.startswith('0x') else int(execution_fee)
                execution_fee = int(execution_fee)
            except Exception as fee_error:
                print(f"   ⚠️ Failed to get execution fee: {fee_error}, using default")
                execution_fee = 1000000000000000  # 0.001 ETH default
            
            # Get Trading contract
            Trading = self.client.contracts.get("Trading")
            if Trading is None:
                raise ValueError("Trading contract not found")
            
            # Manual encoding: Convert TradeInput to tuple format expected by contract
            # The SDK's TradeInput struct fields need to be converted to the contract's tuple format
            # Based on SDK TradeInput: (trader, open_price, pair_index, collateral_in_trade, is_long, leverage, index, tp, sl)
            # Contract expects struct with these fields in order
            
            # Price scaling: Avantis uses 8 decimals for prices (like Chainlink/Pyth)
            PRICE_DECIMALS = 10**8
            open_price_scaled = int(open_price * PRICE_DECIMALS)
            tp_scaled = int(tp * PRICE_DECIMALS)
            
            # Collateral scaling: USDC has 6 decimals
            COLLATERAL_DECIMALS = 10**6
            collateral_scaled = int(collateral * COLLATERAL_DECIMALS)
            
            # Convert TradeInput to tuple matching contract struct
            # Contract struct order: trader, openPrice, pairIndex, collateralInTrade, isLong, leverage, index, tp, sl
            trade_input_tuple = (
                trader,  # address
                open_price_scaled,  # uint256 - openPrice (scaled by 10^8)
                pair_index,  # uint256 - pairIndex
                collateral_scaled,  # uint256 - collateralInTrade (scaled by 10^6 for USDC)
                is_long,  # bool - isLong
                leverage,  # uint256 - leverage
                0,  # uint256 - index
                tp_scaled,  # uint256 - tp (scaled by 10^8)
                0,  # uint256 - sl (stop loss, 0 for market orders)
            )
            
            inner_calldata = Trading.functions.openTrade(
                trade_input_tuple,
                TradeInputOrderType.MARKET_ZERO_FEE.value,  # uint8 order type
                1,  # uint256 - slippage_percentage (1 = 1%)
            )._encode_transaction_data()
            
            print(f"   ✅ Manually encoded inner calldata length: {len(inner_calldata)} bytes")
            print(f"   📋 TradeInput tuple: trader={trader[:10]}..., price={open_price_scaled}, pair={pair_index}, collateral={collateral_scaled}, long={is_long}, lev={leverage}, tp={tp_scaled}")
        
        print(f"   Inner calldata length: {len(inner_calldata)}")
        print(f"   Execution fee: {execution_fee} wei")

        # Step 2: Wrap in delegatedAction(trader, innerCalldata)
        # We manually encode the call instead of using build_transaction
        # to avoid simulation (which would fail without the delegate's private key)
        Trading = self.client.contracts.get("Trading")
        
        # Encode the delegatedAction call
        delegate_calldata = Trading.functions.delegatedAction(
            trader,
            inner_calldata
        )._encode_transaction_data()
        
        trading_address = Trading.address
        print(f"   ✅ Delegate tx built: to={trading_address}")
        print(f"   📊 delegatedAction calldata length: {len(delegate_calldata)} bytes")
        print(f"   💰 Execution fee: {execution_fee} wei ({execution_fee / 1e18:.6f} ETH)")

        return UnsignedTx(
            to=trading_address,
            data=delegate_calldata,
            value=hex(execution_fee) if isinstance(execution_fee, int) else execution_fee,
            chain_id=self.settings.chain_id,
        )

    async def build_close_trade_tx_delegate(
        self,
        trader: str,
        pair_index: int,
        trade_index: int,
        collateral_to_close: float,
    ) -> UnsignedTx:
        """
        Build unsigned close trade transaction for delegate signing.
        
        Manually encodes closeTradeMarket to avoid gas estimation (which fails with dummy signer).
        Same pattern as open trade - manually encode inner call, wrap in delegatedAction.
        
        IMPORTANT: pair_index and trade_index together uniquely identify the trade to close.
        trade_index is per-pair, so different pairs can have the same trade_index.
        """
        try:
            trader = to_checksum_address(trader)
            print(f"   Building close tx: trader={trader}, pair_index={pair_index}, trade_index={trade_index}, collateral={collateral_to_close}")
            
            # Validate inputs
            if pair_index < 0:
                raise ValueError(f"Invalid pair_index: {pair_index}. Must be >= 0")
            if trade_index < 0:
                raise ValueError(f"Invalid trade_index: {trade_index}. Must be >= 0")
            if collateral_to_close <= 0:
                raise ValueError(f"Invalid collateral_to_close: {collateral_to_close}. Must be > 0")
            
            # Convert collateral to USDC units (6 decimals)
            collateral_usdc = int(collateral_to_close * 10**6)
            print(f"   Collateral in USDC units: {collateral_usdc}")
            
            # Get execution fee (this doesn't require gas estimation)
            execution_fee = await self.client.trade.get_trade_execution_fee()
            print(f"   Execution fee: {execution_fee} wei")
            
            # Get Trading contract
            Trading = self.client.contracts.get("Trading")
            if Trading is None:
                raise ValueError("Trading contract not found")
            
            # Step 1: Manually encode the inner closeTradeMarket call
            # Use _encode_transaction_data() to avoid gas estimation
            inner_calldata = Trading.functions.closeTradeMarket(
                int(pair_index),
                int(trade_index),
                int(collateral_usdc),
            )._encode_transaction_data()
            
            print(f"   Inner close calldata length: {len(inner_calldata)}")
            
            # Step 2: Wrap in delegatedAction(trader, innerCalldata)
            # Use _encode_transaction_data() to avoid gas estimation
            delegate_calldata = Trading.functions.delegatedAction(
                trader,
                inner_calldata
            )._encode_transaction_data()
            
            trading_address = Trading.address
            print(f"   Delegate close tx built: to={trading_address}")
            print(f"   delegatedAction calldata length: {len(delegate_calldata)}")
            
            tx = UnsignedTx(
                to=trading_address,
                data=delegate_calldata,
                value=hex(execution_fee),
                chain_id=self.settings.chain_id,
            )
            
            print(f"   UnsignedTx created successfully")
            return tx
        except Exception as e:
            print(f"   ❌ Error in build_close_trade_tx_delegate: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            raise

    async def build_update_tpsl_tx_delegate(
        self,
        trader: str,
        pair_index: int,
        trade_index: int,
        take_profit: float,
        stop_loss: float,
    ) -> UnsignedTx:
        """Build unsigned TP/SL update transaction for delegate signing."""
        trader = to_checksum_address(trader)
        tx = await self.client.trade.build_trade_tp_sl_update_tx_delegate(
            pair_index=pair_index,
            trade_index=trade_index,
            take_profit_price=take_profit,
            stop_loss_price=stop_loss,
            trader=trader,
        )

        return self._extract_tx_data(tx)

    async def get_trades(self, trader: str) -> list[Trade]:
        """Get open trades for a trader (includes confirmed trades only)."""
        try:
            trader = to_checksum_address(trader)
            trades, pending = await self.client.trade.get_trades(trader)
            
            result = []
            for t in trades:
                trade_data = t.trade
                # Get pair name from SDK
                pair_name = await self.client.pairs_cache.get_pair_name_from_index(trade_data.pair_index)
                result.append(Trade(
                    trade_index=trade_data.trade_index,
                    pair_index=trade_data.pair_index,
                    pair=pair_name,
                    collateral=float(trade_data.open_collateral),
                    leverage=int(trade_data.leverage),
                    is_long=trade_data.is_long,
                    open_price=float(trade_data.open_price),
                    tp=float(trade_data.tp),
                    sl=float(trade_data.sl),
                    opened_at=0,
                ))
            
            return result
        except Exception as e:
            print(f"Error fetching trades: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def get_all_trades(self, trader: str) -> tuple[list[Trade], list[Trade]]:
        """Get both confirmed and pending trades."""
        try:
            trader = to_checksum_address(trader)
            trades, pending = await self.client.trade.get_trades(trader)
            
            confirmed = []
            for t in trades:
                trade_data = t.trade
                pair_name = await self.client.pairs_cache.get_pair_name_from_index(trade_data.pair_index)
                confirmed.append(Trade(
                    trade_index=trade_data.trade_index,
                    pair_index=trade_data.pair_index,
                    pair=pair_name,
                    collateral=float(trade_data.open_collateral),
                    leverage=int(trade_data.leverage),
                    is_long=trade_data.is_long,
                    open_price=float(trade_data.open_price),
                    tp=float(trade_data.tp),
                    sl=float(trade_data.sl),
                    opened_at=0,
                ))
            
            # Convert pending limit orders to Trade objects if needed
            pending_trades = []
            # Note: pending might be limit orders, not trades - handle accordingly
            # For now, return empty list for pending trades
            
            return confirmed, pending_trades
        except Exception as e:
            print(f"Error fetching all trades: {e}")
            import traceback
            traceback.print_exc()
            return [], []
    
    async def get_trades_with_pnl(self, trader: str) -> list[dict]:
        """Get open trades with gross PnL calculated from SDK trade data."""
        try:
            trader = to_checksum_address(trader)
            trades, pending = await self.client.trade.get_trades(trader)
            
            # Get current prices for all pairs
            pair_indices = list(set(t.trade.pair_index for t in trades))
            pair_names = []
            for pair_index in pair_indices:
                try:
                    pair_name = await self.client.pairs_cache.get_pair_name_from_index(pair_index)
                    pair_names.append(pair_name)
                except Exception:
                    pass
            
            # Fetch prices
            from app.services.price_feed import price_feed_service
            prices = await price_feed_service.get_prices(pair_names) if pair_names else {}
            
            result = []
            for extended_trade in trades:
                trade_data = extended_trade.trade
                
                # Get pair name from SDK
                sdk_pair_name = await self.client.pairs_cache.get_pair_name_from_index(trade_data.pair_index)
                
                # CORRECTION: SDK's pair_index mapping may be incorrect. Use open_price to verify/correct.
                # Price ranges: BTC ~$60k-$100k, ETH ~$2k-$4k, SOL ~$100-$200, XRP ~$0.5-$2
                open_price = float(trade_data.open_price)
                if open_price > 50000:  # BTC range
                    correct_pair = "BTC/USD"
                elif 1000 < open_price < 5000:  # ETH range
                    correct_pair = "ETH/USD"
                elif 50 < open_price < 500:  # SOL range
                    correct_pair = "SOL/USD"
                elif 0.1 < open_price < 5:  # XRP range
                    correct_pair = "XRP/USD"
                else:
                    correct_pair = sdk_pair_name  # Fallback to SDK's answer
                
                # Use corrected pair name
                pair_name = correct_pair
                
                # Get current price - fetch if not already fetched for corrected pair
                price_data = prices.get(pair_name)
                if not price_data and pair_name not in pair_names:
                    # Fetch price for corrected pair
                    from app.services.price_feed import price_feed_service
                    corrected_prices = await price_feed_service.get_prices([pair_name])
                    if corrected_prices:
                        prices.update(corrected_prices)
                        price_data = corrected_prices.get(pair_name)
                
                current_price = price_data[0] if price_data else open_price
                
                # Calculate gross PnL (simple price movement, no fees)
                position_size = float(trade_data.open_collateral) * int(trade_data.leverage)
                # open_price already defined above
                
                if trade_data.is_long:
                    price_change_pct = (current_price - open_price) / open_price
                else:
                    price_change_pct = (open_price - current_price) / open_price
                
                gross_pnl = position_size * price_change_pct
                gross_pnl_percentage = (gross_pnl / float(trade_data.open_collateral)) * 100
                
                result.append({
                    'trade': Trade(
                        trade_index=trade_data.trade_index,
                        pair_index=trade_data.pair_index,
                        pair=pair_name,
                        collateral=float(trade_data.open_collateral),
                        leverage=int(trade_data.leverage),
                        is_long=trade_data.is_long,
                        open_price=open_price,
                        tp=float(trade_data.tp),
                        sl=float(trade_data.sl),
                        opened_at=0,
                    ),
                    'gross_pnl': gross_pnl,
                    'gross_pnl_percentage': gross_pnl_percentage,
                })
            
            return result
        except Exception as e:
            print(f"Error fetching trades with PnL: {e}")
            import traceback
            traceback.print_exc()
            return []

    def calculate_pnl(
        self, trade: Trade, current_price: float, position_size_usdc: float = None, margin_fee: float = 0
    ) -> tuple[float, float]:
        """
        Calculate PnL for a trade using Avantis SDK methodology.
        
        Uses positionSizeUSDC from SDK if provided, otherwise calculates it.
        Accounts for margin fees that accrue over time.
        """
        # Use SDK's positionSizeUSDC if provided, otherwise calculate
        if position_size_usdc is None:
            position_size_usdc = trade.collateral * trade.leverage
        
        # Calculate price change percentage
        if trade.is_long:
            price_change_pct = (current_price - trade.open_price) / trade.open_price
        else:
            price_change_pct = (trade.open_price - current_price) / trade.open_price
        
        # Gross PnL (before fees)
        gross_pnl = position_size_usdc * price_change_pct
        
        # Net PnL (after margin fees)
        net_pnl = gross_pnl - margin_fee
        
        # PnL percentage based on collateral
        pnl_percentage = (net_pnl / trade.collateral) * 100
        
        return net_pnl, pnl_percentage

    async def get_trading_storage_address(self) -> str:
        """Get the Trading Storage contract address from SDK."""
        try:
            contracts = self.client.load_contracts()
            trading_storage = contracts.get("TradingStorage")
            if trading_storage:
                return trading_storage.address
        except Exception as e:
            print(f"Error getting trading storage address: {e}")
        return "0x8a311D7048c35985aa31C131B9A13e03a5f7422d"

    async def get_trading_contract_address(self) -> str:
        """
        Get the Avantis Trading contract address.
        This is the contract that needs USDC approval for executing trades.
        """
        try:
            contracts = self.client.load_contracts()
            trading = contracts.get("Trading")
            if trading:
                return trading.address
        except Exception as e:
            print(f"Error getting trading contract address: {e}")
        # Fallback to known Avantis Trading contract address on Base
        return "0x44914408af82bC9983bbb330e3578E1105e11d4e"

    def build_usdc_approval_tx(self, spender: str) -> UnsignedTx:
        """
        Build unsigned USDC approval transaction.
        Approves max amount to the specified spender.
        """
        # Build approve calldata: approve(address spender, uint256 amount)
        # selector (4 bytes) + address padded to 32 bytes + amount (32 bytes)
        spender_padded = spender.lower().replace("0x", "").zfill(64)
        data = f"{APPROVE_SELECTOR}{spender_padded}{MAX_UINT256}"
        
        return UnsignedTx(
            to=USDC_ADDRESS,
            data=data,
            value="0x0",
            chain_id=self.settings.chain_id,
        )


# Singleton instance
avantis_service = AvantisService()
