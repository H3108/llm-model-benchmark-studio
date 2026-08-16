import asyncio
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..providers.openrouter import SAFE_PROVIDER_ERROR
from ..registry import ModelRegistry
from ..services import provider_for
from .evaluator import CapabilityEvaluator
from .registry import CapabilityBenchmark, CapabilityTask


async def run_capability_benchmarks(
    db: Session,
    model_ids: list[str],
    tasks: list[CapabilityTask],
    settings: Settings,
    evaluator: CapabilityEvaluator | None = None,
) -> tuple[str, list[CapabilityBenchmark]]:
    run_id = str(uuid.uuid4())
    evaluator = evaluator or CapabilityEvaluator()

    async def run_one(model_id: str, task: CapabilityTask):
        try:
            registry = db.scalar(select(ModelRegistry).where(ModelRegistry.model_id == model_id))
            provider, adapter = provider_for(model_id, settings, registry.provider if registry else None)
            result = await adapter.stream_async(model_id, task.prompt)
            evaluation = evaluator.evaluate(task, result.raw_output)
            return CapabilityBenchmark(
                run_id=run_id, model_id=model_id, provider=provider, task_key=task.task_key,
                task_version=task.version, capability=task.capability, status=result.status,
                score=evaluation.get("score"), latency_ms=result.latency_ms,
                first_token_ms=result.first_token_ms, tokens_generated=result.tokens_generated,
                tokens_per_second=result.tokens_per_second, raw_output=result.raw_output,
                evaluation_details=evaluation.get("details") or {}, error_message=result.error_message,
            )
        except (httpx.HTTPError, ValueError, KeyError, AttributeError, TypeError):
            return CapabilityBenchmark(
                run_id=run_id, model_id=model_id, provider="unknown", task_key=task.task_key,
                task_version=task.version, capability=task.capability, status="failed",
                score=None, evaluation_details={}, error_message=SAFE_PROVIDER_ERROR,
            )

    pairs = [(model_id.strip(), task) for model_id in model_ids if model_id.strip() for task in tasks]
    rows = list(await asyncio.gather(*(run_one(model_id, task) for model_id, task in pairs)))
    db.add_all(rows)
    # Auto-stop: if a quota-based model returns a quota_exhausted signal, exclude
    # it immediately so no further paid requests are made this cycle.
    exhausted_model_ids = {row.model_id for row in rows if row.error_message == "quota_exhausted"}
    for model_id in exhausted_model_ids:
        row = db.scalar(select(ModelRegistry).where(ModelRegistry.model_id == model_id))
        if row and row.catalog_status != "excluded":
            row.catalog_status = "excluded"
            row.excluded_reason = "免费额度已用尽，等待下月重置后重新同步"
            row.is_free = False
            row.updated_at = datetime.now(timezone.utc)
    db.commit()
    for row in rows:
        db.refresh(row)
    return run_id, rows
