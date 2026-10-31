"""scripts/create_admin.py against a fake Supabase Admin API (no network)."""
import importlib.util
import json
from pathlib import Path

import httpx
import pytest

spec = importlib.util.spec_from_file_location("create_admin", Path(__file__).resolve().parents[1] / "scripts/create_admin.py")
create_admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(create_admin)

URL = "https://fake.supabase.co"


class FakeSupabase:
    def __init__(self):
        self.users: dict[str, dict] = {}
        self.roles: set[str] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["apikey"] == "service-key"
        path = request.url.path
        if path == "/auth/v1/admin/users" and request.method == "POST":
            body = json.loads(request.content)
            if any(u["email"] == body["email"] for u in self.users.values()):
                return httpx.Response(422, json={"msg": "A user with this email address has already been registered"})
            uid = f"id-{len(self.users) + 1}"
            self.users[uid] = {"id": uid, "email": body["email"], "password": body["password"], "confirmed": body["email_confirm"]}
            return httpx.Response(200, json={"id": uid})
        if path == "/auth/v1/admin/users" and request.method == "GET":
            return httpx.Response(200, json={"users": list(self.users.values())})
        if path.startswith("/auth/v1/admin/users/") and request.method == "PUT":
            uid = path.rsplit("/", 1)[-1]
            self.users[uid]["password"] = json.loads(request.content)["password"]
            return httpx.Response(200, json={"id": uid})
        if path == "/rest/v1/user_roles":
            self.roles.add(json.loads(request.content)["user_id"])
            return httpx.Response(201)
        return httpx.Response(404)


@pytest.fixture
def fake():
    server = FakeSupabase()
    return server, httpx.Client(transport=httpx.MockTransport(server.handler))


def test_admin_with_typed_password(fake, tmp_path):
    server, client = fake
    uid, outcome = create_admin.ensure_account(URL, "service-key", "boss@example.com", client, password="Typed-pass-123",
                                              credentials_file=tmp_path / "creds")
    assert outcome == "created" and server.users[uid]["password"] == "Typed-pass-123" and server.users[uid]["confirmed"]
    assert uid in server.roles
    assert not (tmp_path / "creds").exists()  # a typed password is never written to disk


def test_normal_user_gets_no_role(fake, tmp_path):
    server, client = fake
    uid, _ = create_admin.ensure_account(URL, "service-key", "cook@example.com", client, role="user", password="Cook-pass-123",
                                         credentials_file=tmp_path / "creds")
    assert uid not in server.roles


def test_existing_account_password_changed_only_when_typed(fake, tmp_path):
    server, client = fake
    uid, _ = create_admin.ensure_account(URL, "service-key", "boss@example.com", client, credentials_file=tmp_path / "creds")
    generated = server.users[uid]["password"]
    assert (tmp_path / "creds").read_text().count(generated) == 1
    _, outcome = create_admin.ensure_account(URL, "service-key", "boss@example.com", client, credentials_file=tmp_path / "creds")
    assert outcome == "unchanged" and server.users[uid]["password"] == generated
    _, outcome = create_admin.ensure_account(URL, "service-key", "boss@example.com", client, password="New-pass-456",
                                             credentials_file=tmp_path / "creds")
    assert outcome == "password_changed" and server.users[uid]["password"] == "New-pass-456"


def test_generated_passwords_are_strong():
    value = create_admin.strong_password()
    assert len(value) == 24 and any(c.isupper() for c in value) and any(c.isdigit() for c in value)
