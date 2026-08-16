import json
import time

import httpx

from ._rate_limit import limiter
from ._retry import friendly_rate_limit_error, is_plain_429, retry_429
from .base import ProviderResult, managed_async_client
from .openrouter import PROMPT, SAFE_PROVIDER_ERROR

PROVIDER_LABEL = "Google Gemini"


# Keywords that identify non-chat models on Google’s catalogue. These are
# embedding, image-generation, video-generation, audio, transcription or
# safety models that cannot be benchmarked with a text chat prompt.
GOOGLE_NON_CHAT_KEYWORDS = (
    "embedding",
    "imagen",
    "veo",
    "lyria",
    "chirp",
    "speech",
    "tts",
    "native-audio",
    "audio",
    "whisper",
    "dfaistudio",
    "search-retrieval",
    "monitoring",
    "robotics",
    "computer-use",
    "deep-research",
    "antigravity",
    "nano-banana",
    "aqa",
    "live-preview",
    "live-translate",
)


def google_is_chat_model(model_id: str) -> bool:
    """Return True for chat-compatible Google model IDs."""
    lowered = model_id.lower()
    return not any(kw in lowered for kw in GOOGLE_NON_CHAT_KEYWORDS)

class GoogleAdapter:
    """OpenAI-compatible Google Gemini adapter for AI Studio / Gemini API.

    Google's Gemini API provides a free tier (rate-limited) for all
    chat-compatible models including Gemini and Gemma series. This adapter
    uses the OpenAI-compatible endpoint at
    generativelanguage.googleapis.com/v1beta/openai.
    """

    namespace = "google::"

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
            return ProviderResult(
                status="failed",
                streaming_supported=False,
                streaming_status="FAIL",
                error_message=friendly_rate_limit_error(PROVIDER_LABEL) if is_plain_429(exc) else SAFE_PROVIDER_ERROR,
            )

    async def list_models(self) -> list[dict]:
        """Fetch the Google Gemini model catalogue.

        Uses the OpenAI-compatible /models endpoint with Bearer auth.
        Returns all models; chat-compatibility filtering is handled by
        the registry's _is_free() via google_is_chat_model().
        """
        async with managed_async_client(self.client) as client:
            resp = await client.get(self.models_endpoint, headers=self._headers(), timeout=self.timeout)
            resp.raise_for_status()
            payload = resp.json()
            data = payload.get("data", []) if isinstance(payload, dict) else []
            # Google returns model IDs with a "models/" prefix (e.g.
            # "models/gemini-2.5-flash"); strip it so the registry stores
            # clean IDs like "google::gemini-2.5-flash".
            for item in data:
                raw = item.get("id") or ""
                if raw.startswith("models/"):
                    item["id"] = raw[len("models/"):]
            return data if isinstance(data, list) else []
