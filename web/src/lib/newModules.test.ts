import { describe, expect, it } from 'vitest';
import { toCsv } from '../components/ui';
import { cumulativeUsers } from '../pages/admin/AdminDashboardPage';
import { isBalanced, startingIngredients } from '../pages/RecommendationsPage';
import { recipeShopping } from '../pages/CuratedRecipePage';
import { mealCalorieCap } from './curatedApi';
import { achievementsFor, totalRecipes } from '../pages/ProfilePage';
import { ageFrom, validateDetails } from './accountApi';
import { parseRecipeImport } from './adminApi';
import { filterFeedback } from '../pages/admin/AdminFeedbackPage';
import { compatibleWith, pairBreakdown } from '../pages/admin/AdminMatchPage';
import { tasteDistribution } from '../pages/admin/AdminOverviewPage';
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

describe('balanced nutrition check', () => {
  it('needs enough protein and not too much energy from fat', () => {
    expect(isBalanced({ kcal: 420, protein: 38, carbs: 18, fat: 22 })).toBe(true);
    expect(isBalanced({ kcal: 500, protein: 4, carbs: 80, fat: 15 })).toBe(false);
    expect(isBalanced({ kcal: 600, protein: 25, carbs: 5, fat: 55 })).toBe(false);
    expect(isBalanced({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toBe(false);
  });
});

describe('admin helpers', () => {
  const items = [{ id: 1, name: 'Chicken' }, { id: 2, name: 'Tomato' }, { id: 3, name: 'Ginger' }, { id: 4, name: 'Mango' }];
  const edge = (ingredient_a: number, ingredient_b: number, weight: number) => ({ ingredient_a, ingredient_b, weight, relation_type: 'complementary', evidence: '', updated_at: '' });

  it('ranks compatible ingredients by their average link to the chosen ones', () => {
    const out = compatibleWith(['Chicken', 'Tomato'], [edge(1, 3, 0.9), edge(2, 3, 0.7), edge(1, 2, 1), edge(2, 4, 0.95)], items);
    expect(out.map((o) => o.name)).toEqual(['Mango', 'Ginger']);
    expect(out[1].score).toBeCloseTo(0.8);
  });

  it('gives each chosen ingredient its own pair score, and none without pairs', () => {
    const out = pairBreakdown(['A', 'B', 'C'], [{ a: 'A', b: 'B', weight: 0.8 }]);
    expect(out).toEqual([{ name: 'A', score: 0.8 }, { name: 'B', score: 0.8 }, { name: 'C', score: null }]);
  });

  it('filters and sorts feedback across every row', () => {
    const now = Date.parse('2026-11-05T00:00:00Z');
    const row = (id: number, rating: number | null, created_at: string) => ({ id, rating, created_at }) as never;
    const rows = [row(1, 5, '2026-11-01T00:00:00Z'), row(2, 3, '2026-11-03T00:00:00Z'), row(3, 5, '2026-01-01T00:00:00Z')];
    expect(filterFeedback(rows, 30, 0, 'newest', now).map((f: { id: number }) => f.id)).toEqual([2, 1]);
    expect(filterFeedback(rows, 30, 0, 'oldest', now).map((f: { id: number }) => f.id)).toEqual([1, 2]);
    expect(filterFeedback(rows, 30, 0, 'rating', now).map((f: { id: number }) => f.id)).toEqual([1, 2]);
    expect(filterFeedback(rows, 365, 5, 'newest', now).map((f: { id: number }) => f.id)).toEqual([1, 3]);
  });

  it('counts spice levels and other tastes from saved preferences without inventing any', () => {
    const out = tasteDistribution({ spicy: { low: 1, medium: 1, high: 2 }, sweet: { low: 0, medium: 0, high: 0 } });
    expect(out.map((t) => [t.label, t.percent])).toEqual([['Spicy', 50], ['Medium', 25], ['Mild', 25], ['Sweet', 0], ['Sour', 0]]);
    expect(tasteDistribution({}).every((t) => t.percent === 0)).toBe(true);
  });

  it('rejects a whole recipe import if an ingredient is unknown', () => {
    const list = [{ id: 1, name: 'Chicken' }];
    const good = { name: 'Test Dish', ingredients: [{ name: 'chicken', grams: 200 }], steps: ['Cook it'] };
    expect(parseRecipeImport(JSON.stringify([good]), list).drafts[0]).toMatchObject({ slug: 'test-dish', status: 'draft', lines: [{ ingredient_id: 1, grams: 200 }] });
    expect(parseRecipeImport(JSON.stringify([{ ...good, ingredients: [{ name: 'Unicorn', grams: 1 }] }]), list).errors[0]).toMatch(/Unicorn/);
    expect(parseRecipeImport('not json', list).errors[0]).toMatch(/JSON/);
  });
});

describe('checklist additions', () => {
  it('caps one serving at a third of the daily calorie goal, and only with a goal', () => {
    expect(mealCalorieCap({ calorieTier: 'low' })).toBe(400);
    expect(mealCalorieCap({ calorieTier: null })).toBeUndefined();
  });

  it('asks for savory only when the cook chose it', () => {
    const sel = { ingredients: ['Tomato', 'Onion'], tastes: { sweet: null, salty: null, sour: null, spicy: null }, diets: [], maxMinutes: null };
    const prefs = { ...emptyPreferences(), calorieTier: 'high' as const };
    expect(recommendationRequest(sel, prefs, []).tastes).not.toHaveProperty('savory');
    expect(recommendationRequest(sel, prefs, [], { savory: true }).tastes).toMatchObject({ savory: 'high' });
    expect(recommendationRequest(sel, prefs, []).max_kcal).toBe(600);
  });

  it('lists only what the cook is short of, never staples', () => {
    const lines = recipeShopping([
      { name: 'Chicken Breast', grams: 500, staple: false, have: false },
      { name: 'Salt', grams: 5, staple: true, have: false },
      { name: 'Tomato', grams: 200, staple: false, have: true },
      { name: 'Ginger', grams: 20, staple: false, have: false },
    ], new Map([['Chicken Breast', 200]]));
    expect(lines.map((l) => [l.name, l.buyG])).toEqual([['Chicken Breast', 300], ['Ginger', 20]]);
  });
});

describe('recommendations with nothing chosen', () => {
  const catalog = ['Chicken Breast', 'Tomato', 'Onion', 'Green Chilli', 'Milk', 'Rice'].map((name) => ({ name, allergens: name === 'Milk' ? ['milk'] : [] }));
  const none = { allergens: [], customAllergens: [] };

  it('starts from the pantry when it can', () => {
    expect(startingIngredients(['Rice', 'Onion'], catalog, none)).toEqual({ names: ['Rice', 'Onion'], source: 'pantry' });
  });

  it('falls back to the starter set', () => {
    expect(startingIngredients(['Rice'], catalog, none)).toEqual({ names: ['Chicken Breast', 'Tomato', 'Onion', 'Green Chilli'], source: 'starter' });
  });

  it('never starts with something the cook is allergic to', () => {
    expect(startingIngredients(['Milk', 'Rice'], catalog, { allergens: ['milk'], customAllergens: [] }).names).not.toContain('Milk');
    expect(startingIngredients([], catalog, { allergens: [], customAllergens: ['chicken'] }).names).not.toContain('Chicken Breast');
  });
});

describe('profile helpers', () => {
  it('works out age, never inventing one', () => {
    const today = new Date(2026, 10, 4);
    expect(ageFrom('2003-08-07', today)).toBe(23);
    expect(ageFrom('2003-12-07', today)).toBe(22);
    expect(ageFrom('', today)).toBeNull();
    expect(ageFrom('2030-01-01', today)).toBeNull();
  });

  it('validates the optional details', () => {
    const blank = { phone: '', birthDate: '', location: '', bio: '', cookingLevel: '' };
    expect(validateDetails(blank)).toBeNull();
    expect(validateDetails({ ...blank, phone: 'call me' })).toMatch(/phone/);
    expect(validateDetails({ ...blank, phone: '+92 300 1234567' })).toBeNull();
    expect(validateDetails({ ...blank, cookingLevel: 'Wizard' })).toMatch(/level/);
  });

  it('counts each dish once and ignores views', () => {
    expect(totalRecipes([{ title: 'Karahi' }], [{ kind: 'generated', recipe_name: 'karahi' }, { kind: 'cooked', recipe_name: 'Biryani' }, { kind: 'viewed', recipe_name: 'Kheer' }])).toBe(2);
  });

  it('unlocks achievements only from recorded activity', () => {
    const none = achievementsFor([], []);
    expect(none.every((x) => !x.unlocked)).toBe(true);
    const some = achievementsFor([{ favorite: true }], [{ kind: 'cooked' }]);
    const unlocked = (t: string) => some.find((x) => x.title === t)?.unlocked;
    expect([unlocked('First Recipe Saved'), unlocked('First Recipe Cooked'), unlocked('First Favorite'), unlocked('Five Recipes Cooked'), unlocked('First Ingredient Match')]).toEqual([true, true, true, false, false]);
  });
});

describe('image urls', () => {
  it('serves bundled images unless an R2 base url is configured', async () => {
    const { imageUrl, IMAGES } = await import('./images');
    expect(imageUrl(IMAGES.kitchenHero)).toBe('/images/kitchen/counter-hero.webp');
    expect(imageUrl('/kitchen/x.webp')).toBe('/images/kitchen/x.webp');
  });
});
