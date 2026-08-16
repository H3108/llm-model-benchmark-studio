from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.capabilities.registry import CapabilityBenchmark
from app.db import Base
from app.scoring.capability_scores import capability_scores


def test_capability_scores_aggregate_and_normalize_configured_capabilities():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        CapabilityBenchmark(model_id="openai/test", provider="openrouter", task_key="coding_basic_v1", task_version="v1", capability="coding", status="success", score=80),
        CapabilityBenchmark(model_id="openai/test", provider="openrouter", task_key="coding_extra_v1", task_version="v1", capability="coding", status="success", score=100),
        CapabilityBenchmark(model_id="openai/test", provider="openrouter", task_key="structured_output_basic_v1", task_version="v1", capability="structured_output", status="success", score=90),
        CapabilityBenchmark(model_id="openai/test", provider="openrouter", task_key="structured_output_basic_v1", task_version="v1", capability="structured_output", status="failed", score=0.0),
    ])
    session.commit()
    summary = capability_scores(session, "openai/test", {"coding": 0.6, "structured_output": 0.4})
    assert summary.capabilities == {"coding": 90.0, "structured_output": 90.0}
    assert summary.capability_score == 90.0
    assert summary.samples["coding"] == 2
