import { describe, expect, it } from 'vitest';
import { toCsv } from '../components/ui';
import { cumulativeUsers } from '../pages/admin/AdminDashboardPage';
import { heatColor } from '../pages/admin/AdminAnalyticsPage';
import { parseIngredientCsv } from '../pages/admin/AdminIngredientsPage';
import { slugify } from '../pages/admin/AdminRecipesPage';
import { validateFeedback } from './accountApi';
import { pctChange, validateIngredient, validateRecipe, validateRecommendationSettings, type RecipeDraft } from './adminApi';
import { compatibilityVerdict, isCuratedSnapshot, recommendationRequest } from './curatedApi';
import { emptyPreferences } from './preferences';
import { presetActive, TASTE_PRESETS, togglePreset } from './selection';

const spicy = TASTE_PRESETS.find((p) => p.label === 'Spicy')!;
const mild = TASTE_PRESETS.find((p) => p.label === 'Mild')!;

describe('selection presets', () => {
  it('toggles a preset on and off and keeps presets on the same taste exclusive', () => {
    const none = { sweet: null, salty: null, sour: null, spicy: null };
    const on = togglePreset(none, spicy);
    expect(on.spicy).toBe('high');
    expect(presetActive(on, spicy)).toBe(true);
    expect(presetActive(togglePreset(on, mild), spicy)).toBe(false);
    expect(togglePreset(on, spicy).spicy).toBeNull();
  });
});

describe('recommendation request', () => {
  it('sends allergies, custom words, diets and pantry but never a user id', () => {
    const prefs = { ...emptyPreferences(), allergens: ['milk' as const], customAllergens: ['prawns'] };
    const body = recommendationRequest({ ingredients: ['Tomato', 'Onion'], tastes: { sweet: null, salty: null, sour: null, spicy: 'high' }, diets: ['vegetarian'], maxMinutes: 30 },
      prefs, ['Garlic']);
    expect(body).toMatchObject({ ingredients: ['Tomato', 'Onion'], blocked_words: ['prawns'], diets: ['vegetarian'], pantry: ['Garlic'], max_minutes: 30 });
    expect(body.allergens).toEqual(expect.arrayContaining(['milk', 'shellfish']));
    expect(JSON.stringify(body)).not.toMatch(/user/);
  });

  it('reads compatibility averages in plain language', () => {
    expect(compatibilityVerdict(null).tone).toBe('gray');
    expect(compatibilityVerdict(0.9).tone).toBe('green');
    expect(compatibilityVerdict(0.6).tone).toBe('amber');
    expect(compatibilityVerdict(0.3).tone).toBe('red');
  });

  it('recognises curated snapshots', () => {
    expect(isCuratedSnapshot({ kind: 'curated', slug: 'x' })).toBe(true);
    expect(isCuratedSnapshot({ title: 'Generated' })).toBe(false);
  });
});

describe('admin validation', () => {
  const ingredient = { name: 'Saffron Rice', category_id: 1, kcal: 130, protein: 3, carbs: 28, fat: 0.3, sweet: 1, salty: 1, sour: 0, spicy: 0, allergens: [], priority: 3, image_url: null };

  it('validates ingredients', () => {
    expect(validateIngredient(ingredient)).toBeNull();
    expect(validateIngredient({ ...ingredient, name: ' ' })).toMatch(/Name/);
    expect(validateIngredient({ ...ingredient, kcal: -1 })).toMatch(/kcal/);
    expect(validateIngredient({ ...ingredient, spicy: 11 })).toMatch(/spicy/);
    expect(validateIngredient({ ...ingredient, image_url: 'http://insecure' })).toMatch(/https/);
  });

  it('validates recipes', () => {
    const draft: RecipeDraft = { id: null, slug: 'new-dish', name: 'New Dish', description: '', category: 'Snacks', cuisine: 'Pakistani', minutes: 20, servings: 2,
      taste: { sweet: 1, salty: 4, sour: 2, spicy: 5 }, image_url: null, status: 'draft', lines: [{ ingredient_id: 1, grams: 100, display: '' }], steps: ['Cook.'] };
    expect(validateRecipe(draft)).toBeNull();
    expect(validateRecipe({ ...draft, slug: 'Bad Slug' })).toMatch(/Slug/);
    expect(validateRecipe({ ...draft, lines: [] })).toMatch(/ingredient/);
    expect(validateRecipe({ ...draft, lines: [draft.lines[0], draft.lines[0]] })).toMatch(/once/);
    expect(validateRecipe({ ...draft, steps: ['  '] })).toMatch(/step/);
  });

  it('validates recommendation settings like the database check', () => {
    const ok = { weights: { coverage: 0.45, compatibility: 0.3, taste: 0.2, cooking: 0.05 }, missing_penalty: 0.03, missing_tolerance: 3, min_score: 0.2 };
    expect(validateRecommendationSettings(ok)).toBeNull();
    expect(validateRecommendationSettings({ ...ok, weights: { coverage: 0, compatibility: 0, taste: 0, cooking: 0 } })).toMatch(/above 0/);
    expect(validateRecommendationSettings({ ...ok, missing_penalty: 0.5 })).toMatch(/penalty/);
    expect(validateRecommendationSettings({ ...ok, missing_tolerance: 1.5 })).toMatch(/Tolerance/);
  });

  it('validates feedback', () => {
    expect(validateFeedback({ kind: 'rating', rating: null, message: 'x', subject: '' })).toMatch(/star/);
    expect(validateFeedback({ kind: 'bug', rating: null, message: '  ', subject: '' })).toMatch(/message/);
    expect(validateFeedback({ kind: 'suggestion', rating: 4, message: 'More daal', subject: '' })).toBeNull();
  });

  it('parses ingredient CSV and rejects bad rows', () => {
    const cats = [{ id: 1, name: 'Vegetables' }];
    const header = 'name,category,kcal,protein,carbs,fat,sweet,salty,sour,spicy,allergens,priority';
    expect(parseIngredientCsv(`${header}\nKale,Vegetables,49,4,9,1,1,0,1,0,,3`, cats)).toEqual({ rows: [expect.objectContaining({ name: 'Kale', category_id: 1 })], errors: [] });
    expect(parseIngredientCsv(`${header}\nKale,Spaceship,49,4,9,1,1,0,1,0,,3`, cats).errors[0]).toMatch(/unknown category/);
    expect(parseIngredientCsv(`${header}\nKale,Vegetables,49,4,9,1,1,0,1,0,plutonium,3`, cats).errors[0]).toMatch(/allergen/);
    expect(parseIngredientCsv('name\nKale', cats).errors[0]).toMatch(/Header/);
  });

  it('makes slugs, change labels, heat colours and running totals', () => {
    expect(slugify('Chicken Karahi (Lahori)!')).toBe('chicken-karahi-lahori');
    expect(pctChange(12, 10)).toBe('+20.0% vs previous period');
    expect(pctChange(0, 0)).toBeNull();
    expect(heatColor(null)).toBe('#f5f5f4');
    expect(heatColor(0.95)).toBe('#16a34a');
    const series = [{ day: '2026-10-29', new_users: 1, active_users: 0, generations: 0, views: 0, saves: 0 },
      { day: '2026-10-30', new_users: 2, active_users: 0, generations: 0, views: 0, saves: 0 }];
    expect(cumulativeUsers(series, 10)).toEqual([{ day: '2026-10-29', users: 8 }, { day: '2026-10-30', users: 10 }]);
  });

  it('neutralises spreadsheet formulas in CSV exports', () => {
    expect(toCsv([{ name: '=HYPERLINK("x")', note: 'a,b' }])).toBe('name,note\n"\'=HYPERLINK(""x"")","a,b"');
  });
});

describe('image urls', () => {
  it('serves bundled images unless an R2 base url is configured', async () => {
    const { imageUrl, IMAGES } = await import('./images');
    expect(imageUrl(IMAGES.kitchenHero)).toBe('/images/kitchen/counter-hero.webp');
    expect(imageUrl('/kitchen/x.webp')).toBe('/images/kitchen/x.webp');
  });
});
