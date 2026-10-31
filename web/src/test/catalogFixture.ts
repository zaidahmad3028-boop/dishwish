import type { Ingredient } from '../lib/pantryApi';

// A small slice of the real seed catalog (values per 100 g) for component tests.
export const CATALOG: Ingredient[] = [
  { id: 1, name: 'Chicken Breast', category: 'Meat', kcal: 165, protein: 31, carbs: 0, fat: 3.6, allergens: [] },
  { id: 2, name: 'Onion', category: 'Vegetables', kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, allergens: [] },
  { id: 3, name: 'Tomato', category: 'Vegetables', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, allergens: ['tomato'] },
  { id: 4, name: 'Yogurt (Dahi)', category: 'Dairy', kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, allergens: ['milk'] },
  { id: 5, name: 'Basmati Rice', category: 'Grocery', kcal: 350, protein: 7.5, carbs: 78, fat: 0.6, allergens: [] },
  { id: 6, name: 'Prawns', category: 'Meat', kcal: 99, protein: 24, carbs: 0.2, fat: 0.3, allergens: ['shellfish'] },
  { id: 7, name: 'Masoor Dal', category: 'Pulses & Nuts', kcal: 352, protein: 24.6, carbs: 63, fat: 1.1, allergens: ['legumes'] },
];
