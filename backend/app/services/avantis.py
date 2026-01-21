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
        inner_tx = await self.client.trade.build_trade_open_tx(
            trade_input,
            TradeInputOrderType.MARKET_ZERO_FEE,
            slippage_percentage=1,
        )
        inner_calldata = inner_tx.get("data")
        execution_fee = inner_tx.get("value", 0)
        
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
        print(f"   Delegate tx built: to={trading_address}")
        print(f"   delegatedAction calldata length: {len(delegate_calldata)}")

        return UnsignedTx(
            to=trading_address,
            data=delegate_calldata,
            value=hex(execution_fee),
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
        
        Uses delegatedAction(trader, closeTradeCalldata) pattern.
        Manually encodes to avoid simulation which would fail.
        """
        trader = to_checksum_address(trader)
        print(f"   Building close tx: trader={trader}, pair={pair_index}, trade={trade_index}, collateral={collateral_to_close}")
        
        Trading = self.client.contracts.get("Trading")
        
        # Convert collateral to USDC units (6 decimals)
        collateral_usdc = int(collateral_to_close * 10**6)
        
        # Get execution fee
        execution_fee = await self.client.trade.get_trade_execution_fee()
        print(f"   Execution fee: {execution_fee} wei")
        
        # Step 1: Encode the inner closeTradeMarket call
        inner_calldata = Trading.functions.closeTradeMarket(
            pair_index,
            trade_index,
            collateral_usdc,
        )._encode_transaction_data()
        
        print(f"   Inner close calldata length: {len(inner_calldata)}")
        
        # Step 2: Wrap in delegatedAction(trader, innerCalldata)
        delegate_calldata = Trading.functions.delegatedAction(
            trader,
            inner_calldata
        )._encode_transaction_data()
        
        trading_address = Trading.address
        print(f"   Delegate close tx built: to={trading_address}")
        print(f"   delegatedAction calldata length: {len(delegate_calldata)}")

        return UnsignedTx(
            to=trading_address,
            data=delegate_calldata,
            value=hex(execution_fee),
            chain_id=self.settings.chain_id,
        )

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
        """Get open trades for a trader."""
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

    def calculate_pnl(
        self, trade: Trade, current_price: float
    ) -> tuple[float, float]:
        """Calculate PnL for a trade."""
        position_size = trade.collateral * trade.leverage
        
        if trade.is_long:
            price_change_pct = (current_price - trade.open_price) / trade.open_price
        else:
            price_change_pct = (trade.open_price - current_price) / trade.open_price
        
        pnl = position_size * price_change_pct
        pnl_percentage = (pnl / trade.collateral) * 100
        
        return pnl, pnl_percentage

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
