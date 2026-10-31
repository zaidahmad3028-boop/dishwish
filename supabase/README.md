# Supabase database

## Phase 1 upgrade (auth + onboarding) — run in this order

Your project already has `0001`, `0002` and the original seed. In SQL Editor, run each file in its own query:

1. `migrations/0003_onboarding.sql` — once. Adds the allergen tags `tomato, brinjal, mango, citrus, banana, strawberry, coconut, corn`; makes tastes and the calorie goal optional (`'none'`); adds `preferences.custom_allergens`, `preferences.onboarded`, `preferences.updated_at`; copies the signup username into `profiles.display_name`.
2. `seed/seed.sql` — re-run it. **It must come after 0003**: the new tags are rejected by the old allergen check, so running the seed first fails with a check-constraint error (nothing is changed in that case; just run 0003 and then the seed).
3. `tests/rls_check.sql` — expected result is the same `PASS: …` row. It now also checks the new tags (3 tomato, 4 corn, 6 citrus), the username trigger, onboarding defaults, and the custom-allergen/calorie/display-name limits.

Calorie tiers: `low` = 1,200 kcal/day, `medium` = 1,500, `high` = 1,800, `none` = no goal. Taste levels: `none | low | medium | high`.

Also confirm in **Authentication → Providers → Email** that **Confirm email** is off, so registration signs the user straight in and goes to onboarding. If it is on, the app shows "check your inbox" instead.

## Original setup (steps 1–3, already done)

1. Create a project (yours is named `pantry2plate-pk`; the name does not matter to the app) in your existing Supabase organization, choosing Singapore or Mumbai. Enter the database password yourself and keep it out of git. Stop if the selected plan requires payment or an upgrade.
2. In Authentication → Providers → Email, turn off **Confirm email**. Keep email/password enabled; no OTP or MFA is required by this app.
3. In SQL Editor, open a new query and paste/run `migrations/0001_schema.sql`, then `migrations/0002_rls.sql`, then `migrations/0003_onboarding.sql`, then `seed/seed.sql`, in that order. Apply each migration once; the seed can be repeated. Do not concatenate these into an already-open transaction.
4. In Table Editor, confirm **260 ingredients**, **8 categories**, and RLS enabled on all seven tables: `categories`, `ingredients`, `profiles`, `preferences`, `pantry_items`, `saved_recipes`, `shared_recipes`.
5. Run `tests/rls_check.sql` in SQL Editor as the postgres/admin role. It creates two temporary test users inside a transaction, switches to `anon` and `authenticated`, tests access, and rolls back. Expected result: `PASS: counts, signup triggers, catalog access, owner isolation, public shares, and constraints`. On error, run `rollback;` before retrying; do not remove failed assertions. Test-only user UUIDs and emails must not already exist. The test expects the supplied seed without additional catalog rows.
6. Verify counts and flags independently:

```sql
select count(*) as ingredients from public.ingredients; -- 260
select count(*) as categories from public.categories; -- 8
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in
('categories','ingredients','profiles','preferences','pantry_items','saved_recipes','shared_recipes')
order by tablename; -- seven rows, rowsecurity = true
```

## Environment values

Copy `web/.env.example` to `web/.env.local` and `api/.env.example` to `api/.env` if these local files do not already exist. Preserve existing values. Obtain the project URL, legacy anon key, and server-only service-role key from Project Settings → API / API Keys. Obtain the legacy JWT secret from the API/JWT settings if that key type is available. Never change a project's signing configuration merely to retrieve a legacy secret; flag its absence for the later JWT implementation.

- Web local file: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
- API local file: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS`.
- Vercel `dishwish-web`: the three web variables above.
- Vercel `dishwish-api`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS`.

Use the actual deployed API origin for `VITE_API_URL` and the actual deployed frontend origin for `ALLOWED_ORIGINS`. Redeploy after changes. The skeleton does not consume these variables or provide auth routes yet.

Before any commit, verify local secret files are ignored without displaying their contents:

```bash
git check-ignore web/.env.local api/.env
git status --short --ignored
```

## Data and security decisions

Nutrition is per 100g, copied from the supplied CSV; provenance and accuracy are not independently verified. Taste scores are integers 0–10 and priority is 1–5. The seed generator rejects malformed rows, duplicate ingredient names, negative/nonfinite nutrients, and invalid taste/priority ranges.

Allergen inference uses case-insensitive word-start matching, including words inside parentheses and plural names. Cornmeal (Makai Atta) and Millet Flour (Bajra Atta) are excluded from the atta/gluten rule. The Pulses & Nuts rule uses the requested substring matching. `legumes` is the stored tag for the specified pulse group. This is not a clinical allergy guarantee; labels, blends, and cross-contamination still need checking.

Calorie tier uses `low | medium | high` with `medium` as the default; calorie budgets will be defined in a later step. Pantry quantities are stored in grams. Signup triggers create profiles/preferences without trusting user-supplied metadata. Tables are protected by RLS immediately, and migration 0002 grants only the needed API-role privileges. The service-role key bypasses RLS and must never enter frontend code.

Shares are immutable public JSON snapshots with random UUID tokens. Public read is explicitly required, so **all shared rows are readable through the public API**, not just by a person holding a link. Do not include sensitive/private fields in shared recipe JSON. Authenticated creators may insert their own shares and delete them; updates are not granted. Future share creation must sanitize data before publishing.

## Local validation performed

The Python seed tests cover allergen edge cases, validation, and generated-file consistency. Migrations, repeated seed execution, and `rls_check.sql` were also exercised with an isolated embedded PostgreSQL engine using minimal `auth.users` and `auth.uid()` stand-ins. This validates SQL/policy behavior locally; it does not establish hosted Supabase deployment, Auth integration, or dashboard state. Run the SQL checks in your project after applying the migrations.
