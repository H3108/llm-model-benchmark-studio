from typing import Any


def speed_score(value: float | None) -> float:
    if value is None or value <= 0: return 0.0
    if value >= 50: return 100.0
    if value >= 20: return 80.0
    if value >= 10: return 60.0
    if value >= 5: return 40.0
    return 20.0


def latency_score(value: float | None) -> float:
    if value is None or value <= 0: return 0.0
    if value <= 500: return 100.0
    if value <= 1000: return 85.0
    if value <= 2000: return 65.0
    if value <= 5000: return 40.0
    return 20.0


def context_score(value: int | None) -> float:
    if value is None or value <= 0: return 0.0
    if value >= 128_000: return 100.0
    if value >= 32_000: return 80.0
    if value >= 8_000: return 60.0
    return 30.0


def normalize_metrics(*, success_rate: float, avg_speed: float | None, avg_latency: float | None, context_length: int | None, streaming_pass_rate: float) -> dict[str, float]:
    return {
        "availability": round(success_rate * 100, 2),
        "speed": speed_score(avg_speed),
        "latency": latency_score(avg_latency),
        "context": context_score(context_length),
        "streaming": round(streaming_pass_rate * 100, 2),
    }
