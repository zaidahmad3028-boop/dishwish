import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useLiveTick } from './useLiveTick';
import { loadCatalog, loadPantry, resetCatalogCache, setPantryItem, type Ingredient, type PantryItem } from './pantryApi';
import type { Preferences } from './preferences';
import { loadPreferences } from './preferencesApi';
import type { ShoppingLine } from './recipes';

// Catalog, pantry and preferences together, as the kitchen and recipe pages need them.
const LIVE_TABLES = ['ingredients', 'pantry_items', 'preferences'];
// Keep the old object when nothing changed, so a quiet refresh doesn't restart searches that depend on it.
const same = <T,>(next: T) => (old: T | null) => (JSON.stringify(old) === JSON.stringify(next) ? (old as T) : next);

export function useKitchenData(userId: string | undefined) {
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState('');

  // Signed out (once the session check has finished): the public catalog alone, so pages still render.
  const { loading } = useAuth();
  const tick = useLiveTick(LIVE_TABLES);
  useEffect(() => {
    if (userId || loading) return;
    let live = true;
    loadCatalog().then((c) => { if (live) setCatalog(c); }).catch((e: Error) => { if (live) { setCatalog([]); setError(e.message); } });
    return () => { live = false; };
  }, [userId, loading]);

  useEffect(() => {
    if (!userId) return;
    if (tick) resetCatalogCache();
    Promise.all([loadCatalog(), loadPantry(userId), loadPreferences(userId)])
      .then(([c, p, pr]) => { setCatalog(same(c)); setPantry(same(p)); setPrefs(same(pr)); })
      .catch((e: Error) => { if (!tick) { setCatalog([]); setError(e.message); } });
  }, [userId, tick]);

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
