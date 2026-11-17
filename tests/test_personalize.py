"""Personalised ranking: learns from a cook's own choices, stays safe, and is controlled by the admin settings."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from engine.catalog_db import bundled_data  # noqa: E402
from engine.personalize import COMPONENTS, learn_weights, personalization_settings, personalize, simulate  # noqa: E402
from engine.suitability import SuitabilityEngine  # noqa: E402


def make_engine():
    data = bundled_data()
    return SuitabilityEngine(data.ingredients, data.recipes, data.edges)


def quick_dish_history(engine, n=6):
    """A cook who keeps choosing the quickest dish that uses their ingredients."""
    history = []
    for recipe in sorted(engine.recipes, key=lambda r: r.minutes)[:n]:
        core = [l.name for l in recipe.lines if engine.catalog[l.name].category not in ("Spices",)][:3]
        history.append({"slug": recipe.slug, "kind": "cooked", "ingredients": core})
    return history


def test_no_history_means_global_weights():
    engine = make_engine()
    info = personalize(engine, [])
    assert info["active"] is False and info["weights"] == info["base_weights"]


def test_learns_from_history_and_weights_stay_valid():
    engine = make_engine()
    info = personalize(engine, quick_dish_history(engine), {"enabled": True, "strength": 1.0})
    assert info["active"] is True and info["events_used"] >= 2
    assert set(info["weights"]) == set(COMPONENTS)
    assert abs(sum(info["weights"].values()) - 1) < 0.01
    assert all(w > 0 for w in info["weights"].values())
    assert 0 < info["confidence"] <= 1


def test_admin_can_switch_it_off():
    engine = make_engine()
    info = personalize(engine, quick_dish_history(engine), {"enabled": False})
    assert info["active"] is False and info["enabled"] is False


def test_settings_reject_bad_values():
    assert personalization_settings({"enabled": "yes", "strength": 7}) == {"enabled": True, "strength": 0.6}
    assert personalization_settings({"enabled": False, "strength": 0.3}) == {"enabled": False, "strength": 0.3}


def test_learning_moves_toward_the_preferred_component():
    base = {k: 0.2 for k in COMPONENTS}
    # chosen recipes win on "cooking" and lose a little on "coverage" (varied, as real differences are)
    pairs = [([-0.05 - 0.01 * (i % 5), 0.01 * (i % 3 - 1), 0.01 * (i % 2), 0.0, 0.4 + 0.05 * (i % 4)], 1.0) for i in range(30)]
    learned = learn_weights(base, pairs)
    assert learned["cooking"] > 0.2 > learned["coverage"]


def test_personal_weights_never_bypass_allergy_filter():
    engine = make_engine()
    info = personalize(engine, quick_dish_history(engine), {"enabled": True, "strength": 1.0})
    result = engine.recommend(["Chicken Breast", "Tomato"], allergens=["milk"], weights_override=info["weights"], limit=40)
    for row in result["recipes"]:
        recipe = next(r for r in engine.recipes if r.slug == row["slug"])
        assert not any("milk" in engine.catalog[l.name].allergens for l in recipe.lines)


def test_simulation_reports_both_scores():
    out = simulate(make_engine(), users=3, history_size=4, test_size=4)
    assert out["test_cases"] > 0 and 0 <= out["hit1_global"] <= 1 and 0 <= out["hit1_personal"] <= 1


def test_recommendations_endpoint_accepts_history(monkeypatch):
    from fastapi.testclient import TestClient
    import api.index as index
    from test_auth import SECRET, URL, hs_token

    data = bundled_data()
    engine = SuitabilityEngine(data.ingredients, data.recipes, data.edges)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setattr(index, "get_engine", lambda: (engine, data))
    client = TestClient(index.app)
    body = {"ingredients": ["Chicken Breast", "Tomato"], "history": quick_dish_history(engine)}
    res = client.post("/api/recommendations", json=body, headers={"Authorization": f"Bearer {hs_token()}"})
    assert res.status_code == 200, res.text
    assert res.json()["personalization"]["active"] is True
    bad = {**body, "history": [{"slug": "x", "kind": "hacked", "ingredients": []}]}
    assert client.post("/api/recommendations", json=bad, headers={"Authorization": f"Bearer {hs_token()}"}).status_code == 422


def test_learning_helps_simulated_cooks():
    """Deterministic simulation: learned personal weights predict the cook's favourite at least as well as global ones."""
    out = simulate(make_engine(), users=6, history_size=10, test_size=8, seed=3)
    assert out["hit1_personal"] >= out["hit1_global"]
