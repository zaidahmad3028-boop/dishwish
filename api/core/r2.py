"""Cloudflare R2 storage (S3-compatible API) for recipe photos and uploads.

Server-only settings (api/.env or the Vercel project's env vars, never the web app):
    R2_ACCOUNT_ID         Cloudflare account id (R2 → Overview → Account details)
    R2_ACCESS_KEY_ID      R2 API token's access key id (Object Read & Write on the bucket)
    R2_SECRET_ACCESS_KEY  that token's secret access key
    R2_BUCKET             e.g. dishwish-images
    R2_PUBLIC_URL         the bucket's public base, e.g. https://pub-xxxx.r2.dev (same value as the
                          web app's VITE_IMAGE_BASE_URL)

Requests are signed with AWS Signature Version 4 (region "auto"), so no AWS SDK is needed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import os
from urllib.parse import quote

import httpx

ENV_NAMES = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL")
REGION, SERVICE = "auto", "s3"


class R2Error(Exception):
    pass


@dataclass(frozen=True)
class R2Config:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket: str
    public_url: str

    @property
    def host(self) -> str:
        return f"{self.account_id}.r2.cloudflarestorage.com"

    def public_object_url(self, key: str) -> str:
        return f"{self.public_url.rstrip('/')}/{quote(key)}"


def load_config() -> R2Config | None:
    """The R2 settings from the environment, or None when any is missing (uploads then report 503)."""
    values = [os.getenv(name, "").strip() for name in ENV_NAMES]
    return R2Config(*values) if all(values) else None


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def signed_headers(config: R2Config, method: str, key: str, body: bytes, content_type: str,
                   now: datetime | None = None) -> tuple[str, dict[str, str]]:
    """Return (url, headers) for an S3 request on `key`, signed with SigV4."""
    now = now or datetime.now(timezone.utc)
    amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    path = f"/{config.bucket}/{quote(key, safe='/')}"
    payload_hash = hashlib.sha256(body).hexdigest()
    headers = {"content-type": content_type, "host": config.host, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date}
    names = ";".join(sorted(headers))
    canonical = "\n".join([method, path, "", *(f"{k}:{headers[k]}" for k in sorted(headers)), "", names, payload_hash])
    scope = f"{day}/{REGION}/{SERVICE}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    signing_key = _sign(_sign(_sign(_sign(f"AWS4{config.secret_access_key}".encode(), day), REGION), SERVICE), "aws4_request")
    signature = hmac.new(signing_key, to_sign.encode(), hashlib.sha256).hexdigest()
    headers["authorization"] = (f"AWS4-HMAC-SHA256 Credential={config.access_key_id}/{scope}, "
                                f"SignedHeaders={names}, Signature={signature}")
    del headers["host"]  # httpx sets Host from the URL; it is still part of the signature
    return f"https://{config.host}{path}", headers


def put_object(config: R2Config, key: str, body: bytes, content_type: str, client: httpx.Client | None = None) -> str:
    """Upload `body` to `key` and return its public URL."""
    url, headers = signed_headers(config, "PUT", key, body, content_type)
    headers["cache-control"] = "public, max-age=31536000, immutable"
    owns_client = client is None
    client = client or httpx.Client(timeout=30)
    try:
        response = client.put(url, content=body, headers=headers)
    except httpx.HTTPError as exc:
        raise R2Error("Could not reach Cloudflare R2") from exc
    finally:
        if owns_client:
            client.close()
    if response.status_code not in (200, 201):
        raise R2Error(f"R2 refused the upload (HTTP {response.status_code})")
    return config.public_object_url(key)


IMAGE_TYPES = {"image/webp": "webp", "image/jpeg": "jpg", "image/png": "png"}
MAX_IMAGE_BYTES = 3 * 1024 * 1024


def sniff_image(body: bytes) -> str | None:
    """The real image type from the file's first bytes (the declared Content-Type is not trusted)."""
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return "image/webp"
    if body[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return None
