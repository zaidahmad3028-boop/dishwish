import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download, Layers, Leaf, Link2, Network, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { BarTrend, Legend, PALETTE } from '../../components/charts';
import { CompatibilityGraph } from '../../components/CompatibilityGraph';
import { IngredientBadge } from '../../components/DishArt';
import { Card, Donut, EmptyState, ErrorNote, Modal, Notice, PageHeader, Pagination, SearchBox, Spinner, StatCard, downloadFile, toCsv } from '../../components/ui';
import {
  addCategory, deleteEdge, deleteIngredient, ingredientUsage, listCategories, listEdges, listIngredients, RELATIONS, saveEdge, saveIngredient,
  validateIngredient, type AdminIngredient, type Edge,
} from '../../lib/adminApi';
import { ALLERGEN_CHIPS, allergenLabel } from '../../lib/preferences';

const PAGE_SIZE = 10;
const ALL_TAGS = [...ALLERGEN_CHIPS.map((c) => c.tag), 'shellfish'];
type Draft = Omit<AdminIngredient, 'id'>;
const blank = (categoryId: number): Draft => ({ name: '', category_id: categoryId, kcal: 0, protein: 0, carbs: 0, fat: 0, sweet: 0, salty: 0, sour: 0, spicy: 0, allergens: [], priority: 3, image_url: null });

// "name,category,kcal,..." rows -> drafts; every row is validated before anything is written.
export function parseIngredientCsv(text: string, categories: { id: number; name: string }[]): { rows: Draft[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim().toLowerCase());
  const need = ['name', 'category', 'kcal', 'protein', 'carbs', 'fat', 'sweet', 'salty', 'sour', 'spicy', 'allergens', 'priority'];
  if (need.some((n) => !header.includes(n))) return { rows: [], errors: [`Header must include: ${need.join(', ')}`] };
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const rows: Draft[] = [], errors: string[] = [];
  lines.slice(0, 500).forEach((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const get = (k: string) => cells[header.indexOf(k)] ?? '';
    const categoryId = byName.get(get('category').toLowerCase());
    if (!categoryId) { errors.push(`Row ${i + 2}: unknown category “${get('category')}”`); return; }
    const tags = get('allergens').split(';').map((t) => t.trim()).filter(Boolean);
    if (tags.some((t) => !ALL_TAGS.includes(t as never))) { errors.push(`Row ${i + 2}: unknown allergen tag`); return; }
    const draft: Draft = { name: get('name'), category_id: categoryId, kcal: Number(get('kcal')), protein: Number(get('protein')), carbs: Number(get('carbs')),
      fat: Number(get('fat')), sweet: Number(get('sweet')), salty: Number(get('salty')), sour: Number(get('sour')), spicy: Number(get('spicy')),
      allergens: tags, priority: Number(get('priority')), image_url: null };
    const problem = validateIngredient(draft);
    if (problem) errors.push(`Row ${i + 2}: ${problem}`); else rows.push(draft);
  });
  return { rows, errors };
}

export function AdminIngredientsPage() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<AdminIngredient[] | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [usage, setUsage] = useState<Map<number, { recipes: number; pantries: number; edges: number }>>(new Map());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(0);
  const [allergen, setAllergen] = useState('');
  const [sort, setSort] = useState<'name' | 'edges' | 'recipes'>('name');
  const [page, setPage] = useState(1);
  const [focus, setFocus] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminIngredient | null>(null);
  const [edgeForm, setEdgeForm] = useState({ target: 0, weight: 0.8, relation: 'complementary', evidence: '' });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    Promise.all([listIngredients(), listCategories(), listEdges(), ingredientUsage()])
      .then(([i, c, e, u]) => { setItems(i); setCategories(c); setEdges(e); setUsage(new Map(u.map((r) => [r.ingredient_id, r]))); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { setPage(1); }, [search, category, allergen, sort]);
  useEffect(() => {
    if (params.get('new') && categories.length) { setEditing({ id: null, draft: blank(categories[0].id) }); setParams({}); }
  }, [params, categories, setParams]);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? '—';
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (items ?? []).filter((i) => (!category || i.category_id === category) && (!allergen || i.allergens.includes(allergen)) && (!q || i.name.toLowerCase().includes(q)));
    return rows.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (usage.get(b.id)?.[sort] ?? 0) - (usage.get(a.id)?.[sort] ?? 0));
  }, [items, search, category, allergen, sort, usage]);

  const focusItem = focus ? byId.get(focus) : undefined;
  const focusEdges = focusItem ? edges.filter((e) => e.ingredient_a === focusItem.id || e.ingredient_b === focusItem.id)
    .map((e) => { const other = byId.get(e.ingredient_a === focusItem.id ? e.ingredient_b : e.ingredient_a); return { name: other?.name ?? '?', id: other?.id ?? 0, weight: e.weight, evidence: e.evidence, relation: e.relation_type }; })
    .sort((a, b) => b.weight - a.weight) : [];
  const covered = new Set(edges.flatMap((e) => [e.ingredient_a, e.ingredient_b]));
  const tagCounts = ALL_TAGS.map((t) => ({ tag: t, n: (items ?? []).filter((i) => i.allergens.includes(t)).length })).filter((t) => t.n > 0).sort((a, b) => b.n - a.n);
  const perCategory = categories.map((c) => ({ name: c.name, count: (items ?? []).filter((i) => i.category_id === c.id).length }));

  const run = async (fn: () => Promise<void>, done: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(done); load(); } catch (e) { setError((e as Error).message); }
  };
  const submitIngredient = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    run(async () => { await saveIngredient(editing.id, editing.draft); setEditing(null); }, editing.id ? 'Ingredient updated.' : 'Ingredient added.');
  };
  const submitEdge = (e: FormEvent) => {
    e.preventDefault();
    if (!focusItem) return;
    run(() => saveEdge(focusItem.id, edgeForm.target, edgeForm.weight, edgeForm.relation, edgeForm.evidence || 'admin judgement'),
      'Compatibility saved. Recommendations pick it up within a minute.');
  };
  const runImport = () => {
    const { rows, errors } = parseIngredientCsv(importText, categories);
    if (errors.length) { setError(errors.slice(0, 5).join(' · ')); return; }
    const existing = new Map((items ?? []).map((i) => [i.name.toLowerCase(), i.id]));
    run(async () => {
      for (const r of rows) await saveIngredient(existing.get(r.name.toLowerCase()) ?? null, r);
      setImportOpen(false); setImportText('');
    }, `Imported ${rows.length} ingredient${rows.length === 1 ? '' : 's'}.`);
  };
  const exportCsv = () => downloadFile('dishwish-ingredients.csv', toCsv((items ?? []).map((i) => ({
    name: i.name, category: catName(i.category_id), kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, sweet: i.sweet, salty: i.salty,
    sour: i.sour, spicy: i.spicy, allergens: i.allergens.join(';'), priority: i.priority }))), 'text/csv');

  if (!items) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Loading ingredients" />;
  const d = editing?.draft;
  const setD = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  return (
    <>
      <PageHeader title="Ingredients" accent="Management" icon={Leaf} subtitle="Manage the ingredient database, categories, allergens and compatibility relationships."
        actions={<>
          <button type="button" className="btn-ghost" onClick={exportCsv}><Download size={16} />Export CSV</button>
          <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}><Upload size={16} />Import CSV</button>
          <button type="button" className="btn-primary" onClick={() => setEditing({ id: null, draft: blank(categories[0]?.id ?? 0) })}><Plus size={18} />Add Ingredient</button>
        </>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Leaf} value={items.length} label="Total Ingredients" tone="green" />
        <StatCard icon={Layers} value={categories.length} label="Categories" tone="amber" />
        <StatCard icon={Link2} value={edges.length} label="Compatibility Links" />
        <StatCard icon={AlertTriangle} value={tagCounts.length} label="Allergen tags in use" />
        <StatCard icon={Network} value={`${items.length ? Math.round((covered.size / items.length) * 100) : 0}%`} label="Graph coverage" tone="blue" note="Ingredients with ≥1 stored edge" />
      </div>
      {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-6 grid gap-6 2xl:grid-cols-[14rem_minmax(0,1fr)_26rem]">
        <Card title="Categories" className="h-fit">
          <ul className="flex flex-wrap gap-1 2xl:flex-col">
            <li><button type="button" className={`w-full rounded-xl px-3 py-1.5 text-left text-sm font-semibold ${!category ? 'bg-rose-50 text-crimson' : ''}`} onClick={() => setCategory(0)}>All ({items.length})</button></li>
            {perCategory.map((c, i) => (
              <li key={c.name}><button type="button" className={`w-full rounded-xl px-3 py-1.5 text-left text-sm font-semibold ${category === categories[i].id ? 'bg-rose-50 text-crimson' : ''}`}
                onClick={() => setCategory(categories[i].id)}>{c.name} ({c.count})</button></li>
            ))}
          </ul>
          <form className="mt-3 flex gap-1" onSubmit={(e) => { e.preventDefault(); run(async () => { await addCategory(newCategory); setNewCategory(''); }, 'Category added.'); }}>
            <input className="field py-1.5 text-sm" placeholder="New category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} aria-label="New category name" />
            <button type="submit" className="icon-btn" aria-label="Add category"><Plus size={16} /></button>
          </form>
        </Card>

        <Card className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchBox value={search} onChange={setSearch} label="Search ingredients" placeholder="Search ingredient..." />
            <select className="select" value={allergen} onChange={(e) => setAllergen(e.target.value)} aria-label="Allergen filter">
              <option value="">Allergens: All</option>{ALL_TAGS.map((t) => <option key={t} value={t}>{allergenLabel(t)}</option>)}
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="name">Sort: Name</option><option value="edges">Sort: Most links</option><option value="recipes">Sort: Most recipes</option>
            </select>
          </div>
          {filtered.length === 0 ? <EmptyState title="No ingredients match" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[640px]">
                <thead><tr><th>Ingredient</th><th>Category</th><th>Allergens</th><th>Links</th><th>Recipes</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((i) => (
                    <tr key={i.id} className={focus === i.id ? 'bg-rose-50/60' : ''}>
                      <td><button type="button" className="flex items-center gap-2 text-left font-semibold hover:text-crimson" onClick={() => setFocus(i.id)}>
                        <IngredientBadge name={i.name} category={catName(i.category_id)} size={28} />{i.name}</button></td>
                      <td><span className="badge badge-gray">{catName(i.category_id)}</span></td>
                      <td>{i.allergens.length ? i.allergens.map((a) => <span key={a} className="badge badge-red mr-1">{allergenLabel(a)}</span>) : '—'}</td>
                      <td>{usage.get(i.id)?.edges ?? 0}</td><td>{usage.get(i.id)?.recipes ?? 0}</td>
                      <td className="whitespace-nowrap">
                        <button type="button" className="icon-btn" aria-label={`Edit ${i.name}`} onClick={() => setEditing({ id: i.id, draft: { ...i } })}><Pencil size={16} /></button>
                        <button type="button" className="icon-btn" aria-label={`Delete ${i.name}`} onClick={() => setConfirmDelete(i)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} noun="ingredients" />
        </Card>

        <Card title="Ingredient Compatibility Graph" icon={Network}>
          {!focusItem ? <p className="text-sm text-stone-500">Click an ingredient name to view and edit its compatibility edges.</p> : (
            <>
              <CompatibilityGraph center={focusItem.name} edges={focusEdges} max={8} onSelect={(n) => { const t = items.find((x) => x.name === n); if (t) setFocus(t.id); }} />
              <form onSubmit={submitEdge} className="mt-4 space-y-2 rounded-2xl bg-white/70 p-3 text-sm">
                <p className="font-semibold">Add or update an edge from {focusItem.name}</p>
                <select className="field py-2" value={edgeForm.target} onChange={(e) => setEdgeForm({ ...edgeForm, target: Number(e.target.value) })} aria-label="Target ingredient" required>
                  <option value={0}>Choose ingredient…</option>
                  {items.filter((x) => x.id !== focusItem.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <label className="flex items-center gap-2">Weight <input type="range" min={0} max={1} step={0.01} value={edgeForm.weight} className="flex-1 accent-crimson"
                  onChange={(e) => setEdgeForm({ ...edgeForm, weight: Number(e.target.value) })} /><strong>{edgeForm.weight.toFixed(2)}</strong></label>
                <select className="field py-2" value={edgeForm.relation} onChange={(e) => setEdgeForm({ ...edgeForm, relation: e.target.value })} aria-label="Relation type">
                  {RELATIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className="field py-2" placeholder="Evidence / source (e.g. classic karahi pairing)" maxLength={200} value={edgeForm.evidence} onChange={(e) => setEdgeForm({ ...edgeForm, evidence: e.target.value })} />
                <button type="submit" className="btn-sm btn-red" disabled={!edgeForm.target}>Save edge</button>
              </form>
              {focusEdges.length > 0 && (
                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs">
                  {focusEdges.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2 py-1">
                      <span><strong>{e.name}</strong> · {e.weight.toFixed(2)} · {e.relation}<span className="block text-stone-500">{e.evidence}</span></span>
                      <button type="button" className="icon-btn" aria-label={`Delete edge to ${e.name}`} onClick={() => run(() => deleteEdge(focusItem.id, e.id), 'Edge deleted.')}><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-stone-500">Weight 0–1: 1 = pairs very well, 0 = should not be combined (“avoid”).</p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Ingredients per Category" icon={Layers}><BarTrend data={perCategory} x="name" y="count" label="Ingredients" colorful /></Card>
        <Card title="Top Compatible Pairs" icon={Link2}>
          <ul className="space-y-2 text-sm">
            {[...edges].sort((a, b) => b.weight - a.weight).slice(0, 6).map((e) => (
              <li key={`${e.ingredient_a}-${e.ingredient_b}`} className="flex justify-between gap-2">
                <span>{byId.get(e.ingredient_a)?.name} + {byId.get(e.ingredient_b)?.name}</span><span className="badge badge-green">{e.weight.toFixed(2)}</span>
              </li>
            ))}
            {edges.length === 0 && <li className="text-stone-500">No stored edges yet.</li>}
          </ul>
        </Card>
        <Card title="Allergen Overview" icon={AlertTriangle}>
          <div className="flex flex-wrap items-center gap-4">
            <Donut size={120} label="Allergen tags" parts={tagCounts.map((t, i) => ({ value: t.n, color: PALETTE[i % PALETTE.length], label: t.tag }))}
              center={<span><span className="block font-display text-xl font-extrabold">{tagCounts.reduce((s, t) => s + t.n, 0)}</span><span className="text-[11px]">tagged</span></span>} />
            <div className="min-w-40 flex-1"><Legend items={tagCounts.slice(0, 7).map((t, i) => ({ label: allergenLabel(t.tag), value: t.n, color: PALETTE[i % PALETTE.length] }))} /></div>
          </div>
        </Card>
      </div>

      <Modal open={editing !== null} title={editing?.id ? 'Edit ingredient' : 'Add ingredient'} onClose={() => setEditing(null)} wide>
        {d && (
          <form onSubmit={submitIngredient} className="grid gap-3 sm:grid-cols-2" noValidate>
            <label className="text-sm font-semibold sm:col-span-2">Name<input className="field mt-1" value={d.name} maxLength={100} onChange={(e) => setD({ name: e.target.value })} required /></label>
            <label className="text-sm font-semibold">Category<select className="field mt-1" value={d.category_id} onChange={(e) => setD({ category_id: Number(e.target.value) })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="text-sm font-semibold">Priority (1–5)<input className="field mt-1" type="number" min={1} max={5} value={d.priority} onChange={(e) => setD({ priority: Number(e.target.value) })} /></label>
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <label key={k} className="text-sm font-semibold capitalize">{k} per 100 g<input className="field mt-1" type="number" min={0} step="0.1" value={d[k]} onChange={(e) => setD({ [k]: Number(e.target.value) })} /></label>
            ))}
            {(['sweet', 'salty', 'sour', 'spicy'] as const).map((k) => (
              <label key={k} className="text-sm font-semibold capitalize">{k} (0–10)<input className="field mt-1" type="number" min={0} max={10} value={d[k]} onChange={(e) => setD({ [k]: Number(e.target.value) })} /></label>
            ))}
            <label className="text-sm font-semibold sm:col-span-2">Image URL (optional, https)<input className="field mt-1" value={d.image_url ?? ''} onChange={(e) => setD({ image_url: e.target.value || null })} /></label>
            <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">Allergen tags</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">{ALL_TAGS.map((t) => (
                <button key={t} type="button" className="pill px-2.5 py-1 text-xs" aria-pressed={d.allergens.includes(t)}
                  onClick={() => setD({ allergens: d.allergens.includes(t) ? d.allergens.filter((x) => x !== t) : [...d.allergens, t] })}>{allergenLabel(t)}</button>
              ))}</div></fieldset>
            <div className="sm:col-span-2"><button type="submit" className="btn-primary">Save ingredient</button></div>
          </form>
        )}
      </Modal>
      <Modal open={confirmDelete !== null} title="Delete ingredient?" onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="space-y-3 text-sm">
            <p>Delete <strong>{confirmDelete.name}</strong>? Its compatibility edges are removed too. Ingredients used by recipes or pantries can’t be deleted.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-sm btn-danger" onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); run(() => deleteIngredient(id), 'Ingredient deleted.'); }}>Delete</button>
              <button type="button" className="btn-sm btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={importOpen} title="Import ingredients (CSV)" onClose={() => setImportOpen(false)} wide>
        <p className="text-sm text-stone-600">Paste CSV with the header <code>name,category,kcal,protein,carbs,fat,sweet,salty,sour,spicy,allergens,priority</code>. Allergens are separated by “;”. Existing names are updated; nothing is written if any row is invalid. Max 500 rows.</p>
        <textarea className="field mt-3 min-h-48 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="CSV content" />
        <button type="button" className="btn-primary mt-3" onClick={runImport} disabled={!importText.trim()}><Upload size={16} />Validate and import</button>
      </Modal>
    </>
  );
}
