# DishWish ingredient dataset

`supabase/seed/ingredients.csv` is the single source of truth for the 260 ingredients used by the app, the database seed and the API engine.

## Columns

| Column | Type | Meaning |
| --- | --- | --- |
| `category` | text | One of 8 groups: Meat (38), Vegetables (43), Fruits (33), Dairy (18), Grocery (36), Spices (42), Pulses & Nuts (28), Oils & Sauces (22) |
| `name` | text | Unique English name, with the common Urdu/Pakistani name in parentheses where useful, e.g. `Okra (Bhindi)` |
| `kcal` | number ≥ 0 | Energy per 100 g (edible, raw/as sold unless the name says otherwise) |
| `protein` | number ≥ 0 | Grams of protein per 100 g |
| `carbs` | number ≥ 0 | Grams of carbohydrate per 100 g |
| `fat` | number ≥ 0 | Grams of fat per 100 g |
| `sweet`, `salty`, `sour`, `spicy` | integer 0–10 | Perceived taste intensity of the ingredient on its own |
| `priority` | integer 1–5 | How common the ingredient is in Pakistani home kitchens (5 = staple); used only as a tie-breaker |

Derived, not stored in the CSV:

- **`allergens`**: 19 tags (milk, gluten, eggs, peanuts, tree_nuts, sesame, fish, shellfish, soy, mustard, legumes, tomato, brinjal, mango, citrus, banana, strawberry, coconut, corn). `scripts/build_seed.py` assigns them by word-start name rules plus category rules (e.g. Dairy → milk except Coconut Milk; daal/chana/beans in Pulses → legumes). Tests list the exact rows for each newer tag.
- **Cooking methods** (`api/engine/cooking.py`) and **PKR prices** (`api/engine/prices.py`): hand-written heuristics keyed on names and categories.

## How the values were compiled

Nutrition per 100 g values are typical published food-composition values for the closest matching raw ingredient. Taste intensities and priorities are editorial judgements for Pakistani home cooking. The values were compiled with AI assistance and then validated by hand on a sample of rows against published references. They are **approximate**: real values vary with variety, cut, brand, ripeness and cooking method. Do not use them for medical or clinical purposes.

## Preprocessing

`scripts/build_seed.py` and `scripts/build_engine_data.py` validate every row before generating anything:

- exact column order; no missing or extra fields; whitespace trimmed;
- unique names (case-insensitive);
- finite, non-negative numbers; tastes are integers 0–10 and priority an integer 1–5;
- numbers are normalised to plain decimals.

From the validated CSV they generate:

- `supabase/seed/seed.sql`: idempotent upserts by name (re-runnable, keeps IDs);
- `supabase/migrations/0004_allergen_tags.sql`: UPDATE-only allergen re-tagging for existing databases;
- `api/engine/ingredients.json`: the catalog bundled with the API.

Tests (`tests/test_seed.py`, `tests/test_recommender.py`) fail if any generated file is out of sync with the CSV.

## License

The dataset is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Credit "DishWish ingredient dataset" and link to this repository.
