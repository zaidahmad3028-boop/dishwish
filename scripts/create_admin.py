"""Create (or confirm) the development Super Admin account. Idempotent.

    python scripts/create_admin.py            # uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from api/.env
    python scripts/create_admin.py --email you@example.com   # promote/create a different account

- New account: a random 24-character password is generated with `secrets`, the account is created
  already confirmed through the Supabase Admin API, and the password is written to
  `.admin-credentials.local` at the repo root (git-ignored). It is never printed.
- Existing account: its password is NOT changed; it is only (re)granted the super_admin role.
Supabase stores passwords with bcrypt; this script never stores a hash or plaintext anywhere else.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import secrets
import string
import sys

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from core.env import load_env_file  # noqa: E402

DEFAULT_EMAIL = "admin@dishwish.local"
USERNAME = "dishwish_admin"
CREDENTIALS_FILE = ROOT / ".admin-credentials.local"


def strong_password(length: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits + "-_.!@#%^*"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value):
            return value


def ensure_admin(url: str, service_key: str, email: str, client: httpx.Client,
                 credentials_file: Path = CREDENTIALS_FILE) -> tuple[str, bool]:
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}
    created = False
    password = strong_password()
    response = client.post(f"{url}/auth/v1/admin/users", headers=headers, json={
        "email": email, "password": password, "email_confirm": True, "user_metadata": {"username": USERNAME}})
    if response.status_code in (200, 201):
        user_id, created = response.json()["id"], True
    elif response.status_code == 422 and "already" in response.text.lower():
        users = client.get(f"{url}/auth/v1/admin/users", headers=headers, params={"per_page": 1000}).json()["users"]
        user_id = next(u["id"] for u in users if u["email"].lower() == email.lower())
    else:
        raise SystemExit(f"Could not create the admin account (HTTP {response.status_code}).")
    grant = client.post(f"{url}/rest/v1/user_roles", headers={**headers, "Prefer": "resolution=ignore-duplicates"},
                        params={"on_conflict": "user_id"}, json={"user_id": user_id, "role": "super_admin"})
    if grant.status_code not in (200, 201, 204, 409):
        raise SystemExit(f"Account exists but the role could not be granted (HTTP {grant.status_code}). Run migration 0005 first.")
    if created:
        credentials_file.write_text(f"DishWish Super Admin (development)\nemail={email}\nusername={USERNAME}\npassword={password}\n",
                                    encoding="utf-8")
        try:
            os.chmod(credentials_file, 0o600)
        except OSError:
            pass
    return user_id, created


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--credentials-file", type=Path, default=CREDENTIALS_FILE)
    args = parser.parse_args()
    load_env_file(ROOT / "api/.env")
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env (server-only key; never put it in web/.env).")
    with httpx.Client(timeout=15) as client:
        _, created = ensure_admin(url, key, args.email, client, args.credentials_file)
    if created:
        print(f"Created Super Admin {args.email}. Password saved to {args.credentials_file} (git-ignored); it is not printed.")
    else:
        print(f"{args.email} already exists; password unchanged. Super Admin role ensured.")


if __name__ == "__main__":
    main()
