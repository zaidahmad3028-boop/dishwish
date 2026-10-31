# Project status: Dish-Wish

_Last updated: 31 Oct 2026, branch `feature/full-app-v2` (not pushed yet)._

## Overview

Dish-Wish (Dream Recipe Creation) helps cooks turn the ingredients they have into Pakistani recipes that fit their taste, diet and allergies, with a Super Admin panel for managing the catalog, users, feedback and the recommendation engine.

## Architecture

React 19 + Vite + Tailwind (web/) · FastAPI + NetworkX (api/) · Supabase Postgres/Auth with row-level security (supabase/). Decision (approved by the owner): keep this stack instead of Django + MySQL; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how each requirement maps.

## Modules

| Module | Status | Notes |
| --- | --- | --- |
| Authentication (sign-up, confirm email, login, reset) | Complete | Real emails need custom SMTP in Supabase ([docs/AUTH_EMAIL.md](docs/AUTH_EMAIL.md)) |
| Roles and routing (Registered User, Super Admin) | Complete | Enforced in SQL; tested in DB, component and HTTP checks |
| Kitchen | Complete | Trending uses real activity; falls back to "Featured" when there is none |
| Ingredient Selection | Complete | 2-ingredient rule, allergy blocking, live compatibility check, graph suggestions |
| Recommendations (suitability engine) | Complete | Formula, filters and explanations in [docs/RECOMMENDATION_ENGINE.md](docs/RECOMMENDATION_ENGINE.md) |
| Recipe Details + cooking mode | Complete | Nutrition is labelled as an estimate; no fibre shown (not in catalog) |
| My Recipes (saved, favourites, generated, cooked, viewed, browse) | Complete | |
| Pantry | Complete | Stock status, filters, recipe ideas from pantry |
| Profile, Settings, Feedback | Complete | Notification choices are stored, but Dish-Wish sends no such emails yet (stated in the UI) |
| Admin: Dashboard, Users, Ingredients + graph editor, Recipes, Analytics, Feedback, System Settings + audit | Complete | No fabricated metrics; no backup/restart buttons (managed by Supabase) |
| Template recipe generator (`/create`) | Complete (existing) | |

## Database migrations

All applied on the live project (31 Oct 2026): 0001–0004, `seed/seed.sql` (8 categories, 260 ingredients), **0005_admin_recipes.sql**, `seed/recipes.sql` (35 recipes, 159 steps, 334 edges). A pre-0005 snapshot is in schema `backup_pre_0005` (2 profiles, 2 preferences). `tests/admin_check.sql` returned PASS on the live database and `scripts/verify_live.py` passes 18/18.

## Tests (last run 31 Oct 2026)

- pytest: **169 passed**
- Vitest: **146 passed** (16 files)
- Database checks (PGlite): rls_check **PASS**, admin_check **PASS**, recipe seed idempotent
- TypeScript build: **passes**
- Manual end-to-end on a local stand-in: user, admin, security and 375 px responsive checks passed ([docs/TESTING.md](docs/TESTING.md))

## Known limitations

- No committed Playwright suite; E2E was run manually in a browser.
- Recipe imagery uses category illustrations unless an admin adds an https image URL (no stock photos are passed off as the dish).
- Allergen tags are rule-based; cross-contact can't be ruled out (shown to users).
- Main JS bundle is ~720 kB (Supabase client + app); admin pages and charts load separately.
- Email delivery depends on custom SMTP being configured in Supabase.

## Blockers needing the owner

1. ~~Apply 0005 and seeds~~ (done 31 Oct 2026).
2. Create the Super Admin (`scripts/create_admin.py` with the service-role key in `api/.env`, or `grant_super_admin` in SQL).
3. Configure custom SMTP for confirmation and reset emails.
4. Approve pushing `feature/full-app-v2` to GitHub.

## Next step

After the owner's approval: push the branch, open a PR into `main`, then verify on the live Supabase project (migration applied, seed counts, admin login, one recommendation).
