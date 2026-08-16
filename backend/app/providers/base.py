from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Protocol

import httpx


@dataclass
class ProviderResult:
    status: str
    latency_ms: float | None = None
    first_token_ms: float | None = None
    tokens_generated: int | None = None
    tokens_per_second: float | None = None
    streaming_supported: bool | None = None
    streaming_status: str | None = None
    raw_output: str | None = None
    error_message: str | None = None


class ProviderAdapter(Protocol):
    def benchmark(self, model_id: str) -> ProviderResult: ...


@asynccontextmanager
async def managed_async_client(client: httpx.AsyncClient | None) -> AsyncGenerator[httpx.AsyncClient]:
    """Yield an async HTTP client, closing it only if it was created here.

    When a caller injects a shared AsyncClient it must not be closed; when no
    client is supplied we create a transient one and close it on exit.
    """
    if isinstance(client, httpx.AsyncClient):
        yield client
    else:
        async with httpx.AsyncClient() as c:
            yield c
