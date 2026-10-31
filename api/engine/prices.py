"""Rough retail prices in Pakistani rupees per kilogram, for shopping-list estimates only.

These are hand-set ballpark figures for a typical Pakistani city market (not live
prices); they vary by city, season and shop. Shown in the app as "estimated".
"""
from .data import Ingredient

# Name keyword -> PKR per kg; the first match wins, otherwise the category default.
KEYWORD_PRICES: tuple[tuple[tuple[str, ...], float], ...] = (
    (("saffron", "zafran"), 600_000),
    (("pine nuts", "chilgoza"), 12_000),
    (("pistachio", "pista", "cashew", "kaju", "almond", "badam", "walnut", "akhrot", "makhana", "melon seeds", "magaz"), 4_000),
    (("cardamom", "elaichi", "mace", "javitri", "nutmeg", "jaifal", "star anise", "cloves", "laung"), 8_000),
    (("prawn",), 2_800),
    (("mutton",), 2_600),
    (("pomfret", "surmai", "hilsa", "palla"), 2_000),
    (("beef",), 1_500),
    (("fish",), 1_100),
    (("quail", "bater"), 1_800),
    (("chicken",), 750),
    (("egg",), 650),
    (("buttermilk", "lassi"), 250),
    (("desi ghee", "butter", "makhan", "cream", "malai", "qaimaq", "khoya", "cheese", "paneer"), 2_200),
    (("milk powder", "condensed"), 1_600),
    (("milk",), 230),
    (("yogurt", "dahi", "curd"), 300),
    (("ketchup", "paste", "sauce", "chutney", "pickle", "achar", "mayonnaise"), 700),
    (("garlic", "ginger"), 700),
    (("green chilli", "coriander", "mint", "pudina", "curry leaves", "dill"), 400),
    (("onion", "potato", "tomato", "cabbage", "pumpkin", "lauki", "bottle gourd"), 160),
    (("lemon", "nimbu"), 500),
    (("basmati",), 450),
    (("rice",), 300),
    (("atta", "maida", "flour", "suji", "semolina"), 160),
    (("besan",), 350),
    (("sugar", "salt"), 140),
    (("honey",), 2_000),
    (("oil", "banaspati"), 550),
    (("dal", "chana", "beans", "rajma", "lobia", "moong", "mash"), 380),
)
CATEGORY_PRICES = {
    "Meat": 1_200, "Vegetables": 220, "Fruits": 350, "Dairy": 600, "Grocery": 400,
    "Spices": 2_000, "Pulses & Nuts": 900, "Oils & Sauces": 900,
}


def price_per_kg(item: Ingredient) -> float:
    lower = item.name.lower()
    for words, price in KEYWORD_PRICES:
        if any(w in lower for w in words):
            return price
    return CATEGORY_PRICES.get(item.category, 500)


def cost_pkr(item: Ingredient, grams: float) -> float:
    return price_per_kg(item) * grams / 1000
