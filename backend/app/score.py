from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config_loader import get_scoring_profile
from .models import ModelBenchmark
from .registry import ModelRegistry
from .schemas import ScoreResult
from .scoring.calculator import calculate_score
from .scoring.capability_scores import capability_scores
from .scoring.metrics import normalize_metrics


def score_results(db: Session, profile: str | None = None) -> list[ScoreResult]:
    """Aggregate historical results using the selected configuration profile."""
    _, profile_config = get_scoring_profile(profile)
    registries = {
        row.model_id: row
        for row in db.scalars(
            select(ModelRegistry).where(ModelRegistry.is_free.is_(True), ModelRegistry.catalog_status != "excluded")
        )
    }
    rows = list(
        db.scalars(
            select(ModelBenchmark)
            .where(ModelBenchmark.model_id.in_(registries))
            .order_by(ModelBenchmark.tested_at.desc())
        )
    )
    grouped: dict[str, list[ModelBenchmark]] = defaultdict(list)
    for row in rows:
        grouped[row.model_id].append(row)

    scores = []
    for model_id, tests in grouped.items():
        successful = [row for row in tests if row.status == "success"]
        success_rate = len(successful) / len(tests) if tests else 0
        avg_ttft = _average(row.first_token_ms for row in successful)
        avg_latency = _average(row.latency_ms for row in successful)
        avg_speed = _average(row.tokens_per_second for row in successful)
        streaming_pass_rate = sum(row.streaming_status == "PASS" for row in tests) / len(tests) if tests else 0
        context_length = registries.get(model_id).context_length if registries.get(model_id) else None
        metrics = normalize_metrics(success_rate=success_rate, avg_speed=avg_speed, avg_latency=avg_latency, context_length=context_length, streaming_pass_rate=streaming_pass_rate)
        operational = calculate_score(metrics, profile_config["operational_weights"])
        capability = capability_scores(db, model_id, profile_config["capability_weights"])
        if profile_config["weights"]["capability"] and capability.capabilities:
            overall = operational * profile_config["weights"]["operational"] + capability.capability_score * profile_config["weights"]["capability"]
        else:
            overall = operational
        scores.append(ScoreResult(model_id=model_id, provider=tests[0].provider, availability_score=metrics["availability"], speed_score=metrics["speed"], latency_score=metrics["latency"], context_score=metrics["context"], operational_score=round(operational, 2), capability_score=capability.capability_score, capabilities=capability.capabilities, overall_score=round(overall, 2), tests=len(tests), success_rate=round(success_rate, 4), avg_first_token_ms=avg_ttft, avg_latency_ms=avg_latency, avg_tokens_per_second=avg_speed))
    return sorted(scores, key=lambda item: item.overall_score, reverse=True)


def _average(values) -> float | None:
    clean = [float(value) for value in values if value is not None]
    return round(sum(clean) / len(clean), 2) if clean else None
