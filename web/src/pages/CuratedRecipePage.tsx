import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, ChefHat, Circle, Clock, Copy, Flame, Leaf, Network,
  ShoppingBasket, Star, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { CompatibilityGraph } from '../components/CompatibilityGraph';
import { DishArt, IngredientBadge } from '../components/DishArt';
import { FeedbackForm } from '../components/FeedbackForm';
import { Bar, Card, Donut, ErrorNote, Modal, Spinner } from '../components/ui';
import { DIETS, fetchCompatibility, fetchCuratedDetail, recordEvent, saveCurated, type CuratedDetail, type CuratedMatch } from '../lib/curatedApi';
import { allergenLabel, effectiveAllergenTags } from '../lib/preferences';
import { useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';
import { tasteWord } from './RecommendationsPage';

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

  return (
    <article aria-label={recipe.name}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/recommendations'))}>
          <ArrowLeft size={16} />Back
        </button>
        <p className="font-display text-xl font-extrabold">Recipe <span className="text-crimson">Details</span></p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {conflicts.length > 0 && (
        <ErrorNote>This recipe contains {conflicts.map(allergenLabel).join(', ')}, which you avoid. It was not recommended to you for that reason.</ErrorNote>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <DishArt category={recipe.category} imageUrl={recipe.image_url} name={recipe.name} className="h-60" />
            <div>
              <h1 className="font-display text-3xl font-extrabold">{recipe.name}</h1>
              <p className="mt-2 text-stone-600">{recipe.description}</p>
              <p className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
                <span className="inline-flex items-center gap-1"><Clock size={16} />{recipe.minutes} min</span>
                <span className="inline-flex items-center gap-1"><Users size={16} />{recipe.servings} servings</span>
                <span className="inline-flex items-center gap-1"><Flame size={16} className="text-crimson" />{tasteWord(recipe.taste)}</span>
                <span className="inline-flex items-center gap-1"><ChefHat size={16} />{recipe.cuisine}</span>
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <span className="badge badge-purple">{recipe.source === 'curated' ? 'Curated recipe' : 'User-generated'}</span>
                {recipe.diets.map((d) => <span key={d} className="badge badge-green">{DIETS.find((x) => x.key === d)?.label}</span>)}
              </p>
              {match && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-green-50 p-3">
                  <Donut parts={[{ value: match.match_percent, color: '#16a34a', label: 'match' }, { value: 100 - match.match_percent, color: '#dcfce7', label: 'rest' }]}
                    size={64} label={`Match ${match.match_percent}%`} center={<span className="text-sm font-extrabold">{match.match_percent}%</span>} />
                  <p className="text-sm"><strong>Match score</strong> for your selection ({selection.ingredients.join(', ')}).</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-sm btn-red" onClick={save} disabled={saveState !== 'idle'}>
                  {saveState === 'saved' || saveState === 'exists' ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  {saveState === 'saved' ? 'Saved to My Recipes' : saveState === 'exists' ? 'Already in My Recipes' : 'Save to My Recipes'}
                </button>
                <button type="button" className="btn-sm btn-outline" onClick={() => setRateOpen(true)}><Star size={14} />Rate this recipe</button>
                <button type="button" className="btn-sm btn-outline" onClick={copyLink}><Copy size={14} />{copied ? 'Link copied' : 'Copy link'}</button>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card title={`Ingredients (${recipe.servings} servings)`} icon={ShoppingBasket}>
              <ul className="divide-y divide-stone-100">
                {recipe.ingredients.map((i) => (
                  <li key={i.name} className="flex items-center gap-3 py-2 text-sm">
                    {i.have ? <CheckCircle2 size={18} className="shrink-0 text-green-600" aria-label="You have this" />
                      : <Circle size={18} className="shrink-0 text-stone-300" aria-label={i.staple ? 'Pantry staple' : 'Missing'} />}
                    <IngredientBadge name={i.name} category={i.category} size={28} />
                    <span className="flex-1"><strong>{i.name}</strong> <span className="text-stone-500">({i.display})</span>
                      {i.staple && <span className="ml-1 text-[11px] text-stone-400">staple</span>}</span>
                  </li>
                ))}
              </ul>
              {missing.length > 0 && <p className="mt-3 text-sm"><strong>Missing:</strong> {missing.map((m) => m.name).join(', ')}</p>}
            </Card>

            <Card title="Cooking Steps" icon={ChefHat} action={<span className="badge badge-red"><Clock size={12} />Total {recipe.minutes} min</span>}>
              <div className="mb-3">
                <p className="mb-1 flex justify-between text-xs font-semibold"><span>Cooking progress</span><span>{Math.round(progress * 100)}%</span></p>
                <Bar value={progress} label="Cooking progress" color="#16a34a" />
                {progress === 1 && <p className="mt-2 text-sm font-semibold text-green-700">Done! Added to your cooking history.</p>}
              </div>
              <ol className="space-y-3">
                {recipe.steps.map((step, i) => (
                  <li key={i}>
                    <label className={`flex cursor-pointer gap-3 rounded-2xl p-3 transition ${done[i] ? 'bg-green-50' : 'bg-white/70 hover:bg-white'}`}>
                      <input type="checkbox" className="sr-only" checked={done[i] ?? false}
                        onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} />
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold text-white ${done[i] ? 'bg-green-600' : 'bg-crimson'}`} aria-hidden="true">
                        {done[i] ? '✓' : i + 1}
                      </span>
                      <span className={`text-sm ${done[i] ? 'text-stone-500 line-through' : ''}`}><span className="sr-only">Step {i + 1}: </span>{step}</span>
                    </label>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card title="Taste Analysis" icon={Flame}>
            <ul className="space-y-2 text-sm">
              {(['spicy', 'salty', 'sour', 'sweet'] as const).map((t) => (
                <li key={t}><span className="flex justify-between capitalize"><span>{t}</span><span className="font-semibold">{recipe.taste[t]}/10</span></span>
                  <Bar value={recipe.taste[t]} max={10} label={`${t} level`} /></li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-stone-500">Editorial taste scores for the finished dish (0–10).</p>
          </Card>
          <Card title="Nutrition (per serving)" icon={Leaf}>
            <ul className="grid grid-cols-4 gap-2 text-center">
              {([['kcal', 'Calories', ''], ['protein', 'Protein', ' g'], ['fat', 'Fat', ' g'], ['carbs', 'Carbs', ' g']] as const).map(([k, label, unit]) => (
                <li key={k} className="rounded-xl bg-white p-2 shadow-sm"><span className="block font-bold">{Math.round(recipe.nutrition_per_serving[k])}{unit}</span><span className="text-[11px] text-stone-500">{label}</span></li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-stone-500">Estimate summed from catalog values per 100 g. Fibre and micronutrients are not in the catalog, so they are not shown.</p>
          </Card>
          <Card title="Ingredient Compatibility" icon={Network}>
            {graph ? <CompatibilityGraph center={graph.center} edges={graph.edges} /> : <p className="text-sm text-stone-500">Loading graph…</p>}
          </Card>
          <Card title="Allergens & Safety" icon={AlertTriangle}>
            <p className="text-sm">{recipe.allergens.length ? <>Contains: <strong>{recipe.allergens.map(allergenLabel).join(', ')}</strong></> : 'No tagged allergens in this recipe’s ingredients.'}</p>
            <p className="mt-2 text-[11px] text-stone-500">Allergen tags come from our ingredient catalog and name rules. They cannot rule out cross-contact or brand differences, so always check labels.</p>
          </Card>
          {match && (
            <Card title="Why This Recipe?" icon={CheckCircle2} className="bg-green-50/80">
              <ul className="space-y-1 text-sm">{match.explanation.map((e) => <li key={e} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />{e}</li>)}</ul>
            </Card>
          )}
        </aside>
      </div>
      <Modal open={rateOpen} title={`Rate ${recipe.name}`} onClose={() => setRateOpen(false)}>
        <FeedbackForm recipeSlug={recipe.slug} defaultKind="rating" onDone={() => setRateOpen(false)} />
      </Modal>
    </article>
  );
}
