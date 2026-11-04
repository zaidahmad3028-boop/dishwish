import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, ArrowRight, BarChart3, Beef, Bookmark, BookmarkCheck, Check, CheckCircle2, ChefHat, Clock, Droplet, Flame, Heart, Leaf, Network, Pencil, ShieldCheck,
  ShoppingBasket, SlidersHorizontal, Users, Wand2, Wheat, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { CompatibilityGraph } from '../components/CompatibilityGraph';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { recipeImage } from '../lib/images';
import { Bar, Card, Donut, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { DIETS, fetchCompatibility, fetchCuratedRecommendations, recordEvent, saveCurated, type CuratedMatch, type RecommendationResult } from '../lib/curatedApi';
import { allergenLabel, effectiveAllergenTags, type TasteKey } from '../lib/preferences';
import { useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';
import { StepBar } from './IngredientSelectionPage';

const COMPONENT_LABEL: Record<string, string> = { coverage: 'Ingredient coverage', compatibility: 'Graph compatibility', taste: 'Taste match', cooking: 'Cooking time' };

export function tasteWord(taste: Record<TasteKey, number>): string {
  if (taste.sweet >= 7) return 'Sweet';
  if (taste.spicy >= 7) return 'Spicy';
  if (taste.sour >= 6) return 'Tangy';
  return taste.spicy >= 4 ? 'Medium' : 'Mild';
}

const CheckMark = () => <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-green-600 text-white"><Check size={14} strokeWidth={3} aria-hidden="true" /></span>;

function matchTone(p: number) {
  return p >= 70 ? 'badge-green' : p >= 45 ? 'badge-amber' : 'badge-red';
}

function RecipeCard({ r, selected, onSave, saved }: { r: CuratedMatch; selected: boolean; onSave: () => void; saved: 'idle' | 'saving' | 'saved' | 'exists' }) {
  return (
    <li className={`card flex flex-col overflow-hidden p-0 ${selected ? 'ring-2 ring-crimson' : ''}`}>
      <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} height="h-[8.2rem]">
        <span className={`badge absolute left-2 top-2 !text-[0.9rem] ${matchTone(r.match_percent)}`}>{r.match_percent}% Match</span>
        <button type="button" onClick={onSave} disabled={saved === 'saving' || saved === 'saved' || saved === 'exists'} aria-label={`Save ${r.name}`}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow">
          <Heart size={18} className={saved === 'saved' || saved === 'exists' ? 'fill-crimson text-crimson' : 'text-crimson'} />
        </button>
      </RecipeCardImage>
      <div className="flex flex-1 flex-col px-3 py-2">
      <h3 className="truncate font-display text-[1.2rem] font-bold" title={r.name}>{r.name}</h3>
      <p className="mt-0.5 flex flex-wrap gap-3 text-[0.88rem]">
        <span className="inline-flex items-center gap-1"><Clock size={16} className="text-crimson" />{r.minutes} min</span>
        <span className="inline-flex items-center gap-1"><Users size={16} className="text-crimson" />{r.servings} servings</span>
        <span className="inline-flex items-center gap-1"><Flame size={16} className="text-crimson" />{tasteWord(r.taste)}</span>
      </p>
      <p className="mt-1 line-clamp-2 text-[0.88rem] leading-snug">{r.description}</p>
      <p className="mt-1 text-xs">
        {r.missing.length === 0 ? <span className="font-semibold text-green-700">You have every main ingredient</span>
          : <span className="text-stone-600"><strong>Missing {r.missing.length}:</strong> {r.missing.slice(0, 4).join(', ')}{r.missing.length > 4 ? '…' : ''}</span>}
      </p>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer font-semibold text-crimson">Why this match?</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-600">{r.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
      </details>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <Link to={`/recipe/${r.slug}`} state={{ match: r }} className="btn-sm btn-red">View Recipe<ArrowRight size={14} /></Link>
        <button type="button" className="btn-sm btn-outline" onClick={onSave} disabled={saved === 'saving' || saved === 'saved' || saved === 'exists'}>
          {saved === 'saved' || saved === 'exists' ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          {saved === 'saved' ? 'Saved' : saved === 'exists' ? 'Already saved' : 'Add to My Recipes'}
        </button>
      </div>
      </div>
    </li>
  );
}

export function RecommendationsPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const { catalog, prefs, pantryByName, error: dataError } = useKitchenData(userId);
  const { selection } = useSelection();
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('All');
  const [maxTime, setMaxTime] = useState(0);
  const [sort, setSort] = useState<'match' | 'time' | 'name'>('match');
  const [saved, setSaved] = useState<Record<string, 'saving' | 'saved' | 'exists'>>({});
  const [graph, setGraph] = useState<{ center: string; edges: { name: string; weight: number; evidence: string }[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  const logged = useRef('');
  const enough = selection.ingredients.length >= 2;
  const requestKey = JSON.stringify([selection.ingredients, selection.tastes, selection.diets, selection.maxMinutes, nonce]);

  useEffect(() => {
    if (!enough || !prefs || !token || catalog === null) return;
    let live = true;
    setLoading(true);
    setError('');
    fetchCuratedRecommendations(token, selection, prefs, [...pantryByName.keys()])
      .then((r) => {
        if (!live) return;
        setResult(r);
        const top = r.recipes[0];
        if (top && logged.current !== requestKey) {
          logged.current = requestKey;
          recordEvent('generated', { slug: top.slug, name: top.name, matchPercent: top.match_percent }, selection.ingredients);
        }
      })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, prefs, token, catalog === null]);

  useEffect(() => {
    const center = selection.ingredients[0];
    if (!center) return;
    fetchCompatibility(center).then((g) => setGraph({ center: g.ingredient, edges: g.edges })).catch(() => setGraph(null));
  }, [selection.ingredients]);

  const shown = useMemo(() => {
    const rows = (result?.recipes ?? []).filter((r) => (category === 'All' || r.category === category) && (!maxTime || r.minutes <= maxTime));
    return [...rows].sort((a, b) => sort === 'time' ? a.minutes - b.minutes : sort === 'name' ? a.name.localeCompare(b.name) : b.score - a.score);
  }, [result, category, maxTime, sort]);

  const save = async (r: CuratedMatch) => {
    if (!userId) return;
    setSaved((s) => ({ ...s, [r.slug]: 'saving' }));
    try {
      const outcome = await saveCurated(userId, { ...r, match_percent: r.match_percent });
      setSaved((s) => ({ ...s, [r.slug]: outcome }));
      if (outcome === 'saved') recordEvent('saved', { slug: r.slug, name: r.name, matchPercent: r.match_percent }, selection.ingredients);
    } catch (e) {
      setSaved((s) => { const next = { ...s }; delete next[r.slug]; return next; });
      setError((e as Error).message);
    }
  };

  const top = shown[0] ?? result?.recipes[0];
  const tasteChosen = Object.entries(selection.tastes).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'No preference';
  const allergyText = prefs ? [...effectiveAllergenTags(prefs).map(allergenLabel), ...prefs.customAllergens].join(', ') : '';
  const dietText = selection.diets.map((d) => DIETS.find((x) => x.key === d)?.label).join(', ');
  const categories = ['All', ...new Set((result?.recipes ?? []).map((r) => r.category))];

  if (!enough) {
    return (
      <>
        <PageHeader title="Meal" accent="Recommendations" subtitle="Best recipe suggestions based on your ingredients, taste and preferences." />
        <StepBar step={4} />
        <Card><EmptyState icon={ChefHat} title="Choose at least 2 ingredients first">
          <Link to="/select" className="btn-primary mt-3">Select ingredients<ArrowRight size={16} /></Link>
        </EmptyState></Card>
      </>
    );
  }

  return (
    <div className="tight-page">
      <PageHeader title="Meal" accent="Recommendations" subtitle="Best recipe suggestions based on your ingredients, taste and preferences." />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="min-w-0">
      <ul className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: CheckCircle2, label: 'Ingredients Selected', value: `${selection.ingredients.length} items`, tone: 'text-green-600' },
          { icon: Flame, label: 'Taste Preference', value: tasteChosen, tone: 'text-crimson' },
          { icon: ShieldCheck, label: 'Allergy & Diet', value: [allergyText || 'No allergies', dietText].filter(Boolean).join(' · '), tone: 'text-green-600' },
          { icon: ChefHat, label: 'Recommended Meals', value: loading ? 'Searching…' : `${result?.recipes.length ?? 0} recipes found`, tone: 'text-white', active: true },
        ].map(({ icon: Icon, label, value, tone, active }) => (
          <li key={label} className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm ${active ? 'bg-gradient-to-r from-crimson to-ember text-white' : 'bg-white/85'}`}>
            <Icon size={26} className={tone} aria-hidden="true" />
            <span className="min-w-0"><span className="block text-sm font-bold">{label}</span><span className="block truncate text-xs">{value}</span></span>
          </li>
        ))}
      </ul>
          <div className="card mb-3 flex flex-wrap items-center gap-3 p-2.5">
            <span className="flex items-center gap-2 font-display text-lg font-bold"><SlidersHorizontal size={22} className="text-crimson" />Filter Recipes</span>
            <label className="text-sm"><span className="sr-only">Meal type</span>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => <option key={c} value={c}>{c === 'All' ? 'Meal Type: All' : c}</option>)}
              </select></label>
            <label className="text-sm"><span className="sr-only">Prep time</span>
              <select className="select" value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))}>
                <option value={0}>Prep Time: Any</option><option value={30}>≤ 30 min</option><option value={45}>≤ 45 min</option><option value={60}>≤ 60 min</option>
              </select></label>
            <label className="text-sm"><span className="sr-only">Sort</span>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="match">Sort By: Match %</option><option value="time">Sort By: Time</option><option value="name">Sort By: Name</option>
              </select></label>
            <Link to="/create" className="btn-sm btn-outline ml-auto"><Wand2 size={14} />Generate a new recipe</Link>
          </div>
          {(dataError || error) && <ErrorNote onRetry={() => setNonce((n) => n + 1)}>{dataError || error}</ErrorNote>}
          {result?.data_source === 'bundled' && result.notes.length > 0 && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{result.notes[0]}</p>
          )}
          <Card title="Recommended Recipes for You" icon={ChefHat} action={<span className="text-[0.95rem] font-semibold text-crimson">{shown.length} Recipes Found</span>}>
            {loading && !result ? <Spinner label="Finding recipes" /> : shown.length === 0 ? (
              <EmptyState icon={ChefHat} title="No suitable recipe found">
                {result && <>Filtered out for safety or diet: {result.excluded.allergy} for allergies, {result.excluded.diet} for diet; {result.excluded.no_overlap} use none of your ingredients. </>}
                Try adding a main ingredient (chicken, daal, potato) or removing a filter.
              </EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {shown.map((r) => <RecipeCard key={r.slug} r={r} selected={r === top} saved={saved[r.slug] ?? 'idle'} onSave={() => save(r)} />)}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-3" aria-label="Match details">
          <Card title="Your Selection Summary" icon={ShoppingBasket} action={<Link to="/select" className="pill !px-3 !py-1 !text-[0.84rem] !text-crimson">Edit<Pencil size={14} /></Link>}>
            <p className="mb-1 text-[0.95rem] font-semibold">Ingredients ({selection.ingredients.length})</p>
            <ul className="flex flex-wrap gap-1.5">{selection.ingredients.map((n) => (
              <li key={n} className="flex items-center gap-1 rounded-full bg-white/85 py-0.5 pl-1 pr-2.5 text-[0.84rem] font-medium shadow-sm"><IngredientBadge name={n} category="" size={26} />{n.replace(/\s*\(.*\)$/, '')}</li>
            ))}</ul>
            <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[0.95rem]"><span className="inline-flex items-center gap-1.5"><Flame size={18} className="text-crimson" />Taste: <strong className="capitalize">{tasteChosen}</strong></span>
              <span className="inline-flex items-center gap-1.5"><Leaf size={18} className="text-green-600" />Diet: <strong>{dietText || 'None'}</strong></span></p>
            {pantryByName.size > 0 && <p className="mt-1 text-xs text-stone-500">Your {pantryByName.size} pantry items also count as “have”.</p>}
          </Card>
          {top && (
            <Card title="Match Analysis" icon={BarChart3}>
              <div className="flex items-center gap-4">
                <Donut parts={[{ value: top.match_percent, color: '#16a34a', label: 'match' }, { value: 100 - top.match_percent, color: '#f5ebe7', label: 'rest' }]}
                  size={124} label={`Top match ${top.match_percent}%`}
                  center={<span><span className="block text-[1.7rem] font-bold leading-none">{top.match_percent}%</span><span className="text-[0.86rem]">Top Match</span></span>} />
                <ul className="flex-1 space-y-1.5 text-[0.9rem]">
                  <li className="flex items-center gap-2">{top.missing.length === 0 ? <CheckMark /> : <XCircle size={18} className="shrink-0 text-amber-600" />}
                    {top.missing.length === 0 ? 'All ingredients available' : `${top.missing.length} ingredient(s) missing`}</li>
                  <li className="flex items-center gap-2"><CheckMark />No allergy conflicts</li>
                  {top.components.compatibility !== null && <li className="flex items-center gap-2"><CheckMark />Flavor compatibility {Math.round((top.components.compatibility ?? 0) * 100)}%</li>}
                  {top.components.taste !== null && <li className="flex items-center gap-2"><CheckMark />Matches your taste ({Math.round((top.components.taste ?? 0) * 100)}%)</li>}
                  <li className="flex items-center gap-2"><CheckMark />Ready in {top.minutes} minutes</li>
                </ul>
              </div>
              <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-crimson">{top.name}: score breakdown</summary>
              <ul className="mt-2 space-y-2">
                {Object.entries(top.components).map(([k, v]) => (
                  <li key={k}>
                    <span className="flex justify-between"><span>{COMPONENT_LABEL[k]}{top.weights_used[k as keyof typeof top.weights_used] !== undefined && ` · weight ${Math.round((top.weights_used[k as keyof typeof top.weights_used] ?? 0) * 100)}%`}</span>
                      <span className="font-semibold">{v === null ? 'not used' : `${Math.round(v * 100)}%`}</span></span>
                    {v !== null && <Bar value={v} label={COMPONENT_LABEL[k]} />}
                  </li>
                ))}
                {top.penalty > 0 && <li className="text-rose-700">Missing-ingredient penalty: −{Math.round(top.penalty * 100)} points</li>}
              </ul></details>
            </Card>
          )}
          {top && (
            <Card title={`Nutrition Estimate (${top.name})`} icon={Apple}>
              <ul className="grid grid-cols-4 gap-2 text-center">
                {([['kcal', 'Calories', ' kcal', Flame, 'text-crimson'], ['protein', 'Protein', ' g', Beef, 'text-orange-500'], ['fat', 'Fats', ' g', Droplet, 'text-amber-500'], ['carbs', 'Carbs', ' g', Wheat, 'text-amber-600']] as const).map(([k, label, unit, Icon, cls]) => (
                  <li key={k} className="rounded-2xl bg-white/80 p-2 shadow-sm"><Icon size={24} className={`mx-auto ${cls}`} aria-hidden="true" /><span className="block whitespace-nowrap font-bold">{Math.round(top.nutrition_per_serving[k])}{unit}</span><span className="text-[0.82rem]">{label}</span></li>
                ))}
              </ul>
              <p className="mt-1.5 text-[0.72rem] text-stone-500">Per serving, estimated from catalog values per 100 g.</p>
            </Card>
          )}
          <Card title="Ingredient Compatibility Graph" icon={Network}>
            {graph ? <CompatibilityGraph center={graph.center} edges={graph.edges} /> : <p className="text-sm text-stone-500">Loading graph…</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
