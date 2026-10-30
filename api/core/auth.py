"""Verify Supabase access tokens signed with either key type Supabase issues.

- Legacy shared secret: HS256 with SUPABASE_JWT_SECRET.
- Asymmetric signing keys (RS256 / ES256 / EdDSA): public keys fetched from
  SUPABASE_URL/auth/v1/.well-known/jwks.json and cached.
The token header's `alg` picks the path; each path only accepts its own algorithms,
so an HS256 token can never be checked against a public key (or the reverse).
"""
from functools import lru_cache
import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWKClient

ASYMMETRIC_ALGS = ("RS256", "ES256", "EdDSA")
LEEWAY_SECONDS = 30


class AuthError(Exception):
    pass


@lru_cache(maxsize=4)
def get_jwks_client(supabase_url: str) -> PyJWKClient:
    # Keys are cached for 10 minutes; an unknown `kid` triggers a refetch.
    return PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=5)


def verify_token(token: str, *, secret: str | None, supabase_url: str | None, jwks_client=None) -> dict:
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as exc:
        raise AuthError("Malformed token") from exc
    url = (supabase_url or "").rstrip("/") or None
    if alg == "HS256":
        if not secret:
            raise AuthError("Token type not accepted")
        key = secret
    elif alg in ASYMMETRIC_ALGS:
        if not url and jwks_client is None:
            raise AuthError("Token type not accepted")
        try:
            key = (jwks_client or get_jwks_client(url)).get_signing_key_from_jwt(token).key
        except jwt.PyJWTError as exc:
            raise AuthError("Unknown signing key") from exc
    else:
        raise AuthError("Unsupported token algorithm")
    try:
        claims = jwt.decode(token, key, algorithms=[alg], audience="authenticated",
                            issuer=f"{url}/auth/v1" if url else None, leeway=LEEWAY_SECONDS,
                            options={"require": ["exp", "sub", "aud"]})
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Session expired") from exc
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid token") from exc
    if claims.get("role") != "authenticated":
        raise AuthError("Not a signed-in user")
    return claims


_bearer = HTTPBearer(auto_error=False)


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """FastAPI dependency: the verified claims of the signed-in Supabase user."""
    unauthorized = {"status_code": 401, "headers": {"WWW-Authenticate": "Bearer"}}
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(detail="Sign in required", **unauthorized)
    try:
        # Read per request so Vercel env changes apply without code changes.
        return verify_token(credentials.credentials, secret=os.getenv("SUPABASE_JWT_SECRET"),
                            supabase_url=os.getenv("SUPABASE_URL"))
    except AuthError as exc:
        raise HTTPException(detail=str(exc), **unauthorized) from exc
