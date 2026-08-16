import asyncio

import httpx
import pytest

from app.config import Settings
from app.providers._retry import (
    friendly_rate_limit_error,
    is_plain_429,
    retry_429,
)

import app.providers._retry as retry_mod


def _http_status_error(status_code: int, body: str = "", url: str = "https://x/v1/chat/completions") -> httpx.HTTPStatusError:
    request = httpx.Request("POST", url)
    response = httpx.Response(status_code, request=request, content=body.encode())
    return httpx.HTTPStatusError("request failed", request=request, response=response)


@pytest.fixture
def fast_settings(monkeypatch):
    settings = Settings(retry_attempts=2, retry_sleep_seconds=0.0)
    monkeypatch.setattr(retry_mod, "get_settings", lambda: settings)
    return settings


def test_is_plain_429_true_for_bare_429():
    assert is_plain_429(_http_status_error(429)) is True


def test_is_plain_429_false_for_other_status():
    assert is_plain_429(_http_status_error(500)) is False


def test_is_plain_429_false_for_non_http_error():
    assert is_plain_429(ValueError("nope")) is False


def test_friendly_rate_limit_error():
    assert friendly_rate_limit_error("OpenRouter") == "OpenRouter 免费模型临时限流，请稍后重试"


def test_retry_429_retries_once_then_succeeds(fast_settings):
    attempts = []

    async def attempt():
        attempts.append(1)
        if len(attempts) == 1:
            raise _http_status_error(429)
        return "ok"

    result = asyncio.run(retry_429(attempt))
    assert result == "ok"
    assert len(attempts) == 2


def test_retry_429_reraises_when_all_attempts_429(fast_settings):
    attempts = []

    async def attempt():
        attempts.append(1)
        raise _http_status_error(429)

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(retry_429(attempt))
    assert len(attempts) == 2


def test_retry_429_does_not_retry_quota_exhausted(fast_settings):
    from app.providers.nvidia import is_nvidia_quota_exhausted

    attempts = []

    async def attempt():
        attempts.append(1)
        raise _http_status_error(429, body='{"message": "insufficient credits"}')

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(retry_429(attempt, quota_detector=lambda exc: is_nvidia_quota_exhausted(exc, getattr(exc, "response", None))))
    # Quota exhaustion must not be retried — a single attempt only.
    assert len(attempts) == 1


def test_retry_429_does_not_retry_non_429(fast_settings):
    attempts = []

    async def attempt():
        attempts.append(1)
        raise _http_status_error(500)

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(retry_429(attempt))
    assert len(attempts) == 1