"""
Avantis SDK wrapper (v1 read path).

Trade execution lives on the frontend: EIP-712 intents signed by the user's
Privy embedded wallet and submitted to the batched-market relayer. This
service only reads pairs, trades, and PnL via avantis-trader-sdk 0.8.x.
Do not add v1 write builders — they revert on the v2 contracts.
"""

import ssl
import certifi
import logging

# Fix SSL certificate issue on macOS
# Create a proper SSL context with certifi's CA bundle
def _create_ssl_context():
    ctx = ssl.create_default_context(cafile=certifi.where())
    return ctx

# Monkey-patch ssl to use certifi certificates by default
ssl._create_default_https_context = _create_ssl_context

from typing import Optional
from avantis_trader_sdk import TraderClient
from eth_utils import to_checksum_address

from app.core.config import get_settings
from app.models.schemas import Trade

logger = logging.getLogger(__name__)

# Dummy private key - only used to initialize the SDK client.
# We NEVER sign anything with this.
DUMMY_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001"

# Used when the SDK's pairs_cache is unavailable. The _UPSIDE pairs are the v2
# home of what v1 called zero-fee perps; the fixed-fee twins are kept so
# positions opened before the cutover still resolve to a name.
PAIR_INDEX_FALLBACK = {
    "ETH_UPSIDE/USD": 115,
    "BTC_UPSIDE/USD": 116,
    "SOL_UPSIDE/USD": 117,
    "XRP_UPSIDE/USD": 118,
    "HYPE_UPSIDE/USD": 119,
    "ETH/USD": 0,
    "BTC/USD": 1,
    "SOL/USD": 2,
    "USD/JPY": 12,
    "XAG/USD": 20,
    "XAU/USD": 21,
}


class AvantisService:
    """Service for reading Avantis pairs, trades, and PnL."""

    def __init__(self):
        self.settings = get_settings()
        self._client: Optional[TraderClient] = None

    @property
    def client(self) -> TraderClient:
        """Lazy-load the TraderClient with a dummy signer."""
        if self._client is None:
            logger.info("Initializing TraderClient with RPC: %s", self.settings.redacted_rpc_url)


            self._client = TraderClient(self.settings.base_rpc_url)
            # Dummy signer satisfies SDK init; we never sign with it
            self._client.set_local_signer(DUMMY_PRIVATE_KEY)
        return self._client

    async def get_pair_index(self, pair: str) -> int:
        """Get pair index from pair name (e.g., 'BTC/USD' -> 1)."""
        try:
            return await self.client.pairs_cache.get_pair_index(pair)
        except Exception:
            # Fallback mapping for common pairs
            return PAIR_INDEX_FALLBACK.get(pair, 0)

    async def get_available_pairs(self) -> list[dict]:
        """Get list of available trading pairs."""
        return [
            {"name": name, "pair_index": index}
            for name, index in PAIR_INDEX_FALLBACK.items()
        ]

    async def get_trades(self, trader: str) -> list[Trade]:
        """Get open trades for a trader (includes confirmed trades only)."""
        try:
            trader = to_checksum_address(trader)
            trades, pending = await self.client.trade.get_trades(trader)
            
            result = []
            for t in trades:
                trade_data = t.trade
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
            logger.error(f"Error fetching trades: {e}", exc_info=True)
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
            
            pending_trades = []
            return confirmed, pending_trades
        except Exception as e:
            logger.error(f"Error fetching all trades: {e}", exc_info=True)
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

                sdk_pair_name = await self.client.pairs_cache.get_pair_name_from_index(trade_data.pair_index)
                pair_name = sdk_pair_name
                open_price = float(trade_data.open_price)

                # Current mark price for gross PnL
                price_data = prices.get(pair_name)
                if not price_data and pair_name not in pair_names:
                    corrected_prices = await price_feed_service.get_prices([pair_name])
                    if corrected_prices:
                        prices.update(corrected_prices)
                        price_data = corrected_prices.get(pair_name)
                
                current_price = price_data[0] if price_data else open_price
                
                # Calculate gross PnL
                position_size = float(trade_data.open_collateral) * int(trade_data.leverage)
                
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
            logger.error(f"Error fetching trades with PnL: {e}", exc_info=True)
            return []

    def calculate_pnl(
        self, trade: Trade, current_price: float, position_size_usdc: float = None, margin_fee: float = 0
    ) -> tuple[float, float]:
        """Calculate PnL for a trade using Avantis SDK methodology."""
        if position_size_usdc is None:
            position_size_usdc = trade.collateral * trade.leverage
        
        if trade.is_long:
            price_change_pct = (current_price - trade.open_price) / trade.open_price
        else:
            price_change_pct = (trade.open_price - current_price) / trade.open_price
        
        gross_pnl = position_size_usdc * price_change_pct
        net_pnl = gross_pnl - margin_fee
        pnl_percentage = (net_pnl / trade.collateral) * 100
        
        return net_pnl, pnl_percentage


# Singleton instance
avantis_service = AvantisService()
