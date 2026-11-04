"""Hand-pick ingredient pictures by their final look (needs the rembg tool Python, see whiten_images.py).

    <bg python> scripts/pick_ingredient_images.py candidates --only tomato,green-chilli --out <dir>
        For each slug: up to 8 Commons photos (free licences only), each rendered exactly as the app will show
        it (cut out on white, or filling the circle for piles), in numbered grids <dir>/g*.jpg, plus
        <dir>/candidates.json.
    <bg python> scripts/pick_ingredient_images.py apply --out <dir> --choose tomato=3,green-chilli=1
        Saves the chosen renderings to web/public/images/ingredients and records each photo's source, author
        and licence in scripts/image_sources.json (for docs/IMAGE_CREDITS.md).
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
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_images as fi  # noqa: E402
import whiten_images as wi  # noqa: E402

NOT_FOOD = re.compile(r"(people|\bmen\b|women|portrait|births|living|building|house|street|drawing|illustration|painting|"
                      r"botanical|diagram|anatomy|logo|advert|poster|postcard|map|chart|cartoon|engraving|stamp|coin)", re.I)
EXTRA = {  # better search words for items Commons names differently
    "potato": ["potatoes", "potato tuber"], "eggs": ["chicken eggs", "brown eggs"], "milk": ["glass of milk", "milk"],
    "fig-anjeer": ["fresh figs", "fig fruit"], "apple": ["red apple", "apple fruit"], "corn-makai": ["corn on the cob", "maize ear"],
    "peach-aarhoo": ["peach fruit", "peaches"], "melon-kharbooza": ["muskmelon", "cantaloupe"], "yam-jimikand": ["elephant foot yam", "yam tuber"],
    "kinnow": ["kinnow", "mandarin orange"], "buttermilk-chaas": ["buttermilk", "chaas"], "khoya-mawa": ["khoa", "mawa"],
    "spinach": ["spinach leaves", "spinach bunch"], "green-chilli": ["green chili pepper", "green chillies"],
    "okra-bhindi": ["okra", "lady finger vegetable"], "cabbage": ["cabbage head", "green cabbage"],
    "fresh-mint-pudina": ["mint leaves", "fresh mint"], "radish-mooli": ["daikon", "white radish"], "lettuce-salad-patta": ["lettuce", "iceberg lettuce"],
    "mustard-greens-sarson-saag": ["mustard greens", "Brassica juncea"], "apple-gourd-tinda": ["tinda", "Praecitrullus fistulosus"],
    "green-beans-fali": ["green beans", "french beans"], "cluster-beans-gwar-phali": ["cluster beans", "guar beans"],
    "raw-banana-kela": ["green banana", "plantain"], "bathua": ["Chenopodium album", "lambsquarters"],
    "mulberry-shahtoot": ["mulberries", "mulberry fruit"], "amla-gooseberry": ["amla", "Indian gooseberry"],
    "jackfruit-kathal": ["jackfruit", "jackfruit fruit"], "milk-powder": ["milk powder", "powdered milk"],
    # meat cuts: English names only (the Urdu words match waterfalls and flowers on Commons)
    "chicken-breast": ["chicken breast fillet", "raw chicken fillet", "chicken breasts raw"],
    "chicken-boneless-boti": ["diced chicken", "chicken cubes", "chicken pieces raw"],
    "chicken-leg-piece": ["chicken leg quarter", "raw chicken legs", "chicken legs"],
    "chicken-drumstick": ["chicken drumsticks raw", "drumsticks chicken"], "chicken-liver": ["chicken livers raw", "chicken liver raw"],
    "mutton-leg-raan": ["leg of lamb", "lamb leg raw", "goat leg meat"], "mutton-shoulder": ["lamb shoulder", "shoulder of lamb", "goat shoulder"],
    "mutton-ribs-chaap": ["lamb ribs raw", "rack of lamb", "lamb chops raw"],
}
ENGLISH_ONLY = {"chicken-breast", "chicken-boneless-boti", "chicken-leg-piece", "chicken-drumstick", "chicken-liver",
                "mutton-leg-raan", "mutton-shoulder", "mutton-ribs-chaap"}
CELL = 150


def terms_for(name: str, slug: str, kind: str) -> list[str]:
    if slug in ENGLISH_ONLY:
        return EXTRA[slug]
    plain = re.sub(r"\s*\(.*?\)", "", name).strip()
    raw = "raw " if kind == "Meat" and "Fish" not in name and name != "Prawns" else ""
    return list(dict.fromkeys([*EXTRA.get(slug, []), f"{raw}{plain}", f"{raw}{plain} isolated", f"{plain} white background",
                               *re.findall(r"\((.*?)\)", name)]))[:5]


def render(img: Image.Image, mode: str, session) -> Image.Image:
    from rembg import remove
    if mode == "fill":
        return ImageOps.fit(img, (wi.SIZE, wi.SIZE), Image.LANCZOS)
    return wi.on_white(remove(img, session=session))


def candidates(args) -> None:
    from rembg import new_session
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    rows = {wi.slugify(r["name"]): r for r in json.loads((ROOT / "api/engine/ingredients.json").read_text(encoding="utf-8"))}
    slugs = [s for s in args.only.split(",") if s in rows]
    session = new_session("isnet-general-use")
    found: dict[str, list[dict]] = {}

    def one(slug: str):
        r = rows[slug]
        f = fi.Fetcher()
        mode = args.mode or wi.mode_for(r["category"], r["name"])
        titles = []
        exact = f.exact_article_image(re.sub(r"\s*\(.*?\)", "", r["name"]).strip())
        if exact:
            titles.append(exact)
        for t in terms_for(r["name"], slug, r["category"]):
            try:
                titles += f.commons_files(t, dish=False, limit=10)
            except httpx.HTTPError:
                pass
        titles = list(dict.fromkeys(titles))
        picks = []
        for info in f.image_info(titles) if titles else []:
            if info.get("mime") not in ("image/jpeg", "image/png", "image/webp") or fi.meta(info, "NonFree"):
                continue
            if not fi.FREE.match(fi.meta(info, "LicenseShortName")) or min(info["width"], info["height"]) < 300:
                continue
            if NOT_FOOD.search(fi.meta(info, "Categories")) or NOT_FOOD.search(info["title"]):
                continue
            try:
                url = (info.get("thumburl") or info["url"]).replace("/1600px-", "/900px-")
                img = ImageOps.exif_transpose(Image.open(BytesIO(f.http.get(url).content))).convert("RGB")
                picks.append(({"title": info["title"], "page": info.get("descriptionurl"), "author": fi.meta(info, "Artist")[:120],
                               "license": fi.meta(info, "LicenseShortName"), "size": f"{info['width']}x{info['height']}", "mode": mode},
                              render(img, mode, session)))
            except (httpx.HTTPError, OSError):
                continue
            if len(picks) == 8:
                break
        for k, (_, im) in enumerate(picks, 1):
            im.save(out / f"{slug}--{k}.webp", "WEBP", quality=88)
        return slug, [p for p, _ in picks]

    with ThreadPoolExecutor(3) as pool:
        for slug, metas in pool.map(one, slugs):
            found[slug] = metas
            print(f"{slug}: {len(metas)} candidates", flush=True)
    (out / "candidates.json").write_text(json.dumps(found, indent=1, ensure_ascii=False), encoding="utf-8")
    grid(out, slugs, found)


def grid(out: Path, slugs: list[str], found: dict) -> None:
    mask = Image.new("L", (CELL, CELL), 0); ImageDraw.Draw(mask).ellipse((0, 0, CELL - 1, CELL - 1), fill=255)
    per = 6
    for page in range(0, len(slugs), per):
        chunk = slugs[page:page + per]
        sheet = Image.new("RGB", (200 + 8 * (CELL + 8), len(chunk) * (CELL + 10)), (222, 222, 222))
        d = ImageDraw.Draw(sheet)
        for r, slug in enumerate(chunk):
            y = r * (CELL + 10) + 5
            d.text((6, y + CELL // 2 - 6), slug[:30], fill="black")
            for k in range(1, len(found.get(slug, [])) + 1):
                x = 200 + (k - 1) * (CELL + 8)
                sheet.paste(Image.open(out / f"{slug}--{k}.webp").convert("RGB").resize((CELL, CELL)), (x, y), mask)
                d.rectangle((x, y, x + 18, y + 16), fill="black"); d.text((x + 5, y + 2), str(k), fill="white")
        sheet.save(out / f"g{page // per + 1}.jpg", quality=82)


def apply(args) -> None:
    out = Path(args.out)
    found = json.loads((out / "candidates.json").read_text(encoding="utf-8"))
    sources_path = ROOT / "scripts/image_sources.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8"))
    names = {wi.slugify(r["name"]): r["name"] for r in json.loads((ROOT / "api/engine/ingredients.json").read_text(encoding="utf-8"))}
    for pair in filter(None, args.choose.split(",")):
        slug, k = pair.split("=")
        meta = found[slug][int(k) - 1]
        Image.open(out / f"{slug}--{k}.webp").save(wi.OUT / f"{slug}.webp", "WEBP", quality=88)
        sources[f"ingredients/{slug}"] = {"name": names[slug], "chosen": 1, "candidates": [meta]}
        print(f"{slug}: {meta['title']} ({meta['license']})")
    sources_path.write_text(json.dumps(sources, indent=1, ensure_ascii=False), encoding="utf-8")
    fi.write_outputs(sources)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["candidates", "apply"])
    p.add_argument("--only", default="")
    p.add_argument("--out", required=True)
    p.add_argument("--mode", choices=["fill", "whole"])
    p.add_argument("--choose", default="")
    args = p.parse_args()
    candidates(args) if args.command == "candidates" else apply(args)


if __name__ == "__main__":
    main()
