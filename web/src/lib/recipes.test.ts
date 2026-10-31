import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPreferences } from './preferences';
import { dailyShare, generateRecipes, macroShares, recipeRequest, shoppingList, shoppingText } from './recipes';
import { KARAHI } from '../test/recipeFixture';

afterEach(() => vi.unstubAllGlobals());

describe('recipeRequest', () => {
  it('sends tastes, effective tags, free-text words and tier', () => {
    const prefs = { ...emptyPreferences(), tastes: { sweet: null, salty: 'low' as const, sour: null, spicy: 'high' as const },
      allergens: ['milk' as const], customAllergens: ['prawns', 'garlic'], calorieTier: 'medium' as const };
    expect(recipeRequest(['Beef'], prefs, 3)).toEqual({
      ingredients: ['Beef'], tastes: prefs.tastes, allergens: ['milk', 'shellfish'], blocked_words: ['prawns', 'garlic'],
      calorie_tier: 'medium', servings: 3,
    });
  });
});

describe('generateRecipes', () => {
  it('posts with the bearer token and returns recipes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ recipes: [KARAHI], suggestions: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await generateRecipes('tok', ['Chicken Breast'], emptyPreferences(), 2);
    expect(out.recipes[0].title).toBe('Chicken Breast Karahi');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/recipes$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
  it.each([
    [422, { detail: 'Prawns is blocked by your allergen shield' }, 'Prawns is blocked by your allergen shield'],
    [401, {}, /session has expired/],
    [500, {}, /Could not create recipes/],
  ])('maps HTTP %i to a friendly error', async (status, body, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
    await expect(generateRecipes('t', ['x'], emptyPreferences(), 2)).rejects.toThrow(message);
  });
  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fail'); }));
    await expect(generateRecipes('t', ['x'], emptyPreferences(), 2)).rejects.toThrow(/reach the recipe service/);
  });
});

describe('nutrition helpers', () => {
  it('splits energy by macro and sums to 100', () => {
    const s = macroShares({ kcal: 400, protein: 30, carbs: 20, fat: 20 });
    expect(s).toEqual({ protein: 32, carbs: 21, fat: 47 }); // 120 + 80 + 180 kcal
    expect(macroShares({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
  it('shows the share of the daily target', () => {
    expect(dailyShare(KARAHI, { calorieTier: 'medium' })).toBe(27);
    expect(dailyShare(KARAHI, { calorieTier: null })).toBeNull();
  });
});

describe('shoppingList', () => {
  it('lists only what is missing and skips unowned pinches of spice', () => {
    const lines = shoppingList(KARAHI, new Map([['Chicken Breast', 200], ['Onion', 500]]));
    expect(lines).toEqual([
      { name: 'Chicken Breast', needG: 350, haveG: 200, buyG: 150 },
      { name: 'Tomato', needG: 100, haveG: 0, buyG: 100 },
      { name: 'Cooking Oil', needG: 20, haveG: 0, buyG: 20 },
    ]);
    expect(shoppingText(KARAHI, lines)).toBe('Shopping list: Chicken Breast Karahi\n- Chicken Breast: 150 g\n- Tomato: 100 g\n- Cooking Oil: 20 g');
  });
});
