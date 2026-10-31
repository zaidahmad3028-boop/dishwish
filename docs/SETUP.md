# Local setup

Everything runs on your PC with free tools. The database and sign-in are your Supabase project (free tier).

## 1. Install

- Node.js 22+ and Python 3.11+.
- API: `python -m venv api/venv`, then `api/venv/Scripts/pip install -r api/requirements.txt` (macOS/Linux: `api/venv/bin/pip`).
- Web: `cd web && npm install`.

## 2. Environment files (never commit them)

Copy `web/.env.example` → `web/.env` and `api/.env.example` → `api/.env`, then fill in values from Supabase → Project Settings → API:

| File | Variables |
| --- | --- |
| `web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=http://localhost:8000` |
| `api/.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS=http://localhost:5173`; optional `SUPABASE_JWT_SECRET` (legacy keys only) and `SUPABASE_SERVICE_ROLE_KEY` (only for `scripts/create_admin.py`) |

The service-role key is server-only: never put it in `web/.env`.

## 3. Database

In Supabase **SQL Editor**, run each file in its own query (see [DATABASE.md](DATABASE.md)):

1. If the project is new: `0001` → `0002` → `0003` → `seed/seed.sql` → `0004`.
2. `supabase/migrations/0005_admin_recipes.sql` (once).
3. `supabase/seed/recipes.sql` (safe to re-run).
4. Optional: `supabase/tests/admin_check.sql` should return `PASS: …`.

Email confirmation and password reset need custom SMTP: see [AUTH_EMAIL.md](AUTH_EMAIL.md).

## 4. Accounts from your terminal (Super Admin and users)

Put the **service_role / secret key** in `api/.env` as `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys). It's server-only: never put it in `web/.env`, Vercel's web project, a chat or git. Then, from the repo root:

```bash
api/venv/Scripts/python scripts/create_admin.py --email you@example.com --ask-password
api/venv/Scripts/python scripts/create_admin.py --email cook@example.com --role user --ask-password
```

You type the password twice (hidden). The account is created already confirmed; `--role super_admin` (the default) also grants the Super Admin role. Running it again for an existing account changes the password to the one you type. Without `--ask-password`, a random password is written to `.admin-credentials.local` (git-ignored).

Promote an existing account in SQL instead: `select public.grant_super_admin('you@example.com');`

Super Admins land on `/admin` after login; everyone else lands on `/kitchen`.

## 5. Start

- Windows: `powershell -ExecutionPolicy Bypass -File scripts\dev.ps1` checks tools, env files and the database, then starts both servers.
- Manually: `cd api && venv/Scripts/uvicorn api.index:app --port 8000` and `cd web && npm run dev`.

URLs: web `http://localhost:5173`, API `http://localhost:8000`, API docs `http://localhost:8000/docs`.

## 6. Tests

See [TESTING.md](TESTING.md).
