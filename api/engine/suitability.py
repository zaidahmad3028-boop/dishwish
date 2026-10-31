"""Curated recipe suitability: hard safety filters first, then a transparent weighted score.

Two separate ideas live here (see docs/RECOMMENDATION_ENGINE.md):
- Ingredient compatibility: how well two ingredients pair, read from a NetworkX graph whose
  edges are stored rows (weight 0-1, relation type, evidence). Pairs with no stored edge fall
  back to the catalog heuristic in recommender.pair_weight and are labelled as such.
- Recipe suitability: how well a whole curated recipe fits this cook's selection, tastes,
  diet, allergies and time.

Score = Σ wᵢ·cᵢ / Σ wᵢ over the components that are available (coverage, compatibility,
taste, cooking time), minus missing_penalty × max(0, missing − tolerance), clamped to 0-1.
A component with no input (e.g. no taste chosen) is left out and the remaining weights are
renormalised, so a missing input never fabricates a score. The weights are engineering
defaults, not validated against user outcomes.
"""
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from itertools import combinations
import math

import networkx as nx

from .data import ALLERGENS, TASTES, Ingredient
from .recommender import pair_weight

COMPONENTS = ("coverage", "compatibility", "taste", "cooking")
DEFAULT_SETTINGS = {
    "weights": {"coverage": .45, "compatibility": .30, "taste": .20, "cooking": .05},
    "missing_penalty": .03,
    "missing_tolerance": 3,
    "min_score": .20,
}
DIETS = ("vegetarian", "gluten_free", "low_calorie", "high_protein")
LOW_CALORIE_KCAL = 500  # per serving
HIGH_PROTEIN_G = 25  # per serving
TASTE_TARGETS = {"low": 2.0, "medium": 5.0, "high": 8.0}
# Everyday items most kitchens hold; they are listed but never count as "missing".
STAPLE_NAMES = frozenset({"Salt", "Cooking Oil", "Sunflower Oil", "Corn Oil", "Desi Ghee", "Banaspati Ghee", "White Sugar"})
# Interchangeable forms of the same ingredient for matching what the cook has.
SUBSTITUTE_GROUPS = (
    ("Garlic", "Garlic Paste"), ("Ginger", "Ginger Paste"), ("Basmati Rice", "Sella Basmati Rice"),
    ("Cooking Oil", "Sunflower Oil", "Corn Oil"), ("Yogurt (Dahi)", "Hung Curd (Thick Dahi)"),
    ("Red Chilli Powder", "Kashmiri Chilli Powder"), ("Lemon", "Lemon Pickle (Nimbu Achar)"),
)
_GROUP_OF = {name: group[0] for group in SUBSTITUTE_GROUPS for name in group}


class SuitabilityError(ValueError):
    pass


def family(item: Ingredient) -> str:
    """Matching key: cuts of one animal (Chicken Thigh ~ Chicken Leg Piece) count as the same thing."""
    if item.category == "Meat":
        lower = item.name.lower()
        if "fish" in lower:
            return "fish"
        for animal in ("chicken", "mutton", "beef"):
            if lower.startswith(animal):
                return animal
    return _GROUP_OF.get(item.name, item.name)


def is_staple(item: Ingredient) -> bool:
    return item.category == "Spices" or item.name in STAPLE_NAMES


@dataclass(frozen=True)
class RecipeLine:
    name: str
    grams: float
    display: str


@dataclass(frozen=True)
class CuratedRecipe:
    slug: str
    name: str
    category: str
    cuisine: str
    minutes: int
    servings: int
    taste: Mapping[str, float]
    description: str
    lines: tuple[RecipeLine, ...]
    steps: tuple[str, ...]
    image_url: str | None = None
    source: str = "curated"


@dataclass(frozen=True)
class Edge:
    weight: float
    relation: str
    evidence: str


def validate_settings(raw: Mapping | None) -> dict:
    """Merge stored settings over the defaults; reject anything out of range."""
    s = {**DEFAULT_SETTINGS, "weights": dict(DEFAULT_SETTINGS["weights"])}
    if not raw:
        return s
    weights = raw.get("weights", {})
    for key, value in weights.items():
        if key not in COMPONENTS or not isinstance(value, (int, float)) or not 0 <= value <= 1:
            raise SuitabilityError(f"Invalid weight: {key}")
        s["weights"][key] = float(value)
    if sum(s["weights"].values()) <= 0:
        raise SuitabilityError("At least one weight must be above 0")
    for key, low, high in (("missing_penalty", 0, .2), ("missing_tolerance", 0, 10), ("min_score", 0, 1)):
        if key in raw:
            value = raw[key]
            if not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
                raise SuitabilityError(f"Invalid {key}")
            s[key] = value
    return s


def cooccurrence_edges(recipes: Iterable[CuratedRecipe], catalog: Mapping[str, Ingredient]) -> dict[frozenset, Edge]:
    """Default stored edges: core ingredients used together in curated recipes.

    weight = 0.5 + 0.5·min(1, n/3) where n is the number of curated recipes using both, so a pair
    seen once scores 0.67 and one seen in three or more scores 1.0. Evidence names the count.
    """
    counts: dict[frozenset, int] = {}
    for recipe in recipes:
        core = sorted({l.name for l in recipe.lines if not is_staple(catalog[l.name])})
        for pair in combinations(core, 2):
            counts[frozenset(pair)] = counts.get(frozenset(pair), 0) + 1
    return {pair: Edge(round(.5 + .5 * min(1, n / 3), 3), "co-occurrence", f"used together in {n} curated recipe{'s' * (n > 1)}")
            for pair, n in counts.items()}


class SuitabilityEngine:
    def __init__(self, ingredients: Sequence[Ingredient], recipes: Sequence[CuratedRecipe],
                 edges: Mapping[frozenset, Edge], settings: Mapping | None = None):
        self.catalog = {i.name: i for i in ingredients}
        self.canonical = {name.casefold(): name for name in self.catalog}
        for recipe in recipes:
            unknown = [l.name for l in recipe.lines if l.name not in self.catalog]
            if unknown:
                raise SuitabilityError(f"{recipe.name} uses unknown ingredients: {', '.join(unknown)}")
        self.recipes = tuple(recipes)
        self.settings = validate_settings(settings)
        graph = nx.Graph()
        graph.add_nodes_from(self.catalog)
        for pair, edge in edges.items():
            left, right = tuple(pair)
            if left in self.catalog and right in self.catalog and 0 <= edge.weight <= 1:
                graph.add_edge(left, right, weight=edge.weight, relation=edge.relation, evidence=edge.evidence)
        self.graph = nx.freeze(graph)
        self.members: dict[str, list[str]] = {}
        for name, item in self.catalog.items():
            self.members.setdefault(family(item), []).append(name)

    # ---- ingredient compatibility -------------------------------------------------------
    def compatibility(self, left: str, right: str) -> tuple[float, str]:
        """Weight of one pair and where it came from (stored edge or catalog heuristic)."""
        data = self.graph.get_edge_data(left, right)
        if data:
            return data["weight"], data["evidence"]
        # Another form of the same ingredient (Chicken Breast ~ Chicken Thigh) may hold the stored edge.
        related = [d for a in self.members[family(self.catalog[left])] for b in self.members[family(self.catalog[right])]
                   if (d := self.graph.get_edge_data(a, b))]
        if related:
            best = max(related, key=lambda d: d["weight"])
            return best["weight"], f"{best['evidence']} (related form)"
        return round(pair_weight(self.catalog[left], self.catalog[right]), 3), "catalog heuristic (no stored edge)"

    def suggest_additions(self, selected: Sequence[str], blocked: set[str], words: Sequence[str], limit: int = 6) -> list[dict]:
        """Ingredients most strongly connected to the selection by stored edges."""
        support: dict[str, float] = {}
        chosen = {family(self.catalog[n]) for n in selected}
        for name in selected:
            best: dict[str, float] = {}
            for member in self.members[family(self.catalog[name])]:
                for neighbour, data in self.graph[member].items():
                    if family(self.catalog[neighbour]) not in chosen and self._allowed(self.catalog[neighbour], blocked, words):
                        best[neighbour] = max(best.get(neighbour, 0), data["weight"])
            for neighbour, weight in best.items():
                support[neighbour] = support.get(neighbour, 0) + weight
        top = sorted(support.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
        return [{"name": name, "category": self.catalog[name].category,
                 "support": round(score / len(selected), 3)} for name, score in top]

    # ---- recipe suitability -------------------------------------------------------------
    def resolve(self, raw_names: Sequence[str], *, minimum: int = 2) -> list[str]:
        names = []
        for raw in raw_names:
            name = self.canonical.get(raw.strip().casefold())
            if name is None:
                raise SuitabilityError(f"Unknown ingredient: {raw}")
            if name in names:
                raise SuitabilityError("Selected ingredients must be distinct")
            names.append(name)
        if not minimum <= len(names) <= 20:
            raise SuitabilityError(f"Select {minimum}-20 different ingredients")
        return names

    @staticmethod
    def _allowed(item: Ingredient, blocked: set[str], words: Sequence[str]) -> bool:
        lower = item.name.casefold()
        return not blocked.intersection(item.allergens) and not any(w in lower for w in words)

    def nutrition(self, recipe: CuratedRecipe) -> dict:
        totals = {k: sum(getattr(self.catalog[l.name], k) * l.grams / 100 for l in recipe.lines)
                  for k in ("kcal", "protein", "carbs", "fat")}
        return {k: round(v / recipe.servings, 1) for k, v in totals.items()}

    def diets(self, recipe: CuratedRecipe) -> list[str]:
        items = [self.catalog[l.name] for l in recipe.lines]
        per = self.nutrition(recipe)
        tags = []
        if not any(i.category == "Meat" and i.name != "Eggs" for i in items):
            tags.append("vegetarian")
        if not any("gluten" in i.allergens for i in items):
            tags.append("gluten_free")
        if per["kcal"] <= LOW_CALORIE_KCAL:
            tags.append("low_calorie")
        if per["protein"] >= HIGH_PROTEIN_G:
            tags.append("high_protein")
        return tags

    def recommend(self, selected: Sequence[str], *, tastes: Mapping[str, str | None] | None = None,
                  allergens: Sequence[str] = (), blocked_words: Sequence[str] = (), diets: Sequence[str] = (),
                  pantry: Sequence[str] = (), max_minutes: int | None = None, limit: int = 12) -> dict:
        names = self.resolve(selected)
        blocked = set(allergens)
        if not blocked <= ALLERGENS:
            raise SuitabilityError("Unknown allergen tag")
        if any(d not in DIETS for d in diets):
            raise SuitabilityError("Unknown diet")
        words = [w.strip().casefold() for w in blocked_words if w.strip()]
        conflicts = [n for n in names if not self._allowed(self.catalog[n], blocked, words)]
        if conflicts:
            raise SuitabilityError(f"These selected ingredients conflict with your allergies: {', '.join(conflicts)}")
        targets = {t: TASTE_TARGETS[v] for t, v in (tastes or {}).items() if t in TASTES and v in TASTE_TARGETS}
        pantry_names = [self.canonical[p.casefold()] for p in pantry if p.casefold() in self.canonical]
        selected_families = {family(self.catalog[n]) for n in names}
        have = selected_families | {family(self.catalog[n]) for n in pantry_names}
        weights, s = self.settings["weights"], self.settings

        results, excluded = [], {"allergy": 0, "diet": 0, "no_overlap": 0}
        for recipe in self.recipes:
            items = [self.catalog[l.name] for l in recipe.lines]
            if any(not self._allowed(i, blocked, words) for i in items):
                excluded["allergy"] += 1
                continue
            recipe_diets = self.diets(recipe)
            if not set(diets) <= set(recipe_diets):
                excluded["diet"] += 1
                continue
            core = [i for i in items if not is_staple(i)]
            used = [i.name for i in core if family(i) in selected_families]
            if not used:
                excluded["no_overlap"] += 1
                continue
            have_core = [i for i in core if family(i) in have]
            missing = [i.name for i in core if family(i) not in have]
            components: dict[str, float | None] = {"coverage": len(have_core) / len(core)}
            # Compatibility: every selected ingredient against every other core ingredient of the dish.
            # Each unordered family pair counts once (Chicken+Tomato is not counted again as Tomato+Chicken).
            pairs, seen = [], set()
            for n in names:
                for i in core:
                    key = frozenset((family(self.catalog[n]), family(i)))
                    if len(key) == 2 and key not in seen:
                        seen.add(key)
                        pairs.append((n, i.name))
            pair_rows = [(a, b, *self.compatibility(a, b)) for a, b in pairs]
            components["compatibility"] = sum(r[2] for r in pair_rows) / len(pair_rows) if pair_rows else None
            components["taste"] = (1 - sum(abs(recipe.taste[t] - v) for t, v in targets.items()) / (10 * len(targets))
                                   if targets else None)
            components["cooking"] = ((1.0 if recipe.minutes <= max_minutes
                                      else max(0.0, 1 - (recipe.minutes - max_minutes) / max_minutes))
                                     if max_minutes else None)
            active = {k: v for k, v in components.items() if v is not None and weights[k] > 0}
            base = sum(weights[k] * v for k, v in active.items()) / sum(weights[k] for k in active)
            penalty = s["missing_penalty"] * max(0, len(missing) - s["missing_tolerance"])
            score = min(1.0, max(0.0, base - penalty))
            if score < s["min_score"]:
                continue
            strongest = max(pair_rows, key=lambda r: r[2]) if pair_rows else None
            explanation = [f"Uses {', '.join(used)} from your selection."]
            if strongest:
                explanation.append(f"{strongest[0]} + {strongest[1]}: {strongest[3]} (weight {strongest[2]:.2f}).")
            for t, v in targets.items():
                explanation.append(f"{t.title()} {recipe.taste[t]:.0f}/10 vs your {t} target {v:.0f}/10.")
            explanation.append(f"Missing {len(missing)}: {', '.join(missing)}." if missing else "You have every main ingredient.")
            if penalty:
                explanation.append(f"-{round(penalty * 100)} points for {len(missing) - s['missing_tolerance']} missing beyond your tolerance.")
            results.append({
                "slug": recipe.slug, "name": recipe.name, "category": recipe.category, "cuisine": recipe.cuisine,
                "minutes": recipe.minutes, "servings": recipe.servings, "description": recipe.description,
                "image_url": recipe.image_url, "source": recipe.source,
                "match_percent": round(score * 100), "score": round(score, 4),
                "components": {k: (round(v, 4) if v is not None else None) for k, v in components.items()},
                "weights_used": {k: round(weights[k] / sum(weights[a] for a in active), 4) for k in active},
                "penalty": round(penalty, 4), "used": used, "missing": missing,
                "taste": dict(recipe.taste), "diets": recipe_diets, "nutrition_per_serving": self.nutrition(recipe),
                "explanation": explanation,
            })
        results.sort(key=lambda r: (-r["score"], len(r["missing"]), r["name"]))
        return {
            "recipes": results[:limit],
            "suggestions": self.suggest_additions(names, blocked, words),
            "excluded": excluded,
            "settings": {"weights": weights, "missing_penalty": s["missing_penalty"],
                         "missing_tolerance": s["missing_tolerance"], "min_score": s["min_score"]},
        }

    def detail(self, slug: str, *, selected: Sequence[str] = (), pantry: Sequence[str] = ()) -> dict | None:
        recipe = next((r for r in self.recipes if r.slug == slug), None)
        if recipe is None:
            return None
        have = {family(self.catalog[self.canonical[n.casefold()]]) for n in [*selected, *pantry] if n.casefold() in self.canonical}
        lines = []
        for l in recipe.lines:
            item = self.catalog[l.name]
            lines.append({"name": l.name, "grams": l.grams, "display": l.display, "category": item.category,
                          "staple": is_staple(item), "have": family(item) in have, "allergens": list(item.allergens)})
        allergens = sorted({a for l in recipe.lines for a in self.catalog[l.name].allergens})
        return {"slug": recipe.slug, "name": recipe.name, "category": recipe.category, "cuisine": recipe.cuisine,
                "minutes": recipe.minutes, "servings": recipe.servings, "description": recipe.description,
                "image_url": recipe.image_url, "source": recipe.source, "taste": dict(recipe.taste),
                "ingredients": lines, "steps": list(recipe.steps), "allergens": allergens, "diets": self.diets(recipe),
                "nutrition_per_serving": self.nutrition(recipe)}


def bundled_recipes() -> tuple[CuratedRecipe, ...]:
    from .curated_data import RECIPES
    return tuple(
        CuratedRecipe(slug, name, category, cuisine, minutes, servings, dict(zip(TASTES, taste)), description,
                      tuple(RecipeLine(n, g, d) for n, g, d in lines), tuple(steps))
        for slug, name, category, cuisine, minutes, servings, taste, description, lines, steps in RECIPES)


@dataclass
class EngineData:
    ingredients: Sequence[Ingredient]
    recipes: Sequence[CuratedRecipe]
    edges: Mapping[frozenset, Edge]
    settings: Mapping | None = None
    source: str = "bundled"
    notes: list[str] = field(default_factory=list)
