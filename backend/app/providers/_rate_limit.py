"""Global async request concurrency cap across all providers.

Benchmark runs fan out with asyncio.gather, so without a guard a single run
can fire every requested model/task at the upstream API simultaneously. All
provider requests share one semaphore, limiting simultaneous upstream calls to
the configured max (the current dev API key is limited to 6 before 429s).

The cap is configurable via Settings.max_benchmark_concurrency (.env), so it
can be raised or disabled without touching provider code.
"""
import asyncio
from contextlib import asynccontextmanager

from ..config import get_settings

_semaphore: asyncio.Semaphore | None = None


async def _get_semaphore() -> asyncio.Semaphore | None:
    global _semaphore
    if _semaphore is None:
        cap = get_settings().max_benchmark_concurrency
        # 0 means "no cap": honor it by returning None so limiter() is a no-op.
        _semaphore = asyncio.Semaphore(cap) if cap and cap > 0 else None
    return _semaphore


@asynccontextmanager
async def limiter():
    sem = await _get_semaphore()
    if sem is None:
        yield
    else:
        async with sem:
            yield