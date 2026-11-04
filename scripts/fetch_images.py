"""Find free-licence photos for every recipe and ingredient on Wikimedia Commons, crop them to the app's
standard sizes and record credits.

    python scripts/fetch_images.py                 # fetch everything still missing
    python scripts/fetch_images.py --only beef-nihari,tomato --pick 2   # use the 2nd-best candidate

Sources: the lead photo of the matching Wikipedia article (usually the clearest picture of the dish or
ingredient) and a Commons file search. Only freely licensed files (CC BY / CC BY-SA / CC0 / public domain)
are used; each one's author and licence go to docs/IMAGE_CREDITS.md, as those licences require.
Preference: straight, centred shots that are not panoramas, at a good resolution.

Outputs (same paths locally and in the R2 bucket):
    web/public/images/recipes/<slug>.webp       800×533 (3:2)
    web/public/images/ingredients/<slug>.webp   400×400 (square)
    web/src/lib/photoManifest.ts                which slugs have a photo (read by the web app)
    scripts/image_sources.json                  chosen file and ranked alternatives per item
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import html
from io import BytesIO
import json
from pathlib import Path
import re
import sys
import threading
import time

import httpx
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from engine.curated_data import RECIPES  # noqa: E402
from engine.data import load_ingredients  # noqa: E402

UA = "DishWishImageFetcher/1.0 (https://github.com/zaidahmad3028-boop/dishwish) python-httpx"
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS_SEARCH = "https://api.wikimedia.org/core/v1/commons/search/page"
IMAGES = ROOT / "web/public/images"
SOURCES = ROOT / "scripts/image_sources.json"
CREDITS = ROOT / "docs/IMAGE_CREDITS.md"
MANIFEST = ROOT / "web/src/lib/photoManifest.ts"
SIZES = {"recipes": (800, 533), "ingredients": (400, 400)}
FREE = re.compile(r"^(cc[ -]?by(?![ -]?nc)|cc[ -]?zero|cc0|public domain|pd|gfdl|attribution|fal)", re.I)
BAD_WORDS = re.compile(r"(map|logo|diagram|drawing|illustration|icon|flag|chart|sign|label|menu|poster|stamp|coat of arms|"
                       r"restaurant|shop|store|market|stall|vendor|festival|people|man |woman|girl|boy|portrait|"
                       r"advert|packag|bottle label|screenshot|svg|collage|montage|millot|lithograph|engraving|painting|botanical|"
                       r"herbarium|specimen|k.hler|woodwill|plate \d|still life|stilleben|cartoon|clipart)", re.I)
FILLER = {"jpg", "jpeg", "png", "webp", "file", "raw", "fresh", "whole", "uncooked", "and", "the", "with", "of", "in", "on",
          "a", "an", "img", "dsc", "dscn", "photo", "close", "up", "closeup", "macro", "top", "view"}
# An ingredient photo must show the ingredient itself, not a cooked dish (unless the word is part of its name).
DISH_WORDS = {"pizza", "naan", "curry", "biryani", "sandwich", "burger", "soup", "salad", "cake", "paratha", "karahi",
              "kebab", "kabab", "tikka", "pulao", "recipe", "dish", "meal", "plate", "thali", "platter", "fried", "fry",
              "grilled", "grill", "roast", "roasted", "bbq", "barbecue", "cooked", "stew", "served", "fries", "chips",
              "tandoori", "masala", "korma", "nihari", "haleem", "pakora", "samosa", "dinner", "lunch", "breakfast",
              "buffet", "wedding", "pickled", "pickle", "dessert", "sweet", "halwa", "candy", "drink", "cocktail",
              "frito", "frita", "fritos", "frit", "gebraten", "aioli", "pate", "pates", "omelette", "omelet", "boiled",
              "scrambled", "poached", "baked", "smoked", "cured", "buffalo", "bbq", "steak", "chops", "spit", "skewer",
              "sauteed", "stuffed", "glazed", "marinated", "jerky", "sausage", "ham", "bacon", "noodles", "pasta",
              "ice", "icecream", "chocolate", "nestle", "nestl", "cone", "lolly", "biscuit", "cookie", "pie", "dog", "hot",
              "gulab", "flower", "flowers", "blossom", "blossoms", "leaves", "leaf", "tree", "trees", "field", "farm",
              "seedling", "seedlings", "plant", "plants", "plantation", "crop", "crops", "garden", "vine", "orchard",
              "harvest", "farmer", "seller", "selling", "sale", "vampire"}
INGREDIENT_HINT = {"Meat": "raw", "Vegetables": "vegetable", "Fruits": "fruit", "Spices": "spice", "Pulses & Nuts": "",
                   "Dairy": "", "Grocery": "", "Oils & Sauces": ""}
# Better search words for names that Wikipedia/Commons know differently.
ALIASES = {
    "chicken-tikka": ["Chicken tikka"], "yakhni-pulao": ["Yakhni pulao", "Chicken pulao"],
    "beef-nihari": ["Nihari"], "masoor-daal": ["Masoor dal", "Dal tadka"], "daal-mash": ["Urad dal", "Dal makhani"],
    "chana-masala": ["Chana masala"], "rajma": ["Rajma"], "aloo-palak": ["Aloo palak", "Saag aloo"],
    "aloo-gobi": ["Aloo gobi"], "bhindi-masala": ["Bhindi masala", "Okra curry"], "baingan-bharta": ["Baingan bharta"],
    "sarson-ka-saag": ["Sarson da saag"], "aloo-paratha": ["Aloo paratha"], "masala-omelette": ["Masala omelette"],
    "aloo-anday": ["Egg curry"], "pakoray": ["Pakora"], "aloo-samosa": ["Samosa"], "fruit-chaat": ["Fruit chaat"],
    "kheer": ["Kheer"], "sheer-khurma": ["Sheer khurma"], "gajar-halwa": ["Gajar ka halwa"], "kadhi-pakora": ["Kadhi"],
    "chicken-corn-soup": ["Chicken corn soup", "Sweet corn soup"], "vegetable-pulao": ["Pulao", "Vegetable pulao"],
    "chicken-handi": ["Chicken handi", "Handi (food)"], "mutton-karahi": ["Karahi gosht", "Mutton karahi"],
    "aloo-gosht": ["Aloo gosht"], "shami-kabab": ["Shami kebab"], "keema-matar": ["Keema matar", "Keema"],
    "chapli-kabab": ["Chapli kebab"], "lahori-fish-fry": ["Lahori fish", "Fried fish"], "prawn-karahi": ["Prawn curry"],
    # ingredients: the names Commons uses for the raw item
    "beef-qeema": ["raw ground beef", "minced beef"], "mutton-qeema": ["minced lamb", "raw ground lamb"],
    "chicken-qeema": ["raw ground chicken", "minced chicken"], "chicken-drumstick": ["raw chicken drumsticks", "raw chicken legs"],
    "chicken-leg-piece": ["raw chicken legs", "raw chicken leg quarter"], "beef-boneless": ["raw beef", "beef meat"],
    "chicken-boneless-boti": ["raw chicken cubes", "raw chicken breast"], "mutton-paya": ["goat trotters", "lamb trotters"],
    "beef-nihari-shank": ["raw beef shank", "beef shank"], "mutton-leg-raan": ["raw leg of lamb", "leg of lamb"],
    "mutton-shoulder": ["raw lamb shoulder", "lamb shoulder"], "mutton-ribs-chaap": ["raw lamb ribs", "lamb ribs"],
    "mutton-chops": ["raw lamb chops"], "mutton-liver-kaleji": ["raw lamb liver", "raw liver"],
    "mutton-kidney-gurda": ["lamb kidneys", "raw kidney"], "mutton-brain-maghaz": ["lamb brain", "raw brain"],
    "chicken-gizzard-gizzi": ["chicken gizzards", "raw gizzard"],
}


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def search_terms(name: str, slug: str, category: str | None = None) -> list[str]:
    terms = list(ALIASES.get(slug, []))
    plain = re.sub(r"\s*\(.*?\)", "", name).strip()
    inner = re.findall(r"\((.*?)\)", name)
    if category == "Meat":
        base = plain.split()[0]
        first = [f"raw {plain}", plain, f"raw {base}"]   # the raw cut, not a cooked dish; then the raw meat itself
    elif category:
        hint = INGREDIENT_HINT.get(category, "")
        first = [plain, f"{plain} {hint}".strip()]
    else:
        first = [plain, name]
    for t in [*first, *inner]:
        if t and t not in terms:
            terms.append(t)
    return terms


class Fetcher:
    def __init__(self):
        self.http = httpx.Client(headers={"User-Agent": UA}, timeout=40, follow_redirects=True)

    def get(self, url: str, **params) -> dict:
        for attempt in range(4):
            r = self.http.get(url, params=params)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 + attempt * 3)
                continue
            r.raise_for_status()
            return r.json()
        r.raise_for_status()
        return {}

    def article_images(self, term: str) -> tuple[list[str], set[str]]:
        """(lead photos of the top articles, the subset whose article is exactly about `term`)."""
        data = self.get(WIKI, action="query", format="json", redirects=1, generator="search", gsrsearch=term,
                        gsrlimit=3, prop="pageimages", piprop="name")
        pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        want = set(re.findall(r"[a-z]+", term.lower())) - {"raw", "fresh", "vegetable", "fruit", "spice", "food"}
        files, exact = [], set()
        for p in pages:
            if not p.get("pageimage"):
                continue
            title = f"File:{p['pageimage'].replace('_', ' ')}"
            files.append(title)
            got = set(re.findall(r"[a-z]+", re.sub(r"\(.*?\)", "", p["title"].lower())))
            if got and got <= want | {"as", "food"}:
                exact.add(title)
        return files, exact

    def exact_article_image(self, term: str) -> str | None:
        """Lead photo of the article titled exactly `term` (following redirects: Corn -> Maize)."""
        data = self.get(WIKI, action="query", format="json", redirects=1, titles=term, prop="pageimages|pageprops",
                        piprop="name")
        for p in data.get("query", {}).get("pages", {}).values():
            if p.get("pageimage") and "disambiguation" not in p.get("pageprops", {}):
                return f"File:{p['pageimage'].replace('_', ' ')}"
        return None

    def commons_files(self, term: str, dish: bool, limit: int = 12) -> list[str]:
        data = self.get(COMMONS_SEARCH, q=f"{term} food" if dish and len(term.split()) == 1 else term, limit=limit)
        return [p["key"].replace("_", " ") for p in data.get("pages", []) if p["key"].startswith("File:")]

    def image_info(self, titles: list[str]) -> list[dict]:
        out = []
        for i in range(0, len(titles), 40):
            data = self.get(WIKI, action="query", format="json", titles="|".join(titles[i:i + 40]), prop="imageinfo",
                            iiprop="url|size|mime|extmetadata", iiurlwidth=1600, iiextmetadatafilter=
                            "Categories|LicenseShortName|NonFree|Artist|ImageDescription")
            for p in data.get("query", {}).get("pages", {}).values():
                if p.get("imageinfo"):
                    out.append({"title": p["title"], **p["imageinfo"][0]})
        return out


def meta(info: dict, key: str) -> str:
    raw = info.get("extmetadata", {}).get(key, {}).get("value", "") or ""
    return html.unescape(re.sub(r"<[^>]+>", "", raw)).strip()


def score(info: dict, folder: str, name_tokens: set[str], lead: set[str]) -> float | None:
    if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None
    if meta(info, "NonFree") or not FREE.match(meta(info, "LicenseShortName")):
        return None
    w, h = info["width"], info["height"]
    tw, th = SIZES[folder]
    if w < tw or h < th:
        return None
    ratio = w / h
    lo, hi = (0.6, 2.0) if folder == "ingredients" else (0.7, 1.8)   # ingredients are cropped square
    if not lo <= ratio <= hi:               # panoramas and tall strips: subject rarely centred
        return None
    title = info["title"].lower()
    words = set(re.findall(r"[a-z]+", title))
    cats = meta(info, "Categories").lower()
    if re.search(r"(people|men|women|portrait|politician|musician|actor|person|building|house|shop|store|street|"
                 r"restaurant|drawing|illustration|painting|botanical|engraving|artwork|logo|births|living|suits|"
                 r"athletes|players|singers|djs|businesspeople|executives|officials)", cats):
        return None
    if folder == "ingredients" and re.search(r"(dishes|curries|cuisine of|cooked|fried|grilled|roasted|soups|desserts|"
                                              r"sweets|meals|recipes|street food|kebab|stews|pickles)", cats):
        return None
    if BAD_WORDS.search(title) or (folder == "ingredients" and (words & DISH_WORDS) - name_tokens):
        return None
    s = 0.0
    if folder == "ingredients":
        if not (words & name_tokens) and info["title"] not in lead:
            return None                                           # must at least name the ingredient
        if words & {"raw", "fresh", "whole", "uncooked"}:
            s += 2                                                # the ingredient as you buy it
        if re.search(r"(\(fruit\)|\(vegetable\)|raw |fresh |as food|vegetables|fruits|spices|nuts|seeds|meat)", cats):
            s += 2                                                # Commons files it as food, not as a plant or a person
        extra = {w for w in words - name_tokens - FILLER if len(w) > 2 and not w.isdigit()}
        s -= 0.7 * len(extra)                                     # "Garlic.jpg" beats "Chicken breast, bok choy, ..."
    s += 6 if info["title"] in lead else 0                       # article lead photo: curated, clear
    s += 2 * len(name_tokens & set(re.findall(r"[a-z]+", title)))  # file name mentions the item
    s -= abs(ratio - tw / th) * 2                                 # close to the final shape: less cropping
    s += min(w, 3000) / 3000                                      # resolution
    return s


def whiteness(img: Image.Image) -> float:
    """Share of near-white pixels on the edge of the square crop: ~1.0 for a studio shot on a white background."""
    small = ImageOps.fit(ImageOps.exif_transpose(img).convert("RGB"), (64, 64))
    px = small.load()
    ring = [(x, y) for x in range(64) for y in range(64) if x < 5 or y < 5 or x > 58 or y > 58]
    return sum(1 for xy in ring if min(px[xy]) > 215 and max(px[xy]) - min(px[xy]) < 30) / len(ring)


def crop_to(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    return ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.5))


def items() -> list[tuple[str, str, str, str | None]]:
    rows = [("recipes", r[0], r[1], None) for r in RECIPES]
    rows += [("ingredients", slugify(i.name), i.name, i.category) for i in load_ingredients()]
    return rows


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Commons titles have any script; Windows consoles don't
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="", help="comma-separated slugs to (re)fetch")
    parser.add_argument("--pick", type=int, default=1, help="use the Nth-best candidate (with --only)")
    parser.add_argument("--force", action="store_true", help="replace photos that already exist")
    parser.add_argument("--white", action="store_true", help="only photos on a plain white background (studio style)")
    parser.add_argument("--folder", choices=["recipes", "ingredients"], help="only this kind")
    parser.add_argument("--workers", type=int, default=4, help="parallel searches (be polite: 4 or fewer)")
    parser.add_argument("--file", default="", help='with one --only slug: use this exact Commons file, e.g. "File:Garlic.jpg"')
    args = parser.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    sources = json.loads(SOURCES.read_text(encoding="utf-8")) if SOURCES.exists() else {}
    todo = [row for row in items() if (not only or row[1] in only) and (not args.folder or row[0] == args.folder)
            and (args.force or only or not (IMAGES / row[0] / f"{row[1]}.webp").exists())]
    lock, local = threading.Lock(), threading.local()

    def fetch_one(n: int, row: tuple) -> None:
        folder, slug, name, category = row
        f = local.__dict__.setdefault("f", Fetcher())
        target = IMAGES / folder / f"{slug}.webp"
        tokens = {t for t in re.findall(r"[a-z]+", name.lower()) if len(t) > 2}
        lead, titles, exact_leads = set(), [], set()
        try:
            if not args.file and category and category != "Meat":
                exact_file = f.exact_article_image(re.sub(r"\s*\(.*?\)", "", name).strip())
                if exact_file:
                    lead.add(exact_file)
                    titles.append(exact_file)
                    exact_leads.add(exact_file)
            terms = [] if args.file else search_terms(name, slug, category)[:4]
            if args.white and not args.file:
                plain = re.sub(r"\s*\(.*?\)", "", name).strip()
                raw = "raw " if category == "Meat" else ""
                terms = [f"{raw}{plain} isolated", f"{raw}{plain} white background", *terms[:2]]
            for term in terms:
                found, exact = f.article_images(term)
                lead.update(exact)
                titles += found
                titles += f.commons_files(term, dish=folder == "recipes")
            titles = list(dict.fromkeys(titles))
            if args.file:
                titles, lead = [args.file], {args.file}
            if args.file:  # chosen by eye: only the licence is checked
                scored = [(0.0, i) for i in f.image_info(titles)
                          if not meta(i, "NonFree") and FREE.match(meta(i, "LicenseShortName"))]
            else:
                scored = [(score(i, folder, tokens, lead), i) for i in f.image_info(titles)]
            ranked = sorted(((sc + (6 if i["title"] in exact_leads else 0), i) for sc, i in scored if sc is not None),
                            key=lambda x: -x[0])
            if args.white and not args.file:
                rescored = []
                for sc, i in ranked[:10]:
                    url = (i.get("thumburl") or i["url"]).replace("/1600px-", "/240px-")
                    try:
                        w = whiteness(Image.open(BytesIO(f.http.get(url).content)))
                    except (httpx.HTTPError, OSError):
                        continue
                    if w >= 0.55:
                        rescored.append((sc + 12 * w, i))
                ranked = sorted(rescored, key=lambda x: -x[0])
                if not ranked:
                    print(f"[{n}/{len(todo)}] {name}: no white-background photo (kept current)", flush=True)
                    return
            if not ranked:
                print(f"[{n}/{len(todo)}] {name}: no free photo found", flush=True)
                with lock:
                    sources[f"{folder}/{slug}"] = {"name": name, "chosen": None, "candidates": []}
                return
            pick = min(max(args.pick, 1), len(ranked)) - 1 if only else 0
            _, info = ranked[pick]
            raw = f.http.get(info.get("thumburl") or info["url"]).content
            crop_to(Image.open(BytesIO(raw)), SIZES[folder]).save(target, "WEBP", quality=82)
        except (httpx.HTTPError, OSError) as exc:
            print(f"[{n}/{len(todo)}] {name}: failed {exc}", flush=True)
            return
        with lock:
            sources[f"{folder}/{slug}"] = {
                "name": name, "chosen": pick + 1,
                "candidates": [{"title": i["title"], "page": i.get("descriptionurl"), "author": meta(i, "Artist")[:120],
                                "license": meta(i, "LicenseShortName"), "size": f"{i['width']}x{i['height']}"} for _, i in ranked[:6]],
            }
            SOURCES.write_text(json.dumps(sources, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"[{n}/{len(todo)}] {name}: {info['title']} ({meta(info, 'LicenseShortName')})", flush=True)

    with ThreadPoolExecutor(max_workers=1 if (args.file or args.pick > 1) else args.workers) as pool:
        list(pool.map(lambda nr: fetch_one(*nr), enumerate(todo, 1)))
    SOURCES.write_text(json.dumps(sources, indent=1, ensure_ascii=False), encoding="utf-8")
    write_outputs(sources)


def write_outputs(sources: dict) -> None:
    have = {folder: sorted(p.stem for p in (IMAGES / folder).glob("*.webp")) for folder in SIZES}
    MANIFEST.write_text(
        "// Generated by scripts/fetch_images.py: which recipes/ingredients have a photo in images/<folder>/<slug>.webp.\n"
        f"export const RECIPE_PHOTO_SLUGS: readonly string[] = {json.dumps(have['recipes'])};\n"
        f"export const INGREDIENT_PHOTO_SLUGS: readonly string[] = {json.dumps(have['ingredients'])};\n", encoding="utf-8")
    lines = ["# Image credits", "",
             "Recipe and ingredient photos come from Wikimedia Commons under the licences below, cropped and resized",
             "(changes made). Not listed here: the 261 ingredient pictures and Chicken Karahi, Chicken Biryani, Chicken Qorma and the Kitchen banner,",
             "were supplied by the project owner.", "", "| Image | Source file | Author | Licence |", "|---|---|---|---|"]
    for key in sorted(sources):
        s = sources[key]
        if not s.get("chosen") or not (IMAGES / f"{key}.webp").exists():
            continue
        c = s["candidates"][s["chosen"] - 1]
        author = (c["author"] or "unknown").replace("|", "/")
        lines.append(f"| `{key}.webp` ({s['name']}) | [{c['title']}]({c['page']}) | {author} | {c['license']} |")
    CREDITS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nPhotos: {len(have['recipes'])} recipes, {len(have['ingredients'])} ingredients. Credits in {CREDITS.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
