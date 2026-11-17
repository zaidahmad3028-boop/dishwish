"""Ingredient substitutes: what to use when a recipe needs something the cook does not have.

For a missing ingredient X, every other catalog ingredient Y is scored (0-1):
    0.30 · same browse group (e.g. Dairy)           + 0.10 · same cooking kind
    0.25 · nutrition similarity (cosine of kcal, protein, carbs, fat per 100 g)
    0.15 · taste similarity (sweet, salty, sour, spicy)
    0.20 · how well Y pairs with the rest of the dish (graph compatibility)
plus 0.30 when Y is another form of X (Garlic ↔ Garlic Paste), 0.20 when the cook already has Y (only if Y is a like-for-like option),
0.60 for a common kitchen swap (KITCHEN_SWAPS), 0.35 when X is mainly sour/sweet/salty/spicy and Y carries the same strong taste (Lemon → Tamarind, Vinegar;
this may cross groups), up to 0.12 for everyday ingredients (catalog priority) and 0.08 for ingredients used in
curated recipes. A flavouring that lacks X's main taste loses 0.2.
Anything that clashes with the cook's allergies or blocked words is never suggested.
"""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

from .suitability import SUBSTITUTE_GROUPS, SuitabilityEngine, family, is_staple

_FORMS = {name: set(group) for group in SUBSTITUTE_GROUPS for name in group}
# Common Pakistani kitchen swaps (from cookbook practice). Only names present in the catalog are used.
KITCHEN_SWAPS = {
    "Tomato": ("Tomato Paste", "Yogurt (Dahi)", "Tamarind (Imli)"),
    "Lemon": ("Vinegar", "Tamarind (Imli)", "Dried Mango Powder (Amchur)"),
    "Yogurt (Dahi)": ("Hung Curd (Thick Dahi)", "Buttermilk (Chaas)", "Fresh Cream (Malai)"),
    "Fresh Cream (Malai)": ("Yogurt (Dahi)", "Milk", "Butter (Makhan)"),
    "Potato": ("Sweet Potato (Shakarkandi)", "Colocasia (Arvi)"),
    "Green Chilli": ("Red Chilli Flakes (Kuti Lal Mirch)", "Red Chilli Powder", "Black Pepper"),
    "Garlic": ("Garlic Paste", "Ginger Garlic Paste"),
    "Ginger": ("Ginger Paste", "Ginger Garlic Paste"),
    "Onion": ("Spring Onion (Hara Pyaz)", "Fried Onion (Birista)"),
    "Desi Ghee": ("Butter (Makhan)", "Cooking Oil"),
    "Butter (Makhan)": ("Desi Ghee", "Cooking Oil"),
    "Fresh Coriander": ("Fresh Mint (Pudina)", "Spring Onion (Hara Pyaz)"),
    "Fresh Mint (Pudina)": ("Dried Mint (Pudina Khushk)", "Fresh Coriander"),
    "Basmati Rice": ("Sella Basmati Rice",),
    "Refined Flour (Maida)": ("Wheat Flour (Atta)",),
    "Wheat Flour (Atta)": ("Refined Flour (Maida)",),
    "Chicken Breast": ("Whole Chicken", "Mutton", "Beef"),
    "Spinach": ("Fenugreek Leaves (Methi)", "Mustard Greens (Sarson Saag)", "Bathua"),
}


def _nutrition_similarity(a, b) -> float:
    va = (a.kcal / 9, a.protein, a.carbs, a.fat)
    vb = (b.kcal / 9, b.protein, b.carbs, b.fat)
    dot = sum(x * y for x, y in zip(va, vb))
    norm = math.sqrt(sum(x * x for x in va)) * math.sqrt(sum(y * y for y in vb))
    return dot / norm if norm else 0.0


def _taste_similarity(a, b) -> float:
    return 1 - sum(abs(getattr(a, t) - getattr(b, t)) for t in ("sweet", "salty", "sour", "spicy")) / 40


def substitutes(engine: SuitabilityEngine, name: str, *, have: Iterable[str] = (), blocked: Iterable[str] = (),
                words: Sequence[str] = (), context: Iterable[str] = (), limit: int = 3) -> list[dict]:
    missing = engine.catalog[name]
    blocked, words = set(blocked), [w.casefold() for w in words]
    have_families = {family(engine.catalog[n]) for n in have if n in engine.catalog}
    context = [n for n in context if n in engine.catalog and n != name and not is_staple(engine.catalog[n])][:8]
    strong = [t for t in ("sour", "sweet", "salty", "spicy") if getattr(missing, t) >= 6]
    used = {l.name for r in engine.recipes for l in r.lines}
    out = []
    for cand in engine.catalog.values():
        if cand.name == name or family(cand) == family(missing) and cand.name not in _FORMS.get(name, ()):
            continue
        if blocked.intersection(cand.allergens) or any(w in cand.name.casefold() for w in words):
            continue
        same_group = bool(missing.group) and cand.group == missing.group
        same_kind = cand.category == missing.category
        form = cand.name in _FORMS.get(name, ())
        swap = cand.name in KITCHEN_SWAPS.get(name, ())
        shares_taste = bool(strong) and all(getattr(cand, t) >= 6 for t in strong)
        if not (same_group or same_kind or form or shares_taste or swap):
            continue
        nutrition = _nutrition_similarity(missing, cand)
        taste = _taste_similarity(missing, cand)
        pairing = (sum(engine.compatibility(cand.name, c)[0] for c in context) / len(context)) if context else 0.5
        # Owning it only helps when it is a real like-for-like option, not any vegetable that happens to be in the kitchen.
        has = family(cand) in have_families and (form or swap or shares_taste or (same_group and taste >= 0.93 and nutrition >= 0.9))
        score = (0.30 * same_group + 0.10 * same_kind + 0.25 * nutrition + 0.15 * taste + 0.20 * pairing
                 + (0.30 if form else 0) + (0.20 if has else 0) + (0.35 if shares_taste else 0) + (0.60 if swap else 0)
                 - (0.20 if strong and not (shares_taste or swap) else 0)
                 + 0.12 * (4 - min(4, max(1, cand.priority))) / 3 + (0.08 if cand.name in used else 0))
        reasons = []
        if form:
            reasons.append("another form of the same ingredient")
        elif swap:
            reasons.append("common kitchen swap")
        elif shares_taste:
            reasons.append(f"gives the same {' and '.join(strong)} taste")
        elif same_group:
            reasons.append(f"same group ({cand.group})")
        if nutrition >= 0.9:
            reasons.append("very similar nutrition")
        if taste >= 0.85:
            reasons.append("similar taste")
        if context and pairing >= 0.7:
            reasons.append("pairs well with the rest of the dish")
        if has:
            reasons.append("you already have it")
        out.append({"name": cand.name, "category": cand.group or cand.category, "score": round(max(0.0, min(score / 1.9, 1.0)), 3), "_raw": score,
                    "have": has, "reason": ", ".join(reasons) or f"same kind ({cand.category})",
                    "nutrition_similarity": round(nutrition, 3), "taste_similarity": round(taste, 3),
                    "pairing": round(pairing, 3)})
    out.sort(key=lambda r: (-r["_raw"], r["name"]))
    return [{k: v for k, v in r.items() if k != "_raw"} for r in out[:limit]]
