import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, ArrowRight, BarChart3, Bookmark, BookmarkCheck, CheckCircle2, ChefHat, Clock, Flame, Network, Pencil, ShieldCheck,
  SlidersHorizontal, Sparkles, Users, Wand2, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { CompatibilityGraph } from '../components/CompatibilityGraph';
import { DishArt } from '../components/DishArt';
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

function matchTone(p: number) {
  return p >= 70 ? 'badge-green' : p >= 45 ? 'badge-amber' : 'badge-red';
}

function RecipeCard({ r, selected, onSave, saved }: { r: CuratedMatch; selected: boolean; onSave: () => void; saved: 'idle' | 'saving' | 'saved' | 'exists' }) {
  return (
    <li className={`card flex flex-col overflow-hidden p-3 ${selected ? 'ring-2 ring-crimson' : ''}`}>
      <div className="relative">
        <DishArt category={r.category} imageUrl={r.image_url} name={r.name} className="h-36" />
        <span className={`badge absolute left-2 top-2 text-sm ${matchTone(r.match_percent)}`}>{r.match_percent}% Match</span>
      </div>
      <h3 className="mt-3 font-display text-lg font-bold">{r.name}</h3>
      <p className="mt-1 flex flex-wrap gap-3 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1"><Clock size={13} />{r.minutes} min</span>
        <span className="inline-flex items-center gap-1"><Users size={13} />{r.servings} servings</span>
        <span className="inline-flex items-center gap-1"><Flame size={13} className="text-crimson" />{tasteWord(r.taste)}</span>
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-stone-600">{r.description}</p>
      <p className="mt-2 text-xs">
        {r.missing.length === 0 ? <span className="font-semibold text-green-700">You have every main ingredient</span>
          : <span className="text-stone-600"><strong>Missing {r.missing.length}:</strong> {r.missing.slice(0, 4).join(', ')}{r.missing.length > 4 ? '…' : ''}</span>}
      </p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-semibold text-crimson">Why this match?</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-600">{r.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
      </details>
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <Link to={`/recipe/${r.slug}`} state={{ match: r }} className="btn-sm btn-red">View Recipe<ArrowRight size={14} /></Link>
        <button type="button" className="btn-sm btn-outline" onClick={onSave} disabled={saved === 'saving' || saved === 'saved' || saved === 'exists'}>
          {saved === 'saved' || saved === 'exists' ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          {saved === 'saved' ? 'Saved' : saved === 'exists' ? 'Already saved' : 'Add to My Recipes'}
        </button>
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
    <>
      <PageHeader title="Meal" accent="Recommendations" subtitle="Best recipe suggestions based on your ingredients, taste and preferences." />
      <ul className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
            <span className="flex items-center gap-2 font-display font-bold"><SlidersHorizontal size={18} className="text-crimson" />Filter Recipes</span>
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
          <Card title="Recommended Recipes for You" icon={Sparkles} action={<span className="text-sm font-semibold text-crimson">{shown.length} shown</span>}>
            {loading && !result ? <Spinner label="Finding recipes" /> : shown.length === 0 ? (
              <EmptyState icon={ChefHat} title="No suitable recipe found">
                {result && <>Filtered out for safety or diet: {result.excluded.allergy} for allergies, {result.excluded.diet} for diet; {result.excluded.no_overlap} use none of your ingredients. </>}
                Try adding a main ingredient (chicken, daal, potato) or removing a filter.
              </EmptyState>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {shown.map((r) => <RecipeCard key={r.slug} r={r} selected={r === top} saved={saved[r.slug] ?? 'idle'} onSave={() => save(r)} />)}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Match details">
          <Card title="Your Selection" icon={ChefHat} action={<Link to="/select" className="btn-sm btn-outline"><Pencil size={14} />Edit</Link>}>
            <ul className="flex flex-wrap gap-1.5">{selection.ingredients.map((n) => <li key={n} className="badge badge-gray">{n}</li>)}</ul>
            <p className="mt-3 text-sm"><Flame size={14} className="inline text-crimson" /> Taste: {tasteChosen}</p>
            {pantryByName.size > 0 && <p className="mt-1 text-xs text-stone-500">Your {pantryByName.size} pantry items also count as “have”.</p>}
          </Card>
          {top && (
            <Card title="Match Analysis" icon={BarChart3}>
              <div className="flex items-center gap-4">
                <Donut parts={[{ value: top.match_percent, color: '#16a34a', label: 'match' }, { value: 100 - top.match_percent, color: '#f5ebe7', label: 'rest' }]}
                  size={110} label={`Top match ${top.match_percent}%`}
                  center={<span><span className="block font-display text-2xl font-extrabold">{top.match_percent}%</span><span className="text-[11px]">Top Match</span></span>} />
                <ul className="flex-1 space-y-1 text-xs">
                  <li className="flex items-center gap-1">{top.missing.length === 0 ? <CheckCircle2 size={14} className="text-green-600" /> : <XCircle size={14} className="text-amber-600" />}
                    {top.missing.length === 0 ? 'All main ingredients available' : `${top.missing.length} ingredient(s) missing`}</li>
                  <li className="flex items-center gap-1"><CheckCircle2 size={14} className="text-green-600" />No allergy conflicts (filtered)</li>
                  {top.components.taste !== null && <li className="flex items-center gap-1"><CheckCircle2 size={14} className="text-green-600" />Taste similarity {Math.round((top.components.taste ?? 0) * 100)}%</li>}
                </ul>
              </div>
              <p className="mt-3 text-sm font-semibold">{top.name}: score breakdown</p>
              <ul className="mt-2 space-y-2 text-xs">
                {Object.entries(top.components).map(([k, v]) => (
                  <li key={k}>
                    <span className="flex justify-between"><span>{COMPONENT_LABEL[k]}{top.weights_used[k as keyof typeof top.weights_used] !== undefined && ` · weight ${Math.round((top.weights_used[k as keyof typeof top.weights_used] ?? 0) * 100)}%`}</span>
                      <span className="font-semibold">{v === null ? 'not used' : `${Math.round(v * 100)}%`}</span></span>
                    {v !== null && <Bar value={v} label={COMPONENT_LABEL[k]} />}
                  </li>
                ))}
                {top.penalty > 0 && <li className="text-rose-700">Missing-ingredient penalty: −{Math.round(top.penalty * 100)} points</li>}
              </ul>
            </Card>
          )}
          {top && (
            <Card title={`Nutrition Estimate (${top.name})`} icon={Apple}>
              <ul className="grid grid-cols-4 gap-2 text-center">
                {([['kcal', 'Calories', ''], ['protein', 'Protein', ' g'], ['fat', 'Fat', ' g'], ['carbs', 'Carbs', ' g']] as const).map(([k, label, unit]) => (
                  <li key={k} className="rounded-xl bg-white p-2 shadow-sm"><span className="block font-bold">{Math.round(top.nutrition_per_serving[k])}{unit}</span><span className="text-[11px] text-stone-500">{label}</span></li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-stone-500">Per serving, estimated from catalog values per 100 g. Not lab-verified.</p>
            </Card>
          )}
          <Card title="Ingredient Compatibility Graph" icon={Network}>
            {graph ? <CompatibilityGraph center={graph.center} edges={graph.edges} /> : <p className="text-sm text-stone-500">Loading graph…</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
