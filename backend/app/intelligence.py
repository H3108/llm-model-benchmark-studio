from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .capabilities.registry import CapabilityBenchmark
from .models import ModelBenchmark
from .score import score_results


@dataclass
class CapabilityRanking:
    model_id: str
    capability: str
    score: float
    tests: int
    successful_tests: int


def intelligence_for_model(db: Session, model_id: str, profile: str = "default"):
    score = next((item for item in score_results(db, profile) if item.model_id == model_id), None)
    benchmark_rows = list(db.scalars(select(ModelBenchmark).where(ModelBenchmark.model_id == model_id)))
    capability_rows = list(db.scalars(select(CapabilityBenchmark).where(CapabilityBenchmark.model_id == model_id)))
    if score is None and not benchmark_rows and not capability_rows:
        return None
    successful = [row for row in benchmark_rows if row.status == "success"]
    scored = [row for row in capability_rows if row.status == "success" and row.score is not None]
    capability_tests = defaultdict(list)
    for row in scored:
        capability_tests[row.capability].append(float(row.score))
    breakdown = {name: round(sum(values) / len(values), 2) for name, values in capability_tests.items()}
    statistics = {
        "benchmark_count": len(benchmark_rows),
        "successful_benchmark_count": len(successful),
        "success_rate": round(len(successful) / len(benchmark_rows), 4) if benchmark_rows else 0.0,
        "avg_first_token_ms": _avg(row.first_token_ms for row in successful),
        "avg_latency_ms": _avg(row.latency_ms for row in successful),
        "avg_tokens_per_second": _avg(row.tokens_per_second for row in successful),
        "capability_benchmark_count": len(scored),
        "capability_scored_count": len(scored),
    }
    return {"score": score, "capabilities": breakdown, "statistics": statistics}


def capability_leaderboard(db: Session, capability: str) -> list[CapabilityRanking]:
    rows = list(db.scalars(select(CapabilityBenchmark).where(CapabilityBenchmark.capability == capability, CapabilityBenchmark.status == "success", CapabilityBenchmark.score.is_not(None))))
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        grouped[row.model_id].append(float(row.score))
    rankings = [CapabilityRanking(model_id=model_id, capability=capability, score=round(sum(values) / len(values), 2), tests=len(values), successful_tests=len(values)) for model_id, values in grouped.items()]
    return sorted(rankings, key=lambda item: item.score, reverse=True)


def _avg(values) -> float | None:
    clean = [float(value) for value in values if value is not None]
    return round(sum(clean) / len(clean), 2) if clean else None
