from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


class ScoringConfigError(ValueError):
    pass


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _weight_map(node: Any, label: str) -> dict[str, float]:
    if not isinstance(node, dict) or not isinstance(node.get("weights"), dict):
        raise ScoringConfigError(f"{label}.weights must be a mapping")
    weights: dict[str, float] = {}
    for metric, value in node["weights"].items():
        if isinstance(value, dict):
            value = value.get("weight")
        if not isinstance(value, (int, float)) or value < 0:
            raise ScoringConfigError(f"{label}.{metric} weight must be a non-negative number")
        weights[str(metric)] = float(value)
    total = sum(weights.values())
    if not 0.999 <= total <= 1.001:
        raise ScoringConfigError(f"{label}.weights must sum to 1.0, got {total}")
    return weights


def _flat_weights(node: Any, label: str, allow_empty: bool = False) -> dict[str, float]:
    if node is None and allow_empty:
        return {}
    if not isinstance(node, dict):
        raise ScoringConfigError(f"{label} must be a mapping")
    values = {str(key): float(value) for key, value in node.items()}
    if any(value < 0 for value in values.values()):
        raise ScoringConfigError(f"{label} values must be non-negative")
    total = sum(values.values())
    if values and total <= 0:
        raise ScoringConfigError(f"{label} must contain a positive total")
    # Inner metric/capability weights are treated as relative weights and
    # normalized, while the profile-level operational/capability split is
    # required to sum to exactly 1.0.
    return {key: value / total for key, value in values.items()} if values else values


def _profile(node: Any, label: str) -> dict[str, Any]:
    if not isinstance(node, dict):
        raise ScoringConfigError(f"{label} must be a mapping")
    raw_weights = node.get("weights") or {}
    # Legacy profiles used metric weights directly. Keep them readable while
    # normalizing them into the new operational/capability structure.
    if "operational" not in raw_weights and "capability" not in raw_weights:
        operational = _weight_map(node, label)
        return {"weights": {"operational": 1.0, "capability": 0.0}, "operational_weights": operational, "capability_weights": {}}
    weights = _flat_weights(raw_weights, f"{label}.weights")
    if set(weights) != {"operational", "capability"}:
        raise ScoringConfigError(f"{label}.weights must contain operational and capability")
    operational = _flat_weights(node.get("operational_weights"), f"{label}.operational_weights")
    capability = _flat_weights(node.get("capability_weights"), f"{label}.capability_weights", allow_empty=True)
    return {"weights": weights, "operational_weights": operational, "capability_weights": capability}


def load_scoring_config(path: str | Path | None = None) -> dict[str, Any]:
    config_path = Path(path) if path else _project_root() / "config" / "scoring.yaml"
    try:
        payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ScoringConfigError(f"Scoring config not found: {config_path}") from exc
    except yaml.YAMLError as exc:
        raise ScoringConfigError(f"Invalid scoring YAML: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("version") != "v1":
        raise ScoringConfigError("scoring.yaml must define version: v1")
    default_profile = _profile(payload.get("default"), "default")
    raw_profiles = payload.get("profiles") or {}
    if not isinstance(raw_profiles, dict):
        raise ScoringConfigError("profiles must be a mapping")
    profiles = {"default": default_profile}
    for name, node in raw_profiles.items():
        profiles[str(name)] = _profile(node, f"profiles.{name}")
    return {"version": payload["version"], "profiles": profiles}


@lru_cache(maxsize=1)
def get_scoring_config() -> dict[str, Any]:
    return load_scoring_config()


def get_profile(profile: str | None = None) -> tuple[str, dict[str, float]]:
    """Backward-compatible flat metric view of a profile."""
    config = get_scoring_config()
    requested = profile or "default"
    if requested not in config["profiles"]:
        raise ScoringConfigError(f"Unknown scoring profile: {requested}")
    selected = config["profiles"][requested]
    return requested, {**selected["operational_weights"], **selected["capability_weights"]}


def get_scoring_profile(profile: str | None = None) -> tuple[str, dict[str, Any]]:
    config = get_scoring_config()
    requested = profile or "default"
    if requested not in config["profiles"]:
        raise ScoringConfigError(f"Unknown scoring profile: {requested}")
    return requested, config["profiles"][requested]
