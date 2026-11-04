import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChefHat, ChevronRight, LayoutGrid, List, PlusCircle, Plus, Refrigerator, Search, ShieldAlert, Sparkles, Trash2, XCircle, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { CategoryIcon, IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { Card, Donut, Modal, PageHeader, SearchBox, StatCard } from '../components/ui';
import { fetchCuratedRecommendations, type CuratedMatch } from '../lib/curatedApi';
import { recipeImage } from '../lib/images';
import { useSelection } from '../lib/selection';
import { isIngredientBlocked, type Preferences } from '../lib/preferences';
import { loadPreferences } from '../lib/preferencesApi';
import {
  loadCatalog, loadPantry, parseGrams, removePantryItem, setPantryItem,
  type Ingredient, type PantryItem,
} from '../lib/pantryApi';

const DEFAULT_GRAMS = '250';
export const LOW_STOCK_G = 100;
// Pantry staples never drive a recipe search on their own.
// Display categories first; the old names still work for a database that hasn't run migration 0006 yet.
const MAIN_CATEGORIES = ['Meat & Poultry', 'Fish & Seafood', 'Meat', 'Vegetables', 'Pulses & Lentils', 'Pulses & Nuts', 'Dairy & Eggs', 'Dairy',
  'Grains & Flours', 'Grocery', 'Fruits'];
export const stockStatus = (grams: number) => (grams <= 0 ? 'out' : grams < LOW_STOCK_G ? 'low' : 'in');
const STATUS_LABEL = { in: 'In Stock', low: 'Low Stock', out: 'Out of Stock' } as const;
const STATUS_BADGE = { in: 'badge-green', low: 'badge-amber', out: 'badge-red' } as const;
const short = (name: string) => name.replace(/\s*\(.*\)$/, '');

function QuantityEditor({ grams, onSave, label }: { grams: number; onSave: (g: number) => Promise<void>; label: string }) {
  const [text, setText] = useState(String(grams));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(String(grams)), [grams]);

  const commit = async () => {
    const value = parseGrams(text);
    setInvalid(value === null);
    if (value !== null && value !== grams) await onSave(value);
  };

  return (
    <span className="flex items-center gap-0.5 text-[0.85rem] text-stone-700">
      <input className="w-12 rounded border border-transparent bg-transparent px-0.5 text-[0.85rem] outline-none hover:border-stone-200 focus:border-crimson focus:bg-white" inputMode="numeric" value={text} aria-invalid={invalid} aria-label={label}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      g
    </span>
  );
}

export function PantryPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [grams, setGrams] = useState(DEFAULT_GRAMS);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [filter, setFilter] = useState('');
  const [shelf, setShelf] = useState('All');
  const [sort, setSort] = useState<'az' | 'za'>('az');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [adding, setAdding] = useState(false);
  const [ideas, setIdeas] = useState<CuratedMatch[]>([]);
  const navigate = useNavigate();
  const selection = useSelection();

  useEffect(() => {
    if (!userId) return;
    Promise.all([loadCatalog(), loadPantry(userId), loadPreferences(userId)])
      .then(([c, p, pr]) => { setCatalog(c); setPantry(p); setPrefs(pr); })
      .catch((e: Error) => { setCatalog([]); setError(e.message); });
  }, [userId]);

  const byId = useMemo(() => new Map((catalog ?? []).map((i) => [i.id, i])), [catalog]);
  const categories = useMemo(() => ['All', ...[...new Set((catalog ?? []).map((i) => i.category))].sort()], [catalog]);
  const inPantry = useMemo(() => new Set(pantry.map((p) => p.ingredientId)), [pantry]);
  const blocked = (i: Ingredient) => (prefs ? isIngredientBlocked(i.name, i.allergens, prefs) : false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && category === 'All') return [];
    return (catalog ?? [])
      .filter((i) => (category === 'All' || i.category === category) && i.name.toLowerCase().includes(q) && !inPantry.has(i.id))
      .slice(0, 24);
  }, [catalog, query, category, inPantry]);

  // Main pantry items, safe for this cook, in the order a recipe search should use them.
  const mainNames = useMemo(() => pantry.map((p) => byId.get(p.ingredientId)).filter((i): i is Ingredient => Boolean(i) && MAIN_CATEGORIES.includes(i!.category) && !(prefs && isIngredientBlocked(i!.name, i!.allergens, prefs)))
    .sort((a, b) => MAIN_CATEGORIES.indexOf(a.category) - MAIN_CATEGORIES.indexOf(b.category)).slice(0, 8).map((i) => i.name), [pantry, byId, prefs]);
  const mainKey = mainNames.join('|');

  useEffect(() => {
    if (!token || !prefs || mainNames.length < 2) { setIdeas([]); return; }
    let live = true;
    fetchCuratedRecommendations(token, { ...selection.selection, ingredients: mainNames }, prefs, mainNames)
      .then((r) => { if (live) setIdeas(r.recipes.slice(0, 3)); })
      .catch(() => { if (live) setIdeas([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, prefs, mainKey]);

  if (!userId || catalog === null) return <FullPageSpinner />;

  const run = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); } catch (e) { setError((e as Error).message || 'Could not save. Try again.'); }
  };

  const add = (item: Ingredient) => run(async () => {
    const value = parseGrams(grams);
    if (value === null) throw new Error('Enter a quantity from 1 to 100,000 grams.');
    await setPantryItem(userId, item.id, value);
    setPantry((p) => [...p.filter((x) => x.ingredientId !== item.id), { ingredientId: item.id, quantityG: value }]);
  });

  const update = (id: number, value: number) => run(async () => {
    await setPantryItem(userId, id, value);
    setPantry((p) => p.map((x) => (x.ingredientId === id ? { ...x, quantityG: value } : x)));
  });

  const remove = (id: number) => run(async () => {
    await removePantryItem(userId, id);
    setPantry((p) => p.filter((x) => x.ingredientId !== id));
  });

  const onSearch = (e: FormEvent) => e.preventDefault();

  const items = pantry.flatMap((p) => { const item = byId.get(p.ingredientId); return item ? [{ item, grams: p.quantityG }] : []; });
  const fq = filter.trim().toLowerCase();
  const shown = items
    .filter((r) => (shelf === 'All' || r.item.category === shelf) && (status === 'all' || stockStatus(r.grams) === status) && (!fq || r.item.name.toLowerCase().includes(fq)))
    .sort((a, b) => (sort === 'az' ? 1 : -1) * a.item.name.localeCompare(b.item.name));
  const count = (s: 'in' | 'low' | 'out') => pantry.filter((p) => stockStatus(p.quantityG) === s).length;
  const pct = (n: number) => (pantry.length ? Math.round((n / pantry.length) * 100) : 0);
  const overview = [{ key: 'in', label: 'In Stock', color: '#16a34a' }, { key: 'low', label: 'Low Stock', color: '#f59e0b' }, { key: 'out', label: 'Out of Stock', color: '#dc2626' }] as const;

  // "Recipe ideas from your pantry": main pantry items become the selection.
  const cookWithPantry = () => {
    if (mainNames.length < 2) { setError('Add at least 2 main ingredients (meat, vegetables, daal…) to get pantry recipe ideas.'); return; }
    selection.setIngredients(mainNames);
    navigate('/recommendations');
  };
  const quickActions = [
    { icon: PlusCircle, label: 'Add Ingredient', onClick: () => setAdding(true) },
    { icon: AlertTriangle, label: 'Show Low Stock', onClick: () => { setStatus('low'); setShelf('All'); } },
    { icon: LayoutGrid, label: 'Show All Items', onClick: () => { setStatus('all'); setShelf('All'); setFilter(''); } },
    { icon: ChefHat, label: 'Cook With My Pantry', onClick: cookWithPantry },
  ];

  return (
    <div className="tight-page">
    <PageHeader title="My" accent="Pantry" icon={Refrigerator} subtitle="Keep track of your ingredients, quantities, and get recipe ideas based on what you have." />
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <StatCard icon={Refrigerator} value={pantry.length} label="Total Items" />
          <StatCard icon={CheckCircle2} value={count('in')} label="In Stock" tone="green" />
          <StatCard icon={AlertTriangle} value={count('low')} label="Low Stock" tone="amber" />
          <StatCard icon={XCircle} value={count('out')} label="Out of Stock" />
          <button type="button" className="btn-primary self-center whitespace-nowrap" onClick={() => setAdding(true)}><Plus size={18} />Add Ingredient</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={filter} onChange={setFilter} label="Filter your pantry" placeholder="Find in your pantry (e.g., chicken, tomato, rice...)" />
          <select className="select" value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="Pantry category">
            {categories.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Stock status">
            <option value="all">All Status</option><option value="in">In Stock</option><option value="low">Low Stock</option><option value="out">Out of Stock</option>
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="az">Sort: A – Z</option><option value="za">Sort: Z – A</option>
          </select>
        </div>
        {error && !adding && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <Card title="Ingredient Categories">
            <ul className="flex flex-wrap lg:flex-col">
              {categories.filter((c) => c === 'All' || items.some((r) => r.item.category === c)).map((c) => (
                <li key={c} className="w-full min-w-0"><button type="button" aria-pressed={shelf === c} onClick={() => setShelf(c)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[0.88rem] font-medium ${shelf === c ? 'bg-rose-100/80 font-semibold' : 'hover:bg-rose-50'}`}>
                  {c === 'All' ? <LayoutGrid size={20} className="text-crimson" aria-hidden="true" /> : <CategoryIcon category={c} size={20} />}
                  <span className="min-w-0 flex-1 truncate" title={c}>{c === 'All' ? 'All Items' : c}</span>
                  <span className="text-[0.82rem]">({c === 'All' ? items.length : items.filter((r) => r.item.category === c).length})</span>
                </button></li>
              ))}
            </ul>
          </Card>

          <Card title="Your Pantry Items" icon={Refrigerator} action={
            <div className="flex rounded-full bg-white/80 p-0.5 shadow-sm">
              <button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`rounded-full px-3 py-1 ${view === 'grid' ? 'bg-crimson text-white' : ''}`}><LayoutGrid size={18} /></button>
              <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`rounded-full px-3 py-1 ${view === 'list' ? 'bg-crimson text-white' : ''}`}><List size={18} /></button>
            </div>}>
            <p className="-mt-1 mb-2 text-[0.82rem] text-stone-600">{pantry.length === 0 ? 'Add what you have at home, in grams.' : `${pantry.length} item${pantry.length === 1 ? '' : 's'} at home`}</p>
            {shown.length === 0 && pantry.length > 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">No pantry items match this filter.</p>
            ) : shown.length === 0 ? (
              <p className="rounded-[24px] border border-dashed border-stone-300 p-6 text-center text-stone-500">Your pantry is empty. Choose “Add Ingredient” to start.</p>
            ) : (
              <ul className={view === 'grid' ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5' : 'divide-y divide-stone-100'}>
                {shown.map(({ item, grams: g }) => {
                  const s = stockStatus(g);
                  const removeBtn = (
                    <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name}`} className="grid h-6 w-6 place-items-center rounded-full bg-white text-crimson shadow-sm hover:bg-rose-50"><Trash2 size={13} /></button>
                  );
                  return view === 'grid' ? (
                    <li key={item.id} className="relative rounded-2xl border border-white/90 bg-white/75 p-2 shadow-sm">
                      <span className="absolute right-1.5 top-1.5 z-10">{removeBtn}</span>
                      <span className="flex justify-center"><IngredientBadge name={item.name} category={item.category} size={84} /></span>
                      <p className="mt-0.5 truncate text-[0.95rem] font-semibold leading-tight" title={item.name}>{short(item.name)}</p>
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <QuantityEditor grams={g} label={`${item.name} grams`} onSave={(v) => update(item.id, v)} />
                        {blocked(item) ? <span className="badge badge-amber"><ShieldAlert size={12} />Blocked</span> : <span className={`badge ${STATUS_BADGE[s]} whitespace-nowrap`}>{STATUS_LABEL[s]}</span>}
                      </div>
                    </li>
                  ) : (
                    <li key={item.id} className="flex items-center gap-3 py-1.5">
                      <IngredientBadge name={item.name} category={item.category} size={40} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                      {blocked(item) && <span className="badge badge-amber"><ShieldAlert size={12} />Blocked</span>}
                      <span className={`badge ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}</span>
                      <QuantityEditor grams={g} label={`${item.name} grams`} onSave={(v) => update(item.id, v)} />
                      {removeBtn}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <Card title="Pantry Overview" icon={Refrigerator}>
          <div className="flex items-center gap-4">
            <Donut size={124} label="Pantry stock" parts={overview.map((o) => ({ value: count(o.key), color: o.color, label: o.label }))}
              center={<span><span className="block text-xl font-bold">{pct(count('in'))}%</span><span className="text-sm">In Stock</span></span>} />
            <ul className="min-w-0 flex-1 space-y-2 text-[0.88rem]">
              {overview.map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-sm" style={{ background: o.color }} />{o.label} ({count(o.key)})</span><strong>{pct(count(o.key))}%</strong></li>
              ))}
            </ul>
          </div>
        </Card>
        <Card title="Quick Actions" icon={Zap}>
          <ul className="divide-y divide-stone-100">
            {quickActions.map(({ icon: Icon, label, onClick }) => (
              <li key={label}><button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-2 text-left text-[0.95rem] font-semibold hover:text-crimson">
                <Icon size={20} className="text-crimson" aria-hidden="true" /><span className="flex-1">{label}</span><ChevronRight size={18} aria-hidden="true" /></button></li>
            ))}
          </ul>
        </Card>
        <Card title="Recipe Ideas from Your Pantry" icon={ChefHat}>
          <p className="-mt-2 mb-2 text-[0.86rem]">Based on ingredients you have right now.</p>
          {ideas.length === 0 ? <p className="text-sm text-stone-500">Add at least 2 main ingredients to see ideas here.</p> : (
            <ul className="grid grid-cols-3 gap-2">
              {ideas.map((r) => (
                <li key={r.slug} className="min-w-0"><Link to={`/recipe/${r.slug}`} state={{ match: r }} className="block overflow-hidden rounded-xl bg-white/75 shadow-sm">
                  <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} rounded="rounded-t-xl">
                    <span className="badge badge-green absolute right-1 top-1 whitespace-nowrap">{r.match_percent}% Match</span>
                  </RecipeCardImage>
                  <span className="block px-1.5 py-1 text-[0.86rem] font-semibold leading-tight">{r.name}</span></Link></li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-primary mt-3 w-full" onClick={cookWithPantry}>View All Recipe Ideas<ArrowRight size={16} /></button>
        </Card>
      </aside>
    </div>

    <Modal open={adding} title="Add Ingredient" onClose={() => setAdding(false)}>
      <form onSubmit={onSearch} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search ingredients</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="field pl-10" placeholder="Search e.g. chicken, daal, palak" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </form>
      <div className="mt-3 flex items-center gap-2 text-sm text-stone-600">
        <span aria-hidden="true">Quantity to add</span>
        <input className="field w-24 py-1.5 text-right" inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value)} aria-label="Quantity to add in grams" />
        g
      </div>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <ul className="mt-4 space-y-2" aria-label="Search results">
        {results.map((item) => {
          const isBlocked = blocked(item);
          return (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2">
              <IngredientBadge name={item.name} category={item.category} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.name}</span>
                <span className="text-xs text-stone-500">{isBlocked ? 'Blocked by your allergen shield' : `${item.category} · ${Math.round(item.kcal)} kcal / 100 g`}</span>
              </span>
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={isBlocked} onClick={() => add(item)} aria-label={`Add ${item.name}`}>
                <Plus size={16} />Add
              </button>
            </li>
          );
        })}
        {(query.trim() || category !== 'All') && results.length === 0 && <li className="text-sm text-stone-500">No matching ingredients.</li>}
      </ul>
      <p className="mt-4 flex items-center gap-1 text-xs text-stone-500"><Sparkles size={13} aria-hidden="true" />Quantities are in grams (1,000 g = 1 kg). Recipes use them to show what you still need to buy.</p>
    </Modal>
    </div>
  );
}
