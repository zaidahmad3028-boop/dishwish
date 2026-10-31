import { supabase } from './supabase';

// One row of public.ingredients (values per 100 g, as supplied in the seed CSV).
export interface Ingredient {
  id: number;
  name: string;
  category: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  allergens: string[];
}

export interface PantryItem {
  ingredientId: number;
  quantityG: number;
}

export const MAX_GRAMS = 100_000;

// "250", " 1500 " -> number; empty, negative, fractional junk or > 100 kg -> null.
export function parseGrams(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const grams = Math.round(Number(trimmed));
  return grams >= 1 && grams <= MAX_GRAMS ? grams : null;
}

export function formatGrams(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toLocaleString('en', { maximumFractionDigits: 2 })} kg` : `${Math.round(grams)} g`;
}

let catalogCache: Promise<Ingredient[]> | null = null;

// The catalog is public and fixed per deploy, so one fetch per page load is enough.
export function loadCatalog(): Promise<Ingredient[]> {
  catalogCache ??= (async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id, name, kcal, protein, carbs, fat, allergens, categories(name)')
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const r = row as unknown as Omit<Ingredient, 'category'> & { categories: { name: string } | null };
      return {
        id: r.id, name: r.name, category: r.categories?.name ?? 'Other',
        kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat),
        allergens: r.allergens ?? [],
      };
    });
  })().catch((err) => { catalogCache = null; throw err; });
  return catalogCache;
}

export function resetCatalogCache() {
  catalogCache = null;
}

export async function loadPantry(userId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase.from('pantry_items').select('ingredient_id, quantity_g').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ingredientId: Number(r.ingredient_id), quantityG: Number(r.quantity_g) }));
}

export async function setPantryItem(userId: string, ingredientId: number, quantityG: number): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .upsert({ user_id: userId, ingredient_id: ingredientId, quantity_g: quantityG }, { onConflict: 'user_id,ingredient_id' });
  if (error) throw new Error(error.message);
}

export async function removePantryItem(userId: string, ingredientId: number): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('user_id', userId).eq('ingredient_id', ingredientId);
  if (error) throw new Error(error.message);
}
