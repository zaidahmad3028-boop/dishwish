"""Turn ChatGPT ingredient sheets (4x4 grids, see Desktop/dishwish-ingredient-sheets.md) into app pictures.

    <bg python> scripts/slice_ingredient_sheets.py C:\\Users\\<you>\\Desktop\\dishwish-sheets
    <bg python> scripts/slice_ingredient_sheets.py <folder> --only sheet-03.png      # redo one sheet

sheet-NN.png is cut into equal cells in the order of scripts/ingredient_sheets.json (left-to-right,
top-to-bottom). Each cell's background is removed with rembg (runs locally), the item is trimmed and
centred on a transparent 400x400 canvas, and saved as web/public/images/ingredients/<slug>.webp. The app
shows these floating on the card, like the reference designs. A review grid is written to <folder>/review.jpg.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/images/ingredients"
SIZE, PAD = 400, 0.08
sys.path.insert(0, str(ROOT / "scripts"))


def cutout(cell: Image.Image, session) -> Image.Image:
    from rembg import remove
    item = remove(cell, session=session)
    box = item.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box:
        raise ValueError("empty cell")
    item = item.crop(box)
    inner = int(SIZE * (1 - 2 * PAD))
    scale = min(inner / item.width, inner / item.height)
    item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(item, ((SIZE - item.width) // 2, (SIZE - item.height) // 2))
    return canvas


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("folder", type=Path)
    p.add_argument("--only", default="", help="comma-separated sheet file names")
    args = p.parse_args()
    from rembg import new_session
    session = new_session("isnet-general-use")
    sheets = json.loads((ROOT / "scripts/ingredient_sheets.json").read_text(encoding="utf-8"))
    only = {s.strip().lower() for s in args.only.split(",") if s.strip()}
    done: list[str] = []
    for n, slugs in enumerate(sheets, 1):
        files = [f for f in args.folder.glob(f"sheet-{n:02d}.*") if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]
        if not files or (only and files[0].name.lower() not in only):
            continue
        sheet = Image.open(files[0]).convert("RGB")
        cols, rows = 4, -(-len(slugs) // 4)
        w, h = sheet.width / cols, sheet.height / rows
        for k, slug in enumerate(slugs):
            r, c = divmod(k, cols)
            cell = sheet.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h)))
            try:
                cutout(cell, session).save(OUT / f"{slug}.webp", "WEBP", quality=90, lossless=False)
                done.append(slug)
            except ValueError:
                print(f"sheet {n:02d} cell {k + 1} ({slug}): nothing found, kept the old picture")
        print(f"sheet {n:02d}: {len(slugs)} cells")
    review(args.folder, done)
    mark_generated(done)
    print(f"{len(done)} ingredient pictures updated. Review grid: {args.folder / 'review.jpg'}")


def review(folder: Path, slugs: list[str]) -> None:
    if not slugs:
        return
    t, cols = 120, 12
    sheet = Image.new("RGB", (cols * (t + 8), -(-len(slugs) // cols) * (t + 22)), (253, 238, 232))
    d = ImageDraw.Draw(sheet)
    for k, s in enumerate(slugs):
        x, y = (k % cols) * (t + 8) + 4, (k // cols) * (t + 22) + 2
        im = Image.open(OUT / f"{s}.webp").convert("RGBA").resize((t, t))
        sheet.paste(im, (x, y), im)
        d.text((x, y + t + 4), s[:20], fill="black")
    sheet.save(folder / "review.jpg", quality=85)


def mark_generated(slugs: list[str]) -> None:
    """Record in image_sources.json that these pictures are owner-supplied (not Commons), for the credits page."""
    import fetch_images as fi
    sources = json.loads(fi.SOURCES.read_text(encoding="utf-8")) if fi.SOURCES.exists() else {}
    for s in slugs:
        sources.pop(f"ingredients/{s}", None)
    fi.SOURCES.write_text(json.dumps(sources, indent=1, ensure_ascii=False), encoding="utf-8")
    fi.write_outputs(sources)


if __name__ == "__main__":
    main()
