import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCatalog, loadPantry, setPantryItem, type Ingredient, type PantryItem } from './pantryApi';
import type { Preferences } from './preferences';
import { loadPreferences } from './preferencesApi';
import type { ShoppingLine } from './recipes';

// Catalog, pantry and preferences together, as the kitchen and recipe pages need them.
export function useKitchenData(userId: string | undefined) {
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    Promise.all([loadCatalog(), loadPantry(userId), loadPreferences(userId)])
      .then(([c, p, pr]) => { setCatalog(c); setPantry(p); setPrefs(pr); })
      .catch((e: Error) => { setCatalog([]); setError(e.message); });
  }, [userId]);

  const byName = useMemo(() => new Map((catalog ?? []).map((i) => [i.name, i])), [catalog]);
  const pantryByName = useMemo(() => {
    const byId = new Map((catalog ?? []).map((i) => [i.id, i.name]));
    return new Map(pantry.flatMap((p) => (byId.has(p.ingredientId) ? [[byId.get(p.ingredientId)!, p.quantityG] as const] : [])));
  }, [catalog, pantry]);

  // "I bought these": top each pantry item up by the amount that was missing.
  const addBought = useCallback(async (lines: ShoppingLine[]) => {
    if (!userId) return;
    const updates = lines.flatMap((l) => {
      const item = byName.get(l.name);
      return item ? [{ ingredientId: item.id, quantityG: Math.min(100_000, l.haveG + l.buyG) }] : [];
    });
    for (const u of updates) await setPantryItem(userId, u.ingredientId, u.quantityG);
    setPantry((current) => [
      ...current.filter((p) => !updates.some((u) => u.ingredientId === p.ingredientId)),
      ...updates,
    ]);
  }, [userId, byName]);

  return { catalog, pantry, prefs, error, byName, pantryByName, addBought };
}
