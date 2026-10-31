import { supabase } from './supabase';
import type { Recipe } from './recipes';

export interface SavedRecipe {
  id: string;
  title: string;
  createdAt: string;
  recipe: Recipe;
}

const toSaved = (r: { id: string; title: string; created_at: string; data: Recipe }): SavedRecipe =>
  ({ id: r.id, title: r.title, createdAt: r.created_at, recipe: r.data });

// Saving the same recipe twice updates the one row (unique user_id + fingerprint).
export async function saveRecipe(userId: string, recipe: Recipe): Promise<SavedRecipe> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .upsert({ user_id: userId, title: recipe.title, fingerprint: recipe.fingerprint, data: recipe }, { onConflict: 'user_id,fingerprint' })
    .select('id, title, created_at, data')
    .single();
  if (error) throw new Error(error.message);
  return toSaved(data);
}

export async function listSavedRecipes(userId: string): Promise<SavedRecipe[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select('id, title, created_at, data')
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

export const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;
