# Pantry2Plate PK

A smart kitchen assistant for Pakistani homes. The app currently provides a React landing screen and a public FastAPI health endpoint. Step 2 adds the database schema, RLS policies, and a 260-ingredient seed. Step 3 adds public NetworkX ingredient recommendations. Pantry CRUD, authentication, recipes, nutrition calculations, shopping lists, saved dishes, sharing, PDF export, and installable PWA support remain for subsequent steps.

## Structure

- `web/`: React + TypeScript + Vite + Tailwind; Vercel frontend project.
- `api/`: Python 3.11 + FastAPI; separate Vercel Python serverless project.
- `supabase/`: Postgres migrations, RLS policies, ingredient CSV/seed, and SQL checks.

## Run locally

Use Node.js 22 LTS or newer and Python 3.11. Run each component in a separate terminal.

```bash
cd web
cp .env.example .env.local
npm ci
npm run dev
```

Open the URL Vite prints. For a production build: `npm run build`; to inspect it locally: `npm run preview`.

```bash
cd api
python3.11 -m venv .venv
source .venv/bin/activate
# Windows PowerShell activation: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn api.index:app --reload --port 8000
```

The current endpoint does not require environment variables; the `.env` template is reserved for later integration and is not loaded by this skeleton. Environment templates reserve names for later steps; no Supabase connection or JWT verification is implemented yet. Future user routes must verify Supabase JWTs. `/api/health` intentionally remains public.

## Verify step 1

1. In `web`, run `npm run build`; it must complete successfully.
2. Run the web development server and confirm the Pantry2Plate PK landing screen at both mobile and desktop widths.
3. With the API running, run `curl http://localhost:8000/api/health`. Expected JSON: `{"status":"ok","service":"pantry2plate-pk-api"}`.
4. API docs are available locally at `/docs`. Run `python -m pytest tests -q` from the repository root with the API virtual environment activated to check seed generation, engine behavior, endpoint validation, and CORS.

## Manual setup

1. **Create Supabase.** In the Supabase dashboard, create a project, choose your region, and store the database password securely. Under **Project Settings → API / API Keys**, copy the project URL and legacy `anon` key for the web project, and the legacy `service_role` key for the API project only. Do not commit these values. Under **Authentication → Providers → Email**, enable email/password and disable **Confirm email** for the requested password-only flow; do not configure OTP or MFA. Apply the SQL in the order documented in [supabase/README.md](supabase/README.md).
2. **Import the frontend into Vercel.** Choose **Add New → Project**, import `zaidahmad3028-boop/dishwish`, name it `dishwish-web`, and set **Root Directory** to `web`. Use the **Vite** preset, install command `npm ci`, build command `npm run build`, output directory `dist`, and Node.js 22.x. Use `main` as the production branch. Add the web variables listed below and deploy.
3. **Import the API into Vercel.** Import the same repository again as a separate project named `dishwish-api`, set **Root Directory** to `api`, choose **Other**, and leave build/output/install overrides unset so `vercel.json` and `requirements.txt` control the Python function. The `.python-version` file requests Python 3.11. Use `main` as the production branch. Add the API variables below, deploy, and visit `https://YOUR_API_DOMAIN/api/health` to verify the expected JSON. Do not put Python API code in the frontend Vercel project.
4. **Set environment variables.** In each Vercel project's **Settings → Environment Variables**, add the following for Production and Preview (and Development if using Vercel locally):

   | Project | Variable | Value |
   | --- | --- | --- |
   | web | `VITE_SUPABASE_URL` | Supabase project URL |
   | web | `VITE_SUPABASE_ANON_KEY` | Supabase legacy anon key; public, protected by future RLS |
   | web | `VITE_API_URL` | API project's HTTPS origin, without a trailing slash |
   | api | `SUPABASE_URL` | Supabase project URL |
   | api | `SUPABASE_SERVICE_ROLE_KEY` | Legacy service-role key; mark sensitive; server only |
   | api | `SUPABASE_JWT_SECRET` | Legacy JWT secret from Supabase API/JWT settings; server only |
   | api | `ALLOWED_ORIGINS` | Frontend project's HTTPS origin, without a trailing slash |

   Once both deployment domains exist, update `VITE_API_URL` and `ALLOWED_ORIGINS` with their actual values, then redeploy both projects. Vite variables are embedded at build time. These variables prepare later integration; the step 1 landing screen and health route work without them. Never use a `VITE_` prefix for the service-role key.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to the frontend production origin and add any explicit local or preview redirect URLs you need. Auth screens and redirect handling arrive in a later step. Verify the deployed landing screen and API health response independently.

Never paste secrets into git, browser code, or public logs. Only `.env.example` templates belong in version control. Dashboard setup and deployment are manual; no Supabase or Vercel resources are created by this repository.

## Step 2: database and seed

See [supabase/README.md](supabase/README.md) for the exact SQL Editor execution order, row-count queries, RLS checks, and local environment setup. No dashboard changes have been made automatically.

```bash
# Run from repository root after installing api/requirements.txt:
python scripts/build_seed.py
python -m pytest tests -q
```

The seed is deterministic and safe to run again: it updates ingredients by name without replacing IDs or deleting pantry references. Schema migrations run once. Nutrition values are supplied CSV data and have not been independently verified. Allergen tags implement the requested heuristic; packaged foods and cross-contamination require label checks. `legumes` is the stored tag for the requested lentil/chickpea allergen group, with the broader pulse matching specified for this dataset.

## Step 3: ingredient recommendations

The API now includes `engine/data.py`, `engine/recommender.py`, and `POST /api/recommend`. This endpoint is public: it only ranks a bundled public ingredient catalog and does not read user profiles, private pantry rows, or Supabase credentials. User-specific routes must verify Supabase JWTs when implemented. Run the API from `api/` with `uvicorn api.index:app --reload --port 8000`.

```bash
curl -X POST http://localhost:8000/api/recommend \
  -H 'Content-Type: application/json' \
  -d '{"selected_ingredients":["Mutton","Onion"],"taste_preferences":{"spicy":8,"sour":3},"excluded_allergens":["milk","peanuts"],"limit":5}'
```

Expected: HTTP 200 with a `recommendations` array of five results. Each result has `name`, `category`, `score`, `priority`, `allergens`, `taste_fit`, and per-selected-ingredient `contributions`. No selected ingredient or excluded allergen should appear among the results. Requests accept 1–20 distinct ingredient names (case-insensitive, trimmed), an optional limit of 1–50, optional taste targets from 0–10 for sweet/salty/sour/spicy, and optional allergen tags from the database vocabulary. Invalid names, duplicate selections, allergen-conflicting selections, and invalid ranges return HTTP 422. A valid request with no eligible candidates returns an empty array.

The complete NetworkX graph has 260 nodes and 33,670 weighted edges. An edge weight is `0.6 × category affinity + 0.4 × taste similarity`, where taste similarity is `1 − mean absolute taste difference / 10`. The category-pair affinity table is explicit in `recommender.py`; unlisted pairs use 0.5. A candidate's cumulative score sums its edge weights to **every** selected ingredient, then multiplies by `0.75 + 0.25 × taste fit` when taste targets are provided. Taste fit measures distance to the requested targets. With no targets, the multiplier is 1. Ties use higher numeric priority first (5 before 1), then ingredient name. Scores are ranking units, not probabilities or clinical/nutrition advice. Weights are initial heuristics, not trained Pakistani cuisine pairing data; real-world taste quality remains unvalidated.

Allergen filtering uses the supplied name-based tags and their documented limitations. The API refuses a selected ingredient that conflicts with an excluded allergen instead of silently accepting it. No recipe generation, nutrition calculation, shopping estimates, or authenticated pantry integration is included in this step.

The catalog is bundled within `api/engine/ingredients.json` so a Vercel project rooted at `api` does not depend on a sibling checkout directory. After editing the source CSV, regenerate both artifacts and run the tests:

```bash
python scripts/build_seed.py
python scripts/build_engine_data.py
python -m pytest tests -q
```

`ALLOWED_ORIGINS` accepts comma-separated exact frontend origins (default `http://localhost:5173`). Set it to the deployed web origin for Vercel; redeploy the API to apply changes. No external deployment is performed by these commands.
