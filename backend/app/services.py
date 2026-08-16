import asyncio
import time
import uuid

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import AuditLog, BenchmarkRun, ModelBenchmark
from .registry import ModelRegistry, explicit_free_model_filter
from .providers.base import ProviderResult
from .providers.openrouter import OpenRouterAdapter, SAFE_PROVIDER_ERROR
from .providers.siliconflow import SiliconFlowAdapter
from .providers.opencode import OpenCodeAdapter
from .providers.tencentcloud import TencentCloudAdapter
from .providers.nvidia import NvidiaAdapter
from .providers.google import GoogleAdapter
from .providers.openai_compat import OpenAICompatAdapter


def _benchmark_fields(result: ProviderResult) -> dict:
    """Map provider output to the columns owned by ModelBenchmark."""
    return {
        "status": result.status,
        "latency_ms": result.latency_ms,
        "first_token_ms": result.first_token_ms,
        "tokens_generated": result.tokens_generated,
        "tokens_per_second": result.tokens_per_second,
        "streaming_supported": result.streaming_supported,
        "streaming_status": result.streaming_status,
        "error_message": result.error_message,
    }


def provider_for(model_id: str, settings: Settings, provider: str | None = None):
    """Create the adapter selected by the registry/provider namespace.

    The optional provider is supplied from ModelRegistry by production paths.
    The namespace fallback keeps this helper backwards-compatible for scripts
    and unit tests that call it without a database session.
    """
    selected = (provider or (
        "siliconflow" if model_id.startswith(SiliconFlowAdapter.namespace)
        else ("opencode" if model_id.startswith(OpenCodeAdapter.namespace)
        else ("tencentcloud" if model_id.startswith(TencentCloudAdapter.namespace)
        else ("nvidia" if model_id.startswith(NvidiaAdapter.namespace)
        else ("google" if model_id.startswith(GoogleAdapter.namespace)
        else "openrouter"))))
    )).lower()
    if selected == "siliconflow":
        return selected, SiliconFlowAdapter(settings.siliconflow_api_key, settings.siliconflow_base_url, settings.request_timeout_seconds)
    if selected == "openrouter":
        return selected, OpenRouterAdapter(settings.openrouter_api_key, settings.openrouter_base_url, settings.request_timeout_seconds)
    if selected == "opencode":
        return selected, OpenCodeAdapter(getattr(settings, "opencode_api_key", ""), getattr(settings, "opencode_base_url", "https://opencode.ai/zen/v1"), settings.request_timeout_seconds)
    if selected == "tencentcloud":
        return selected, TencentCloudAdapter(getattr(settings, "tencentcloud_api_key", ""), getattr(settings, "tencentcloud_base_url", "https://api.hunyuan.cloud.tencent.com/v1"), settings.request_timeout_seconds)
    if selected == "nvidia":
        return selected, NvidiaAdapter(getattr(settings, "nvidia_api_key", ""), getattr(settings, "nvidia_base_url", "https://integrate.api.nvidia.com/v1"), settings.request_timeout_seconds)
    if selected == "google":
        return selected, GoogleAdapter(getattr(settings, "google_api_key", ""), getattr(settings, "google_base_url", "https://generativelanguage.googleapis.com/v1beta/openai"), settings.request_timeout_seconds)
    # Fallback: dynamically-configured OpenAI-compatible providers.
    custom_specs = settings.custom_provider_specs()
    if selected in custom_specs:
        spec = custom_specs[selected]
        return selected, OpenAICompatAdapter(
            provider_id=selected,
            api_key=spec["api_key"],
            base_url=spec["base_url"],
            timeout=settings.request_timeout_seconds,
            namespace=f"{selected}::",
            label=spec.get("label"),
        )
    raise ValueError(f"Unsupported provider: {selected}")


def _registry_provider(db: Session, model_id: str) -> str | None:
    row = db.scalar(select(ModelRegistry).where(ModelRegistry.model_id == model_id))
    return row.provider if row else None


def _provider_call(db: Session, model_id: str, settings: Settings):
    provider = _registry_provider(db, model_id)
    return provider_for(model_id, settings, provider) if provider else provider_for(model_id, settings)


def run_benchmarks(db: Session, model_ids: list[str], settings: Settings) -> list[ModelBenchmark]:
    results = []
    for model_id in (item.strip() for item in model_ids):
        if not model_id:
            continue
        try:
            provider, adapter = _provider_call(db, model_id, settings)
            result = adapter.benchmark(model_id)
        except Exception:
            provider = "unknown"
            result = ProviderResult(status="failed", error_message=SAFE_PROVIDER_ERROR)
        row = ModelBenchmark(provider=provider, model_id=model_id, **_benchmark_fields(result))
        db.add(row)
        results.append(row)
    db.commit()
    for row in results:
        db.refresh(row)
    return results


def list_results(db: Session) -> list[ModelBenchmark]:
    # Do not surface historical paid/unknown model records in the UI.
    return list(db.scalars(
        select(ModelBenchmark)
        .join(ModelRegistry, ModelRegistry.model_id == ModelBenchmark.model_id)
        .where(ModelRegistry.catalog_status != "excluded", explicit_free_model_filter())
        .order_by(ModelBenchmark.tested_at.desc())
    ))


async def run_benchmarks_async(db: Session, model_ids: list[str], settings: Settings) -> list[ModelBenchmark]:
    async def one(model_id: str):
        try:
            provider, adapter = _provider_call(db, model_id, settings)
            return provider, await adapter.benchmark_async(model_id)
        except Exception:
            return "unknown", ProviderResult(status="failed", streaming_supported=False, streaming_status="FAIL", error_message=SAFE_PROVIDER_ERROR)

    clean_ids = [item.strip() for item in model_ids if item.strip()]
    run_id = str(uuid.uuid4())
    started = time.perf_counter()
    completed = await asyncio.gather(*(one(model_id) for model_id in clean_ids))
    rows = [
        ModelBenchmark(
            run_id=run_id,
            provider=provider,
            model_id=model_id,
            **_benchmark_fields(result),
        )
        for model_id, (provider, result) in zip(clean_ids, completed)
    ]
    db.add_all(rows)
    # Auto-stop: if a Tencent Cloud (or other quota-based) model returns a
    # quota_exhausted signal, exclude it immediately so no further paid
    # requests are made. The free quota has been used up for this cycle.
    for model_id, (_, result) in zip(clean_ids, completed):
        if result.error_message == "quota_exhausted":
            row = db.scalar(select(ModelRegistry).where(ModelRegistry.model_id == model_id))
            if row and row.catalog_status != "excluded":
                row.catalog_status = "excluded"
                row.excluded_reason = "免费额度已用尽，等待下月重置后重新同步"
                row.is_free = False
                row.updated_at = datetime.now(timezone.utc)
    duration = time.perf_counter() - started
    success_count = sum(row.status == "success" for row in rows)
    db.add(BenchmarkRun(run_id=run_id, total_models=len(rows), success_count=success_count, duration=duration))
    db.add(AuditLog(
        action="运行性能测试",
        detail=f"{len(rows)} 个模型 · 成功 {success_count}/{len(rows)} · 耗时 {duration:.1f}s",
    ))
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows
