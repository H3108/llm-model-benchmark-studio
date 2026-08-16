import asyncio

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import BenchmarkRun, ModelBenchmark
from app.providers.base import ProviderResult
from app.services import run_benchmarks, run_benchmarks_async
from app.config import Settings
import app.services as services


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def settings():
    return Settings(openrouter_api_key="test-key")


@pytest.mark.parametrize(
    ("status", "raw_output"),
    [
        ("success", None),
        ("success", "benchmark output"),
        ("failed", None),
        ("failed", "unexpected provider output"),
    ],
)
def test_async_benchmark_persists_supported_fields_only(
    monkeypatch, db, settings, status, raw_output
):
    class FakeAdapter:
        async def benchmark_async(self, model_id):
            return ProviderResult(
                status=status,
                latency_ms=12.5,
                first_token_ms=4.0,
                tokens_generated=8,
                tokens_per_second=640.0,
                streaming_supported=status == "success",
                streaming_status="PASS" if status == "success" else "FAIL",
                raw_output=raw_output,
                error_message=None if status == "success" else "Provider request failed",
            )

    monkeypatch.setattr(
        services,
        "provider_for",
        lambda model_id, configured_settings: ("openrouter", FakeAdapter()),
    )

    rows = asyncio.run(run_benchmarks_async(db, ["test/model"], settings))

    assert len(rows) == 1
    row = db.scalar(select(ModelBenchmark))
    assert row is not None
    assert row.status == status
    assert row.error_message == (None if status == "success" else "Provider request failed")
    assert row.tokens_generated == 8
    assert not hasattr(row, "raw_output")

    run = db.scalar(select(BenchmarkRun))
    assert run is not None
    assert run.total_models == 1
    assert run.success_count == (1 if status == "success" else 0)


def test_async_benchmark_persists_failure_when_provider_raises(monkeypatch, db, settings):
    class FailingAdapter:
        async def benchmark_async(self, model_id):
            raise RuntimeError("secret provider details")

    monkeypatch.setattr(
        services,
        "provider_for",
        lambda model_id, configured_settings: ("openrouter", FailingAdapter()),
    )

    rows = asyncio.run(run_benchmarks_async(db, ["test/model"], settings))

    assert rows[0].status == "failed"
    assert rows[0].error_message == "请求失败，请稍后重试"
    assert db.scalar(select(ModelBenchmark)).provider == "unknown"


def test_sync_benchmark_uses_same_field_mapping(monkeypatch, db, settings):
    class FakeAdapter:
        def benchmark(self, model_id):
            return ProviderResult(status="success", raw_output="ignored output")

    monkeypatch.setattr(
        services,
        "provider_for",
        lambda model_id, configured_settings: ("openrouter", FakeAdapter()),
    )

    rows = run_benchmarks(db, ["test/model"], settings)

    assert rows[0].status == "success"
    assert not hasattr(rows[0], "raw_output")


def test_provider_for_routes_namespaced_siliconflow_without_openrouter():
    from app.providers.siliconflow import SiliconFlowAdapter

    settings = Settings(openrouter_api_key="openrouter-key", siliconflow_api_key="silicon-key")
    provider, adapter = services.provider_for("siliconflow::Qwen/Qwen2.5-7B-Instruct", settings, "siliconflow")
    assert provider == "siliconflow"
    assert isinstance(adapter, SiliconFlowAdapter)
    assert adapter.raw_model_id("siliconflow::Qwen/Qwen2.5-7B-Instruct") == "Qwen/Qwen2.5-7B-Instruct"
