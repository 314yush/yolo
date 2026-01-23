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
        import json
        start_time = time.time()
        request_id = f"{int(time.time()*1000)}-{id(self)}"
        
        # #region agent log
        with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"location":"price_feed.py:30","message":"get_price started","data":{"requestId":request_id,"pair":pair,"hasCache":pair in self._cache},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        # #endregion
        
        # Check cache first
        if pair in self._cache:
            cached_price, cached_time = self._cache[pair]
            if time.time() - cached_time < self._cache_ttl:
                # #region agent log
                with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"location":"price_feed.py:39","message":"Cache hit","data":{"requestId":request_id,"pair":pair,"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
                # #endregion
                return cached_price, int(cached_time)

        try:
            # Ensure pair feeds are loaded
            feeds_start = time.time()
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"price_feed.py:43","message":"_ensure_feeds_loaded started","data":{"requestId":request_id,"feedsLoaded":self._feeds_loaded},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
            
            self._ensure_feeds_loaded()
            
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"price_feed.py:46","message":"_ensure_feeds_loaded completed","data":{"requestId":request_id,"elapsedMs":int((time.time()-feeds_start)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
            
            # Use the Avantis SDK's feed client
            feed_client = avantis_service.client.feed_client
            
            # Get price updates for this pair with timeout
            import asyncio
            sdk_start = time.time()
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"price_feed.py:52","message":"SDK get_latest_price_updates started","data":{"requestId":request_id,"pair":pair},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
            
            try:
                response = await asyncio.wait_for(
                    feed_client.get_latest_price_updates([pair]),
                    timeout=10.0  # 10 second timeout for price feed
                )
            except asyncio.TimeoutError:
                # #region agent log
                with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"location":"price_feed.py:58","message":"SDK timeout","data":{"requestId":request_id,"pair":pair,"elapsedMs":int((time.time()-sdk_start)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
                # #endregion
                logger.warning(f"Price feed timeout for {pair}, using cached price if available")
                if pair in self._cache:
                    cached_price, cached_time = self._cache[pair]
                    return cached_price, int(cached_time)
                raise Exception(f"Price feed timeout for {pair} and no cached price available")
            
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"price_feed.py:66","message":"SDK get_latest_price_updates completed","data":{"requestId":request_id,"pair":pair,"elapsedMs":int((time.time()-sdk_start)*1000),"hasParsed":response.parsed is not None,"parsedLen":len(response.parsed) if response.parsed else 0},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
            
            if response.parsed and len(response.parsed) > 0:
                price_data = response.parsed[0]
                price = price_data.converted_price
                timestamp = int(time.time())
                
                # Cache the result
                self._cache[pair] = (price, timestamp)
                
                # #region agent log
                with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"location":"price_feed.py:75","message":"get_price completed","data":{"requestId":request_id,"pair":pair,"price":price,"totalElapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
                # #endregion
                
                return price, timestamp

        except Exception as e:
            # #region agent log
            with open('/Users/piyush/yolo/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"location":"price_feed.py:78","message":"get_price error","data":{"requestId":request_id,"pair":pair,"error":str(e),"elapsedMs":int((time.time()-start_time)*1000)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
            # #endregion
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
