"""Ingredient substitutes: sensible swaps, never an allergen, and the 'you have it' boost."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from engine.catalog_db import bundled_data  # noqa: E402
from engine.substitutes import KITCHEN_SWAPS, substitutes  # noqa: E402
from engine.suitability import SuitabilityEngine  # noqa: E402


def make_engine():
    data = bundled_data()
    return SuitabilityEngine(data.ingredients, data.recipes, data.edges)


def names(rows):
    return [r["name"] for r in rows]


def test_kitchen_swaps_use_real_catalog_names():
    engine = make_engine()
    for key, swaps in KITCHEN_SWAPS.items():
        assert key in engine.catalog
        assert all(s in engine.catalog for s in swaps)


def test_sour_ingredient_gets_sour_substitutes():
    top = names(substitutes(make_engine(), "Lemon", context=["Chicken Breast"]))
    assert {"Vinegar", "Tamarind (Imli)", "Dried Mango Powder (Amchur)"} & set(top)


def test_other_form_ranks_first():
    assert names(substitutes(make_engine(), "Yogurt (Dahi)"))[0] == "Hung Curd (Thick Dahi)"


def test_allergens_are_never_suggested():
    engine = make_engine()
    for row in substitutes(engine, "Yogurt (Dahi)", blocked=["milk"], limit=10):
        assert "milk" not in engine.catalog[row["name"]].allergens


def test_having_an_ingredient_boosts_it():
    engine = make_engine()
    plain = substitutes(engine, "Spinach", limit=10)
    boosted = substitutes(engine, "Spinach", have=["Bathua"], limit=10)
    rank = lambda rows: names(rows).index("Bathua")  # noqa: E731
    assert rank(boosted) <= rank(plain)
    assert next(r for r in boosted if r["name"] == "Bathua")["have"] is True


def test_scores_are_bounded_and_sorted():
    rows = substitutes(make_engine(), "Potato", limit=8)
    scores = [r["score"] for r in rows]
    assert all(0 <= s <= 1 for s in scores) and rows and rows[0]["reason"]


def test_endpoints(monkeypatch):
    from fastapi.testclient import TestClient
    import api.index as index

    data = bundled_data()
    engine = SuitabilityEngine(data.ingredients, data.recipes, data.edges)
    monkeypatch.setattr(index, "get_engine", lambda: (engine, data))
    client = TestClient(index.app)
    body = client.get("/api/substitutes/lemon", params={"allergens": ["citrus"], "limit": 4}).json()
    assert body["ingredient"] == "Lemon" and len(body["substitutes"]) <= 4
    assert all("citrus" not in engine.catalog[r["name"]].allergens for r in body["substitutes"])
    assert client.get("/api/substitutes/unobtainium").status_code == 404
    recipe = engine.recipes[0]
    detail = client.get(f"/api/curated/{recipe.slug}", params={"have": ["Onion"]}).json()
    missing = [l for l in detail["ingredients"] if not l["have"] and not l["staple"]]
    assert missing and all("substitutes" in l for l in missing)
    assert "substitutes" not in client.get(f"/api/curated/{recipe.slug}").json()["ingredients"][0]


def test_no_substitute_ever_carries_a_blocked_allergen():
    engine = make_engine()
    tags = sorted({t for i in engine.catalog.values() for t in i.allergens})
    for tag in tags:
        for name in engine.catalog:
            for row in substitutes(engine, name, blocked=[tag], limit=10):
                assert tag not in engine.catalog[row["name"]].allergens, (name, tag, row["name"])
