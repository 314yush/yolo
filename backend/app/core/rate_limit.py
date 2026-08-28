"""
Rate limiting and request-size defence for public endpoints.

State is in-memory, so limits are per process. This is adequate for the single
Railway instance we run today; scaling horizontally requires a shared backend
(slowapi supports Redis via a storage_uri, and the per-wallet buckets below
would need to move there too).
"""

import logging
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


def client_ip(request: Request) -> str:
    """
    Client IP for rate-limit bucketing.

    Railway terminates TLS in front of the app, so request.client.host is the
    proxy. We trust the left-most X-Forwarded-For entry; a client can forge it,
    which is why per-wallet limits exist alongside the per-IP ones.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


limiter = Limiter(
    key_func=client_ip,
    default_limits=[settings.rate_limit_default],
    headers_enabled=True,
)


_wallet_hits: dict[str, deque[float]] = defaultdict(deque)
_MAX_TRACKED_WALLETS = 50_000


def enforce_wallet_rate_limit(wallet: str) -> None:
    """Sliding-window limit keyed on wallet address. Raises 429 when exceeded."""
    max_hits = settings.wallet_rate_limit_max
    window = settings.wallet_rate_limit_window_seconds
    now = time.monotonic()

    hits = _wallet_hits[wallet]
    cutoff = now - window
    while hits and hits[0] < cutoff:
        hits.popleft()

    if len(hits) >= max_hits:
        logger.warning("Per-wallet rate limit hit for %s", wallet)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests for this wallet. Try again shortly.",
        )

    hits.append(now)

    if len(_wallet_hits) > _MAX_TRACKED_WALLETS:
        for key in [k for k, v in _wallet_hits.items() if not v or v[-1] < cutoff]:
            _wallet_hits.pop(key, None)


class MaxBodySizeMiddleware:
    """
    Reject oversized request bodies. Written as raw ASGI rather than
    BaseHTTPMiddleware so the request stream can be inspected without consuming
    it before the route handler reads it.
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = Headers(scope=scope).get("content-length")
        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                await JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "Invalid Content-Length header"},
                )(scope, receive, send)
                return
            if declared > self.max_bytes:
                await self._too_large(scope, receive, send)
                return

        received = 0
        exceeded = False

        async def guarded_receive():
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # Truncate the stream; the handler then fails validation on an
                    # incomplete body. Only reachable for chunked uploads that omit
                    # Content-Length, which the check above already covers otherwise.
                    exceeded = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        await self.app(scope, guarded_receive, send)
        if exceeded:
            logger.warning("Truncated oversized request body on %s", scope.get("path"))

    async def _too_large(self, scope, receive, send):
        await JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request body too large"},
        )(scope, receive, send)
