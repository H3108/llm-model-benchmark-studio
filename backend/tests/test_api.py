import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.registry import ModelRegistry
from app.schemas import ScoreResult


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_health():
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "/api/benchmark/run", {"models": ["openai/gpt-oss-20b:free"]}),
        ("post", "/api/capabilities/benchmark", {"models": ["openai/gpt-oss-20b:free"], "tasks": ["coding_basic_v1"]}),
        ("get", "/api/models/sync", None),
    ],
)
def test_protected_endpoints_require_admin_token(monkeypatch, method, path, body):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json() == {"error": "unauthorized", "message": "Administrative authorization required"}


def test_protected_endpoint_returns_cors_header_on_auth_error(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["openai/gpt-oss-20b:free"]},
            headers={"Origin": "http://127.0.0.1:5173"},
        )
    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_protected_endpoints_reject_invalid_admin_token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["openai/gpt-oss-20b:free"]},
            headers={"X-Admin-Token": "wrong-token"},
        )
    assert response.status_code == 403
    assert response.json() == {"error": "forbidden", "message": "Administrative token is invalid"}


def test_protected_endpoint_is_available_with_admin_token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["openai/gpt-oss-20b:free"]},
            headers={"X-Admin-Token": "test-admin-token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body[0]["status"] in {"success", "failed"}
        if body[0]["status"] == "failed":
            # 中文错误说明（限流或其它失败），不泄露敏感信息。
            assert body[0]["error_message"]
            assert "test-admin-token" not in body[0]["error_message"]
        assert "test-admin-token" not in response.text


@pytest.mark.parametrize("path", ["/health", "/api/models", "/api/leaderboard"])
def test_public_read_endpoints_do_not_require_admin_token(monkeypatch, path):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.get(path)
    assert response.status_code == 200


def test_protected_endpoint_is_unavailable_when_admin_token_is_not_configured(monkeypatch):
    # Override the repository-local .env value so this test is independent of
    # the developer's local configuration.
    monkeypatch.setenv("ADMIN_TOKEN", "")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["openai/gpt-oss-20b:free"]},
        )
    assert response.status_code == 503
    assert "ADMIN_TOKEN" not in response.text


def test_provider_error_does_not_expose_configuration(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    monkeypatch.setenv("OPENROUTER_API_KEY", "super-secret-api-key")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["openai/gpt-oss-20b:free"]},
            headers={"X-Admin-Token": "test-admin-token"},
        )
    assert response.status_code == 200
    assert "super-secret-api-key" not in response.text
    assert "OPENROUTER_API_KEY" not in response.text


def test_free_leaderboard_is_filtered_by_registry(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    session.add_all(
        [
            ModelRegistry(
                provider="openrouter",
                model_id="free/model:free",
                model_name="Free Model",
                is_free=True,
                catalog_status="active",
            ),
            ModelRegistry(
                provider="openrouter",
                model_id="paid/model",
                model_name="Paid Model",
                is_free=False,
                catalog_status="active",
            ),
            ModelRegistry(
                provider="openrouter",
                model_id="unknown/model",
                model_name="Unknown Model",
                is_free=None,
                catalog_status="active",
            ),
        ]
    )
    session.commit()

    rankings = [
        ScoreResult(
            model_id="paid/model",
            provider="openrouter",
            availability_score=100,
            speed_score=100,
            latency_score=100,
            context_score=100,
            overall_score=99,
            tests=1,
            success_rate=1,
        ),
        ScoreResult(
            model_id="free/model:free",
            provider="openrouter",
            availability_score=90,
            speed_score=90,
            latency_score=90,
            context_score=90,
            overall_score=90,
            tests=1,
            success_rate=1,
        ),
        ScoreResult(
            model_id="unknown/model",
            provider="openrouter",
            availability_score=80,
            speed_score=80,
            latency_score=80,
            context_score=80,
            overall_score=80,
            tests=1,
            success_rate=1,
        ),
        ScoreResult(
            model_id="historical/orphan",
            provider="openrouter",
            availability_score=70,
            speed_score=70,
            latency_score=70,
            context_score=70,
            overall_score=70,
            tests=1,
            success_rate=1,
        ),
    ]

    def override_get_db():
        yield session

    monkeypatch.setattr("app.main.score_results", lambda db, profile: rankings)
    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            response = client.get("/api/leaderboard?free=true")
            assert response.status_code == 200
            body = response.json()
            assert [row["model_id"] for row in body["rankings"]] == ["free/model:free"]
            assert body["highest_score_model"]["model_id"] == "free/model:free"
            assert body["fastest_model"]["model_id"] == "free/model:free"
            assert body["most_stable_model"]["model_id"] == "free/model:free"
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        engine.dispose()


def test_leaderboard_defaults_to_all_models(monkeypatch):
    monkeypatch.setattr(
        "app.main.score_results",
        lambda db, profile: [
            ScoreResult(
                model_id="paid/model",
                provider="openrouter",
                availability_score=100,
                speed_score=100,
                latency_score=100,
                context_score=100,
                overall_score=99,
                tests=1,
                success_rate=1,
            )
        ],
    )
    with TestClient(app) as client:
        response = client.get("/api/leaderboard?free=false")
    assert response.status_code == 200
    assert [row["model_id"] for row in response.json()["rankings"]] == ["paid/model"]


def test_models_endpoint_exposes_free_models_only(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.get("/api/models")
    assert response.status_code == 200
    assert response.json()
    assert all(model["is_free"] is True for model in response.json())


def test_benchmark_rejects_paid_or_unknown_models_before_provider_request(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["anthropic/claude-3-opus"]},
            headers={"X-Admin-Token": "test-admin-token"},
        )
    assert response.status_code == 400
    assert response.json()["detail"] == "仅允许测试明确免费的模型，请先同步免费模型列表"


def test_benchmark_rejects_zero_priced_model_without_explicit_free_label(monkeypatch):
    """Zero pricing alone must never authorize an OpenRouter benchmark."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin-token")
    with TestClient(app) as client:
        response = client.post(
            "/api/benchmark/run",
            json={"models": ["google/lyria-3-pro-preview"]},
            headers={"X-Admin-Token": "test-admin-token"},
        )
    assert response.status_code == 400
    assert response.json()["detail"] == "仅允许测试明确免费的模型，请先同步免费模型列表"
