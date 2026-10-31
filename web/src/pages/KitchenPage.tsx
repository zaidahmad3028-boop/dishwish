import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, Minus, Plus, Search, Sparkles, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { displayName } from '../components/AppShell';
import { RecipeView } from '../components/RecipeView';
import { isIngredientBlocked } from '../lib/preferences';
import { generateRecipes, type Recipe, type RecipeResult } from '../lib/recipes';
import { saveRecipe, shareRecipe, shareUrl } from '../lib/recipesApi';
import { useKitchenData } from '../lib/useKitchenData';

const MAX_PICKS = 12;

export function KitchenPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { catalog, prefs, error: loadError, byName, pantryByName, addBought } = useKitchenData(userId);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [servings, setServings] = useState(2);
  const [result, setResult] = useState<RecipeResult | null>(null);
  const [active, setActive] = useState(0);
  const [savedPrints, setSavedPrints] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const blocked = (name: string) => {
    const item = byName.get(name);
    return Boolean(item && prefs && isIngredientBlocked(item.name, item.allergens, prefs));
  };
  const pantryNames = useMemo(() => [...pantryByName.keys()].sort(), [pantryByName]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (catalog ?? []).filter((i) => i.name.toLowerCase().includes(q) && !picked.includes(i.name)).slice(0, 8);
  }, [catalog, query, picked]);

  if (!userId || catalog === null) return <FullPageSpinner />;

  const toggle = (name: string) => {
    setError('');
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : p.length >= MAX_PICKS ? p : [...p, name]));
  };
  const cook = async () => {
    if (!session || !prefs) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const out = await generateRecipes(session.access_token, picked, prefs, servings);
      setResult(out); setActive(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const recipe: Recipe | undefined = result?.recipes[active];

  return (
    <div className="space-y-6">
      <section className="glass p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 text-rose-700 shadow-sm"><ChefHat size={24} /></span>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">Salaam, {displayName(session?.user)}!</h1>
        <p className="mt-1 text-stone-600">Pick what’s on your counter and we’ll cook up recipes that fit your taste, allergen shield and calorie target.</p>

        {prefs && !prefs.onboarded && (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-[24px] border border-rose-200 bg-rose-50/80 p-5">
            <p className="flex-1 text-stone-700">Finish setting up your taste profile, allergen shield and calorie target so every recipe fits you.</p>
            <Link to="/onboarding" className="btn-primary">Finish setting up</Link>
          </div>
        )}
        {(loadError || error) && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError || error}</p>}

        <h2 className="mt-6 text-xs font-bold uppercase tracking-wider text-stone-500">From your pantry</h2>
        {pantryNames.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Your pantry is empty. <Link to="/pantry" className="font-semibold text-rose-700 underline">Add ingredients</Link> or search below.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Pantry ingredients">
            {pantryNames.map((name) => {
              const isBlocked = blocked(name);
              const on = picked.includes(name);
              return (
                <button key={name} type="button" disabled={isBlocked} aria-pressed={on} onClick={() => toggle(name)}
                  title={isBlocked ? 'Blocked by your allergen shield' : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? 'chip-selected' : 'border-stone-200 bg-white/70 hover:bg-white'} ${isBlocked ? 'cursor-not-allowed line-through opacity-50' : ''}`}>
                  {name}
                </button>
              );
            })}
          </div>
        )}

        <label className="relative mt-5 block">
          <span className="sr-only">Search any ingredient</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="field pl-10" placeholder="Add any ingredient e.g. aloo, palak, chicken" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {results.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Ingredient search results">
            {results.map((i) => {
              const isBlocked = blocked(i.name);
              return (
                <li key={i.id}>
                  <button type="button" disabled={isBlocked} onClick={() => { toggle(i.name); setQuery(''); }}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-stone-300 bg-white/70 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                    <Plus size={14} />{i.name}{isBlocked && ' (blocked)'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {picked.length > 0 && (
          <div className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">Cooking with ({picked.length}/{MAX_PICKS})</h2>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Chosen ingredients">
              {picked.map((name) => (
                <li key={name}>
                  <button type="button" onClick={() => toggle(name)} aria-label={`Remove ${name}`}
                    className="chip-selected inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold">
                    {name}<X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-full bg-white/70 p-1" role="group" aria-label="Servings">
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="Fewer servings"
              disabled={servings <= 1} onClick={() => setServings((s) => s - 1)}><Minus size={16} /></button>
            <span className="min-w-[5.5rem] text-center text-sm font-semibold" aria-live="polite">{servings} serving{servings === 1 ? '' : 's'}</span>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="More servings"
              disabled={servings >= 8} onClick={() => setServings((s) => s + 1)}><Plus size={16} /></button>
          </div>
          <button type="button" className="btn-primary" disabled={picked.length === 0 || busy || !prefs} onClick={cook}>
            <Sparkles size={18} />{busy ? 'Cooking…' : 'Cook my recipes'}
          </button>
        </div>
      </section>

      {result && (
        <>
          <div className="flex flex-wrap gap-3" role="tablist" aria-label="Recipe options">
            {result.recipes.map((r, n) => (
              <button key={r.fingerprint} type="button" role="tab" aria-selected={n === active} onClick={() => setActive(n)}
                className={`glass px-4 py-3 text-left transition ${n === active ? 'ring-2 ring-rose-500' : 'opacity-80 hover:opacity-100'}`}>
                <span className="block font-display font-extrabold">{r.title}</span>
                <span className="text-xs text-stone-600">{r.nutrition.per_serving.kcal} kcal · {r.minutes} min</span>
              </button>
            ))}
          </div>
          {result.suggestions.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              Goes well with:
              {result.suggestions.map((s) => (
                <button key={s} type="button" className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800 hover:bg-emerald-200"
                  onClick={() => toggle(s)} aria-label={`Add ${s}`}>+ {s}</button>
              ))}
            </p>
          )}
          {recipe && (
            <RecipeView recipe={recipe} prefs={prefs} pantryByName={pantryByName} actions={{
              saved: savedPrints.has(recipe.fingerprint),
              onSave: async () => { await saveRecipe(userId, recipe); setSavedPrints((s) => new Set(s).add(recipe.fingerprint)); },
              onShare: async () => shareUrl(await shareRecipe(userId, recipe)),
              onAddToPantry: addBought,
            }} />
          )}
        </>
      )}
    </div>
  );
}
