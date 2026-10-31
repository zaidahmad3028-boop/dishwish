import csv
import importlib.util
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_seed", ROOT / "scripts/build_seed.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

@pytest.mark.parametrize("category,name,expected", [
    ("Dairy", "Milk", ["milk"]), ("Dairy", "Coconut Milk", ["coconut"]),
    ("Grocery", "Cornmeal (Makai Atta)", ["corn"]), ("Grocery", "Millet Flour (Bajra Atta)", []),
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
    ("Vegetables", "Tomato", ["tomato"]), ("Oils & Sauces", "Tomato Paste", ["tomato"]),
    ("Grocery", "Tomato Ketchup", ["tomato"]),
    ("Vegetables", "Brinjal (Baingan)", ["brinjal"]),
    ("Fruits", "Mango", ["mango"]), ("Vegetables", "Raw Mango (Kairi)", ["mango"]),
    ("Spices", "Dried Mango Powder (Amchur)", ["mango"]),
    ("Oils & Sauces", "Mango Pickle (Aam ka Achar)", ["mango", "mustard"]),
    ("Fruits", "Orange (Malta)", ["citrus"]), ("Fruits", "Kinnow", ["citrus"]),
    ("Fruits", "Sweet Lime (Mosambi)", ["citrus"]), ("Fruits", "Lemon", ["citrus"]),
    ("Oils & Sauces", "Lemon Pickle (Nimbu Achar)", ["citrus", "mustard"]),
    ("Fruits", "Amla (Gooseberry)", ["citrus"]),
    ("Fruits", "Banana", ["banana"]), ("Vegetables", "Raw Banana (Kela)", ["banana"]),
    ("Fruits", "Strawberry", ["strawberry"]),
    ("Fruits", "Fresh Coconut", ["coconut"]), ("Pulses & Nuts", "Desiccated Coconut", ["coconut"]),
    ("Oils & Sauces", "Coconut Milk", ["coconut"]),
    ("Vegetables", "Corn (Makai)", ["corn"]), ("Grocery", "Corn Flour", ["corn"]),
    ("Oils & Sauces", "Corn Oil", ["corn"]),
    ("Spices", "Black Peppercorns", []), ("Vegetables", "Sweet Potato", []),
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


SPEC_TAGS = {
    "tomato": {"Tomato", "Tomato Paste", "Tomato Ketchup"},
    "brinjal": {"Brinjal (Baingan)"},
    "mango": {"Mango", "Raw Mango (Kairi)", "Dried Mango Powder (Amchur)", "Mango Pickle (Aam ka Achar)"},
    "citrus": {"Orange (Malta)", "Kinnow", "Sweet Lime (Mosambi)", "Lemon", "Lemon Pickle (Nimbu Achar)", "Amla (Gooseberry)"},
    "banana": {"Banana", "Raw Banana (Kela)"},
    "strawberry": {"Strawberry"},
    "coconut": {"Fresh Coconut", "Coconut Milk", "Desiccated Coconut"},
    "corn": {"Corn (Makai)", "Corn Flour", "Cornmeal (Makai Atta)", "Corn Oil"},
}


@pytest.mark.parametrize("tag", sorted(SPEC_TAGS))
def test_new_tags_cover_exactly_the_specified_catalog_rows(tag):
    rows = seed.load_rows(ROOT / "supabase/seed/ingredients.csv")
    tagged = {row["name"] for row in rows if tag in seed.allergens_for(row["category"], row["name"])}
    assert tagged == SPEC_TAGS[tag]


def test_allergen_migration_is_generated_update_only_and_in_sync():
    sql = seed.build_allergen_migration(ROOT / "supabase/seed/ingredients.csv")
    assert sql == (ROOT / "supabase/migrations/0004_allergen_tags.sql").read_text()
    lowered = sql.lower()
    assert "insert into" not in lowered and "delete from" not in lowered
    assert "update public.ingredients" in lowered and "is distinct from" in lowered
    assert sql.count("::text[])") == 260
