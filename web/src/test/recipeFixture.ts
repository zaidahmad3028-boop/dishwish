import type { Recipe } from '../lib/recipes';

const row = (name: string, category: string, grams: number, role: string, per100: [number, number, number, number], pricePerKg: number, allergens: string[] = []) => ({
  name, category, grams, role, allergens,
  kcal: (per100[0] * grams) / 100, protein: (per100[1] * grams) / 100, carbs: (per100[2] * grams) / 100, fat: (per100[3] * grams) / 100,
  price_pkr_per_kg: pricePerKg, cost_pkr: Math.round((pricePerKg * grams) / 1000),
});

export const KARAHI: Recipe = {
  title: 'Chicken Breast Karahi', style: 'karahi', servings: 2, minutes: 40,
  ingredients: [
    row('Chicken Breast', 'Meat', 350, 'main', [165, 31, 0, 3.6], 750),
    row('Onion', 'Vegetables', 100, 'yours', [40, 1.1, 9.3, 0.1], 160),
    row('Tomato', 'Vegetables', 100, 'base', [18, 0.9, 3.9, 0.2], 160, ['tomato']),
    row('Cooking Oil', 'Oils & Sauces', 20, 'fat', [884, 0, 0, 100], 550),
    row('Red Chilli Powder', 'Spices', 4, 'spice', [282, 12, 50, 14], 2000),
  ],
  steps: ['Heat 20 g cooking oil in a karahi.', 'Add 350 g chicken breast and sear.'],
  nutrition: { per_serving: { kcal: 400, protein: 30, carbs: 20, fat: 20 }, total: { kcal: 800, protein: 60, carbs: 40, fat: 40 }, meal_target_kcal: 500 },
  taste: { sweet: 2, salty: 4, sour: 3, spicy: 7.5 },
  match: { percent: 88, pairing: 0.81, taste_similarity: 0.95 },
  allergens: { contains: ['tomato'], avoided: ['milk'], blocked_words: [] },
  cost: { total_pkr: 344, per_serving_pkr: 172 },
  fingerprint: 'abc123',
};
export const SALAN: Recipe = { ...KARAHI, title: 'Chicken Breast Salan', style: 'salan', fingerprint: 'def456' };

// A recipe saved before taste/match/cost existed must still open.
export const OLD_SAVED: Recipe = {
  title: 'Beef Karahi', style: 'karahi', servings: 2, minutes: 40,
  ingredients: [{ name: 'Beef', category: 'Meat', grams: 300, role: 'main' }],
  steps: ['Cook the beef.'],
  nutrition: { per_serving: { kcal: 380, protein: 39, carbs: 0, fat: 24 }, total: { kcal: 760, protein: 78, carbs: 0, fat: 48 }, meal_target_kcal: null },
  fingerprint: 'old1',
};
