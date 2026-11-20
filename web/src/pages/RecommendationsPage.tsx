import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, ArrowRight, BarChart3, Beef, Bookmark, BookmarkCheck, Check, ChefHat, ChevronRight, Clock, Flame, Heart, Leaf, Network, Pencil, ShieldCheck,
  ShoppingBasket, SlidersHorizontal, Sparkles, Users, Wand2, Wheat, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { CompatibilityGraph } from '../components/CompatibilityGraph';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { recipeImage } from '../lib/images';
import { Bar, Card, Donut, EmptyState, ErrorNote, Modal, PageHeader, Spinner } from '../components/ui';
import { checkCompatibility, DIETS, fetchEvaluationSummary, personalHistory, type HistoryEvent, type EvaluationSummary, fetchCompatibility, fetchCuratedRecommendations, isCuratedSnapshot, recordEvent, saveCurated, setFavorite, type CuratedMatch, type Macros, type RecommendationResult } from '../lib/curatedApi';
import { allergenLabel, effectiveAllergenTags, type Level, type TasteKey } from '../lib/preferences';
import { listSavedRecipes } from '../lib/recipesApi';
import { useSelection } from '../lib/selection';
import { LEVEL_LABEL } from '../components/QuickPreferences';
import { TASTE_LABEL } from '../lib/conflicts';
import { isIngredientBlocked, type Preferences } from '../lib/preferences';
import { savoryFromUser } from '../lib/accountApi';
import { useKitchenData } from '../lib/useKitchenData';
import { useLiveTick } from '../lib/useLiveTick';

import { StepBar } from './IngredientSelectionPage';
import { PersonalWeights } from '../components/PersonalWeights';

const COMPONENT_LABEL: Record<string, string> = { coverage: 'Ingredient coverage', similarity: 'TF-IDF similarity', compatibility: 'Graph compatibility', taste: 'Taste match', cooking: 'Cooking time' };
const short = (name: string) => name.replace(/\s*\(.*\)$/, '').replace(/^Chicken Breast$/, 'Chicken');
const PAGE_SIZE = 6;
const SELECT = 'select h-10 min-w-[8.5rem] flex-1 !border-rose-200 !bg-[#fffaf7] !pl-3 !pr-1 !text-[0.95rem] tracking-tight xl:min-w-0';

export function tasteWord(taste: Record<TasteKey, number>): string {
  if (taste.sweet >= 7) return 'Sweet';
  if (taste.spicy >= 7) return 'Spicy';
  if (taste.sour >= 6) return 'Tangy';
  return taste.spicy >= 4 ? 'Medium' : 'Mild';
}

// Rough check on the estimated macros: enough protein, and fat not supplying most of the energy.
export function isBalanced({ protein, carbs, fat }: Macros) {
  const energy = protein * 4 + carbs * 4 + fat * 9;
  return energy > 0 && (protein * 4) / energy >= 0.15 && (fat * 9) / energy <= 0.5;
}

function matchTone(p: number) {
  return p >= 70 ? 'bg-[#c6f6d0] text-emerald-950' : p >= 45 ? 'badge-amber' : 'badge-red';
}

// One line of the Match Analysis list: a green tick only when the condition was actually met.
function CheckLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded text-white ${ok ? 'bg-green-600' : 'bg-amber-500'}`}>
        {ok ? <Check size={14} strokeWidth={3} aria-label="Yes" /> : <X size={14} strokeWidth={3} aria-label="No" />}
      </span>{children}
    </li>
  );
}

function RecipeCard({ r, selected, firstRow, onSave, saved, favorite, onFavorite }: {
  r: CuratedMatch; selected: boolean; firstRow: boolean; onSave: () => void; saved: 'idle' | 'saving' | 'saved' | 'exists'; favorite: boolean; onFavorite: () => void;
}) {
  return (
    <li className={`card flex flex-col overflow-hidden p-0 ${selected ? 'ring-2 ring-crimson ring-offset-2 ring-offset-[#fff5f0]' : ''}`}>
      <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} frame={firstRow ? 'aspect-[302/132]' : 'aspect-[302/111]'} zoomOut={firstRow ? 74 : 63}>
        <span className={`badge absolute left-2 top-2 !px-3 !py-1 !text-[0.92rem] ${matchTone(r.match_percent)}`}>{r.match_percent}% Match</span>
        <button type="button" onClick={onFavorite} aria-pressed={favorite} aria-label={`${favorite ? 'Remove' : 'Add'} ${r.name} ${favorite ? 'from' : 'to'} favorites`}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow">
          <Heart size={20} className={favorite ? 'fill-crimson text-crimson' : 'text-crimson'} />
        </button>
      </RecipeCardImage>
      <div className="flex flex-1 flex-col px-4 pb-3 pt-2">
        <h3 className="truncate font-display text-[1.25rem] font-bold tracking-tight" title={r.name}>{r.name}</h3>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.92rem]">
          <span className="inline-flex items-center gap-1"><Clock size={17} className="text-crimson" aria-hidden="true" />{r.minutes} min</span>
          <span className="inline-flex items-center gap-1"><Users size={17} className="text-crimson" aria-hidden="true" />{r.servings} servings</span>
          <span className="inline-flex items-center gap-1"><Flame size={17} className="fill-ember text-crimson" aria-hidden="true" />{tasteWord(r.taste)}</span>
        </p>
        <p className="mt-1.5 line-clamp-2 text-[0.92rem] leading-[1.3] tracking-tight text-stone-800">{r.description}</p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-2.5">
          <Link to={`/recipe/${r.slug}`} state={{ match: r }} className="btn-sm btn-red !gap-1 !px-3 !py-2 !text-[0.82rem]">View Recipe<ArrowRight size={15} /></Link>
          <button type="button" className="btn-sm btn-outline !gap-1 !border-rose-200 !px-2.5 !py-2 !text-[0.82rem]" onClick={onSave} disabled={saved !== 'idle'}>
            {saved === 'saved' || saved === 'exists' ? <BookmarkCheck size={16} className="text-crimson" /> : <Bookmark size={16} className="text-crimson" />}
            {saved === 'saved' ? 'Saved' : saved === 'exists' ? 'Already saved' : 'Add to My Recipes'}
          </button>
        </div>
      </div>
    </li>
  );
}

// Selected ingredients linked to the first one, from the stored compatibility graph (positions as in the design).
const SPOTS = [{ x: 45, y: 15 }, { x: 14, y: 52 }, { x: 81, y: 52 }, { x: 22, y: 92 }, { x: 72, y: 92 }];
function SelectionGraph({ center, edges, links = [] }: { center: string; edges: { name: string; weight: number }[]; links?: { a: string; b: string }[] }) {
  const hub = { x: 45, y: 72 };
  const spot = (name: string) => SPOTS[edges.findIndex((e) => e.name === name)];
  if (!edges.length) return <p className="py-6 text-center text-sm text-stone-500">No stored links for {short(center)} yet.</p>;
  return (
    <div className="relative h-[10.7rem]" role="img" aria-label={`${short(center)} pairs with ${edges.map((e) => `${short(e.name)} ${e.weight.toFixed(2)}`).join(', ')}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {links.filter((l) => spot(l.a) && spot(l.b)).map((l) => <line key={`${l.a}-${l.b}`} x1={spot(l.a).x} y1={spot(l.a).y} x2={spot(l.b).x} y2={spot(l.b).y} stroke="#f7b4bc" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
        {edges.map((e, i) => <line key={e.name} x1={hub.x} y1={hub.y} x2={SPOTS[i].x} y2={SPOTS[i].y} stroke="#f26d7d" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      </svg>
      {edges.map((e, i) => (
        <span key={e.name} title={`${short(e.name)}: ${e.weight.toFixed(2)}`} className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-[0.42rem] pl-2.5 pr-4 text-[1rem] font-medium tracking-tight shadow-[0_3px_12px_-4px_rgb(190_70_50/0.45)]"
          style={{ left: `${SPOTS[i].x}%`, top: `${SPOTS[i].y}%` }}>
          <IngredientBadge name={e.name} category="" size={29} />{short(e.name)}
        </span>
      ))}
      <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[1.1rem] bg-gradient-to-b from-[#ef2f2b] to-[#c81e3a] px-5 py-2.5 text-[1.05rem] font-semibold text-white shadow-md" style={{ left: `${hub.x}%`, top: `${hub.y}%` }}>{short(center)}</span>
    </div>
  );
}

const STARTER = ['Chicken Breast', 'Tomato', 'Onion', 'Green Chilli'];

// Pantry items first; the starter set otherwise. Anything the cook is allergic to is left out either way.
export function startingIngredients(pantryNames: string[], catalog: { name: string; allergens: string[] }[], prefs: Pick<Preferences, 'allergens' | 'customAllergens'>) {
  const safe = (name: string) => { const item = catalog.find((c) => c.name === name); return Boolean(item) && !isIngredientBlocked(name, item!.allergens, prefs); };
  const fromPantry = pantryNames.filter(safe).slice(0, 6);
  if (fromPantry.length >= 2) return { names: fromPantry, source: 'pantry' };
  return { names: STARTER.filter(safe), source: 'starter' };
}

// The cook's own viewed/saved/cooked recipes personalise the ranking; any failure just means no personalisation.
const withHistory = (userId?: string): Promise<HistoryEvent[]> => (userId ? personalHistory(userId).catch(() => []) : Promise.resolve([]));

// "How accurate is this?" Tested accuracy from the offline evaluation, so cooks can trust the ranking.
export function TestedBadge() {
  const [s, setS] = useState<EvaluationSummary | null>(null);
  useEffect(() => { let live = true; fetchEvaluationSummary().then((r) => { if (live) setS(r); }).catch(() => {}); return () => { live = false; }; }, []);
  if (!s) return null;
  return (
    <span className="badge badge-green !px-3 !py-1.5 !text-[0.85rem]" title={`Offline test: ${s.trials} cases over ${s.recipes} recipes. Mean reciprocal rank ${s.mrr.toFixed(2)}.`}>
      <ShieldCheck size={15} aria-hidden="true" /> Tested: right recipe in top 5 in {Math.round(s.hit5 * 100)}% of cases · {s.allergen_violations} allergen leaks
    </span>
  );
}

export function RecommendationsPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const savory = savoryFromUser(session?.user);
  const { catalog, prefs, pantryByName, error: dataError } = useKitchenData(userId);
  const { selection, setIngredients } = useSelection();
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cuisine, setCuisine] = useState('All');
  const [category, setCategory] = useState('All');
  const [maxTime, setMaxTime] = useState(0);
  const [sort, setSort] = useState<'match' | 'time' | 'name'>('match');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [saved, setSaved] = useState<Record<string, 'saving' | 'saved' | 'exists'>>({});
  const [myRecipes, setMyRecipes] = useState<Record<string, { id: string; favorite: boolean }>>({});
  const [graph, setGraph] = useState<{ center: string; edges: { name: string; weight: number; evidence: string }[] } | null>(null);
  const [pairs, setPairs] = useState<{ a: string; b: string; weight: number }[]>([]);
  const [graphOpen, setGraphOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const logged = useRef('');
  const autoFilled = useRef(false);
  const [startedFrom, setStartedFrom] = useState('');
  const enough = selection.ingredients.length >= 2;
  const liveTick = useLiveTick(['curated_recipes', 'ingredients', 'ingredient_compatibility']);

  // Opening the page with nothing chosen still shows real results, as in the design: from the cook's pantry
  // if it can, otherwise a starter set. The summary shows what was used, and Edit changes it.
  useEffect(() => {
    if (enough || catalog === null || !prefs) return;
    const pick = startingIngredients([...pantryByName].filter(([, grams]) => grams > 0).map(([name]) => name), catalog, prefs);
    if (pick.names.length < 2) return;
    autoFilled.current = true;
    setStartedFrom(pick.source);
    setIngredients(pick.names);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enough, catalog === null, prefs]);
  const requestKey = JSON.stringify([selection.ingredients, selection.tastes, selection.diets, selection.maxMinutes, nonce]);

  useEffect(() => {
    if (!enough || !prefs || !token || catalog === null) return;
    let live = true;
    setLoading(true);
    setError('');
    withHistory(userId).then((history) => fetchCuratedRecommendations(token, selection, prefs, [...pantryByName.keys()], { savory, history }))
      .then((r) => {
        if (!live) return;
        setResult(r);
        const top = r.recipes[0];
        // The automatic first result isn't a search the cook made, so it stays out of their history and the analytics.
        if (autoFilled.current) {
          autoFilled.current = false;
          logged.current = requestKey;
        } else if (top && logged.current !== requestKey) {
          logged.current = requestKey;
          recordEvent('generated', { slug: top.slug, name: top.name, matchPercent: top.match_percent }, selection.ingredients);
        }
      })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, prefs, token, catalog === null]);

  // Quiet refresh of the scores when recipes or the graph change. It isn't a new search, so nothing is logged.
  useEffect(() => {
    if (!liveTick || !enough || !prefs || !token || catalog === null) return;
    let live = true;
    withHistory(userId).then((history) => fetchCuratedRecommendations(token, selection, prefs, [...pantryByName.keys()], { savory, history })).then((r) => { if (live) setResult(r); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick]);

  useEffect(() => {
    const center = selection.ingredients[0];
    if (!center) return;
    fetchCompatibility(center).then((g) => setGraph({ center: g.ingredient, edges: g.edges })).catch(() => setGraph(null));
  }, [selection.ingredients]);

  // Scores for the chosen ingredients themselves: stored graph edges, or the engine's labelled estimate for other pairs.
  const pairsKey = selection.ingredients.join('|');
  useEffect(() => {
    if (!enough || !prefs) return;
    let live = true;
    checkCompatibility(selection.ingredients, prefs).then((r) => { if (live) setPairs(r.pairs); }).catch(() => { if (live) setPairs([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey, prefs, enough]);

  // Which dishes this cook already saved, so hearts and buttons start in the right state.
  const loadMyRecipes = useCallback(async () => {
    if (!userId) return {};
    const rows = await listSavedRecipes(userId);
    const map: Record<string, { id: string; favorite: boolean }> = {};
    for (const row of rows ?? []) if (isCuratedSnapshot(row.recipe)) map[row.recipe.slug] = { id: row.id, favorite: Boolean(row.favorite) };
    setMyRecipes(map);
    return map;
  }, [userId]);
  useEffect(() => { loadMyRecipes().catch(() => {}); }, [loadMyRecipes]);

  const shown = useMemo(() => {
    const rows = (result?.recipes ?? []).filter((r) => (cuisine === 'All' || r.cuisine === cuisine) && (category === 'All' || r.category === category) && (!maxTime || r.minutes <= maxTime));
    return [...rows].sort((a, b) => sort === 'time' ? a.minutes - b.minutes : sort === 'name' ? a.name.localeCompare(b.name) : b.score - a.score);
  }, [result, cuisine, category, maxTime, sort]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [requestKey, cuisine, category, maxTime, sort]);

  const save = async (r: CuratedMatch) => {
    if (!userId) return;
    setSaved((s) => ({ ...s, [r.slug]: 'saving' }));
    try {
      const outcome = await saveCurated(userId, { ...r, match_percent: r.match_percent });
      setSaved((s) => ({ ...s, [r.slug]: outcome }));
      if (outcome === 'saved') recordEvent('saved', { slug: r.slug, name: r.name, matchPercent: r.match_percent }, selection.ingredients);
      loadMyRecipes().catch(() => {});
    } catch (e) {
      setSaved((s) => { const next = { ...s }; delete next[r.slug]; return next; });
      setError((e as Error).message);
    }
  };

  // The heart saves the dish first if needed, because favorites live on saved recipes.
  const toggleFavorite = async (r: CuratedMatch) => {
    if (!userId) return;
    setError('');
    try {
      let row = myRecipes[r.slug];
      if (!row) {
        const outcome = await saveCurated(userId, { ...r, match_percent: r.match_percent });
        setSaved((s) => ({ ...s, [r.slug]: outcome }));
        if (outcome === 'saved') recordEvent('saved', { slug: r.slug, name: r.name, matchPercent: r.match_percent }, selection.ingredients);
        row = (await loadMyRecipes())[r.slug];
      }
      if (!row) throw new Error('Could not save this recipe. Please try again.');
      await setFavorite(userId, row.id, !row.favorite);
      setMyRecipes((m) => ({ ...m, [r.slug]: { id: row.id, favorite: !row.favorite } }));
    } catch (e) { setError((e as Error).message); }
  };

  const top = shown[0] ?? result?.recipes[0];
  const tasteChosen = (Object.entries(selection.tastes) as [TasteKey, Level | null][]).filter(([, v]) => v)
    .map(([k, v]) => `${TASTE_LABEL[k]}: ${LEVEL_LABEL[v as Level]}`).join(', ') || 'No preference';
  const allergyText = prefs ? [...effectiveAllergenTags(prefs).map(allergenLabel), ...prefs.customAllergens].join(', ') : '';
  const dietText = selection.diets.map((d) => DIETS.find((x) => x.key === d)?.label).join(', ');
  const cuisines = ['All', ...new Set((result?.recipes ?? []).map((r) => r.cuisine))];
  const categories = ['All', ...new Set((result?.recipes ?? []).map((r) => r.category))];
  // Graph card: the first ingredient linked to the other chosen ones; the strongest stored links if those aren't available.
  const hub = selection.ingredients[0];
  const chosenEdges = pairs.filter((p) => p.a === hub || p.b === hub).map((p) => ({ name: p.a === hub ? p.b : p.a, weight: p.weight }));
  const graphEdges = (chosenEdges.length ? chosenEdges : graph?.edges ?? []).slice(0, SPOTS.length);

  if (!enough) {
    return (
      <div className="tight-page">
        <PageHeader title="Meal" accent="Recommendations" subtitle="Best recipe suggestions based on your ingredients, taste and preferences." />
        <StepBar step={4} />
        <Card><EmptyState icon={ChefHat} title={catalog === null ? 'Getting your recipes ready…' : 'Choose at least 2 ingredients first'}>
          <Link to="/select" className="btn-primary mt-3">Select ingredients<ArrowRight size={16} /></Link>
        </EmptyState></Card>
      </div>
    );
  }

  const steps = [
    { label: 'Ingredients Selected', value: `${selection.ingredients.length} items`, icon: <span className="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-white"><Check size={20} strokeWidth={3} aria-hidden="true" /></span> },
    { label: 'Taste Preference', value: tasteChosen, icon: <Flame size={32} className="fill-rose-500 text-crimson" aria-hidden="true" /> },
    { label: 'Allergy & Diet', value: [allergyText || 'No Allergies', dietText].filter(Boolean).join(' · '), icon: <ShieldCheck size={32} className="text-green-600" aria-hidden="true" /> },
    { label: 'Recommended Meals', value: loading ? 'Searching…' : `${result?.recipes.length ?? 0} Recipes Found`, icon: <ChefHat size={32} aria-hidden="true" />, active: true },
  ];

  return (
    <div className="tight-page recommendations-page">
      <PageHeader title="Meal" accent="Recommendations" subtitle="Best recipe suggestions based on your ingredients, taste and preferences." actions={<TestedBadge />} />
      <div className="grid gap-[0.85rem] xl:grid-cols-[minmax(0,1fr)_27.5rem]">
        <div className="min-w-0">
          <ol className="mb-3 grid xl:mb-[1.35rem] xl:px-[0.45rem] grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:items-center" aria-label="Your selection">
            {steps.map(({ label, value, icon, active }, i) => (
              <li key={label} className="flex min-w-0 items-center gap-1 xl:gap-2" style={{ flex: `${[219, 204, 181, 196][i]} 1 0` }}>
                <div className={`flex h-[4.3rem] min-w-0 flex-1 items-center gap-2 rounded-[1.6rem] px-2.5 shadow-[0_6px_16px_-10px_rgb(159_18_57/0.5)] ${active ? 'bg-gradient-to-r from-[#dc1029] via-[#ea2526] to-ember text-white' : 'bg-white/80'}`}>
                  <span className="shrink-0">{icon}</span>
                  <span className="min-w-0"><span className={`block truncate text-[0.92rem] tracking-tighter ${active ? 'font-medium' : 'font-bold'}`}>{label}</span><span className="block truncate text-[0.88rem]" title={value}>{value}</span></span>
                </div>
                {i < steps.length - 1 && <ArrowRight size={20} className="hidden shrink-0 text-crimson xl:block" aria-hidden="true" />}
              </li>
            ))}
          </ol>
          <div className="card mb-3 flex flex-wrap items-center gap-3 px-4 py-3 xl:mx-[0.15rem] xl:mb-[0.95rem] xl:flex-nowrap xl:gap-[0.85rem]">
            <span className="flex shrink-0 items-center gap-2.5 font-display text-[1.15rem] font-bold tracking-tight lg:pr-3"><SlidersHorizontal size={26} className="text-crimson" aria-hidden="true" />Filter Recipes</span>
            <select className={SELECT} value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine">
              {cuisines.map((c) => <option key={c} value={c}>Cuisine: {c}</option>)}
            </select>
            <select className={SELECT} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Meal type">
              {categories.map((c) => <option key={c} value={c}>Meal Type: {c}</option>)}
            </select>
            <select className={SELECT} value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))} aria-label="Prep time">
              <option value={0}>Prep Time: Any</option><option value={30}>Prep Time: ≤ 30 min</option><option value={45}>Prep Time: ≤ 45 min</option><option value={60}>Prep Time: ≤ 60 min</option>
            </select>
            <select className={SELECT} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="match">Sort By: Match %</option><option value="time">Sort By: Time</option><option value="name">Sort By: Name</option>
            </select>
          </div>
          {(dataError || error) && <div className="mb-3"><ErrorNote onRetry={() => setNonce((n) => n + 1)}>{dataError || error}</ErrorNote></div>}
          {result?.data_source === 'bundled' && result.notes.length > 0 && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{result.notes[0]}</p>
          )}
          <Card title="Recommended Recipes for You" icon={ChefHat} action={<span className="text-[1rem] font-semibold text-crimson-deep">{shown.length} Recipes Found</span>}>
            {loading && !result ? <Spinner label="Finding recipes" /> : shown.length === 0 ? (
              <EmptyState icon={ChefHat} title="No suitable recipe found">
                {result && <>Filtered out for safety or diet: {result.excluded.allergy} for allergies, {result.excluded.diet} for diet, {result.excluded.calories ?? 0} over your calorie goal; {result.excluded.no_overlap} use none of your ingredients. </>}
                Try adding a main ingredient (chicken, daal, potato) or removing a filter.
              </EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shown.slice(0, visible).map((r, i) => (
                  <RecipeCard key={r.slug} r={r} selected={r === top} firstRow={i < 3} saved={saved[r.slug] ?? (myRecipes[r.slug] ? 'exists' : 'idle')} onSave={() => save(r)}
                    favorite={myRecipes[r.slug]?.favorite ?? false} onFavorite={() => toggleFavorite(r)} />
                ))}
              </ul>
            )}
            {shown.length > visible && (
              <div className="mt-3 text-center">
                <button type="button" className="btn-ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>Load More ({shown.length - visible} more)</button>
              </div>
            )}
            <Link to="/generate" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-crimson"><Wand2 size={16} aria-hidden="true" />Generate a new recipe<ChevronRight size={15} aria-hidden="true" /></Link>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-[0.82rem] xl:-mt-[0.85rem]" aria-label="Match details">
          <Card title="Your Selection Summary" icon={ShoppingBasket} action={<Link to="/select" className="pill !px-3 !py-1 !text-[0.92rem] !text-crimson-deep">Edit<Pencil size={15} className="text-crimson" /></Link>}>
            <p className="mb-2 mt-1 flex items-center gap-1.5 font-display text-[1.05rem] font-bold" title={pantryByName.size ? `Your ${pantryByName.size} pantry items also count as “have”.` : undefined}>
              <Sparkles size={20} className="text-orange-500" aria-hidden="true" />Ingredients ({selection.ingredients.length}){startedFrom && <span className="font-sans text-[0.8rem] font-normal">{startedFrom === 'pantry' ? 'from your pantry' : 'starter set'}</span>}</p>
            <ul className="flex flex-wrap gap-1">{selection.ingredients.map((n) => (
              <li key={n} className="flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-0.5 pr-2 text-[0.82rem] font-medium tracking-tight shadow-sm" title={n}><IngredientBadge name={n} category="" size={31} />{short(n)}</li>
            ))}</ul>
            <p className="mb-1 mt-4 flex flex-wrap gap-x-[6.2rem] gap-y-1 text-[1rem] tracking-tight">
              <span className="inline-flex items-center gap-1.5"><Flame size={20} className="fill-rose-500 text-crimson" aria-hidden="true" /><strong>Taste:</strong> <span className="font-semibold">{tasteChosen}</span></span>
              <span className="inline-flex items-center gap-1.5"><Leaf size={20} className="fill-green-500 text-green-700" aria-hidden="true" /><strong>Diet:</strong> <span className="font-semibold">{dietText || 'None'}</span></span>
            </p>
          </Card>
          {top && (
            <Card title="Match Analysis" icon={BarChart3} iconClass="text-orange-500" action={<button type="button" className="text-[0.82rem] font-semibold text-crimson underline-offset-2 hover:underline" onClick={() => setWhyOpen(true)}>Why this match?</button>}>
              <div className="flex flex-wrap items-center sm:flex-nowrap gap-[1.9rem] px-3">
                <Donut parts={[{ value: top.match_percent, color: '#16a34a', label: 'match' }, { value: 100 - top.match_percent, color: '#f5ebe7', label: 'rest' }]}
                  size={142} label={`Top match ${top.match_percent}%`}
                  center={<span><span className="block font-display text-[2rem] font-bold leading-none">{top.match_percent}%</span><span className="text-[0.95rem]">Top Match</span></span>} />
                <ul className="min-w-0 flex-1 space-y-[0.42rem] text-[0.92rem] tracking-tight lg:whitespace-nowrap">
                  <CheckLine ok={top.missing.length === 0}>{top.missing.length === 0 ? 'All ingredients available' : `${top.missing.length} ingredient(s) missing`}</CheckLine>
                  {top.components.compatibility !== null && <CheckLine ok={(top.components.compatibility ?? 0) >= 0.7}>{(top.components.compatibility ?? 0) >= 0.7 ? 'High' : 'Moderate'} flavor compatibility</CheckLine>}
                  {top.components.taste !== null && <CheckLine ok={(top.components.taste ?? 0) >= 0.6}>Matches your taste ({tasteChosen})</CheckLine>}
                  <CheckLine ok>No allergy conflicts</CheckLine>
                  {result?.personalization?.active && <CheckLine ok>Personalised for you</CheckLine>}
                  {isBalanced(top.nutrition_per_serving) && <CheckLine ok>Balanced nutrition</CheckLine>}
                </ul>
              </div>
            </Card>
          )}
          {top && (
            <Card title={`Nutritional Estimate (${top.name})`} icon={Apple}>
              <span className="sr-only">Per serving, estimated from catalog values per 100 g.</span>
              <ul className="grid grid-cols-4 gap-2 text-center">
                {([['kcal', 'Calories', ' kcal', Flame, 'fill-orange-400 text-crimson'], ['protein', 'Protein', ' g', Beef, 'text-orange-500'], ['fat', 'Fats', ' g', Leaf, 'fill-green-500 text-green-700'], ['carbs', 'Carbs', ' g', Wheat, 'text-amber-500']] as const).map(([k, label, unit, Icon, cls]) => (
                  <li key={k} className="rounded-2xl bg-white/80 px-1 py-1 shadow-sm" title="Per serving, estimated from catalog values per 100 g"><Icon size={26} className={`mx-auto ${cls}`} aria-hidden="true" /><span className="mt-0.5 block whitespace-nowrap font-bold">{Math.round(top.nutrition_per_serving[k])}{unit}</span><span className="text-[0.86rem]">{label}</span></li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Ingredient Compatibility Graph" icon={Network} action={<button type="button" className="pill whitespace-nowrap !gap-0.5 !px-2 !py-1 !text-[0.76rem] !text-crimson-deep" onClick={() => setGraphOpen(true)} disabled={!graph && !chosenEdges.length}>View Full Graph<ArrowRight size={15} className="text-crimson" /></button>}>
            {graphEdges.length || graph ? <SelectionGraph center={hub} edges={graphEdges} links={pairs.filter((p) => p.a !== hub && p.b !== hub)} /> : <p className="text-sm text-stone-500">Loading graph…</p>}
          </Card>
        </aside>
      </div>
      <Modal open={whyOpen && Boolean(top)} title={`Why ${top?.name ?? 'this recipe'}?`} onClose={() => setWhyOpen(false)}>
        {top && (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">{top.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
            {top.missing.length > 0 && <p><strong>Missing:</strong> {top.missing.join(', ')}</p>}
            <ul className="space-y-2 text-xs">
              {Object.entries(top.components).map(([k, v]) => (
                <li key={k}>
                  <span className="flex justify-between"><span>{COMPONENT_LABEL[k]}{top.weights_used[k as keyof typeof top.weights_used] !== undefined && ` · weight ${Math.round((top.weights_used[k as keyof typeof top.weights_used] ?? 0) * 100)}%`}</span>
                    <span className="font-semibold">{v === null ? 'not used' : `${Math.round(v * 100)}%`}</span></span>
                  {v !== null && <Bar value={v} label={COMPONENT_LABEL[k]} />}
                </li>
              ))}
              {top.penalty > 0 && <li className="text-rose-700">Penalty for missing ingredients: −{Math.round(top.penalty * 100)} points</li>}
            </ul>
            {result?.personalization?.active && (
              <section className="rounded-2xl bg-rose-50/70 p-3" aria-label="Personalised for you">
                <p className="mb-1.5 font-semibold text-crimson-deep">Personalised for you</p>
                <PersonalWeights info={result.personalization} />
              </section>
            )}
            <p className="text-xs text-stone-500">Nutrition values are per serving, estimated from catalog values per 100 g. Allergy matches are removed before ranking.</p>
          </div>
        )}
      </Modal>
      <Modal open={graphOpen} title="Ingredient Compatibility Graph" onClose={() => setGraphOpen(false)} wide>
        <CompatibilityGraph center={hub} edges={[...chosenEdges, ...(graph?.edges ?? []).filter((e) => !chosenEdges.some((c) => c.name === e.name))]} max={10} />
      </Modal>
    </div>
  );
}
