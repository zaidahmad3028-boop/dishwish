// Curated recipe recommendations (FastAPI suitability engine) and the cook's own activity rows.
import { supabase } from './supabase';
import { effectiveAllergenTags, type Level, type Preferences, type TasteKey } from './preferences';
import { API_URL } from './recipes';

export type Diet = 'vegetarian' | 'gluten_free' | 'low_calorie' | 'high_protein';
export const DIETS: { key: Diet; label: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian' }, { key: 'low_calorie', label: 'Low Calorie' },
  { key: 'high_protein', label: 'High Protein' }, { key: 'gluten_free', label: 'Gluten Free' },
];

export type Components = Record<'coverage' | 'compatibility' | 'taste' | 'cooking', number | null>;
export interface Macros { kcal: number; protein: number; carbs: number; fat: number }

export interface CuratedMatch {
  slug: string;
  name: string;
  category: string;
  cuisine: string;
  minutes: number;
  servings: number;
  description: string;
  image_url: string | null;
  source: string;
  match_percent: number;
  score: number;
  components: Components;
  weights_used: Partial<Record<keyof Components, number>>;
  penalty: number;
  used: string[];
  missing: string[];
  taste: Record<TasteKey, number>;
  diets: Diet[];
  nutrition_per_serving: Macros;
  explanation: string[];
}

export interface Suggestion { name: string; category: string; support: number }

export interface RecommendationResult {
  recipes: CuratedMatch[];
  suggestions: Suggestion[];
  excluded: { allergy: number; diet: number; no_overlap: number };
  settings: { weights: Record<string, number>; missing_penalty: number; missing_tolerance: number; min_score: number };
  data_source: 'database' | 'bundled';
  notes: string[];
}

export interface CuratedDetail {
  slug: string;
  name: string;
  category: string;
  cuisine: string;
  minutes: number;
  servings: number;
  description: string;
  image_url: string | null;
  source: string;
  taste: Record<TasteKey, number>;
  ingredients: { name: string; grams: number; display: string; category: string; staple: boolean; have: boolean; allergens: string[] }[];
  steps: string[];
  allergens: string[];
  diets: Diet[];
  nutrition_per_serving: Macros;
}

export interface Selection {
  ingredients: string[];
  tastes: Record<TasteKey, Level | null>;
  diets: Diet[];
  maxMinutes: number | null;
}

async function call<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
  } catch {
    throw new Error('Could not reach the recipe service. Check your connection and try again.');
  }
  if (response.status === 401) throw new Error('Your session has expired. Log in again.');
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Something went wrong. Please try again.');
  return body as T;
}

export function recommendationRequest(selection: Selection, prefs: Preferences, pantry: string[]) {
  return {
    ingredients: selection.ingredients,
    tastes: selection.tastes,
    allergens: effectiveAllergenTags(prefs),
    blocked_words: prefs.customAllergens,
    diets: selection.diets,
    pantry,
    max_minutes: selection.maxMinutes ?? undefined,
    limit: 24,
  };
}

export async function fetchCuratedRecommendations(token: string, selection: Selection, prefs: Preferences, pantry: string[]) {
  return call<RecommendationResult>('/api/recommendations', { method: 'POST', body: JSON.stringify(recommendationRequest(selection, prefs, pantry)) }, token);
}

export async function fetchCuratedDetail(slug: string, have: string[] = []): Promise<CuratedDetail> {
  const params = new URLSearchParams();
  have.slice(0, 300).forEach((h) => params.append('have', h));
  return call<CuratedDetail>(`/api/curated/${encodeURIComponent(slug)}${params.size ? `?${params}` : ''}`);
}

export async function fetchCompatibility(name: string) {
  return call<{ ingredient: string; edges: { name: string; weight: number; relation: string; evidence: string }[] }>(
    `/api/compatibility/${encodeURIComponent(name)}`);
}

// ---- Activity (public.recipe_events: the cook's own history) ----
export type EventKind = 'generated' | 'viewed' | 'saved' | 'cooked';
export interface RecipeEvent { id: number; kind: EventKind; recipe_slug: string | null; recipe_name: string; match_percent: number | null; ingredients: string[]; created_at: string }

export async function recordEvent(kind: EventKind, recipe: { slug?: string | null; name: string; matchPercent?: number }, ingredients: string[] = []) {
  // Analytics must never break cooking: failures are swallowed.
  await supabase.from('recipe_events').insert({
    kind, recipe_slug: recipe.slug ?? null, recipe_name: recipe.name.slice(0, 120),
    match_percent: recipe.matchPercent ?? null, ingredients: ingredients.slice(0, 20),
  }).then(() => undefined, () => undefined);
}

export async function listEvents(userId: string, limit = 200): Promise<RecipeEvent[]> {
  const { data, error } = await supabase.from('recipe_events')
    .select('id, kind, recipe_slug, recipe_name, match_percent, ingredients, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecipeEvent[];
}

export async function deleteEvent(userId: string, id: number) {
  const { error } = await supabase.from('recipe_events').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function trendingRecipes(days = 30): Promise<{ recipe_slug: string; recipe_name: string; uses: number }[]> {
  const { data, error } = await supabase.rpc('trending_recipes', { days, lim: 6 });
  if (error) throw new Error(error.message);
  return (data ?? []) as { recipe_slug: string; recipe_name: string; uses: number }[];
}

export interface CuratedSummary { slug: string; name: string; category: string; cuisine: string; minutes: number; servings: number; description: string; image_url: string | null }

export async function listCuratedRecipes(): Promise<CuratedSummary[]> {
  const { data, error } = await supabase.from('curated_recipes')
    .select('slug, name, category, cuisine, minutes, servings, description, image_url').eq('status', 'published').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as CuratedSummary[];
}

// ---- Saved curated recipes live in saved_recipes with a small JSON snapshot ----
export interface CuratedSnapshot { kind: 'curated'; slug: string; title: string; category: string; minutes: number; servings: number; fingerprint: string; match_percent?: number }

export const isCuratedSnapshot = (data: unknown): data is CuratedSnapshot =>
  typeof data === 'object' && data !== null && (data as { kind?: string }).kind === 'curated';

export async function saveCurated(userId: string, r: { slug: string; name: string; category: string; minutes: number; servings: number; match_percent?: number }): Promise<'saved' | 'exists'> {
  const snapshot: CuratedSnapshot = { kind: 'curated', slug: r.slug, title: r.name, category: r.category, minutes: r.minutes, servings: r.servings,
    fingerprint: `curated:${r.slug}`, ...(r.match_percent !== undefined ? { match_percent: r.match_percent } : {}) };
  const { error } = await supabase.from('saved_recipes')
    .insert({ user_id: userId, title: r.name, fingerprint: snapshot.fingerprint, data: snapshot });
  if (!error) return 'saved';
  if (error.code === '23505') return 'exists';
  throw new Error(error.message);
}

export async function setFavorite(userId: string, id: string, favorite: boolean) {
  const { error } = await supabase.from('saved_recipes').update({ favorite }).eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listSavedRows(userId: string) {
  const { data, error } = await supabase.from('saved_recipes').select('id, title, created_at, favorite, data')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; title: string; created_at: string; favorite: boolean; data: Record<string, unknown> }[];
}

export interface CompatibilityReport {
  pairs: { a: string; b: string; weight: number; evidence: string; stored: boolean }[];
  average: number | null;
  stored_pairs: number;
  suggestions: Suggestion[];
}

export async function checkCompatibility(ingredients: string[], prefs: Preferences): Promise<CompatibilityReport> {
  return call<CompatibilityReport>('/api/compatibility/check', {
    method: 'POST',
    body: JSON.stringify({ ingredients, allergens: effectiveAllergenTags(prefs), blocked_words: prefs.customAllergens }),
  });
}

// Plain-language reading of an average pair weight (0-1).
export function compatibilityVerdict(avg: number | null): { label: string; tone: 'green' | 'amber' | 'red' | 'gray' } {
  if (avg === null) return { label: 'Add another ingredient to check pairings', tone: 'gray' };
  if (avg >= 0.75) return { label: 'Your selected ingredients pair well', tone: 'green' };
  if (avg >= 0.55) return { label: 'These ingredients can work together', tone: 'amber' };
  return { label: 'An unusual combination; results may be limited', tone: 'red' };
}
