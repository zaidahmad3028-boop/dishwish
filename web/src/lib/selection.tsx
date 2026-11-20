// The cook's in-progress ingredient selection, shared by Kitchen → Selection → Recommendations →
// Recipe so Back never loses it. Kept in sessionStorage (this tab only), not the database.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Diet, Selection } from './curatedApi';
import type { Level, TasteKey } from './preferences';

export const MAX_SELECTED = 20;
const KEY = 'dishwish:selection';
// Every flavour starts at Moderate; the cook can raise, lower or unset each one.
export const DEFAULT_TASTES: Selection['tastes'] = { sweet: 'medium', salty: 'medium', sour: 'medium', spicy: 'medium' };
const empty = (): Selection => ({ ingredients: [], tastes: { ...DEFAULT_TASTES }, diets: [], maxMinutes: null });

function read(): Selection {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<Selection> | null;
    if (!raw || !Array.isArray(raw.ingredients)) return empty();
    const tastes = raw.tastes && Object.values(raw.tastes).some((v) => v !== null) ? raw.tastes : { ...DEFAULT_TASTES };
    return { ...empty(), ...raw, tastes, ingredients: raw.ingredients.filter((x) => typeof x === 'string').slice(0, MAX_SELECTED) };
  } catch {
    return empty();
  }
}

interface SelectionState {
  selection: Selection;
  add: (name: string) => boolean;
  remove: (name: string) => void;
  clear: () => void;
  setIngredients: (names: string[]) => void;
  setTaste: (taste: TasteKey, level: Level | null) => void;
  setTastes: (tastes: Selection['tastes']) => void;
  toggleDiet: (diet: Diet) => void;
  setMaxMinutes: (m: number | null) => void;
  setMaxKcal: (kcal: number | null) => void;
}

const Ctx = createContext<SelectionState | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(read);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(selection)); } catch { /* storage unavailable: state still works */ }
  }, [selection]);

  const add = useCallback((name: string) => {
    const has = (list: string[]) => list.some((i) => i.toLowerCase() === name.toLowerCase());
    if (has(selection.ingredients) || selection.ingredients.length >= MAX_SELECTED) return false;
    setSelection((s) => (has(s.ingredients) || s.ingredients.length >= MAX_SELECTED ? s : { ...s, ingredients: [...s.ingredients, name] }));
    return true;
  }, [selection.ingredients]);
  const value = useMemo<SelectionState>(() => ({
    selection, add,
    remove: (name) => setSelection((s) => ({ ...s, ingredients: s.ingredients.filter((i) => i !== name) })),
    clear: () => setSelection((s) => ({ ...s, ingredients: [] })),
    setIngredients: (names) => setSelection((s) => ({ ...s, ingredients: [...new Set(names)].slice(0, MAX_SELECTED) })),
    setTaste: (taste, level) => setSelection((s) => ({ ...s, tastes: { ...s.tastes, [taste]: level } })),
    setTastes: (tastes) => setSelection((s) => ({ ...s, tastes })),
    toggleDiet: (diet) => setSelection((s) => ({ ...s, diets: s.diets.includes(diet) ? s.diets.filter((d) => d !== diet) : [...s.diets, diet] })),
    setMaxMinutes: (maxMinutes) => setSelection((s) => ({ ...s, maxMinutes })),
    setMaxKcal: (maxKcal) => setSelection((s) => ({ ...s, maxKcal })),
  }), [selection, add]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSelection must be used inside SelectionProvider');
  return ctx;
}

// "Spicy" in the reference design means spicy=high; "Mild" means spicy=low.
export const TASTE_PRESETS: { label: string; apply: Partial<Record<TasteKey, Level | null>> }[] = [
  { label: 'Mild', apply: { spicy: 'low' } },
  { label: 'Medium', apply: { spicy: 'medium' } },
  { label: 'Spicy', apply: { spicy: 'high' } },
  { label: 'Sour', apply: { sour: 'high' } },
  { label: 'Sweet', apply: { sweet: 'high' } },
];

export function presetActive(tastes: Selection['tastes'], preset: (typeof TASTE_PRESETS)[number]): boolean {
  return Object.entries(preset.apply).every(([k, v]) => tastes[k as TasteKey] === v);
}

export function togglePreset(tastes: Selection['tastes'], preset: (typeof TASTE_PRESETS)[number]): Selection['tastes'] {
  const next = { ...tastes };
  const on = presetActive(tastes, preset);
  for (const [k, v] of Object.entries(preset.apply) as [TasteKey, Level | null][]) next[k] = on ? null : v;
  return next;
}

// Start each session from the cook's saved tastes until they pick their own for this search.
export function useSeedTastes(saved: Selection['tastes'] | undefined) {
  const { selection, setTastes } = useSelection();
  const untouched = (Object.keys(DEFAULT_TASTES) as TasteKey[]).every((k) => selection.tastes[k] === DEFAULT_TASTES[k] || selection.tastes[k] === null);
  const hasSaved = saved && Object.values(saved).some((v) => v !== null);
  useEffect(() => {
    // Saved levels win; a flavour the cook never set stays at the Moderate default.
    if (untouched && hasSaved && saved) setTastes({ sweet: saved.sweet ?? 'medium', salty: saved.salty ?? 'medium', sour: saved.sour ?? 'medium', spicy: saved.spicy ?? 'medium' });
    // Only when saved preferences first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSaved]);
}
