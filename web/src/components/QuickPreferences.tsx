// Kitchen dashboard: the cook's taste (four independent flavours, each Low / Moderate / High or unset), diet,
// allergens and daily calorie goal in one compact block. Every change is saved to public.preferences, and the
// same values feed the recommendation engine (selection + saved allergens) and the recipe generator (prefs).
import { useEffect, useRef, useState } from 'react';
import { Candy, Check, ChevronDown, Citrus, Droplet, Flame, Leaf, ShieldAlert, Target, X, type LucideIcon } from 'lucide-react';
import { defaultExtraPrefs, loadExtraPrefs, saveExtraPrefs, type ExtraPrefs } from '../lib/accountApi';
import { SETTINGS_DIETS, type Diet } from '../lib/curatedApi';
import { ALLERGEN_CHIPS, CALORIE_TIERS, LEVELS, type AllergenTag, type CalorieTier, type Level, type Preferences, type TasteKey } from '../lib/preferences';
import { savePreferences } from '../lib/preferencesApi';
import { useSelection } from '../lib/selection';

export const LEVEL_LABEL: Record<Level, string> = { low: 'Low', medium: 'Moderate', high: 'High' };
const FLAVOURS: { key: TasteKey; label: string; icon: LucideIcon; tint: string; ring: string }[] = [
  { key: 'sweet', label: 'Sweet', icon: Candy, tint: 'bg-pink-500', ring: 'ring-pink-300' },
  { key: 'salty', label: 'Salty', icon: Droplet, tint: 'bg-sky-500', ring: 'ring-sky-300' },
  { key: 'sour', label: 'Sour', icon: Citrus, tint: 'bg-green-500', ring: 'ring-green-300' },
  { key: 'spicy', label: 'Spicy', icon: Flame, tint: 'bg-orange-500', ring: 'ring-orange-300' },
];

type Open = TasteKey | 'allergens' | null;

// Close a popover when the cook clicks elsewhere or presses Escape.
function useDismiss(open: Open, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

export function QuickPreferences({ userId, prefs }: { userId?: string; prefs: Preferences | null }) {
  const { selection, setTaste, setTastes, toggleDiet } = useSelection();
  const [open, setOpen] = useState<Open>(null);
  const [allergens, setAllergens] = useState<AllergenTag[]>([]);
  const [tier, setTier] = useState<CalorieTier | null>(null);
  const [extra, setExtra] = useState<ExtraPrefs | null>(null);
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | string>('');
  const ref = useDismiss(open, () => setOpen(null));

  // Start from what is saved: allergens and calorie goal from prefs, diets from the same row.
  useEffect(() => { if (prefs) { setAllergens(prefs.allergens); setTier(prefs.calorieTier); } }, [prefs]);
  useEffect(() => {
    if (!userId) return;
    loadExtraPrefs(userId).then((p) => {
      setExtra(p);
      if (selection.diets.length === 0 && p.diets.length) p.diets.forEach((d) => toggleDiet(d));
    }).catch(() => setExtra(defaultExtraPrefs()));
    // Once per cook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const persist = async (next: Partial<Pick<Preferences, 'tastes' | 'allergens' | 'calorieTier'>>) => {
    if (!userId || !prefs) return;
    setStatus('saving');
    try {
      await savePreferences(userId, { ...prefs, tastes: selection.tastes, allergens, calorieTier: tier, ...next });
      setStatus('saved');
    } catch (e) { setStatus((e as Error).message); }
  };

  const chooseLevel = (key: TasteKey, level: Level | null) => {
    setTaste(key, level);
    setOpen(null);
    void persist({ tastes: { ...selection.tastes, [key]: level } });
  };
  const clearTastes = () => {
    const none = { sweet: null, salty: null, sour: null, spicy: null };
    setTastes(none);
    void persist({ tastes: none });
  };
  const flipDiet = async (d: Diet) => {
    toggleDiet(d);
    if (!userId || !extra) return;
    const diets = selection.diets.includes(d) ? selection.diets.filter((x) => x !== d) : [...selection.diets, d];
    setStatus('saving');
    try { await saveExtraPrefs(userId, { ...extra, diets }); setExtra({ ...extra, diets }); setStatus('saved'); } catch (e) { setStatus((e as Error).message); }
  };
  const flipAllergen = (t: AllergenTag) => {
    const next = allergens.includes(t) ? allergens.filter((x) => x !== t) : [...allergens, t];
    setAllergens(next);
    void persist({ allergens: next });
  };
  const chooseTier = (value: string) => {
    const next = (value || null) as CalorieTier | null;
    setTier(next);
    void persist({ calorieTier: next });
  };

  const anyTaste = Object.values(selection.tastes).some((v) => v !== null);
  return (
    <div ref={ref} className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-medium lg:text-[1.02rem]"><Flame size={19} className="fill-ember text-crimson" aria-hidden="true" />Taste Preferences</p>
          {anyTaste && <button type="button" className="text-[0.8rem] font-semibold text-crimson underline" onClick={clearTastes}>Clear all</button>}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FLAVOURS.map((f) => {
            const level = selection.tastes[f.key];
            const Icon = f.icon;
            return (
              <li key={f.key} className="relative">
                <button type="button" aria-haspopup="true" aria-expanded={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)}
                  className={`flex h-[3.1rem] w-full items-center gap-2 rounded-2xl border bg-white px-2.5 text-left shadow-sm transition hover:-translate-y-0.5 ${level ? `border-transparent ring-2 ${f.ring}` : 'border-rose-100'}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${f.tint}`}><Icon size={15} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[0.95rem] font-semibold">{f.label}</span>
                    <span className={`block text-[0.74rem] ${level ? 'font-semibold text-crimson' : 'text-stone-500'}`}>{level ? LEVEL_LABEL[level] : 'Not set'}</span>
                  </span>
                  <ChevronDown size={15} className="shrink-0 text-stone-400" aria-hidden="true" />
                </button>
                {open === f.key && (
                  <div role="radiogroup" aria-label={`${f.label} intensity`} className="card absolute left-0 right-0 top-full z-30 mt-1.5 min-w-[9.5rem] space-y-0.5 p-1.5">
                    {LEVELS.map((l) => (
                      <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => chooseLevel(f.key, l)}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-[0.88rem] ${level === l ? 'bg-gradient-to-r from-crimson to-ember font-semibold text-white' : 'hover:bg-rose-50'}`}>
                        {LEVEL_LABEL[l]}{level === l && <Check size={14} aria-hidden="true" />}
                      </button>
                    ))}
                    <button type="button" role="radio" aria-checked={level === null} onClick={() => chooseLevel(f.key, null)}
                      className="flex w-full items-center gap-1 rounded-xl px-2.5 py-1.5 text-[0.82rem] text-stone-600 hover:bg-stone-100"><X size={13} aria-hidden="true" />Not set</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <p className="flex items-center gap-2 text-[0.9rem] font-medium"><Leaf size={16} className="fill-green-600 text-green-700" aria-hidden="true" />Diet</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {SETTINGS_DIETS.map((d) => (
              <button key={d.key} type="button" aria-pressed={selection.diets.includes(d.key)} onClick={() => flipDiet(d.key)}
                className={`rounded-full border px-2 py-0.5 text-[0.76rem] font-medium transition ${selection.diets.includes(d.key) ? 'border-green-600 bg-green-600 text-white' : 'border-stone-200 bg-white hover:border-green-400'}`}>{d.label}</button>
            ))}
          </div>
        </div>
        <div className="relative">
          <p className="flex items-center gap-1.5 text-[0.9rem] font-medium"><ShieldAlert size={16} className="text-crimson" aria-hidden="true" />Allergens</p>
          <button type="button" aria-haspopup="true" aria-expanded={open === 'allergens'} onClick={() => setOpen(open === 'allergens' ? null : 'allergens')}
            className="mt-1 flex h-[1.9rem] w-full items-center justify-between gap-2 rounded-full border border-stone-200 bg-white px-3 text-[0.8rem] ">
            {allergens.length ? `${allergens.length} avoided` : 'None'}<ChevronDown size={14} aria-hidden="true" />
          </button>
          {open === 'allergens' && (
            <div className="card absolute left-0 top-full z-30 mt-1.5 grid w-[19rem] grid-cols-2 gap-1 p-2" role="group" aria-label="Allergens to avoid">
              {ALLERGEN_CHIPS.map((c) => (
                <label key={c.tag} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[0.8rem] hover:bg-rose-50">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-crimson" checked={allergens.includes(c.tag)} onChange={() => flipAllergen(c.tag)} />{c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="block">
          <span className="flex items-center gap-1.5 text-[0.9rem] font-medium"><Target size={16} className="text-ember" aria-hidden="true" />Calorie goal</span>
          <select value={tier ?? ''} onChange={(e) => chooseTier(e.target.value)} aria-label="Daily calorie goal"
            className="mt-1 h-[1.9rem] w-full rounded-full border border-stone-200 bg-white px-2.5 text-[0.8rem]">
            <option value="">No goal</option>
            {CALORIE_TIERS.map((t) => <option key={t.tier} value={t.tier}>{t.kcal} kcal / day</option>)}
          </select>
        </label>
      </div>
      <p role="status" className="min-h-[1rem] text-[0.75rem] text-stone-500">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved to your profile. Recommendations and recipe generation use these choices.' : status ? <span className="text-rose-700">{status}</span> : userId ? 'Changes are saved to your profile automatically.' : 'Log in to save your choices.'}
      </p>
    </div>
  );
}
