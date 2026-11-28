# Recommendation engine

Dish-Wish has two separate engines, both in `api/engine/`, both deterministic and explainable. Neither is a trained machine-learning model.

| Engine | Question it answers | Endpoint | Page |
| --- | --- | --- | --- |
| **Suitability** (`suitability.py`) | Which **curated recipes** suit this cook's selection, tastes, diet and allergies? | `POST /api/recommendations` | Recommendations, Recipe Details |
| **Compatibility graph** (`suitability.py` + `recommender.py`) | How well do two **ingredients** pair? | `GET /api/compatibility/{name}`, `POST /api/compatibility/check` | Ingredient Selection, graphs, admin editor |
| **Template generator** (`recipes.py`) | Write a **new** recipe from these exact ingredients | `POST /api/recipes` | "Generate a new recipe" (`/create`) |

## 1. Knowledge graph (ingredient compatibility)

- One **node** per ingredient (261 in the seed; admins can add more).
- One **edge** per stored row in `public.ingredient_compatibility` with `weight` (0–1), `relation_type` (`co-occurrence`, `complementary`, `flavour-bridge`, `contrast`, `avoid`), `evidence` text and `updated_at`.
- **Weight meaning:** 1.0 = pairs very well; 0 = should not be combined.
- **Seed edges (334)** come from co-occurrence in the 35 curated recipes: `weight = 0.5 + 0.5 × min(1, n/3)` where *n* is the number of curated recipes using both ingredients (as core ingredients). The evidence column says "used together in n curated recipes". The graph is **not** artificially complete: most of the 33,670 possible pairs have no stored edge.
- **Missing edges:** when a pair has no stored edge, the engine first looks for an edge between other forms of the same ingredients (e.g. Chicken Breast ↔ Chicken Leg Piece), then falls back to the transparent catalog heuristic in `recommender.pair_weight` (category affinity, shared cooking methods, taste similarity, taste balance). Every value says which source it came from ("catalog heuristic (no stored edge)").
- **Sync with the database:** the API reads the graph, recipes and settings from Supabase (anon key, public rows only) and caches them for 60 seconds, so admin edits reach recommendations within a minute. If Supabase is unreachable or has no published recipes yet, the bundled copy of the same seed data is used and the response says `data_source: "bundled"`.

## 2. Recipe suitability pipeline

For `POST /api/recommendations` with the cook's selection:

1. **Validate** ingredient names: 2–20 different, all known (`422` otherwise). The browser never sends a user id; the JWT identifies the cook.
2. **Load preferences**: tastes, diets and allergies are sent by the signed-in web app from the cook's own rows.
3. **Allergy exclusion (hard filter):** a recipe is dropped if any ingredient carries a blocked allergen tag or its name contains a blocked free-text word. A selected ingredient that conflicts is rejected with `422`. No score can override this.
4. **Diet filter (hard filter):** vegetarian (no meat or fish; eggs and dairy allowed), gluten-free (no `gluten` tag), low-calorie (≤ 500 kcal per serving) and high-protein (≥ 25 g protein per serving), all computed from the recipe's ingredients.
5. **Candidates:** published curated recipes that use at least one selected ingredient (cuts of the same animal and paste/whole forms count as the same).
6. **Ingredient coverage** = core ingredients the cook has (selection + pantry) ÷ core ingredients. Spices, salt, oil, ghee and sugar are *staples*: listed but never counted as missing.
7. **Graph compatibility** = mean edge weight over each distinct (selected ingredient, recipe core ingredient) pair, counting each pair of ingredient families once.
8. **Taste similarity** = `1 − mean |recipe taste − target| / 10` over the tastes the cook chose (low = 2, medium = 5, high = 8).
9. **Cooking preference** = 1 if the recipe fits the cook's time limit, otherwise falls linearly to 0 at twice the limit.
10. **Missing penalties** = `missing_penalty × max(0, missing − missing_tolerance)`, plus `main_missing_penalty` when the cook lacks the dish's main ingredient (its meat, otherwise its heaviest core ingredient). Without this, a dish could rank first just because its side ingredients matched, such as Bhindi Masala for someone who chose chicken and has no okra.
11. **Rank** by score, then fewer missing, then name.
12. **Return** the top results with every component, the weights used, the penalty and the missing list.
13. **Explain** in plain sentences (which selected ingredients it uses, the strongest pair and its evidence, taste fit, what is missing).

### Scoring formula

```
base  = Σ wᵢ · cᵢ  /  Σ wᵢ     over the components that have an input
score = clamp(base − missing_penalty · max(0, missing − tolerance) − main_missing_penalty (if the main ingredient is missing), 0, 1)
match % = round(score × 100)
```

Default weights: coverage 0.45, TF-IDF similarity 0.10, compatibility 0.30, taste 0.20, cooking 0.05; `missing_penalty` 0.03; `missing_tolerance` 3; `main_missing_penalty` 0.30; `min_score` (similarity threshold) 0.20. They add up to 1.10, and that is intended: the score divides by Σ wᵢ, so the effective shares are coverage 41%, compatibility 27%, taste 18%, similarity 9% and cooking 5% (and they re-balance the same way when a component has no input). Admins change them in **System Settings → Recommendation Engine**; the database rejects invalid values (`valid_recommendation_settings`).

- **Fallback, not fabrication:** if the cook chose no taste or time limit, that component is reported as `null` ("not used") and the remaining weights are renormalised. The response's `weights_used` shows the effective weights.
- **No double counting:** coverage already rewards having ingredients, so the penalty only applies beyond the tolerance (it represents extra shopping effort, not a second coverage term).
- These weights are design priorities (having the ingredients matters most, then pairing, then taste), not a proven optimum. Their offline retrieval accuracy is measured in [EVALUATION.md](EVALUATION.md); they have **not** been validated against real user satisfaction.

### Worked example (tested in `tests/test_suitability.py`)

Chicken Breast + Tomato, spicy = high:

- Chicken Karahi's core ingredients: chicken, tomato, ginger, garlic, green chilli, fresh coriander → coverage 2/6.
- Compatibility ≈ 0.90 (stored co-occurrence edges), taste 1.0 (karahi spicy 8 vs target 8), no time limit → cooking unused.
- 4 missing with tolerance 3 → −0.03.
- Result ≈ 62%, ranked first; suggested additions from the graph: Garlic, Ginger, Onion, Green Chilli, Fresh Coriander.

## 3. Food-safety limits

Allergen tags come from name rules in `scripts/build_seed.py` plus admin edits. They can't cover cross-contact, brand formulations or misspellings, so every recipe page says so. When data is incomplete the engine is conservative: free-text words block any ingredient whose name contains them.

## 4. Template generator (`/create`)

The original generator (`recipes.py`) writes a new recipe from the cook's exact ingredients using fixed Pakistani style templates (karahi, salan, pulao, daal tadka…), scales portions toward a calorie target and computes nutrition. Its output is labelled **Generated** in My Recipes, and it is presented as rule-based, never as generative AI.


## Additions

- **TF-IDF similarity:** the selection and each recipe are vectors over ingredient families, weighted by
  inverse document frequency across the recipe set (idf = ln((N+1)/(df+1)) + 1), and compared with cosine similarity.
  Sharing an ingredient few dishes use (okra) counts for more than sharing one almost every dish uses (onion).
- **Calorie goal:** the cook's daily goal divided by three meals caps the calories of one serving (`max_kcal`);
  dishes above it are excluded and counted in `excluded.calories`.
- **Savory:** not a catalog taste score, so it is estimated 0-10 from the share of a dish's main ingredients that
  are umami sources (meat, fish, eggs, dairy, pulses, tomato, onion, garlic, mushroom). A cook who ticks Savory gets a
  savory target of 8/10 in the taste component. The estimate is a heuristic, not a measured value.
- **Low Carb / Keto:** ≤ 30 g and ≤ 15 g carbohydrate per serving, from catalog values.

## Evaluation, personalisation and substitutes (final phase)

- **Evaluation** (`api/engine/evaluation.py`, Admin → Evaluation): leave-ingredients-out test comparing the full
  engine with random order, coverage only, graph only and no-TF-IDF; plus an allergy safety test. Results: docs/EVALUATION.md.
- **Personalised ranking** (`api/engine/personalize.py`): pairwise logistic regression on standardised component
  differences learned from the cook's own viewed/saved/cooked events, regularised toward the global weights and
  blended in by confidence. Admins can switch it off or set its strength (app setting `personalization`).
- **Substitutes** (`api/engine/substitutes.py`, `GET /api/substitutes/{name}`): group, nutrition, taste, graph
  pairing, kitchen swaps and what the cook has; allergens are never suggested.
- **Storage** (`api/core/storage.py`): Supabase Storage (migration 0009) with the user's own token; Cloudflare R2
  is used instead when all R2_* settings are present.
- **User testing**: in-app SUS survey (`/survey`, Admin → User Testing); protocol in docs/USER_TESTING.md.
