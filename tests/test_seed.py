import csv
import importlib.util
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_seed", ROOT / "scripts/build_seed.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

@pytest.mark.parametrize("category,name,expected", [
    ("Dairy", "Milk", ["milk"]), ("Dairy", "Coconut Milk", []),
    ("Grocery", "Cornmeal (Makai Atta)", []), ("Grocery", "Millet Flour (Bajra Atta)", []),
    ("Grocery", "Wheat Flour (Atta)", ["gluten"]),
    ("Grocery", "Cracked Wheat (Dalia)", ["gluten"]),
    ("Grocery", "Gram Flour (Besan)", ["legumes"]),
    ("Grocery", "Soy Sauce", ["gluten", "soy"]),
    ("Pulses & Nuts", "Soya Chunks", ["legumes", "soy"]),
    ("Pulses & Nuts", "Peanuts", ["peanuts"]),
    ("Pulses & Nuts", "Pine Nuts (Chilgoza)", ["tree_nuts"]),
    ("Pulses & Nuts", "Dried Green Peas", ["legumes"]),
    ("Meat", "Rohu Fish", ["fish"]), ("Meat", "Prawns", ["shellfish"]),
    ("Oils & Sauces", "Oyster Sauce", ["shellfish"]),
    ("Oils & Sauces", "Mixed Pickle (Achar)", ["mustard"]),
    ("Oils & Sauces", "Sesame Oil", ["sesame"]),
    ("Oils & Sauces", "Mayonnaise", ["eggs"]),
    ("Vegetables", "Dill (Soya)", []), ("Vegetables", "Green Beans", []),
    ("Spices", "Cinnamon (Dalchini)", []),
    ("Grocery", "Notatta", []),
])
def test_allergens(category, name, expected):
    assert seed.allergens_for(category, name) == expected


def test_supplied_csv_and_generated_seed():
    source = ROOT / "supabase/seed/ingredients.csv"
    rows = seed.load_rows(source)
    assert len(rows) == 260
    assert len({row["category"] for row in rows}) == 8
    assert seed.build_seed(source) == (ROOT / "supabase/seed/seed.sql").read_text()
    assert seed.quote("Chef's ingredient") == "'Chef''s ingredient'"

@pytest.mark.parametrize("field,value", [("kcal", "NaN"), ("fat", "-1"), ("sweet", "11"), ("priority", "0"), ("salty", "1.5")])
def test_reject_invalid_numbers(tmp_path, field, value):
    source = ROOT / "supabase/seed/ingredients.csv"
    row = seed.load_rows(source)[0]
    row[field] = value
    path = tmp_path / "bad.csv"
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=seed.COLUMNS)
        writer.writeheader()
        writer.writerow(row)
    with pytest.raises(ValueError):
        seed.load_rows(path)
