# Dish-Wish · Dream Recipe Creation

A kitchen assistant for Pakistani homes, with two experiences: a **Registered User** dashboard (Kitchen → Ingredient Selection → Recommendations → Recipe Details → My Recipes, plus Pantry, Profile and Settings) and a **Super Admin** panel (dashboard, users, ingredients and compatibility graph, recipes, analytics, feedback, system settings and audit log).

- Start here: [PROJECT_STATUS.md](PROJECT_STATUS.md) · [docs/SETUP.md](docs/SETUP.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATABASE.md](docs/DATABASE.md) · [docs/API.md](docs/API.md) · [docs/RECOMMENDATION_ENGINE.md](docs/RECOMMENDATION_ENGINE.md) · [docs/TESTING.md](docs/TESTING.md)

The original kitchen assistant: Tell it what's on your counter, and it suggests what pairs well and cooks up recipes that fit your taste, allergen shield and calorie target. Recipes come with real quantities, nutrition, an estimated PKR shopping list, a share link and a PDF. Recipes are rule-based and deterministic; no external language model is used.

## Architecture

```
web/  React 19 + TypeScript + Vite + Tailwind v4 (Vercel project "dishwish-web", root web/)
  ├─ Supabase JS: email/password auth, preferences, pantry, saved and shared recipes (RLS)
  └─ calls the API for recommendations and recipes
api/  Python 3.11 + FastAPI + NetworkX (Vercel project "dishwish-api", root api/)
  ├─ GET  /api/health      public
  ├─ POST /api/recommend   public; ranks the public ingredient catalog
  ├─ GET  /api/me          signed-in (Supabase JWT)
  └─ POST /api/recipes     signed-in (Supabase JWT); deterministic recipe engine
supabase/  SQL migrations, RLS, the 260-ingredient seed and an RLS check script
scripts/   build_seed.py (CSV → seed.sql + 0004 migration), build_engine_data.py (CSV → api/engine/ingredients.json)
docs/      DATASET.md
```

- **Auth:** Supabase email + password with email confirmation and password reset (PKCE; email links verified at `/auth/confirm`). Real emails need custom SMTP: see [docs/AUTH_EMAIL.md](docs/AUTH_EMAIL.md). The API verifies Supabase access tokens: HS256 with `SUPABASE_JWT_SECRET` (legacy), or RS256/ES256/EdDSA via the project's JWKS (`SUPABASE_URL/auth/v1/.well-known/jwks.json`). Audience `authenticated`, issuer and expiry are enforced (`api/core/auth.py`).
- **Data access:** the browser talks to Supabase directly under row-level security: each user sees only their own preferences, pantry and saved recipes. Shared recipes are public read-only snapshots.
- **Pages:** see the route table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Signed-in pages use a sidebar (a drawer on phones). The template generator described below now lives at `/create`; curated recommendations are at `/recommendations`.

## How the NetworkX graph works

`api/engine/recommender.py` builds a complete weighted graph over the 260 catalog ingredients (33,670 edges). The weight of the edge between ingredients *u* and *v* is

```
w(u,v) = 0.35 · max(cat, 0.9 · cook) + 0.35 · cook + 0.20 · taste + 0.10 · harmony
```

All four terms are in [0, 1], so w ≤ 1.

- **cat**: category affinity from an explicit table (e.g. Meat–Spices 1.0, Vegetables–Spices 0.95, Fruits–Dairy 0.9); unlisted pairs get 0.5.
- **cook**: cooking compatibility from `engine/cooking.py`. Each ingredient has a set of Pakistani cooking methods (curry, karahi, pulao, fry, tadka, raw, sweet, bake), assigned by name keywords with a category default. `cook` is the Jaccard overlap of the two sets, halved when both are proteins, both grains or both pulses (they share methods but rarely share a pot). `max(cat, 0.9·cook)` lets a strong cooking match lift a weak category pair.
- **taste**: `1 − mean |difference|/10` over sweet, salty, sour and spicy (0–10 each).
- **harmony**: balance of the pair's combined flavour, `1 − (max − min)/10` of the averaged taste vector; it rewards pairs that even each other out.

**Recommendations** (`POST /api/recommend`): a candidate's score is the sum of its edge weights to **every** selected ingredient, multiplied by `0.75 + 0.25 × taste fit` when taste targets are sent. Candidates carrying an excluded allergen tag are removed; ties break by priority, then name. The Kitchen shows `score ÷ number of picks` as the match % and the pick with the largest edge as "pairs with X".

**Recipes** (`POST /api/recipes`, `api/engine/recipes.py`): the main ingredient (by kind: meat → seafood → egg → paneer → pulse → fruit → yogurt → milk → vegetable → grain) chooses up to three style templates (karahi, salan, pulao, masala fry, anda bhurji, daal tadka, khichdi, bhuna, pakoray, chaat, lassi, raita, kheer). Pantry staples are added unless the allergen shield blocks them, and steps for removed staples are dropped. Chillies, sourness, salt and sugar follow the taste levels. Portions of the main and bulk ingredients scale (0.6–1.6×) toward the meal target (daily target ÷ 3). For each recipe:

- **Nutrition**: catalog per-100 g values × grams. Each ingredient's kcal/protein/carbs/fat, totals, per serving, the energy split by macro (4/4/9 kcal per g), and % daily value (energy against your target, or 2,000 kcal; macros against FDA reference values).
- **Taste metrics**: a 0–10 intensity per taste. Each ingredient adds its catalog intensity scaled by its amount per serving against a "fully tasted" amount (5 g spice, 20 g seasoning or sour/heat ingredient, 60 g otherwise), combined as `1 − ∏(1 − c)`.
- **Matching rate**: `50% × cosine similarity` between your taste targets (low 2, medium 5, high 8) and the recipe's taste vector, plus `50% × mean edge weight` from the main ingredient to every other ingredient. Without taste preferences, it is the pairing term alone.
- **Allergen notice**: tags the shield kept out, free-text words, and tags the recipe still contains.
- **Cost**: rough PKR per kg from `engine/prices.py` × grams. These are estimates only.
- Numbered steps carry real quantities on first mention. Every recipe screen ends with "Nutrition values are approximate. Not medical advice."

Weights and rules are transparent heuristics, not trained on Pakistani cuisine data.

## Run locally

Use Node.js 22+ and Python 3.11.

```bash
# API (terminal 1), from the repo root
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r api/requirements.txt
cd api
cp .env.example .env              # set SUPABASE_URL (enough for JWKS/ES256 projects); SUPABASE_JWT_SECRET only for legacy HS256
# api/.env is read at startup for local runs; real environment variables (Vercel, shell) win. Lines still holding YOUR_ are ignored.
uvicorn api.index:app --reload --port 8000
```

```bash
# Web (terminal 2)
cd web
cp .env.example .env              # set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL=http://localhost:8000
npm ci
npm run dev
```

After editing `.env`, restart the server. If a value still holds `YOUR_...`, the app shows an "Almost ready" setup screen.

Production build: `npm run build`; preview with `npm run preview`. The service worker only registers in production builds.

## Tests

```bash
python -m pytest tests -q          # repo root: seed + allergen rules, migration sync, graph weights, recommender, recipes, JWT, endpoints
cd web && npm test                 # Vitest + Testing Library: auth, onboarding, kitchen, recipes, profile, share, PWA
```

## Database: SQL files to run (Supabase SQL Editor, in order)

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_onboarding.sql`: adds the 19 allergen tags, optional tastes and calorie goal, `custom_allergens`, `onboarded`, and the username trigger.
4. `supabase/seed/seed.sql`: 8 categories and 260 ingredients. Safe to re-run; it updates by name.
5. `supabase/migrations/0004_allergen_tags.sql`: UPDATE-only re-tagging of existing rows; safe to run more than once.
6. `supabase/tests/rls_check.sql`: optional; expects one `PASS: …` row.

Run each file in its own query. For sign-up and reset emails (custom SMTP, templates, redirect URLs), follow [docs/AUTH_EMAIL.md](docs/AUTH_EMAIL.md). Details: [supabase/README.md](supabase/README.md).

## Deploy order (Vercel, auto-deploys from `main`)

1. Supabase: run the SQL above.
2. `dishwish-api` (root `api`, framework "Other"): set its env vars, deploy, check `https://<api>/api/health`.
3. `dishwish-web` (root `web`, Vite): set `VITE_API_URL` to the API origin, deploy.
4. Put the web origin into the API's `ALLOWED_ORIGINS` and redeploy the API. Set Supabase **Authentication → URL Configuration → Site URL** to the web origin.

`web/vercel.json` rewrites every path to `index.html` (SPA deep links) and serves `sw.js` uncached. `api/vercel.json` bundles `engine/` and `core/` with the Python function.

## Environment variables (names only; values never go in git)

| Project | Variable | Purpose |
| --- | --- | --- |
| web | `VITE_SUPABASE_URL` | Supabase project URL |
| web | `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key; data is protected by RLS |
| web | `VITE_API_URL` | API origin, no trailing slash |
| api | `SUPABASE_URL` | Supabase project URL (JWT issuer and JWKS) |
| api | `SUPABASE_JWT_SECRET` | Legacy HS256 JWT secret; server only |
| api | `SUPABASE_SERVICE_ROLE_KEY` | Reserved, not used by current routes; server only |
| api | `ALLOWED_ORIGINS` | Comma-separated web origins allowed by CORS |

Templates: `web/.env.example`, `api/.env.example`.

## PDF and installable app

"Download PDF" opens the print dialog with an A4 print stylesheet (`web/src/styles.css`). Navigation, backdrop and buttons are hidden, and the page shows the title, taste profile, nutrition tables, ingredients, steps and the disclaimer; choose "Save as PDF". The web app is a PWA (`web/public/manifest.webmanifest`, `web/public/sw.js`). It caches the app shell for offline start and never caches Supabase or API requests.

## Dataset

See [docs/DATASET.md](docs/DATASET.md). Nutrition and taste values are approximate.

## License

Code: MIT. Dataset (`supabase/seed/ingredients.csv` and files generated from it): CC BY 4.0. See [LICENSE](LICENSE).
