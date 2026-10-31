# Database (Supabase Postgres)

Run once in **SQL Editor**, each file in its own query, in this order (the first five are already applied on an existing project):

1. `migrations/0001_schema.sql` → `0002_rls.sql` → `0003_onboarding.sql` → `seed/seed.sql` → `0004_allergen_tags.sql`
2. `migrations/0005_admin_recipes.sql`: roles, curated recipes, compatibility graph, settings, feedback, activity, audit log, admin RPCs
3. `seed/recipes.sql`: 35 curated recipes (159 steps) and 334 compatibility edges. Idempotent; it never overwrites admin edits.
4. Optional checks: `tests/rls_check.sql` and `tests/admin_check.sql` (each runs in a transaction, rolls back, and returns a `PASS` row).

## Tables

| Table | Purpose | Who can read / write |
| --- | --- | --- |
| `categories`, `ingredients` | Catalog (nutrition per 100 g, tastes 0–10, allergen tags, optional `image_url`) | everyone reads; Super Admin writes |
| `ingredient_compatibility` | Graph edges `(ingredient_a < ingredient_b)`, weight 0–1, relation type, evidence | everyone reads; Super Admin writes |
| `curated_recipes`, `recipe_ingredients`, `recipe_steps` | Curated recipes with quantities (grams + display text) and ordered steps; status `draft/published/archived`, source `curated/user_generated` | published rows public; Super Admin all |
| `app_settings` | `recommendation` (weights, validated by a CHECK) and `general` (announcement) | public keys readable; Super Admin writes |
| `profiles` | Display name, `status` (active/deactivated), `last_seen_at` | owner reads; owner may update only display name and last seen |
| `preferences` | Tastes, allergens, custom words, calorie tier, diets, cuisines, max minutes, notification choices, text size | owner only (and only while active) |
| `pantry_items`, `saved_recipes` (+ `favorite`) | Cook's pantry and saved recipes | owner only |
| `recipe_events` | Activity: generated, viewed, saved, cooked (drives history and analytics) | owner inserts/reads/deletes; admins see aggregates only via RPCs |
| `feedback` | Ratings, suggestions, complaints, bug reports; `status`, `admin_note`, timestamps | owner inserts and reads own; Super Admin reads all and updates status/note |
| `user_roles` | `super_admin` grants | no browser access; `is_admin()` reads it |
| `admin_audit_log` | Who changed what, written by triggers and admin RPCs | Super Admin reads |
| `shared_recipes` | Public snapshots for share links | public read; owner insert/delete |

All tables have row-level security. Foreign keys use `cascade` for personal data (deleting an account deletes its rows), `set null` for feedback authorship and audit actors, and `restrict` for ingredients used by recipes.

## Functions (RPCs)

- `is_admin()`, `is_active()`, `my_account()`: role and status for the signed-in user.
- `trending_recipes(days, lim)`: aggregate counts for every cook, never who cooked what.
- `delete_my_account()`: self-service deletion (Super Admins can't delete themselves).
- Admin only (raise 42501 otherwise): `admin_overview`, `admin_timeseries`, `admin_top_ingredients`, `admin_top_recipes`, `admin_category_usage`, `admin_preference_stats`, `admin_list_users`, `admin_set_user_status` (Super Admins and yourself are protected), `admin_list_feedback`, `admin_ingredient_usage`, `admin_system_status`, `admin_save_recipe` (one transaction).
- `grant_super_admin(email)`: SQL Editor / service role only.

## Indexes

Status/category on curated recipes, ingredient lookups on recipe ingredients and graph edges, `(user_id, created_at)` and `(created_at, kind)` on events, `(status, created_at)` on feedback, `created_at` on the audit log.
