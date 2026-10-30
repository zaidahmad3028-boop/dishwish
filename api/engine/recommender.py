"""Deterministic, cumulative ingredient rankings using a weighted NetworkX graph.

Weights are transparent heuristics, not learned or independently taste-validated.
Nutrition and allergens inherit the supplied catalog's limitations.
"""
from collections.abc import Mapping, Sequence
from functools import lru_cache
from itertools import combinations
import math

import networkx as nx

from .data import ALLERGENS, TASTES, Ingredient, load_ingredients

# Unordered category pair affinities. Unlisted pairs use the conservative default.
CATEGORY_AFFINITY = {
    frozenset(pair): value for pair, value in [
        (("Meat", "Spices"), 1.0), (("Meat", "Vegetables"), .9),
        (("Meat", "Oils & Sauces"), .9), (("Meat", "Dairy"), .8),
        (("Meat", "Grocery"), .7), (("Vegetables", "Spices"), .95),
        (("Vegetables", "Oils & Sauces"), .9), (("Vegetables", "Pulses & Nuts"), .8),
        (("Pulses & Nuts", "Spices"), .95), (("Pulses & Nuts", "Oils & Sauces"), .85),
        (("Grocery", "Spices"), .8), (("Grocery", "Dairy"), .8),
        (("Fruits", "Dairy"), .9), (("Fruits", "Pulses & Nuts"), .8),
        (("Spices", "Oils & Sauces"), .9),
    ]
}


def pair_weight(left: Ingredient, right: Ingredient) -> float:
    affinity = CATEGORY_AFFINITY.get(frozenset((left.category, right.category)), .5)
    taste_similarity = 1 - sum(abs(getattr(left, t) - getattr(right, t)) for t in TASTES) / 40
    return .6 * affinity + .4 * taste_similarity


class Recommender:
    def __init__(self, ingredients: Sequence[Ingredient]):
        self.catalog = {item.name: item for item in ingredients}
        if len(self.catalog) != len(ingredients):
            raise ValueError("Ingredient names must be unique")
        graph = nx.Graph()
        graph.add_nodes_from(self.catalog)
        for left, right in combinations(ingredients, 2):
            graph.add_edge(left.name, right.name, weight=pair_weight(left, right))
        self.graph = nx.freeze(graph)
        self.canonical = {name.casefold(): name for name in self.catalog}

    def recommend(self, selected: Sequence[str], *, taste_preferences: Mapping[str, float] | None = None,
                  excluded_allergens: Sequence[str] = (), limit: int = 10) -> list[dict]:
        if not 1 <= len(selected) <= 20 or not 1 <= limit <= 50:
            raise ValueError("Select 1–20 ingredients and a limit from 1–50")
        preferences = dict(taste_preferences or {})
        if any(t not in TASTES or not math.isfinite(v) or not 0 <= v <= 10 for t, v in preferences.items()):
            raise ValueError("Taste preferences must be finite scores from 0 to 10")
        blocked = set(excluded_allergens)
        if not blocked <= ALLERGENS:
            raise ValueError("Unknown allergen tag")
        names = []
        for raw in selected:
            name = self.canonical.get(raw.strip().casefold())
            if name is None:
                raise ValueError(f"Unknown ingredient: {raw}")
            if name in names:
                raise ValueError("Selected ingredients must be distinct")
            if blocked.intersection(self.catalog[name].allergens):
                raise ValueError(f"Selected ingredient conflicts with excluded allergens: {name}")
            names.append(name)
        names.sort()  # Stable floating-point accumulation regardless of request order.
        recommendations = []
        for name, item in self.catalog.items():
            if name in names or blocked.intersection(item.allergens):
                continue
            contributions = {source: self.graph[source][name]["weight"] for source in names}
            taste_fit = (1 - sum(abs(getattr(item, t) - v) for t, v in preferences.items())
                         / (10 * len(preferences))) if preferences else 1.0
            # Sum all selected edges; preference factor preserves cumulative support.
            score = sum(contributions.values()) * (.75 + .25 * taste_fit)
            recommendations.append({"name": name, "category": item.category, "score": score,
                                    "priority": item.priority, "allergens": list(item.allergens),
                                    "taste_fit": taste_fit, "contributions": contributions})
        # Larger priority means higher priority; name is the stable final tiebreaker.
        recommendations.sort(key=lambda row: (-row["score"], -row["priority"], row["name"].casefold()))
        return recommendations[:limit]


@lru_cache(maxsize=1)
def get_recommender() -> Recommender:
    return Recommender(load_ingredients())
