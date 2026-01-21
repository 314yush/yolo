"""
Price feed service using Avantis SDK.
Uses the SDK's built-in FeedClient instead of calling Pyth directly.
"""

from typing import Optional
import time

from app.services.avantis import avantis_service


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
        print(f"🔍 Getting price for: {pair}")
        
        # Check cache first
        if pair in self._cache:
            cached_price, cached_time = self._cache[pair]
            if time.time() - cached_time < self._cache_ttl:
                print(f"   Cache hit: ${cached_price:.2f}")
                return cached_price, int(cached_time)

        try:
            # Ensure pair feeds are loaded
            self._ensure_feeds_loaded()
            print(f"   Feeds loaded: {self._feeds_loaded}")
            
            # Use the Avantis SDK's feed client
            feed_client = avantis_service.client.feed_client
            print(f"   Feed client has {len(feed_client.pair_feeds)} pairs")
            
            # Get price updates for this pair
            response = await feed_client.get_latest_price_updates([pair])
            print(f"   Response: {response.parsed is not None}, len={len(response.parsed) if response.parsed else 0}")
            
            if response.parsed and len(response.parsed) > 0:
                price_data = response.parsed[0]
                price = price_data.converted_price
                timestamp = int(time.time())
                
                print(f"   ✅ Price: ${price:.2f}")
                
                # Cache the result
                self._cache[pair] = (price, timestamp)
                
                return price, timestamp
            else:
                print(f"   ❌ No parsed data in response")

        except Exception as e:
            print(f"❌ Error fetching price from Avantis SDK: {e}")
            import traceback
            traceback.print_exc()

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
            
            # Get price updates for all pairs at once
            response = await feed_client.get_latest_price_updates(pairs)
            
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
            print(f"Error fetching prices from Avantis SDK: {e}")
            import traceback
            traceback.print_exc()

        return results


# Singleton instance
price_feed_service = PriceFeedService()
