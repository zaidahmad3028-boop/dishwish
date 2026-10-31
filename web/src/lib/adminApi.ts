// Super Admin data access. Every call is re-checked in the database (RLS + admin RPCs that
// raise 42501 for non-admins), so this module grants nothing by itself.
import { supabase } from './supabase';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === '42501' ? 'Admin access required.' : error.message);
  return data as T;
}

export interface Overview {
  total_users: number; new_users: number; new_users_prev: number; active_users: number; deactivated_users: number;
  total_ingredients: number; total_recipes: number; draft_recipes: number; generations: number; generations_prev: number;
  saves: number; views: number; cooked: number; avg_rating: number | null; ratings: number; open_feedback: number; edges: number;
}
export interface DayPoint { day: string; new_users: number; active_users: number; generations: number; views: number; saves: number }

export const overview = (days = 30) => rpc<Overview>('admin_overview', { days });
export const timeseries = (days = 30) => rpc<DayPoint[]>('admin_timeseries', { days }).then((rows) => rows.map((r) => ({
  ...r, new_users: Number(r.new_users), active_users: Number(r.active_users), generations: Number(r.generations), views: Number(r.views), saves: Number(r.saves),
})));
export const topIngredients = (days = 30, lim = 8) => rpc<{ name: string; uses: number }[]>('admin_top_ingredients', { days, lim })
  .then((rows) => rows.map((r) => ({ ...r, uses: Number(r.uses) })));
export const topRecipes = (days = 30, lim = 8) => rpc<{ recipe_slug: string | null; recipe_name: string; generated: number; viewed: number; saved: number; cooked: number }[]>(
  'admin_top_recipes', { days, lim }).then((rows) => rows.map((r) => ({ ...r, generated: Number(r.generated), viewed: Number(r.viewed), saved: Number(r.saved), cooked: Number(r.cooked) })));
export const categoryUsage = (days = 30) => rpc<{ category: string; recipes: number; uses: number }[]>('admin_category_usage', { days })
  .then((rows) => rows.map((r) => ({ ...r, recipes: Number(r.recipes), uses: Number(r.uses) })));
export interface PreferenceStats { tastes: Record<string, { low: number; medium: number; high: number }>; diets: Record<string, number>; cuisines: Record<string, number>; allergens: Record<string, number>; onboarded: number }
export const preferenceStats = () => rpc<PreferenceStats>('admin_preference_stats');

export interface AdminUser { user_id: string; display_name: string; email: string; created_at: string; status: 'active' | 'deactivated'; last_active: string | null; saved: number; generated: number; is_admin: boolean }
export const listUsers = (search: string, status: string, page: number, pageSize = 10) =>
  rpc<{ total: number; rows: AdminUser[] }>('admin_list_users', { search, status_filter: status, page, page_size: pageSize });
export const setUserStatus = (target: string, status: 'active' | 'deactivated') => rpc<null>('admin_set_user_status', { target, new_status: status });

export interface AdminFeedback { id: number; kind: string; rating: number | null; subject: string; message: string; recipe_slug: string | null; status: string; admin_note: string; created_at: string; updated_at: string; resolved_at: string | null; author: string }
export const listFeedback = (search: string, status: string, kind: string, page: number, pageSize = 10) =>
  rpc<{ total: number; counts: { open: number; in_progress: number; resolved: number }; rows: AdminFeedback[] }>('admin_list_feedback',
    { search, status_filter: status, kind_filter: kind, page, page_size: pageSize });
export async function updateFeedback(id: number, patch: { status?: string; admin_note?: string }) {
  if (patch.admin_note !== undefined && patch.admin_note.length > 2000) throw new Error('Notes are limited to 2,000 characters.');
  const { error } = await supabase.from('feedback').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function allFeedbackForStats() {
  const { data, error } = await supabase.from('feedback').select('kind, rating, status, created_at').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as { kind: string; rating: number | null; status: string; created_at: string }[];
}

// ---- Ingredients, categories and the compatibility graph ----
export interface AdminIngredient {
  id: number; name: string; category_id: number; kcal: number; protein: number; carbs: number; fat: number;
  sweet: number; salty: number; sour: number; spicy: number; allergens: string[]; priority: number; image_url: string | null;
}
const ING_COLS = 'id, name, category_id, kcal, protein, carbs, fat, sweet, salty, sour, spicy, allergens, priority, image_url';

export async function listIngredients(): Promise<AdminIngredient[]> {
  const { data, error } = await supabase.from('ingredients').select(ING_COLS).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat) })) as AdminIngredient[];
}
export async function listCategories(): Promise<{ id: number; name: string }[]> {
  const { data, error } = await supabase.from('categories').select('id, name').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: number; name: string }[];
}
export async function addCategory(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 40) throw new Error('Category names must be 1–40 characters.');
  const { error } = await supabase.from('categories').insert({ name: clean });
  if (error) throw new Error(error.code === '23505' ? 'That category already exists.' : error.message);
}

export function validateIngredient(i: Omit<AdminIngredient, 'id'>): string | null {
  if (!i.name.trim() || i.name.length > 100) return 'Name must be 1–100 characters.';
  for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) if (!Number.isFinite(i[k]) || i[k] < 0) return `${k} must be 0 or more.`;
  for (const k of ['sweet', 'salty', 'sour', 'spicy'] as const) if (!Number.isInteger(i[k]) || i[k] < 0 || i[k] > 10) return `${k} must be a whole number 0–10.`;
  if (!Number.isInteger(i.priority) || i.priority < 1 || i.priority > 5) return 'Priority must be 1–5.';
  if (i.image_url && !/^https:\/\//.test(i.image_url)) return 'Image URL must start with https://';
  return null;
}

export async function saveIngredient(id: number | null, i: Omit<AdminIngredient, 'id'>) {
  const problem = validateIngredient(i);
  if (problem) throw new Error(problem);
  const row = { ...i, name: i.name.trim(), image_url: i.image_url || null };
  const { error } = id === null ? await supabase.from('ingredients').insert(row) : await supabase.from('ingredients').update(row).eq('id', id);
  if (error) throw new Error(error.code === '23505' ? 'An ingredient with that name already exists.' : error.message);
}
export async function deleteIngredient(id: number) {
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) throw new Error(error.code === '23503' ? 'This ingredient is used by recipes or pantries, so it can’t be deleted.' : error.message);
}
export const ingredientUsage = () => rpc<{ ingredient_id: number; recipes: number; pantries: number; edges: number }[]>('admin_ingredient_usage')
  .then((rows) => rows.map((r) => ({ ingredient_id: Number(r.ingredient_id), recipes: Number(r.recipes), pantries: Number(r.pantries), edges: Number(r.edges) })));

export interface Edge { ingredient_a: number; ingredient_b: number; weight: number; relation_type: string; evidence: string; updated_at: string }
export const RELATIONS = ['co-occurrence', 'complementary', 'flavour-bridge', 'contrast', 'avoid'] as const;

export async function listEdges(): Promise<Edge[]> {
  const { data, error } = await supabase.from('ingredient_compatibility').select('ingredient_a, ingredient_b, weight, relation_type, evidence, updated_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({ ...e, weight: Number(e.weight), ingredient_a: Number(e.ingredient_a), ingredient_b: Number(e.ingredient_b) })) as Edge[];
}
export async function saveEdge(a: number, b: number, weight: number, relation: string, evidence: string) {
  if (a === b) throw new Error('Pick two different ingredients.');
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('Weight must be between 0 and 1.');
  if (!RELATIONS.includes(relation as (typeof RELATIONS)[number])) throw new Error('Unknown relation type.');
  const [x, y] = a < b ? [a, b] : [b, a];
  const { error } = await supabase.from('ingredient_compatibility').upsert(
    { ingredient_a: x, ingredient_b: y, weight, relation_type: relation, evidence: evidence.trim().slice(0, 200) },
    { onConflict: 'ingredient_a,ingredient_b' });
  if (error) throw new Error(error.message);
}
export async function deleteEdge(a: number, b: number) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const { error } = await supabase.from('ingredient_compatibility').delete().eq('ingredient_a', x).eq('ingredient_b', y);
  if (error) throw new Error(error.message);
}

// ---- Curated recipes ----
export interface AdminRecipe { id: number; slug: string; name: string; description: string; category: string; cuisine: string; minutes: number; servings: number;
  taste: Record<'sweet' | 'salty' | 'sour' | 'spicy', number>; image_url: string | null; status: 'draft' | 'published' | 'archived'; source: string; created_at: string; updated_at: string }
export const RECIPE_CATEGORIES = ['Main Course', 'Rice', 'Lentils', 'Vegetables', 'Snacks', 'Breakfast', 'Desserts'] as const;

export async function listRecipes(): Promise<AdminRecipe[]> {
  const { data, error } = await supabase.from('curated_recipes')
    .select('id, slug, name, description, category, cuisine, minutes, servings, taste, image_url, status, source, created_at, updated_at').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminRecipe[];
}
export async function recipeParts(id: number) {
  const [lines, steps] = await Promise.all([
    supabase.from('recipe_ingredients').select('ingredient_id, position, grams, display').eq('recipe_id', id).order('position'),
    supabase.from('recipe_steps').select('position, body').eq('recipe_id', id).order('position'),
  ]);
  if (lines.error) throw new Error(lines.error.message);
  if (steps.error) throw new Error(steps.error.message);
  return {
    lines: (lines.data ?? []).map((l) => ({ ingredient_id: Number(l.ingredient_id), grams: Number(l.grams), display: l.display as string })),
    steps: (steps.data ?? []).map((s) => s.body as string),
  };
}
export interface RecipeDraft extends Omit<AdminRecipe, 'id' | 'created_at' | 'updated_at' | 'source'> {
  id: number | null; source?: string; lines: { ingredient_id: number; grams: number; display: string }[]; steps: string[];
}
export function validateRecipe(r: RecipeDraft): string | null {
  if (!/^[a-z0-9-]{1,80}$/.test(r.slug)) return 'Slug must use lowercase letters, numbers and dashes.';
  if (!r.name.trim() || r.name.length > 80) return 'Name must be 1–80 characters.';
  if (!Number.isInteger(r.minutes) || r.minutes < 1 || r.minutes > 600) return 'Minutes must be 1–600.';
  if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 20) return 'Servings must be 1–20.';
  if (!r.lines.length) return 'Add at least one ingredient.';
  if (new Set(r.lines.map((l) => l.ingredient_id)).size !== r.lines.length) return 'Each ingredient can appear only once.';
  if (r.lines.some((l) => !(l.grams > 0 && l.grams <= 10000))) return 'Ingredient grams must be between 1 and 10,000.';
  const steps = r.steps.map((s) => s.trim()).filter(Boolean);
  if (!steps.length) return 'Add at least one step.';
  if (steps.some((s) => s.length > 600)) return 'Each step must be under 600 characters.';
  if (Object.values(r.taste).some((v) => !(v >= 0 && v <= 10))) return 'Taste scores must be 0–10.';
  if (r.image_url && !/^https:\/\//.test(r.image_url)) return 'Image URL must start with https://';
  return null;
}
export async function saveRecipe(r: RecipeDraft): Promise<number> {
  const problem = validateRecipe(r);
  if (problem) throw new Error(problem);
  const payload = { ...r, id: r.id ?? '', name: r.name.trim(), steps: r.steps.map((s) => s.trim()).filter(Boolean), ingredients: r.lines };
  const id = await rpc<number>('admin_save_recipe', { payload });
  return Number(id);
}
export async function setRecipeStatus(id: number, status: AdminRecipe['status']) {
  const { error } = await supabase.from('curated_recipes').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteRecipe(id: number) {
  const { error } = await supabase.from('curated_recipes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function recipeRatings(): Promise<Record<string, { avg: number; count: number }>> {
  const { data, error } = await supabase.from('feedback').select('recipe_slug, rating');
  if (error) throw new Error(error.message);
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const f of data ?? []) {
    if (!f.recipe_slug || !f.rating) continue;
    acc[f.recipe_slug] ??= { sum: 0, count: 0 };
    acc[f.recipe_slug].sum += f.rating; acc[f.recipe_slug].count += 1;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { avg: v.sum / v.count, count: v.count }]));
}

// ---- Settings and audit ----
export interface RecommendationSettings { weights: Record<'coverage' | 'compatibility' | 'taste' | 'cooking', number>; missing_penalty: number; missing_tolerance: number; min_score: number }
export async function getSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T | undefined) ?? null;
}
export function validateRecommendationSettings(s: RecommendationSettings): string | null {
  const w = Object.values(s.weights);
  if (w.some((v) => !(v >= 0 && v <= 1))) return 'Each weight must be between 0 and 1.';
  if (w.reduce((a, b) => a + b, 0) <= 0) return 'At least one weight must be above 0.';
  if (!(s.missing_penalty >= 0 && s.missing_penalty <= 0.2)) return 'Missing penalty must be 0–0.2.';
  if (!(Number.isInteger(s.missing_tolerance) && s.missing_tolerance >= 0 && s.missing_tolerance <= 10)) return 'Tolerance must be a whole number 0–10.';
  if (!(s.min_score >= 0 && s.min_score <= 1)) return 'Similarity threshold must be 0–1.';
  return null;
}
export async function saveSetting(key: string, value: unknown, isPublic = true) {
  const { error } = await supabase.from('app_settings').upsert({ key, value, is_public: isPublic }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
export interface AuditRow { id: number; actor: string | null; action: string; entity: string; entity_id: string; details: Record<string, unknown>; created_at: string }
export async function listAudit(limit = 50): Promise<AuditRow[]> {
  const { data, error } = await supabase.from('admin_audit_log').select('id, actor, action, entity, entity_id, details, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}
export const systemStatus = () => rpc<{ database: string; server_time: string; postgres_version: string; database_size_bytes: number; admins: number;
  tables: Record<string, number>; rls_disabled: string[] }>('admin_system_status');

export function pctChange(now: number, prev: number): string | null {
  if (!prev) return now ? 'new this period' : null;
  const p = ((now - prev) / prev) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}% vs previous period`;
}
