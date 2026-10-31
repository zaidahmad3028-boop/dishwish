import { effectiveAllergenTags, kcalForTier, type Preferences } from './preferences';

export interface RecipeIngredient {
  name: string;
  category: string;
  grams: number;
  role: string;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Recipe {
  title: string;
  style: string;
  servings: number;
  minutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition: { per_serving: Macros; total: Macros; meal_target_kcal: number | null };
  fingerprint: string;
}

export interface RecipeResult {
  recipes: Recipe[];
  suggestions: string[];
}

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export function recipeRequest(ingredients: string[], prefs: Preferences, servings: number) {
  return {
    ingredients,
    tastes: prefs.tastes,
    allergens: effectiveAllergenTags(prefs),
    blocked_words: prefs.customAllergens,
    calorie_tier: prefs.calorieTier,
    servings,
  };
}

export async function generateRecipes(token: string, ingredients: string[], prefs: Preferences, servings: number): Promise<RecipeResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(recipeRequest(ingredients, prefs, servings)),
    });
  } catch {
    throw new Error('Could not reach the recipe service. Check your connection and try again.');
  }
  if (response.status === 401) throw new Error('Your session has expired. Log in again.');
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : 'Could not create recipes. Try different ingredients.';
    throw new Error(detail);
  }
  return body as RecipeResult;
}

// Protein/carbs give 4 kcal per gram and fat 9; shares are of energy from macros.
export function macroShares(m: Macros): { protein: number; carbs: number; fat: number } {
  const p = m.protein * 4, c = m.carbs * 4, f = m.fat * 9;
  const total = p + c + f;
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
  const protein = Math.round((p / total) * 100), carbs = Math.round((c / total) * 100);
  return { protein, carbs, fat: 100 - protein - carbs };
}

export function dailyShare(recipe: Recipe, prefs: Pick<Preferences, 'calorieTier'> | null): number | null {
  const daily = kcalForTier(prefs?.calorieTier ?? null);
  return daily ? Math.round((recipe.nutrition.per_serving.kcal / daily) * 100) : null;
}

export interface ShoppingLine {
  name: string;
  needG: number;
  haveG: number;
  buyG: number;
}

// Spices and salt under 5 g count as "in the masala box" and are left off the list.
const PINCH_G = 5;

export function shoppingList(recipe: Recipe, pantryByName: ReadonlyMap<string, number>): ShoppingLine[] {
  return recipe.ingredients
    .map((i) => {
      const haveG = pantryByName.get(i.name) ?? 0;
      return { name: i.name, needG: i.grams, haveG, buyG: Math.max(0, Math.ceil(i.grams - haveG)) };
    })
    .filter((line) => line.buyG > 0 && !(line.needG < PINCH_G && line.haveG === 0 && isPinch(recipe, line.name)));
}

function isPinch(recipe: Recipe, name: string): boolean {
  const role = recipe.ingredients.find((i) => i.name === name)?.role;
  return role === 'spice' || role === 'salt';
}

export function shoppingText(recipe: Recipe, lines: ShoppingLine[]): string {
  return [`Shopping list: ${recipe.title}`, ...lines.map((l) => `- ${l.name}: ${l.buyG} g`)].join('\n');
}
