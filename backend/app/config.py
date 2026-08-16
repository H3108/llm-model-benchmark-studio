from functools import lru_cache
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict


# Accent palette for auto-assigning colors to custom providers without an
# explicit {ID}_COLOR. Chosen for visual contrast on both dark/light themes.
_DEFAULT_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
    "#14b8a6", "#0ea5e9", "#84cc16", "#eab308",
]


def _hash_color(provider_id: str) -> str:
    """Pick a deterministic accent color from the palette by provider id hash."""
    return _DEFAULT_COLORS[hash(provider_id) % len(_DEFAULT_COLORS)]


class Settings(BaseSettings):
    # Core provider keys and URLs
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api"
    siliconflow_api_key: str = ""
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"
    admin_token: str = ""
    # OpenCode integration
    opencode_api_key: str = ""
    opencode_base_url: str = "https://opencode.ai/zen/v1"
    opencode_free_models: str = ""
    # Tencent Cloud Hunyuan (quota-based free, not price-based)
    tencentcloud_api_key: str = ""
    tencentcloud_base_url: str = "https://api.hunyuan.cloud.tencent.com/v1"
    tencentcloud_free_models: str = ""
    # NVIDIA NIM / build.nvidia.com (quota-based free, 1000 credits per account)
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    # NVIDIA/Google free model listings (comma or newline separated). Free
    # status is operator-confirmed only — an empty value admits no models —
    # because neither catalogue carries an authoritative free flag and what
    # runs free depends on the account tier.
    nvidia_free_models: str = ""
    google_free_models: str = ""
    # Google Gemini (free tier, rate-limited; all chat models are free)
    google_api_key: str = ""
    google_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    # Free model listings for siliconflow (comma or newline separated)
    siliconflow_free_models: str = ""
    # Database & request settings
    database_url: str = "sqlite:///./benchmark.db"
    request_timeout_seconds: float = 60.0
    # Max simultaneous upstream LLM requests across all providers. The current
    # dev API key's concurrency limit is 6 (429 past that); leaving zero headroom
    # on the cap caused intermittent 429s when latency jitter or multiple runs
    # overlapped. 3 keeps well under the limit while preserving parallelism.
    max_benchmark_concurrency: int = 3
    # On a plain 429 (transient per-key rate limit, gone once the key/provider
    # changes) retry once after a short pause before recording failure.
    retry_attempts: int = 2
    retry_sleep_seconds: float = 1.0
    # Comma-separated list of origins allowed to make CORS requests. Defaults
    # to the Vite dev server addresses; override with CORS_ORIGINS in .env.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    # Dynamic custom providers (OpenAI-compatible). Comma-separated IDs, e.g.
    # CUSTOM_PROVIDERS=moonshot,deepseek. Each ID drives {ID}_API_KEY,
    # {ID}_BASE_URL, {ID}_FREE_MODELS, {ID}_LABEL, {ID}_COLOR, {ID}_INITIALS.
    # See backend/app/providers/openai_compat.py for the adapter contract.
    custom_providers: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def custom_provider_specs(self) -> dict[str, dict[str, Any]]:
        """Parse CUSTOM_PROVIDERS into per-provider config dicts.

        Returns ``{provider_id: {api_key, base_url, free_models, label, color, initials}}``.
        Providers with a missing API key or base_url are dropped (treated as
        not configured). ``free_models`` is a ``set[str]`` of raw model IDs.

        Reads env vars directly via ``os.environ`` rather than declared fields
        so operators can add arbitrary ``{ID}_*`` keys without touching this
        file. ``pydantic-settings`` with ``extra="ignore"`` would otherwise
        discard them.
        """
        import os

        ids = [pid.strip().lower() for pid in self.custom_providers.split(",") if pid.strip()]
        specs: dict[str, dict[str, Any]] = {}
        for pid in ids:
            prefix = pid.upper() + "_"
            api_key = os.environ.get(f"{prefix}API_KEY", "").strip()
            base_url = os.environ.get(f"{prefix}BASE_URL", "").strip()
            if not api_key or not base_url:
                # Incomplete config — skip silently so partial setups don't crash.
                continue
            free_raw = os.environ.get(f"{prefix}FREE_MODELS", "")
            free_models = {m.strip() for m in free_raw.replace("\n", ",").split(",") if m.strip()}
            label = os.environ.get(f"{prefix}LABEL", "").strip() or pid
            color = os.environ.get(f"{prefix}COLOR", "").strip() or _hash_color(pid)
            initials = os.environ.get(f"{prefix}INITIALS", "").strip() or pid[:2].upper()
            specs[pid] = {
                "api_key": api_key,
                "base_url": base_url,
                "free_models": free_models,
                "label": label,
                "color": color,
                "initials": initials,
            }
        return specs


@lru_cache
def get_settings() -> Settings:
    return Settings()
