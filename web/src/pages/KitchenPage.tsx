import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Flame, Minus, Plus, RefreshCw, Search, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { displayName } from '../components/AppShell';
import { RecipeView } from '../components/RecipeView';
import { formatGrams, type Ingredient } from '../lib/pantryApi';
import { blockReason, kcalForTier } from '../lib/preferences';
import { fetchRecommendations, type Recommendation } from '../lib/recommend';
import { generateRecipes, type Recipe, type RecipeResult } from '../lib/recipes';
import { useKitchenData } from '../lib/useKitchenData';
import { useRecipeActions } from '../lib/useRecipeActions';

const MAX_PICKS = 12;
const ALL = 'All';
const PANTRY = 'In pantry';

function IngredientCard({ item, picked, reason, pantryG, onAdd }: {
  item: Ingredient; picked: boolean; reason: string | null; pantryG?: number; onAdd: () => void;
}) {
  const blocked = reason !== null;
  return (
    <li>
      <button type="button" onClick={onAdd} disabled={blocked || picked} aria-disabled={blocked || picked}
        aria-label={blocked ? `${item.name}, blocked: ${reason}` : picked ? `${item.name}, on the counter` : `Add ${item.name}`}
        className={`relative flex h-full w-full flex-col rounded-[20px] border p-3 text-left transition ${
          blocked ? 'cursor-not-allowed border-rose-300 bg-rose-50/90 text-rose-900'
            : picked ? 'border-emerald-300 bg-emerald-50/90' : 'border-white/80 bg-white/70 hover:-translate-y-0.5 hover:bg-white hover:shadow-md'}`}>
        <span className="pr-6 text-sm font-semibold leading-snug">{item.name}</span>
        <span className="mt-1 text-xs text-stone-500">{Math.round(item.kcal)} kcal / 100 g</span>
        {pantryG !== undefined && <span className="mt-1 text-[11px] font-semibold text-emerald-700">In pantry · {formatGrams(pantryG)}</span>}
        {blocked && <span className="mt-1 text-[11px] font-semibold">{reason}. Blocked by your allergen shield.</span>}
        <span className="absolute right-2.5 top-2.5" aria-hidden="true">
          {blocked ? <ShieldAlert size={16} className="text-rose-600" /> : picked ? <Check size={16} className="text-emerald-600" /> : <Plus size={16} className="text-stone-400" />}
        </span>
      </button>
    </li>
  );
}

export function KitchenPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { catalog, prefs, error: loadError, byName, pantryByName, addBought } = useKitchenData(userId);
  const [picked, setPicked] = useState<string[]>([]);
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState('');
  const [servings, setServings] = useState(2);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recState, setRecState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [recError, setRecError] = useState('');
  const [recNonce, setRecNonce] = useState(0);
  const [result, setResult] = useState<RecipeResult | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recipe: Recipe | undefined = result?.recipes[active];
  const actions = useRecipeActions(userId, recipe ?? null, addBought);

  const reasonOf = (item: Ingredient) => (prefs ? blockReason(item.name, item.allergens, prefs) : null);

  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of catalog ?? []) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return [
      { key: ALL, count: catalog?.length ?? 0 },
      { key: PANTRY, count: pantryByName.size },
      ...[...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count })),
    ];
  }, [catalog, pantryByName]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog ?? []).filter((i) =>
      (tab === ALL || (tab === PANTRY ? pantryByName.has(i.name) : i.category === tab)) && (!q || i.name.toLowerCase().includes(q)));
  }, [catalog, tab, query, pantryByName]);

  // Recommendations follow the counter: every add/remove asks the graph again.
  useEffect(() => {
    if (!prefs || picked.length === 0) { setRecs([]); setRecState('idle'); return; }
    let cancelled = false;
    setRecState('loading');
    fetchRecommendations(picked, prefs, byName)
      .then((rows) => { if (!cancelled) { setRecs(rows.filter((r) => !picked.includes(r.name))); setRecState('idle'); } })
      .catch((e: Error) => { if (!cancelled) { setRecError(e.message); setRecState('error'); } });
    return () => { cancelled = true; };
  }, [picked, prefs, byName, recNonce]);

  if (!userId || catalog === null) return <FullPageSpinner />;

  const add = (name: string) => {
    setError('');
    setPicked((p) => (p.includes(name) || p.length >= MAX_PICKS ? p : [...p, name]));
  };
  const remove = (name: string) => setPicked((p) => p.filter((n) => n !== name));

  const cook = async () => {
    if (!session || !prefs) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await generateRecipes(session.access_token, picked, prefs, servings));
      setActive(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const counterKcal = picked.reduce((sum, n) => sum + (byName.get(n)?.kcal ?? 0), 0);
  const daily = kcalForTier(prefs?.calorieTier ?? null);
  const mealTarget = daily ? Math.round(daily / 3) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="glass min-w-0 p-5 sm:p-7">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Salaam, {displayName(session?.user)}!</h1>
          <p className="mt-1 text-stone-600">Tap what’s on your counter. We’ll suggest what pairs well and cook a recipe that fits you.</p>

          {prefs && !prefs.onboarded && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[24px] border border-rose-200 bg-rose-50/80 p-4">
              <p className="flex-1 text-sm text-stone-700">Finish setting up your taste profile, allergen shield and calorie target so every recipe fits you.</p>
              <Link to="/onboarding" className="btn-primary">Finish setting up</Link>
            </div>
          )}
          {loadError && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</p>}

          <label className="relative mt-5 block">
            <span className="sr-only">Search ingredients</span>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="field pl-10" placeholder="Search e.g. mutton, aloo, palak" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>

          <div role="tablist" aria-label="Ingredient categories" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${tab === t.key ? 'chip-selected' : 'border-stone-200 bg-white/70 hover:bg-white'}`}>
                {t.key} <span className={tab === t.key ? 'opacity-90' : 'text-stone-500'}>({t.count})</span>
              </button>
            ))}
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4" aria-label="Ingredients">
            {visible.map((item) => (
              <IngredientCard key={item.id} item={item} picked={picked.includes(item.name)} reason={reasonOf(item)}
                pantryG={pantryByName.get(item.name)} onAdd={() => add(item.name)} />
            ))}
          </ul>
          {visible.length === 0 && (
            <p className="mt-4 text-sm text-stone-500">{tab === PANTRY && !query ? <>Your pantry is empty. <Link to="/pantry" className="font-semibold text-rose-700 underline">Add ingredients</Link>.</> : 'No matching ingredients.'}</p>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit" aria-label="Kitchen counter panel">
          <section className="glass p-5" aria-label="Kitchen Counter">
            <h2 className="font-display text-xl font-extrabold">Kitchen Counter</h2>
            <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
              <span>{picked.length}/{MAX_PICKS} ingredients</span>
              <span>{Math.round(counterKcal)} kcal per 100 g each</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-stone-200/70" role="progressbar" aria-label="Counter progress"
              aria-valuemin={0} aria-valuemax={MAX_PICKS} aria-valuenow={picked.length}>
              <div className="h-2 rounded-full bg-gradient-to-r from-rose-600 to-orange-500 transition-all" style={{ width: `${(picked.length / MAX_PICKS) * 100}%` }} />
            </div>
            {picked.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">Your counter is empty. Tap an ingredient to start.</p>
            ) : (
              <ol className="mt-3 flex flex-wrap gap-2" aria-label="Counter ingredients">
                {picked.map((name, n) => (
                  <li key={name}>
                    <button type="button" onClick={() => remove(name)} aria-label={`Remove ${name}`}
                      className="chip-selected inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-sm font-semibold">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[11px]">{n + 1}</span>{name}<X size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="glass p-5" aria-label="Recommended for you">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold">Recommended for you</h2>
              {recState === 'loading' && <RefreshCw size={16} className="animate-spin text-stone-400" aria-label="Loading recommendations" />}
            </div>
            {picked.length === 0 && <p className="mt-2 text-sm text-stone-500">Add an ingredient to see what pairs well with it.</p>}
            {recState === 'error' && (
              <div role="alert" className="mt-2 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">
                {recError}
                <button type="button" className="ml-2 font-semibold underline" onClick={() => setRecNonce((n) => n + 1)}>Try again</button>
              </div>
            )}
            {recState === 'loading' && recs.length === 0 && <p className="mt-2 text-sm text-stone-500">Finding pairings…</p>}
            {recs.length > 0 && (
              <ul className={`mt-3 space-y-2 ${recState === 'loading' ? 'opacity-60' : ''}`}>
                {recs.map((r) => (
                  <li key={r.name}>
                    <button type="button" onClick={() => add(r.name)} aria-label={`Add ${r.name}, ${r.matchPercent}% match`}
                      disabled={picked.length >= MAX_PICKS}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white/70 px-3 py-2 text-left transition hover:bg-white">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{r.matchPercent}%</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.name}</span>
                        <span className="block truncate text-xs text-stone-500">pairs with {r.pairsWith}</span>
                      </span>
                      <Plus size={16} className="text-stone-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass p-5" aria-label="Calorie check">
            <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><Flame size={18} className="text-orange-500" />Calorie check</h2>
            {mealTarget ? (
              <>
                <p className="mt-1 text-sm text-stone-600">Meal target <strong>{mealTarget} kcal</strong> ({daily!.toLocaleString()} kcal/day ÷ 3).</p>
                <p className="mt-1 text-sm text-stone-600">
                  {picked.length === 0 ? 'Add ingredients to check.'
                    : `Your counter is ${Math.round(counterKcal)} kcal at 100 g each; portions are sized to land near ${mealTarget} kcal per serving.`}
                </p>
              </>
            ) : <p className="mt-1 text-sm text-stone-600">No calorie goal set. <Link to="/onboarding" className="font-semibold text-rose-700 underline">Add one</Link> to size portions.</p>}
          </section>

          <section className="glass space-y-3 p-5">
            <div className="flex items-center justify-between gap-2 rounded-full bg-white/70 p-1" role="group" aria-label="Servings">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="Fewer servings"
                disabled={servings <= 1} onClick={() => setServings((s) => s - 1)}><Minus size={16} /></button>
              <span className="text-sm font-semibold" aria-live="polite">{servings} serving{servings === 1 ? '' : 's'}</span>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="More servings"
                disabled={servings >= 8} onClick={() => setServings((s) => s + 1)}><Plus size={16} /></button>
            </div>
            <button type="button" className="btn-primary w-full" disabled={picked.length === 0 || busy || !prefs} onClick={cook}>
              <Sparkles size={18} />{busy ? 'Cooking…' : 'Generate My Dream Recipe'}
            </button>
            {error && <p role="alert" className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          </section>
        </aside>
      </div>

      {result && (
        <>
          <div className="flex flex-wrap gap-3" role="tablist" aria-label="Recipe options">
            {result.recipes.map((r, n) => (
              <button key={r.fingerprint} type="button" role="tab" aria-selected={n === active} onClick={() => setActive(n)}
                className={`glass px-4 py-3 text-left transition ${n === active ? 'ring-2 ring-rose-500' : 'opacity-80 hover:opacity-100'}`}>
                <span className="block font-display font-extrabold">{r.title}</span>
                <span className="text-xs text-stone-600">{r.nutrition.per_serving.kcal} kcal · {r.minutes} min{r.match && ` · ${r.match.percent}% match`}</span>
              </button>
            ))}
          </div>
          {recipe && <RecipeView recipe={recipe} prefs={prefs} pantryByName={pantryByName} actions={actions} />}
        </>
      )}
    </div>
  );
}
