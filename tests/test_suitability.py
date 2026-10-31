"""Curated recipe suitability: filters, scoring formula, fallbacks, graph and API."""
import httpx
import pytest
from fastapi.testclient import TestClient

from api.index import app
from core import auth
from engine import catalog_db
from engine.curated_data import RECIPES
from engine.data import load_ingredients
from engine.suitability import (DEFAULT_SETTINGS, CuratedRecipe, Edge, RecipeLine, SuitabilityEngine, SuitabilityError,
                                bundled_recipes, cooccurrence_edges, family, validate_settings)
from test_auth import SECRET, URL, hs_token

CATALOG = load_ingredients()
BY_NAME = {i.name: i for i in CATALOG}


@pytest.fixture(scope="module")
def engine():
    recipes = bundled_recipes()
    return SuitabilityEngine(CATALOG, recipes, cooccurrence_edges(recipes, BY_NAME))


def tiny_engine(settings=None, edges=None):
    recipe = CuratedRecipe("test-karahi", "Test Karahi", "Main Course", "Pakistani", 40, 2,
                           {"sweet": 1, "salty": 6, "sour": 4, "spicy": 8}, "",
                           (RecipeLine("Chicken Thigh", 500, "500 g"), RecipeLine("Tomato", 200, "2"),
                            RecipeLine("Ginger", 10, "1 tbsp"), RecipeLine("Salt", 5, "1 tsp"), RecipeLine("Red Chilli Powder", 3, "1 tsp")),
                           ("Cook.", "Serve."))
    edges = edges if edges is not None else {frozenset(("Chicken Thigh", "Tomato")): Edge(.8, "co-occurrence", "test"),
                                             frozenset(("Chicken Thigh", "Ginger")): Edge(.6, "co-occurrence", "test"),
                                             frozenset(("Tomato", "Ginger")): Edge(.7, "co-occurrence", "test")}
    return SuitabilityEngine(CATALOG, [recipe], edges, settings)


def test_dataset_is_consistent():
    slugs = [r[0] for r in RECIPES]
    assert len(RECIPES) >= 30 and len(slugs) == len(set(slugs))
    for slug, name, *_, lines, steps in RECIPES:
        assert all(n in BY_NAME for n, _, _ in lines), slug
        assert len({n for n, _, _ in lines}) == len(lines), f"{slug} repeats an ingredient"
        assert len(steps) >= 3 and all(g > 0 for _, g, _ in lines)


def test_example_chicken_tomato_spicy_ranks_karahi_first(engine):
    result = engine.recommend(["Chicken Breast", "Tomato"], tastes={"spicy": "high"})
    top = result["recipes"][0]
    assert top["slug"] == "chicken-karahi"
    assert {s["name"] for s in result["suggestions"]} >= {"Onion", "Garlic", "Ginger"}
    assert top["missing"] and "Chicken Leg Piece" in top["used"]
    assert any("Spicy" in line for line in top["explanation"])


def test_formula_matches_documented_weights():
    result = tiny_engine().recommend(["Chicken Breast", "Tomato"], tastes={"spicy": "high"}, max_minutes=45)["recipes"][0]
    coverage = 2 / 3  # chicken + tomato of the three core items (salt and chilli powder are staples)
    compatibility = (.8 + .6 + .7) / 3  # chicken-tomato, chicken-ginger, tomato-ginger; each family pair once
    expected = .45 * coverage + .30 * compatibility + .20 * 1.0 + .05 * 1.0
    assert result["score"] == pytest.approx(expected, abs=1e-4)
    assert result["match_percent"] == round(expected * 100)
    assert result["missing"] == ["Ginger"] and result["penalty"] == 0


def test_unavailable_components_are_renormalised_not_invented():
    result = tiny_engine().recommend(["Chicken Breast", "Tomato"])["recipes"][0]
    assert result["components"]["taste"] is None and result["components"]["cooking"] is None
    assert set(result["weights_used"]) == {"coverage", "compatibility"}
    assert sum(result["weights_used"].values()) == pytest.approx(1)
    expected = (.45 * (2 / 3) + .30 * .7) / .75
    assert result["score"] == pytest.approx(expected, abs=1e-4)


def test_missing_penalty_only_beyond_tolerance():
    settings = {**DEFAULT_SETTINGS, "missing_tolerance": 0, "missing_penalty": .1}
    result = tiny_engine(settings).recommend(["Chicken Breast", "Tomato"])["recipes"][0]
    assert result["penalty"] == pytest.approx(.1)
    base = (.45 * (2 / 3) + .30 * .7) / .75
    assert result["score"] == pytest.approx(base - .1, abs=1e-4)


def test_score_is_clamped_and_min_score_filters():
    huge = {**DEFAULT_SETTINGS, "missing_tolerance": 0, "missing_penalty": .2, "min_score": 0}
    assert tiny_engine(huge).recommend(["Chicken Breast", "Tomato"])["recipes"][0]["score"] >= 0
    strict = {**DEFAULT_SETTINGS, "min_score": .99}
    assert tiny_engine(strict).recommend(["Chicken Breast", "Tomato"])["recipes"] == []


def test_heuristic_fallback_is_labelled_when_no_edge():
    engine = tiny_engine(edges={})
    weight, evidence = engine.compatibility("Chicken Thigh", "Ginger")
    assert 0 <= weight <= 1 and "heuristic" in evidence


def test_allergy_is_a_hard_filter_even_for_perfect_matches(engine):
    result = engine.recommend(["Potato", "Onion"], allergens=["legumes"])
    assert all("pakora" not in r["slug"] for r in result["recipes"])
    assert result["excluded"]["allergy"] > 0
    with pytest.raises(SuitabilityError, match="conflict"):
        engine.recommend(["Chicken Breast", "Tomato"], allergens=["tomato"])


def test_custom_blocked_words_exclude_recipes(engine):
    result = engine.recommend(["Chicken Breast", "Tomato"], blocked_words=["ginger"])
    assert all("Ginger" not in r["missing"] for r in result["recipes"])
    assert result["recipes"] and all(r["slug"] != "chicken-karahi" for r in result["recipes"])


def test_diet_filters(engine):
    veg = engine.recommend(["Potato", "Onion"], diets=["vegetarian"])
    assert veg["recipes"] and all("vegetarian" in r["diets"] for r in veg["recipes"])
    gf = engine.recommend(["Potato", "Onion"], diets=["gluten_free"])
    assert all(r["slug"] != "aloo-paratha" for r in gf["recipes"])


def test_pantry_counts_as_having(engine):
    without = engine.recommend(["Chicken Breast", "Tomato"])["recipes"]
    with_pantry = engine.recommend(["Chicken Breast", "Tomato"], pantry=["Ginger", "Garlic", "Green Chilli", "Fresh Coriander"])["recipes"]
    karahi = lambda rows: next(r for r in rows if r["slug"] == "chicken-karahi")  # noqa: E731
    assert karahi(with_pantry)["missing"] == [] and karahi(with_pantry)["score"] > karahi(without)["score"]


def test_validation_rules(engine):
    with pytest.raises(SuitabilityError, match="2-20"):
        engine.recommend(["Tomato"])
    with pytest.raises(SuitabilityError, match="distinct"):
        engine.recommend(["Tomato", "tomato"])
    with pytest.raises(SuitabilityError, match="Unknown ingredient"):
        engine.recommend(["Tomato", "Unobtainium"])
    with pytest.raises(SuitabilityError):
        validate_settings({"weights": {"coverage": 2}})
    with pytest.raises(SuitabilityError):
        validate_settings({"weights": {"coverage": 0, "compatibility": 0, "taste": 0, "cooking": 0}})


def test_family_matching():
    assert family(BY_NAME["Chicken Breast"]) == family(BY_NAME["Chicken Leg Piece"]) == "chicken"
    assert family(BY_NAME["Rohu Fish"]) == "fish"
    assert family(BY_NAME["Garlic Paste"]) == "Garlic"


def test_detail_marks_have_and_staples(engine):
    detail = engine.detail("chicken-karahi", selected=["Chicken Breast", "Tomato"])
    rows = {r["name"]: r for r in detail["ingredients"]}
    assert rows["Chicken Leg Piece"]["have"] and rows["Tomato"]["have"] and not rows["Ginger"]["have"]
    assert rows["Salt"]["staple"] and len(detail["steps"]) >= 5
    assert detail["nutrition_per_serving"]["kcal"] > 0
    assert engine.detail("does-not-exist") is None


def test_database_loader_and_fallback(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path + "?" + request.url.query.decode()
        tables = {
            "categories": [{"id": 1, "name": "Vegetables"}, {"id": 2, "name": "Meat"}],
            "ingredients": [{"id": 10, "name": "Tomato", "category_id": 1, "kcal": 18, "protein": 1, "carbs": 4, "fat": 0,
                             "sweet": 3, "salty": 1, "sour": 6, "spicy": 0, "allergens": ["tomato"], "priority": 1},
                            {"id": 11, "name": "Chicken Breast", "category_id": 2, "kcal": 165, "protein": 31, "carbs": 0, "fat": 3.6,
                             "sweet": 0, "salty": 2, "sour": 0, "spicy": 0, "allergens": [], "priority": 2}],
            "curated_recipes": [{"id": 5, "slug": "db-dish", "name": "DB Dish", "description": "", "category": "Main Course",
                                 "cuisine": "Pakistani", "minutes": 20, "servings": 2, "taste": {"spicy": 5}, "image_url": None,
                                 "source": "curated"}],
            "recipe_ingredients": [{"recipe_id": 5, "ingredient_id": 11, "position": 1, "grams": 300, "display": "300 g"},
                                   {"recipe_id": 5, "ingredient_id": 10, "position": 2, "grams": 200, "display": "2"}],
            "recipe_steps": [{"recipe_id": 5, "position": 1, "body": "Cook."}],
            "ingredient_compatibility": [{"ingredient_a": 10, "ingredient_b": 11, "weight": .9, "relation_type": "complementary", "evidence": "admin"}],
            "app_settings": [{"value": {**DEFAULT_SETTINGS, "min_score": .1}}],
        }
        table = request.url.path.rsplit("/", 1)[-1]
        assert request.headers["apikey"] == "anon-key", path
        return httpx.Response(200, json=tables[table])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    data = catalog_db.fetch_database("https://db.example", "anon-key", client)
    assert data.source == "database" and [r.slug for r in data.recipes] == ["db-dish"]
    engine = SuitabilityEngine(data.ingredients, data.recipes, data.edges, data.settings)
    assert engine.compatibility("Tomato", "Chicken Breast") == (.9, "admin")

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    fallback = catalog_db.load_engine_data()
    assert fallback.source == "bundled" and fallback.notes


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    catalog_db.get_engine(force=True)
    return TestClient(app)


def test_recommendations_endpoint_requires_sign_in(client):
    body = {"ingredients": ["Chicken Breast", "Tomato"]}
    assert client.post("/api/recommendations", json=body).status_code == 401
    response = client.post("/api/recommendations", json={**body, "tastes": {"spicy": "high"}},
                           headers={"Authorization": f"Bearer {hs_token()}"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["recipes"][0]["slug"] == "chicken-karahi" and payload["data_source"] == "bundled"


def test_recommendations_endpoint_validates(client):
    headers = {"Authorization": f"Bearer {hs_token()}"}
    assert client.post("/api/recommendations", json={"ingredients": ["Tomato"]}, headers=headers).status_code == 422
    response = client.post("/api/recommendations", json={"ingredients": ["Tomato", "Rocket Fuel"]}, headers=headers)
    assert response.status_code == 422 and "Unknown ingredient" in response.json()["detail"]
    assert client.post("/api/recommendations", json={"ingredients": ["Tomato", "Onion"], "user_id": "x"}, headers=headers).status_code == 422


def test_curated_detail_and_compatibility_endpoints(client):
    detail = client.get("/api/curated/chicken-karahi", params=[("have", "Chicken Breast"), ("have", "Tomato")])
    assert detail.status_code == 200 and detail.json()["name"] == "Chicken Karahi"
    assert client.get("/api/curated/NOT_A_SLUG!").status_code == 422
    assert client.get("/api/curated/missing-dish").status_code == 404
    graph = client.get("/api/compatibility/tomato")
    assert graph.status_code == 200 and graph.json()["ingredient"] == "Tomato" and graph.json()["edges"]
    assert client.get("/api/compatibility/unobtainium").status_code == 404


def test_auth_module_is_unchanged_for_new_routes():
    assert auth.LEEWAY_SECONDS == 30
