"""Create accounts from your own terminal: a Super Admin or a normal Registered User. Idempotent.

    python scripts/create_admin.py                                    # Super Admin admin@dishwish.local, random password
    python scripts/create_admin.py --email you@example.com --ask-password          # Super Admin, you type the password
    python scripts/create_admin.py --email cook@example.com --role user --ask-password   # normal user

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env (server-only key: never put it in web/.env
or commit it). Accounts are created already confirmed through the Supabase Admin API.

- --ask-password: you type the password twice; it is never echoed, printed or saved anywhere.
  If the account already exists, its password is changed to the one you type.
- Without --ask-password: a new account gets a random 24-character password written only to
  `.admin-credentials.local` (git-ignored, never printed); an existing account's password is left alone.
- --role super_admin (default) adds a row to public.user_roles; --role user adds none, and removes
  nothing either (demoting an admin is done in SQL on purpose).
Supabase stores passwords with bcrypt; this script keeps no copy.
"""
from __future__ import annotations

import argparse
from getpass import getpass
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
CREDENTIALS_FILE = ROOT / ".admin-credentials.local"
MIN_PASSWORD = 8


def strong_password(length: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits + "-_.!@#%^*"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value):
            return value


def ask_password() -> str:
    while True:
        first = getpass(f"New password (min {MIN_PASSWORD} characters, hidden): ")
        if len(first) < MIN_PASSWORD:
            print(f"Too short: use at least {MIN_PASSWORD} characters.")
            continue
        if getpass("Type it again: ") != first:
            print("The two passwords don't match; try again.")
            continue
        return first


def find_user(url: str, headers: dict, email: str, client: httpx.Client) -> str | None:
    page = 1
    while True:
        response = client.get(f"{url}/auth/v1/admin/users", headers=headers, params={"page": page, "per_page": 200})
        response.raise_for_status()
        users = response.json().get("users", [])
        match = next((u["id"] for u in users if (u.get("email") or "").lower() == email.lower()), None)
        if match or len(users) < 200:
            return match
        page += 1


def ensure_account(url: str, service_key: str, email: str, client: httpx.Client, *, role: str = "super_admin",
                   password: str | None = None, credentials_file: Path = CREDENTIALS_FILE) -> tuple[str, str]:
    """Return (user_id, outcome) where outcome is 'created', 'password_changed' or 'unchanged'."""
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}
    username = email.split("@")[0][:30]
    generated = password is None
    new_password = password or strong_password()
    response = client.post(f"{url}/auth/v1/admin/users", headers=headers, json={
        "email": email, "password": new_password, "email_confirm": True, "user_metadata": {"username": username}})
    if response.status_code in (200, 201):
        user_id, outcome = response.json()["id"], "created"
    elif response.status_code == 422 and "already" in response.text.lower():
        user_id = find_user(url, headers, email, client)
        if user_id is None:
            raise SystemExit("Supabase says the account exists but it could not be found.")
        outcome = "unchanged"
        if not generated:
            update = client.put(f"{url}/auth/v1/admin/users/{user_id}", headers=headers,
                                json={"password": new_password, "email_confirm": True})
            if update.status_code not in (200, 201):
                raise SystemExit(f"Could not change the password (HTTP {update.status_code}).")
            outcome = "password_changed"
    else:
        raise SystemExit(f"Could not create the account (HTTP {response.status_code}): {response.text[:200]}")
    if role == "super_admin":
        grant = client.post(f"{url}/rest/v1/user_roles", headers={**headers, "Prefer": "resolution=ignore-duplicates"},
                            params={"on_conflict": "user_id"}, json={"user_id": user_id, "role": "super_admin"})
        if grant.status_code not in (200, 201, 204, 409):
            raise SystemExit(f"Account ready but the Super Admin role could not be granted (HTTP {grant.status_code}). "
                             "Run migration 0005 first.")
    if outcome == "created" and generated:
        credentials_file.write_text(f"Dish-Wish {role} (development)\nemail={email}\npassword={new_password}\n",
                                    encoding="utf-8")
        try:
            os.chmod(credentials_file, 0o600)
        except OSError:
            pass
    return user_id, outcome


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--role", choices=["super_admin", "user"], default="super_admin")
    parser.add_argument("--ask-password", action="store_true", help="type the password yourself (hidden)")
    parser.add_argument("--credentials-file", type=Path, default=CREDENTIALS_FILE)
    args = parser.parse_args()
    load_env_file(ROOT / "api/.env")
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env "
                         "(Supabase → Project Settings → API keys → service_role / secret key; server-only).")
    password = ask_password() if args.ask_password else None
    with httpx.Client(timeout=20) as client:
        _, outcome = ensure_account(url, key, args.email, client, role=args.role, password=password,
                                    credentials_file=args.credentials_file)
    label = "Super Admin" if args.role == "super_admin" else "Registered User"
    if outcome == "created":
        where = "the password you typed" if password else f"a random password saved in {args.credentials_file} (git-ignored)"
        print(f"Created {label} {args.email} (email confirmed) with {where}.")
    elif outcome == "password_changed":
        print(f"{args.email} already existed: password changed to the one you typed. Role: {label}.")
    else:
        print(f"{args.email} already exists; password unchanged. Role: {label}.")


if __name__ == "__main__":
    main()
