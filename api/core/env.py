"""Load api/.env for local runs. Real environment variables (Vercel, shell) always win."""
import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def load_env_file(path: Path = ENV_FILE) -> list[str]:
    """Set KEY=value pairs not already in os.environ; skip blanks and .env.example placeholders."""
    if os.getenv("DISHWISH_SKIP_ENV_FILE") or not path.is_file():
        return []
    loaded = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        value = value.strip("\"'")
        if not key or not value or "YOUR_" in value.upper() or key in os.environ:
            continue
        os.environ[key] = value
        loaded.append(key)
    return loaded
