from fastapi.testclient import TestClient
import pytest

from api.index import app
from engine.data import load_ingredients
from engine.recipes import RecipeError, get_recipe_engine, kind_of, round_grams, short_name
from test_auth import SECRET, URL, hs_token

ENGINE = get_recipe_engine()
CATALOG = {i.name: i for i in load_ingredients()}


def names(recipe):
    return [row["name"] for row in recipe["ingredients"]]


def test_chicken_gets_karahi_salan_and_pulao_with_nutrition():
    out = ENGINE.generate(["Chicken Breast", "Onion"], servings=2)
    titles = [r["title"] for r in out["recipes"]]
    assert titles == ["Chicken Breast Karahi", "Chicken Breast Salan", "Chicken Breast Pulao"]
    for recipe in out["recipes"]:
        assert recipe["ingredients"][0] == {**recipe["ingredients"][0], "name": "Chicken Breast", "role": "main"}
        assert recipe["steps"] and all(s[0].isupper() for s in recipe["steps"])
        total = sum(CATALOG[r["name"]].kcal * r["grams"] / 100 for r in recipe["ingredients"])
        assert recipe["nutrition"]["total"]["kcal"] == pytest.approx(total, abs=0.1)
        assert recipe["nutrition"]["per_serving"]["kcal"] == round(total / 2)


def test_a_chosen_staple_takes_the_staple_role_instead_of_a_duplicate():
    salan = ENGINE.generate(["Chicken Breast", "Onion"])["recipes"][1]
    assert "Spring Onion (Hara Pyaz)" not in names(salan)
    assert next(r for r in salan["ingredients"] if r["name"] == "Onion")["role"] == "yours"


@pytest.mark.parametrize("allergens, words", [(["tomato", "milk"], []), ([], ["garlic", "lemon"]), (["citrus", "legumes"], ["chilli"])])
def test_allergen_shield_removes_staples(allergens, words):
    out = ENGINE.generate(["Mutton", "Potato"], allergens=allergens, blocked_words=words, tastes={"sour": "high", "spicy": "high"})
    for recipe in out["recipes"]:
        for name in names(recipe):
            assert not set(allergens) & set(CATALOG[name].allergens), name
            assert not any(w in name.lower() for w in words), name
    for name in out["suggestions"]:
        assert not set(allergens) & set(CATALOG[name].allergens)


def test_steps_for_removed_staples_are_dropped():
    karahi = ENGINE.generate(["Beef"], blocked_words=["garlic", "ginger"], allergens=["tomato"])["recipes"][0]
    assert not any("aromatic" in s or "garlic" in s.lower() for s in karahi["steps"])
    assert not any(s.startswith("Add tomato") or "{" in s for s in karahi["steps"])
    with_ginger = ENGINE.generate(["Beef"], blocked_words=["garlic"])["recipes"][0]
    assert "Ginger Paste" in names(with_ginger)


def test_blocked_selection_is_refused():
    with pytest.raises(RecipeError, match="allergen shield"):
        ENGINE.generate(["Prawns"], allergens=["shellfish"])
    with pytest.raises(RecipeError, match="allergen shield"):
        ENGINE.generate(["Beef", "Garlic"], blocked_words=["garlic"])


def test_chosen_seasonings_are_used_without_replacing_the_oil():
    karahi = ENGINE.generate(["Mutton", "Tomato Paste", "Desi Ghee", "Cumin (Zeera)"])["recipes"][0]
    roles = {r["name"]: r["role"] for r in karahi["ingredients"]}
    assert roles["Desi Ghee"] == roles["Tomato Paste"] == roles["Cumin (Zeera)"] == "yours"
    assert "Cooking Oil" not in roles  # the chosen ghee is the cooking fat
    assert ENGINE.generate(["Beef", "Tomato Paste"])["recipes"][0]["ingredients"]
    assert "Cooking Oil" in names(ENGINE.generate(["Beef", "Tomato Paste"])["recipes"][0])


def test_pulao_needs_allowed_rice():
    out = ENGINE.generate(["Chicken Breast"], blocked_words=["rice"])
    assert "Chicken Breast Pulao" not in [r["title"] for r in out["recipes"]]


def test_calorie_tier_portions_toward_the_meal_target():
    for tier, daily in (("low", 1200), ("medium", 1500), ("high", 1800)):
        recipe = ENGINE.generate(["Chicken Breast", "Potato"], calorie_tier=tier)["recipes"][0]
        assert recipe["nutrition"]["meal_target_kcal"] == daily // 3
        assert abs(recipe["nutrition"]["per_serving"]["kcal"] - daily / 3) < 0.15 * daily / 3
    assert ENGINE.generate(["Chicken Breast"])["recipes"][0]["nutrition"]["meal_target_kcal"] is None


def test_spice_levels_change_heat():
    low = ENGINE.generate(["Beef"], tastes={"spicy": "low"})["recipes"][0]
    high = ENGINE.generate(["Beef"], tastes={"spicy": "high"})["recipes"][0]
    grams = lambda r, n: next((x["grams"] for x in r["ingredients"] if x["name"] == n), 0)
    assert grams(low, "Green Chilli") == 0 < grams(high, "Green Chilli")
    assert grams(low, "Red Chilli Powder") < grams(high, "Red Chilli Powder")


def test_servings_scale_quantities_and_fingerprint_is_stable():
    two = ENGINE.generate(["Masoor Dal"], servings=2)["recipes"][0]
    four = ENGINE.generate(["Masoor Dal"], servings=4)["recipes"][0]
    assert four["nutrition"]["total"]["kcal"] == pytest.approx(2 * two["nutrition"]["total"]["kcal"], rel=0.1)
    assert two["fingerprint"] == ENGINE.generate(["masoor dal "], servings=2)["recipes"][0]["fingerprint"]
    assert two["fingerprint"] != four["fingerprint"]


@pytest.mark.parametrize("selected, title", [
    (["Eggs"], "Anda Salan"), (["Yogurt (Dahi)", "Cucumber"], "Dahi Raita"), (["Milk", "Basmati Rice"], "Doodh ki Kheer"),
    (["Mango"], "Mango Chaat"), (["Rohu Fish"], "Rohu Fish Salan"), (["Okra (Bhindi)"], "Bhindi Salan"), (["Paneer"], "Paneer Karahi"),
])
def test_styles_fit_the_main_ingredient(selected, title):
    assert ENGINE.generate(selected)["recipes"][0]["title"] == title


@pytest.mark.parametrize("kwargs, message", [
    ({"selected": []}, "1–12"), ({"selected": ["Unobtainium"]}, "Unknown ingredient"),
    ({"selected": ["Salt"]}, "main ingredient"), ({"selected": ["Beef", "beef"]}, "distinct"),
    ({"selected": ["Beef"], "servings": 9}, "Servings"), ({"selected": ["Beef"], "tastes": {"spicy": "extreme"}}, "Taste"),
    ({"selected": ["Beef"], "allergens": ["gold"]}, "allergen tag"), ({"selected": ["Beef"], "calorie_tier": "huge"}, "calorie tier"),
])
def test_invalid_requests(kwargs, message):
    with pytest.raises(RecipeError, match=message):
        ENGINE.generate(kwargs.pop("selected"), **kwargs)


def test_helpers():
    assert short_name("Okra (Bhindi)") == "Bhindi" and short_name("Beef") == "Beef"
    assert [round_grams(g) for g in (0.2, 1.3, 7.4, 23, 152)] == [0.5, 1.5, 7, 25, 150]
    assert kind_of(CATALOG["Prawns"]) == "seafood" and kind_of(CATALOG["Chana Dal"]) == "pulse"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    return TestClient(app)


def test_recipes_endpoint_requires_sign_in(client):
    assert client.post("/api/recipes", json={"ingredients": ["Beef"]}).status_code == 401


def test_recipes_endpoint(client):
    auth = {"Authorization": f"Bearer {hs_token()}"}
    body = {"ingredients": ["Chicken Breast", "Potato"], "tastes": {"spicy": "high", "sweet": None},
            "allergens": ["milk"], "blocked_words": ["garlic"], "calorie_tier": "medium", "servings": 3}
    response = client.post("/api/recipes", json=body, headers=auth)
    assert response.status_code == 200
    data = response.json()
    assert len(data["recipes"]) == 3 and data["recipes"][0]["servings"] == 3
    assert data["recipes"][0]["nutrition"]["meal_target_kcal"] == 500
    bad = client.post("/api/recipes", json={"ingredients": ["Prawns"], "allergens": ["shellfish"]}, headers=auth)
    assert bad.status_code == 422 and "allergen shield" in bad.json()["detail"]
    assert client.post("/api/recipes", json={"ingredients": ["Beef"], "servings": "2"}, headers=auth).status_code == 422


def test_steps_carry_real_quantities_on_first_mention():
    recipe = ENGINE.generate(["Mutton", "Onion"])["recipes"][1]  # salan
    grams = {r["name"]: r["grams"] for r in recipe["ingredients"]}
    text = " ".join(recipe["steps"])
    assert f"{grams['Mutton']:g} g mutton" in text
    assert f"{grams['Cooking Oil']:g} g cooking oil" in text
    assert text.count("g mutton") == 1  # later mentions use the plain name


def test_per_ingredient_breakdown_sums_to_totals():
    recipe = ENGINE.generate(["Chicken Breast", "Potato"], calorie_tier="high")["recipes"][0]
    for key in ("kcal", "protein", "carbs", "fat"):
        assert sum(r[key] for r in recipe["ingredients"]) == pytest.approx(recipe["nutrition"]["total"][key], abs=0.5)
    for row in recipe["ingredients"]:
        assert row["cost_pkr"] == round(row["price_pkr_per_kg"] * row["grams"] / 1000)
    assert recipe["cost"]["total_pkr"] == sum(r["cost_pkr"] for r in recipe["ingredients"])
    assert recipe["cost"]["per_serving_pkr"] == round(recipe["cost"]["total_pkr"] / 2)


def test_taste_profile_follows_spice_level_and_stays_in_range():
    spicy = {lvl: ENGINE.generate(["Beef"], tastes={"spicy": lvl})["recipes"][0]["taste"]["spicy"] for lvl in ("low", "medium", "high")}
    assert spicy["low"] < spicy["medium"] < spicy["high"] <= 10
    kheer = ENGINE.generate(["Milk", "Basmati Rice"])["recipes"][0]["taste"]
    assert kheer["sweet"] > 5 and kheer["spicy"] < 1


def test_match_rate_combines_taste_cosine_and_graph_pairing():
    from engine.recommender import get_recommender
    recipe = ENGINE.generate(["Mutton"], tastes={"spicy": "high"})["recipes"][0]
    graph = get_recommender().graph
    others = [r["name"] for r in recipe["ingredients"] if r["name"] != "Mutton"]
    pairing = sum(graph["Mutton"][n]["weight"] for n in others) / len(others)
    match = recipe["match"]
    assert match["pairing"] == pytest.approx(pairing, abs=1e-3)
    assert 0 < match["taste_similarity"] <= 1
    assert match["percent"] == round(100 * (.5 * match["taste_similarity"] + .5 * match["pairing"]))
    assert ENGINE.generate(["Mutton"])["recipes"][0]["match"]["taste_similarity"] is None


def test_allergen_notice():
    recipe = ENGINE.generate(["Chicken Breast"], allergens=["milk"], blocked_words=["garlic"])["recipes"][1]
    assert recipe["allergens"]["avoided"] == ["milk"] and recipe["allergens"]["blocked_words"] == ["garlic"]
    assert "tomato" in recipe["allergens"]["contains"] and "milk" not in recipe["allergens"]["contains"]
