"""Bundle the source CSV inside api/ so Vercel needs no files outside its root."""
import json
from pathlib import Path
from build_seed import load_rows, allergens_for, NUTRIENTS, TASTES

ROOT = Path(__file__).resolve().parents[1]


def build_catalog() -> str:
    rows = load_rows(ROOT / "supabase/seed/ingredients.csv")
    catalog = []
    for row in rows:
        catalog.append({"name": row["name"], "category": row["category"],
                        **{key: float(row[key]) for key in NUTRIENTS},
                        **{key: int(row[key]) for key in (*TASTES, "priority")},
                        "allergens": allergens_for(row["category"], row["name"])})
    return json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    (ROOT / "api/engine/ingredients.json").write_text(build_catalog(), encoding="utf-8")
