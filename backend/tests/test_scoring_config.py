from app.config_loader import get_scoring_profile, load_scoring_config
from app.scoring.calculator import calculate_score


def test_all_profiles_have_normalized_weights():
    config = load_scoring_config()
    assert set(config["profiles"]) == {"default", "coding", "agent", "chat"}
    for profile in config["profiles"].values():
        assert abs(sum(profile["weights"].values()) - 1.0) < 0.001
        assert abs(sum(profile["operational_weights"].values()) - 1.0) < 0.001
        if profile["capability_weights"]:
            assert abs(sum(profile["capability_weights"].values()) - 1.0) < 0.001


def test_profile_selection_and_config_driven_calculation():
    name, profile = get_scoring_profile("coding")
    assert name == "coding"
    assert profile["weights"] == {"operational": 0.45, "capability": 0.55}
    assert profile["capability_weights"]["coding"] == 0.6
    operational_metrics = {"availability": 100, "speed": 80, "latency": 60, "context": 50}
    assert calculate_score(operational_metrics, profile["operational_weights"]) == 74.29
