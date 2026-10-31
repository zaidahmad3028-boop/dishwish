# Testing

| Suite | Command | What it covers |
| --- | --- | --- |
| API unit + integration (pytest) | `api/venv/Scripts/python -m pytest -q tests` (repo root) | JWT verification, legacy pairing graph, template generator, **suitability engine** (formula, renormalised fallbacks, penalty, clamping, allergy/diet hard filters, pantry, family matching, validation), database catalog loader (mocked HTTP) and fallback, HTTP endpoints and their auth/validation |
| Database (PGlite) | `cd web && npm run test:db` | Applies every migration and seed to an in-memory Postgres, checks the recipe seed is idempotent, then runs `supabase/tests/rls_check.sql` and `admin_check.sql`: owner isolation, anonymous limits, admin RPC guards (42501), self-promotion and status tampering blocked, feedback ownership, settings validation, transactional recipe save, audit rows, deactivation |
| Web unit + component (Vitest) | `cd web && npm test` | Auth flows, onboarding, generator, pantry, saved recipes, **core journey** (2-ingredient rule, allergy blocking, recommendations, save, cooking progress → cooked event), **role routing** (user kept out of `/admin`, Super Admin lands on the panel), validators, CSV import, CSV formula escaping |
| Type check + build | `cd web && npm run build` | TypeScript strict build and production bundle |

## End-to-end (manual, local)

There is no committed Playwright suite yet. The full journeys were run in a browser against a local Supabase stand-in (in-memory Postgres with these migrations and RLS) and the API on the same machine:

- **User:** register → onboarding (spicy = high) → Kitchen (taste preset pre-selected) → quick-add Chicken + Tomato → Generate → Chicken Karahi ranked first (62%) with score breakdown, nutrition and graph → recipe details → save → tick every step (logged as cooked) → My Recipes shows saved/generated/cooked counts → favourite persists after reload → send feedback.
- **Admin:** `scripts/create_admin.py` (second run leaves the password unchanged) → login lands on `/admin` with live counts → resolve feedback and add a note (the cook sees the reply) → change the similarity threshold → audit log shows both → add a Mango–Yogurt edge → `/api/compatibility/Mango` returns it after the 60-second cache.
- **Security (HTTP):** as a normal user, `admin_overview` → 42501, audit log → no rows, settings update → no rows changed, self-promotion → 42501; anonymous feedback read → 42501; `/api/recommendations` without a token → 401.
- **Responsive:** every user and admin page measured at 375 px wide with no horizontal page overflow (wide tables scroll inside their card).
