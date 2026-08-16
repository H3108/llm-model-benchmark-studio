import json
import time

import httpx

from ._rate_limit import limiter
from ._retry import friendly_rate_limit_error, is_plain_429, retry_429
from .base import ProviderResult, managed_async_client
from .openrouter import PROMPT, SAFE_PROVIDER_ERROR


PROVIDER_LABEL = "SiliconFlow"


class SiliconFlowAdapter:
    """OpenAI-compatible SiliconFlow adapter.

    The registry owns the ``siliconflow::`` namespace. This adapter receives
    that registry ID and removes the namespace only at the wire boundary.
    """

    namespace = "siliconflow::"
    PRICING_PAGE_URL = "https://siliconflow.cn/pricing"

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
        """Fetch the SiliconFlow model catalogue with pricing enrichment.

        The /v1/models API returns only {id, object, created, owned_by} — no
        pricing. To discover which models are free ($0), we scrape the public
        pricing page (https://siliconflow.cn/pricing), parse the embedded
        Next.js RSC data, and inject ``pricing`` dicts so the registry's
        ``_is_zero_priced()`` logic works automatically.

        Raises RuntimeError if the API key is missing or the request fails.
        """
        if not self.api_key:
            raise RuntimeError(SAFE_PROVIDER_ERROR)
        async with managed_async_client(self.client) as client:
            response = await client.get(self.models_endpoint, headers=self._headers(), timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data", []) if isinstance(payload, dict) else []
            models = data if isinstance(data, list) else []

        # Enrich with pricing data from the public pricing page so the
        # registry can auto-detect free ($0) models without a manual whitelist.
        pricing_map = await self._fetch_free_models_from_pricing_page()
        for model in models:
            raw_id = model.get("id", "")
            if raw_id in pricing_map:
                info = pricing_map[raw_id]
                model["pricing"] = {"prompt": 0, "completion": 0}
                if info.get("context_length"):
                    model["context_length"] = info["context_length"]
        return models

    async def _fetch_free_models_from_pricing_page(self) -> dict[str, dict]:
        """Parse the SiliconFlow pricing page and return models priced at $0.

        Returns a dict of ``{model_id: {context_length, type}}`` for every
        model whose price is explicitly "0". Falls back to an empty dict if
        the page is unreachable so the API-only model list still works.
        """
        import re

        async with managed_async_client(self.client) as client:
            try:
                resp = await client.get(
                    self.PRICING_PAGE_URL,
                    timeout=30.0,
                    headers={"User-Agent": "Mozilla/5.0"},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                html = resp.text
            except httpx.HTTPError:
                return {}

        # The pricing page is a Next.js SPA that embeds model data in RSC
        # streaming chunks: self.__next_f.push([1,"...escaped JSON..."])
        raw_chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
        raw_data = ""
        for chunk in raw_chunks:
            try:
                raw_data += json.loads(f'"{chunk}"') + "\n"
            except (ValueError, json.JSONDecodeError):
                raw_data += chunk + "\n"

        # Each model block contains "modelName":"..." and nearby "price":"..."
        free_models: dict[str, dict] = {}
        positions = [
            (m.start(), m.group(1))
            for m in re.finditer(r'"modelName":"([^"]+)"', raw_data)
        ]
        for i, (pos, name) in enumerate(positions):
            end = positions[i + 1][0] if i + 1 < len(positions) else min(len(raw_data), pos + 2000)
            block = raw_data[pos:end]
            price_match = re.search(r'"price":"([^"]*)"', block)
            ctx_match = re.search(r'"contextLen":(\d+)', block)
            type_match = re.search(r'"type":"([^"]*)"', block)
            if price_match and price_match.group(1) == "0":
                free_models[name] = {
                    "context_length": int(ctx_match.group(1)) if ctx_match else None,
                    "type": type_match.group(1) if type_match else None,
                }
        return free_models
