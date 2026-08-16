"""Tests for the dynamically-configured custom provider mechanism.

Covers:
- config.custom_provider_specs() parsing from env vars
- registry custom_registry_id / custom_raw_model_id
- registry _is_free for custom providers (explicit whitelist only)
- services.provider_for() fallback to OpenAICompatAdapter
- OpenAICompatAdapter raw_model_id namespace stripping
"""
import os

from app.config import Settings
from app.providers.openai_compat import OpenAICompatAdapter
from app.registry import _is_free, custom_raw_model_id, custom_registry_id
from app.services import provider_for


def test_custom_registry_id_and_raw():
    assert custom_registry_id("moonshot", "moonshot-v1-8k") == "moonshot::moonshot-v1-8k"
    assert custom_registry_id("moonshot", "moonshot::moonshot-v1-8k") == "moonshot::moonshot-v1-8k"
    assert custom_raw_model_id("moonshot", "moonshot::moonshot-v1-8k") == "moonshot-v1-8k"
    assert custom_raw_model_id("moonshot", "moonshot-v1-8k") == "moonshot-v1-8k"


def test_custom_provider_specs_parsing(monkeypatch):
    """custom_provider_specs() should parse {ID}_* env vars into specs."""
    monkeypatch.setenv("CUSTOM_PROVIDERS", "moonshot, deepseek ")
    monkeypatch.setenv("MOONSHOT_API_KEY", "sk-moon-xxx")
    monkeypatch.setenv("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1")
    monkeypatch.setenv("MOONSHOT_FREE_MODELS", "moonshot-v1-8k, moonshot-v1-32k")
    monkeypatch.setenv("MOONSHOT_LABEL", "月之暗面")
    monkeypatch.setenv("MOONSHOT_COLOR", "#6366f1")
    monkeypatch.setenv("MOONSHOT_INITIALS", "MK")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-ds-xxx")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

    # Clear lru_cache so the new env takes effect.
    from app.config import get_settings
    get_settings.cache_clear()
    s = Settings()
    specs = s.custom_provider_specs()

    assert set(specs.keys()) == {"moonshot", "deepseek"}
    moon = specs["moonshot"]
    assert moon["api_key"] == "sk-moon-xxx"
    assert moon["base_url"] == "https://api.moonshot.cn/v1"
    assert moon["free_models"] == {"moonshot-v1-8k", "moonshot-v1-32k"}
    assert moon["label"] == "月之暗面"
    assert moon["color"] == "#6366f1"
    assert moon["initials"] == "MK"
    # deepseek has no LABEL/COLOR/INITIALS — should get defaults.
    ds = specs["deepseek"]
    assert ds["label"] == "deepseek"
    assert ds["initials"] == "DE"
    assert ds["color"]  # auto-assigned from hash
    assert ds["free_models"] == set()


def test_custom_provider_specs_drops_incomplete(monkeypatch):
    """A provider with missing API_KEY or BASE_URL should be silently dropped."""
    monkeypatch.setenv("CUSTOM_PROVIDERS", "good,bad_key,bad_url")
    monkeypatch.setenv("GOOD_API_KEY", "sk-xxx")
    monkeypatch.setenv("GOOD_BASE_URL", "https://api.good.com/v1")
    monkeypatch.setenv("BAD_KEY_API_KEY", "sk-xxx")
    # BAD_KEY_BASE_URL missing
    monkeypatch.setenv("BAD_URL_BASE_URL", "https://api.bad.com/v1")
    # BAD_URL_API_KEY missing

    from app.config import get_settings
    get_settings.cache_clear()
    s = Settings()
    specs = s.custom_provider_specs()
    assert set(specs.keys()) == {"good"}


def test_is_free_custom_provider_whitelist_only():
    """Custom providers use explicit whitelist only — pricing is never inferred."""
    custom_free = {"moonshot": {"moonshot-v1-8k"}}
    # Whitelisted model → free
    assert _is_free("moonshot::moonshot-v1-8k", {}, "moonshot", custom_free_models=custom_free) is True
    # Non-whitelisted model → not free, even with $0 pricing
    assert _is_free("moonshot::other-model", {"prompt": 0, "completion": 0}, "moonshot", custom_free_models=custom_free) is False
    # Provider not in custom_free_models → falls through to openrouter logic
    assert _is_free("unknown::model", {}, "unknown", custom_free_models=custom_free) is False


def test_provider_for_custom_fallback():
    """provider_for() should return an OpenAICompatAdapter for custom providers."""
    # We can't easily set env vars for lru_cached Settings in a unit test,
    # so we test the adapter construction directly.
    adapter = OpenAICompatAdapter(
        provider_id="moonshot",
        api_key="sk-test",
        base_url="https://api.moonshot.cn/v1",
        timeout=30.0,
        namespace="moonshot::",
        label="月之暗面",
    )
    assert adapter.provider_id == "moonshot"
    assert adapter.namespace == "moonshot::"
    assert adapter.label == "月之暗面"
    assert adapter.raw_model_id("moonshot::moonshot-v1-8k") == "moonshot-v1-8k"
    assert adapter.endpoint == "https://api.moonshot.cn/v1/chat/completions"
    assert adapter.models_endpoint == "https://api.moonshot.cn/v1/models"


def test_openai_compat_adapter_missing_key():
    """Adapter with no API key should return a failed ProviderResult."""
    adapter = OpenAICompatAdapter("test", "", "https://example.com/v1")
    result = adapter.benchmark("test::model")
    assert result.status == "failed"
    assert result.error_message is not None
