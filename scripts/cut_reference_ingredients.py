"""Cut the ingredient pictures straight out of the owner's reference screens (the designs they should match).

    <bg python> scripts/cut_reference_ingredients.py "<folder with the reference PNGs>"

Each picture is cropped from its card, the small card button is painted out, the background removed with rembg
(runs locally), and the item centred on a transparent 400x400 canvas in web/public/images/ingredients. The slugs go to
scripts/exact_ingredients.json so that later sheet imports leave them alone.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_images as fi  # noqa: E402
from slice_ingredient_sheets import OUT, cutout  # noqa: E402

PANTRY = "Dish-Wish Pantry Dashboard.png"
SELECT = "Dish-Wish Ingredient Selection Dashboard.png"
# Pantry grid: five columns, three rows; the "..." button sits at the card's top-right corner.
P_COLS = [(527, 663), (678, 815), (829, 966), (980, 1117), (1132, 1268)]
P_ROWS = [(352, 448), (535, 632), (719, 816)]
P_DOTS = [646, 798, 949, 1101, 1252]
PANTRY_ITEMS = {
    (0, 0): "chicken-breast", (0, 1): "tomato", (0, 2): "onion", (0, 3): "garlic", (0, 4): "green-chilli",
    (1, 0): "potato", (1, 1): "carrot", (1, 2): "capsicum", (1, 3): "fresh-coriander", (1, 4): "lemon",
    (2, 0): "yogurt-dahi", (2, 1): "milk", (2, 2): "eggs", (2, 3): "basmati-rice", (2, 4): "cooking-oil",
}
# Selection grid: only the two the pantry screen doesn't show.
SELECT_ITEMS = {"ginger": (1130, 292, 1262, 398), "cauliflower": (1130, 455, 1262, 562)}


def clean_cell(sheet: Image.Image, box: tuple[int, int, int, int], dots: tuple[int, int] | None) -> Image.Image:
    cell = sheet.crop(box).copy()
    if dots:  # paint the card's "..." button out with the card colour
        x, y = dots[0] - box[0], dots[1] - box[1]
        colour = tuple(int(v) for v in ImageStat.Stat(cell.crop((0, 0, 14, 14))).median)
        ImageDraw.Draw(cell).ellipse((x - 19, y - 19, x + 19, y + 19), fill=colour)
    return cell.resize((cell.width * 3, cell.height * 3), Image.LANCZOS)


def main() -> None:
    from rembg import new_session
    folder = Path(sys.argv[1])
    session = new_session("isnet-general-use")
    done: list[str] = []
    pantry = Image.open(folder / PANTRY).convert("RGB")
    for (r, c), slug in PANTRY_ITEMS.items():
        x0, x1 = P_COLS[c]
        y0, y1 = P_ROWS[r]
        cutout(clean_cell(pantry, (x0, y0, x1, y1), (P_DOTS[c], y0 + 16)), session).save(OUT / f"{slug}.webp", "WEBP", quality=92)
        done.append(slug)
    select = Image.open(folder / SELECT).convert("RGB")
    for slug, box in SELECT_ITEMS.items():
        cutout(clean_cell(select, box, None), session).save(OUT / f"{slug}.webp", "WEBP", quality=92)
        done.append(slug)
    (ROOT / "scripts/exact_ingredients.json").write_text(json.dumps(sorted(done), indent=1), encoding="utf-8")
    sources = json.loads(fi.SOURCES.read_text(encoding="utf-8"))
    for slug in done:
        sources.pop(f"ingredients/{slug}", None)
    fi.SOURCES.write_text(json.dumps(sources, indent=1, ensure_ascii=False), encoding="utf-8")
    fi.write_outputs(sources)
    print(len(done), "exact pictures saved")


if __name__ == "__main__":
    main()
