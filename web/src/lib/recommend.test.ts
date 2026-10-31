import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPreferences } from './preferences';
import { fetchRecommendations, recommendRequest } from './recommend';
import { CATALOG } from '../test/catalogFixture';

const byName = new Map(CATALOG.map((i) => [i.name, i]));
afterEach(() => vi.unstubAllGlobals());

describe('recommendations', () => {
  it('sends picks in order, taste scores and effective allergen tags', () => {
    const prefs = { ...emptyPreferences(), tastes: { sweet: 'high' as const, salty: null, sour: null, spicy: 'low' as const }, customAllergens: ['shrimp'] };
    expect(recommendRequest(['Onion', 'Beef'], prefs)).toEqual({
      selected_ingredients: ['Onion', 'Beef'], taste_preferences: { sweet: 8, spicy: 2 }, excluded_allergens: ['shellfish'], limit: 20,
    });
  });

  it('turns cumulative scores into match % and the strongest pairing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ recommendations: [
      { name: 'Onion', score: 1.5, allergens: [], contributions: { Beef: 0.7, Tomato: 0.8 } },
    ] }), { status: 200 })));
    const rows = await fetchRecommendations(['Beef', 'Tomato'], emptyPreferences(), byName);
    expect(rows).toEqual([{ name: 'Onion', matchPercent: 75, pairsWith: 'Tomato' }]);
  });

  it('drops suggestions blocked by free-text words and reports errors', async () => {
    const prefs = { ...emptyPreferences(), customAllergens: ['onion'] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ recommendations: [
      { name: 'Onion', score: 0.9, allergens: [], contributions: { Beef: 0.9 } },
    ] }), { status: 200 })));
    expect(await fetchRecommendations(['Beef'], prefs, byName)).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Unknown ingredient: X' }), { status: 422 })));
    await expect(fetchRecommendations(['X'], prefs, byName)).rejects.toThrow('Unknown ingredient: X');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(fetchRecommendations(['Beef'], prefs, byName)).rejects.toThrow(/reach the recommendation service/);
  });
});
