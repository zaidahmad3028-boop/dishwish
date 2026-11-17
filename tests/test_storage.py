"""Image storage choice: R2 when configured, otherwise Supabase Storage with the user's own token."""
from fastapi.testclient import TestClient
import httpx
import pytest

from api.index import app
from core import auth, r2, storage
from test_auth import SECRET, URL, hs_token

WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 24


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-public-key")
    for name in r2.ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(auth, "is_admin_token", lambda token: True)
    return TestClient(app)


def test_status_reports_supabase_backend(client):
    body = client.get("/api/uploads/status").json()
    assert body["configured"] is True and body["backend"] == "supabase"
    assert body["public_url"].startswith(f"{URL}/storage/v1/object/public/images/")


def test_r2_wins_when_configured(monkeypatch, client):
    for name, value in zip(r2.ENV_NAMES, ("a", "b", "c", "bucket", "https://pub.example")):
        monkeypatch.setenv(name, value)
    assert storage.backend()[0] == "r2"


def test_upload_goes_to_supabase_with_the_users_token(client, monkeypatch):
    seen = {}
    real = storage.put_supabase

    def fake(config, token, key, body, kind):
        def handler(request):
            seen.update(url=str(request.url), auth=request.headers["authorization"], apikey=request.headers["apikey"],
                        type=request.headers["content-type"])
            return httpx.Response(200, json={"Key": key})
        with httpx.Client(transport=httpx.MockTransport(handler)) as fake_client:
            return real(config, token, key, body, kind, client=fake_client)

    monkeypatch.setattr(storage, "put_supabase", fake)
    token = hs_token()
    res = client.post("/api/uploads/avatar", content=WEBP, headers={"Content-Type": "image/webp", "Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["backend"] == "supabase" and body["key"].startswith("avatars/")
    assert seen["auth"] == f"Bearer {token}" and seen["apikey"] == "anon-public-key" and seen["type"] == "image/webp"
    assert "/storage/v1/object/images/avatars/" in seen["url"]
    assert body["url"] == f"{URL}/storage/v1/object/public/images/{body['key']}"


@pytest.mark.parametrize("status,needle", [(403, "refused"), (404, "not found"), (500, "HTTP 500")])
def test_supabase_errors_are_explained(status, needle):
    config = storage.SupabaseStorage("https://x.supabase.co", "anon")
    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(status))) as c:
        with pytest.raises(storage.StorageError, match=needle):
            storage.put_supabase(config, "tok", "recipes/a.webp", WEBP, "image/webp", client=c)


def test_admin_folder_still_needs_admin(client, monkeypatch):
    monkeypatch.setattr(auth, "is_admin_token", lambda token: False)
    res = client.post("/api/uploads/image", params={"folder": "recipes", "name": "x"}, content=WEBP,
                      headers={"Content-Type": "image/webp", "Authorization": f"Bearer {hs_token()}"})
    assert res.status_code == 403
