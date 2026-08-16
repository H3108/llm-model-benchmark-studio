from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hmac
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .config_loader import ScoringConfigError, get_scoring_config, get_scoring_profile
from .capabilities.registry import CapabilityBenchmark, list_tasks
from .capabilities.runner import run_capability_benchmarks
from .db import get_db, init_db
from .registry import ModelRegistry, ModelSyncRun, explicit_free_model_filter, free_model_ids, parse_siliconflow_free_models, parse_opencode_free_models, parse_tencentcloud_free_models, parse_nvidia_free_models, parse_google_free_models, sync_models as sync_registry_models
from .models import AuditLog, BenchmarkRun
from .schemas import AuditLogCreate, AuditLogEntry, BenchmarkResult, BenchmarkRunRequest, BenchmarkRunResult, CapabilityBenchmarkRequest, CapabilityBenchmarkResponse, CapabilityLeaderboardResponse, CapabilityTaskResult, CapabilityTaskResultDefinition, IntelligenceResponse, LeaderboardResponse, ModelRegistryResult, ModelSyncRunResult, RecommendationResponse
from .score import score_results
from .security import admin_auth_response, sanitize_provider_error
from .services import list_results, provider_for, run_benchmarks_async
from .intelligence import capability_leaderboard, intelligence_for_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="LLM Model Benchmark Studio API", version="0.2.0", lifespan=lifespan)


def write_audit_log(db: Session, action: str, detail: str | None = None) -> AuditLog:
    """Persist a single audit-log entry."""
    entry = AuditLog(action=action, detail=detail)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_audit_log(db: Session, limit: int = 50) -> list[AuditLog]:
    """Return the most recent audit-log entries."""
    return list(db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)))


@app.middleware("http")
async def admin_api_middleware(request: Request, call_next):
    auth_response = admin_auth_response(request)
    if auth_response is not None:
        return auth_response
    return await call_next(request)


# Keep CORS as the outermost application middleware so that browser clients
# can read authentication errors returned by the admin middleware. Without
# this ordering, a 401/403 response is surfaced as a misleading "Failed to
# fetch" error because it has no Access-Control-Allow-Origin header.
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/providers")
def providers() -> list[dict]:
    """Return display metadata for all providers (built-in + custom).

    No admin auth required — this endpoint exposes only display metadata
    (label/color/initials), never API keys. The frontend fetches this on
    startup to render provider pickers, filters, and avatars without
    hard-coding provider IDs.
    """
    built_in = [
        {"id": "openrouter", "label": "OpenRouter", "color": "#f97316", "initials": "OR", "syncable": True},
        {"id": "siliconflow", "label": "SiliconFlow", "color": "#0d9488", "initials": "SF", "syncable": True},
        {"id": "opencode", "label": "OpenCode", "color": "#8b5cf6", "initials": "OC", "syncable": True},
        {"id": "tencentcloud", "label": "腾讯云混元", "color": "#2563eb", "initials": "TC", "syncable": True},
        {"id": "nvidia", "label": "NVIDIA NIM", "color": "#84cc16", "initials": "NV", "syncable": True},
        {"id": "google", "label": "Google Gemini", "color": "#ea4335", "initials": "GG", "syncable": True},
    ]
    custom = [
        {"id": pid, "label": spec["label"], "color": spec["color"], "initials": spec["initials"], "syncable": True}
        for pid, spec in get_settings().custom_provider_specs().items()
    ]
    return built_in + custom


@app.get("/api/audit/log", response_model=list[AuditLogEntry])
def audit_log(request: Request, limit: int = 50, db: Session = Depends(get_db)):
    """Return recent administrative audit-log entries (admin only)."""
    configured = get_settings().admin_token
    supplied = request.headers.get("X-Admin-Token", "").strip()
    if not configured or not supplied or not hmac.compare_digest(supplied, configured):
        raise HTTPException(status_code=403, detail="Administrative authorization required")
    return get_audit_log(db, limit=max(1, min(limit, 200)))


@app.post("/api/audit/log", response_model=AuditLogEntry)
def audit_log_create(request: Request, payload: AuditLogCreate, db: Session = Depends(get_db)):
    """Allow an authenticated admin client to report a client-side audit event.

    Only a small allowlist of actions is accepted to prevent spam/abuse.
    """
    configured = get_settings().admin_token
    supplied = request.headers.get("X-Admin-Token", "").strip()
    if not configured or not supplied or not hmac.compare_digest(supplied, configured):
        raise HTTPException(status_code=403, detail="Administrative authorization required")
    ALLOWED_ACTIONS = {
        "更新 Admin Token",
        "清除 Admin Token",
        "配置提供方白名单",
        "更新模型白名单",
    }
    if payload.action not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail="Action not allowed")
    return write_audit_log(db, payload.action, payload.detail)


@app.get("/api/admin/verify")
def verify_admin(request: Request):
    """Check whether the supplied X-Admin-Token matches the server config.

    Returns valid=true only when an ADMIN_TOKEN is configured server-side and
    the supplied token matches it exactly. Used by the client to validate a
    token before persisting it as the admin credential.
    """
    configured = get_settings().admin_token
    supplied = request.headers.get("X-Admin-Token", "").strip()
    if not configured:
        return {"valid": False, "configured": False}
    valid = bool(supplied) and hmac.compare_digest(supplied, configured)
    return {"valid": valid, "configured": True}


@app.post("/api/benchmark/run", response_model=list[BenchmarkResult])
async def run(request: BenchmarkRunRequest, db: Session = Depends(get_db)):
    models = [model.strip() for model in request.models if model.strip()]
    if not models:
        raise HTTPException(status_code=400, detail="models must contain at least one non-empty model ID")
    blocked = validate_free_models(models, db)
    if blocked:
        raise HTTPException(status_code=400, detail="仅允许测试明确免费的模型，请先同步免费模型列表")
    return await run_benchmarks_async(db, models, get_settings())


@app.get("/api/benchmark/results", response_model=list[BenchmarkResult])
def results(db: Session = Depends(get_db)):
    return list_results(db)


@app.get("/api/capabilities/results", response_model=list[CapabilityTaskResult])
def capability_results(db: Session = Depends(get_db)):
    """Return all individual capability benchmark results, newest first."""
    return list(db.scalars(select(CapabilityBenchmark).order_by(CapabilityBenchmark.tested_at.desc())).all())


@app.get("/api/benchmark/runs", response_model=list[BenchmarkRunResult])
def benchmark_runs(db: Session = Depends(get_db)):
    return list(db.scalars(select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc())))


@app.get("/api/models/sync", response_model=list[ModelRegistryResult])
async def sync_models(provider: str = "openrouter", db: Session = Depends(get_db)):
    provider = provider.strip().lower()
    settings = get_settings()
    custom_specs = settings.custom_provider_specs()
    built_in = {"openrouter", "siliconflow", "opencode", "tencentcloud", "nvidia", "google"}
    if provider not in built_in and provider not in custom_specs:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    started_at = datetime.now(timezone.utc)
    sync_run = ModelSyncRun(sync_run_id=str(uuid.uuid4()), provider=provider, started_at=started_at, status="running")
    db.add(sync_run)
    db.commit()
    # Build the namespace seed for provider_for(). Custom providers use the
    # same "{provider}::" convention as siliconflow/tencentcloud.
    if provider == "siliconflow":
        seed = "siliconflow::sync"
    elif provider == "opencode":
        seed = "opencode::sync"
    elif provider == "tencentcloud":
        seed = "tencentcloud::sync"
    elif provider == "nvidia":
        seed = "nvidia::sync"
    elif provider == "google":
        seed = "google::sync"
    elif provider in custom_specs:
        seed = f"{provider}::sync"
    else:
        seed = "openrouter/free"
    _, adapter = provider_for(seed, settings, provider)
    # Parse custom provider free-model whitelists into a {provider: set} map.
    custom_free_models: dict[str, set[str]] = {
        pid: spec["free_models"] for pid, spec in custom_specs.items()
    }
    try:
        result = sync_registry_models(
            db,
            await adapter.list_models(),
            provider=provider,
            synced_at=started_at,
            siliconflow_free_models=parse_siliconflow_free_models(settings.siliconflow_free_models),
            opencode_free_models=parse_opencode_free_models(settings.opencode_free_models),
            tencentcloud_free_models=parse_tencentcloud_free_models(settings.tencentcloud_free_models),
            nvidia_free_models=parse_nvidia_free_models(settings.nvidia_free_models),
            google_free_models=parse_google_free_models(settings.google_free_models),
            custom_free_models=custom_free_models,
        )
        sync_run.received_count = result.received_count
        sync_run.inserted_count = result.inserted_count
        sync_run.updated_count = result.updated_count
        sync_run.inactive_count = result.inactive_count
        sync_run.status = "success"
        sync_run.completed_at = datetime.now(timezone.utc)
        db.commit()
        write_audit_log(
            db,
            f"同步 {provider.capitalize()} 模型目录",
            f"接收 {result.received_count} · 新增 {result.inserted_count} / 更新 {result.updated_count}",
        )
        return result.rows
    except Exception as exc:
        db.rollback()
        sync_run = db.get(ModelSyncRun, sync_run.id)
        if sync_run:
            sync_run.status = "failed"
            sync_run.completed_at = datetime.now(timezone.utc)
            sync_run.error_message = sanitize_provider_error(exc)
            db.commit()
        write_audit_log(db, f"同步 {provider.capitalize()} 模型目录失败", sanitize_provider_error(exc))
        raise HTTPException(status_code=502, detail=sanitize_provider_error(exc)) from exc


@app.get("/api/models/sync/runs", response_model=list[ModelSyncRunResult])
def sync_runs(db: Session = Depends(get_db)):
    return list(db.scalars(select(ModelSyncRun).order_by(ModelSyncRun.started_at.desc())))


@app.get("/api/models", response_model=list[ModelRegistryResult])
def models(db: Session = Depends(get_db)):
    # The catalog is intentionally free-only. Paid and unknown-price models
    # must not be selectable from any frontend workflow.
    return list(db.scalars(
        select(ModelRegistry)
        .where(
            ModelRegistry.catalog_status != "excluded",
            explicit_free_model_filter(),
        )
        .order_by(ModelRegistry.model_name, ModelRegistry.model_id)
    ))


def validate_free_models(model_ids: list[str], db: Session) -> list[str]:
    allowed = free_model_ids(db)
    return sorted({model_id for model_id in model_ids if model_id not in allowed})


@app.get("/api/models/{model_id:path}/intelligence", response_model=IntelligenceResponse)
def model_intelligence(model_id: str, profile: str = "default", db: Session = Depends(get_db)):
    try:
        get_scoring_profile(profile)
        result = intelligence_for_model(db, model_id, profile)
    except ScoringConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result is None or result["score"] is None:
        raise HTTPException(status_code=404, detail=f"No intelligence data found for model: {model_id}")
    score = result["score"]
    return IntelligenceResponse(model_id=model_id, profile=profile, operational_score=score.operational_score, capability_score=score.capability_score, overall_score=score.overall_score, capabilities=result["capabilities"], benchmark_statistics=result["statistics"])


@app.get("/api/capabilities/tasks", response_model=list[CapabilityTaskResultDefinition])
def capability_tasks(db: Session = Depends(get_db)):
    return list_tasks(db, enabled_only=True)


@app.post("/api/capabilities/benchmark", response_model=CapabilityBenchmarkResponse)
async def capability_benchmark(request: CapabilityBenchmarkRequest, db: Session = Depends(get_db)):
    models = [model.strip() for model in request.models if model.strip()]
    if not models:
        raise HTTPException(status_code=400, detail="models must contain at least one non-empty model ID")
    blocked = validate_free_models(models, db)
    if blocked:
        raise HTTPException(status_code=400, detail="仅允许评测明确免费的模型，请先同步免费模型列表")
    requested = set(request.tasks)
    available = {task.task_key: task for task in list_tasks(db, enabled_only=True)}
    missing = sorted(requested - available.keys())
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown or disabled capability tasks: {', '.join(missing)}")
    selected_tasks = [available[key] for key in request.tasks]
    run_id, results = await run_capability_benchmarks(db, models, selected_tasks, get_settings())
    success_count = sum(row.status == "success" for row in results)
    task_names = ", ".join(task.capability for task in selected_tasks[:3])
    if len(selected_tasks) > 3:
        task_names += f" 等 {len(selected_tasks)} 项"
    write_audit_log(
        db,
        "运行能力测试",
        f"{len(models)} 个模型 · {len(selected_tasks)} 项任务 · 成功 {success_count}/{len(results)} · {task_names}",
    )
    return CapabilityBenchmarkResponse(run_id=run_id, results=results)


@app.get("/api/leaderboard/capability", response_model=CapabilityLeaderboardResponse)
def capability_leaderboard_api(capability: str, db: Session = Depends(get_db)):
    if not capability.strip():
        raise HTTPException(status_code=400, detail="capability must not be empty")
    allowed = free_model_ids(db)
    rows = [row for row in capability_leaderboard(db, capability.strip()) if row.model_id in allowed]
    from .schemas import CapabilityLeaderboardEntry
    return CapabilityLeaderboardResponse(capability=capability.strip(), rankings=[CapabilityLeaderboardEntry(rank=index, model_id=row.model_id, capability=row.capability, score=row.score, tests=row.tests, successful_tests=row.successful_tests) for index, row in enumerate(rows, start=1)])


@app.get("/api/scoring/profiles")
def scoring_profiles():
    """Return the full scoring-profile configuration (weights breakdown) for every profile."""
    config = get_scoring_config()
    return {
        "version": config.get("version"),
        "profiles": {
            name: {
                "weights": data.get("weights", {}),
                "operational_weights": data.get("operational_weights", {}),
                "capability_weights": data.get("capability_weights", {}),
            }
            for name, data in config.get("profiles", {}).items()
        },
    }


@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard(profile: str = "default", free: bool = False, db: Session = Depends(get_db)):
    try:
        selected_profile, profile_config = get_scoring_profile(profile)
        rankings = score_results(db, selected_profile)
        if free:
            free_model_ids = set(
                db.scalars(
                    select(ModelRegistry.model_id).where(
                        ModelRegistry.catalog_status != "excluded",
                        explicit_free_model_filter(),
                     )
                )
            )
            rankings = [ranking for ranking in rankings if ranking.model_id in free_model_ids]
    except ScoringConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return LeaderboardResponse(
        profile=selected_profile,
        weights=profile_config["weights"],
        fastest_model=min(rankings, key=lambda item: item.avg_latency_ms or float("inf"), default=None),
        most_stable_model=max(rankings, key=lambda item: item.availability_score, default=None),
        highest_score_model=rankings[0] if rankings else None,
        rankings=rankings,
    )


@app.get("/api/recommend", response_model=RecommendationResponse)
def recommend(task: str = "coding", db: Session = Depends(get_db)):
    # Preserve the existing endpoint's permissive task parameter. Known task
    # names select profiles; unknown tasks use the default profile.
    selected_profile, profile_config = get_scoring_profile(task if task in get_profile_names() else None)
    rankings = score_results(db, selected_profile)
    model = rankings[0] if rankings else None
    if model is None:
        return RecommendationResponse(task=task, profile=selected_profile, weights=profile_config["weights"], model=None, reason="暂无足够的 Benchmark 数据", recommendation_reason={"score_breakdown": {}, "benchmark_count": 0, "capability_reason": "暂无能力测试数据"})
    reason = f"综合评分 {model.overall_score}，可用性 {model.availability_score}，平均速度 {model.avg_tokens_per_second or 0} tokens/s"
    intelligence = intelligence_for_model(db, model.model_id, selected_profile)
    statistics = intelligence["statistics"] if intelligence else {}
    capabilities = intelligence["capabilities"] if intelligence else {}
    capability_reason = f"能力得分 {model.capability_score}，覆盖 {', '.join(capabilities.keys())}" if capabilities else "暂无能力测试数据，当前使用 Operational Score"
    explanation = {"score_breakdown": {"operational_score": model.operational_score, "capability_score": model.capability_score, "overall_score": model.overall_score}, "benchmark_count": statistics.get("benchmark_count", model.tests), "capability_reason": capability_reason}
    return RecommendationResponse(task=task, profile=selected_profile, weights=profile_config["weights"], model=model, reason=reason, recommendation_reason=explanation)


def get_profile_names() -> set[str]:
    from .config_loader import get_scoring_config

    return set(get_scoring_config()["profiles"])
