import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, CheckCircle2, ChefHat, Clock, Download, Eye, FileEdit, Pencil, Plus, Star, Trash2, Utensils, X } from 'lucide-react';
import { Legend, PALETTE } from '../../components/charts';
import { DishArt } from '../../components/DishArt';
import { Card, Donut, EmptyState, ErrorNote, Modal, Notice, PageHeader, Pagination, SearchBox, Spinner, StatCard, STATUS_BADGE, downloadFile, toCsv } from '../../components/ui';
import {
  deleteRecipe, listIngredients, listRecipes, recipeParts, recipeRatings, RECIPE_CATEGORIES, saveRecipe, setRecipeStatus, topRecipes, validateRecipe,
  type AdminIngredient, type AdminRecipe, type RecipeDraft,
} from '../../lib/adminApi';

const PAGE_SIZE = 10;
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const emptyDraft = (): RecipeDraft => ({ id: null, slug: '', name: '', description: '', category: 'Main Course', cuisine: 'Pakistani', minutes: 30, servings: 4,
  taste: { sweet: 1, salty: 5, sour: 2, spicy: 5 }, image_url: null, status: 'draft', lines: [], steps: [''] });

export function AdminRecipesPage() {
  const [params, setParams] = useSearchParams();
  const [recipes, setRecipes] = useState<AdminRecipe[] | null>(null);
  const [ingredients, setIngredients] = useState<AdminIngredient[]>([]);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [views, setViews] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<'all' | AdminRecipe['status']>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<AdminRecipe | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminRecipe | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    Promise.all([listRecipes(), recipeRatings().catch(() => ({})), topRecipes(365, 50).catch(() => [])])
      .then(([r, rt, top]) => { setRecipes(r); setRatings(rt); setViews(Object.fromEntries(top.map((t) => [t.recipe_slug ?? '', t.viewed]))); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { listIngredients().then(setIngredients).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [status, search, category]);
  useEffect(() => { if (params.get('new')) { setDraft(emptyDraft()); setParams({}); } }, [params, setParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (recipes ?? []).filter((r) => (status === 'all' || r.status === status) && (!category || r.category === category) && (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)));
  }, [recipes, status, search, category]);
  const count = (s: AdminRecipe['status']) => (recipes ?? []).filter((r) => r.status === s).length;
  const rated = Object.values(ratings);
  const avgRating = rated.length ? rated.reduce((s, r) => s + r.avg * r.count, 0) / rated.reduce((s, r) => s + r.count, 0) : null;
  const byCategory = RECIPE_CATEGORIES.map((c) => ({ c, n: (recipes ?? []).filter((r) => r.category === c).length })).filter((x) => x.n);

  const run = async (fn: () => Promise<void>, done: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(done); load(); } catch (e) { setError((e as Error).message); }
  };
  const edit = async (r: AdminRecipe) => {
    try { const parts = await recipeParts(r.id); setDraft({ ...r, lines: parts.lines, steps: parts.steps.length ? parts.steps : [''] }); }
    catch (e) { setError((e as Error).message); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const problem = validateRecipe(draft);
    if (problem) { setError(problem); return; }
    run(async () => { await saveRecipe(draft); setDraft(null); }, draft.id ? 'Recipe updated.' : 'Recipe created.');
  };
  const set = (patch: Partial<RecipeDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  if (!recipes) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Loading recipes" />;

  return (
    <>
      <PageHeader title="Recipes" accent="Management" icon={Utensils} subtitle="Create, review, update and manage the curated recipes Dish-Wish recommends."
        actions={<>
          <button type="button" className="btn-ghost" onClick={() => downloadFile('dishwish-recipes.csv', toCsv(recipes.map((r) => ({ slug: r.slug, name: r.name, category: r.category,
            cuisine: r.cuisine, minutes: r.minutes, servings: r.servings, status: r.status, source: r.source }))), 'text/csv')}><Download size={16} />Export</button>
          <button type="button" className="btn-primary" onClick={() => setDraft(emptyDraft())}><Plus size={18} />Add New Recipe</button>
        </>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={ChefHat} value={recipes.length} label="Total Recipes" />
        <StatCard icon={CheckCircle2} value={count('published')} label="Published" tone="green" />
        <StatCard icon={FileEdit} value={count('draft')} label="Drafts (not shown to users)" tone="amber" />
        <StatCard icon={Archive} value={count('archived')} label="Archived" tone="gray" />
        <StatCard icon={Star} value={avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'} label="Avg. Recipe Rating" tone="amber" note={`${rated.reduce((s, r) => s + r.count, 0)} recipe ratings`} />
      </div>
      {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <div role="tablist" className="mb-3 flex flex-wrap gap-2">
            {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={status === s} className="pill capitalize" onClick={() => setStatus(s)}>
                {s} ({s === 'all' ? recipes.length : count(s)})</button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchBox value={search} onChange={setSearch} label="Search recipes" placeholder="Search recipes (e.g., karahi, biryani)..." />
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter">
              <option value="">All Categories</option>{RECIPE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {filtered.length === 0 ? <EmptyState title="No recipes match" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead><tr><th>Recipe</th><th>Category</th><th>Cuisine</th><th>Time</th><th>Rating</th><th>Views</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                    <tr key={r.id}>
                      <td><span className="flex items-center gap-2"><DishArt category={r.category} imageUrl={r.image_url} name={r.name} className="h-10 !w-14" />
                        <span><strong>{r.name}</strong><span className="block text-xs text-stone-500">{r.slug} · {r.source === 'curated' ? 'Curated' : 'User-generated'}</span></span></span></td>
                      <td>{r.category}</td><td>{r.cuisine}</td><td>{r.minutes} min</td>
                      <td>{ratings[r.slug] ? <>★ {ratings[r.slug].avg.toFixed(1)} ({ratings[r.slug].count})</> : '—'}</td>
                      <td>{views[r.slug] ?? 0}</td>
                      <td>
                        <select className={`badge ${STATUS_BADGE[r.status]} border-0`} value={r.status} aria-label={`Status of ${r.name}`}
                          onChange={(e) => run(() => setRecipeStatus(r.id, e.target.value as AdminRecipe['status']), `${r.name} is now ${e.target.value}.`)}>
                          <option value="published">published</option><option value="draft">draft</option><option value="archived">archived</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap">
                        <button type="button" className="icon-btn" aria-label={`Preview ${r.name}`} onClick={() => setPreview(r)}><Eye size={16} /></button>
                        <button type="button" className="icon-btn" aria-label={`Edit ${r.name}`} onClick={() => edit(r)}><Pencil size={16} /></button>
                        <button type="button" className="icon-btn" aria-label={`Delete ${r.name}`} onClick={() => setConfirmDelete(r)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} noun="recipes" />
        </Card>
        <aside className="flex flex-col gap-4">
          <Card title="Recipe Preview" icon={Eye}>
            {!preview ? <p className="text-sm text-stone-500">Choose the eye icon on a recipe.</p> : (
              <div>
                <DishArt category={preview.category} imageUrl={preview.image_url} name={preview.name} className="h-36" />
                <p className="mt-2 flex items-center justify-between font-display text-lg font-bold">{preview.name}<span className={`badge ${STATUS_BADGE[preview.status]}`}>{preview.status}</span></p>
                <p className="text-sm text-stone-600">{preview.description}</p>
                <p className="mt-2 flex gap-3 text-xs"><span className="inline-flex items-center gap-1"><Clock size={13} />{preview.minutes} min</span><span>{preview.servings} servings</span>
                  <span>Spicy {preview.taste.spicy}/10</span></p>
                {preview.status === 'published' && <a href={`/recipe/${preview.slug}`} target="_blank" rel="noreferrer" className="btn-sm btn-outline mt-3">Open user view</a>}
              </div>
            )}
          </Card>
          <Card title="Categories Distribution" icon={ChefHat}>
            <div className="flex flex-wrap items-center gap-4">
              <Donut size={120} label="Recipes by category" parts={byCategory.map((x, i) => ({ value: x.n, color: PALETTE[i % PALETTE.length], label: x.c }))}
                center={<span><span className="block font-display text-xl font-extrabold">{recipes.length}</span><span className="text-[11px]">Recipes</span></span>} />
              <div className="min-w-36 flex-1"><Legend items={byCategory.map((x, i) => ({ label: x.c, value: `${Math.round((x.n / recipes.length) * 100)}%`, color: PALETTE[i % PALETTE.length] }))} /></div>
            </div>
          </Card>
        </aside>
      </div>

      <Modal open={draft !== null} title={draft?.id ? 'Edit recipe' : 'New recipe'} onClose={() => setDraft(null)} wide>
        {draft && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Name<input className="field mt-1" value={draft.name} maxLength={80}
                onChange={(e) => set({ name: e.target.value, ...(draft.id ? {} : { slug: slugify(e.target.value) }) })} /></label>
              <label className="text-sm font-semibold">Slug (URL)<input className="field mt-1" value={draft.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} /></label>
              <label className="text-sm font-semibold sm:col-span-2">Description<textarea className="field mt-1" maxLength={600} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></label>
              <label className="text-sm font-semibold">Category<select className="field mt-1" value={draft.category} onChange={(e) => set({ category: e.target.value })}>
                {RECIPE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="text-sm font-semibold">Cuisine<input className="field mt-1" maxLength={40} value={draft.cuisine} onChange={(e) => set({ cuisine: e.target.value })} /></label>
              <label className="text-sm font-semibold">Minutes<input className="field mt-1" type="number" min={1} max={600} value={draft.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} /></label>
              <label className="text-sm font-semibold">Servings<input className="field mt-1" type="number" min={1} max={20} value={draft.servings} onChange={(e) => set({ servings: Number(e.target.value) })} /></label>
              <label className="text-sm font-semibold">Status<select className="field mt-1" value={draft.status} onChange={(e) => set({ status: e.target.value as AdminRecipe['status'] })}>
                <option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
              <label className="text-sm font-semibold">Image URL (optional, https)<input className="field mt-1" value={draft.image_url ?? ''} onChange={(e) => set({ image_url: e.target.value || null })} /></label>
            </div>
            <fieldset className="grid gap-2 sm:grid-cols-4"><legend className="mb-1 text-sm font-semibold">Taste of the finished dish (0–10)</legend>
              {(['sweet', 'salty', 'sour', 'spicy'] as const).map((t) => (
                <label key={t} className="text-xs font-semibold capitalize">{t}: {draft.taste[t]}<input type="range" min={0} max={10} className="w-full accent-crimson"
                  value={draft.taste[t]} onChange={(e) => set({ taste: { ...draft.taste, [t]: Number(e.target.value) } })} /></label>
              ))}
            </fieldset>
            <fieldset><legend className="text-sm font-semibold">Ingredients</legend>
              <ul className="mt-2 space-y-2">
                {draft.lines.map((l, i) => (
                  <li key={i} className="grid grid-cols-[1fr_6rem_1fr_auto] gap-2">
                    <select className="field py-2 text-sm" value={l.ingredient_id} aria-label={`Ingredient ${i + 1}`}
                      onChange={(e) => set({ lines: draft.lines.map((x, j) => (j === i ? { ...x, ingredient_id: Number(e.target.value) } : x)) })}>
                      {ingredients.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <input className="field py-2 text-sm" type="number" min={1} max={10000} value={l.grams} aria-label={`Grams for ingredient ${i + 1}`}
                      onChange={(e) => set({ lines: draft.lines.map((x, j) => (j === i ? { ...x, grams: Number(e.target.value) } : x)) })} />
                    <input className="field py-2 text-sm" placeholder="Shown as, e.g. 2 medium" maxLength={80} value={l.display} aria-label={`Display quantity ${i + 1}`}
                      onChange={(e) => set({ lines: draft.lines.map((x, j) => (j === i ? { ...x, display: e.target.value } : x)) })} />
                    <button type="button" className="icon-btn" aria-label={`Remove ingredient ${i + 1}`} onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}><X size={16} /></button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-sm btn-outline mt-2" disabled={!ingredients.length}
                onClick={() => set({ lines: [...draft.lines, { ingredient_id: ingredients.find((g) => !draft.lines.some((l) => l.ingredient_id === g.id))?.id ?? ingredients[0].id, grams: 100, display: '' }] })}>
                <Plus size={14} />Add ingredient</button>
            </fieldset>
            <fieldset><legend className="text-sm font-semibold">Steps</legend>
              <ol className="mt-2 space-y-2">
                {draft.steps.map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-2 w-6 text-sm font-bold text-crimson">{i + 1}.</span>
                    <textarea className="field min-h-16 py-2 text-sm" maxLength={600} value={s} aria-label={`Step ${i + 1}`}
                      onChange={(e) => set({ steps: draft.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button type="button" className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => set({ steps: draft.steps.filter((_, j) => j !== i) })}><X size={16} /></button>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn-sm btn-outline mt-2" onClick={() => set({ steps: [...draft.steps, ''] })}><Plus size={14} />Add step</button>
            </fieldset>
            {error && <ErrorNote>{error}</ErrorNote>}
            <button type="submit" className="btn-primary">Save recipe</button>
          </form>
        )}
      </Modal>
      <Modal open={confirmDelete !== null} title="Delete recipe?" onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="space-y-3 text-sm">
            <p>Permanently delete <strong>{confirmDelete.name}</strong> with its ingredients and steps? Consider archiving instead; archived recipes stay in history.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-sm btn-outline" onClick={() => { const r = confirmDelete; setConfirmDelete(null); run(() => setRecipeStatus(r.id, 'archived'), `${r.name} archived.`); }}>Archive instead</button>
              <button type="button" className="btn-sm btn-danger" onClick={() => { const r = confirmDelete; setConfirmDelete(null); run(() => deleteRecipe(r.id), `${r.name} deleted.`); }}>Delete</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
