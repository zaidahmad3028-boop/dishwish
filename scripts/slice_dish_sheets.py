"""Cut ChatGPT dish sheets (2x2 grids in 3:2 landscape) into recipe pictures.

    python scripts/slice_dish_sheets.py <folder with dish-1.png ... dish-8.png>

Each cell is trimmed inside its thin white divider, centre-cropped to 3:2 and saved at 800x533 as
web/public/images/recipes/<slug>.webp. A review grid is written to <folder>/review.jpg.
Chicken Karahi, Biryani and Qorma keep the owner's pictures from the reference designs.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_images as fi  # noqa: E402

SHEETS = [
    ["chicken-tikka", "chicken-handi", "yakhni-pulao", "mutton-karahi"],
    ["aloo-gosht", "beef-nihari", "shami-kabab", "keema-matar"],
    ["chapli-kabab", "lahori-fish-fry", "prawn-karahi", "masoor-daal"],
    ["daal-mash", "chana-masala", "rajma", "aloo-palak"],
    ["aloo-gobi", "bhindi-masala", "baingan-bharta", "sarson-ka-saag"],
    ["aloo-paratha", "masala-omelette", "aloo-anday", "pakoray"],
    ["aloo-samosa", "fruit-chaat", "kheer", "sheer-khurma"],
    ["gajar-halwa", "kadhi-pakora", "chicken-corn-soup", "vegetable-pulao"],
]
SIZE = (800, 533)
TRIM = 6  # pixels inside the white divider and the sheet edge


def main() -> None:
    folder = Path(sys.argv[1])
    out = fi.IMAGES / "recipes"
    done: list[str] = []
    for n, slugs in enumerate(SHEETS, 1):
        path = folder / f"dish-{n}.png"
        if not path.exists():
            print(f"{path.name} missing, skipped")
            continue
        sheet = Image.open(path).convert("RGB")
        w, h = sheet.width / 2, sheet.height / 2
        for k, slug in enumerate(slugs):
            r, c = divmod(k, 2)
            box = (round(c * w) + TRIM, round(r * h) + TRIM, round((c + 1) * w) - TRIM, round((r + 1) * h) - TRIM)
            ImageOps.fit(sheet.crop(box), SIZE, Image.LANCZOS).save(out / f"{slug}.webp", "WEBP", quality=86)
            done.append(slug)
    sources = json.loads(fi.SOURCES.read_text(encoding="utf-8")) if fi.SOURCES.exists() else {}
    for slug in done:
        sources.pop(f"recipes/{slug}", None)
    fi.SOURCES.write_text(json.dumps(sources, indent=1, ensure_ascii=False), encoding="utf-8")
    fi.write_outputs(sources)
    t, cols = (240, 160), 6
    shown = sorted(p.stem for p in out.glob("*.webp"))
    grid = Image.new("RGB", (cols * (t[0] + 6), -(-len(shown) // cols) * (t[1] + 20)), "white")
    draw = ImageDraw.Draw(grid)
    for k, slug in enumerate(shown):
        x, y = (k % cols) * (t[0] + 6), (k // cols) * (t[1] + 20)
        grid.paste(Image.open(out / f"{slug}.webp").convert("RGB").resize(t), (x, y))
        draw.text((x + 2, y + t[1] + 3), slug, fill="black")
    grid.save(folder / "review.jpg", quality=84)
    print(f"{len(done)} dish pictures saved")


if __name__ == "__main__":
    main()
