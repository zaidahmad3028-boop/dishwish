import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BarChart3, Bookmark, BookOpen, CalendarDays, CheckCircle2, ChefHat, ChevronRight, Clock, CookingPot, Eye, Heart, LayoutGrid, Plus, Trash2, Users, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { RecipeCardImage } from '../components/DishArt';
import { recipeImage } from '../lib/images';
import { Card, Donut, EmptyState, ErrorNote, PageHeader, SearchBox, Spinner, StatCard, formatDate } from '../components/ui';
import { deleteEvent, isCuratedSnapshot, listCuratedRecipes, listEvents, setFavorite, type CuratedSummary, type EventKind, type RecipeEvent } from '../lib/curatedApi';
import { deleteSavedRecipe, isGenerated, listSavedRecipes, type SavedRecipe } from '../lib/recipesApi';

type Tab = 'saved' | 'favorites' | 'generated' | 'cooked' | 'viewed' | 'browse';
const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'saved', label: 'Saved', icon: Bookmark }, { key: 'favorites', label: 'Favorites', icon: Heart }, { key: 'cooked', label: 'Cooked', icon: CookingPot },
  { key: 'generated', label: 'Generated', icon: Zap }, { key: 'viewed', label: 'Viewed', icon: Eye }, { key: 'browse', label: 'Browse All', icon: LayoutGrid },
];
const EVENT_BADGE: Record<string, string> = { generated: 'badge-purple', cooked: 'badge-green', viewed: 'badge-blue' };
const SOFT_BADGE = 'absolute left-2 top-2 !text-[0.84rem]';

function savedLink(r: SavedRecipe) {
  return isCuratedSnapshot(r.recipe) ? `/recipe/${r.recipe.slug}` : `/recipes/${r.id}`;
}

function CardMeta({ minutes, servings }: { minutes: number; servings: number }) {
  return (
    <p className="mt-1 flex flex-wrap gap-4 text-[0.88rem]">
      <span className="inline-flex items-center gap-1"><Clock size={16} className="text-crimson" aria-hidden="true" />{minutes} min</span>
      <span className="inline-flex items-center gap-1"><Users size={16} className="text-crimson" aria-hidden="true" />{servings} servings</span>
    </p>
  );
}

function SavedCard({ r, onDelete, onFavorite }: { r: SavedRecipe; onDelete: () => void; onFavorite: () => void }) {
  const curated = isCuratedSnapshot(r.recipe);
  const minutes = r.recipe.minutes, servings = r.recipe.servings;
  const category = curated ? (r.recipe as { category: string }).category : 'Main Course';
  return (
    <li className="card flex flex-col overflow-hidden p-0">
      <RecipeCardImage category={category} imageUrl={curated ? recipeImage((r.recipe as { slug: string }).slug) : null} name={r.title} height="h-36">
        <span className={`badge ${SOFT_BADGE} ${curated ? 'badge-red' : 'badge-purple'}`}>{curated ? 'Saved' : 'Generated'}</span>
        <button type="button" onClick={onFavorite} aria-pressed={r.favorite ?? false} aria-label={`${r.favorite ? 'Remove' : 'Add'} ${r.title} ${r.favorite ? 'from' : 'to'} favorites`}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow">
          <Heart size={18} className={r.favorite ? 'fill-crimson text-crimson' : 'text-crimson'} />
        </button>
      </RecipeCardImage>
      <div className="flex flex-1 flex-col p-3">
        <Link to={savedLink(r)} className="truncate font-display text-[1.15rem] font-bold hover:text-crimson" title={r.title}>{r.title}</Link>
        <CardMeta minutes={minutes} servings={servings} />
        {isGenerated(r.recipe) && <p className="mt-1 text-xs text-stone-600">{r.recipe.nutrition.per_serving.kcal} kcal per serving</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          <Link to={savedLink(r)} className="btn-sm btn-red">View Recipe<ArrowRight size={14} /></Link>
          <button type="button" className="icon-btn bg-white shadow-sm" onClick={onDelete} aria-label={`Delete ${r.title}`}><Trash2 size={16} /></button>
        </div>
      </div>
    </li>
  );
}

function EventCard({ e, onRemove }: { e: RecipeEvent; onRemove: () => void }) {
  const label = e.kind === 'cooked' ? 'Cooked' : e.kind === 'generated' ? 'Generated' : 'Viewed';
  return (
    <li className="card flex flex-col overflow-hidden p-0">
      <RecipeCardImage category="" imageUrl={e.recipe_slug ? recipeImage(e.recipe_slug) : null} name={e.recipe_name} height="h-36">
        <span className={`badge ${SOFT_BADGE} ${EVENT_BADGE[e.kind] ?? 'badge-gray'}`}>{label}{e.kind === 'cooked' && <CheckCircle2 size={14} />}</span>
        {e.match_percent !== null && <span className="badge badge-green absolute right-2 top-2 !text-[0.84rem]">{e.match_percent}% Match</span>}
      </RecipeCardImage>
      <div className="flex flex-1 flex-col p-3">
        <p className="truncate font-display text-[1.15rem] font-bold" title={e.recipe_name}>{e.recipe_name}</p>
        <p className="mt-1 flex items-center gap-1 text-[0.86rem]"><CalendarDays size={15} className="text-crimson" aria-hidden="true" />{formatDate(e.created_at)}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          {e.recipe_slug ? <Link to={`/recipe/${e.recipe_slug}`} className="btn-sm btn-red">View Recipe<ArrowRight size={14} /></Link> : <span />}
          <button type="button" className="icon-btn bg-white shadow-sm" onClick={onRemove} aria-label={`Remove ${e.recipe_name} from history`}><Trash2 size={16} /></button>
        </div>
      </div>
    </li>
  );
}

const GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

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
    listCuratedRecipes().then(setCatalog).catch((e: Error) => { setCatalog([]); setError(e.message); });
  }, [userId]);

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
  const savedCount = saved?.length ?? 0;
  const total = savedCount + count('generated');
  const tabCount = (k: Tab) => k === 'saved' ? savedCount : k === 'favorites' ? favorites.length : k === 'browse' ? catalog?.length ?? 0 : count(k);
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '0%');
  const stats = [
    { label: 'Saved', value: savedCount, color: '#dc1029' }, { label: 'Cooked', value: count('cooked'), color: '#f59e0b' }, { label: 'Generated', value: count('generated'), color: '#fda4af' },
  ];
  // Three biggest recipe groups, each opening "Browse All" on that category.
  const groups = [...new Set((catalog ?? []).map((r) => r.category))]
    .map((c) => ({ name: c, items: (catalog ?? []).filter((r) => r.category === c) })).sort((a, b) => b.items.length - a.items.length).slice(0, 3);

  return (
    <div className="tight-page">
      <PageHeader title="My" accent="Recipes" icon={BookOpen} subtitle="Your saved recipes, generated meals and cooking history in one place." />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <StatCard icon={Bookmark} value={saved?.length ?? '–'} label="Saved Recipes" />
            <StatCard icon={Zap} value={events ? count('generated') : '–'} label="Generated Recipes" tone="amber" />
            <StatCard icon={CookingPot} value={events ? count('cooked') : '–'} label="Cooked Recipes" tone="amber" />
            <StatCard icon={Heart} value={saved ? favorites.length : '–'} label="Favorites" />
            <Link to="/select" className="btn-primary self-center whitespace-nowrap"><Plus size={18} />Generate New Recipe</Link>
          </div>
          <div role="tablist" aria-label="Recipe lists" className="mt-3 flex flex-wrap gap-2">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className="pill !px-4 !py-1.5"
                onClick={() => setParams(key === 'saved' ? {} : { tab: key })}><Icon size={18} aria-hidden="true" />{label} ({tabCount(key)})</button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SearchBox value={query} onChange={setQuery} label="Search your recipes" placeholder="Search your recipes (e.g., chicken, biryani...)" />
            {tab === 'browse' && (
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                {['All', ...new Set((catalog ?? []).map((r) => r.category))].map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
              </select>
            )}
          </div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-3" role="tabpanel">
            {(tab === 'saved' || tab === 'favorites') && (saved === null ? <Spinner /> : savedShown.length === 0 ? (
              <Card><EmptyState icon={Bookmark} title={tab === 'favorites' ? 'No favorites yet' : 'No saved recipes yet'}>
                {tab === 'favorites' ? 'Tap the heart on a saved recipe.' : <><Link to="/select" className="font-semibold text-crimson underline">Find a recipe</Link> and press “Add to My Recipes”.</>}
              </EmptyState></Card>
            ) : (
              <ul className={GRID} aria-label="Saved dishes">
                {savedShown.map((r) => <SavedCard key={r.id} r={r} onDelete={() => remove(r)} onFavorite={() => toggleFavorite(r)} />)}
              </ul>
            ))}
            {(tab === 'generated' || tab === 'cooked' || tab === 'viewed') && (events === null ? <Spinner /> : historyShown.length === 0 ? (
              <Card><EmptyState icon={ChefHat} title="Nothing here yet">Your {tab} recipes will appear here.</EmptyState></Card>
            ) : (
              <ul className={GRID}>{historyShown.map((e) => <EventCard key={e.id} e={e} onRemove={() => removeEvent(e)} />)}</ul>
            ))}
            {tab === 'browse' && (catalog === null ? <Spinner /> : browseShown.length === 0 ? (
              <Card><EmptyState title="No recipes match" /></Card>
            ) : (
              <ul className={GRID}>
                {browseShown.map((r) => (
                  <li key={r.slug} className="card flex flex-col overflow-hidden p-0">
                    <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} height="h-36" />
                    <div className="flex flex-1 flex-col p-3">
                      <p className="truncate font-display text-[1.15rem] font-bold" title={r.name}>{r.name}</p>
                      <CardMeta minutes={r.minutes} servings={r.servings} />
                      <div className="mt-auto pt-2"><Link to={`/recipe/${r.slug}`} className="btn-sm btn-red">View Recipe<ArrowRight size={14} /></Link></div>
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card title="Recipe Statistics" icon={BarChart3}>
            <div className="flex items-center gap-4">
              <Donut size={124} label="Recipe activity" center={<span><span className="block text-2xl font-bold">{total}</span><span className="text-[0.76rem]">Total Recipes</span></span>}
                parts={stats.map((s) => ({ value: s.value, color: s.color, label: s.label }))} />
              <ul className="min-w-0 flex-1 space-y-2 text-[0.92rem]">
                {stats.map((s) => <li key={s.label} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-sm" style={{ background: s.color }} />{s.label}</span><strong>{s.value} ({share(s.value)})</strong></li>)}
              </ul>
            </div>
          </Card>
          <Card title="Recently Cooked" icon={CookingPot} action={<button type="button" onClick={() => setParams({ tab: 'cooked' })} className="pill !px-3 !py-1 !text-[0.82rem]">View All<ArrowRight size={14} /></button>}>
            <ul className="divide-y divide-stone-100">
              {(events ?? []).filter((e) => e.kind === 'cooked').slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-20 shrink-0"><RecipeCardImage category="" imageUrl={e.recipe_slug ? recipeImage(e.recipe_slug) : null} name={e.recipe_name} height="h-12" rounded="rounded-lg" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate font-display">{e.recipe_name}</strong><span className="flex items-center gap-1 text-[0.84rem]"><CalendarDays size={14} className="text-crimson" aria-hidden="true" />{formatDate(e.created_at)}</span></span>
                  <CheckCircle2 size={20} className="shrink-0 text-green-600" aria-label="Cooked" />
                </li>
              ))}
            </ul>
            {events && count('cooked') === 0 && <p className="text-sm text-stone-500">Finish every step of a recipe to log it as cooked.</p>}
          </Card>
          <Card title="Browse Recipes" icon={BookOpen}>
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.name}><button type="button" onClick={() => { setCategory(g.name); setParams({ tab: 'browse' }); }} className="flex w-full items-center gap-3 rounded-2xl bg-white/75 p-2 text-left shadow-sm hover:bg-rose-50">
                  <span className="w-16 shrink-0"><RecipeCardImage category={g.name} imageUrl={recipeImage(g.items[0].slug, g.items[0].image_url)} name={g.name} height="h-10" rounded="rounded-lg" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate font-display">{g.name}</strong><span className="text-[0.84rem]">{g.items.length} recipes</span></span>
                  <ChevronRight size={18} className="text-crimson" aria-hidden="true" /></button></li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
