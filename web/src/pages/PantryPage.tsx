import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChefHat, ChevronRight, Ellipsis, Layers, LayoutGrid, List, Pencil, Plus, PlusCircle, Refrigerator, Search, ShieldAlert, Trash2, XCircle, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { CategoryIcon, IngredientBadge, IngredientHero, RecipeCardImage } from '../components/DishArt';
import { Card, Donut, Modal, PageHeader, SearchBox } from '../components/ui';
import { fetchCuratedRecommendations, type CuratedMatch } from '../lib/curatedApi';
import { useLiveTick } from '../lib/useLiveTick';

import { recipeImage } from '../lib/images';
import { useSelection } from '../lib/selection';
import { isIngredientBlocked, type Preferences } from '../lib/preferences';
import { loadPreferences } from '../lib/preferencesApi';
import {
  formatGrams, resetCatalogCache, loadCatalog, loadPantry, MAX_GRAMS, parseGrams, removePantryItem, setPantryItem,
  type Ingredient, type PantryItem,
} from '../lib/pantryApi';

const DEFAULT_QUANTITY = '250';
export const LOW_STOCK_G = 100;
// Pantry staples never drive a recipe search on their own.
// Display categories first; the old names still work for a database that hasn't run migration 0006 yet.
const MAIN_CATEGORIES = ['Meat & Poultry', 'Fish & Seafood', 'Meat', 'Vegetables', 'Pulses & Lentils', 'Pulses & Nuts', 'Dairy & Eggs', 'Dairy',
  'Grains & Flours', 'Grocery', 'Fruits'];
export const stockStatus = (grams: number) => (grams <= 0 ? 'out' : grams < LOW_STOCK_G ? 'low' : 'in');
type Stock = ReturnType<typeof stockStatus>;
const STATUS_LABEL: Record<Stock, string> = { in: 'In Stock', low: 'Low Stock', out: 'Out of Stock' };
const STATUS_BADGE: Record<Stock, string> = { in: 'bg-[#c6f6d0] text-green-800', low: 'bg-[#fde9a8] text-amber-900', out: 'bg-[#fbd0d0] text-red-800' };
const OVERVIEW = [{ key: 'in', label: 'In Stock', color: '#43b02a' }, { key: 'low', label: 'Low Stock', color: '#f9ab15' }, { key: 'out', label: 'Out of Stock', color: '#ed1c24' }] as const;
const short = (name: string) => name.replace(/\s*\(.*\)$/, '').replace(/^Chicken Breast$/, 'Chicken');

// The nine shelves of the pantry design. Only how they are grouped here changes; the catalog keeps its own categories.
export const SHELVES: { name: string; icon: string; categories: string[] }[] = [
  { name: 'Meat & Poultry', icon: 'Meat & Poultry', categories: ['Meat & Poultry', 'Fish & Seafood', 'Meat'] },
  { name: 'Vegetables', icon: 'Vegetables', categories: ['Vegetables'] },
  { name: 'Fruits', icon: 'Fruits', categories: ['Fruits'] },
  { name: 'Dairy', icon: 'Dairy & Eggs', categories: ['Dairy & Eggs', 'Dairy'] },
  { name: 'Grains & Cereals', icon: 'Grains & Flours', categories: ['Grains & Flours', 'Bakery & Baking', 'Grocery'] },
  { name: 'Spices & Herbs', icon: 'Fresh Herbs', categories: ['Spices & Masalas', 'Fresh Herbs', 'Spices'] },
  { name: 'Oils & Sauces', icon: 'Oils, Ghee & Sweeteners', categories: ['Oils, Ghee & Sweeteners', 'Sauces & Condiments', 'Oils & Sauces'] },
  { name: 'Others', icon: 'Pulses & Lentils', categories: [] },
];
const NAMED = new Set(SHELVES.flatMap((s) => s.categories));
export const shelfOf = (category: string) => SHELVES.find((s) => s.categories.includes(category))?.name ?? (NAMED.has(category) ? category : 'Others');

// Whole percentages that always add up to 100 (largest remainders get the spare points).
export function wholePercents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const result = exact.map(Math.floor);
  const spare = 100 - result.reduce((a, b) => a + b, 0);
  [...exact.keys()].sort((a, b) => (exact[b] - result[b]) - (exact[a] - result[a])).slice(0, spare).forEach((i) => { result[i] += 1; });
  return result;
}

// Text plus a g/kg unit -> grams, or null. Zero is only allowed when updating (it means "ran out").
export function toGrams(text: string, unit: 'g' | 'kg', allowZero = false): number | null {
  const trimmed = text.trim();
  if (allowZero && /^0+(\.0+)?$/.test(trimmed)) return 0;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const grams = Number(trimmed) * (unit === 'kg' ? 1000 : 1);
  return grams <= MAX_GRAMS ? parseGrams(String(grams)) : null;
}

function QuantityFields({ text, unit, onText, onUnit, label }: { text: string; unit: 'g' | 'kg'; onText: (v: string) => void; onUnit: (u: 'g' | 'kg') => void; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <input className="field w-28 py-1.5 text-right" inputMode="decimal" value={text} onChange={(e) => onText(e.target.value)} aria-label={label} />
      <select className="select" value={unit} onChange={(e) => onUnit(e.target.value as 'g' | 'kg')} aria-label={`${label} unit`}>
        <option value="g">g</option><option value="kg">kg</option>
      </select>
    </span>
  );
}

function PantryStat({ icon, value, label, onClick, active }: { icon: ReactNode; value: number; label: string; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={`Show ${label.toLowerCase()}`}
      className={`card flex h-[4.85rem] w-full items-center gap-3.5 px-4 text-left transition hover:-translate-y-0.5 ${active ? 'ring-1 ring-rose-300' : ''}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0"><strong className="block text-[1.6rem] font-bold leading-none tracking-tight">{value}</strong><span className="mt-1 block whitespace-nowrap text-[1rem] leading-tight tracking-tight">{label}</span></span>
    </button>
  );
}

function ItemMenu({ name, onUpdate, onRemove }: { name: string; onUpdate: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`Actions for ${name}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}
        className="grid h-[1.65rem] w-[1.65rem] place-items-center rounded-full bg-white text-crimson shadow-sm hover:bg-rose-50"><Ellipsis size={18} strokeWidth={3} aria-hidden="true" /></button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-20 mt-1 w-44 p-1 text-[0.88rem] font-medium">
          <button type="button" role="menuitem" aria-label={`Update quantity of ${name}`} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-rose-50" onClick={() => { setOpen(false); onUpdate(); }}><Pencil size={15} className="text-crimson" aria-hidden="true" />Update Quantity</button>
          <button type="button" role="menuitem" aria-label={`Remove ${name}`} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-crimson hover:bg-rose-50" onClick={() => { setOpen(false); onRemove(); }}><Trash2 size={15} aria-hidden="true" />Remove</button>
        </div>
      )}
    </div>
  );
}

const STARTER_NAMES = ['Chicken Breast', 'Onion', 'Tomato', 'Potato', 'Garlic', 'Ginger', 'Green Chilli', 'Basmati Rice',
  'Masoor Dal', 'Yogurt (Dahi)', 'Eggs', 'Cooking Oil'];
const STARTER_GRAMS = 500;

export function PantryPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [addText, setAddText] = useState(DEFAULT_QUANTITY);
  const [addUnit, setAddUnit] = useState<'g' | 'kg'>('g');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | Stock>('all');
  const [filter, setFilter] = useState('');
  const [shelf, setShelf] = useState('All');
  const [sort, setSort] = useState<'az' | 'za'>('az');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState<{ id: number | null; text: string; unit: 'g' | 'kg' } | null>(null);
  const [removing, setRemoving] = useState<{ id: number | null } | null>(null);
  const [shelvesOpen, setShelvesOpen] = useState(false);
  const [ideas, setIdeas] = useState<CuratedMatch[]>([]);
  const navigate = useNavigate();
  const selection = useSelection();
  const tick = useLiveTick(['pantry_items', 'preferences', 'ingredients']);

  useEffect(() => {
    if (!userId) return;
    if (tick) resetCatalogCache();
    Promise.all([loadCatalog(), loadPantry(userId), loadPreferences(userId)])
      .then(([c, p, pr]) => {
        const keep = <T,>(next: T) => (old: T | null) => (JSON.stringify(old) === JSON.stringify(next) ? (old as T) : next);
        setCatalog(keep(c)); setPantry(keep(p)); setPrefs(keep(pr));
      })
      .catch((e: Error) => { if (!tick) { setCatalog([]); setError(e.message); } });
  }, [userId, tick]);

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

  // Main pantry items actually in stock and safe for this cook, in the order a recipe search should use them.
  const mainNames = useMemo(() => pantry.filter((p) => p.quantityG > 0).map((p) => byId.get(p.ingredientId))
    .filter((i): i is Ingredient => Boolean(i) && MAIN_CATEGORIES.includes(i!.category) && !(prefs && isIngredientBlocked(i!.name, i!.allergens, prefs)))
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
    try { await action(); return true; } catch (e) { setError((e as Error).message || 'Could not save. Try again.'); return false; }
  };

  const add = (item: Ingredient) => run(async () => {
    const value = toGrams(addText, addUnit);
    if (value === null) throw new Error('Enter a quantity from 1 to 100,000 grams.');
    await setPantryItem(userId, item.id, value);
    setPantry((p) => [...p.filter((x) => x.ingredientId !== item.id), { ingredientId: item.id, quantityG: value }]);
  });

  const quickAdd = (item: Ingredient) => run(async () => {
    await setPantryItem(userId, item.id, STARTER_GRAMS);
    setPantry((p) => [...p.filter((x) => x.ingredientId !== item.id), { ingredientId: item.id, quantityG: STARTER_GRAMS }]);
  });
  // Common Pakistani kitchen staples from the real catalog (skipping anything the cook's allergies block).
  const starters = STARTER_NAMES.flatMap((n) => { const i = (catalog ?? []).find((c) => c.name === n); return i && !blocked(i) && !inPantry.has(i.id) ? [i] : []; });

  const saveUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!updating) return;
    const id = updating.id;
    const ok = await run(async () => {
      if (id === null) throw new Error('Choose an ingredient first.');
      const value = toGrams(updating.text, updating.unit, true);
      if (value === null) throw new Error('Enter a quantity from 0 to 100,000 grams.');
      await setPantryItem(userId, id, value);
      setPantry((p) => p.map((x) => (x.ingredientId === id ? { ...x, quantityG: value } : x)));
    });
    if (ok) setUpdating(null);
  };

  const confirmRemove = async () => {
    const id = removing?.id;
    if (id === null || id === undefined) { setError('Choose an ingredient first.'); return; }
    const ok = await run(async () => {
      await removePantryItem(userId, id);
      setPantry((p) => p.filter((x) => x.ingredientId !== id));
    });
    if (ok) setRemoving(null);
  };

  const onSearch = (e: FormEvent) => e.preventDefault();
  const openUpdate = (id: number | null, grams = 0) => {
    setError('');
    setUpdating({ id, text: id === null ? '' : grams >= 1000 ? String(grams / 1000) : String(grams), unit: grams >= 1000 ? 'kg' : 'g' });
  };

  const items = pantry.flatMap((p) => { const item = byId.get(p.ingredientId); return item ? [{ item, grams: p.quantityG }] : []; });
  const picker = [...items].sort((a, b) => a.item.name.localeCompare(b.item.name));
  const fq = filter.trim().toLowerCase();
  const shown = items
    .filter((r) => (shelf === 'All' || shelfOf(r.item.category) === shelf) && (status === 'all' || stockStatus(r.grams) === status) && (!fq || r.item.name.toLowerCase().includes(fq)))
    .sort((a, b) => (sort === 'az' ? 1 : -1) * a.item.name.localeCompare(b.item.name));
  const count = (s: Stock) => pantry.filter((p) => stockStatus(p.quantityG) === s).length;
  const shelfCount = (name: string) => items.filter((r) => shelfOf(r.item.category) === name).length;
  const percents = wholePercents(OVERVIEW.map((o) => count(o.key)));

  // "Recipe ideas from your pantry": main pantry items become the selection.
  const cookWithPantry = () => {
    if (mainNames.length < 2) { setError('Add at least 2 main ingredients (meat, vegetables, daal…) to get pantry recipe ideas.'); return; }
    selection.setIngredients(mainNames);
    navigate('/recommendations');
  };
  const quickActions = [
    { icon: PlusCircle, label: 'Add Ingredient', onClick: () => { setError(''); setAdding(true); } },
    { icon: Pencil, label: 'Update Quantity', onClick: () => openUpdate(null) },
    { icon: Trash2, label: 'Remove Ingredient', onClick: () => { setError(''); setRemoving({ id: null }); } },
    { icon: Layers, label: 'Manage Categories', onClick: () => setShelvesOpen(true) },
  ];
  const toggleStatus = (s: 'all' | Stock) => { setStatus((cur) => (s !== 'all' && cur === s ? 'all' : s)); if (s === 'all') { setShelf('All'); setFilter(''); } };
  const removingItem = removing?.id ? byId.get(removing.id) : undefined;
  const updatingItem = updating?.id ? byId.get(updating.id) : undefined;

  return (
    <div className="tight-page pantry-page">
    <PageHeader title="My" accent="Pantry" icon={Refrigerator} subtitle="Keep track of your ingredients, quantities, and get recipe ideas based on what you have." />
    <div className="grid gap-[1.05rem] xl:grid-cols-[minmax(0,1fr)_22.8rem]">
      <div className="min-w-0">
        <div className="grid items-center gap-3 sm:grid-cols-2 xl:grid-cols-[1.06fr_0.98fr_1fr_1.07fr_auto] xl:pl-[0.6rem] xl:pr-[0.6rem]">
          <PantryStat icon={<Refrigerator size={46} strokeWidth={1.8} className="text-crimson" aria-hidden="true" />} value={pantry.length} label="Total Items" active={false} onClick={() => toggleStatus('all')} />
          <PantryStat icon={<CheckCircle2 size={46} className="fill-green-600 text-white" aria-hidden="true" />} value={count('in')} label="In Stock" active={status === 'in'} onClick={() => toggleStatus('in')} />
          <PantryStat icon={<AlertTriangle size={46} className="fill-amber-500 text-white" aria-hidden="true" />} value={count('low')} label="Low Stock" active={status === 'low'} onClick={() => toggleStatus('low')} />
          <PantryStat icon={<XCircle size={46} className="fill-red-600 text-white" aria-hidden="true" />} value={count('out')} label="Out of Stock" active={status === 'out'} onClick={() => toggleStatus('out')} />
          <button type="button" className="btn-primary h-12 whitespace-nowrap !px-5 xl:ml-1" onClick={() => { setError(''); setAdding(true); }}><Plus size={20} aria-hidden="true" />Add Ingredient</button>
        </div>
        <div className="mt-[1.55rem] flex flex-wrap items-center gap-3 xl:gap-4 xl:pl-[0.6rem] xl:pr-[0.9rem]">
          <div className="min-w-0 flex-1"><SearchBox large value={filter} onChange={setFilter} label="Search your pantry" placeholder="Search your pantry (e.g., chicken, tomato, rice...)" /></div>
          <select className="select h-[2.65rem] !border-rose-200 !bg-[#fffaf7] !pl-3 !pr-1 tracking-tight xl:w-[9rem]" value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="Pantry category">
            <option value="All">All Categories</option>{SHELVES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <select className="select h-[2.65rem] !border-rose-200 !bg-[#fffaf7] !pl-3 !pr-1 tracking-tight xl:w-[7.6rem]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Stock status">
            <option value="all">All Status</option><option value="in">In Stock</option><option value="low">Low Stock</option><option value="out">Out of Stock</option>
          </select>
          <select className="select h-[2.65rem] !border-rose-200 !bg-[#fffaf7] !pl-3 !pr-1 tracking-tight xl:w-[7.9rem]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="az">Sort: A – Z</option><option value="za">Sort: Z – A</option>
          </select>
        </div>
        {error && !adding && !updating && !removing && <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <div className="mt-[1.65rem] grid gap-[0.8rem] xl:grid-cols-[15.55rem_minmax(0,1fr)]">
          <Card title="Ingredient Categories" icon={LayoutGrid}>
            <ul className="flex flex-wrap xl:flex-col">
              {[{ name: 'All', icon: '' }, ...SHELVES].map((s) => (
                <li key={s.name} className="w-full min-w-0 border-b border-stone-100/80 last:border-0"><button type="button" aria-pressed={shelf === s.name} onClick={() => setShelf(s.name)}
                  className={`flex h-[3.42rem] w-full items-center gap-2.5 rounded-2xl px-2 text-left text-[0.97rem] tracking-tight ${shelf === s.name ? 'bg-rose-100/80 font-semibold' : 'hover:bg-rose-50'}`}>
                  {s.name === 'All' ? <LayoutGrid size={26} className="text-crimson" aria-hidden="true" /> : <CategoryIcon category={s.icon} size={26} />}
                  <span className="min-w-0 flex-1 truncate">{s.name === 'All' ? 'All Items' : s.name}</span>
                  <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white px-1.5 text-[0.92rem] shadow-sm">{s.name === 'All' ? `(${items.length})` : `${shelfCount(s.name)}`}</span>
                </button></li>
              ))}
            </ul>
          </Card>

          <Card title="Your Pantry Items" icon={Refrigerator} className="pantry-items" action={
            <div className="flex rounded-full bg-white/80 p-0.5 shadow-sm" role="group" aria-label="View">
              <button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`grid h-9 w-[4.1rem] place-items-center rounded-full ${view === 'grid' ? 'bg-gradient-to-r from-[#dc1029] to-[#ea2526] text-white' : ''}`}><LayoutGrid size={21} /></button>
              <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`grid h-9 w-[4.1rem] place-items-center rounded-full ${view === 'list' ? 'bg-gradient-to-r from-[#dc1029] to-[#ea2526] text-white' : ''}`}><List size={21} /></button>
            </div>}>
            <p className="sr-only">{pantry.length === 0 ? 'Add what you have at home.' : `${pantry.length} item${pantry.length === 1 ? '' : 's'} at home`}</p>
            {shown.length === 0 && pantry.length > 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">No pantry items match this filter.</p>
            ) : shown.length === 0 ? (
              <div>
                <p className="rounded-2xl bg-rose-50/70 px-4 py-2.5 text-[0.92rem] text-stone-700"><strong>Your pantry is empty.</strong> Tap a kitchen staple below to add it (you can change the amount later), or use “Add Ingredient” for anything else.</p>
                <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" aria-label="Kitchen staples to add">
                  {starters.map((item) => (
                    <li key={item.id} className="flex flex-col items-center rounded-2xl border border-white/90 bg-white/80 px-2 pb-2 pt-1.5 text-center shadow-[0_6px_14px_-10px_rgb(159_18_57/0.5)]">
                      <span className="relative block h-[4.6rem] w-[5.4rem]"><IngredientHero name={item.name} category={item.category} /></span>
                      <p className="w-full truncate text-[0.92rem] font-semibold leading-tight" title={item.name}>{short(item.name)}</p>
                      <button type="button" className="btn-sm btn-outline mt-1.5 w-full justify-center" onClick={() => quickAdd(item)}><Plus size={14} aria-hidden="true" />Add {formatGrams(STARTER_GRAMS)}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : view === 'grid' ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 xl:grid-cols-5">
                {shown.map(({ item, grams: g }) => {
                  const s = stockStatus(g);
                  return (
                    <li key={item.id} className="relative flex h-[10.85rem] flex-col rounded-2xl border border-white/90 bg-white/80 px-2.5 pb-2 pt-1.5 shadow-[0_6px_14px_-10px_rgb(159_18_57/0.5)]">
                      <span className="absolute right-1.5 top-1.5 z-10"><ItemMenu name={item.name} onUpdate={() => openUpdate(item.id, g)} onRemove={() => { setError(''); setRemoving({ id: item.id }); }} /></span>
                      <span className="relative mx-auto block h-[6rem] w-[7.1rem] shrink-0"><IngredientHero name={item.name} category={item.category} /></span>
                      <p className="truncate text-[1rem] font-semibold leading-tight tracking-tight" title={item.name}>{short(item.name)}</p>
                      <p className="text-[0.88rem] leading-tight tracking-tight text-stone-800">{formatGrams(g)}</p>
                      <div className="mt-auto flex items-center justify-end gap-1">
                        {blocked(item) && <span title="Blocked by your allergen shield"><ShieldAlert size={16} className="text-amber-700" aria-label="Blocked" /></span>}
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-[0.18rem] text-[0.84rem] font-medium tracking-tight ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="divide-y divide-stone-100 px-1">
                {shown.map(({ item, grams: g }) => {
                  const s = stockStatus(g);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 py-1.5">
                      <IngredientBadge name={item.name} category={item.category} size={44} />
                      <span className="min-w-32 flex-1 truncate font-semibold">{item.name}<span className="block text-[0.82rem] font-normal text-stone-600">{shelfOf(item.category)}</span></span>
                      {blocked(item) && <span className="badge badge-amber"><ShieldAlert size={12} />Blocked</span>}
                      <span className="w-20 text-right text-[0.92rem]">{formatGrams(g)}</span>
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-[0.18rem] text-[0.84rem] font-medium ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}</span>
                      <button type="button" className="icon-btn" aria-label={`Update quantity of ${item.name}`} onClick={() => openUpdate(item.id, g)}><Pencil size={16} /></button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${item.name}`} onClick={() => { setError(''); setRemoving({ id: item.id }); }}><Trash2 size={16} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-[0.82rem]" aria-label="Pantry summary">
        <Card title="Pantry Overview" icon={Refrigerator}>
          <div className="flex items-center gap-5 px-1">
            <Donut size={130} thickness={5.5} label="Pantry stock" parts={OVERVIEW.map((o) => ({ value: count(o.key), color: o.color, label: o.label }))}
              center={<span><span className="block text-[1.65rem] font-bold leading-none">{percents[0]}%</span><span className="text-[0.92rem]">In Stock</span></span>} />
            <ul className="min-w-0 flex-1 space-y-[0.85rem] text-[0.92rem] tracking-tight">
              {OVERVIEW.map((o, i) => (
                <li key={o.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 whitespace-nowrap"><span className="h-[1.15rem] w-[1.15rem] rounded" style={{ background: o.color }} />{o.label} ({count(o.key)})</span><strong>{percents[i]}%</strong></li>
              ))}
            </ul>
          </div>
        </Card>
        <Card title="Quick Actions" icon={Zap} iconClass="fill-amber-400 text-amber-500">
          <ul className="divide-y divide-stone-100">
            {quickActions.map(({ icon: Icon, label, onClick }) => (
              <li key={label}><button type="button" onClick={onClick} className="flex h-[2.4rem] w-full items-center gap-3.5 text-left text-[1.02rem] font-medium tracking-tight hover:text-crimson">
                <Icon size={22} className="text-crimson" aria-hidden="true" /><span className="flex-1">{label}</span><ChevronRight size={20} aria-hidden="true" /></button></li>
            ))}
          </ul>
        </Card>
        <Card title="Recipe Ideas from Your Pantry" icon={ChefHat} className="flex-1 xl:mt-[0.2rem]">
          <p className="-mt-2 mb-2.5 text-[0.9rem] tracking-tight">Based on ingredients you have right now.</p>
          {ideas.length === 0 ? <p className="text-sm text-stone-500">Add at least 2 main ingredients to see ideas here.</p> : (
            <ul className="grid grid-cols-3 gap-2">
              {ideas.map((r) => (
                <li key={r.slug} className="min-w-0"><Link to={`/recipe/${r.slug}`} state={{ match: r }} className="block h-full overflow-hidden rounded-2xl bg-white/85 shadow-sm">
                  <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} frame="aspect-[110/98]" rounded="rounded-t-2xl">
                    <span className="absolute right-1 top-1 whitespace-nowrap rounded-full bg-[#c6f6d0] px-2 py-0.5 text-[0.74rem] font-medium text-emerald-950">{r.match_percent}% Match</span>
                  </RecipeCardImage>
                  <span className="block px-2 pb-2.5 pt-1.5 text-[0.98rem] font-semibold leading-tight tracking-tight">{r.name}</span></Link></li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-primary mt-4 h-[3.3rem] w-full" onClick={cookWithPantry}>View All Recipe Ideas<ArrowRight size={18} aria-hidden="true" /></button>
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
        <QuantityFields text={addText} unit={addUnit} onText={setAddText} onUnit={setAddUnit} label="Quantity to add" />
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
      <p className="mt-4 text-xs text-stone-500">Quantities are saved in grams (1,000 g = 1 kg). Recipes use them to show what you still need to buy.</p>
    </Modal>

    <Modal open={updating !== null} title="Update Quantity" onClose={() => setUpdating(null)}>
      {updating && (
        <form className="space-y-3 text-sm" onSubmit={saveUpdate}>
          <label className="block font-semibold">Ingredient
            <select className="field mt-1 font-normal" value={updating.id ?? ''} aria-label="Ingredient to update"
              onChange={(e) => { const row = picker.find((r) => r.item.id === Number(e.target.value)); if (row) openUpdate(row.item.id, row.grams); }}>
              <option value="" disabled>Choose an ingredient…</option>
              {picker.map((r) => <option key={r.item.id} value={r.item.id}>{r.item.name}</option>)}
            </select>
          </label>
          <div><span className="mb-1 block font-semibold">New quantity</span>
            <QuantityFields text={updating.text} unit={updating.unit} onText={(text) => setUpdating({ ...updating, text })} onUnit={(unit) => setUpdating({ ...updating, unit })} label={`${updatingItem?.name ?? 'Ingredient'} quantity`} /></div>
          <p className="text-xs text-stone-500">Enter 0 if you ran out: the item stays listed as Out of Stock.</p>
          {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-800">{error}</p>}
          <button type="submit" className="btn-primary">Save quantity</button>
        </form>
      )}
    </Modal>

    <Modal open={removing !== null} title="Remove Ingredient" onClose={() => setRemoving(null)}>
      {removing && (
        <div className="space-y-3 text-sm">
          {removingItem ? <p>Remove <strong>{removingItem.name}</strong> from your pantry?</p> : (
            <label className="block font-semibold">Ingredient
              <select className="field mt-1 font-normal" value="" aria-label="Ingredient to remove" onChange={(e) => setRemoving({ id: Number(e.target.value) })}>
                <option value="" disabled>Choose an ingredient…</option>
                {picker.map((r) => <option key={r.item.id} value={r.item.id}>{r.item.name}</option>)}
              </select>
            </label>
          )}
          {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-800">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-sm btn-danger" disabled={!removingItem} onClick={confirmRemove}>Remove</button>
            <button type="button" className="btn-sm btn-outline" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>

    <Modal open={shelvesOpen} title="Manage Categories" onClose={() => setShelvesOpen(false)}>
      <p className="mb-3 text-sm text-stone-600">Choose a category to show. Ingredient categories are shared by everyone, so only a Super Admin can change them.</p>
      <ul className="divide-y divide-stone-100">
        {SHELVES.map((s) => (
          <li key={s.name}><button type="button" className="flex w-full items-center gap-3 py-2 text-left font-medium hover:text-crimson" onClick={() => { setShelf(s.name); setShelvesOpen(false); }}>
            <CategoryIcon category={s.icon} size={22} /><span className="flex-1">{s.name}</span><span className="text-sm">{shelfCount(s.name)}</span><ChevronRight size={18} aria-hidden="true" /></button></li>
        ))}
      </ul>
    </Modal>
    </div>
  );
}
