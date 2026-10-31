"""Cooking methods each catalog ingredient is commonly used in, in Pakistani home cooking.

Two ingredients that share more methods are more likely to end up in the same pot;
`cook_affinity` is the Jaccard overlap of their method sets. The assignments are
transparent, hand-written heuristics, not data mined from recipes.
"""
from functools import lru_cache

from .data import Ingredient

CURRY, KARAHI, PULAO, FRY, TADKA, RAW, SWEET, BAKE = "curry", "karahi", "pulao", "fry", "tadka", "raw", "sweet", "bake"
SAVOURY = frozenset({CURRY, KARAHI, PULAO, FRY, TADKA})
EVERYDAY = SAVOURY | {RAW}

# Name keywords checked in order; the first match wins. Falls back to the category default.
KEYWORDS: tuple[tuple[tuple[str, ...], frozenset[str]], ...] = (
    (("onion", "garlic", "ginger", "tomato", "green chilli", "coriander", "mint", "pudina", "curry leaves"), EVERYDAY),
    (("cardamom", "elaichi", "cinnamon", "saffron", "nutmeg", "mace", "rose water", "kewra", "poppy"), SAVOURY | {SWEET}),
    (("chaat masala", "black salt", "anardana", "tamarind", "imli", "chutney"), frozenset({RAW, FRY, CURRY})),
    (("pickle", "achar"), frozenset({RAW, CURRY})),
    (("salt",), SAVOURY | {RAW, BAKE}),
    (("sugar", "jaggery", "honey", "condensed", "custard", "khoya", "rabri", "whipped", "sago", "vermicelli", "seviyan"),
     frozenset({SWEET, BAKE})),
    (("ghee", "butter", "oil", "banaspati"), SAVOURY | {SWEET, BAKE}),
    (("yogurt", "dahi", "curd", "buttermilk", "lassi"), frozenset({CURRY, PULAO, RAW})),
    (("milk", "cream", "malai", "qaimaq"), frozenset({SWEET, CURRY, BAKE})),
    (("paneer",), frozenset({CURRY, KARAHI, FRY})),
    (("cheese", "mayonnaise", "bread", "macaroni", "spaghetti", "noodles", "ketchup", "soy sauce", "vinegar",
      "chilli garlic sauce", "corn flour", "baking"), frozenset({FRY, BAKE, RAW})),
    (("rice", "dalia", "barley"), GRAIN := frozenset({PULAO, SWEET})),
    (("atta", "maida", "flour", "besan", "suji", "semolina", "samosa", "papad"), frozenset({FRY, BAKE, SWEET})),
    (("dal", "chana", "chickpea", "beans", "rajma", "lobia", "moong", "mash", "peas", "soya"),
     PULSE := frozenset({CURRY, TADKA, PULAO, RAW})),
    (("almond", "cashew", "pistachio", "walnut", "raisin", "pine nut", "melon seeds", "makhana", "apricot", "coconut",
      "dates", "fig"), frozenset({SWEET, PULAO, RAW})),
    (("egg",), frozenset({CURRY, FRY, BAKE})),
    (("fish", "prawn"), frozenset({CURRY, FRY})),
    (("tea",), frozenset({SWEET})),
)
CATEGORY_DEFAULT = {
    "Meat": frozenset({CURRY, KARAHI, PULAO, FRY}),
    "Vegetables": frozenset({CURRY, KARAHI, FRY, PULAO}),
    "Fruits": frozenset({RAW, SWEET}),
    "Dairy": frozenset({SWEET, CURRY}),
    "Grocery": frozenset({FRY, BAKE}),
    "Spices": SAVOURY,
    "Pulses & Nuts": frozenset({SWEET, RAW}),
    "Oils & Sauces": SAVOURY,
}


@lru_cache(maxsize=None)
def methods_for(name: str, category: str) -> frozenset[str]:
    lower = name.lower()
    for words, methods in KEYWORDS:
        if methods is PULSE and category not in ("Pulses & Nuts", "Grocery"):
            continue  # "Green Beans", "Dill (Soya)" are vegetables, not pulses
        if any(w in lower for w in words):
            return methods
    return CATEGORY_DEFAULT.get(category, SAVOURY)


def _main_kind(item: Ingredient) -> str | None:
    """Two proteins, two grains or two pulses share methods but rarely share a pot."""
    if item.category == "Meat":
        return "protein"
    methods = methods_for(item.name, item.category)
    if methods is GRAIN:
        return "grain"
    if methods is PULSE and item.category == "Pulses & Nuts":
        return "pulse"
    return None


def cook_affinity(left: Ingredient, right: Ingredient) -> float:
    a, b = methods_for(left.name, left.category), methods_for(right.name, right.category)
    overlap = len(a & b) / len(a | b)
    kind = _main_kind(left)
    return overlap * .5 if kind and kind == _main_kind(right) else overlap
