"""429 auto-retry for upstream LLM providers.

Benchmark runs occasionally hit HTTP 429 because the dev API key's
concurrency/frequency limit is transiently exceeded. Since this is a
per-key limit (gone once the key or provider changes), a single retry after
a short pause is enough: 429 is momentary, and once the key's slot frees up
the next attempt usually succeeds.

Only a *plain* rate-limit 429 is retried. NVIDIA and Tencent Cloud also use
429/403 with a quota-exhausted body (see their own quota detection); those
must NOT be retried, or we would re-fire requests against an allowance that
is already spent. Pass ``quota_detector`` (their detector) to skip those.

The retry drives a ``fn()`` coroutine rather than a context manager: a
context manager cannot re-enter the caller's inline body once it has raised,
but re-invoking ``fn()`` cleanly starts a fresh attempt.
"""
import asyncio
from collections.abc import Awaitable, Callable

import httpx

from ..config import get_settings

PLAIN_RATE_LIMIT_MSG = "临时限流，请稍后重试"
FATAL_ERROR_MSG = "请求失败，请稍后重试"


def is_plain_429(exc: BaseException) -> bool:
    """True for a bare HTTP 429 (used for failure messages on non-quota providers)."""
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    return exc.response.status_code == 429


def friendly_rate_limit_error(provider_name: str) -> str:
    return f"{provider_name} 免费模型{PLAIN_RATE_LIMIT_MSG}"


async def retry_429(
    fn: Callable[[], Awaitable[object]],
    *,
    quota_detector: Callable[[BaseException], bool] | None = None,
) -> object:
    """Run ``fn()``, retrying once on a bare rate-limit 429.

    Re-invokes ``fn()`` up to ``retry_attempts`` times (default 2: initial +
    one retry). Quota-exhausted responses (per ``quota_detector``) and any
    non-429 error are never retried and re-raise immediately, so the caller's
    own error handling stays authoritative.
    """
    settings = get_settings()
    attempts = getattr(settings, "retry_attempts", 2)
    sleep_duration = getattr(settings, "retry_sleep_seconds", 1.0)
    for attempt in range(attempts):
        try:
            return await fn()
        except httpx.HTTPStatusError as exc:
            if quota_detector is not None and quota_detector(exc):
                raise
            if not is_plain_429(exc):
                raise
            if attempt == attempts - 1:
                raise
            await asyncio.sleep(sleep_duration)
    raise RuntimeError("unreachable")  # pragma: no cover