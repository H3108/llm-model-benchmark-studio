import json
import time

import httpx

from ._rate_limit import limiter
from ._retry import friendly_rate_limit_error, is_plain_429, retry_429
from .base import ProviderResult, managed_async_client

PROVIDER_LABEL = "腾讯云"
from .openrouter import PROMPT, SAFE_PROVIDER_ERROR


# Tencent Cloud Hunyuan returns these when the monthly free quota runs out.
# The OpenAI-compatible endpoint wraps the native error in error.message.
# Tencent Cloud TokenHub returns code "401008" when the free trial quota is
# exhausted and postpaid billing is not enabled. Other markers cover the
# common quota-related error strings across Tencent Cloud services.
QUOTA_EXHAUSTED_MARKERS = (
    "401008",
    "FreeTrialQuotaExhausted",
    "免费体验额度已耗尽",
    "免费额度",
    "额度已用尽",
    "exceeded your current quota",
    "insufficient_quota",
    "limitexceeded",
    "余额不足",
    "postpaid billing is not enabled",
)


def is_quota_exhausted(exc: BaseException | None, response: httpx.Response | None = None) -> bool:
    """Detect whether the failure is a free-quota exhaustion signal.

    Checks both the HTTP body text and the exception message for keywords
    Tencent Cloud emits when the monthly token allowance runs out.
    """
    haystack = ""
    if response is not None:
        haystack += getattr(response, "text", "") or ""
    if exc is not None:
        haystack += str(exc)
    lowered = haystack.lower()
    return any(marker.lower() in lowered for marker in QUOTA_EXHAUSTED_MARKERS)


class TencentCloudAdapter:
    """OpenAI-compatible Tencent Cloud Hunyuan adapter.

    Tencent Cloud's "free" is fundamentally different from the other three
    providers: it is *quota-based* (a monthly token allowance) rather than
    *price-based* ($0 indefinitely). When the quota is exhausted the API
    starts charging or returns a quota-exceeded error. This adapter detects
    that signal so the registry can auto-exclude the model.
    """

    namespace = "tencentcloud::"

    def __init__(self, api_key: str, base_url: str, timeout: float = 60.0, client: httpx.Client | httpx.AsyncClient | None = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.endpoint = f"{self.base_url}/chat/completions"
        self.models_endpoint = f"{self.base_url}/models"
        self.timeout = timeout
        self.client = client

    @classmethod
    def raw_model_id(cls, model_id: str) -> str:
        return model_id[len(cls.namespace):] if model_id.startswith(cls.namespace) else model_id

    def _headers(self, streaming: bool = False) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if streaming:
            headers["Accept"] = "text/event-stream"
        return headers

    def benchmark(self, model_id: str) -> ProviderResult:
        if not self.api_key:
            return ProviderResult(status="failed", error_message=SAFE_PROVIDER_ERROR)
        payload = {"model": self.raw_model_id(model_id), "messages": [{"role": "user", "content": PROMPT}], "stream": False}
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
            tokens = data.get("usage", {}).get("completion_tokens")
            return ProviderResult(
                status="success",
                latency_ms=latency_ms,
                first_token_ms=latency_ms,
                tokens_generated=tokens,
                tokens_per_second=(tokens / (latency_ms / 1000)) if tokens else None,
            )
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            quota_hit = is_quota_exhausted(exc, getattr(exc, "response", None))
            return ProviderResult(status="failed", latency_ms=(time.perf_counter() - started) * 1000, error_message="quota_exhausted" if quota_hit else SAFE_PROVIDER_ERROR)

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
            return await retry_429(
                attempt,
                quota_detector=lambda exc: is_quota_exhausted(exc, getattr(exc, "response", None)),
            )
        except (httpx.HTTPError, ValueError) as exc:
            quota_hit = is_quota_exhausted(exc, getattr(exc, "response", None))
            message = (
                "quota_exhausted"
                if quota_hit
                else friendly_rate_limit_error(PROVIDER_LABEL)
                if is_plain_429(exc)
                else SAFE_PROVIDER_ERROR
            )
            return ProviderResult(
                status="failed",
                streaming_supported=False,
                streaming_status="FAIL",
                error_message=message,
            )

    async def list_models(self) -> list[dict]:
        """Fetch the Tencent Cloud Hunyuan model catalogue.

        Raises RuntimeError if the API key is missing or the request fails.
        """
        if not self.api_key:
            raise RuntimeError(SAFE_PROVIDER_ERROR)
        async with managed_async_client(self.client) as client:
            resp = await client.get(self.models_endpoint, headers=self._headers(), timeout=self.timeout)
            resp.raise_for_status()
            payload = resp.json()
            data = payload.get("data", []) if isinstance(payload, dict) else []
            return data if isinstance(data, list) else []
