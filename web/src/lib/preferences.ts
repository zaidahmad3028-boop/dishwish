// Onboarding choices and the pure rules built on them. Stored in public.preferences.

export const LEVELS = ['low', 'medium', 'high'] as const;
export type Level = (typeof LEVELS)[number];
export type TasteKey = 'sweet' | 'salty' | 'sour' | 'spicy';

export type AllergenTag =
  | 'milk' | 'gluten' | 'eggs' | 'peanuts' | 'tree_nuts' | 'sesame' | 'fish' | 'shellfish' | 'soy'
  | 'mustard' | 'legumes' | 'tomato' | 'brinjal' | 'mango' | 'citrus' | 'banana' | 'strawberry'
  | 'coconut' | 'corn';

export type CalorieTier = 'low' | 'medium' | 'high';

export interface Preferences {
  tastes: Record<TasteKey, Level | null>;
  allergens: AllergenTag[];
  customAllergens: string[];
  calorieTier: CalorieTier | null;
  onboarded: boolean;
}

export const TASTES: { key: TasteKey; label: string; hint: string }[] = [
  { key: 'sweet', label: 'Sweet', hint: 'Kheer, halwa' },
  { key: 'salty', label: 'Salty', hint: 'Chaat, achar' },
  { key: 'sour', label: 'Sour', hint: 'Imli, lemon, raita' },
  { key: 'spicy', label: 'Spicy', hint: 'Karahi, nihari, biryani' },
];

// Shellfish has no chip on purpose (rare in Pakistan); the free-text box covers it.
export const ALLERGEN_CHIPS: { tag: AllergenTag; label: string; example: string }[] = [
  { tag: 'milk', label: 'Milk & Dairy', example: 'Doodh, dahi, paneer' },
  { tag: 'gluten', label: 'Gluten', example: 'Atta, maida, naan' },
  { tag: 'eggs', label: 'Eggs', example: 'Anda paratha, mayo' },
  { tag: 'peanuts', label: 'Peanuts', example: 'Mungphali, chikki' },
  { tag: 'tree_nuts', label: 'Tree Nuts', example: 'Badam, kaju, pista' },
  { tag: 'sesame', label: 'Sesame', example: 'Til, til ke laddu' },
  { tag: 'fish', label: 'Fish', example: 'Rohu, machli fry' },
  { tag: 'soy', label: 'Soy', example: 'Soy sauce, soya chunks' },
  { tag: 'mustard', label: 'Mustard', example: 'Sarson, achar' },
  { tag: 'legumes', label: 'Daal & Chana', example: 'Masoor, chana, besan' },
  { tag: 'tomato', label: 'Tomato', example: 'Tamatar, ketchup' },
  { tag: 'brinjal', label: 'Brinjal', example: 'Baingan, bhurta' },
  { tag: 'mango', label: 'Mango', example: 'Aam, amchur, aam achar' },
  { tag: 'citrus', label: 'Citrus', example: 'Kinnow, malta, nimbu' },
  { tag: 'banana', label: 'Banana', example: 'Kela, kachay kelay' },
  { tag: 'strawberry', label: 'Strawberry', example: 'Strawberry shake' },
  { tag: 'coconut', label: 'Coconut', example: 'Nariyal, khopra' },
  { tag: 'corn', label: 'Corn', example: 'Makai, corn flour' },
];

export const CALORIE_TIERS: { tier: CalorieTier; label: string; kcal: number; popular?: boolean }[] = [
  { tier: 'low', label: 'Weight Loss Extreme', kcal: 1200 },
  { tier: 'medium', label: 'Moderate Deficit', kcal: 1500, popular: true },
  { tier: 'high', label: 'Balanced Fit', kcal: 1800 },
];

export const MAX_CUSTOM_ALLERGENS = 20;
const MAX_WORD_LENGTH = 40;

export const emptyPreferences = (): Preferences => ({
  tastes: { sweet: null, salty: null, sour: null, spicy: null },
  allergens: [],
  customAllergens: [],
  calorieTier: null,
  onboarded: false,
});

export function kcalForTier(tier: CalorieTier | null): number | null {
  return CALORIE_TIERS.find((t) => t.tier === tier)?.kcal ?? null;
}

// Equal thirds (~400/500/600 per meal); dinner absorbs rounding so the total is exact.
export function mealSplit(totalKcal: number): { meal: 'Breakfast' | 'Lunch' | 'Dinner'; kcal: number }[] {
  const third = Math.round(totalKcal / 3);
  return [
    { meal: 'Breakfast', kcal: third },
    { meal: 'Lunch', kcal: third },
    { meal: 'Dinner', kcal: totalKcal - 2 * third },
  ];
}

// "Prawns, raw onion , prawns" -> ["prawns", "raw onion"]: trimmed, lower-case, de-duplicated.
export function parseCustomAllergens(text: string): string[] {
  const words: string[] = [];
  for (const raw of text.split(',')) {
    const word = raw.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_WORD_LENGTH);
    if (word && !words.includes(word)) words.push(word);
    if (words.length === MAX_CUSTOM_ALLERGENS) break;
  }
  return words;
}

// Free-text words that also mean a whole tag group (name matching alone would miss
// e.g. "shellfish" vs an ingredient called "Prawns").
const TAG_ALIASES: Partial<Record<AllergenTag, string[]>> = {
  shellfish: ['shellfish', 'prawn', 'prawns', 'shrimp', 'shrimps', 'crab', 'lobster', 'oyster', 'oysters'],
};

export function effectiveAllergenTags(prefs: Pick<Preferences, 'allergens' | 'customAllergens'>): AllergenTag[] {
  const tags = new Set(prefs.allergens);
  for (const [tag, aliases] of Object.entries(TAG_ALIASES) as [AllergenTag, string[]][]) {
    if (prefs.customAllergens.some((word) => aliases.includes(word))) tags.add(tag);
  }
  return [...tags];
}

// An ingredient is blocked if it carries a selected tag, or its name contains a free-text word.
export function isIngredientBlocked(
  name: string,
  ingredientTags: readonly string[],
  prefs: Pick<Preferences, 'allergens' | 'customAllergens'>,
): boolean {
  const tags = effectiveAllergenTags(prefs);
  if (ingredientTags.some((tag) => tags.includes(tag as AllergenTag))) return true;
  const lower = name.toLowerCase();
  return prefs.customAllergens.some((word) => lower.includes(word));
}

// ---- Database row mapping (public.preferences) ----

type DbLevel = 'none' | Level;
type DbTier = 'none' | CalorieTier;

export interface PreferencesRow {
  user_id: string;
  sweet: DbLevel;
  salty: DbLevel;
  sour: DbLevel;
  spicy: DbLevel;
  allergens: string[];
  custom_allergens: string[];
  calorie_tier: DbTier;
  onboarded: boolean;
  updated_at?: string;
}

export function toRow(userId: string, prefs: Preferences): PreferencesRow {
  return {
    user_id: userId,
    sweet: prefs.tastes.sweet ?? 'none',
    salty: prefs.tastes.salty ?? 'none',
    sour: prefs.tastes.sour ?? 'none',
    spicy: prefs.tastes.spicy ?? 'none',
    allergens: prefs.allergens,
    custom_allergens: prefs.customAllergens,
    calorie_tier: prefs.calorieTier ?? 'none',
    onboarded: prefs.onboarded,
  };
}

const knownTags = new Set<string>(ALLERGEN_CHIPS.map((c) => c.tag).concat('shellfish'));
const level = (v: string | null | undefined): Level | null => (LEVELS as readonly string[]).includes(v ?? '') ? (v as Level) : null;

export function fromRow(row: Partial<PreferencesRow> | null | undefined): Preferences {
  if (!row) return emptyPreferences();
  const tier = row.calorie_tier;
  return {
    tastes: { sweet: level(row.sweet), salty: level(row.salty), sour: level(row.sour), spicy: level(row.spicy) },
    allergens: (row.allergens ?? []).filter((t): t is AllergenTag => knownTags.has(t)),
    customAllergens: row.custom_allergens ?? [],
    calorieTier: tier === 'low' || tier === 'medium' || tier === 'high' ? tier : null,
    onboarded: row.onboarded ?? false,
  };
}

const TAG_LABELS: Record<string, string> = Object.fromEntries(
  ALLERGEN_CHIPS.map((c) => [c.tag, c.label]).concat([['shellfish', 'Shellfish']]),
);

export function allergenLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}

// Why the shield blocks an ingredient, for the kitchen card; null when it is allowed.
export function blockReason(
  name: string,
  ingredientTags: readonly string[],
  prefs: Pick<Preferences, 'allergens' | 'customAllergens'>,
): string | null {
  const tags = effectiveAllergenTags(prefs);
  const tag = ingredientTags.find((t) => tags.includes(t as AllergenTag));
  if (tag) return `Contains ${allergenLabel(tag)}`;
  const lower = name.toLowerCase();
  const word = prefs.customAllergens.find((w) => lower.includes(w));
  return word ? `Matches “${word}”` : null;
}

export const TASTE_SCORES: Record<Level, number> = { low: 2, medium: 5, high: 8 };
