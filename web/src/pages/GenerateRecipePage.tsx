import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookmarkCheck, Bookmark, Candy, Check, CheckCircle2, ChefHat, Citrus, Clock, Download, Droplet, Flame, Gauge, Heart, Leaf, Link2,
  RefreshCw, ShieldCheck, Sparkles, Users, Wheat, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ConflictAlert } from '../components/ConflictAlert';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { Card, Donut, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { ingredientConflicts, TASTE_LABEL, type Conflict } from '../lib/conflicts';
import { fetchCuratedRecommendations, SETTINGS_DIETS, type CuratedMatch, type Diet } from '../lib/curatedApi';
import { recipeImage } from '../lib/images';
import { formatGrams } from '../lib/pantryApi';
import { allergenLabel, effectiveAllergenTags, LEVELS, parseCustomAllergens, type Level, type Preferences, type TasteKey } from '../lib/preferences';
import { generateRecipes, macroShares, type Recipe } from '../lib/recipes';
import { useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';
import { useRecipeActions } from '../lib/useRecipeActions';

const TASTES: { key: TasteKey; icon: LucideIcon; tint: string }[] = [
  { key: 'sweet', icon: Candy, tint: 'bg-pink-500' }, { key: 'salty', icon: Droplet, tint: 'bg-sky-500' },
  { key: 'sour', icon: Citrus, tint: 'bg-green-500' }, { key: 'spicy', icon: Flame, tint: 'bg-orange-500' },
];
const TARGET: Record<Level, number> = { low: 2, medium: 5, high: 8 };

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

function TasteCard({ taste, level, onSet }: { taste: (typeof TASTES)[number]; level: Level | null; onSet: (l: Level | null) => void }) {
  const Icon = taste.icon;
  const on = level !== null;
  return (
    <li className={`rounded-2xl border p-3 shadow-sm transition ${on ? 'border-rose-300 bg-white' : 'border-white bg-white/70'}`}>
      <button type="button" className="flex w-full items-center gap-3 text-left" aria-pressed={on} onClick={() => onSet(on ? null : 'medium')}>
        <span className={`grid h-9 w-9 place-items-center rounded-full text-white ${taste.tint}`}><Icon size={19} aria-hidden="true" /></span>
        <span className="flex-1 text-[1.1rem] font-semibold">{TASTE_LABEL[taste.key]}</span>
        {on ? <Check size={20} className="text-green-600" aria-label="On" /> : <span className="text-[0.8rem] text-stone-500">Tap to set</span>}
      </button>
      {on && (
        <div role="radiogroup" aria-label={`${TASTE_LABEL[taste.key]} level`} className="mt-2.5 grid grid-cols-3 gap-1 rounded-full bg-stone-100 p-1">
          {LEVELS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => onSet(l)}
              className={`rounded-full py-1 text-[0.86rem] capitalize ${level === l ? 'bg-gradient-to-r from-crimson to-ember font-semibold text-white shadow' : 'text-stone-700'}`}>{l}</button>
          ))}
        </div>
      )}
    </li>
  );
}

export function GenerateRecipePage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const { catalog, prefs, addBought } = useKitchenData(userId);
  const { selection, setTaste, remove } = useSelection();
  const [diets, setDiets] = useState<Diet[]>([]);
  const [extraWords, setExtraWords] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [alert, setAlert] = useState<Conflict[]>([]);
  const [related, setRelated] = useState<CuratedMatch[]>([]);
  const [note, setNote] = useState('');
  const recipe = recipes[active] ?? null;
  const actions = useRecipeActions(userId, recipe, addBought);

  const chosen = selection.ingredients.slice(0, 12);
  const items = useMemo(() => chosen.map((n) => (catalog ?? []).find((i) => i.name === n)).filter((i): i is NonNullable<typeof i> => Boolean(i)), [catalog, chosen]);
  const conflicts = useMemo(() => items.flatMap((i) => ingredientConflicts(i, { tastes: selection.tastes, prefs, diets, maxKcal: selection.maxKcal ?? null })), [items, selection.tastes, prefs, diets, selection.maxKcal]);

  const run = async (force = false) => {
    if (!token || !prefs || !chosen.length) return;
    if (conflicts.length && !force) { setAlert(conflicts); return; }
    setAlert([]);
    setBusy(true); setError(''); setNote(''); setStep(3);
    const used: Preferences = { ...prefs, tastes: selection.tastes, customAllergens: parseCustomAllergens([...prefs.customAllergens, extraWords].join(',')) };
    try {
      const result = await generateRecipes(token, chosen, used, 4);
      setRecipes(result.recipes);
      setActive(0);
      if (!result.recipes.length) setError('No recipe could be made from these ingredients with your allergies. Try adding a main ingredient.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // Ready-made recipes that use the same ingredients.
  useEffect(() => {
    if (!token || !prefs || chosen.length < 2) { setRelated([]); return; }
    let live = true;
    fetchCuratedRecommendations(token, { ...selection, ingredients: chosen, diets: [] }, prefs, [])
      .then((r) => { if (live) setRelated(r.recipes.slice(0, 3)); }).catch(() => { if (live) setRelated([]); });
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
  const tasteTargets = TASTES.filter((t) => selection.tastes[t.key]);
  const allergyChips = prefs ? [...effectiveAllergenTags(prefs).map(allergenLabel), ...prefs.customAllergens] : [];
  const saved = actions.saveState === 'saved' || actions.saveState === 'exists';

  return (
    <div className="tight-page generate-page">
      <PageHeader title="Generate" accent="Recipe" icon={Sparkles} subtitle="Create a personalized, step-by-step recipe based on your taste, diet and available ingredients." />
      {alert.length > 0 && <ConflictAlert conflicts={alert} onChange={() => { setAlert([]); setStep(1); }} onProceed={() => run(true)} onClose={() => setAlert([])} />}

      <section className="card print-hide grid gap-4 p-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" aria-label="Recipe settings">
        <div className="min-w-0">
          <ol className="mb-3 flex flex-wrap gap-2" aria-label="Steps">
            {(['Taste Profile', 'Allergies & Diet', 'Generate'] as const).map((s, i) => (
              <li key={s}><button type="button" onClick={() => setStep((i + 1) as 1 | 2 | 3)} aria-current={step === i + 1 ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[0.95rem] font-medium shadow-sm ${step === i + 1 ? 'bg-gradient-to-r from-crimson to-ember text-white' : 'bg-white/80'}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[0.75rem] ${step === i + 1 ? 'bg-white/25' : 'bg-stone-100'}`}>{i + 1}</span>{s}</button></li>
            ))}
          </ol>
          <p className="flex items-center gap-2 font-display text-[1.2rem] font-bold"><Flame size={20} className="fill-crimson text-crimson" aria-hidden="true" />Taste Profile Matrix</p>
          <p className="text-[0.9rem]">Pick the flavors that define you. Tap a taste, then choose Low, Medium or High.</p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {TASTES.map((t) => <TasteCard key={t.key} taste={t} level={selection.tastes[t.key]} onSet={(l) => setTaste(t.key, l)} />)}
          </ul>
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <p className="flex items-center gap-2 font-display text-[1.2rem] font-bold"><ChefHat size={20} className="text-crimson" aria-hidden="true" />Your Ingredients <span className="font-sans text-[0.9rem] font-normal">({chosen.length})</span></p>
            {chosen.length === 0 ? (
              <p className="mt-1 text-[0.92rem]">No ingredients chosen yet. <Link to="/select" className="font-semibold text-crimson underline">Select ingredients</Link></p>
            ) : (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {chosen.map((n) => <li key={n} className="inline-flex items-center gap-1 rounded-full bg-rose-50 py-0.5 pl-1 pr-1.5 text-[0.88rem] shadow-sm"><IngredientBadge name={n} category="" size={22} />{n.replace(/\s*\(.*\)$/, '')}
                  <button type="button" className="text-crimson" aria-label={`Remove ${n}`} onClick={() => remove(n)}><X size={14} aria-hidden="true" /></button></li>)}
                <li><Link to="/select" className="inline-flex h-full items-center rounded-full px-2 text-[0.85rem] font-semibold text-crimson underline">Change</Link></li>
              </ul>
            )}
          </div>
          <div>
            <p className="flex items-center gap-2 font-display text-[1.2rem] font-bold"><Leaf size={20} className="fill-green-500 text-green-700" aria-hidden="true" />Diet & Allergies <span className="font-sans text-[0.9rem] font-normal">(Optional)</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <label className="diet-pill"><input type="checkbox" checked={diets.length === 0} onChange={() => setDiets([])} />None</label>
              {SETTINGS_DIETS.map((d) => <label key={d.key} className="diet-pill"><input type="checkbox" checked={diets.includes(d.key)} onChange={() => setDiets(diets.includes(d.key) ? diets.filter((x) => x !== d.key) : [...diets, d.key])} />{d.label}</label>)}
            </div>
            <p className="mt-2 text-[0.9rem] font-medium">Allergies (from your settings)</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {allergyChips.length ? allergyChips.map((a) => <span key={a} className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[0.86rem]">{a}</span>) : <span className="text-[0.86rem] text-stone-500">None</span>}
              <Link to="/settings?tab=diet" className="text-[0.85rem] font-semibold text-crimson underline">Edit</Link>
            </div>
            <input className="field mt-2 !py-1.5 text-[0.9rem]" aria-label="Also avoid for this recipe" placeholder="Also avoid for this recipe (comma separated)..." value={extraWords} onChange={(e) => setExtraWords(e.target.value)} />
          </div>
          <button type="button" className="btn-primary h-[3.2rem] w-full justify-center text-[1.05rem]" disabled={busy || !chosen.length || !prefs} onClick={() => run()}>
            <Sparkles size={18} aria-hidden="true" />{busy ? 'Generating…' : recipe ? 'Generate Again' : 'Generate Recipe'}</button>
          {conflicts.length > 0 && <p className="flex items-center gap-1.5 text-[0.85rem] text-crimson"><ShieldCheck size={15} aria-hidden="true" />{conflicts.length} preference conflict{conflicts.length === 1 ? '' : 's'}: you'll be asked before generating.</p>}
        </div>
      </section>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {busy && <div className="mt-4"><Spinner label="Generating your recipe" /></div>}

      {recipe && !busy && (
        <div className="print-area mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <section className="card p-4" aria-label="Recipe">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-rose-100 px-3 py-0.5 text-[0.78rem] font-bold uppercase tracking-wide text-crimson">Generated Recipe</span>
                <div className="print-hide flex flex-wrap items-center gap-1.5">
                  <button type="button" className="icon-btn" aria-label={saved ? 'Saved' : 'Save as favourite'} onClick={save} disabled={saved}><Heart size={18} className={saved ? 'fill-crimson text-crimson' : ''} /></button>
                  <button type="button" className="icon-btn" aria-label="Share" onClick={share}><Link2 size={18} /></button>
                  <button type="button" className="btn-sm btn-outline" onClick={() => window.print()}><Download size={14} aria-hidden="true" />PDF</button>
                  <button type="button" className="btn-sm btn-outline" onClick={save} disabled={saved}>{saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{saved ? 'Saved' : 'Save to My Recipes'}</button>
                </div>
              </div>
              <h2 className="mt-2 bg-gradient-to-r from-crimson via-orange-500 to-green-600 bg-clip-text font-display text-[2rem] font-extrabold leading-tight text-transparent">{recipe.title}</h2>
              <p className="mt-1 text-[0.98rem]">{describeRecipe(recipe)}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5 text-[0.85rem]">
                <li className="badge bg-white shadow-sm"><Clock size={14} aria-hidden="true" />{recipe.minutes} min</li>
                <li className="badge bg-white shadow-sm"><Users size={14} aria-hidden="true" />Servings: {recipe.servings}</li>
                <li className="badge badge-amber"><Flame size={14} aria-hidden="true" />≈ {Math.round(recipe.nutrition.per_serving.kcal)} kcal / serving</li>
                {recipe.nutrition.per_serving.protein >= 25 && <li className="badge badge-green">High Protein</li>}
                {recipe.match && <li className="badge badge-green">{recipe.match.percent}% match</li>}
              </ul>
              {note && <p role="status" className="print-hide mt-2 break-all text-[0.85rem] text-green-700">{note}</p>}
              {recipes.length > 1 && (
                <div className="print-hide mt-2 flex flex-wrap gap-1.5">
                  {recipes.map((r, i) => <button key={r.fingerprint} type="button" className="pill !px-3 !py-0.5 !text-[0.82rem]" aria-pressed={i === active} onClick={() => setActive(i)}>{r.title}</button>)}
                  <button type="button" className="pill !px-3 !py-0.5 !text-[0.82rem]" onClick={() => run(true)}><RefreshCw size={13} aria-hidden="true" />New ideas</button>
                </div>
              )}
            </section>

            <Card title="Ingredients List" icon={ChefHat} action={<span className="text-[0.88rem] font-semibold text-crimson">Total: {Math.round(recipe.nutrition.total.kcal).toLocaleString()} kcal ({recipe.servings} servings)</span>}>
              <table className="data-table">
                <thead><tr><th>Ingredient</th><th>Amount</th><th className="text-right">Calories</th></tr></thead>
                <tbody>
                  {recipe.ingredients.map((i) => (
                    <tr key={i.name}><td><span className="flex items-center gap-2"><IngredientBadge name={i.name} category={i.category} size={26} />{i.name}</span></td>
                      <td>{formatGrams(i.grams)}</td><td className="text-right">{i.kcal !== undefined ? `${Math.round(i.kcal)} kcal` : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title={<>Nutrition Summary <span className="font-sans text-base font-normal">(Per Serving)</span></>} icon={Gauge}>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {nutritionMatrix(recipe).map((n) => (
                  <li key={n.key} className="rounded-2xl bg-white/85 p-2.5 text-center shadow-sm">
                    {n.key === 'kcal' ? <Flame size={22} className="mx-auto text-crimson" aria-hidden="true" /> : n.key === 'protein' ? <ChefHat size={22} className="mx-auto text-orange-500" aria-hidden="true" /> : n.key === 'carbs' ? <Wheat size={22} className="mx-auto text-green-600" aria-hidden="true" /> : <Droplet size={22} className="mx-auto text-amber-500" aria-hidden="true" />}
                    <strong className="block text-[1.15rem]">{n.value} <span className="text-[0.8rem] font-normal">{n.unit}</span></strong>
                    <span className="text-[0.82rem]">{n.label}{n.share !== null && ` · ${n.share}%`}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-4">
                <Donut size={96} thickness={6} label="Energy from protein, carbs and fat" parts={nutritionMatrix(recipe).filter((n) => n.share !== null).map((n, i) => ({ value: n.share ?? 0, color: ['#f97316', '#16a34a', '#f59e0b'][i], label: n.label }))}
                  center={<span className="text-[0.72rem] leading-tight">Energy<br />split</span>} />
                <p className="text-[0.85rem]">Share of the dish's energy from each macro (protein and carbs 4 kcal/g, fat 9 kcal/g). Values come from catalog nutrition per 100 g.</p>
              </div>
            </Card>

            {recipe.taste && (
              <Card title="Taste Matrix" icon={Flame}>
                <ul className="space-y-2 text-[0.92rem]">
                  {TASTES.map((t) => {
                    const value = recipe.taste?.[t.key] ?? 0;
                    const target = selection.tastes[t.key];
                    return (
                      <li key={t.key} className="grid grid-cols-[4rem_1fr_5.5rem] items-center gap-2">
                        <span>{TASTE_LABEL[t.key]}</span>
                        <span className="relative h-3 rounded-full bg-stone-100">
                          <span className={`absolute inset-y-0 left-0 rounded-full ${t.tint}`} style={{ width: `${Math.min(100, value * 10)}%` }} />
                          {target && <span className="absolute -top-1 h-5 w-1 rounded bg-ink" style={{ left: `${TARGET[target] * 10}%` }} title={`Your ${target} target`} />}
                        </span>
                        <span className="text-right text-[0.82rem]">{value.toFixed(1)}/10{target && <span className="block text-stone-500">you: {target}</span>}</span>
                      </li>
                    );
                  })}
                </ul>
                {tasteTargets.length === 0 && <p className="mt-1 text-[0.8rem] text-stone-500">Set a taste above to see your target on each bar.</p>}
              </Card>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <Card title="Cooking Steps" icon={ChefHat}>
              <ol className="space-y-2.5">
                {recipe.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-2xl bg-white/80 p-3 shadow-sm">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crimson font-bold text-white">{i + 1}</span>
                    <p className="text-[0.92rem] leading-snug">{s}</p>
                  </li>
                ))}
              </ol>
            </Card>
            <section className="card flex items-center gap-3 !bg-green-50/90 p-4" aria-label="Recipe ready">
              <CheckCircle2 size={40} className="shrink-0 fill-green-600 text-white" aria-hidden="true" />
              <div><p className="font-display text-[1.25rem] font-bold">Your Recipe is Ready!</p><p className="text-[0.9rem] text-green-800">Serve hot and enjoy. Saved recipes keep their nutrition and steps.</p></div>
            </section>
            <Card title="Related Recipes" icon={Sparkles} action={<Link to="/recommendations" className="print-hide flex items-center gap-1 text-sm font-semibold text-crimson">View All<ArrowRight size={15} aria-hidden="true" /></Link>}>
              {related.length === 0 ? <p className="text-[0.9rem] text-stone-500">Choose at least 2 ingredients to see ready-made recipes that use them.</p> : (
                <ul className="grid gap-3 sm:grid-cols-3">
                  {related.map((r) => (
                    <li key={r.slug} className="overflow-hidden rounded-2xl bg-white/85 shadow-sm"><Link to={`/recipe/${r.slug}`} state={{ match: r }} className="block">
                      <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} />
                      <span className="block px-2.5 pt-1.5 text-[0.92rem] font-semibold leading-tight">{r.name}</span>
                      <span className="block px-2.5 pb-2 text-[0.8rem] text-green-700">{r.match_percent}% match · {r.minutes} min</span></Link></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
      {!recipe && !busy && !error && (
        <p className="mt-6 text-center text-[0.95rem] text-stone-600">Set your tastes and press <strong>Generate Recipe</strong>. {catalog === null && 'Loading ingredients…'}</p>
      )}
    </div>
  );
}
