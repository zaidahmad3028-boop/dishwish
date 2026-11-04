"""Image uploads to Cloudflare R2: admin-only endpoint, file checks and SigV4-signed PUT (no network)."""
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import httpx
import pytest

from api.index import app
from core import auth, r2
from test_auth import SECRET, URL, hs_token

WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 24
CONFIG = r2.R2Config("acct123", "AKIDEXAMPLE", "secret-example", "dishwish-images", "https://pub-test.r2.dev")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    for name, value in zip(r2.ENV_NAMES, ("acct123", "AKIDEXAMPLE", "secret-example", "dishwish-images", "https://pub-test.r2.dev")):
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(auth, "is_admin_token", lambda token: True)
    return TestClient(app)


def upload(client, body=WEBP, token=None, **params):
    headers = {"Content-Type": "image/webp", **({"Authorization": f"Bearer {token}"} if token else {})}
    return client.post("/api/uploads/image", params={"folder": "recipes", "name": "chicken-karahi", **params},
                       content=body, headers=headers)


def test_upload_needs_sign_in_and_admin(client, monkeypatch):
    assert upload(client).status_code == 401
    monkeypatch.setattr(auth, "is_admin_token", lambda token: False)
    assert upload(client, token=hs_token()).status_code == 403


def test_upload_checks_the_file_itself(client):
    assert upload(client, body=b"<svg onload=alert(1)>", token=hs_token()).status_code == 415
    assert upload(client, body=WEBP + b"\x00" * r2.MAX_IMAGE_BYTES, token=hs_token()).status_code == 413
    assert upload(client, token=hs_token(), name="../etc").status_code == 422


def test_upload_reports_missing_storage_settings(client, monkeypatch):
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY")
    assert upload(client, token=hs_token()).status_code == 503
    assert client.get("/api/uploads/status").json() == {"configured": False, "public_url": None}


def test_upload_puts_a_signed_object_and_returns_its_public_url(client, monkeypatch):
    seen, real_put = {}, r2.put_object

    def fake_put(config, key, body, kind):
        transport = httpx.MockTransport(lambda request: seen.update(request=request) or httpx.Response(200))
        with httpx.Client(transport=transport) as fake:
            return real_put(config, key, body, kind, client=fake)

    monkeypatch.setattr(r2, "put_object", fake_put)
    response = upload(client, token=hs_token())
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["key"].startswith("recipes/chicken-karahi-") and data["key"].endswith(".webp")
    assert data["url"] == f"https://pub-test.r2.dev/{data['key']}"
    request = seen["request"]
    assert request.method == "PUT"
    assert str(request.url) == f"https://acct123.r2.cloudflarestorage.com/dishwish-images/{data['key']}"
    assert request.headers["authorization"].startswith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/")
    assert "/auto/s3/aws4_request" in request.headers["authorization"]
    assert request.content == WEBP


def test_signature_is_deterministic_and_covers_the_body():
    when = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
    url, one = r2.signed_headers(CONFIG, "PUT", "recipes/a b.webp", b"x", "image/webp", now=when)
    _, same = r2.signed_headers(CONFIG, "PUT", "recipes/a b.webp", b"x", "image/webp", now=when)
    _, other = r2.signed_headers(CONFIG, "PUT", "recipes/a b.webp", b"y", "image/webp", now=when)
    assert url == "https://acct123.r2.cloudflarestorage.com/dishwish-images/recipes/a%20b.webp"
    assert one == same and one["authorization"] != other["authorization"]
    assert one["x-amz-date"] == "20261101T120000Z"
    assert "Credential=AKIDEXAMPLE/20261101/auto/s3/aws4_request" in one["authorization"]
    assert "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date" in one["authorization"]


def test_sniff_image():
    assert r2.sniff_image(WEBP) == "image/webp"
    assert r2.sniff_image(b"\xff\xd8\xff\xe0rest") == "image/jpeg"
    assert r2.sniff_image(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert r2.sniff_image(b"GIF89a") is None


def test_any_signed_in_user_can_upload_only_their_own_avatar(client, monkeypatch):
    monkeypatch.setattr(auth, "is_admin_token", lambda token: False)  # not an admin
    monkeypatch.setattr(r2, "put_object", lambda config, key, body, kind: config.public_object_url(key))
    assert client.post("/api/uploads/avatar", content=WEBP, headers={"Content-Type": "image/webp"}).status_code == 401
    response = client.post("/api/uploads/avatar", content=WEBP,
                           headers={"Content-Type": "image/webp", "Authorization": f"Bearer {hs_token(sub='user-123')}"})
    assert response.status_code == 200, response.text
    assert response.json()["key"].startswith("avatars/user-123-")
    bad = client.post("/api/uploads/avatar", content=b"not an image",
                      headers={"Content-Type": "image/webp", "Authorization": f"Bearer {hs_token()}"})
    assert bad.status_code == 415
