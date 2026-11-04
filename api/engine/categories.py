"""The categories people browse (13) versus the engine's cooking "kind" (the 8 source categories).

The CSV and the recommendation engine keep the 8 kinds (Meat, Vegetables, ... Oils & Sauces): they drive
cooking methods, prices, seasoning amounts and pairings. What users see, and what the database's
`categories` table holds, are the clearer display groups below; display_group() maps every ingredient,
and kind_for() maps back for ingredients read from the database.
"""
from __future__ import annotations

GROUPS = (
    "Meat & Poultry", "Fish & Seafood", "Vegetables", "Fresh Herbs", "Fruits", "Dairy & Eggs", "Grains & Flours",
    "Bakery & Baking", "Pulses & Lentils", "Nuts, Seeds & Dry Fruits", "Spices & Masalas", "Sauces & Condiments",
    "Oils, Ghee & Sweeteners",
)

HERBS = {"Fresh Coriander", "Fresh Mint (Pudina)", "Dill (Soya)", "Curry Leaves (Kari Patta)", "Fenugreek Leaves (Methi)"}
GRAINS = {"Basmati Rice", "Sella Basmati Rice", "Wheat Flour (Atta)", "Refined Flour (Maida)", "Gram Flour (Besan)",
          "Semolina (Suji)", "Vermicelli (Seviyan)", "Noodles", "Corn Flour", "Rice Flour", "Cracked Wheat (Dalia)",
          "Cornmeal (Makai Atta)", "Millet Flour (Bajra Atta)", "Barley (Jau)", "Sago (Sabudana)", "Macaroni", "Spaghetti"}
BAKERY = {"Bread", "Burger Buns (Bun)", "Papad", "Samosa Pastry Sheets", "Baking Powder", "Baking Soda", "Custard Powder"}
SWEETENERS = {"White Sugar", "Jaggery (Gur)", "Honey"}
OILS = {"Cooking Oil", "Mustard Oil", "Banaspati Ghee", "Sunflower Oil", "Corn Oil", "Sesame Oil (Til ka Tel)", "Desi Ghee"}
CONDIMENTS = {"Vinegar", "Soy Sauce", "Tomato Ketchup", "Rose Water (Gulab Jal)", "Kewra Water"}
PANTRY_SPICES = {"Salt", "Tamarind (Imli)", "Tea Leaves (Chai Patti)"}
PULSES = {"Masoor Dal", "Moong Dal", "Chana Dal", "Toor Dal", "Mash Dal", "Kabuli Chickpeas (Chana)",
          "Black Chickpeas (Kala Chana)", "Red Kidney Beans (Rajma)", "Black-eyed Beans (Lobia)", "Whole Moong",
          "Dried Green Peas (Sookha Matar)", "Black Gram Whole (Sabut Mash)", "Soya Chunks", "Roasted Chana"}

# Default kind for an ingredient added in a display group (e.g. by an admin) that the bundled data doesn't know.
GROUP_TO_KIND = {
    "Meat & Poultry": "Meat", "Fish & Seafood": "Meat", "Vegetables": "Vegetables", "Fresh Herbs": "Vegetables",
    "Fruits": "Fruits", "Dairy & Eggs": "Dairy", "Grains & Flours": "Grocery", "Bakery & Baking": "Grocery",
    "Pulses & Lentils": "Pulses & Nuts", "Nuts, Seeds & Dry Fruits": "Pulses & Nuts", "Spices & Masalas": "Spices",
    "Sauces & Condiments": "Oils & Sauces", "Oils, Ghee & Sweeteners": "Oils & Sauces",
}
# Where ingredients still sitting in an old category go (used by the database migration).
KIND_TO_DEFAULT_GROUP = {"Meat": "Meat & Poultry", "Vegetables": "Vegetables", "Fruits": "Fruits", "Dairy": "Dairy & Eggs",
                         "Grocery": "Grains & Flours", "Spices": "Spices & Masalas", "Pulses & Nuts": "Nuts, Seeds & Dry Fruits",
                         "Oils & Sauces": "Sauces & Condiments"}


def display_group(kind: str, name: str) -> str:
    """The category a person browses for this ingredient."""
    for names, group in ((HERBS, "Fresh Herbs"), (GRAINS, "Grains & Flours"), (BAKERY, "Bakery & Baking"),
                         (SWEETENERS, "Oils, Ghee & Sweeteners"), (OILS, "Oils, Ghee & Sweeteners"),
                         (CONDIMENTS, "Sauces & Condiments"), (PANTRY_SPICES, "Spices & Masalas"),
                         (PULSES, "Pulses & Lentils")):
        if name in names:
            return group
    if name == "Eggs":
        return "Dairy & Eggs"
    if name == "Fried Onion (Birista)":
        return "Vegetables"
    if kind == "Meat":
        return "Fish & Seafood" if ("Fish" in name or name == "Prawns") else "Meat & Poultry"
    return KIND_TO_DEFAULT_GROUP.get(kind, kind)


def kind_for(group: str, name: str, known: dict[str, str]) -> str:
    """The engine kind for an ingredient read from the database (by name when bundled, else by its group)."""
    return known.get(name) or GROUP_TO_KIND.get(group) or group
