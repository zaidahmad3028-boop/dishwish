"""Load the bundled, validated ingredient catalog; no database credentials needed."""
from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path

TASTES = ("sweet", "salty", "sour", "spicy")
ALLERGENS = frozenset({"milk", "gluten", "eggs", "peanuts", "tree_nuts", "sesame",
                      "fish", "shellfish", "soy", "mustard", "legumes", "tomato",
                      "brinjal", "mango", "citrus", "banana", "strawberry", "coconut", "corn"})


@dataclass(frozen=True)
class Ingredient:
    name: str
    category: str
    kcal: float
    protein: float
    carbs: float
    fat: float
    sweet: int
    salty: int
    sour: int
    spicy: int
    allergens: tuple[str, ...]
    priority: int


@lru_cache(maxsize=1)
def load_ingredients() -> tuple[Ingredient, ...]:
    rows = json.loads(Path(__file__).with_name("ingredients.json").read_text(encoding="utf-8"))
    return tuple(Ingredient(**{**row, "allergens": tuple(row["allergens"])}) for row in rows)
