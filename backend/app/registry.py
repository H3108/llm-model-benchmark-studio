from dataclasses import dataclass
from datetime import datetime, timezone
import uuid

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .providers.google import google_is_chat_model


FREE_MODEL_SUFFIX = ":free"
OPENROUTER_FREE_MODEL_ID = "openrouter/free"
SILICONFLOW_MODEL_PREFIX = "siliconflow::"
FREE_CATALOG_REASON = "仅保留经过明确确认的免费模型"


def is_explicitly_free_model_id(model_id: str | None) -> bool:
    """Return whether OpenRouter explicitly labels the route as free.

    Pricing metadata is deliberately *not* used as an allow signal. A zero
    price can be missing, stale, promotional, or provider-dependent; only
    OpenRouter's ``:free`` suffix (or its dedicated ``openrouter/free`` route)
    is safe enough to run automatically.
    """
    normalized = (model_id or "").strip()
    return normalized == OPENROUTER_FREE_MODEL_ID or normalized.endswith(FREE_MODEL_SUFFIX)


def explicit_free_model_filter():
    """SQLAlchemy filter for rows admitted to the explicit free catalog.

    OpenRouter rows are admitted by the ``:free``/``openrouter/free`` rule;
    SiliconFlow rows are admitted by the explicit operator allowlist. Both
    paths persist the final decision in ``is_free`` so downstream queries do
    not need to guess a Provider from a model ID.
    """
    return ModelRegistry.is_free.is_(True)


def siliconflow_registry_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized if normalized.startswith(SILICONFLOW_MODEL_PREFIX) else f"{SILICONFLOW_MODEL_PREFIX}{normalized}"


def siliconflow_raw_model_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized[len(SILICONFLOW_MODEL_PREFIX):] if normalized.startswith(SILICONFLOW_MODEL_PREFIX) else normalized


def parse_siliconflow_free_models(value: str | None) -> set[str]:
    """Parse the operator-confirmed SiliconFlow $0 model allowlist.
    Commas and newlines are accepted; empty value yields an empty set."""
    return {
        item.strip() for item in (value or "").replace("\n", ",").split(",") if item.strip()
    }

def parse_opencode_free_models(value: str | None) -> set[str]:
    """Parse the operator-confirmed OpenCode $0 model allowlist.
    Commas and newlines are accepted; empty value yields an empty set."""
    return {
        item.strip() for item in (value or "").replace("\n", ",").split(",") if item.strip()
    }


def parse_nvidia_free_models(value: str | None) -> set[str]:
    """Parse the operator-confirmed NVIDIA free-quota model allowlist.

    NVIDIA's "free" is credit-based (per-account allowance), not price-based,
    and the catalogue carries no authoritative free flag. Free status must be
    operator-confirmed by listing model IDs here; an empty value yields an
    empty set (nothing admitted). Chat-compatibility is still enforced as an
    additional AND constraint in ``_is_free``.
    """
    return {
        item.strip() for item in (value or "").replace("\n", ",").split(",") if item.strip()
    }


def parse_google_free_models(value: str | None) -> set[str]:
    """Parse the operator-confirmed Google Gemini free-tier model allowlist.

    Although Gemini advertises a free tier, which models actually run without
    charge depends on the account's tier, so free status must be
    operator-confirmed by listing model IDs here. An empty value yields an
    empty set (nothing admitted). Chat-compatibility is still enforced as an
    additional AND constraint in ``_is_free``.
    """
    return {
        item.strip() for item in (value or "").replace("\n", ",").split(",") if item.strip()
    }


TENCENTCLOUD_MODEL_PREFIX = "tencentcloud::"


def tencentcloud_registry_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized if normalized.startswith(TENCENTCLOUD_MODEL_PREFIX) else f"{TENCENTCLOUD_MODEL_PREFIX}{normalized}"


def tencentcloud_raw_model_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized[len(TENCENTCLOUD_MODEL_PREFIX):] if normalized.startswith(TENCENTCLOUD_MODEL_PREFIX) else normalized


def parse_tencentcloud_free_models(value: str | None) -> set[str]:
    """Parse the operator-confirmed Tencent Cloud free-quota model allowlist.

    Tencent Cloud's "free" is quota-based (monthly token allowance), not
    price-based, so we cannot auto-detect it from pricing metadata. The
    operator confirms which models have free quota via this config value.
    Commas and newlines are accepted; empty value yields an empty set.
    """
    return {
        item.strip() for item in (value or "").replace("\n", ",").split(",") if item.strip()
    }


# ── Custom (dynamic) provider helpers ──────────────────────────────────────
# These support the OpenAI-compatible custom-provider mechanism driven by
# CUSTOM_PROVIDERS in backend/.env. Registry IDs use "{provider}::" namespace.

def custom_registry_id(provider: str, raw_id: str) -> str:
    """Prefix a raw model ID with the provider namespace."""
    prefix = f"{provider}::"
    normalized = (raw_id or "").strip()
    return normalized if normalized.startswith(prefix) else f"{prefix}{normalized}"


def custom_raw_model_id(provider: str, model_id: str) -> str:
    """Strip the provider namespace prefix."""
    prefix = f"{provider}::"
    normalized = (model_id or "").strip()
    return normalized[len(prefix):] if normalized.startswith(prefix) else normalized


class ModelRegistry(Base):
    __tablename__ = "model_registry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(50), index=True)
    model_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    context_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pricing_input: Mapped[float | None] = mapped_column(Float, nullable=True)
    pricing_output: Mapped[float | None] = mapped_column(Float, nullable=True)
    capabilities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    family: Mapped[str | None] = mapped_column(String(120), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_free: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    catalog_status: Mapped[str | None] = mapped_column(String(20), nullable=True, default="unknown")
    access_status: Mapped[str | None] = mapped_column(String(20), nullable=True, default="unknown")
    model_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True, default="openrouter")
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_access_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_override: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    excluded_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ModelSyncRun(Base):
    __tablename__ = "model_sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sync_run_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(50), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    received_count: Mapped[int] = mapped_column(Integer, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    inactive_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)


@dataclass
class ModelSyncResult:
    rows: list[ModelRegistry]
    received_count: int
    inserted_count: int
    updated_count: int
    inactive_count: int


def _number(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _source_datetime(item: dict, fallback: datetime) -> datetime:
    value = item.get("updated") or item.get("created")
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return fallback


def _is_zero_priced(pricing: dict) -> bool:
    """Return True when pricing explicitly shows $0 for both input and output.

    Only an explicit zero — not a missing or None value — counts. This is safe
    for providers like SiliconFlow whose pricing metadata is authoritative,
    unlike OpenRouter where zero-valued metadata can be stale or promotional.
    """
    if not pricing:
        return False
    input_val = _number(pricing.get("prompt") if "prompt" in pricing else pricing.get("input"))
    output_val = _number(pricing.get("completion") if "completion" in pricing else pricing.get("output"))
    if input_val is None or output_val is None:
        return False
    return input_val == 0 and output_val == 0


def _is_free(model_id: str, pricing: dict, provider: str = "openrouter", siliconflow_free_models: set[str] | None = None, opencode_free_models: set[str] | None = None, tencentcloud_free_models: set[str] | None = None, nvidia_free_models: set[str] | None = None, google_free_models: set[str] | None = None, custom_free_models: dict[str, set[str]] | None = None) -> bool:
    # OpenRouter: never infer free from pricing. Only the explicit :free
    # suffix or the openrouter/free route is safe (metadata can be stale).
    # SiliconFlow/OpenCode: check the operator whitelist first, then fall
    # back to authoritative $0 pricing from their model catalogue API.
    if provider == "siliconflow":
        if siliconflow_raw_model_id(model_id) in (siliconflow_free_models or set()):
            return True
        return _is_zero_priced(pricing)
    if provider == "opencode":
        raw = model_id.replace("opencode::", "") if model_id.startswith("opencode::") else model_id
        if raw in (opencode_free_models or set()):
            return True
        if _is_zero_priced(pricing):
            return True
        # Zen's /v1/models endpoint does not return pricing; free models use
        # the "-free" suffix convention (e.g. deepseek-v4-flash-free).
        return raw.endswith("-free")
    if provider == "tencentcloud":
        # Tencent Cloud's "free" is quota-based (monthly token allowance),
        # not price-based. Only the operator-confirmed allowlist counts.
        # Pricing metadata is intentionally NOT used because the models are
        # priced — they just have a free quota that resets monthly.
        return tencentcloud_raw_model_id(model_id) in (tencentcloud_free_models or set())
    if provider == "nvidia":
        # Pure explicit allowlist. FREE is never inferred from the key/ID or a
        # namespace; the operator lists catalog IDs that have been verified to
        # run free on this account's credit tier (see .env NVIDIA_FREE_MODELS).
        # An empty allowlist admits nothing.
        return nvidia_raw_model_id(model_id) in (nvidia_free_models or set())
    if provider == "google":
        # Same explicit-allowlist policy as NVIDIA: what actually runs free on
        # the free tier depends on account tier, so the operator lists IDs.
        return google_raw_model_id(model_id) in (google_free_models or set())
    # Custom (dynamic) OpenAI-compatible providers: explicit whitelist only.
    # Free status is never inferred from pricing — safe by default, matching
    # the nvidia/google policy. An empty whitelist admits nothing.
    if custom_free_models and provider in custom_free_models:
        return custom_raw_model_id(provider, model_id) in custom_free_models[provider]
    return is_explicitly_free_model_id(model_id)


def free_model_ids(db: Session) -> set[str]:
    """Return the allowlisted model IDs that are explicitly free.

    Unknown pricing is intentionally excluded. A model must be positively
    identified as free before it can appear in the catalog or be benchmarked.
    """
    return set(db.scalars(select(ModelRegistry.model_id).where(ModelRegistry.is_free.is_(True), ModelRegistry.catalog_status != "excluded")))


def _family(model_id: str) -> str | None:
    value = siliconflow_raw_model_id(model_id).split("/", 1)[-1]
    return value.split(":", 1)[0].split("-", 1)[0] or None


def upsert_models(db: Session, models: list[dict]) -> list[ModelRegistry]:
    return sync_models(db, models).rows


def sync_models(
    db: Session,
    models: list[dict],
    provider: str = "openrouter",
    synced_at: datetime | None = None,
    siliconflow_free_models: set[str] | None = None,
    opencode_free_models: set[str] | None = None,
    tencentcloud_free_models: set[str] | None = None,
    nvidia_free_models: set[str] | None = None,
    google_free_models: set[str] | None = None,
    custom_free_models: dict[str, set[str]] | None = None,
) -> ModelSyncResult:
    sync_time = synced_at or datetime.now(timezone.utc)
    rows: list[ModelRegistry] = []
    # Never put paid or unknown-price models into the active catalog. The
    # benchmark endpoints use the same allowlist, so this is also a second
    # safety boundary against accidental paid requests.
    free_items: list[tuple[dict, str]] = []
    for item in models:
        raw_id = (item.get("id") or "").strip()
        if not raw_id:
            continue
        if provider == "siliconflow":
            model_id = siliconflow_registry_id(raw_id)
        elif provider == "opencode":
            model_id = opencode_registry_id(raw_id)
        elif provider == "tencentcloud":
            model_id = tencentcloud_registry_id(raw_id)
        elif provider == "nvidia":
           model_id = nvidia_registry_id(raw_id)
        elif provider == "google":
            model_id = google_registry_id(raw_id)
            if not google_is_chat_model(model_id):
                continue
        elif custom_free_models and provider in custom_free_models:
            model_id = custom_registry_id(provider, raw_id)
        else:
            model_id = raw_id
        if _is_free(model_id, item.get("pricing") or {}, provider, siliconflow_free_models, opencode_free_models, tencentcloud_free_models, nvidia_free_models, google_free_models, custom_free_models):
            free_items.append((item, model_id))
    received_ids: set[str] = {model_id for _, model_id in free_items}
    inserted_count = 0
    updated_count = 0
    for item, model_id in free_items:
        row = db.scalar(select(ModelRegistry).where(ModelRegistry.model_id == model_id))
        pricing = item.get("pricing") or {}
        values = {
            "provider": provider,
            "model_name": item.get("name"),
            "context_length": item.get("context_length"),
            "pricing_input": _number(pricing.get("prompt")),
            "pricing_output": _number(pricing.get("completion")),
            "capabilities": item.get("architecture") or {},
            "is_free": _is_free(model_id, pricing, provider, siliconflow_free_models, opencode_free_models, tencentcloud_free_models, nvidia_free_models, google_free_models, custom_free_models),
            "source": provider,
            "source_updated_at": _source_datetime(item, sync_time),
            "raw_metadata": item,
        }
        if row is None:
            row = ModelRegistry(model_id=model_id, catalog_status="active", access_status="unknown", family=_family(model_id), **values)
            db.add(row)
            inserted_count += 1
        else:
            for key, value in values.items():
                setattr(row, key, value)
            if row.catalog_status != "excluded":
                row.catalog_status = "active"
            row.updated_at = datetime.now(timezone.utc)
            updated_count += 1
        rows.append(row)

    inactive_count = 0
    existing_rows = list(db.scalars(select(ModelRegistry).where(ModelRegistry.provider == provider)))
    for row in existing_rows:
        if row.model_id not in received_ids and row.catalog_status not in {"inactive", "excluded"}:
            row.catalog_status = "excluded"
            row.excluded_reason = FREE_CATALOG_REASON
            row.updated_at = sync_time
            inactive_count += 1

    db.commit()
    for row in rows:
        db.refresh(row)
    return ModelSyncResult(rows, len(models), inserted_count, updated_count, inactive_count)
OPENCODE_MODEL_PREFIX = "opencode::"

def opencode_registry_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized if normalized.startswith(OPENCODE_MODEL_PREFIX) else f"{OPENCODE_MODEL_PREFIX}{normalized}"


NVIDIA_MODEL_PREFIX = "nvidia::"


def nvidia_registry_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized if normalized.startswith(NVIDIA_MODEL_PREFIX) else f"{NVIDIA_MODEL_PREFIX}{normalized}"


def nvidia_raw_model_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized[len(NVIDIA_MODEL_PREFIX):] if normalized.startswith(NVIDIA_MODEL_PREFIX) else normalized


GOOGLE_MODEL_PREFIX = "google::"


def google_registry_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized if normalized.startswith(GOOGLE_MODEL_PREFIX) else f"{GOOGLE_MODEL_PREFIX}{normalized}"


def google_raw_model_id(model_id: str) -> str:
    normalized = (model_id or "").strip()
    return normalized[len(GOOGLE_MODEL_PREFIX):] if normalized.startswith(GOOGLE_MODEL_PREFIX) else normalized
