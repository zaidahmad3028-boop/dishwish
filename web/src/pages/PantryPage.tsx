import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChefHat, Package, Plus, Refrigerator, Search, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { IngredientBadge } from '../components/DishArt';
import { PageHeader, StatCard } from '../components/ui';
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
const MAIN_CATEGORIES = ['Meat', 'Vegetables', 'Pulses & Nuts', 'Dairy', 'Grocery', 'Fruits'];
export const stockStatus = (grams: number) => (grams <= 0 ? 'out' : grams < LOW_STOCK_G ? 'low' : 'in');

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
    <span className="flex items-center gap-1.5 text-sm text-stone-500">
      <input className="field w-24 py-1.5 text-right" inputMode="numeric" value={text} aria-invalid={invalid} aria-label={label}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      g
    </span>
  );
}

export function PantryPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [grams, setGrams] = useState(DEFAULT_GRAMS);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | 'in' | 'low'>('all');
  const [filter, setFilter] = useState('');
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

  const grouped = new Map<string, { item: Ingredient; grams: number }[]>();
  for (const p of pantry) {
    const item = byId.get(p.ingredientId);
    if (!item) continue;
    grouped.set(item.category, [...(grouped.get(item.category) ?? []), { item, grams: p.quantityG }]);
  }
  const fq = filter.trim().toLowerCase();
  const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, rows]) => [cat, rows.filter((r) => (status === 'all' || stockStatus(r.grams) === status) && (!fq || r.item.name.toLowerCase().includes(fq)))] as const)
    .filter(([, rows]) => rows.length > 0);
  const lowCount = pantry.filter((p) => stockStatus(p.quantityG) === 'low').length;

  // "Recipe ideas from your pantry": main pantry items become the selection.
  const cookWithPantry = () => {
    const names = pantry.map((p) => byId.get(p.ingredientId)).filter((i): i is Ingredient => Boolean(i) && MAIN_CATEGORIES.includes(i!.category) && !blocked(i!))
      .sort((a, b) => MAIN_CATEGORIES.indexOf(a.category) - MAIN_CATEGORIES.indexOf(b.category)).slice(0, 8).map((i) => i.name);
    if (names.length < 2) { setError('Add at least 2 main ingredients (meat, vegetables, daal…) to get pantry recipe ideas.'); return; }
    selection.setIngredients(names);
    navigate('/recommendations');
  };

  return (
    <>
    <PageHeader title="My" accent="Pantry" icon={Refrigerator} subtitle="Keep track of your ingredients and quantities, and get recipe ideas from what you have." />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Package} value={pantry.length} label="Total Items" />
      <StatCard icon={CheckCircle2} value={pantry.length - lowCount} label="In Stock" tone="green" />
      <StatCard icon={AlertTriangle} value={lowCount} label={`Low Stock (< ${LOW_STOCK_G} g)`} tone="amber" />
      <button type="button" onClick={cookWithPantry} className="card flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-crimson to-ember text-white"><ChefHat size={24} /></span>
        <span><span className="block font-display text-lg font-bold">Recipe ideas</span><span className="text-sm text-stone-600">Cook with my pantry</span></span>
      </button>
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="card p-6 sm:p-8" aria-label="Your pantry items">
        <h2 className="card-title"><Sparkles size={20} className="text-crimson" />Your Pantry Items</h2>
        <p className="mt-1 text-stone-600">{pantry.length === 0 ? 'Add what you have at home, in grams.' : `${pantry.length} item${pantry.length === 1 ? '' : 's'} at home`}</p>
        {pantry.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Filter your pantry</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="field py-2 pl-9" placeholder="Filter your pantry" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Stock status">
              <option value="all">All Status</option><option value="in">In Stock</option><option value="low">Low Stock</option>
            </select>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        {groups.length === 0 && pantry.length > 0 ? (
          <p className="mt-6 text-center text-sm text-stone-500">No pantry items match this filter.</p>
        ) : groups.length === 0 ? (
          <p className="mt-8 rounded-[24px] border border-dashed border-stone-300 p-6 text-center text-stone-500">Your pantry is empty. Search for an ingredient to add it.</p>
        ) : (
          <div className="mt-6 space-y-5">
            {groups.map(([cat, rows]) => (
              <div key={cat}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">{cat}</h2>
                <ul className="mt-2 divide-y divide-stone-200/70 rounded-2xl bg-white/60">
                  {rows.sort((a, b) => a.item.name.localeCompare(b.item.name)).map(({ item, grams: g }) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <IngredientBadge name={item.name} category={item.category} size={32} />
                      <span className="min-w-0 flex-1 font-medium">
                        {item.name}
                        <span className={`badge ml-2 ${stockStatus(g) === 'low' ? 'badge-amber' : 'badge-green'}`}>{stockStatus(g) === 'low' ? 'Low Stock' : 'In Stock'}</span>
                        {blocked(item) && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"><ShieldAlert size={12} />Blocked</span>}
                      </span>
                      <QuantityEditor grams={g} label={`${item.name} grams`} onSave={(v) => update(item.id, v)} />
                      <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name}`}
                        className="grid h-9 w-9 place-items-center rounded-xl text-stone-500 hover:bg-rose-50 hover:text-rose-700">
                        <Trash2 size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card h-fit p-6 sm:p-8">
        <h2 className="card-title"><Plus size={20} className="text-crimson" />Add Ingredient</h2>
        <form onSubmit={onSearch} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
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

        <ul className="mt-4 space-y-2" aria-label="Search results">
          {results.map((item) => {
            const isBlocked = blocked(item);
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.name}</span>
                  <span className="text-xs text-stone-500">{isBlocked ? 'Blocked by your allergen shield' : `${item.category} · ${Math.round(item.kcal)} kcal / 100 g`}</span>
                </span>
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={isBlocked} onClick={() => add(item)}
                  aria-label={`Add ${item.name}`}>
                  <Plus size={16} />Add
                </button>
              </li>
            );
          })}
          {(query.trim() || category !== 'All') && results.length === 0 && <li className="text-sm text-stone-500">No matching ingredients.</li>}
        </ul>
        <p className="mt-4 text-xs text-stone-500">Quantities are in grams (1,000 g = 1 kg). Recipes use them to show what you still need to buy.</p>
      </section>
    </div>
    </>
  );
}
