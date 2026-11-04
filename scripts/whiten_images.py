"""Make every ingredient picture fit its round badge: piles fill the circle, single items sit on white.

    <python with rembg> scripts/whiten_images.py                 # all ingredients
    <python with rembg> scripts/whiten_images.py --only tomato,green-chilli --mode whole

- fill  (dals, rice, flours, spices, seeds, nuts, qeema, sugar...): the photo is cropped so the food fills
        the whole circle, edge to edge.
- whole (a chilli, a tomato, a fish, a bottle...): the background is removed with rembg (runs locally,
        no upload) and the complete item is centred on pure white with even space around it.
The source photo is the one recorded in scripts/image_sources.json (from scripts/fetch_images.py), downloaded
again at full size. rembg is a tool dependency only, not an app dependency:
    python -m venv C:\\Users\\<you>\\.dishwish-bgtool && C:\\Users\\<you>\\.dishwish-bgtool\\Scripts\\pip install "rembg[cpu]" httpx
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
import re
import sys

import httpx
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from engine.categories import display_group  # noqa: E402

UA = "DishWishImageFetcher/1.0 (https://github.com/zaidahmad3028-boop/dishwish) python-httpx"
WIKI = "https://en.wikipedia.org/w/api.php"
OUT = ROOT / "web/public/images/ingredients"
SIZE = 400
FILL_GROUPS = {"Grains & Flours", "Pulses & Lentils", "Nuts, Seeds & Dry Fruits", "Spices & Masalas"}
FILL_NAMES = {"Chicken Qeema", "Mutton Qeema", "Beef Qeema", "White Sugar", "Baking Powder", "Baking Soda",
              "Custard Powder", "Khoya (Mawa)", "Chicken Boneless (Boti)", "Chicken Gizzard (Gizzi)", "Beef Tripe (Ojri)"}
# Single, recognisable items inside those groups: show the whole thing on white instead.
WHOLE_NAMES = {"Cinnamon (Dalchini)", "Star Anise", "Nutmeg (Jaifal)", "Bay Leaf (Tez Patta)", "Whole Red Chilli (Sabut Lal Mirch)",
               "Black Cardamom (Bari Elaichi)", "Tamarind (Imli)", "Walnuts (Akhrot)", "Almonds (Badam)", "Fresh Coconut",
               "Tea Leaves (Chai Patti)", "Salt"}


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def mode_for(kind: str, name: str) -> str:
    if name in WHOLE_NAMES:
        return "whole"
    if name in FILL_NAMES or display_group(kind, name) in FILL_GROUPS:
        return "fill"
    return "whole"


def on_white(cutout: Image.Image, pad: float = 0.12) -> Image.Image:
    """Centre the visible part of an RGBA cutout on a white square with `pad` space on every side."""
    box = cutout.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox() or (0, 0, *cutout.size)
    item = cutout.crop(box)
    inner = int(SIZE * (1 - 2 * pad))
    scale = min(inner / item.width, inner / item.height)
    item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), "white")
    canvas.paste(item, ((SIZE - item.width) // 2, (SIZE - item.height) // 2), item)
    return canvas


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="")
    parser.add_argument("--mode", choices=["fill", "whole"], help="override the automatic choice (with --only)")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    from rembg import new_session, remove  # imported here: only the bg tool's Python has it

    only = {s for s in args.only.split(",") if s}
    sources = json.loads((ROOT / "scripts/image_sources.json").read_text(encoding="utf-8"))
    rows = json.loads((ROOT / "api/engine/ingredients.json").read_text(encoding="utf-8"))
    todo = [(r["name"], r["category"]) for r in rows if not only or slugify(r["name"]) in only]
    session = new_session("isnet-general-use")
    http = httpx.Client(headers={"User-Agent": UA}, timeout=60, follow_redirects=True)

    def source_image(slug: str) -> Image.Image | None:
        entry = sources.get(f"ingredients/{slug}")
        if not entry or not entry.get("chosen"):
            return None
        title = entry["candidates"][entry["chosen"] - 1]["title"]
        info = http.get(WIKI, params={"action": "query", "format": "json", "titles": title, "prop": "imageinfo",
                                      "iiprop": "url", "iiurlwidth": 1200}).json()
        page = next(iter(info["query"]["pages"].values()))
        url = page["imageinfo"][0].get("thumburl") or page["imageinfo"][0]["url"]
        return ImageOps.exif_transpose(Image.open(BytesIO(http.get(url).content))).convert("RGB")

    def one(row: tuple[str, str]) -> str:
        name, kind = row
        slug = slugify(name)
        mode = args.mode or mode_for(kind, name)
        try:
            img = source_image(slug)
        except (httpx.HTTPError, KeyError, OSError, StopIteration) as exc:
            return f"{name}: source failed ({exc})"
        if img is None:
            return f"{name}: no recorded source, left as is"
        if mode == "fill":
            ImageOps.fit(img, (SIZE, SIZE), Image.LANCZOS).save(OUT / f"{slug}.webp", "WEBP", quality=84)
        else:
            on_white(remove(img, session=session)).save(OUT / f"{slug}.webp", "WEBP", quality=88)
        return f"{name}: {mode}"

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for n, line in enumerate(pool.map(one, todo), 1):
            print(f"[{n}/{len(todo)}] {line}", flush=True)


if __name__ == "__main__":
    main()
