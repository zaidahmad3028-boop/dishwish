import { describe, expect, it } from 'vitest';
import {
  ALLERGEN_CHIPS, CALORIE_TIERS, effectiveAllergenTags, emptyPreferences, fromRow, isIngredientBlocked, mealSplit,
  parseCustomAllergens, toRow,
} from './preferences';

describe('constants', () => {
  it('has 18 allergen chips, none for shellfish', () => {
    expect(ALLERGEN_CHIPS).toHaveLength(18);
    expect(ALLERGEN_CHIPS.map((c) => c.tag)).not.toContain('shellfish');
    expect(ALLERGEN_CHIPS.find((c) => c.tag === 'legumes')?.label).toBe('Daal & Chana');
  });

  it('has the three calorie tiers with Moderate marked popular', () => {
    expect(CALORIE_TIERS.map((t) => t.kcal)).toEqual([1200, 1500, 1800]);
    expect(CALORIE_TIERS.filter((t) => t.popular).map((t) => t.label)).toEqual(['Moderate Deficit']);
  });
});

describe('mealSplit', () => {
  it.each([1200, 1500, 1800, 1000])('splits %i kcal into three meals that sum exactly', (total) => {
    const meals = mealSplit(total);
    expect(meals.map((m) => m.meal)).toEqual(['Breakfast', 'Lunch', 'Dinner']);
    expect(meals.reduce((s, m) => s + m.kcal, 0)).toBe(total);
  });

  it('gives ~400 per meal for 1,200', () => {
    expect(mealSplit(1200).map((m) => m.kcal)).toEqual([400, 400, 400]);
  });
});

describe('parseCustomAllergens', () => {
  it('trims, lower-cases, collapses spaces and de-duplicates', () => {
    expect(parseCustomAllergens(' Prawns, raw   onion ,, prawns,SHELLFISH ')).toEqual(['prawns', 'raw onion', 'shellfish']);
  });

  it('caps at 20 words of at most 40 characters', () => {
    const words = parseCustomAllergens(Array.from({ length: 30 }, (_, i) => `item${i}`).join(','));
    expect(words).toHaveLength(20);
    expect(parseCustomAllergens('x'.repeat(60))[0]).toHaveLength(40);
  });

  it('returns nothing for blank input', () => {
    expect(parseCustomAllergens('  , ,')).toEqual([]);
  });
});

describe('allergen blocking', () => {
  const prefs = { allergens: ['tomato' as const], customAllergens: ['onion'] };

  it('blocks by tag', () => {
    expect(isIngredientBlocked('Tomato Paste', ['tomato'], prefs)).toBe(true);
    expect(isIngredientBlocked('Mutton', [], prefs)).toBe(false);
  });

  it('blocks any ingredient whose name contains a free-text word', () => {
    expect(isIngredientBlocked('Onion', [], prefs)).toBe(true);
    expect(isIngredientBlocked('Spring Onion (Hara Pyaz)', [], prefs)).toBe(true);
  });

  it('maps shellfish words in the free-text box onto the shellfish tag', () => {
    expect(effectiveAllergenTags({ allergens: [], customAllergens: ['shellfish'] })).toEqual(['shellfish']);
    expect(isIngredientBlocked('Oyster Sauce', ['shellfish'], { allergens: [], customAllergens: ['prawns'] })).toBe(true);
  });
});

describe('row mapping', () => {
  it('round-trips through the database shape', () => {
    const prefs = {
      ...emptyPreferences(),
      tastes: { sweet: null, salty: 'low' as const, sour: null, spicy: 'high' as const },
      allergens: ['milk' as const, 'corn' as const],
      customAllergens: ['prawns'],
      calorieTier: 'medium' as const,
      onboarded: true,
    };
    const row = toRow('u1', prefs);
    expect(row).toMatchObject({ user_id: 'u1', sweet: 'none', spicy: 'high', calorie_tier: 'medium', onboarded: true });
    expect(fromRow(row)).toEqual(prefs);
  });

  it('treats unknown values as unset', () => {
    const prefs = fromRow({ sweet: 'medium', calorie_tier: 'none', allergens: ['milk', 'invented'] });
    expect(prefs.tastes.sweet).toBe('medium');
    expect(prefs.calorieTier).toBeNull();
    expect(prefs.allergens).toEqual(['milk']);
    expect(fromRow(null)).toEqual(emptyPreferences());
  });
});
