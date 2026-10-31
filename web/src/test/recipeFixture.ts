import type { Recipe } from '../lib/recipes';

export const KARAHI: Recipe = {
  title: 'Chicken Breast Karahi', style: 'karahi', servings: 2, minutes: 40,
  ingredients: [
    { name: 'Chicken Breast', category: 'Meat', grams: 350, role: 'main' },
    { name: 'Onion', category: 'Vegetables', grams: 100, role: 'yours' },
    { name: 'Tomato', category: 'Vegetables', grams: 100, role: 'base' },
    { name: 'Cooking Oil', category: 'Oils & Sauces', grams: 20, role: 'fat' },
    { name: 'Red Chilli Powder', category: 'Spices', grams: 4, role: 'spice' },
  ],
  steps: ['Heat cooking oil in a karahi.', 'Add chicken breast and sear.'],
  nutrition: { per_serving: { kcal: 400, protein: 30, carbs: 20, fat: 20 }, total: { kcal: 800, protein: 60, carbs: 40, fat: 40 }, meal_target_kcal: 500 },
  fingerprint: 'abc123',
};
export const SALAN: Recipe = { ...KARAHI, title: 'Chicken Breast Salan', style: 'salan', fingerprint: 'def456' };
