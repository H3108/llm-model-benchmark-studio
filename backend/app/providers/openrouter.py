import json
import time

import httpx

from ._rate_limit import limiter
from ._retry import FATAL_ERROR_MSG, friendly_rate_limit_error, is_plain_429, retry_429
from .base import ProviderResult, managed_async_client


PROMPT = "Write a simple FastAPI hello world API.\nReturn the answer briefly."
SAFE_PROVIDER_ERROR = FATAL_ERROR_MSG

PROVIDER_LABEL = "OpenRouter"


def _friendly_error(exc: BaseException) -> str:
    if is_plain_429(exc):
        return friendly_rate_limit_error(PROVIDER_LABEL)
    if isinstance(exc, httpx.HTTPStatusError):
        return f"请求失败 (HTTP {exc.response.status_code})"
    return SAFE_PROVIDER_ERROR


class OpenRouterAdapter:
    def __init__(self, api_key: str, base_url: str, timeout: float = 60.0, client: httpx.Client | None = None):
        self.api_key = api_key
        self.endpoint = f"{base_url.rstrip('/')}/v1/chat/completions"
        self.timeout = timeout
        self.client = client

    def benchmark(self, model_id: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(status="failed", error_message=SAFE_PROVIDER_ERROR)
        payload = {"model": model_id, "messages": [{"role": "user", "content": PROMPT}], "stream": False}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        started = time.perf_counter()
        try:
            if self.client:
                response = self.client.post(self.endpoint, json=payload, headers=headers, timeout=self.timeout)
            else:
                with httpx.Client() as client:
                    response = client.post(self.endpoint, json=payload, headers=headers, timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000
            response.raise_for_status()
            data = response.json()
            usage = data.get("usage") or {}
            tokens = usage.get("completion_tokens")
            return ProviderResult(
                status="success", latency_ms=latency_ms, first_token_ms=latency_ms,
                tokens_generated=tokens,
                tokens_per_second=(tokens / (latency_ms / 1000)) if tokens and latency_ms > 0 else None,
            )
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            return ProviderResult(status="failed", latency_ms=(time.perf_counter() - started) * 1000, error_message=_friendly_error(exc))

    async def benchmark_async(self, model_id: str) -> ProviderResult:
        return await self.stream_async(model_id, PROMPT)

    async def stream_async(self, model_id: str, prompt: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(status="failed", streaming_supported=False, streaming_status="FAIL", error_message=SAFE_PROVIDER_ERROR)
        payload = {"model": model_id, "messages": [{"role": "user", "content": prompt}], "stream": True}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "Accept": "text/event-stream"}

        async def attempt() -> ProviderResult:
            started = time.perf_counter()
            first_token_at = None
            tokens = 0
            output_parts: list[str] = []
            async with managed_async_client(self.client) as client:
                async with limiter():
                    async with client.stream("POST", self.endpoint, json=payload, headers=headers, timeout=self.timeout) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            value = line[5:].strip()
                            if value == "[DONE]":
                                continue
                            try:
                                chunk = json.loads(value)
                            except ValueError:
                                continue
                            choices = chunk.get("choices") or []
                            content = (choices[0].get("delta") or {}).get("content") if choices else None
                            if content:
                                if first_token_at is None:
                                    first_token_at = time.perf_counter()
                                tokens += 1
                                output_parts.append(content)
                            usage = chunk.get("usage") or {}
                            tokens = usage.get("completion_tokens", tokens)
            completed = time.perf_counter()
            latency_ms = (completed - started) * 1000
            first_ms = (first_token_at - started) * 1000 if first_token_at else None
            supported = first_token_at is not None
            return ProviderResult(status="success" if supported else "failed", latency_ms=latency_ms, first_token_ms=first_ms,
                tokens_generated=tokens, tokens_per_second=(tokens / (latency_ms / 1000)) if tokens and latency_ms > 0 else None,
                streaming_supported=supported, streaming_status="PASS" if supported else "FAIL",
                raw_output="".join(output_parts) or None,
                error_message=None if supported else "流式响应未返回内容")

        try:
            return await retry_429(attempt)
        except (httpx.HTTPError, ValueError) as exc:
            return ProviderResult(status="failed", streaming_supported=False, streaming_status="FAIL", error_message=_friendly_error(exc))

    async def list_models(self) -> list[dict]:
        if not self.api_key:
            raise RuntimeError(SAFE_PROVIDER_ERROR)
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with managed_async_client(self.client) as client:
            response = await client.get(f"{self.endpoint.rsplit('/v1/', 1)[0]}/v1/models", headers=headers, timeout=self.timeout)
            response.raise_for_status()
            return response.json().get("data", [])
