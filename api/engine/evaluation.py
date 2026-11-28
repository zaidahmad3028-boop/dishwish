"""Offline evaluation of the recipe recommender (no users needed, fully repeatable).

Leave-ingredients-out test: for every curated recipe we pretend a cook holds only part of its main
ingredients (the dish's main ingredient plus a random 50% of the rest, at least two), ask each ranking
method for recipes, and record where the true recipe lands. A good method puts it near the top.

Metrics (averaged over recipes and several random seeds):
- Hit@k: share of trials where the true recipe is in the top k (k = 1, 3, 5).
- MRR: mean reciprocal rank (1 for first place, 1/2 for second, 0 if not returned).

Methods compared:
- random: a random order of the recipes that share an ingredient with the selection (fair baseline).
- coverage only, graph only: the engine with a single component switched on.
- no TF-IDF, no graph: the full engine with the similarity or the NetworkX pairing component switched off
  (ablations; on this retrieval test the graph adds nothing, its value is in suggestions, swaps and explanations).
- full engine: the weights currently in use.

Leakage check: the stored graph edges come from co-occurrence in these same recipes, so the hidden dish
also shaped the graph. leave_one_recipe_out() rebuilds the co-occurrence edges without the target recipe
for every query and reruns the graph-only and full-engine rankings.

Recipes with fewer than three main ingredient families cannot hide half of them and are skipped
(eligible_recipes in the report says how many were tested).

A separate safety test checks that, for random allergy profiles, no returned recipe contains an
excluded allergen. It is a hard filter, so the expected violation count is 0.
"""
from __future__ import annotations

import random
import time
from collections.abc import Mapping

from .suitability import Edge, SuitabilityEngine, cooccurrence_edges, family, is_staple, main_ingredient

KS = (1, 3, 5)
# The same three seeds everywhere (CLI, Admin -> Evaluation, public summary), so every stated number reproduces.
DEFAULT_SEEDS = (11, 23, 37)


def _queries(engine: SuitabilityEngine, seed: int) -> list[tuple[str, list[str]]]:
    rng = random.Random(seed)
    out = []
    for recipe in engine.recipes:
        core = [l.name for l in recipe.lines if not is_staple(engine.catalog[l.name])]
        by_family: dict[str, str] = {}
        for name in core:
            by_family.setdefault(family(engine.catalog[name]), name)
        names = list(by_family.values())
        if len(names) < 3:
            continue
        main = main_ingredient(recipe.lines, engine.catalog)
        keep = [main.name] if main and main.name in names else []
        rest = [n for n in names if n not in keep]
        rng.shuffle(rest)
        take = max(2 - len(keep), round(len(rest) * 0.5))
        query = keep + rest[:take]
        if len(query) >= 2:
            out.append((recipe.slug, query))
    return out


def _memo(engine: SuitabilityEngine) -> dict:
    """Pair weights and nutrition never change during one run, so every variant shares one cache."""
    cache = engine.__dict__.setdefault("_eval_cache", {"pair": {}, "nut": {}, "diet": {}})
    return cache


def _variant(engine: SuitabilityEngine, weights: Mapping[str, float]) -> SuitabilityEngine:
    clone = object.__new__(SuitabilityEngine)
    clone.__dict__.update(engine.__dict__)
    cache = _memo(engine)
    pair = lambda a, b: cache["pair"].get((a, b)) or cache["pair"].setdefault((a, b), SuitabilityEngine.compatibility(clone, a, b))  # noqa: E731
    nut = lambda r: cache["nut"].get(r.slug) or cache["nut"].setdefault(r.slug, SuitabilityEngine.nutrition(clone, r))  # noqa: E731
    diet = lambda r: cache["diet"].get(r.slug) or cache["diet"].setdefault(r.slug, SuitabilityEngine.diets(clone, r))  # noqa: E731
    clone.compatibility, clone.nutrition, clone.diets = pair, nut, diet
    clone.settings = {**engine.settings, "weights": {k: float(weights.get(k, 0)) for k in engine.settings["weights"]},
                      "min_score": 0.0}
    return clone


def _rank_engine(engine: SuitabilityEngine, query: list[str], target: str) -> int | None:
    result = engine.recommend(query, limit=len(engine.recipes))
    slugs = [r["slug"] for r in result["recipes"]]
    return slugs.index(target) + 1 if target in slugs else None


def _rank_random(engine: SuitabilityEngine, query: list[str], target: str, rng: random.Random) -> int | None:
    chosen = {family(engine.catalog[n]) for n in query}
    pool = [r.slug for r in engine.recipes if engine.core_families(r) & chosen]
    rng.shuffle(pool)
    return pool.index(target) + 1 if target in pool else None


def _summary(ranks: list[int | None]) -> dict:
    n = len(ranks) or 1
    row = {f"hit@{k}": round(sum(1 for r in ranks if r is not None and r <= k) / n, 4) for k in KS}
    row["mrr"] = round(sum(1 / r for r in ranks if r) / n, 4)
    row["trials"] = len(ranks)
    return row


def safety_check(engine: SuitabilityEngine, seed: int = 5, profiles: int = 40) -> dict:
    """Random allergy profiles x random selections: count returned recipes that contain an excluded allergen."""
    rng = random.Random(seed)
    tags = sorted({a for i in engine.catalog.values() for a in i.allergens})
    checked = violations = 0
    for _ in range(profiles):
        blocked = set(rng.sample(tags, k=min(len(tags), rng.randint(1, 3))))
        allowed = [i.name for i in engine.catalog.values() if not blocked & set(i.allergens) and not is_staple(i)]
        query = rng.sample(allowed, k=3)
        try:
            result = engine.recommend(query, allergens=sorted(blocked), limit=len(engine.recipes))
        except ValueError:
            continue
        for row in result["recipes"]:
            recipe = next(r for r in engine.recipes if r.slug == row["slug"])
            checked += 1
            if any(blocked & set(engine.catalog[l.name].allergens) for l in recipe.lines):
                violations += 1
    return {"profiles": profiles, "recipes_checked": checked, "violations": violations}


def _without_recipe(engine: SuitabilityEngine, slug: str) -> SuitabilityEngine:
    """The same engine, but its co-occurrence edges are rebuilt without one recipe (other edges are kept)."""
    others = [r for r in engine.recipes if r.slug != slug]
    kept = {frozenset((a, b)): Edge(d["weight"], d["relation"], d["evidence"])
            for a, b, d in engine.graph.edges(data=True) if d["relation"] != "co-occurrence"}
    edges = {**kept, **cooccurrence_edges(others, engine.catalog)}
    return SuitabilityEngine(list(engine.catalog.values()), engine.recipes, edges, engine.settings)


def leave_one_recipe_out(engine: SuitabilityEngine, seeds: tuple[int, ...] = DEFAULT_SEEDS) -> list[dict]:
    """Graph-only and full-engine accuracy when the hidden recipe never contributes to the graph."""
    weights = engine.settings["weights"]
    methods = {"Graph only": {"compatibility": 1}, "Full engine": dict(weights)}
    ranks: dict[str, list[int | None]] = {name: [] for name in methods}
    per_target: dict[str, dict[str, SuitabilityEngine]] = {}
    for seed in seeds:
        for target, query in _queries(engine, seed):
            if target not in per_target:
                base = _without_recipe(engine, target)
                per_target[target] = {name: _variant(base, w) for name, w in methods.items()}
            for name in methods:
                ranks[name].append(_rank_engine(per_target[target][name], query, target))
    return [{"method": name, **_summary(r)} for name, r in ranks.items()]


def evaluate(engine: SuitabilityEngine, seeds: tuple[int, ...] = DEFAULT_SEEDS, leakage_check: bool = False) -> dict:
    started = time.perf_counter()
    weights = engine.settings["weights"]
    methods = {
        "Random order": None,
        "Coverage only": {"coverage": 1},
        "Graph only": {"compatibility": 1},
        "Without TF-IDF": {**weights, "similarity": 0},
        "Without graph": {**weights, "compatibility": 0},
        "Full engine": dict(weights),
    }
    ranks: dict[str, list[int | None]] = {name: [] for name in methods}
    variants = {name: _variant(engine, w) for name, w in methods.items() if w is not None}
    for seed in seeds:
        rng = random.Random(seed * 7919)
        for target, query in _queries(engine, seed):
            for name in methods:
                ranks[name].append(_rank_random(engine, query, target, rng) if name == "Random order"
                                   else _rank_engine(variants[name], query, target))
    results = [{"method": name, **_summary(r)} for name, r in ranks.items()]
    full, base = results[-1], results[0]
    eligible = {slug for slug, _ in _queries(engine, seeds[0])} if seeds else set()
    report = {
        "methods": results,
        "best": max(results, key=lambda r: (r["mrr"], r["hit@5"]))["method"],
        "lift_hit5_vs_random": round(full["hit@5"] / base["hit@5"], 2) if base["hit@5"] else None,
        "safety": safety_check(engine),
        "recipes": len(engine.recipes),
        "eligible_recipes": len(eligible),
        "skipped_recipes": sorted(r.slug for r in engine.recipes if r.slug not in eligible),
        "seeds": list(seeds),
        "protocol": "Leave-ingredients-out: main ingredient + 50% of the other main ingredients; true recipe ranked among all recipes.",
    }
    if leakage_check:
        report["leave_one_recipe_out"] = leave_one_recipe_out(engine, seeds)
    report["seconds"] = round(time.perf_counter() - started, 2)
    return report


if __name__ == "__main__":  # python -m engine.evaluation (from api/)
    from .catalog_db import bundled_data
    data = bundled_data()
    report = evaluate(SuitabilityEngine(data.ingredients, data.recipes, data.edges), leakage_check=True)
    print(f"{'Method':<16}" + "".join(f"{k:>9}" for k in ("hit@1", "hit@3", "hit@5", "mrr")))
    for row in report["methods"]:
        print(f"{row['method']:<16}" + "".join(f"{row[k]:>9.3f}" for k in ("hit@1", "hit@3", "hit@5", "mrr")))
    print("Leave-one-recipe-out graph (no leakage):")
    for row in report["leave_one_recipe_out"]:
        print(f"{row['method']:<16}" + "".join(f"{row[k]:>9.3f}" for k in ("hit@1", "hit@3", "hit@5", "mrr")))
    print("eligible recipes:", report["eligible_recipes"], "of", report["recipes"], "| skipped:", report["skipped_recipes"])
    print("trials:", report["methods"][0]["trials"], "| lift Hit@5 vs random:", report["lift_hit5_vs_random"],
          "| safety:", report["safety"], "| seconds:", report["seconds"])
