"""Health, public catalog recommendations, and signed-in user routes (Supabase JWT)."""
import os
from typing import Annotated, Literal

import re
import secrets

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

# Vercel loads this file from the api project root; uvicorn uses api.index:app.
from core.env import load_env_file

load_env_file()

from core.auth import current_admin, current_user  # noqa: E402
from core import r2, storage  # noqa: E402
from engine.catalog_db import get_engine  # noqa: E402
from engine.evaluation import evaluate  # noqa: E402
from engine.personalize import personalization_settings, personalize, simulate  # noqa: E402
from engine.substitutes import substitutes  # noqa: E402
from engine.recipes import RecipeError, get_recipe_engine  # noqa: E402
from engine.recommender import get_recommender  # noqa: E402
from engine.suitability import SuitabilityError  # noqa: E402

app = FastAPI(title="DishWish API", version="0.7.0")
origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type", "Authorization"])

Allergen = Literal["milk", "gluten", "eggs", "peanuts", "tree_nuts", "sesame",
                   "fish", "shellfish", "soy", "mustard", "legumes", "tomato",
                   "brinjal", "mango", "citrus", "banana", "strawberry", "coconut", "corn"]
Taste = Literal["sweet", "salty", "sour", "spicy"]
SuitabilityTaste = Literal["sweet", "salty", "sour", "spicy", "savory"]
Level = Literal["low", "medium", "high"]
Score = Annotated[float, Field(ge=0, le=10, allow_inf_nan=False)]


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected_ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=1, max_length=20)
    taste_preferences: dict[Taste, Score] = Field(default_factory=dict)
    excluded_allergens: list[Allergen] = Field(default_factory=list, max_length=19)
    limit: int = Field(default=10, ge=1, le=50, strict=True)


class Recommendation(BaseModel):
    name: str
    category: str
    score: float
    priority: int
    allergens: list[Allergen]
    taste_fit: float
    contributions: dict[str, float]


class RecommendResponse(BaseModel):
    recommendations: list[Recommendation]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "dishwish-api"}


class Me(BaseModel):
    user_id: str
    email: str | None


@app.get("/api/me", response_model=Me)
def me(claims: dict = Depends(current_user)) -> dict:
    return {"user_id": claims["sub"], "email": claims.get("email")}


@app.post("/api/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest) -> dict:
    try:
        rows = get_recommender().recommend(body.selected_ingredients,
            taste_preferences=body.taste_preferences, excluded_allergens=body.excluded_allergens,
            limit=body.limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"recommendations": rows}


class RecipeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=1, max_length=12)
    tastes: dict[Taste, Level | None] = Field(default_factory=dict)
    allergens: list[Allergen] = Field(default_factory=list, max_length=19)
    blocked_words: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(default_factory=list, max_length=20)
    calorie_tier: Literal["low", "medium", "high"] | None = None
    servings: int = Field(default=2, ge=1, le=8, strict=True)
    limit: int = Field(default=3, ge=1, le=5, strict=True)


class RecipeIngredient(BaseModel):
    name: str
    category: str
    grams: float
    role: str
    kcal: float
    protein: float
    carbs: float
    fat: float
    allergens: list[Allergen]
    price_pkr_per_kg: float
    cost_pkr: float


class Macros(BaseModel):
    kcal: float
    protein: float
    carbs: float
    fat: float


class Nutrition(BaseModel):
    per_serving: Macros
    total: Macros
    meal_target_kcal: int | None


class TasteProfile(BaseModel):
    sweet: float
    salty: float
    sour: float
    spicy: float


class Match(BaseModel):
    percent: int
    pairing: float
    taste_similarity: float | None


class AllergenNotice(BaseModel):
    contains: list[Allergen]
    avoided: list[Allergen]
    blocked_words: list[str]


class Cost(BaseModel):
    total_pkr: int
    per_serving_pkr: int


class Recipe(BaseModel):
    title: str
    style: str
    servings: int
    minutes: int
    ingredients: list[RecipeIngredient]
    steps: list[str]
    nutrition: Nutrition
    taste: TasteProfile
    match: Match
    allergens: AllergenNotice
    cost: Cost
    fingerprint: str


class RecipeResponse(BaseModel):
    recipes: list[Recipe]
    suggestions: list[str]


# Signed-in only: the body carries the user's own preferences, sent by the web app.
@app.post("/api/recipes", response_model=RecipeResponse)
def recipes(body: RecipeRequest, claims: dict = Depends(current_user)) -> dict:
    try:
        return get_recipe_engine().generate(body.ingredients, tastes=body.tastes, allergens=body.allergens,
                                            blocked_words=body.blocked_words, calorie_tier=body.calorie_tier,
                                            servings=body.servings, limit=body.limit)
    except RecipeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---- Curated recipe recommendations (suitability engine) --------------------------------
Diet = Literal["vegetarian", "vegan", "gluten_free", "low_calorie", "high_protein", "low_carb", "keto"]


class HistoryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: Annotated[str, Field(pattern=r"^[a-z0-9-]{1,80}$")]
    kind: Literal["viewed", "saved", "cooked"]
    ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=20)


class SuitabilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=2, max_length=20)
    tastes: dict[SuitabilityTaste, Level | None] = Field(default_factory=dict)
    allergens: list[Allergen] = Field(default_factory=list, max_length=19)
    blocked_words: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(default_factory=list, max_length=20)
    diets: list[Diet] = Field(default_factory=list, max_length=7)
    pantry: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=300)
    max_minutes: int | None = Field(default=None, ge=5, le=480, strict=True)
    max_kcal: int | None = Field(default=None, ge=100, le=3000, strict=True)  # per serving, from the cook's calorie goal
    limit: int = Field(default=12, ge=1, le=40, strict=True)
    # The cook's own recent events (read by the browser under RLS); used only to personalise this ranking.
    history: list[HistoryEvent] = Field(default_factory=list, max_length=60)


@app.post("/api/recommendations")
def recommendations(body: SuitabilityRequest, claims: dict = Depends(current_user)) -> dict:
    engine, data = get_engine()
    personal = personalize(engine, [e.model_dump() for e in body.history], data.personalization,
                           tastes=body.tastes)
    try:
        result = engine.recommend(body.ingredients, tastes=body.tastes, allergens=body.allergens,
                                  blocked_words=body.blocked_words, diets=body.diets, pantry=body.pantry,
                                  max_minutes=body.max_minutes, max_kcal=body.max_kcal, limit=body.limit,
                                  weights_override=personal["weights"] if personal["active"] else None)
    except SuitabilityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {**result, "personalization": personal, "data_source": data.source, "notes": data.notes}


class PersonalizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    history: list[HistoryEvent] = Field(default_factory=list, max_length=60)


@app.post("/api/personalization")
def personalization(body: PersonalizationRequest, claims: dict = Depends(current_user)) -> dict:
    """What the ranking has learned from this cook's own events (for the Profile page)."""
    engine, data = get_engine()
    return personalize(engine, [e.model_dump() for e in body.history], data.personalization)


@app.get("/api/curated/{slug}")
def curated_recipe(slug: Annotated[str, Path(pattern=r"^[a-z0-9-]{1,80}$")],
                   have: Annotated[list[str], Query(max_length=320)] = [],
                   allergens: Annotated[list[Allergen], Query(max_length=19)] = []) -> dict:
    engine, data = get_engine()
    have = [h[:100] for h in have]
    recipe = engine.detail(slug, selected=have)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if have:  # Suggest swaps only when we know what the cook holds.
        core = [l["name"] for l in recipe["ingredients"] if not l["staple"]]
        known = [engine.canonical[h.casefold()] for h in have if h.casefold() in engine.canonical]
        for line in recipe["ingredients"]:
            if not line["have"] and not line["staple"]:
                line["substitutes"] = substitutes(engine, line["name"], have=known, blocked=allergens, context=core)
    return {**recipe, "data_source": data.source}


@app.get("/api/substitutes/{name}")
def ingredient_substitutes(name: Annotated[str, Path(min_length=1, max_length=100)],
                           have: Annotated[list[str], Query(max_length=320)] = [],
                           context: Annotated[list[str], Query(max_length=20)] = [],
                           allergens: Annotated[list[Allergen], Query(max_length=19)] = [],
                           limit: Annotated[int, Query(ge=1, le=10)] = 5) -> dict:
    """Best replacements for one ingredient (used on recipe pages and by the admin Substitute Finder)."""
    engine, _ = get_engine()
    canonical = engine.canonical.get(name.casefold())
    if canonical is None:
        raise HTTPException(status_code=404, detail="Unknown ingredient")
    resolve = lambda names: [engine.canonical[n.casefold()] for n in names if n.casefold() in engine.canonical]  # noqa: E731
    return {"ingredient": canonical, "substitutes": substitutes(engine, canonical, have=resolve(have), blocked=allergens,
                                                                context=resolve(context), limit=limit)}


@app.get("/api/compatibility/{name}")
def compatibility(name: Annotated[str, Path(min_length=1, max_length=100)]) -> dict:
    engine, _ = get_engine()
    canonical = engine.canonical.get(name.casefold())
    if canonical is None:
        raise HTTPException(status_code=404, detail="Unknown ingredient")
    neighbours = sorted(({"name": n, **{k: d[k] for k in ("weight", "relation", "evidence")}}
                         for n, d in engine.graph[canonical].items()), key=lambda r: (-r["weight"], r["name"]))
    return {"ingredient": canonical, "edges": neighbours}


class CompatibilityCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=1, max_length=20)
    allergens: list[Allergen] = Field(default_factory=list, max_length=19)
    blocked_words: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(default_factory=list, max_length=20)


@app.post("/api/compatibility/check")
def compatibility_check(body: CompatibilityCheck) -> dict:
    """Pairwise compatibility of a selection plus graph-suggested additions (no recipes involved)."""
    engine, _ = get_engine()
    try:
        names = engine.resolve(body.ingredients, minimum=1)
    except SuitabilityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    pairs = []
    for i, left in enumerate(names):
        for right in names[i + 1:]:
            weight, evidence = engine.compatibility(left, right)
            pairs.append({"a": left, "b": right, "weight": weight, "evidence": evidence,
                          "stored": "heuristic" not in evidence})
    words = [w.strip().casefold() for w in body.blocked_words if w.strip()]
    stored = [p["weight"] for p in pairs if p["stored"]]
    return {"pairs": pairs, "average": round(sum(p["weight"] for p in pairs) / len(pairs), 3) if pairs else None,
            "stored_pairs": len(stored), "suggestions": engine.suggest_additions(names, set(body.allergens), words)}


_evaluation_cache: dict = {"key": None, "report": None}


def _evaluation_report(fresh: bool = False) -> tuple[dict, object]:
    """Evaluate once per catalog version (recipes, edges, weights); the 60 s catalog reload alone does not rerun it."""
    engine, data = get_engine()
    key = (tuple(sorted(r.slug for r in engine.recipes)), engine.graph.number_of_edges(),
           tuple(sorted(engine.settings["weights"].items())))
    if fresh or _evaluation_cache["key"] != key:
        report = evaluate(engine, seeds=(11, 23, 37))
        report["personalization"] = {**simulate(engine),
                                     **personalization_settings(data.personalization)}
        _evaluation_cache.update(key=key, report=report)
    return _evaluation_cache["report"], (engine, data)


@app.get("/api/admin/evaluation")
def engine_evaluation(fresh: bool = False, claims: dict = Depends(current_admin)) -> dict:
    """Super Admin: offline accuracy of the recommender (Hit@k, MRR vs baselines) and the allergy safety test."""
    report, (engine, data) = _evaluation_report(fresh)
    return {**report, "data_source": data.source, "weights": engine.settings["weights"]}


@app.get("/api/evaluation/summary")
def evaluation_summary() -> dict:
    """Public headline numbers shown to cooks on the Recommendations page."""
    report, _ = _evaluation_report()
    full = next(r for r in report["methods"] if r["method"] == "Full engine")
    return {"hit5": full["hit@5"], "mrr": full["mrr"], "recipes": report["recipes"], "trials": full["trials"],
            "allergen_violations": report["safety"]["violations"]}


@app.get("/api/uploads/status")
def upload_status() -> dict:
    """Where image uploads go (Cloudflare R2 or Supabase Storage); no secrets are returned."""
    chosen = storage.backend()
    if chosen is None:
        return {"configured": False, "backend": None, "public_url": None}
    name, config = chosen
    public = config.public_url if name == "r2" else config.public_url("")
    return {"configured": True, "backend": name, "public_url": public}


@app.post("/api/uploads/image")
async def upload_image(request: Request, folder: Literal["recipes", "ingredients"],
                       name: Annotated[str, Query(pattern=r"^[a-z0-9-]{1,80}$")],
                       claims: dict = Depends(current_admin)) -> dict:
    """Super Admin only: store one recipe/ingredient image (raw body: WebP, JPEG or PNG, max 3 MB)."""
    return await _store_image(request, f"{folder}/{name}")


@app.post("/api/uploads/avatar")
async def upload_avatar(request: Request, claims: dict = Depends(current_user)) -> dict:
    """Any signed-in user: store their own profile photo under avatars/<their user id>-…"""
    user_id = re.sub(r"[^a-zA-Z0-9-]", "", str(claims.get("sub", "")))[:64]
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in required")
    return await _store_image(request, f"avatars/{user_id}")


async def _store_image(request: Request, prefix: str) -> dict:
    chosen = storage.backend()
    if chosen is None:
        raise HTTPException(status_code=503, detail="Image storage is not configured (SUPABASE_URL/ANON_KEY or R2_* on the API)")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > r2.MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is larger than 3 MB")
    body = await request.body()
    if len(body) > r2.MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is larger than 3 MB")
    kind = r2.sniff_image(body)
    if kind is None:
        raise HTTPException(status_code=415, detail="Use a WebP, JPEG or PNG image")
    # A fresh suffix per upload: the URL never changes content, so it can be cached forever.
    key = f"{prefix}-{secrets.token_hex(4)}.{r2.IMAGE_TYPES[kind]}"
    name, config = chosen
    try:
        if name == "r2":
            url = await run_in_threadpool(r2.put_object, config, key, body, kind)
        else:
            token = request.headers.get("authorization", "").partition(" ")[2]
            url = await run_in_threadpool(storage.put_supabase, config, token, key, body, kind)
    except (r2.R2Error, storage.StorageError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"url": url, "key": key, "content_type": kind, "bytes": len(body), "backend": name}
