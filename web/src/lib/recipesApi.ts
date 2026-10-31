import { supabase } from './supabase';
import type { CuratedSnapshot } from './curatedApi';
import type { Recipe } from './recipes';

// `recipe` is the full generated recipe, or a small snapshot pointing at a curated recipe.
export interface SavedRecipe {
  id: string;
  title: string;
  createdAt: string;
  favorite?: boolean;
  recipe: Recipe | CuratedSnapshot;
}

export const isGenerated = (r: Recipe | CuratedSnapshot): r is Recipe => (r as CuratedSnapshot).kind !== 'curated';

const toSaved = (r: { id: string; title: string; created_at: string; favorite?: boolean; data: Recipe | CuratedSnapshot }): SavedRecipe =>
  ({ id: r.id, title: r.title, createdAt: r.created_at, favorite: r.favorite ?? false, recipe: r.data });

// Stores the exact recipe JSON once per user; a second save of the same recipe
// (unique user_id + fingerprint) reports "exists" instead of writing again.
export async function saveRecipe(userId: string, recipe: Recipe): Promise<'saved' | 'exists'> {
  const { error } = await supabase
    .from('saved_recipes')
    .insert({ user_id: userId, title: recipe.title, fingerprint: recipe.fingerprint, data: recipe });
  if (!error) return 'saved';
  if (error.code === '23505') return 'exists';
  throw new Error(error.message);
}

export async function isRecipeSaved(userId: string, fingerprint: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_recipes').select('id').eq('user_id', userId).eq('fingerprint', fingerprint).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function listSavedRecipes(userId: string): Promise<SavedRecipe[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select('id, title, created_at, favorite, data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSaved);
}

export async function getSavedRecipe(id: string): Promise<SavedRecipe | null> {
  const { data, error } = await supabase.from('saved_recipes').select('id, title, created_at, data').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSaved(data) : null;
}

export async function deleteSavedRecipe(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('saved_recipes').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
}

// Shares are public, immutable snapshots: only the recipe itself, never profile data.
export async function shareRecipe(userId: string, recipe: Recipe): Promise<string> {
  const { data, error } = await supabase
    .from('shared_recipes')
    .insert({ created_by: userId, data: recipe })
    .select('token')
    .single();
  if (error) throw new Error(error.message);
  return data.token as string;
}

export async function loadSharedRecipe(token: string): Promise<Recipe | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data, error } = await supabase.from('shared_recipes').select('data').eq('token', token).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data as Recipe | undefined) ?? null;
}

export const shareUrl = (token: string) => `${window.location.origin}/r/${token}`;
