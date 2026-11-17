import { describe, expect, it } from 'vitest';
import { emptyPreferences } from './preferences';
import { conflictHeading, ingredientConflicts } from './conflicts';
import { describeRecipe, nutritionMatrix } from '../pages/GenerateRecipePage';

const none = { sweet: null, salty: null, sour: null, spicy: null } as const;
const chilli = { name: 'Red Chilli Powder', category: 'Spices', kcal: 280, carbs: 50, allergens: [], spicy: 10, sweet: 0 };

describe('ingredient conflicts', () => {
  it('warns when a very spicy ingredient meets a sweet-high choice, as in the design', () => {
    const c = ingredientConflicts(chilli, { tastes: { ...none, sweet: 'high' } });
    expect(c).toHaveLength(1);
    expect(c[0].message).toMatch(/Sweet: High.*Red Chilli Powder.*too spicy/);
    expect(conflictHeading(c)).toBe('Taste Conflict Detected');
  });

  it('warns when the cook asked for that taste to be low', () => {
    expect(ingredientConflicts(chilli, { tastes: { ...none, spicy: 'low' } })[0].message).toMatch(/Spicy: Low/);
  });

  it('stays quiet when the choices agree', () => {
    expect(ingredientConflicts(chilli, { tastes: { ...none, spicy: 'high' } })).toEqual([]);
    expect(ingredientConflicts(chilli, { tastes: none })).toEqual([]);
  });

  it('blocks allergens and flags calorie and diet clashes', () => {
    const prefs = { ...emptyPreferences(), allergens: ['peanuts' as const] };
    const peanut = { name: 'Peanuts', category: 'Pulses & Nuts', kcal: 567, carbs: 16, allergens: ['peanuts'] };
    const kinds = ingredientConflicts(peanut, { tastes: none, prefs, maxKcal: 500 }).map((c) => c.kind);
    expect(kinds).toEqual(['allergy', 'calories']);
    const chicken = { name: 'Chicken Breast', category: 'Meat & Poultry', kcal: 165, carbs: 0, allergens: [] };
    expect(ingredientConflicts(chicken, { tastes: none, diets: ['vegetarian'] })[0].kind).toBe('diet');
    const rice = { name: 'Basmati Rice', category: 'Grains & Flours', kcal: 350, carbs: 78, allergens: [] };
    expect(ingredientConflicts(rice, { tastes: none, diets: ['keto'] })[0].message).toMatch(/Keto/);
  });
});

describe('generated recipe summaries', () => {
  const recipe = {
    style: 'karahi', servings: 4,
    ingredients: [{ name: 'Chicken Breast', category: 'Meat', grams: 800, role: 'main' }, { name: 'Tomato', category: 'Vegetables', grams: 300, role: 'yours' }, { name: 'Salt', category: 'Spices', grams: 8, role: 'salt' }],
    nutrition: { per_serving: { kcal: 486, protein: 52, carbs: 28, fat: 18 }, total: { kcal: 1944, protein: 208, carbs: 112, fat: 72 }, meal_target_kcal: null },
  };

  it('describes the dish from what it contains', () => {
    expect(describeRecipe(recipe)).toBe('A home-style karahi with Chicken Breast, Tomato, high in protein, for 4 servings.');
  });

  it('builds the nutrition matrix with energy shares that add up', () => {
    const m = nutritionMatrix(recipe);
    expect(m.map((x) => x.value)).toEqual([486, 52, 28, 18]);
    expect((m[1].share ?? 0) + (m[2].share ?? 0) + (m[3].share ?? 0)).toBe(100);
  });
});
