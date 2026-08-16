from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.capabilities.registry import CapabilityBenchmark
from app.db import Base
from app.intelligence import capability_leaderboard, intelligence_for_model


def test_capability_leaderboard_aggregates_successful_scores():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        CapabilityBenchmark(model_id="model-a", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="success", score=80),
        CapabilityBenchmark(model_id="model-a", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="success", score=100),
        CapabilityBenchmark(model_id="model-b", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="success", score=90),
        CapabilityBenchmark(model_id="model-c", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="failed", score=100),
    ])
    session.commit()
    rows = capability_leaderboard(session, "coding")
    assert [(row.model_id, row.score) for row in rows] == [("model-a", 90.0), ("model-b", 90.0)]


def test_intelligence_for_model_ignores_failed_capability_attempts():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        CapabilityBenchmark(model_id="model-a", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="success", score=100),
        CapabilityBenchmark(model_id="model-a", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="failed", score=0.0),
    ])
    session.commit()
    result = intelligence_for_model(session, "model-a")
    assert result["capabilities"] == {"coding": 100.0}
    assert result["statistics"]["capability_benchmark_count"] == 1
    assert result["statistics"]["capability_scored_count"] == 1
