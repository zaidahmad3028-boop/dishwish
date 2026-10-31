"""Read-only health check of the live Supabase project with the public anon key (from api/.env).

    api/venv/Scripts/python scripts/verify_live.py

Checks seed counts, that private tables stay closed to anonymous visitors, that admin RPCs refuse
anonymous callers, and that the recommendation API ranks from the database. Writes nothing.
"""
from pathlib import Path
import os
import sys

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from core.env import load_env_file  # noqa: E402

EXPECTED = {"categories": 8, "ingredients": 260, "curated_recipes": 35, "recipe_steps": 159, "ingredient_compatibility": 334}
PRIVATE = ["profiles", "preferences", "pantry_items", "saved_recipes", "feedback", "recipe_events", "user_roles", "admin_audit_log"]


def main() -> int:
    load_env_file(ROOT / "api/.env")
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_ANON_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"}
    failures = 0

    def check(ok: bool, label: str) -> None:
        nonlocal failures
        failures += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}")

    with httpx.Client(timeout=20) as client:
        for table, expected in EXPECTED.items():
            r = client.get(f"{url}/rest/v1/{table}?select=*&limit=1", headers=headers)
            total = int(r.headers.get("content-range", "*/-1").split("/")[-1]) if r.status_code == 200 else -1
            check(total >= expected, f"{table}: {total} rows (expected at least {expected})")
        for table in PRIVATE:
            r = client.get(f"{url}/rest/v1/{table}?select=*&limit=1", headers=headers)
            check(r.status_code in (401, 403) or (r.status_code == 200 and r.json() == []), f"{table} closed to anonymous (HTTP {r.status_code})")
        r = client.get(f"{url}/rest/v1/app_settings?select=key", headers=headers)
        check(r.status_code == 200 and {"recommendation", "general"} <= {s["key"] for s in r.json()}, "public settings readable")
        r = client.post(f"{url}/rest/v1/rpc/admin_overview", headers=headers, json={"days": 30})
        check(r.status_code in (401, 403), f"admin_overview refused for anonymous (HTTP {r.status_code})")
        r = client.post(f"{url}/rest/v1/rpc/my_account", headers=headers, json={})
        check(r.status_code in (401, 403), f"my_account needs a session (HTTP {r.status_code})")

    sys.path.insert(0, str(ROOT / "api"))
    from engine.catalog_db import get_engine  # noqa: E402
    engine, data = get_engine(force=True)
    check(data.source == "database", f"API reads the catalog from the database (source: {data.source}{'; ' + data.notes[0] if data.notes else ''})")
    top = engine.recommend(["Chicken Breast", "Tomato"], tastes={"spicy": "high"})["recipes"][:1]
    check(bool(top) and top[0]["slug"] == "chicken-karahi", f"Chicken + Tomato + spicy ranks {top[0]['name'] if top else 'nothing'} first")
    print(f"\n{'All checks passed' if not failures else f'{failures} check(s) failed'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
