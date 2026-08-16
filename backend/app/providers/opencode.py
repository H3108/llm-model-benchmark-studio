import json, time, httpx
from ._rate_limit import limiter
from ._retry import friendly_rate_limit_error, is_plain_429, retry_429
from .base import ProviderResult, managed_async_client
from .openrouter import PROMPT, SAFE_PROVIDER_ERROR

PROVIDER_LABEL = "OpenCode"


class OpenCodeAdapter:
    """OpenAI-compatible OpenCode adapter."""

    namespace = "opencode::"

    def __init__(self, api_key: str, base_url: str, timeout: float = 60.0, client: httpx.Client | httpx.AsyncClient | None = None):
        self.api_key = api_key
        # base_url already includes /v1 (matching config default), so we build
        # endpoints by appending directly instead of adding another /v1.
        self.base_url = base_url.rstrip("/")
        self.endpoint = f"{self.base_url}/chat/completions"
        self.models_endpoint = f"{self.base_url}/models"
        self.timeout = timeout
        self.client = client

    @classmethod
    def raw_model_id(cls, model_id: str) -> str:
        return model_id[len(cls.namespace):] if model_id.startswith(cls.namespace) else model_id

    def _headers(self, streaming: bool = False) -> dict[str, str]:
        hdr = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if streaming:
            hdr["Accept"] = "text/event-stream"
        return hdr

    def benchmark(self, model_id: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(status="failed", error_message=SAFE_PROVIDER_ERROR)
        payload = {"model": self.raw_model_id(model_id), "messages": [{"role": "user", "content": PROMPT}], "stream": False}
        started = time.perf_counter()
        try:
            if self.client and isinstance(self.client, httpx.Client):
                resp = self.client.post(self.endpoint, json=payload, headers=self._headers(), timeout=self.timeout)
            else:
                with httpx.Client() as c:
                    resp = c.post(self.endpoint, json=payload, headers=self._headers(), timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000
            resp.raise_for_status()
            data = resp.json()
            tokens = data.get("usage", {}).get("completion_tokens")
            return ProviderResult(
                status="success",
                latency_ms=latency_ms,
                first_token_ms=latency_ms,
                tokens_generated=tokens,
                tokens_per_second=(tokens / (latency_ms / 1000)) if tokens else None,
            )
        except (httpx.HTTPError, ValueError, KeyError):
            return ProviderResult(status="failed", latency_ms=(time.perf_counter() - started) * 1000, error_message=SAFE_PROVIDER_ERROR)

    async def benchmark_async(self, model_id: str) -> ProviderResult:
        return await self.stream_async(model_id, PROMPT)

    async def stream_async(self, model_id: str, prompt: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(status="failed", streaming_supported=False, streaming_status="FAIL", error_message=SAFE_PROVIDER_ERROR)
        payload = {"model": self.raw_model_id(model_id), "messages": [{"role": "user", "content": prompt}], "stream": True}

        async def attempt() -> ProviderResult:
            started = time.perf_counter()
            first_token_at = None
            tokens = 0
            output_parts: list[str] = []
            async with managed_async_client(self.client) as client:
                async with limiter():
                    async with client.stream("POST", self.endpoint, json=payload, headers=self._headers(streaming=True), timeout=self.timeout) as response:
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
            return ProviderResult(status="failed", streaming_supported=False, streaming_status="FAIL",
                error_message=friendly_rate_limit_error(PROVIDER_LABEL) if is_plain_429(exc) else SAFE_PROVIDER_ERROR)

    async def list_models(self) -> list[dict]:
        """Fetch the OpenCode model catalogue.

        Raises RuntimeError if the API key is missing or the request fails.
        No stub/demo data is returned so the registry stays clean.
        """
        if not self.api_key:
            raise RuntimeError(SAFE_PROVIDER_ERROR)
        async with managed_async_client(self.client) as client:
            resp = await client.get(self.models_endpoint, headers=self._headers(), timeout=self.timeout)
            resp.raise_for_status()
            payload = resp.json()
            data = payload.get("data", []) if isinstance(payload, dict) else []
            return data if isinstance(data, list) else []
