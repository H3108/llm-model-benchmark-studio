from typing import Any


def calculate_score(metrics: dict[str, float], weights: dict[str, float]) -> float:
    return round(sum(metrics.get(metric, 0.0) * weight for metric, weight in weights.items()), 2)
