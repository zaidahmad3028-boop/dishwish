import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BarChart3, Bookmark, BookOpen, ChefHat, Clock, CookingPot, Heart, Plus, Trash2, Users, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { DishArt } from '../components/DishArt';
import { Card, Donut, EmptyState, ErrorNote, PageHeader, SearchBox, Spinner, StatCard, formatDate } from '../components/ui';
import { deleteEvent, isCuratedSnapshot, listCuratedRecipes, listEvents, setFavorite, type CuratedSummary, type EventKind, type RecipeEvent } from '../lib/curatedApi';
import { deleteSavedRecipe, isGenerated, listSavedRecipes, type SavedRecipe } from '../lib/recipesApi';

type Tab = 'saved' | 'favorites' | 'generated' | 'cooked' | 'viewed' | 'browse';
const TABS: { key: Tab; label: string }[] = [
  { key: 'saved', label: 'Saved' }, { key: 'favorites', label: 'Favorites' }, { key: 'generated', label: 'Generated' },
  { key: 'cooked', label: 'Cooked' }, { key: 'viewed', label: 'Recently viewed' }, { key: 'browse', label: 'Browse all' },
];

function savedLink(r: SavedRecipe) {
  return isCuratedSnapshot(r.recipe) ? `/recipe/${r.recipe.slug}` : `/recipes/${r.id}`;
}

function SavedCard({ r, onDelete, onFavorite }: { r: SavedRecipe; onDelete: () => void; onFavorite: () => void }) {
  const curated = isCuratedSnapshot(r.recipe);
  const minutes = r.recipe.minutes, servings = r.recipe.servings;
  const category = curated ? (r.recipe as { category: string }).category : 'Main Course';
  return (
    <li className="card flex flex-col p-3">
      <div className="relative">
        <DishArt category={category} name={r.title} className="h-32" />
        <span className={`badge absolute left-2 top-2 ${curated ? 'badge-purple' : 'badge-amber'}`}>{curated ? 'Curated' : 'Generated'}</span>
        <button type="button" onClick={onFavorite} aria-pressed={r.favorite ?? false} aria-label={`${r.favorite ? 'Remove' : 'Add'} ${r.title} ${r.favorite ? 'from' : 'to'} favorites`}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white shadow">
          <Heart size={16} className={r.favorite ? 'fill-crimson text-crimson' : 'text-crimson'} />
        </button>
      </div>
      <Link to={savedLink(r)} className="mt-2 font-display text-lg font-bold hover:text-crimson">{r.title}</Link>
      <p className="mt-1 flex flex-wrap gap-3 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1"><Clock size={13} />{minutes} min</span>
        <span className="inline-flex items-center gap-1"><Users size={13} />{servings} servings</span>
        {isGenerated(r.recipe) && <span>{r.recipe.nutrition.per_serving.kcal} kcal per serving</span>}
      </p>
      <p className="mt-1 text-xs text-stone-500">Saved {formatDate(r.createdAt)}</p>
      <div className="mt-3 flex items-center justify-between">
        <Link to={savedLink(r)} className="btn-sm btn-red">View Recipe<ArrowRight size={14} /></Link>
        <button type="button" className="icon-btn" onClick={onDelete} aria-label={`Delete ${r.title}`}><Trash2 size={16} /></button>
      </div>
    </li>
  );
}

export function MyRecipesPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'saved') as Tab;
  const [saved, setSaved] = useState<SavedRecipe[] | null>(null);
  const [events, setEvents] = useState<RecipeEvent[] | null>(null);
  const [catalog, setCatalog] = useState<CuratedSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    listSavedRecipes(userId).then(setSaved).catch((e: Error) => { setSaved([]); setError(e.message); });
    listEvents(userId).then(setEvents).catch(() => setEvents([]));
  }, [userId]);
  useEffect(() => {
    if (tab === 'browse' && catalog === null) listCuratedRecipes().then(setCatalog).catch((e: Error) => { setCatalog([]); setError(e.message); });
  }, [tab, catalog]);

  const count = (kind: EventKind) => (events ?? []).filter((e) => e.kind === kind).length;
  const favorites = (saved ?? []).filter((r) => r.favorite);
  const q = query.trim().toLowerCase();

  const remove = async (r: SavedRecipe) => {
    if (!userId) return;
    setError('');
    try { await deleteSavedRecipe(userId, r.id); setSaved((s) => (s ?? []).filter((x) => x.id !== r.id)); } catch (e) { setError((e as Error).message); }
  };
  const toggleFavorite = async (r: SavedRecipe) => {
    if (!userId) return;
    try {
      await setFavorite(userId, r.id, !r.favorite);
      setSaved((s) => (s ?? []).map((x) => (x.id === r.id ? { ...x, favorite: !r.favorite } : x)));
    } catch (e) { setError((e as Error).message); }
  };
  const removeEvent = async (e: RecipeEvent) => {
    if (!userId) return;
    try { await deleteEvent(userId, e.id); setEvents((list) => (list ?? []).filter((x) => x.id !== e.id)); } catch (err) { setError((err as Error).message); }
  };

  const savedShown = useMemo(() => (tab === 'favorites' ? favorites : saved ?? [])
    .filter((r) => !q || r.title.toLowerCase().includes(q)), [tab, saved, favorites, q]);
  const historyShown = (events ?? []).filter((e) => e.kind === tab && (!q || e.recipe_name.toLowerCase().includes(q)));
  const browseShown = (catalog ?? []).filter((r) => (category === 'All' || r.category === category) && (!q || r.name.toLowerCase().includes(q)));
  const total = (saved?.length ?? 0) + count('generated');

  return (
    <>
      <PageHeader title="My" accent="Recipes" icon={BookOpen} subtitle="Your saved recipes, generated meals and cooking history in one place."
        actions={<Link to="/select" className="btn-primary"><Plus size={18} />Generate New Recipe</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Bookmark} value={saved?.length ?? '–'} label="Saved Recipes" />
        <StatCard icon={Zap} value={events ? count('generated') : '–'} label="Generated" tone="amber" />
        <StatCard icon={CookingPot} value={events ? count('cooked') : '–'} label="Cooked Recipes" tone="green" />
        <StatCard icon={Heart} value={saved ? favorites.length : '–'} label="Favorites" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div role="tablist" aria-label="Recipe lists" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className="pill"
                onClick={() => setParams(t.key === 'saved' ? {} : { tab: t.key })}>{t.label}</button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SearchBox value={query} onChange={setQuery} label="Search your recipes" placeholder="Search your recipes (e.g., karahi, biryani...)" />
            {tab === 'browse' && (
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                {['All', ...new Set((catalog ?? []).map((r) => r.category))].map((c) => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
              </select>
            )}
          </div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-4" role="tabpanel">
            {(tab === 'saved' || tab === 'favorites') && (saved === null ? <Spinner /> : savedShown.length === 0 ? (
              <Card><EmptyState icon={Bookmark} title={tab === 'favorites' ? 'No favorites yet' : 'No saved recipes yet'}>
                {tab === 'favorites' ? 'Tap the heart on a saved recipe.' : <><Link to="/select" className="font-semibold text-crimson underline">Find a recipe</Link> and press “Add to My Recipes”.</>}
              </EmptyState></Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Saved dishes">
                {savedShown.map((r) => <SavedCard key={r.id} r={r} onDelete={() => remove(r)} onFavorite={() => toggleFavorite(r)} />)}
              </ul>
            ))}
            {(tab === 'generated' || tab === 'cooked' || tab === 'viewed') && (events === null ? <Spinner /> : historyShown.length === 0 ? (
              <Card><EmptyState icon={ChefHat} title="Nothing here yet">Your {tab} recipes will appear here.</EmptyState></Card>
            ) : (
              <Card>
                <ul className="divide-y divide-stone-100">
                  {historyShown.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span><strong>{e.recipe_name}</strong>{e.match_percent !== null && <span className="badge badge-green ml-2">{e.match_percent}% match</span>}
                        {e.ingredients.length > 0 && <span className="block text-xs text-stone-500">With {e.ingredients.join(', ')}</span>}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">{formatDate(e.created_at, true)}
                        {e.recipe_slug && <Link to={`/recipe/${e.recipe_slug}`} className="btn-sm btn-outline">View</Link>}
                        <button type="button" className="icon-btn" onClick={() => removeEvent(e)} aria-label={`Remove ${e.recipe_name} from history`}><Trash2 size={15} /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            {tab === 'browse' && (catalog === null ? <Spinner /> : browseShown.length === 0 ? (
              <Card><EmptyState title="No recipes match" /></Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {browseShown.map((r) => (
                  <li key={r.slug} className="card p-3">
                    <Link to={`/recipe/${r.slug}`}>
                      <DishArt category={r.category} imageUrl={r.image_url} name={r.name} className="h-28" />
                      <p className="mt-2 font-display text-lg font-bold">{r.name}</p>
                      <p className="text-xs text-stone-600">{r.category} · {r.minutes} min · {r.servings} servings</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card title="Recipe Statistics" icon={BarChart3}>
            <div className="flex items-center gap-4">
              <Donut size={110} label="Recipe activity" center={<span><span className="block font-display text-2xl font-extrabold">{total}</span><span className="text-[11px]">Total</span></span>}
                parts={[{ value: saved?.length ?? 0, color: '#c81e3a', label: 'Saved' }, { value: count('generated'), color: '#f59e0b', label: 'Generated' }, { value: count('cooked'), color: '#16a34a', label: 'Cooked' }]} />
              <ul className="space-y-1 text-sm">
                <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-[#c81e3a]" />Saved {saved?.length ?? 0}</li>
                <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-[#f59e0b]" />Generated {count('generated')}</li>
                <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-[#16a34a]" />Cooked {count('cooked')}</li>
              </ul>
            </div>
          </Card>
          <Card title="Recently Cooked" icon={CookingPot}>
            {(events ?? []).filter((e) => e.kind === 'cooked').slice(0, 4).map((e) => (
              <p key={e.id} className="flex justify-between border-b border-stone-100 py-2 text-sm last:border-0"><span className="font-semibold">{e.recipe_name}</span><span className="text-xs text-stone-500">{formatDate(e.created_at)}</span></p>
            ))}
            {count('cooked') === 0 && <p className="text-sm text-stone-500">Finish every step of a recipe to log it as cooked.</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
