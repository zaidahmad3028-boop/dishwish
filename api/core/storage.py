"""Where uploaded images go: Cloudflare R2 when it is configured, otherwise Supabase Storage.

Supabase Storage uploads are sent with the signed-in user's own access token (plus the public anon key),
so no service key is needed: the storage policies in migration 0009 decide who may write where
(Super Admins: recipes/ and ingredients/; every user: only avatars/<their own id>-…). The bucket is
public-read, so the returned URL can be shown to everyone.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote

import httpx

from . import r2

BUCKET = "images"


class StorageError(Exception):
    pass


@dataclass(frozen=True)
class SupabaseStorage:
    url: str
    anon_key: str
    bucket: str = BUCKET

    def public_url(self, key: str) -> str:
        return f"{self.url}/storage/v1/object/public/{self.bucket}/{quote(key)}"


def supabase_config() -> SupabaseStorage | None:
    url, anon = os.getenv("SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not anon or "YOUR_" in url.upper() or "YOUR_" in anon.upper():
        return None
    return SupabaseStorage(url, anon, os.getenv("SUPABASE_STORAGE_BUCKET", BUCKET) or BUCKET)


def backend() -> tuple[str, object] | None:
    """('r2', R2Config) when R2 is set up, else ('supabase', SupabaseStorage), else None."""
    config = r2.load_config()
    if config is not None:
        return "r2", config
    sb = supabase_config()
    return ("supabase", sb) if sb else None


def put_supabase(config: SupabaseStorage, token: str, key: str, body: bytes, content_type: str,
                 client: httpx.Client | None = None) -> str:
    own = client is None
    client = client or httpx.Client(timeout=20)
    try:
        response = client.post(f"{config.url}/storage/v1/object/{config.bucket}/{quote(key)}", content=body,
                               headers={"Authorization": f"Bearer {token}", "apikey": config.anon_key,
                                        "Content-Type": content_type, "x-upsert": "false",
                                        "Cache-Control": "max-age=31536000"})
    except httpx.HTTPError as exc:
        raise StorageError("Could not reach Supabase Storage") from exc
    finally:
        if own:
            client.close()
    if response.status_code in (401, 403):
        raise StorageError("Supabase Storage refused the upload (check migration 0009 and your role)")
    if response.status_code == 404:
        raise StorageError(f"Storage bucket '{config.bucket}' not found (apply migration 0009)")
    if response.status_code >= 300:
        raise StorageError(f"Supabase Storage error (HTTP {response.status_code})")
    return config.public_url(key)
