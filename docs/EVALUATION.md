# Recommender evaluation

All numbers come from `api/engine/evaluation.py` and `api/engine/personalize.py` (deterministic; rerun with
`cd api && python -m engine.evaluation`). The Super Admin sees the same report live on **Admin → Evaluation**.

## 1. Offline accuracy (leave-ingredients-out)

Protocol: for each of the 82 curated recipes, keep its main ingredient plus a random half of its other main
ingredients, give only those to each method, rank all recipes, and record where the real recipe lands.
Three random seeds → 243 test cases.

| Method | Top 1 | Top 3 | Top 5 | MRR |
|---|---|---|---|---|
| Random order (baseline) | 3.3% | 13.2% | 17.3% | 0.131 |
| Graph only (NetworkX pairing) | 57.6% | 88.9% | 94.7% | 0.738 |
| Coverage only | 81.1% | 96.3% | 98.4% | 0.888 |
| Full engine without TF-IDF | 82.3% | 96.7% | 99.2% | 0.896 |
| **Full engine** | **82.7%** | **97.5%** | **99.2%** | **0.904** |

- The full engine is the best method and finds the right recipe in the top 5 in 99.2% of cases,
  **5.7 times** the random baseline.
- Each component adds something: the graph alone is weaker, coverage is strong, and TF-IDF similarity lifts
  Top-1/Top-3 and MRR on top of the other components.
- Limitation: the recipes come from our own catalogue, so this measures retrieval accuracy, not taste.
  Real user ratings (see USER_TESTING.md) complete the picture.

## 2. Allergy safety

40 random allergy profiles (1–3 allergens each) × random selections: **0 of 101** returned recipes contained
an excluded allergen. Allergens are a hard filter, applied before scoring, and personal weights cannot bypass it.

## 3. Personalised ranking (simulated cooks)

12 simulated cooks with hidden, random preferences each "cook" the top recipe (under their own preferences)
for 10 random selections. The model learns from those choices (pairwise logistic regression on standardised
component differences) and then predicts each cook's favourite for 10 new selections (116 cases).

| Weights used | First-choice accuracy |
|---|---|
| Global weights | 89.7% |
| **Learned personal weights** | **91.4%** |

Across four different random seeds (387 cases) the result was 89.3% → 91.6%, and personal weights won for every seed.
The improvement is modest, as expected when the global weights are already good; it grows with more history.

## 4. Ingredient substitutes

Rule-and-graph scoring (`api/engine/substitutes.py`): same group, nutrition and taste similarity, pairing with the
rest of the dish, known kitchen swaps, and what the cook already has. Allergens are never suggested. Examples:
Lemon → Amchur / Imli / Vinegar · Spinach → Sarson / Bathua / Methi · Yogurt → Hung Curd / Malai / Buttermilk.
