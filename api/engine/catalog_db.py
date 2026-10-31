"""Load the live catalog (ingredients, curated recipes, compatibility edges, settings) from Supabase.

Reads only public rows through PostgREST with the anon key, so the API needs no service key and
row-level security still decides what is visible. Results are cached for CACHE_SECONDS, so admin
edits reach recommendations within that time. If Supabase is not configured, unreachable, or has
no published recipes yet, the bundled data (the same data seed.sql loads) is used and the
response says so.
"""
import os
import threading
import time

import httpx

from .data import Ingredient, load_ingredients
from .suitability import CuratedRecipe, Edge, EngineData, RecipeLine, SuitabilityEngine, bundled_recipes, cooccurrence_edges

CACHE_SECONDS = 60
_lock = threading.Lock()
_cache: dict = {"at": 0.0, "engine": None, "data": None}


def _configured() -> tuple[str, str] | None:
    url, key = os.getenv("SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not key or "YOUR_" in url.upper() or "YOUR_" in key.upper():
        return None
    return url, key


def bundled_data(note: str | None = None) -> EngineData:
    ingredients = load_ingredients()
    recipes = bundled_recipes()
    catalog = {i.name: i for i in ingredients}
    return EngineData(ingredients, recipes, cooccurrence_edges(recipes, catalog), None, "bundled", [note] if note else [])


def fetch_database(url: str, key: str, client: httpx.Client | None = None) -> EngineData:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    own = client is None
    client = client or httpx.Client(timeout=8)
    try:
        def get(path: str) -> list[dict]:
            response = client.get(f"{url}/rest/v1/{path}", headers=headers)
            response.raise_for_status()
            return response.json()

        categories = {c["id"]: c["name"] for c in get("categories?select=id,name")}
        rows = get("ingredients?select=id,name,category_id,kcal,protein,carbs,fat,sweet,salty,sour,spicy,allergens,priority")
        recipes = get("curated_recipes?select=id,slug,name,description,category,cuisine,minutes,servings,taste,image_url,source&status=eq.published")
        lines = get("recipe_ingredients?select=recipe_id,ingredient_id,position,grams,display")
        steps = get("recipe_steps?select=recipe_id,position,body")
        edges = get("ingredient_compatibility?select=ingredient_a,ingredient_b,weight,relation_type,evidence")
        settings = get("app_settings?select=value&key=eq.recommendation")
    finally:
        if own:
            client.close()

    names = {r["id"]: r["name"] for r in rows}
    ingredients = tuple(Ingredient(
        name=r["name"], category=categories.get(r["category_id"], "Other"), kcal=float(r["kcal"]), protein=float(r["protein"]),
        carbs=float(r["carbs"]), fat=float(r["fat"]), sweet=r["sweet"], salty=r["salty"], sour=r["sour"], spicy=r["spicy"],
        allergens=tuple(r["allergens"] or ()), priority=r["priority"]) for r in rows)
    by_recipe: dict[int, list] = {}
    for line in sorted(lines, key=lambda l: l["position"]):
        if line["ingredient_id"] in names:
            by_recipe.setdefault(line["recipe_id"], []).append(
                RecipeLine(names[line["ingredient_id"]], float(line["grams"]), line["display"] or f"{line['grams']} g"))
    steps_by: dict[int, list] = {}
    for step in sorted(steps, key=lambda s: s["position"]):
        steps_by.setdefault(step["recipe_id"], []).append(step["body"])
    curated = tuple(
        CuratedRecipe(r["slug"], r["name"], r["category"], r["cuisine"], r["minutes"], r["servings"],
                      {t: float((r["taste"] or {}).get(t, 0)) for t in ("sweet", "salty", "sour", "spicy")},
                      r["description"], tuple(by_recipe.get(r["id"], ())), tuple(steps_by.get(r["id"], ())),
                      r.get("image_url"), r.get("source") or "curated")
        for r in recipes if by_recipe.get(r["id"]))
    graph = {frozenset((names[e["ingredient_a"]], names[e["ingredient_b"]])):
             Edge(float(e["weight"]), e["relation_type"], e["evidence"] or e["relation_type"])
             for e in edges if e["ingredient_a"] in names and e["ingredient_b"] in names}
    return EngineData(ingredients, curated, graph, settings[0]["value"] if settings else None, "database")


def load_engine_data() -> EngineData:
    config = _configured()
    if config is None:
        return bundled_data("Supabase is not configured for the API; using the bundled catalog.")
    try:
        data = fetch_database(*config)
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        return bundled_data(f"Could not read the catalog from Supabase ({type(exc).__name__}); using the bundled catalog.")
    if not data.ingredients or not data.recipes:
        return bundled_data("Supabase has no published curated recipes yet (run supabase/seed/recipes.sql); using the bundled catalog.")
    return data


def get_engine(force: bool = False) -> tuple[SuitabilityEngine, EngineData]:
    with _lock:
        if force or _cache["engine"] is None or time.monotonic() - _cache["at"] > CACHE_SECONDS:
            data = load_engine_data()
            try:
                engine = SuitabilityEngine(data.ingredients, data.recipes, data.edges, data.settings)
            except ValueError as exc:  # Bad stored settings or a recipe naming a removed ingredient.
                fallback = bundled_data(f"Stored catalog is inconsistent ({exc}); using the bundled catalog.")
                data, engine = fallback, SuitabilityEngine(fallback.ingredients, fallback.recipes, fallback.edges)
            _cache.update(at=time.monotonic(), engine=engine, data=data)
        return _cache["engine"], _cache["data"]
