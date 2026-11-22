import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookmarkCheck, Bookmark, Candy, ChefHat, Citrus, Clock, Download, Droplet, Flame, Gauge, Heart, Leaf, Link2,
  RefreshCw, ShieldCheck, Sparkles, Timer, Users, Wheat, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ConflictAlert } from '../components/ConflictAlert';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { LEVEL_LABEL } from '../components/QuickPreferences';
import { Card, Donut, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { ingredientConflicts, TASTE_LABEL, type Conflict } from '../lib/conflicts';
import { fetchCuratedRecommendations, listCuratedRecipes, SETTINGS_DIETS, type CuratedMatch, type CuratedSummary } from '../lib/curatedApi';
import { recipeImage } from '../lib/images';
import { formatGrams } from '../lib/pantryApi';
import { allergenLabel, CALORIE_TIERS, effectiveAllergenTags, type Level, type TasteKey } from '../lib/preferences';
import { generateRecipes, macroShares, type Recipe } from '../lib/recipes';
import { useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';
import { useRecipeActions } from '../lib/useRecipeActions';

const TASTES: { key: TasteKey; icon: LucideIcon; tint: string }[] = [
  { key: 'sweet', icon: Candy, tint: 'bg-pink-500' }, { key: 'salty', icon: Droplet, tint: 'bg-sky-500' },
  { key: 'sour', icon: Citrus, tint: 'bg-green-500' }, { key: 'spicy', icon: Flame, tint: 'bg-orange-500' },
];
const TARGET: Record<Level, number> = { low: 2, medium: 5, high: 8 };
const PREP_WORDS = /\b(soak|marinate|wash|rinse|knead|rest)\b/i;

// A one-line description from what the recipe really contains, in place of invented copy.
export function describeRecipe(recipe: Pick<Recipe, 'style' | 'ingredients' | 'nutrition' | 'servings'>) {
  const mains = recipe.ingredients.filter((i) => i.role === 'main' || i.role === 'yours').map((i) => i.name.replace(/\s*\(.*\)$/, ''));
  const style = recipe.style.replace(/_/g, ' ');
  const protein = recipe.nutrition.per_serving.protein;
  return `A home-style ${style} with ${mains.slice(0, 4).join(', ') || 'your ingredients'}${protein >= 25 ? ', high in protein' : ''}, for ${recipe.servings} servings.`;
}

// Per-serving calories and macros, and how the energy splits between them.
export function nutritionMatrix(recipe: Pick<Recipe, 'nutrition'>) {
  const m = recipe.nutrition.per_serving;
  const shares = macroShares(m);
  return [
    { key: 'kcal', label: 'Calories', value: Math.round(m.kcal), unit: 'kcal', share: null },
    { key: 'protein', label: 'Protein', value: Math.round(m.protein), unit: 'g', share: shares.protein },
    { key: 'carbs', label: 'Carbs', value: Math.round(m.carbs), unit: 'g', share: shares.carbs },
    { key: 'fat', label: 'Fats', value: Math.round(m.fat), unit: 'g', share: shares.fat },
  ];
}

// The time a step states in its own text ("8–10 minutes", "1 hour"), or null when it gives none. Nothing is guessed.
export function stepDuration(step: string): { min: number; max: number } | null {
  const m = step.match(/(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?))?\s*(?:more\s+)?(minutes?|mins?|hours?|hrs?)\b/i);
  if (!m) return null;
  const scale = /^h/i.test(m[3]) ? 60 : 1;
  const min = Number(m[1]) * scale;
  return { min, max: (m[2] ? Number(m[2]) : Number(m[1])) * scale };
}

const fmtRange = (d: { min: number; max: number }) => (d.min === d.max ? `${d.min} min` : `${d.min}–${d.max} min`);

// Prep = the soaking/marinating/washing steps' stated times; cook = the rest of the engine's total time.
export function timeSplit(recipe: Pick<Recipe, 'steps' | 'minutes'>) {
  const prep = recipe.steps.filter((s) => PREP_WORDS.test(s)).reduce((sum, s) => sum + (stepDuration(s)?.max ?? 0), 0);
  return { prep, cook: Math.max(0, recipe.minutes - prep), total: recipe.minutes };
}

// Overall taste as percentages of the 0–10 scale for each flavour.
export function tastePercentages(taste: Recipe['taste']) {
  return TASTES.map((t) => ({ key: t.key, label: TASTE_LABEL[t.key], percent: Math.round(Math.min(10, Math.max(0, taste?.[t.key] ?? 0)) * 10) }));
}

// A related dish whose photo may stand in for the generated one: it must have a photo and share a real word with the
// generated title, including its dish type (e.g. "Chicken Breast Karahi" -> "Chicken Karahi", never "Chicken Kofta Curry").
// More shared words win. Otherwise none.
const GENERIC = new Set(['breast', 'leg', 'piece', 'boneless', 'with', 'and', 'the', 'masala', 'style']);
export function similarPhoto<T extends { name: string; slug: string; image_url?: string | null }>(title: string, related: T[]): T | undefined {
  const words = (t: string) => new Set(t.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter((w) => w.length > 2 && !GENERIC.has(w)));
  const mine = words(title);
  // The dish type is the last word of a generated title (Karahi, Salan, Pulao, Tadka...): it must match too.
  const kind = [...mine].pop();
  const scored = related.filter((r) => recipeImage(r.slug, r.image_url))
    .map((r) => { const theirs = words(r.name); return { r, n: [...theirs].filter((w) => mine.has(w)).length, kind: kind !== undefined && theirs.has(kind) }; })
    .filter((x) => x.kind);
  scored.sort((a, b) => b.n - a.n);
  return scored[0]?.r;
}

export function GenerateRecipePage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const { catalog, prefs, addBought } = useKitchenData(userId);
  const { selection, remove } = useSelection();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [alert, setAlert] = useState<Conflict[]>([]);
  const [related, setRelated] = useState<CuratedMatch[]>([]);
  const [note, setNote] = useState('');
  const [catalogRecipes, setCatalogRecipes] = useState<CuratedSummary[]>([]);
  const recipe = recipes[active] ?? null;
  // All published recipes, only to find a photo of the same kind of dish (filters don't apply to a picture).
  useEffect(() => { listCuratedRecipes().then(setCatalogRecipes).catch(() => setCatalogRecipes([])); }, []);
  const actions = useRecipeActions(userId, recipe, addBought);

  const chosen = selection.ingredients.slice(0, 12);
  const diets = selection.diets;
  const items = useMemo(() => chosen.map((n) => (catalog ?? []).find((i) => i.name === n)).filter((i): i is NonNullable<typeof i> => Boolean(i)), [catalog, chosen]);
  const conflicts = useMemo(() => items.flatMap((i) => ingredientConflicts(i, { tastes: selection.tastes, prefs, diets, maxKcal: selection.maxKcal ?? null })), [items, selection.tastes, prefs, diets, selection.maxKcal]);

  // The generator gets exactly the preferences the Kitchen saved: tastes (this session's, seeded from the profile),
  // allergens and calorie goal from the profile.
  const run = async (force = false) => {
    if (!token || !prefs || !chosen.length) return;
    if (conflicts.length && !force) { setAlert(conflicts); return; }
    setAlert([]);
    setBusy(true); setError(''); setNote('');
    try {
      const result = await generateRecipes(token, chosen, { ...prefs, tastes: selection.tastes }, 4);
      setRecipes(result.recipes);
      setActive(0);
      if (!result.recipes.length) setError('No recipe could be made from these ingredients with your allergies. Try adding a main ingredient.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // Ready-made recipes that use the same ingredients (ranked by the same compatibility engine).
  useEffect(() => {
    if (!token || !prefs || chosen.length < 2) { setRelated([]); return; }
    let live = true;
    fetchCuratedRecommendations(token, { ...selection, ingredients: chosen, diets: [] }, prefs, [])
      .then((r) => { if (live) setRelated(r.recipes.slice(0, 4)); }).catch(() => { if (live) setRelated([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, prefs, chosen.join('|')]);

  const share = async () => {
    try {
      const link = await actions.onShare?.();
      if (link) { await navigator.clipboard.writeText(link).catch(() => {}); setNote(`Share link copied: ${link}`); }
    } catch (e) { setNote((e as Error).message); }
  };
  const save = async () => { try { await actions.onSave?.(); } catch (e) { setNote((e as Error).message); } };
  const allergyChips = prefs ? [...effectiveAllergenTags(prefs).map(allergenLabel), ...prefs.customAllergens] : [];
  const saved = actions.saveState === 'saved' || actions.saveState === 'exists';
  const setTastes = TASTES.filter((t) => selection.tastes[t.key]);
  const goal = CALORIE_TIERS.find((t) => t.tier === prefs?.calorieTier);
  // A generated dish has no photo of its own. Show the closest ready-made dish's photo only when it has one, and say so.
  const photoOf = recipe ? similarPhoto(recipe.title, [...related, ...catalogRecipes]) : undefined;
  const time = recipe ? timeSplit(recipe) : null;

  return (
    <div className="tight-page generate-page">
      <PageHeader title="Generate" accent="Recipe" icon={Sparkles} subtitle="A step-by-step recipe built from your ingredients and saved preferences." />
      {alert.length > 0 && <ConflictAlert conflicts={alert} onChange={() => setAlert([])} onProceed={() => run(true)} onClose={() => setAlert([])} />}

      {/* Compact summary: what goes in, and the button. Preferences are edited on the Kitchen dashboard. */}
      <section className="card print-hide grid gap-3 p-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] lg:items-center" aria-label="What the recipe uses">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.85rem] font-semibold uppercase tracking-wide text-stone-600"><ChefHat size={15} aria-hidden="true" />Ingredients ({chosen.length})</p>
          {chosen.length === 0 ? (
            <p className="mt-1 text-[0.92rem]">No ingredients chosen yet. <Link to="/select" className="font-semibold text-crimson underline">Select ingredients</Link></p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1">
              {chosen.map((n) => <li key={n} className="inline-flex items-center gap-1 rounded-full bg-rose-50 py-0.5 pl-1 pr-2 text-[0.82rem]"><IngredientBadge name={n} category="" size={18} />{n.replace(/\s*\(.*\)$/, '')}
                <button type="button" className="ml-0.5 text-crimson" aria-label={`Remove ${n}`} onClick={() => remove(n)}>×</button></li>)}
              <li><Link to="/select" className="inline-flex items-center rounded-full px-1.5 text-[0.8rem] font-semibold text-crimson underline">Change</Link></li>
            </ul>
          )}
        </div>
        <div className="min-w-0 border-rose-100 lg:border-l lg:pl-3">
          <p className="flex items-center justify-between text-[0.85rem] font-semibold uppercase tracking-wide text-stone-600">Your preferences
            <Link to="/kitchen" className="normal-case tracking-normal text-crimson underline">Edit</Link></p>
          <p className="mt-1 flex flex-wrap gap-1 text-[0.8rem]">
            {setTastes.length ? setTastes.map((t) => <span key={t.key} className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-800">{TASTE_LABEL[t.key]}: {LEVEL_LABEL[selection.tastes[t.key] as Level]}</span>)
              : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">Any taste</span>}
            {diets.map((d) => <span key={d} className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-800">{SETTINGS_DIETS.find((x) => x.key === d)?.label ?? d}</span>)}
            {allergyChips.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800">Avoid: {allergyChips.slice(0, 3).join(', ')}{allergyChips.length > 3 ? ` +${allergyChips.length - 3}` : ''}</span>}
            {goal && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Daily goal: {goal.kcal} kcal</span>}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1">
          <button type="button" className="btn-primary h-[3rem] justify-center whitespace-nowrap px-6 text-[1rem]" disabled={busy || !chosen.length || !prefs} onClick={() => run()}>
            {recipe ? <RefreshCw size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}{busy ? 'Generating…' : recipe ? 'Regenerate' : 'Generate Recipe'}</button>
          {conflicts.length > 0 && <p className="flex items-center gap-1 text-[0.75rem] text-crimson"><ShieldCheck size={13} aria-hidden="true" />{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} — you'll be asked first</p>}
        </div>
      </section>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {busy && <div className="mt-4"><Spinner label="Generating your recipe" /></div>}

      {!recipe && !busy && !error && (
        <section className="card mt-3 grid items-center gap-5 p-5 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]" aria-label="How it works">
          <div className="grid aspect-[16/9] place-items-center rounded-2xl bg-gradient-to-br from-[#fde3d8] via-[#fbd0c0] to-[#f7b9a3] text-[#b4231b]">
            <span className="flex flex-col items-center gap-2 text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-white/80 shadow"><Sparkles size={32} aria-hidden="true" /></span>
              <span className="font-display text-xl font-bold">Your recipe appears here</span></span>
          </div>
          <div>
            <h2 className="font-display text-[1.6rem] font-bold leading-tight">{chosen.length ? <>Ready to cook with {chosen.length} ingredient{chosen.length === 1 ? '' : 's'}</> : 'Pick your ingredients first'}</h2>
            <ol className="mt-3 space-y-2 text-[0.95rem]">
              {['Your ingredients are paired using the weighted ingredient graph.', 'A Pakistani cooking style is chosen and quantities are scaled to realistic grams.', 'You get a dish name, numbered steps with times, nutrition and an overall taste breakdown.'].map((t, i) => (
                <li key={t} className="flex gap-2.5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-crimson text-[0.8rem] font-bold text-white">{i + 1}</span>{t}</li>
              ))}
            </ol>
            {chosen.length ? <button type="button" className="btn-primary mt-4 h-[2.9rem] px-6" disabled={!prefs} onClick={() => run()}><Sparkles size={17} aria-hidden="true" />Generate Recipe</button>
              : <Link to="/select" className="btn-primary mt-4 inline-flex h-[2.9rem] items-center px-6">Select ingredients<ArrowRight size={17} aria-hidden="true" /></Link>}
            {catalog === null && <p className="mt-2 text-[0.85rem] text-stone-600">Loading ingredients…</p>}
          </div>
        </section>
      )}

      {recipe && !busy && time && (
        <div className="print-area mt-3 space-y-4">
          {/* The recipe itself, near the top. */}
          <section className="card grid items-center gap-5 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-label="Generated recipe">
            <figure className="min-w-0">
              <RecipeCardImage category="Main Course" imageUrl={photoOf ? recipeImage(photoOf.slug, photoOf.image_url) : null} name={recipe.title} rounded="rounded-2xl" frame="aspect-[4/3] max-h-[19rem]" />
              <figcaption className="mt-1.5 text-[0.85rem] text-stone-600">{photoOf ? <>Photo: a similar ready-made dish, <Link to={`/recipe/${photoOf.slug}`} className="underline">{photoOf.name}</Link>. Your dish is generated, so it has no photo of its own.</> : 'Generated dish: no photo of its own yet.'}</figcaption>
            </figure>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-rose-100 px-3 py-0.5 text-[0.75rem] font-bold uppercase tracking-wide text-crimson">Generated Recipe</span>
                <div className="print-hide flex flex-wrap items-center gap-1.5">
                  <button type="button" className="icon-btn" aria-label={saved ? 'Saved' : 'Save as favourite'} onClick={save} disabled={saved}><Heart size={18} className={saved ? 'fill-crimson text-crimson' : ''} /></button>
                  <button type="button" className="icon-btn" aria-label="Share" onClick={share}><Link2 size={18} /></button>
                  <button type="button" className="btn-sm btn-outline" onClick={() => window.print()}><Download size={14} aria-hidden="true" />PDF</button>
                </div>
              </div>
              <h2 className="mt-2 font-display text-[2.1rem] font-extrabold leading-tight text-ink">{recipe.title}</h2>
              <p className="mt-1.5 text-[1rem] text-stone-700">{describeRecipe(recipe)}</p>
              <ul className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[{ icon: Timer, label: 'Prep', value: time.prep ? `${time.prep} min` : 'Not estimated' }, { icon: Flame, label: 'Cook', value: `${time.cook} min` }, { icon: Users, label: 'Servings', value: String(recipe.servings) }].map((s) => (
                  <li key={s.label} className="rounded-2xl bg-white/90 px-2 py-2 shadow-sm"><s.icon size={18} className="mx-auto text-crimson" aria-hidden="true" />
                    <strong className="mt-0.5 block text-[1.05rem]">{s.value}</strong><span className="text-[0.75rem] text-stone-600">{s.label}</span></li>
                ))}
              </ul>
              <ul className="mt-3 flex flex-wrap gap-1.5 text-[0.9rem]">
                <li className="badge bg-white shadow-sm"><Clock size={14} aria-hidden="true" />{time.total} min total</li>
                <li className="badge badge-amber"><Flame size={14} aria-hidden="true" />≈ {Math.round(recipe.nutrition.per_serving.kcal)} kcal per serving{goal ? ` · ${Math.round((recipe.nutrition.per_serving.kcal / goal.kcal) * 100)}% of your ${goal.kcal} kcal day` : ''}</li>
                {recipe.nutrition.per_serving.protein >= 25 && <li className="badge badge-green">High Protein</li>}
                {recipe.match && <li className="badge badge-green">≈{recipe.match.percent}% estimated taste match</li>}
              </ul>
              <button type="button" className="btn-primary print-hide mt-4 h-[2.8rem] w-full justify-center" onClick={save} disabled={saved}>
                {saved ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}{saved ? 'Saved to My Recipes' : 'Save to My Recipes'}</button>
              {note && <p role="status" className="print-hide mt-2 break-all text-[0.82rem] text-green-700">{note}</p>}
              {recipes.length > 1 && (
                <div className="print-hide mt-3">
                  <p className="text-[0.78rem] font-semibold text-stone-600">Other versions from the same ingredients</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {recipes.map((r, i) => <button key={r.fingerprint} type="button" className="pill !px-3 !py-0.5 !text-[0.8rem]" aria-pressed={i === active} onClick={() => setActive(i)}>{r.title}</button>)}
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card title="Ingredients" icon={ChefHat} action={<span className="text-right text-[0.85rem] font-semibold text-crimson">{Math.round(recipe.nutrition.total.kcal).toLocaleString()} kcal whole dish<span className="block text-[0.75rem] font-normal text-stone-600">{recipe.servings} servings × {Math.round(recipe.nutrition.per_serving.kcal)} kcal</span></span>}>
              <table className="data-table text-[0.98rem]">
                <thead><tr><th>Ingredient</th><th className="text-right">Quantity</th><th className="text-right">Calories</th></tr></thead>
                <tbody>
                  {recipe.ingredients.map((i) => (
                    <tr key={i.name}><td><span className="flex items-center gap-2 font-medium"><IngredientBadge name={i.name} category={i.category} size={28} />{i.name}
                      <span className={`rounded-full px-1.5 py-0.5 text-[0.68rem] font-semibold ${i.role === 'main' || i.role === 'yours' ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-700'}`}>{i.role === 'main' || i.role === 'yours' ? 'Your pick' : 'Added staple'}</span></span></td>
                      <td className="text-right tabular-nums">{formatGrams(i.grams)}</td><td className="text-right tabular-nums">{i.kcal !== undefined ? `${Math.round(i.kcal)} kcal` : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[0.78rem] text-stone-600"><strong>Your pick</strong> = ingredients you chose; <strong>Added staple</strong> = oil, salt, spices or herbs most kitchens have, added so the dish works. Calories = grams × the catalog's kcal per 100 g: approximate estimates, not medical advice.</p>
            </Card>
            <Card title="Cooking Steps" icon={Flame}>
              <ol className="space-y-3">
                {recipe.steps.map((s, i) => {
                  const d = stepDuration(s);
                  return (
                    <li key={i} className="flex gap-3 rounded-2xl bg-white/85 p-3 shadow-sm">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crimson text-[0.95rem] font-bold text-white">{i + 1}</span>
                      <p className="flex-1 text-[1.02rem] leading-relaxed">{s}</p>
                      {d && <span className="h-fit shrink-0 whitespace-nowrap rounded-full bg-orange-50 px-2.5 py-1 text-[0.9rem] font-semibold text-orange-800"><Clock size={13} className="mr-0.5 inline" aria-hidden="true" />{fmtRange(d)}</span>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={<>Nutrition <span className="font-sans text-base font-normal">(per serving)</span></>} icon={Gauge}>
              <ul className="grid grid-cols-4 gap-2">
                {nutritionMatrix(recipe).map((n) => (
                  <li key={n.key} className="rounded-2xl bg-white/85 p-2 text-center shadow-sm">
                    {n.key === 'kcal' ? <Flame size={20} className="mx-auto text-crimson" aria-hidden="true" /> : n.key === 'protein' ? <ChefHat size={20} className="mx-auto text-orange-500" aria-hidden="true" /> : n.key === 'carbs' ? <Wheat size={20} className="mx-auto text-green-600" aria-hidden="true" /> : <Droplet size={20} className="mx-auto text-amber-500" aria-hidden="true" />}
                    <strong className="block text-[1.05rem]">{n.value} <span className="text-[0.75rem] font-normal">{n.unit}</span></strong>
                    <span className="text-[0.78rem]">{n.label}{n.share !== null && ` · ${n.share}%`}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-4">
                <Donut size={88} thickness={6} label="Energy from protein, carbs and fat" parts={nutritionMatrix(recipe).filter((n) => n.share !== null).map((n, i) => ({ value: n.share ?? 0, color: ['#f97316', '#16a34a', '#f59e0b'][i], label: n.label }))}
                  center={<span className="text-[0.7rem] leading-tight">Energy<br />split</span>} />
                <p className="text-[0.82rem]">Share of the dish's energy from each macro (protein and carbs 4 kcal/g, fat 9 kcal/g), from the catalog's nutrition per 100 g.</p>
              </div>
            </Card>
            <Card title={<>Overall Taste <span className="font-sans text-base font-normal">(estimated intensity)</span></>} icon={Leaf}>
              <ul className="space-y-2.5 text-[0.92rem]">
                {tastePercentages(recipe.taste).map((t) => {
                  const meta = TASTES.find((x) => x.key === t.key)!;
                  const target = selection.tastes[t.key];
                  return (
                    <li key={t.key} className="grid grid-cols-[4rem_1fr_6rem] items-center gap-2">
                      <span className="font-medium">{t.label}</span>
                      <span className="relative h-3 rounded-full bg-stone-100">
                        <span className={`absolute inset-y-0 left-0 rounded-full ${meta.tint}`} style={{ width: `${t.percent}%` }} />
                        {target && <span className="absolute -top-1 h-5 w-1 rounded bg-ink" style={{ left: `${TARGET[target] * 10}%` }} title={`Your ${LEVEL_LABEL[target]} target`} />}
                      </span>
                      <span className="text-right"><strong>{t.percent}%</strong>{target && <span className="block text-[0.72rem] text-stone-600">you: {LEVEL_LABEL[target]}</span>}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[0.75rem] text-stone-600">Estimated, not measured: each bar is the dish's taste intensity (0–10 shown as %), where every ingredient adds its catalog taste score in proportion to how much of it is in one serving. The dark mark is your saved preference.</p>
            </Card>
          </div>

          <Card title="Related Recipes" icon={Sparkles} action={<Link to="/recommendations" className="print-hide flex items-center gap-1 text-sm font-semibold text-crimson">View All<ArrowRight size={15} aria-hidden="true" /></Link>}>
            {related.length === 0 ? <p className="text-[0.9rem] text-stone-600">Choose at least 2 ingredients to see ready-made recipes that use them.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((r) => (
                  <li key={r.slug} className="overflow-hidden rounded-2xl bg-white/85 shadow-sm"><Link to={`/recipe/${r.slug}`} state={{ match: r }} className="block">
                    <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} frame="aspect-[16/9]" />
                    <span className="block px-2.5 pt-1.5 text-[0.92rem] font-semibold leading-tight">{r.name}</span>
                    <span className="block px-2.5 pb-2 text-[0.8rem] text-green-700">{r.match_percent}% match · {r.minutes} min</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
