"""Health, public catalog recommendations, and signed-in user routes (Supabase JWT)."""
import os
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

# Vercel loads this file from the api project root; uvicorn uses api.index:app.
from core.env import load_env_file

load_env_file()

from core.auth import current_user  # noqa: E402
from engine.catalog_db import get_engine  # noqa: E402
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
Diet = Literal["vegetarian", "gluten_free", "low_calorie", "high_protein"]


class SuitabilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=2, max_length=20)
    tastes: dict[Taste, Level | None] = Field(default_factory=dict)
    allergens: list[Allergen] = Field(default_factory=list, max_length=19)
    blocked_words: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(default_factory=list, max_length=20)
    diets: list[Diet] = Field(default_factory=list, max_length=4)
    pantry: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=300)
    max_minutes: int | None = Field(default=None, ge=5, le=480, strict=True)
    limit: int = Field(default=12, ge=1, le=40, strict=True)


@app.post("/api/recommendations")
def recommendations(body: SuitabilityRequest, claims: dict = Depends(current_user)) -> dict:
    engine, data = get_engine()
    try:
        result = engine.recommend(body.ingredients, tastes=body.tastes, allergens=body.allergens,
                                  blocked_words=body.blocked_words, diets=body.diets, pantry=body.pantry,
                                  max_minutes=body.max_minutes, limit=body.limit)
    except SuitabilityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {**result, "data_source": data.source, "notes": data.notes}


@app.get("/api/curated/{slug}")
def curated_recipe(slug: Annotated[str, Path(pattern=r"^[a-z0-9-]{1,80}$")],
                   have: Annotated[list[str], Query(max_length=320)] = []) -> dict:
    engine, data = get_engine()
    recipe = engine.detail(slug, selected=[h[:100] for h in have])
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {**recipe, "data_source": data.source}


@app.get("/api/compatibility/{name}")
def compatibility(name: Annotated[str, Path(min_length=1, max_length=100)]) -> dict:
    engine, _ = get_engine()
    canonical = engine.canonical.get(name.casefold())
    if canonical is None:
        raise HTTPException(status_code=404, detail="Unknown ingredient")
    neighbours = sorted(({"name": n, **{k: d[k] for k in ("weight", "relation", "evidence")}}
                         for n, d in engine.graph[canonical].items()), key=lambda r: (-r["weight"], r["name"]))
    return {"ingredient": canonical, "edges": neighbours}
