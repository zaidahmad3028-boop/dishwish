import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Apple, ArrowLeft, ArrowRight, Beef, Bookmark, BookmarkCheck, Check, CheckCircle2, ChefHat, Clock, Droplet, Flame, Leaf, Network,
  Share2, ShoppingBasket, Star, Users, Wheat } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { CompatibilityGraph } from '../components/CompatibilityGraph';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { recipeImage } from '../lib/images';
import { FeedbackForm } from '../components/FeedbackForm';
import { Bar, Card, Donut, ErrorNote, Modal, Spinner } from '../components/ui';
import { DIETS, fetchCompatibility, fetchCuratedDetail, recordEvent, saveCurated, type CuratedDetail, type CuratedMatch } from '../lib/curatedApi';
import { allergenLabel, effectiveAllergenTags, type TasteKey } from '../lib/preferences';
import { useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';
import { tasteWord } from './RecommendationsPage';

const TASTE_ORDER: TasteKey[] = ['spicy', 'salty', 'sour', 'sweet'];

// Radar of the four editorial taste scores (0–10), as in the reference's Taste Analysis card.
function TasteRadar({ taste }: { taste: Record<TasteKey, number> }) {
  const c = 75, R = 52;
  const point = (i: number, v: number) => {
    const a = (i / TASTE_ORDER.length) * Math.PI * 2 - Math.PI / 2;
    return [c + (R * v) * Math.cos(a), c + (R * v) * Math.sin(a)] as const;
  };
  const ring = (v: number) => TASTE_ORDER.map((_, i) => point(i, v).join(',')).join(' ');
  return (
    <svg viewBox="-16 0 182 150" className="w-44 shrink-0" role="img" aria-label={`Taste: ${TASTE_ORDER.map((t) => `${t} ${taste[t]} of 10`).join(', ')}`}>
      {[0.33, 0.66, 1].map((v) => <polygon key={v} points={ring(v)} fill="none" stroke="#fecdd3" strokeWidth="1" />)}
      {TASTE_ORDER.map((t, i) => { const [x, y] = point(i, 1); return <line key={t} x1={c} y1={c} x2={x} y2={y} stroke="#fecdd3" strokeWidth="1" />; })}
      <polygon points={TASTE_ORDER.map((t, i) => point(i, taste[t] / 10).join(',')).join(' ')} fill="#fb7185" fillOpacity="0.45" stroke="#dc1029" strokeWidth="1.5" />
      {TASTE_ORDER.map((t, i) => { const [x, y] = point(i, taste[t] / 10); return <circle key={t} cx={x} cy={y} r="2.5" fill="#dc1029" />; })}
      {TASTE_ORDER.map((t, i) => { const [x, y] = point(i, 1.26); return <text key={t} x={x} y={y + 3} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#292524" className="capitalize">{t}</text>; })}
    </svg>
  );
}

export function CuratedRecipePage() {
  const { slug = '' } = useParams();
  const { session } = useAuth();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const location = useLocation();
  const match = (location.state as { match?: CuratedMatch } | null)?.match;
  const { selection } = useSelection();
  const { prefs, pantryByName } = useKitchenData(userId);
  const [recipe, setRecipe] = useState<CuratedDetail | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [done, setDone] = useState<boolean[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'exists'>('idle');
  const [graph, setGraph] = useState<{ center: string; edges: { name: string; weight: number; evidence: string }[] } | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const cookedLogged = useRef(false);

  const haveKey = [...selection.ingredients, ...pantryByName.keys()].join('|');
  useEffect(() => {
    let live = true;
    fetchCuratedDetail(slug, haveKey ? haveKey.split('|') : [])
      .then((r) => {
        if (!live) return;
        setRecipe(r);
        setDone((d) => (d.length === r.steps.length ? d : r.steps.map(() => false)));
      })
      .catch((e: Error) => { if (live) { setError(e.message); setRecipe(null); } });
    return () => { live = false; };
  }, [slug, haveKey]);

  useEffect(() => {
    if (!recipe) return;
    recordEvent('viewed', { slug: recipe.slug, name: recipe.name, matchPercent: match?.match_percent }, selection.ingredients);
    const core = recipe.ingredients.find((i) => !i.staple);
    if (!core) return;
    fetchCompatibility(core.name).then((g) => {
      const inRecipe = new Set(recipe.ingredients.map((i) => i.name));
      setGraph({ center: g.ingredient, edges: g.edges.filter((e) => inRecipe.has(e.name)) });
    }).catch(() => setGraph(null));
    // Only once per recipe load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.slug]);

  const progress = done.length ? done.filter(Boolean).length / done.length : 0;
  useEffect(() => {
    if (recipe && progress === 1 && !cookedLogged.current) {
      cookedLogged.current = true;
      recordEvent('cooked', { slug: recipe.slug, name: recipe.name, matchPercent: match?.match_percent }, selection.ingredients);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  if (recipe === undefined) return <Spinner label="Loading recipe" />;
  if (recipe === null) {
    return (
      <section className="card p-8">
        <h1 className="font-display text-2xl font-extrabold">Recipe not found</h1>
        {error && <p className="mt-2 text-stone-600">{error}</p>}
        <Link to="/recommendations" className="btn-ghost mt-4">Back to recommendations</Link>
      </section>
    );
  }

  const save = async () => {
    if (!userId) return;
    setSaveState('saving');
    try {
      const outcome = await saveCurated(userId, { ...recipe, match_percent: match?.match_percent });
      setSaveState(outcome);
      if (outcome === 'saved') recordEvent('saved', { slug: recipe.slug, name: recipe.name, matchPercent: match?.match_percent }, selection.ingredients);
    } catch (e) { setSaveState('idle'); setError((e as Error).message); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/recipe/${recipe.slug}`); setCopied(true); } catch { setCopied(false); }
  };

  const blocked = prefs ? effectiveAllergenTags(prefs) : [];
  const conflicts = recipe.allergens.filter((a) => blocked.includes(a as never));
  const missing = recipe.ingredients.filter((i) => !i.have && !i.staple);
  const macros = [
    { icon: Flame, cls: 'text-crimson', value: `${Math.round(recipe.nutrition_per_serving.kcal)}`, label: 'Calories' }, { icon: Beef, cls: 'text-orange-500', value: `${Math.round(recipe.nutrition_per_serving.protein)} g`, label: 'Protein' },
    { icon: Droplet, cls: 'text-amber-500', value: `${Math.round(recipe.nutrition_per_serving.fat)} g`, label: 'Fats' }, { icon: Wheat, cls: 'text-amber-600', value: `${Math.round(recipe.nutrition_per_serving.carbs)} g`, label: 'Carbs' },
  ];

  return (
    <article aria-label={recipe.name} className="tight-page">
      <div className="mb-2 grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr] lg:pr-32">
        <button type="button" className="btn-ghost justify-self-start !py-1.5" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/recommendations'))}>
          <ArrowLeft size={18} className="text-crimson" />Back
        </button>
        <div className="flex items-center gap-3">
          <ChefHat size={44} strokeWidth={1.7} className="text-crimson" aria-hidden="true" />
          <div><p className="font-display text-[2rem] font-extrabold leading-none">Recipe Details</p><p className="mt-1 text-[0.98rem]">Full recipe, steps, nutrition and taste analysis.</p></div>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {conflicts.length > 0 && (
        <ErrorNote>This recipe contains {conflicts.map(allergenLabel).join(', ')}, which you avoid. It was not recommended to you for that reason.</ErrorNote>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_31rem]">
        <div className="min-w-0 space-y-3">
          <section className="card grid gap-4 p-2.5 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <RecipeCardImage category={recipe.category} imageUrl={recipeImage(recipe.slug, recipe.image_url)} name={recipe.name} rounded="rounded-2xl" />
            <div className="min-w-0 py-1 pr-2">
              <h1 className="font-display text-[2rem] font-extrabold leading-tight">{recipe.name}</h1>
              <p className="mt-1 line-clamp-3 text-[0.98rem]">{recipe.description}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.95rem]">
                <span className="inline-flex items-center gap-1"><Clock size={18} className="text-crimson" />{recipe.minutes} min</span>
                <span className="inline-flex items-center gap-1"><Users size={18} className="text-crimson" />{recipe.servings} servings</span>
                <span className="inline-flex items-center gap-1"><Flame size={18} className="text-crimson" />{tasteWord(recipe.taste)}</span>
                <span className="inline-flex items-center gap-1"><ChefHat size={18} className="text-crimson" />{recipe.cuisine}</span>
              </p>
              {recipe.diets.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5">{recipe.diets.map((d) => <span key={d} className="badge badge-green">{DIETS.find((x) => x.key === d)?.label}</span>)}</p>}
              {match && (
                <div className="mt-2 flex items-center gap-3 rounded-2xl bg-green-50 p-2">
                  <Donut parts={[{ value: match.match_percent, color: '#16a34a', label: 'match' }, { value: 100 - match.match_percent, color: '#dcfce7', label: 'rest' }]}
                    size={58} label={`Match ${match.match_percent}%`} center={<span className="text-sm font-bold">{match.match_percent}%</span>} />
                  <p className="text-[0.88rem]"><strong>Match Score.</strong> Highly compatible with your selected ingredients and taste.</p>
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" className="btn-sm btn-red" onClick={save} disabled={saveState !== 'idle'}>
                  {saveState === 'saved' || saveState === 'exists' ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                  {saveState === 'saved' ? 'Saved to My Recipes' : saveState === 'exists' ? 'Already in My Recipes' : 'Save to My Recipes'}
                </button>
                <button type="button" className="btn-sm btn-outline" onClick={() => setRateOpen(true)}><Star size={15} />Rate this recipe</button>
                <button type="button" className="btn-sm btn-outline" onClick={copyLink}><Share2 size={15} />{copied ? 'Link copied' : 'Share'}</button>
              </div>
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
            <Card title={<>Ingredients <span className="font-sans text-base font-normal">({recipe.servings} Servings)</span></>} icon={ShoppingBasket}>
              <ul className="divide-y divide-stone-100">
                {recipe.ingredients.map((i) => (
                  <li key={i.name} className="flex items-center gap-2.5 py-0.5 text-[0.92rem]">
                    <span aria-label={i.have ? 'You have this' : i.staple ? 'Pantry staple' : 'Missing'} role="img"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded ${i.have ? 'bg-green-600 text-white' : 'border border-stone-300 bg-white'}`}>{i.have && <Check size={14} strokeWidth={3} />}</span>
                    <IngredientBadge name={i.name} category={i.category} size={32} />
                    <span className="min-w-0 flex-1 leading-tight">{i.name.replace(/\s*\(.*\)$/, '')} <span className="text-stone-600">({i.display})</span></span>
                  </li>
                ))}
              </ul>
              {missing.length > 0 && <p className="mt-2 text-[0.86rem]"><strong>Missing:</strong> {missing.map((m) => m.name.replace(/\s*\(.*\)$/, '')).join(', ')}</p>}
            </Card>

            <Card title="Cooking Steps" icon={ChefHat} action={<span className="badge bg-white !text-[0.84rem] shadow-sm"><Clock size={15} className="text-crimson" />Total Time: {recipe.minutes} min</span>}>
              <div className="mb-2">
                <p className="mb-1 flex justify-between text-xs font-semibold"><span>Cooking progress</span><span>{Math.round(progress * 100)}%</span></p>
                <Bar value={progress} label="Cooking progress" color="#16a34a" />
                {progress === 1 && <p className="mt-1 text-sm font-semibold text-green-700">Done! Added to your cooking history.</p>}
              </div>
              <ol>
                {recipe.steps.map((step, i) => (
                  <li key={i} className="relative">
                    {i < recipe.steps.length - 1 && <span className="absolute left-[1.05rem] top-9 bottom-0 w-0.5 bg-rose-200" aria-hidden="true" />}
                    <label className={`relative flex cursor-pointer items-start gap-3 rounded-2xl p-1.5 transition ${done[i] ? 'bg-green-50' : 'hover:bg-white/70'}`}>
                      <input type="checkbox" className="sr-only" checked={done[i] ?? false}
                        onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} />
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${done[i] ? 'bg-green-600' : 'bg-crimson'}`} aria-hidden="true">
                        {done[i] ? '✓' : i + 1}
                      </span>
                      <span className={`text-[0.92rem] leading-snug ${done[i] ? 'text-stone-500 line-through' : ''}`}><span className="sr-only">Step {i + 1}: </span>{step}</span>
                    </label>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card title="Taste Analysis" icon={Flame}>
            <div className="flex items-center gap-3">
              <TasteRadar taste={recipe.taste} />
              <ul className="min-w-0 flex-1 space-y-2 text-[0.9rem]">
                {TASTE_ORDER.map((t) => (
                  <li key={t} className="grid grid-cols-[3.2rem_1fr_2.4rem] items-center gap-2 capitalize"><span>{t}</span>
                    <Bar value={recipe.taste[t]} max={10} label={`${t} level`} /><span className="text-right font-semibold">{recipe.taste[t] * 10}%</span></li>
                ))}
              </ul>
            </div>
          </Card>
          <Card title={<>Nutrition Information <span className="font-sans text-base font-normal">(Per Serving)</span></>} icon={Leaf} iconClass="text-green-600">
            <ul className="grid grid-cols-4 gap-2 text-center">
              {macros.map(({ icon: Icon, cls, value, label }) => (
                <li key={label} className="rounded-2xl bg-white/80 p-2 shadow-sm"><Icon size={24} className={`mx-auto ${cls}`} aria-hidden="true" /><span className="block font-bold">{value}</span><span className="text-[0.82rem]">{label}</span></li>
              ))}
            </ul>
            <p className="mt-1.5 text-[0.72rem] text-stone-500">Estimate from catalog values per 100 g.</p>
          </Card>
          <Card title="Ingredient Compatibility" icon={Network} action={<Link to="/select" className="pill !px-3 !py-1 !text-[0.82rem] !text-crimson">View Full Graph<ArrowRight size={14} /></Link>}>
            {graph ? <CompatibilityGraph center={graph.center} edges={graph.edges} /> : <p className="text-sm text-stone-500">Loading graph…</p>}
          </Card>
          {match && (
            <Card title="Why This Recipe?" icon={CheckCircle2} iconClass="text-green-600" className="!bg-green-50/80">
              <ul className="space-y-1 text-[0.92rem]">{match.explanation.map((e) => <li key={e} className="flex gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-green-600" />{e}</li>)}</ul>
            </Card>
          )}
          <Card title="Allergens & Safety" icon={AlertTriangle}>
            <p className="text-[0.92rem]">{recipe.allergens.length ? <>Contains: <strong>{recipe.allergens.map(allergenLabel).join(', ')}</strong></> : 'No tagged allergens in this recipe’s ingredients.'}</p>
            <p className="mt-1 text-[0.72rem] text-stone-500"><Apple size={12} className="mr-1 inline" aria-hidden="true" />Tags come from our catalog and can’t rule out cross-contact or brand differences, so always check labels.</p>
          </Card>
        </aside>
      </div>
      <Modal open={rateOpen} title={`Rate ${recipe.name}`} onClose={() => setRateOpen(false)}>
        <FeedbackForm recipeSlug={recipe.slug} defaultKind="rating" onDone={() => setRateOpen(false)} />
      </Modal>
    </article>
  );
}
