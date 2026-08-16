from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
