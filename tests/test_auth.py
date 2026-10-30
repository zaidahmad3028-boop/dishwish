import base64
import hashlib
import hmac
import json
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
import jwt
import pytest

from api.index import app
from core import auth

URL = "https://example-ref.supabase.co"
SECRET = "test-secret-that-is-at-least-32-characters-long"
USER = "11111111-2222-4333-8444-555555555555"
EC_KEY = ec.generate_private_key(ec.SECP256R1())


def claims(**overrides):
    base = {"sub": USER, "aud": "authenticated", "role": "authenticated", "email": "cook@example.com",
            "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 3600}
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def hs_token(secret=SECRET, **overrides):
    return jwt.encode(claims(**overrides), secret, algorithm="HS256")


def es_token(key=EC_KEY, kid="key-1", **overrides):
    return jwt.encode(claims(**overrides), key, algorithm="ES256", headers={"kid": kid})


class FakeJwks:
    """Stands in for PyJWKClient: resolves `kid` against one known public key."""

    def __init__(self, key=EC_KEY, kid="key-1"):
        self.key, self.kid = key.public_key(), kid

    def get_signing_key_from_jwt(self, token):
        if jwt.get_unverified_header(token).get("kid") != self.kid:
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return type("SigningKey", (), {"key": self.key})()


def verify(token, secret=SECRET, url=URL, jwks=None):
    return auth.verify_token(token, secret=secret, supabase_url=url, jwks_client=jwks or FakeJwks())


def test_accepts_legacy_hs256():
    assert verify(hs_token())["sub"] == USER


def test_accepts_asymmetric_es256_from_jwks():
    assert verify(es_token())["email"] == "cook@example.com"


def test_trailing_slash_in_supabase_url_is_ignored():
    assert verify(hs_token(), url=URL + "/")["sub"] == USER


@pytest.mark.parametrize("token,message", [
    (hs_token(secret="another-secret-that-is-also-long-enough"), "Invalid token"),
    (hs_token(exp=int(time.time()) - 120), "Session expired"),
    (hs_token(aud="anon"), "Invalid token"),
    (hs_token(iss="https://evil.supabase.co/auth/v1"), "Invalid token"),
    (hs_token(sub=None), "Invalid token"),
    (hs_token(role="anon"), "Not a signed-in user"),
    (es_token(key=ec.generate_private_key(ec.SECP256R1())), "Invalid token"),
    (es_token(kid="unknown"), "Unknown signing key"),
    ("not-a-jwt", "Malformed token"),
])
def test_rejects_bad_tokens(token, message):
    with pytest.raises(auth.AuthError, match=message):
        verify(token)


def test_rejects_alg_none():
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=")
    body = base64.urlsafe_b64encode(json.dumps(claims()).encode()).rstrip(b"=")
    with pytest.raises(auth.AuthError, match="Unsupported"):
        verify(f"{header.decode()}.{body.decode()}.")


def test_hs256_signed_with_public_key_is_rejected():
    # Algorithm confusion: an attacker signs HS256 using the public key as the secret.
    public_pem = EC_KEY.public_key().public_bytes(serialization.Encoding.PEM,
                                                  serialization.PublicFormat.SubjectPublicKeyInfo)
    def b64(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=")
    signing_input = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()) + b"." + b64(json.dumps(claims()).encode())
    signature = hmac.new(public_pem, signing_input, hashlib.sha256).digest()
    forged = (signing_input + b"." + b64(signature)).decode()
    with pytest.raises(auth.AuthError):
        verify(forged)


def test_hs256_rejected_when_no_secret_configured():
    with pytest.raises(auth.AuthError, match="not accepted"):
        verify(hs_token(), secret=None)


def test_asymmetric_rejected_without_supabase_url():
    with pytest.raises(auth.AuthError, match="not accepted"):
        auth.verify_token(es_token(), secret=SECRET, supabase_url=None)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setattr(auth, "get_jwks_client", lambda url: FakeJwks())
    return TestClient(app)


def test_me_with_hs256(client):
    response = client.get("/api/me", headers={"Authorization": f"Bearer {hs_token()}"})
    assert response.status_code == 200
    assert response.json() == {"user_id": USER, "email": "cook@example.com"}


def test_me_with_es256(client):
    response = client.get("/api/me", headers={"Authorization": f"Bearer {es_token()}"})
    assert response.status_code == 200 and response.json()["user_id"] == USER


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer junk"}])
def test_me_requires_valid_bearer(client, headers):
    response = client.get("/api/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_health_and_recommend_stay_public(client):
    assert client.get("/api/health").status_code == 200
    response = client.post("/api/recommend", json={"selected_ingredients": ["Mutton"], "limit": 3,
                                                   "excluded_allergens": ["tomato", "corn"]})
    assert response.status_code == 200
    assert all(not {"tomato", "corn"} & set(row["allergens"]) for row in response.json()["recommendations"])
