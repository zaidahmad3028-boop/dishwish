import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChefHat, Clock, Flame, Leaf, Link2, Plus, Search, ShieldAlert, Sparkles, TrendingUp, Trophy, Users, X, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { displayName } from '../components/AppShell';
import { DishArt, IngredientBadge } from '../components/DishArt';
import { Card, EmptyState, ErrorNote, PageHeader, Spinner, formatDate } from '../components/ui';
import { DIETS, listCuratedRecipes, listEvents, trendingRecipes, type CuratedSummary, type RecipeEvent } from '../lib/curatedApi';
import { allergenLabel, blockReason, effectiveAllergenTags } from '../lib/preferences';
import { presetActive, TASTE_PRESETS, togglePreset, useSeedTastes, useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';

const QUICK_ADD = ['Chicken Breast', 'Tomato', 'Onion', 'Garlic'];
const shortName = (n: string) => n.replace(/\s*\(.*\)$/, '').replace(/^Chicken Breast$/, 'Chicken');

export function KitchenHomePage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const { catalog, prefs, error } = useKitchenData(userId);
  const { selection, add, remove, setTastes, toggleDiet } = useSelection();
  useSeedTastes(prefs?.tastes);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [popular, setPopular] = useState<{ trending: boolean; items: (CuratedSummary & { uses?: number })[] } | null>(null);
  const [recent, setRecent] = useState<RecipeEvent[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([trendingRecipes(30).catch(() => []), listCuratedRecipes().catch(() => [])]).then(([trend, all]) => {
      const bySlug = new Map(all.map((r) => [r.slug, r]));
      const items = trend.flatMap((t) => (bySlug.has(t.recipe_slug) ? [{ ...bySlug.get(t.recipe_slug)!, uses: Number(t.uses) }] : []));
      setPopular(items.length ? { trending: true, items: items.slice(0, 3) } : { trending: false, items: all.slice(0, 3) });
    });
    listEvents(userId, 30).then((rows) => setRecent(rows.filter((r) => r.kind === 'generated').slice(0, 3))).catch(() => setRecent([]));
  }, [userId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !catalog) return [];
    return catalog.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [catalog, query]);

  const tryAdd = (name: string) => {
    const item = catalog?.find((i) => i.name === name);
    const reason = item && prefs ? blockReason(item.name, item.allergens, prefs) : null;
    if (reason) { setMessage(`${name} is blocked by your allergies (${reason}).`); return; }
    setMessage(add(name) ? '' : `${name} is already selected.`);
    setQuery('');
  };

  const generate = () => {
    if (selection.ingredients.length < 2) { setMessage('Choose at least 2 different ingredients first.'); return; }
    navigate('/recommendations');
  };

  const allergyTags = prefs ? effectiveAllergenTags(prefs) : [];
  return (
    <>
      <PageHeader title="Your" accent="Kitchen" subtitle={`Salaam, ${displayName(session?.user)}! Turn your ingredients into amazing recipes.`} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {prefs && !prefs.onboarded && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tell us your tastes and allergies so recommendations fit you. <Link to="/onboarding" className="font-bold underline">Finish setting up</Link>
        </p>
      )}

      <section className="card relative overflow-hidden p-6 sm:p-8" aria-labelledby="counter-heading">
        <div className="pointer-events-none absolute -right-10 -top-10 hidden h-64 w-64 rounded-full bg-gradient-to-br from-ember/40 to-crimson/30 blur-2xl md:block" aria-hidden="true" />
        <h2 id="counter-heading" className="font-display text-3xl font-extrabold sm:text-4xl">What’s on Your <span className="text-crimson">Counter?</span></h2>
        <p className="mt-2 text-stone-600">Add ingredients, choose your taste, and get personalised recipe recommendations.</p>
        <div className="relative mt-5 max-w-2xl">
          <label className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-1.5 pl-1.5 pr-4 shadow-sm focus-within:border-crimson">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-crimson to-ember text-white"><Search size={20} aria-hidden="true" /></span>
            <span className="sr-only">Search ingredients</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search or add ingredients (e.g., Chicken, Tomato, Onion...)"
              className="min-w-0 flex-1 bg-transparent outline-none" role="combobox" aria-expanded={matches.length > 0} aria-controls="kitchen-matches" />
          </label>
          {matches.length > 0 && (
            <ul id="kitchen-matches" role="listbox" className="card absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto p-2">
              {matches.map((m) => {
                const reason = prefs ? blockReason(m.name, m.allergens, prefs) : null;
                return (
                  <li key={m.id} role="option" aria-selected={false}>
                    <button type="button" onClick={() => tryAdd(m.name)} disabled={reason !== null}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">
                      <IngredientBadge name={m.name} category={m.category} size={32} />
                      <span className="flex-1 text-sm font-semibold">{m.name}<span className="block text-xs font-normal text-stone-500">{m.category}</span></span>
                      {reason ? <span className="text-xs font-semibold text-rose-700">{reason}</span> : <Plus size={16} className="text-crimson" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Quick Add:</span>
          {QUICK_ADD.filter((n) => catalog?.some((i) => i.name === n)).map((n) => {
            const item = catalog!.find((i) => i.name === n)!;
            return (
              <button key={n} type="button" className="pill" onClick={() => tryAdd(n)} aria-pressed={selection.ingredients.includes(n)}>
                <IngredientBadge name={n} category={item.category} size={22} />{shortName(n)}
              </button>
            );
          })}
          <Link to="/select" className="pill"><Plus size={16} className="text-crimson" />More</Link>
        </div>
        {message && <p role="status" className="mt-3 text-sm font-semibold text-rose-700">{message}</p>}
        {selection.ingredients.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold">On your counter ({selection.ingredients.length})</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {selection.ingredients.map((n) => (
                <li key={n} className="inline-flex items-center gap-1 rounded-full bg-rose-50 py-1 pl-3 pr-1 text-sm font-semibold text-rose-900">
                  {n}<button type="button" className="icon-btn h-6 w-6" onClick={() => remove(n)} aria-label={`Remove ${n}`}><X size={14} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { to: '/recommendations', icon: ChefHat, title: 'Find Recipes', text: 'Cook with what you have.' },
          { to: '/select', icon: Link2, title: 'Smart Matching', text: 'Graph-based ingredient pairing.' },
          { to: '/settings?tab=diet', icon: Leaf, title: 'Healthy & Nutritious', text: 'Calories and diet filters.' },
          { to: '/settings', icon: TrendingUp, title: 'Personalized for You', text: 'Based on your taste and preferences.' },
        ].map(({ to, icon: Icon, title, text }) => (
          <Link key={title} to={to} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
            <Icon size={34} className="text-crimson" aria-hidden="true" />
            <span><span className="block font-display text-lg font-bold">{title}</span><span className="text-sm text-stone-600">{text}</span></span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="Quick Recipe Generator" icon={Zap}>
          <p className="flex items-center gap-2 text-sm font-semibold"><Flame size={16} className="text-crimson" />Taste Preference</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TASTE_PRESETS.map((p) => (
              <button key={p.label} type="button" className="pill" aria-pressed={presetActive(selection.tastes, p)}
                onClick={() => setTastes(togglePreset(selection.tastes, p))}>{p.label}</button>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold"><Leaf size={16} className="text-green-600" />Diet (optional)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <label key={d.key} className="pill cursor-pointer">
                <input type="checkbox" className="accent-crimson" checked={selection.diets.includes(d.key)} onChange={() => toggleDiet(d.key)} />{d.label}
              </label>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-crimson" aria-hidden="true" />
            <span>{allergyTags.length || prefs?.customAllergens.length
              ? <>Avoiding: <strong>{[...allergyTags.map(allergenLabel), ...(prefs?.customAllergens ?? [])].join(', ')}</strong>. </>
              : 'No allergies saved. '}
              <Link to="/settings?tab=diet" className="font-semibold text-crimson underline">Manage allergies</Link></span>
          </p>
          <button type="button" className="btn-primary mt-5 w-full" onClick={generate}>
            <Sparkles size={18} aria-hidden="true" />Generate Recipes Now<ArrowRight size={18} aria-hidden="true" />
          </button>
          <p className="mt-2 text-center text-xs text-stone-500">Needs at least 2 ingredients · {selection.ingredients.length} selected</p>
        </Card>

        <Card title={popular?.trending === false ? 'Featured Recipes' : 'Popular & Trending Recipes'} icon={Trophy}
          action={<Link to="/recipes?tab=browse" className="btn-sm btn-outline">View All<ArrowRight size={14} /></Link>}>
          {popular === null ? <Spinner /> : popular.items.length === 0 ? (
            <EmptyState title="No published recipes yet">An administrator needs to publish curated recipes first.</EmptyState>
          ) : (
            <>
              {!popular.trending && <p className="-mt-2 mb-3 text-xs text-stone-500">No cooking activity in the last 30 days yet, so these are featured dishes, not trends.</p>}
              <ul className="grid gap-4 sm:grid-cols-3">
                {popular.items.map((r) => (
                  <li key={r.slug} className="rounded-2xl bg-white/70 p-2 shadow-sm">
                    <Link to={`/recipe/${r.slug}`} className="block">
                      <DishArt category={r.category} imageUrl={r.image_url} name={r.name} className="h-28" />
                      <p className="mt-2 font-display font-bold">{r.name}</p>
                      <p className="mt-1 flex flex-wrap gap-3 text-xs text-stone-600">
                        <span className="inline-flex items-center gap-1"><Clock size={13} />{r.minutes} min</span>
                        <span className="inline-flex items-center gap-1"><Users size={13} />{r.servings} servings</span>
                      </p>
                      {r.uses !== undefined && <p className="mt-1 text-xs font-semibold text-crimson">{r.uses} recent {r.uses === 1 ? 'use' : 'uses'}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card title="Recently Generated" icon={Clock} className="mt-6"
        action={<Link to="/recipes?tab=generated" className="btn-sm btn-outline">History<ArrowRight size={14} /></Link>}>
        {recent === null ? <Spinner /> : recent.length === 0 ? (
          <EmptyState title="Nothing generated yet">Pick two or more ingredients and press Generate.</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><strong>{e.recipe_name}</strong>{e.match_percent !== null && <span className="badge badge-green ml-2">{e.match_percent}% match</span>}
                  <span className="block text-xs text-stone-500">{e.ingredients.join(', ')}</span></span>
                <span className="flex items-center gap-3 text-xs text-stone-500">{formatDate(e.created_at, true)}
                  {e.recipe_slug && <Link to={`/recipe/${e.recipe_slug}`} className="btn-sm btn-outline">View</Link>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {catalog === null && <Spinner label="Loading ingredients" />}
    </>
  );
}
