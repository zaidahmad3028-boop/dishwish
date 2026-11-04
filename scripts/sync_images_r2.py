"""Copy the images bundled in web/public/images to the Cloudflare R2 bucket, keeping the same paths.

    python scripts/sync_images_r2.py --dry-run   # list what would be uploaded
    python scripts/sync_images_r2.py             # upload (overwrites objects with the same path)

Needs the R2_* settings in api/.env (see api/.env.example). Then set the web app's
VITE_IMAGE_BASE_URL to the same value as R2_PUBLIC_URL, so the app loads these images from R2.
Prints object paths and public URLs only, never keys.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from core import r2  # noqa: E402
from core.env import load_env_file  # noqa: E402

IMAGES = ROOT / "web/public/images"
TYPES = {".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml"}


def bundled_images(folder: Path = IMAGES) -> list[tuple[str, Path, str]]:
    """(object key, file, content type) for every image under folder, keys using '/'."""
    return sorted((p.relative_to(folder).as_posix(), p, TYPES[p.suffix.lower()])
                  for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in TYPES)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    load_env_file(ROOT / "api/.env")
    files = bundled_images()
    config = r2.load_config()
    if args.dry_run or config is None:
        for key, path, kind in files:
            print(f"{key}  ({kind}, {path.stat().st_size // 1024} KB)")
        if config is None:
            raise SystemExit(f"\nR2 is not configured: set {', '.join(r2.ENV_NAMES)} in api/.env.")
        return
    with httpx.Client(timeout=60) as client:
        for key, path, kind in files:
            url = r2.put_object(config, key, path.read_bytes(), kind, client=client)
            print(f"uploaded {key} -> {url}")
    print(f"\n{len(files)} image(s) in R2. Set VITE_IMAGE_BASE_URL={config.public_url} on the web app and redeploy.")


if __name__ == "__main__":
    main()
