"""
Price feed service using Avantis SDK.
Uses the SDK's built-in FeedClient instead of calling Pyth directly.
"""

from typing import Optional
import time
import logging

from app.services.avantis import avantis_service

logger = logging.getLogger(__name__)


class PriceFeedService:
    """Service for fetching prices via Avantis SDK."""

    def __init__(self):
        self._cache: dict[str, tuple[float, int]] = {}  # pair -> (price, timestamp)
        self._cache_ttl = 5  # 5 seconds cache
        self._feeds_loaded = False

    def _ensure_feeds_loaded(self):
        """Load pair feeds if not already loaded."""
        if not self._feeds_loaded:
            feed_client = avantis_service.client.feed_client
            feed_client.load_pair_feeds()  # Synchronous call
            self._feeds_loaded = True

    async def get_price(self, pair: str) -> Optional[tuple[float, int]]:
        """
        Get current price for a pair using Avantis SDK.
        Returns (price, timestamp) or None if not available.
        """
        # Check cache first
        if pair in self._cache:
            cached_price, cached_time = self._cache[pair]
            if time.time() - cached_time < self._cache_ttl:
                return cached_price, int(cached_time)

        try:
            # Ensure pair feeds are loaded
            self._ensure_feeds_loaded()
            
            # Use the Avantis SDK's feed client
            feed_client = avantis_service.client.feed_client
            
            # Get price updates for this pair with timeout
            import asyncio
            try:
                response = await asyncio.wait_for(
                    feed_client.get_latest_price_updates([pair]),
                    timeout=10.0  # 10 second timeout for price feed
                )
            except asyncio.TimeoutError:
                logger.warning(f"Price feed timeout for {pair}, using cached price if available")
                if pair in self._cache:
                    cached_price, cached_time = self._cache[pair]
                    return cached_price, int(cached_time)
                raise Exception(f"Price feed timeout for {pair} and no cached price available")
            
            if response.parsed and len(response.parsed) > 0:
                price_data = response.parsed[0]
                price = price_data.converted_price
                timestamp = int(time.time())
                
                # Cache the result
                self._cache[pair] = (price, timestamp)
                
                return price, timestamp

        except Exception as e:
            logger.error(f"Error fetching price from Avantis SDK: {e}", exc_info=True)

        return None

    async def get_prices(self, pairs: list[str]) -> dict[str, tuple[float, int]]:
        """Get prices for multiple pairs using Avantis SDK."""
        results = {}
        
        if not pairs:
            return results

        try:
            # Ensure pair feeds are loaded
            self._ensure_feeds_loaded()
            
            # Use the Avantis SDK's feed client
            feed_client = avantis_service.client.feed_client
            
            # Get price updates for all pairs at once with timeout
            import asyncio
            try:
                response = await asyncio.wait_for(
                    feed_client.get_latest_price_updates(pairs),
                    timeout=10.0  # 10 second timeout for price feed
                )
            except asyncio.TimeoutError:
                logger.warning("Price feed timeout for multiple pairs, using cached prices where available")
                # Return cached prices for pairs that have them
                for pair in pairs:
                    if pair in self._cache:
                        cached_price, cached_time = self._cache[pair]
                        results[pair] = (cached_price, int(cached_time))
                return results
            
            if response.parsed:
                timestamp = int(time.time())
                # The response may not have pair info, so match by index
                for i, item in enumerate(response.parsed):
                    if i < len(pairs):
                        pair = pairs[i]
                        price = item.converted_price
                        results[pair] = (price, timestamp)
                        self._cache[pair] = (price, timestamp)

        except Exception as e:
            logger.error(f"Error fetching prices from Avantis SDK: {e}", exc_info=True)

        return results


# Singleton instance
price_feed_service = PriceFeedService()
