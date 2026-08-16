from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..capabilities.registry import CapabilityBenchmark


@dataclass
class CapabilityScoreSummary:
    capability_score: float = 0.0
    capabilities: dict[str, float] = field(default_factory=dict)
    samples: dict[str, int] = field(default_factory=dict)


def capability_scores(db: Session, model_id: str, weights: dict[str, float]) -> CapabilityScoreSummary:
    rows = list(db.scalars(select(CapabilityBenchmark).where(CapabilityBenchmark.model_id == model_id)))
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        if row.status == "success" and row.score is not None:
            grouped[row.capability].append(float(row.score))
    capabilities = {name: round(sum(values) / len(values), 2) for name, values in grouped.items() if values}
    samples = {name: len(values) for name, values in grouped.items() if values}
    selected = {name: score for name, score in capabilities.items() if name in weights}
    selected_weights = {name: weights[name] for name in selected}
    total = sum(selected_weights.values())
    overall = sum(selected[name] * selected_weights[name] for name in selected) / total if total else 0.0
    return CapabilityScoreSummary(capability_score=round(overall, 2), capabilities=capabilities, samples=samples)
