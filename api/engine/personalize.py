"""Personalised ranking: learn each cook's component weights from what they actually chose.

Signal: the cook's own recipe events (saved / cooked / viewed), each stored with the ingredients
they had selected at the time. For every such event we re-run the engine on those ingredients and
treat the chosen recipe as preferred over every other candidate (pairwise learning to rank).

Model: score(r) = Σ wₖ·cₖ(r) over the five components. Weights are learned with pairwise logistic
regression (RankNet-style gradient steps), starting from the global weights and pulled back toward
them by L2 regularisation, so a few clicks cannot swing the ranking. The learned weights are then
blended with the global ones by a confidence that grows with the number of usable events:
    w = w_global + strength · min(1, n / FULL_CONFIDENCE_EVENTS) · (w_learned − w_global)

Event strength: cooked 1.0, saved 0.8, viewed 0.3 (a view is a weak signal of interest).
Everything is deterministic: the same history always gives the same weights.
"""
from __future__ import annotations

import math
import random
from collections.abc import Mapping, Sequence

from .suitability import COMPONENTS, SuitabilityEngine, SuitabilityError

EVENT_WEIGHT = {"cooked": 1.0, "saved": 0.8, "viewed": 0.3}
FULL_CONFIDENCE_EVENTS = 10
MIN_EVENTS = 2
EPOCHS = 40
LEARNING_RATE = 0.15
L2 = 0.05
FLOOR = 0.02
DEFAULT_PERSONALIZATION = {"enabled": True, "strength": 0.6}
LABELS = {"coverage": "dishes you can cook with what you have", "similarity": "dishes closest to your exact selection",
          "compatibility": "ingredients that pair well together", "taste": "dishes matching your taste levels",
          "cooking": "quicker dishes"}


def personalization_settings(raw: Mapping | None) -> dict:
    s = dict(DEFAULT_PERSONALIZATION)
    if isinstance(raw, Mapping):
        if isinstance(raw.get("enabled"), bool):
            s["enabled"] = raw["enabled"]
        strength = raw.get("strength")
        if isinstance(strength, (int, float)) and math.isfinite(strength) and 0 <= strength <= 1:
            s["strength"] = float(strength)
    return s


def _vector(row: Mapping) -> list[float]:
    comps = row["components"]
    return [float(comps.get(k) or 0.0) for k in COMPONENTS]


def training_pairs(engine: SuitabilityEngine, history: Sequence[Mapping], *, tastes=None) -> tuple[list, int]:
    """(chosen − other) component differences with their event strength, and the number of usable events."""
    pairs, used = [], 0
    for event in history:
        slug, kind, ingredients = event.get("slug"), event.get("kind"), list(event.get("ingredients") or [])
        if kind not in EVENT_WEIGHT or not slug or len(ingredients) < 2:
            continue
        try:
            result = engine.recommend(ingredients[:20], tastes=tastes, limit=len(engine.recipes), weights_override=None, min_score=0.0)
        except SuitabilityError:
            continue
        rows = {r["slug"]: r for r in result["recipes"]}
        if slug not in rows or len(rows) < 2:
            continue
        used += 1
        chosen = _vector(rows[slug])
        for other_slug, row in rows.items():
            if other_slug != slug:
                pairs.append(([a - b for a, b in zip(chosen, _vector(row))], EVENT_WEIGHT[kind]))
    return pairs, used


def learn_weights(base: Mapping[str, float], pairs: list) -> dict[str, float]:
    """Pairwise logistic regression on standardised component differences.

    Components differ a lot in spread (compatibility is ~0.9 for almost every dish, coverage varies widely),
    so each difference is divided by that component's standard deviation before learning; otherwise the
    model would chase whichever correlated component happens to vary most. The learned scaled weights are
    converted back (w = w_scaled / spread) and renormalised.
    """
    total = sum(base.values()) or 1.0
    w0 = [base[k] / total for k in COMPONENTS]
    n = len(COMPONENTS)
    spread = []
    for k in range(n):
        values = [d[k] for d, _ in pairs]
        mean = sum(values) / len(values)
        sd = math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))
        spread.append(sd if sd > 1e-6 else 0.0)
    scaled = [([d[k] / spread[k] if spread[k] else 0.0 for k in range(n)], strength) for d, strength in pairs]
    v0 = [w0[k] * spread[k] for k in range(n)]
    v = list(v0)
    order = list(range(len(scaled)))
    rng = random.Random(7)
    step = LEARNING_RATE / max(1.0, len(scaled) ** 0.5)
    for _ in range(EPOCHS):
        rng.shuffle(order)
        for i in order:
            diff, strength = scaled[i]
            margin = sum(vk * dk for vk, dk in zip(v, diff))
            grad = strength / (1 + math.exp(margin)) if margin > -30 else strength
            for k in range(n):
                if spread[k]:
                    v[k] += step * (grad * diff[k] - L2 * (v[k] - v0[k]))
    w = [max(FLOOR, v[k] / spread[k]) if spread[k] else w0[k] for k in range(n)]
    s = sum(w)
    return {k: round(x / s, 4) for k, x in zip(COMPONENTS, w)}


def personalize(engine: SuitabilityEngine, history: Sequence[Mapping], settings: Mapping | None = None, *, tastes=None) -> dict:
    """Personal weights for this cook plus a plain-language summary of what changed."""
    cfg = personalization_settings(settings)
    total = sum(engine.settings["weights"].values()) or 1.0
    base = {k: round(engine.settings["weights"][k] / total, 4) for k in COMPONENTS}
    info = {"active": False, "enabled": cfg["enabled"], "strength": cfg["strength"], "events_used": 0,
            "confidence": 0.0, "base_weights": base, "weights": base, "changes": []}
    if not cfg["enabled"] or not history:
        return info
    pairs, used = training_pairs(engine, history[:30], tastes=tastes)
    info["events_used"] = used
    if used < MIN_EVENTS or not pairs:
        return info
    learned = learn_weights(base, pairs)
    confidence = round(cfg["strength"] * min(1.0, used / FULL_CONFIDENCE_EVENTS), 3)
    weights = {k: round(base[k] + confidence * (learned[k] - base[k]), 4) for k in COMPONENTS}
    changes = sorted(((k, weights[k] - base[k]) for k in COMPONENTS), key=lambda kv: -abs(kv[1]))
    info.update(active=True, confidence=confidence, weights=weights,
                changes=[{"component": k, "delta": round(d, 4), "text": f"{'More' if d > 0 else 'Less'} weight on {LABELS[k]}"}
                         for k, d in changes if abs(d) >= 0.005][:3])
    return info


def simulate(engine: SuitabilityEngine, users: int = 12, history_size: int = 10, test_size: int = 10, seed: int = 3) -> dict:
    """Simulated cooks with hidden preferences: does learning from their choices rank their next choice higher?

    Each simulated cook has random true weights. They 'cook' the top recipe under those weights for random
    selections (history), the model learns from that history, and on new selections we compare how often the
    cook's true favourite is ranked first by the global weights vs the learned personal weights.
    """
    rng = random.Random(seed)
    names = [i for i in engine.catalog if i in {l.name for r in engine.recipes for l in r.lines}]
    base = engine.settings["weights"]
    hit_global = hit_personal = trials = 0

    def favourite(query, weights):
        result = engine.recommend(query, limit=len(engine.recipes), weights_override=weights, min_score=0.0)
        return result["recipes"][0]["slug"] if result["recipes"] else None

    for _ in range(users):
        raw = [rng.gammavariate(0.6, 1) for _ in COMPONENTS]
        true = {k: v / sum(raw) for k, v in zip(COMPONENTS, raw)}
        history = []
        while len(history) < history_size:
            query = rng.sample(names, 3)
            fav = favourite(query, true)
            if fav:
                history.append({"slug": fav, "kind": "cooked", "ingredients": query})
        info = personalize(engine, history, {"enabled": True, "strength": 1.0})
        for _ in range(test_size):
            query = rng.sample(names, 3)
            fav = favourite(query, true)
            if not fav:
                continue
            trials += 1
            hit_global += favourite(query, base) == fav
            hit_personal += favourite(query, info["weights"]) == fav
    return {"users": users, "history_per_user": history_size, "test_cases": trials,
            "hit1_global": round(hit_global / trials, 4) if trials else 0.0,
            "hit1_personal": round(hit_personal / trials, 4) if trials else 0.0}
