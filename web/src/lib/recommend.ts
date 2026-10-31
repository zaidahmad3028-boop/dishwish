import { effectiveAllergenTags, isIngredientBlocked, TASTE_SCORES, type Preferences, type TasteKey } from './preferences';
import type { Ingredient } from './pantryApi';
import { API_URL } from './recipes';

export interface Recommendation {
  name: string;
  matchPercent: number;
  pairsWith: string;
}

interface ApiRow {
  name: string;
  score: number;
  allergens: string[];
  contributions: Record<string, number>;
}

// Selected names go in pick order; the API sums edge weights over all of them.
export function recommendRequest(selected: string[], prefs: Preferences, limit = 20) {
  const taste_preferences: Partial<Record<TasteKey, number>> = {};
  for (const [taste, level] of Object.entries(prefs.tastes) as [TasteKey, Preferences['tastes'][TasteKey]][]) {
    if (level) taste_preferences[taste] = TASTE_SCORES[level];
  }
  return { selected_ingredients: selected, taste_preferences, excluded_allergens: effectiveAllergenTags(prefs), limit };
}

export async function fetchRecommendations(selected: string[], prefs: Preferences, byName: ReadonlyMap<string, Ingredient>, count = 6): Promise<Recommendation[]> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recommendRequest(selected, prefs)),
    });
  } catch {
    throw new Error('Could not reach the recommendation service.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not load recommendations.');
  return (body.recommendations as ApiRow[])
    .filter((row) => {
      const item = byName.get(row.name);
      return !isIngredientBlocked(row.name, item?.allergens ?? row.allergens, prefs);
    })
    .slice(0, count)
    .map((row) => {
      const [pairsWith] = Object.entries(row.contributions).sort((a, b) => b[1] - a[1])[0];
      // Each edge weight is at most 1 and the taste factor at most 1, so score / picks is 0-1.
      return { name: row.name, matchPercent: Math.round((row.score / selected.length) * 100), pairsWith };
    });
}
