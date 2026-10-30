"""Public catalog recommendations and health; no user-specific data is accessed."""
import os
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

# Vercel loads this file from the api project root; uvicorn uses api.index:app.
from engine.recommender import get_recommender

app = FastAPI(title="Pantry2Plate PK API", version="0.3.0")
origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type", "Authorization"])

Allergen = Literal["milk", "gluten", "eggs", "peanuts", "tree_nuts", "sesame",
                   "fish", "shellfish", "soy", "mustard", "legumes"]
Taste = Literal["sweet", "salty", "sour", "spicy"]
Score = Annotated[float, Field(ge=0, le=10, allow_inf_nan=False)]


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected_ingredients: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=1, max_length=20)
    taste_preferences: dict[Taste, Score] = Field(default_factory=dict)
    excluded_allergens: list[Allergen] = Field(default_factory=list, max_length=11)
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
    return {"status": "ok", "service": "pantry2plate-pk-api"}


@app.post("/api/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest) -> dict:
    try:
        rows = get_recommender().recommend(body.selected_ingredients,
            taste_preferences=body.taste_preferences, excluded_allergens=body.excluded_allergens,
            limit=body.limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"recommendations": rows}
