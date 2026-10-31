# Architecture

```
Browser (React 19 + Vite + Tailwind v4, web/)
 ├─ Supabase JS ──────────────► Supabase (Postgres + Auth + row-level security)
 │    auth, profile, preferences, pantry, saved recipes, activity, feedback,
 │    admin tables and admin RPCs (every admin call re-checked in SQL)
 └─ fetch + Bearer JWT ───────► FastAPI (api/)
                                  ├─ verifies the Supabase JWT (core/auth.py)
                                  ├─ suitability engine + NetworkX graph (engine/)
                                  └─ reads public catalog rows from Supabase (anon key, 60 s cache)
```

The project keeps the stack it already had (React + FastAPI + Supabase) instead of moving to Django + MySQL: authentication, existing users and data, row-level security and the test suites all keep working, and everything still runs locally and on free hosting. Django/MySQL concepts map like this:

| Requirement | Implementation here |
| --- | --- |
| Django auth + password hashing | Supabase Auth (bcrypt, email confirmation, reset links, PKCE) |
| Role-based permissions, 403 for admin endpoints | `user_roles` table, `is_admin()`, RLS policies and admin RPCs that raise SQLSTATE 42501 (HTTP 403) |
| Django ORM + migrations | SQL migrations `supabase/migrations/0001–0005`, idempotent seeds |
| DRF endpoints | FastAPI (`/api/*`) for computation; PostgREST/RPC for data, protected by RLS |
| Transactions | `admin_save_recipe` saves a recipe, its ingredients and steps in one transaction |
| Audit logging | Triggers write `admin_audit_log` for every admin change |
| Management command for the Super Admin | `scripts/create_admin.py` (idempotent, random password, never printed) |

## Web app structure (`web/src`)

- `auth/`: `AuthProvider` (session), `AccountProvider` (role and status from the `my_account` RPC), route guards `RequireAuth`, `RequireUser`, `RequireAdmin`, `HomeRedirect` (Super Admin → `/admin`, user → `/kitchen`).
- `components/`: `AppShell` (sidebar shell for both roles), `ui.tsx` (cards, stats, tables, pagination, modal, donut, toggles), `charts.tsx` (Recharts wrappers), `DishArt`, `CompatibilityGraph`, `FeedbackForm`, `RecipeView` (generated recipes).
- `lib/`: data access per area (`curatedApi`, `accountApi`, `adminApi`, `pantryApi`, `recipesApi`, `preferencesApi`), `selection.tsx` (the cook's in-progress selection, kept in sessionStorage so Back never loses it).
- `pages/`: user pages and `pages/admin/*` (lazy-loaded, so cooks never download the chart library).

## Routes

| Path | Who | Page |
| --- | --- | --- |
| `/auth`, `/auth/confirm`, `/reset-password` | public | Sign-up, login, email links |
| `/r/:token` | public | Shared generated recipe |
| `/onboarding` | user | Taste, allergies, calorie goal |
| `/kitchen` | user | Kitchen dashboard |
| `/select` | user | Ingredient Selection |
| `/recommendations` | user | Meal Recommendations |
| `/recipe/:slug` | user | Curated recipe details and cooking mode |
| `/create` | user | Template recipe generator |
| `/recipes`, `/recipes/:id` | user | My Recipes, saved generated recipe |
| `/pantry`, `/profile`, `/settings` | user | Pantry, Profile, Settings |
| `/admin`, `/admin/users`, `/admin/ingredients`, `/admin/recipes`, `/admin/analytics`, `/admin/feedback`, `/admin/settings` | Super Admin | Admin panel |

Hiding a link is never the protection: a user who opens `/admin/*` is redirected, and every admin read or write is rejected by the database anyway.
