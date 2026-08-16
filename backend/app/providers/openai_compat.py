"""Generic OpenAI-compatible adapter for custom providers.

This adapter lets operators add new OpenAI-compatible providers (Moonshot,
DeepSeek, Zhipu, Together, Groq, local vLLM/Ollama, etc.) purely via
``backend/.env`` configuration — no code changes needed.

Configuration is driven by ``CUSTOM_PROVIDERS`` (comma-separated IDs) plus
per-provider env keys following the ``{ID}_*`` naming convention:

    CUSTOM_PROVIDERS=moonshot,deepseek
    MOONSHOT_API_KEY=sk-xxx
    MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
    MOONSHOT_FREE_MODELS=moonshot-v1-8k,moonshot-v1-32k
    MOONSHOT_LABEL=月之暗面
    MOONSHOT_COLOR=#6366f1
    MOONSHOT_INITIALS=MK

The adapter speaks the standard OpenAI Chat Completions + Models API:
    POST {base_url}/chat/completions
    GET  {base_url}/models

Registry IDs use the ``{provider}::`` namespace convention (e.g.
``moonshot::moonshot-v1-8k``), matching the existing siliconflow/tencentcloud
pattern. Free status is determined exclusively by the operator's
``{ID}_FREE_MODELS`` whitelist — pricing is never inferred, matching the
safe-by-default policy used for nvidia/google.
"""

import json
import time

import httpx

from ._rate_limit import limiter
from ._retry import friendly_rate_limit_error, is_plain_429, retry_429
from .base import ProviderResult, managed_async_client
from .openrouter import PROMPT, SAFE_PROVIDER_ERROR


def _namespaced_raw_model_id(namespace: str, model_id: str) -> str:
    """Strip the provider namespace prefix, if present."""
    return model_id[len(namespace):] if model_id.startswith(namespace) else model_id


class OpenAICompatAdapter:
    """Parameterized adapter for any OpenAI-compatible provider.

    The ``provider_id`` and ``namespace`` are derived from the operator's
    ``CUSTOM_PROVIDERS`` configuration. ``namespace`` defaults to
    ``"{provider_id}::"`` and is used to disambiguate model IDs in the shared
    registry — the same convention already used by siliconflow/tencentcloud.
    """

    def __init__(
        self,
        provider_id: str,
        api_key: str,
        base_url: str,
        timeout: float = 60.0,
        namespace: str | None = None,
        label: str | None = None,
        client: httpx.Client | httpx.AsyncClient | None = None,
    ):
        self.provider_id = provider_id
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.endpoint = f"{self.base_url}/chat/completions"
        self.models_endpoint = f"{self.base_url}/models"
        self.timeout = timeout
        self.namespace = namespace or f"{provider_id}::"
        self.label = label or provider_id
        self.client = client

    def raw_model_id(self, model_id: str) -> str:
        return _namespaced_raw_model_id(self.namespace, model_id)

    def _headers(self, streaming: bool = False) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if streaming:
            headers["Accept"] = "text/event-stream"
        return headers

    def benchmark(self, model_id: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(status="failed", error_message=SAFE_PROVIDER_ERROR)
        payload = {
            "model": self.raw_model_id(model_id),
            "messages": [{"role": "user", "content": PROMPT}],
            "stream": False,
        }
        started = time.perf_counter()
        try:
            if self.client and isinstance(self.client, httpx.Client):
                response = self.client.post(self.endpoint, json=payload, headers=self._headers(), timeout=self.timeout)
            else:
                with httpx.Client() as client:
                    response = client.post(self.endpoint, json=payload, headers=self._headers(), timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000
            response.raise_for_status()
            data = response.json()
            usage = data.get("usage") or {}
            tokens = usage.get("completion_tokens")
            return ProviderResult(
                status="success",
                latency_ms=latency_ms,
                first_token_ms=latency_ms,
                tokens_generated=tokens,
                tokens_per_second=(tokens / (latency_ms / 1000)) if tokens and latency_ms > 0 else None,
            )
        except (httpx.HTTPError, ValueError, KeyError):
            return ProviderResult(
                status="failed",
                latency_ms=(time.perf_counter() - started) * 1000,
                error_message=SAFE_PROVIDER_ERROR,
            )

    async def benchmark_async(self, model_id: str) -> ProviderResult:
        return await self.stream_async(model_id, PROMPT)

    async def stream_async(self, model_id: str, prompt: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(
                status="failed",
                streaming_supported=False,
                streaming_status="FAIL",
                error_message=SAFE_PROVIDER_ERROR,
            )
        payload = {
            "model": self.raw_model_id(model_id),
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
        }

        async def attempt() -> ProviderResult:
            started = time.perf_counter()
            first_token_at = None
            tokens = 0
            output_parts: list[str] = []
            async with managed_async_client(self.client) as client:
                async with limiter():
                    async with client.stream(
                        "POST",
                        self.endpoint,
                        json=payload,
                        headers=self._headers(streaming=True),
                        timeout=self.timeout,
                    ) as response:
                        response.raise_for_status()
                        async for line in response.iter_lines():
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
                            choice = choices[0] if choices else {}
                            delta = choice.get("delta") or {}
                            content = delta.get("content") or choice.get("text")
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
            return ProviderResult(
                status="success" if supported else "failed",
                latency_ms=latency_ms,
                first_token_ms=first_ms,
                tokens_generated=tokens,
                tokens_per_second=(tokens / (latency_ms / 1000)) if tokens and latency_ms > 0 else None,
                streaming_supported=supported,
                streaming_status="PASS" if supported else "FAIL",
                raw_output="".join(output_parts) or None,
                error_message=None if supported else "流式响应未返回内容",
            )

        try:
            return await retry_429(attempt)
        except (httpx.HTTPError, ValueError) as exc:
            return ProviderResult(
                status="failed",
                streaming_supported=False,
                streaming_status="FAIL",
                error_message=friendly_rate_limit_error(self.label) if is_plain_429(exc) else SAFE_PROVIDER_ERROR,
            )

    async def list_models(self) -> list[dict]:
        """Fetch the provider's model catalogue via GET /models.

        Returns a list of ``{"id": ..., "object": "model", ...}`` dicts in the
        standard OpenAI Models API shape. Pricing enrichment is intentionally
        not performed — free status is decided by the operator's
        ``{ID}_FREE_MODELS`` whitelist in the registry layer.

        Raises RuntimeError if the API key is missing or the request fails.
        """
        if not self.api_key:
            raise RuntimeError(SAFE_PROVIDER_ERROR)
        async with managed_async_client(self.client) as client:
            response = await client.get(self.models_endpoint, headers=self._headers(), timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data", []) if isinstance(payload, dict) else []
            return data if isinstance(data, list) else []
