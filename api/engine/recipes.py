"""Deterministic Pakistani home-style recipes built from chosen catalog ingredients.

Each recipe is a style template (karahi, salan, daal...) filled with the user's
ingredients plus pantry staples, adjusted for taste levels, filtered by the
allergen shield, and portioned toward a per-meal calorie target. Nutrition is
summed from the catalog's per-100 g values, so it is only as good as that data.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import hashlib
import json
import math
from string import Formatter

from .data import ALLERGENS, TASTES, Ingredient, load_ingredients
from .prices import cost_pkr, price_per_kg
from .recommender import get_recommender

LEVELS = ("low", "medium", "high")
TIER_KCAL = {"low": 1200, "medium": 1500, "high": 1800}
TASTE_TARGETS = {"low": 2.0, "medium": 5.0, "high": 8.0}
MEALS_PER_DAY = 3

# Kind of a main ingredient decides which styles fit it; earlier kinds win as the main.
KIND_ORDER = ("red_meat", "poultry", "seafood", "egg", "paneer", "pulse", "fruit", "yogurt", "milk",
              "veg", "grain", "flour", "nut", "other")
MAIN_GRAMS = {"red_meat": 150, "poultry": 160, "seafood": 150, "egg": 100, "paneer": 100, "pulse": 60,
              "veg": 150, "grain": 75, "fruit": 150, "yogurt": 150, "milk": 250, "flour": 50, "nut": 25, "other": 60}
EXTRA_GRAMS = {"red_meat": 60, "poultry": 60, "seafood": 60, "egg": 50, "paneer": 50, "pulse": 30, "veg": 70,
               "grain": 40, "fruit": 60, "yogurt": 40, "milk": 80, "flour": 20, "nut": 10, "other": 15}
SEASONING_GRAMS = {"Spices": 2, "Oils & Sauces": 10}
# Grocery items that only season a dish; they can't be its main ingredient.
GROCERY_SEASONINGS = frozenset({"Salt", "White Sugar", "Jaggery (Gur)", "Honey", "Tamarind (Imli)", "Vinegar",
                                "Soy Sauce", "Tomato Ketchup", "Baking Powder", "Baking Soda", "Rose Water (Gulab Jal)",
                                "Kewra Water", "Tea Leaves (Chai Patti)", "Custard Powder", "Fried Onion (Birista)"})


def seasoning_grams(item: Ingredient) -> float | None:
    if item.name in GROCERY_SEASONINGS:
        return 5
    return SEASONING_GRAMS.get(item.category)


def kind_of(item: Ingredient) -> str:
    name = item.name.lower()
    if item.category == "Meat":
        if "egg" in name:
            return "egg"
        if any(w in name for w in ("fish", "prawn")):
            return "seafood"
        if any(w in name for w in ("chicken", "quail")):
            return "poultry"
        return "red_meat"
    if item.category == "Pulses & Nuts":
        return "pulse" if any(w in name for w in ("dal", "chana", "chickpea", "beans", "rajma", "lobia", "moong", "mash", "peas", "soya")) else "nut"
    if item.category == "Vegetables":
        return "veg"
    if item.category == "Fruits":
        return "fruit"
    if item.category == "Dairy":
        if "paneer" in name:
            return "paneer"
        if any(w in name for w in ("yogurt", "curd", "dahi")):
            return "yogurt"
        return "milk"
    if item.category == "Grocery":
        if any(w in name for w in ("rice", "dalia", "barley")):
            return "grain"
        if any(w in name for w in ("flour", "atta", "besan", "suji")):
            return "flour"
    return "other"


@dataclass(frozen=True)
class Staple:
    role: str  # fat | base | aromatic | heat | spice | salt | garnish | sour | bulk | sweet | liquid
    options: tuple[str, ...]  # first allowed option is used
    grams: float


S = Staple
OIL = S("fat", ("Cooking Oil", "Sunflower Oil", "Desi Ghee"), 10)
ONION = S("base", ("Onion", "Spring Onion (Hara Pyaz)"), 50)
TOMATO = S("base", ("Tomato",), 50)
GG = S("aromatic", ("Ginger Garlic Paste", "Garlic Paste", "Garlic", "Ginger Paste", "Ginger"), 8)
CHILLI = S("heat", ("Green Chilli",), 5)
RED = S("spice", ("Red Chilli Powder", "Kashmiri Chilli Powder"), 2)
HALDI = S("spice", ("Turmeric (Haldi)",), 1)
DHANIA = S("spice", ("Coriander Powder",), 1.5)
GARAM = S("spice", ("Garam Masala",), 1)
ZEERA = S("spice", ("Cumin (Zeera)",), 1)
SALT = S("salt", ("Salt",), 1.5)
CORIANDER = S("garnish", ("Fresh Coriander", "Fresh Mint (Pudina)"), 4)
LEMON = S("sour", ("Lemon", "Tamarind (Imli)", "Vinegar"), 10)
YOGURT = S("sour", ("Yogurt (Dahi)", "Hung Curd (Thick Dahi)"), 40)
RICE = S("bulk", ("Basmati Rice", "Sella Basmati Rice"), 75)
BESAN = S("bulk", ("Gram Flour (Besan)", "Rice Flour", "Corn Flour"), 30)
CHAAT = S("spice", ("Chaat Masala", "Black Salt (Kala Namak)"), 1.5)
SUGAR = S("sweet", ("White Sugar", "Jaggery (Gur)", "Honey"), 12)
MILK = S("liquid", ("Milk",), 200)
ELAICHI = S("spice", ("Green Cardamom (Elaichi)",), 0.5)


@dataclass(frozen=True)
class Style:
    key: str
    title: str  # {main} is replaced with the main ingredient's short name
    kinds: tuple[str, ...]
    minutes: int
    staples: tuple[Staple, ...]
    steps: tuple[tuple[tuple[str, ...], str], ...]  # (roles required, text template)
    sweet_dish: bool = False


STYLES = (
    Style("karahi", "{main} Karahi", ("red_meat", "poultry", "paneer"), 40,
          (OIL, TOMATO, GG, CHILLI, RED, HALDI, DHANIA, GARAM, SALT, CORIANDER), (
        (("fat",), "Heat {fat} in a karahi (wok) on high heat."),
        ((), "Add {main} and sear for 5–6 minutes until it changes colour."),
        (("aromatic",), "Stir in {aromatic} and cook for 1 minute."),
        (("base",), "Add {base} and cook on high heat, crushing them, until the oil separates (8–10 minutes)."),
        (("spice",), "Add {spice} and {salt}; bhuno (stir-fry) for 2 minutes."),
        (("extras",), "Fold in {extras} and cook until tender."),
        ((), "Cover and cook on low heat until {main} is fully cooked and tender."),
        (("heat",), "Add slit {heat} and cook 1 more minute."),
        (("sour",), "Finish with {sour}."),
        (("garnish",), "Garnish with {garnish} and serve hot."),
    )),
    Style("salan", "{main} Salan", ("red_meat", "poultry", "seafood", "egg", "veg"), 45,
          (OIL, ONION, TOMATO, GG, RED, HALDI, DHANIA, GARAM, SALT, YOGURT, CORIANDER), (
        (("fat", "base"), "Heat {fat} and fry {base} until soft and golden."),
        (("aromatic",), "Add {aromatic} and cook for 1 minute."),
        (("spice",), "Add {spice} and {salt} with a splash of water; bhuno for 3 minutes."),
        (("sour",), "Stir in {sour} on low heat."),
        ((), "Add {main} and coat well in the masala."),
        (("extras",), "Add {extras}."),
        ((), "Pour in 1–2 cups of water, cover and simmer until {main} is cooked and the gravy thickens."),
        (("garnish",), "Garnish with {garnish}. Serve with roti or rice."),
    )),
    Style("pulao", "{main} Pulao", ("red_meat", "poultry", "veg", "grain", "pulse"), 50,
          (RICE, OIL, ONION, GG, ZEERA, GARAM, SALT, YOGURT, CHILLI), (
        (("bulk",), "Wash {bulk} and soak for 30 minutes."),
        (("fat", "base"), "Heat {fat} and fry {base} until deep golden."),
        (("spice",), "Add {spice} and let them crackle."),
        (("aromatic",), "Add {aromatic} and stir for 1 minute."),
        ((), "Add {main} and cook for 5 minutes."),
        (("extras",), "Add {extras}."),
        (("sour",), "Stir in {sour} and {salt}."),
        (("bulk",), "Add the drained {bulk} and water to cover by 2 cm; boil until the water dries."),
        (("heat",), "Lay {heat} on top, cover tightly and steam (dum) on very low heat for 15 minutes."),
        ((), "Fluff gently and serve."),
    )),
    Style("masala_fry", "{main} Masala Fry", ("seafood",), 25,
          (OIL, GG, RED, HALDI, ZEERA, SALT, LEMON, BESAN, CORIANDER), (
        (("aromatic", "spice"), "Marinate {main} with {aromatic}, {spice} and {salt} for 20 minutes."),
        (("bulk",), "Dust lightly with {bulk}."),
        (("fat",), "Shallow-fry in hot {fat}, 3–4 minutes a side, until crisp."),
        (("sour",), "Squeeze over {sour}."),
        (("garnish",), "Serve garnished with {garnish}."),
    )),
    Style("bhurji", "Anda Bhurji", ("egg",), 15,
          (OIL, ONION, TOMATO, CHILLI, HALDI, RED, SALT, CORIANDER), (
        (("fat", "base"), "Heat {fat} and soften {base}."),
        (("spice",), "Add {spice} and {salt}."),
        (("heat",), "Add chopped {heat}."),
        (("extras",), "Stir in {extras}."),
        ((), "Pour in beaten {main} and scramble on low heat until just set."),
        (("garnish",), "Top with {garnish}; serve with paratha."),
    )),
    Style("daal", "{main} Tadka", ("pulse",), 40,
          (HALDI, SALT, OIL, ZEERA, GG, TOMATO, CHILLI, RED, CORIANDER), (
        ((), "Wash {main}, then boil in 3 cups of water with {spice} and {salt} until soft."),
        (("extras",), "Add {extras} halfway through."),
        (("fat",), "For the tadka, heat {fat} in a small pan."),
        (("aromatic",), "Fry {aromatic} until fragrant."),
        (("base",), "Add {base} and cook until soft."),
        (("heat",), "Add {heat}, then pour the sizzling tadka over the daal."),
        (("garnish",), "Garnish with {garnish}."),
    )),
    Style("khichdi", "{main} Khichdi", ("pulse", "grain"), 35,
          (RICE, OIL, ZEERA, HALDI, SALT, GG, YOGURT), (
        (("bulk",), "Wash {main} and {bulk} together and soak for 20 minutes."),
        (("fat", "spice"), "Heat {fat}, crackle {spice}, then add {aromatic}."),
        (("extras",), "Add {extras}."),
        ((), "Add the drained {main}, {salt} and 4 cups of water; simmer until soft and creamy."),
        (("sour",), "Serve with {sour} on the side."),
    )),
    Style("bhuna", "Bhuna {main}", ("veg", "paneer", "flour", "nut", "other"), 30,
          (OIL, ONION, TOMATO, GG, ZEERA, HALDI, RED, DHANIA, SALT, CORIANDER), (
        (("fat", "spice"), "Heat {fat} and crackle {spice}."),
        (("base",), "Add {base} and cook until soft."),
        (("aromatic",), "Add {aromatic} and {salt}."),
        ((), "Add {main}, cover and cook on low heat until tender, stirring now and then."),
        (("extras",), "Add {extras}."),
        ((), "Uncover and bhuno on high heat until dry and glossy."),
        (("garnish",), "Garnish with {garnish}."),
    )),
    Style("pakora", "{main} Pakoray", ("veg", "paneer"), 25,
          (BESAN, SALT, RED, ZEERA, CHILLI, CORIANDER, OIL), (
        (("bulk",), "Mix {bulk} with {spice}, {salt} and a little water into a thick batter."),
        ((), "Add sliced {main} and coat well."),
        (("extras",), "Fold in {extras}."),
        (("heat",), "Add chopped {heat} and {garnish}."),
        (("fat",), "Fry spoonfuls in hot {fat} until golden and crisp. Drain on paper."),
    )),
    Style("chaat", "{main} Chaat", ("fruit", "pulse"), 10,
          (CHAAT, LEMON, ONION, CORIANDER), (
        ((), "Chop {main} into bite-sized pieces."),
        (("extras",), "Toss with {extras}."),
        (("base",), "Add finely chopped {base}."),
        (("spice",), "Sprinkle {spice}."),
        (("sour",), "Squeeze over {sour}."),
        (("garnish",), "Top with {garnish} and serve chilled."),
    )),
    Style("lassi", "{main} Lassi", ("fruit",), 5,
          (YOGURT, SUGAR, ELAICHI), (
        ((), "Blend {main} until smooth."),
        (("sour",), "Add {sour} and {sweet}; blend again until frothy."),
        (("extras",), "Add {extras}."),
        (("spice",), "Finish with a pinch of {spice}; serve cold."),
    ), sweet_dish=True),
    Style("raita", "{main} Raita", ("yogurt",), 10,
          (ZEERA, SALT, CORIANDER, CHAAT), (
        ((), "Whisk {main} until smooth."),
        (("extras",), "Stir in finely chopped {extras}."),
        (("spice",), "Season with {spice} and {salt}."),
        (("garnish",), "Garnish with {garnish}; chill before serving."),
    )),
    Style("kheer", "{main} Kheer", ("milk", "grain"), 50,
          (MILK, RICE, SUGAR, ELAICHI), (
        (("liquid",), "Bring {liquid} to a boil in a heavy pan."),
        (("bulk",), "Add washed {bulk} and simmer on low heat, stirring often, for 35–40 minutes."),
        ((), "Add {main}."),
        (("sweet",), "Stir in {sweet} and {spice}; cook until thick and creamy."),
        (("extras",), "Fold in {extras}."),
        ((), "Serve warm or chilled."),
    ), sweet_dish=True),
)


def short_name(name: str) -> str:
    """'Okra (Bhindi)' -> 'Bhindi' (the everyday name), 'Chicken Breast' -> 'Chicken Breast'."""
    if "(" in name and name.endswith(")"):
        return name[name.index("(") + 1:-1]
    return name


def format_grams(grams: float) -> str:
    return f"{grams:g} g" if grams < 1000 else f"{grams / 1000:g} kg"


def join(names: Sequence[str], grams: Mapping[str, float] | None = None) -> str:
    words = [n.lower() if n != n.upper() else n for n in names]
    if grams:
        words = [f"{w} ({format_grams(grams[n])})" for n, w in zip(names, words)]
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def round_grams(grams: float) -> float:
    if grams >= 20:
        return float(round(grams / 5) * 5)
    if grams >= 3:
        return float(round(grams))
    return max(0.5, round(grams * 2) / 2)


class RecipeError(ValueError):
    pass


class RecipeEngine:
    def __init__(self, ingredients: Sequence[Ingredient]):
        self.catalog = {i.name: i for i in ingredients}
        self.canonical = {i.name.casefold(): i.name for i in ingredients}

    def _allowed(self, item: Ingredient, tags: set[str], words: Sequence[str]) -> bool:
        lower = item.name.lower()
        return not tags.intersection(item.allergens) and not any(w in lower for w in words)

    def generate(self, selected: Sequence[str], *, tastes: Mapping[str, str | None] | None = None,
                 allergens: Sequence[str] = (), blocked_words: Sequence[str] = (),
                 calorie_tier: str | None = None, servings: int = 2, limit: int = 3) -> dict:
        if not 1 <= len(selected) <= 12:
            raise RecipeError("Choose 1–12 ingredients")
        if not 1 <= servings <= 8 or not 1 <= limit <= 5:
            raise RecipeError("Servings must be 1–8 and limit 1–5")
        tags = set(allergens)
        if not tags <= ALLERGENS:
            raise RecipeError("Unknown allergen tag")
        tastes = {t: v for t, v in (tastes or {}).items() if v is not None}
        if any(t not in TASTES or v not in LEVELS for t, v in tastes.items()):
            raise RecipeError("Taste levels must be low, medium or high")
        if calorie_tier is not None and calorie_tier not in TIER_KCAL:
            raise RecipeError("Unknown calorie tier")
        words = [w.strip().lower() for w in blocked_words if w.strip()]

        chosen: list[Ingredient] = []
        for raw in selected:
            name = self.canonical.get(raw.strip().casefold())
            if name is None:
                raise RecipeError(f"Unknown ingredient: {raw}")
            item = self.catalog[name]
            if item in chosen:
                raise RecipeError("Ingredients must be distinct")
            if not self._allowed(item, tags, words):
                raise RecipeError(f"{name} is blocked by your allergen shield")
            chosen.append(item)

        mains = [i for i in chosen if seasoning_grams(i) is None]
        if not mains:
            raise RecipeError("Add at least one main ingredient (not only spices or oils)")
        main = min(mains, key=lambda i: KIND_ORDER.index(kind_of(i)))
        kind = kind_of(main)
        meal_kcal = TIER_KCAL[calorie_tier] / MEALS_PER_DAY if calorie_tier else None

        recipes = []
        for style in (s for s in STYLES if kind in s.kinds):
            recipe = self._build(style, main, kind, chosen, tags, words, tastes, meal_kcal, servings)
            if recipe:
                recipes.append(recipe)
            if len(recipes) == limit:
                break
        if not recipes:
            raise RecipeError("No recipe fits these ingredients with your allergen shield")

        suggestions = []
        try:
            targets = {t: TASTE_TARGETS[v] for t, v in tastes.items()}
            for row in get_recommender().recommend([i.name for i in chosen], taste_preferences=targets,
                                                   excluded_allergens=sorted(tags), limit=50):
                item = self.catalog[row["name"]]
                if (self._allowed(item, tags, words) and seasoning_grams(item) is None
                        and item.category != main.category):
                    suggestions.append(row["name"])
                if len(suggestions) == 3:
                    break
        except ValueError:
            pass
        return {"recipes": recipes, "suggestions": suggestions}

    def _pick(self, staple: Staple, tags: set[str], words: Sequence[str], used: set[str]) -> Ingredient | None:
        for option in staple.options:
            item = self.catalog.get(option)
            if item and option not in used and self._allowed(item, tags, words):
                return item
        return None

    def _build(self, style: Style, main: Ingredient, kind: str, chosen: Sequence[Ingredient], tags: set[str],
               words: Sequence[str], tastes: Mapping[str, str], meal_kcal: float | None, servings: int) -> dict | None:
        # rows: name -> [role, grams per serving, scalable]
        rows: dict[str, list] = {main.name: ["main", MAIN_GRAMS[kind], True]}
        extras = []
        for item in chosen:
            if item is main:
                continue
            if (grams := seasoning_grams(item)) is not None:
                lower = item.name.lower()
                if item.category == "Oils & Sauces" and not any(w in lower for w in ("oil", "ghee")):
                    rows[item.name] = ["extras", 15, False]  # sauces, pastes, chutneys, pickles
                    extras.append(item.name)
                else:
                    rows[item.name] = ["fat" if item.category == "Oils & Sauces" else "spice", grams, False]
            else:
                rows[item.name] = ["extras", EXTRA_GRAMS[kind_of(item)], True]
                extras.append(item.name)

        used = set(rows)
        for staple in style.staples:
            if staple.role in ("fat", "salt") and any(r[0] == staple.role for r in rows.values()):
                continue
            # The user already chose this staple (e.g. Onion): give it the staple's role and portion.
            mine = next((o for o in staple.options if o in rows and rows[o][0] == "extras"), None)
            if mine:
                rows[mine] = [staple.role, staple.grams, staple.role == "bulk"]
                extras.remove(mine)
                continue
            item = self._pick(staple, tags, words, used)
            if item is None:
                if staple.role == "bulk":
                    return None  # e.g. pulao without any allowed rice
                continue
            used.add(item.name)
            rows[item.name] = [staple.role, staple.grams, staple.role == "bulk"]

        # Taste adjustments.
        spicy, sour, salty, sweet = (tastes.get(t) for t in ("spicy", "sour", "salty", "sweet"))
        heat_names = [n for n, r in rows.items() if r[0] == "heat" or n in ("Red Chilli Powder", "Kashmiri Chilli Powder")]
        if spicy == "low":
            for n in heat_names:
                if rows[n][0] == "heat":
                    del rows[n]
                else:
                    rows[n][1] *= .5
        elif spicy == "high" and not style.sweet_dish:
            for n in heat_names:
                rows[n][1] *= 1.6
            if not heat_names and (extra := self._pick(CHILLI, tags, words, set(rows))):
                rows[extra.name] = ["heat", 5, False]
        if sour == "high" and not any(r[0] == "sour" for r in rows.values()) and not style.sweet_dish:
            if extra := self._pick(LEMON, tags, words, set(rows)):
                rows[extra.name] = ["sour", 10, False]
        elif sour == "low":
            for r in rows.values():
                if r[0] == "sour":
                    r[1] *= .5
        for r in rows.values():
            if r[0] == "salt":
                r[1] *= {"low": .6, "high": 1.3}.get(salty, 1)
            if r[0] == "sweet":
                r[1] *= {"low": .6, "high": 1.4}.get(sweet, 1)

        def kcal(grams_of: Mapping[str, float]) -> float:
            return sum(self.catalog[n].kcal * g / 100 for n, g in grams_of.items())

        scale = 1.0
        if meal_kcal:
            fixed = kcal({n: r[1] for n, r in rows.items() if not r[2]})
            flexible = kcal({n: r[1] for n, r in rows.items() if r[2]})
            if flexible > 0:
                scale = min(1.6, max(.6, (meal_kcal - fixed) / flexible))

        ingredients = []
        totals = dict.fromkeys(("kcal", "protein", "carbs", "fat"), 0.0)
        chosen_names = {c.name for c in chosen}
        for name, (role, grams, scalable) in rows.items():
            total_g = round_grams(grams * (scale if scalable else 1) * servings)
            item = self.catalog[name]
            macros = {key: round(getattr(item, key) * total_g / 100, 1) for key in totals}
            for key in totals:
                totals[key] += getattr(item, key) * total_g / 100
            ingredients.append({"name": name, "category": item.category, "grams": total_g,
                                "role": "main" if role == "main" else ("yours" if name in chosen_names else role),
                                **macros, "allergens": list(item.allergens),
                                "price_pkr_per_kg": price_per_kg(item), "cost_pkr": round(cost_pkr(item, total_g))})
        order = {"main": 0, "yours": 1, "bulk": 2, "liquid": 2, "base": 3, "aromatic": 4, "sour": 5, "sweet": 5,
                 "heat": 6, "fat": 7, "spice": 8, "salt": 9, "garnish": 10}
        ingredients.sort(key=lambda r: (order.get(r["role"], 5), r["name"]))
        grams_of = {i["name"]: i["grams"] for i in ingredients}

        names_by_role: dict[str, list[str]] = {}
        for name, (role, _, _) in rows.items():
            names_by_role.setdefault(role, []).append(name)
        main_word = "eggs" if kind == "egg" else short_name(main.name).lower()
        plain = {role: join(names) for role, names in names_by_role.items() if role != "main"}
        # The first mention of each role in the method carries its real quantity.
        with_qty = {role: join(names, grams_of) for role, names in names_by_role.items() if role != "main"}
        plain["main"], with_qty["main"] = main_word, f"{main_word} ({format_grams(grams_of[main.name])})"
        if extras and "extras" not in plain:
            plain["extras"], with_qty["extras"] = join(extras), join(extras, grams_of)
        present = set(plain)  # steps that need a missing role are dropped; defaults only fill wording
        for role, default in (("salt", "salt"), ("aromatic", "the aromatics"), ("spice", "the spices"),
                              ("garnish", "fresh herbs"), ("sweet", "sugar")):
            plain.setdefault(role, default)
            with_qty.setdefault(role, default)
        steps, mentioned = [], set()
        for needs, text in style.steps:
            if not all(n in present for n in needs):
                continue
            fields = {}
            for _, field, _, _ in Formatter().parse(text):
                if field:
                    fields[field] = plain[field] if field in mentioned else with_qty[field]
                    mentioned.add(field)
            step = text.format(**fields)
            steps.append(step[0].upper() + step[1:])

        per_serving = {k: round(v / servings, 1) for k, v in totals.items()}
        per_serving["kcal"] = round(totals["kcal"] / servings)
        title = style.title.format(main="Anda" if kind == "egg" else short_name(main.name))
        if kind == "milk" and style.key == "kheer":
            title = "Doodh ki Kheer"
        fingerprint = hashlib.sha256(json.dumps(
            [style.key, servings, sorted((i["name"], i["grams"]) for i in ingredients)]).encode()).hexdigest()[:24]
        taste = self._taste(ingredients, servings)
        total_cost = sum(i["cost_pkr"] for i in ingredients)
        return {
            "title": title, "style": style.key, "servings": servings, "minutes": style.minutes,
            "ingredients": ingredients, "steps": steps,
            "nutrition": {"per_serving": per_serving,
                          "total": {k: round(v, 1) for k, v in totals.items()},
                          "meal_target_kcal": round(meal_kcal) if meal_kcal else None},
            "taste": taste,
            "match": self._match(main, ingredients, taste, tastes),
            "allergens": {"contains": sorted({t for i in ingredients for t in i["allergens"]}),
                          "avoided": sorted(tags), "blocked_words": list(words)},
            "cost": {"total_pkr": round(total_cost), "per_serving_pkr": round(total_cost / servings)},
            "fingerprint": fingerprint,
        }

    def _taste(self, ingredients: Sequence[dict], servings: int) -> dict[str, float]:
        """0-10 perceived intensity per taste.

        Each ingredient contributes its catalog intensity scaled by how much of it is in one
        serving relative to a "fully tasted" amount (5 g of a spice, 20 g of a seasoning or
        sour/heat ingredient, 60 g of anything else). Contributions combine like independent
        chances, 1 - prod(1 - c), so several mild sources add up without passing 10.
        """
        out = {}
        for t in TASTES:
            remaining = 1.0
            for row in ingredients:
                item = self.catalog[row["name"]]
                if item.category == "Spices" or item.name == "Salt":
                    full = 5
                elif (item.category == "Oils & Sauces" or item.name in GROCERY_SEASONINGS
                      or row["role"] in ("heat", "sour", "sweet")):
                    full = 20
                else:
                    full = 60
                remaining *= 1 - getattr(item, t) / 10 * min(1.0, row["grams"] / servings / full)
            out[t] = round(10 * (1 - remaining), 1)
        return out

    def _match(self, main: Ingredient, ingredients: Sequence[dict], taste: Mapping[str, float],
               tastes: Mapping[str, str]) -> dict:
        """Matching rate: cosine similarity to the user's taste targets plus mean NetworkX edge weight to the main."""
        graph = get_recommender().graph
        others = [i["name"] for i in ingredients if i["name"] != main.name]
        pairing = sum(graph[main.name][n]["weight"] for n in others) / len(others) if others else 1.0
        cosine = None
        if tastes:
            target = [TASTE_TARGETS[tastes[t]] if t in tastes else taste[t] for t in TASTES]
            actual = [taste[t] for t in TASTES]
            norm = math.hypot(*target) * math.hypot(*actual)
            cosine = sum(a * b for a, b in zip(target, actual)) / norm if norm else 0.0
        percent = round(100 * (pairing if cosine is None else .5 * cosine + .5 * pairing))
        return {"percent": percent, "pairing": round(pairing, 3),
                "taste_similarity": None if cosine is None else round(cosine, 3)}


_engine: RecipeEngine | None = None


def get_recipe_engine() -> RecipeEngine:
    global _engine
    if _engine is None:
        _engine = RecipeEngine(load_ingredients())
    return _engine
