from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.registry import ModelRegistry, is_explicitly_free_model_id, parse_siliconflow_free_models, sync_models


def test_only_explicit_openrouter_free_labels_are_allowed():
    assert is_explicitly_free_model_id("openai/gpt-oss-20b:free")
    assert is_explicitly_free_model_id("openrouter/free")
    assert not is_explicitly_free_model_id("google/lyria-3-pro-preview")
    assert not is_explicitly_free_model_id("vendor/free")


def test_sync_does_not_infer_free_from_zero_pricing():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        result = sync_models(
            session,
            [
                {"id": "safe/model:free", "name": "Safe", "pricing": {"prompt": 0, "completion": 0}},
                {"id": "unsafe/model", "name": "Unsafe", "pricing": {"prompt": 0, "completion": 0}},
                {"id": "openrouter/free", "name": "Free Router", "pricing": {"prompt": 0, "completion": 0}},
            ]
        )
        assert {row.model_id for row in result.rows} == {"safe/model:free", "openrouter/free"}
        assert session.scalar(select(ModelRegistry).where(ModelRegistry.model_id == "unsafe/model")) is None


def test_siliconflow_requires_explicit_allowlist_and_uses_namespace():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        result = sync_models(
            session,
            [
                {"id": "Qwen/Qwen2.5-7B-Instruct", "name": "Qwen"},
                {"id": "deepseek-ai/DeepSeek-V3", "name": "DeepSeek"},
            ],
            provider="siliconflow",
            siliconflow_free_models=parse_siliconflow_free_models("Qwen/Qwen2.5-7B-Instruct"),
        )
        assert [row.model_id for row in result.rows] == ["siliconflow::Qwen/Qwen2.5-7B-Instruct"]
        row = session.scalar(select(ModelRegistry).where(ModelRegistry.provider == "siliconflow"))
        assert row is not None and row.is_free is True and row.catalog_status == "active"
        assert session.scalar(select(ModelRegistry).where(ModelRegistry.model_id == "deepseek-ai/DeepSeek-V3")) is None


def test_siliconflow_empty_allowlist_is_safe_by_default():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        result = sync_models(
            session,
            [{"id": "Qwen/Qwen2.5-7B-Instruct", "name": "Qwen"}],
            provider="siliconflow",
            siliconflow_free_models=set(),
        )
        assert result.rows == []


def test_siliconflow_zero_pricing_models_are_free_without_whitelist():
    """SiliconFlow models with explicit $0 input and output are free even
    without being listed in the operator whitelist."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        result = sync_models(
            session,
            [
                {"id": "Qwen/Qwen2.5-7B-Instruct", "name": "Qwen", "pricing": {"prompt": 0, "completion": 0}},
                {"id": "deepseek-ai/DeepSeek-V3", "name": "DeepSeek", "pricing": {"prompt": 2.0, "completion": 8.0}},
                {"id": "google/gemma-2-9b", "name": "Gemma", "pricing": {"input": 0, "output": 0}},
            ],
            provider="siliconflow",
            siliconflow_free_models=set(),
        )
        ids = {row.model_id: row for row in result.rows}
        assert "siliconflow::Qwen/Qwen2.5-7B-Instruct" in ids
        assert "siliconflow::google/gemma-2-9b" in ids
        assert ids["siliconflow::Qwen/Qwen2.5-7B-Instruct"].is_free is True
        assert ids["siliconflow::google/gemma-2-9b"].is_free is True
        # Non-free model should not appear
        assert "siliconflow::deepseek-ai/DeepSeek-V3" not in ids


def test_siliconflow_missing_pricing_without_whitelist_is_rejected():
    """SiliconFlow models with no pricing info and not in whitelist are rejected."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        result = sync_models(
            session,
            [{"id": "Qwen/Qwen2.5-7B-Instruct", "name": "Qwen"}],
            provider="siliconflow",
            siliconflow_free_models=set(),
        )
        assert result.rows == []


def test_siliconflow_whitelist_takes_priority_over_pricing():
    """A whitelist entry should admit a model even if pricing is non-zero."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        result = sync_models(
            session,
            [{"id": "special/model", "name": "Special", "pricing": {"prompt": 1.0, "completion": 2.0}}],
            provider="siliconflow",
            siliconflow_free_models=parse_siliconflow_free_models("special/model"),
        )
        assert len(result.rows) == 1
        assert result.rows[0].is_free is True
