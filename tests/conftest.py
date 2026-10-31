"""Match the api/ project root used by uvicorn and Vercel."""
import os
import sys
from pathlib import Path

os.environ.setdefault('DISHWISH_SKIP_ENV_FILE', '1')  # tests never read a developer's api/.env
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'api'))
