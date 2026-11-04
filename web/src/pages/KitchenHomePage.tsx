import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChartNoAxesColumnIncreasing, ChevronDown, Clock, CookingPot, Flame, Heart, Leaf, Link2, Plus, Search, Sparkles, Trophy, Users, X, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { Card, ChefHatMark, EmptyState, ErrorNote, PageHeader, Spinner, formatDate } from '../components/ui';
import { DIETS, listCuratedRecipes, listEvents, saveCurated, trendingRecipes, type CuratedSummary, type RecipeEvent } from '../lib/curatedApi';
import { blockReason } from '../lib/preferences';
import { presetActive, TASTE_PRESETS, togglePreset, useSeedTastes, useSelection } from '../lib/selection';
import { IMAGES, imageUrl, photosFirst, recipeImage } from '../lib/images';
import { useKitchenData } from '../lib/useKitchenData';

const QUICK_ADD = ['Chicken Breast', 'Tomato', 'Onion', 'Garlic'];
const HERO_FADE = { maskImage: 'linear-gradient(to right, transparent, black 40%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)' };
const FEATURE = 'card flex items-center gap-4 px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-lg lg:min-h-[6.6rem]';
const FEATURE_TITLE = 'block whitespace-nowrap font-display text-[1.32rem] font-bold leading-tight tracking-tight';
const FEATURE_TEXT = 'mt-0.5 block whitespace-nowrap text-[0.86rem] tracking-tight text-stone-700';
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
  const [saved, setSaved] = useState<Record<string, 'saving' | 'saved' | 'exists'>>({});

  const save = (r: CuratedSummary) => {
    if (!userId) return;
    setSaved((s) => ({ ...s, [r.slug]: 'saving' }));
    saveCurated(userId, r)
      .then((outcome) => setSaved((s) => ({ ...s, [r.slug]: outcome })))
      .catch((e: Error) => { setSaved((s) => { const next = { ...s }; delete next[r.slug]; return next; }); setMessage(e.message); });
  };

  // Published recipes are public, so the cards load even before (or without) a session.
  useEffect(() => {
    Promise.all([trendingRecipes(30).catch(() => []), listCuratedRecipes().catch(() => [])]).then(([trend, all]) => {
      const bySlug = new Map(all.map((r) => [r.slug, r]));
      const items = trend.flatMap((t) => (bySlug.has(t.recipe_slug) ? [{ ...bySlug.get(t.recipe_slug)!, uses: Number(t.uses) }] : []));
      setPopular(items.length ? { trending: true, items: items.slice(0, 3) } : { trending: false, items: photosFirst(all).slice(0, 3) });
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
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

  return (
    <>
      <PageHeader title="Your" accent="Kitchen" subtitle="Turn your ingredients into amazing recipes." />
      {error && <ErrorNote>{error}</ErrorNote>}
      {prefs && !prefs.onboarded && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tell us your tastes and allergies so recommendations fit you. <Link to="/onboarding" className="font-bold underline">Finish setting up</Link>
        </p>
      )}

      <section className="card relative p-6 sm:px-11 sm:py-4 lg:min-h-[18.1rem]" aria-labelledby="counter-heading">
        {/* Photo on its own clipped layer, so the search dropdown below can still overflow the card. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-r from-[#fff7f2] via-[#fdebe4] to-[#f9dfd3]" aria-hidden="true">
          {/* Wider screens: the whole photo docked on the right, its left edge fading into the card colour. */}
          <div className="absolute inset-y-0 right-0 hidden w-[52%] bg-cover bg-center md:block"
            style={{ backgroundImage: `url(${imageUrl(IMAGES.kitchenHero)})`, ...HERO_FADE }} />
          {/* Phones: too narrow for a side photo, so a faint full-card photo instead. */}
          <div className="absolute inset-0 bg-cover bg-center opacity-15 md:hidden" style={{ backgroundImage: `url(${imageUrl(IMAGES.kitchenHero)})` }} />
        </div>
        <div className="relative">
        <h2 id="counter-heading" className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[3.25rem]">What’s on Your <span className="text-crimson">Counter?</span></h2>
        <p className="mt-2 text-stone-800 lg:text-[1.35rem]">Add ingredients, choose your taste, and get personalized recipe recommendations.</p>
        <div className="relative mt-4 max-w-[50.300rem] lg:-ml-4">
          <label className="flex items-center gap-4 rounded-full bg-white py-1.5 pl-[0.95rem] pr-4 shadow-[0_4px_16px_-6px_rgb(190_70_50/0.25)] focus-within:ring-2 focus-within:ring-crimson/40">
            <span className="grid h-[3.1rem] w-[3.9rem] shrink-0 place-items-center rounded-full bg-[#e0162f] text-white"><Search size={26} aria-hidden="true" /></span>
            <span className="sr-only">Search ingredients</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search or add ingredients (e.g., Chicken, Tomato, Onion...)"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-500 lg:text-[1.2rem]" role="combobox" aria-expanded={matches.length > 0} aria-controls="kitchen-matches" />
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
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="font-medium lg:text-[1.2rem]">Quick Add:</span>
          {QUICK_ADD.filter((n) => catalog?.some((i) => i.name === n)).map((n) => {
            const item = catalog!.find((i) => i.name === n)!;
            return (
              <button key={n} type="button" className="pill" onClick={() => tryAdd(n)} aria-pressed={selection.ingredients.includes(n)}>
                <IngredientBadge name={n} category={item.category} size={30} />{shortName(n)}
              </button>
            );
          })}
          <Link to="/select" className="pill"><Plus size={22} className="rounded-full border border-rose-200 p-0.5 text-crimson" />More</Link>
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
        </div>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.03fr_1.03fr_1.02fr_1fr]">
        <Link to="/recommendations" className={FEATURE}>
          <ChefHatMark className="h-12 w-14 shrink-0" />
          <span><span className={FEATURE_TITLE}>Find Recipes</span><span className={FEATURE_TEXT}>Cook with what you have.</span></span>
        </Link>
        <Link to="/select" className={FEATURE}>
          <Link2 size={50} strokeWidth={2.1} className="shrink-0 -rotate-12 text-crimson" aria-hidden="true" />
          <span><span className={FEATURE_TITLE}>Smart <span className="text-crimson-deep">Matching</span></span><span className={FEATURE_TEXT}>AI-powered ingredient pairing.</span></span>
        </Link>
        <Link to="/settings?tab=diet" className={FEATURE}>
          <CookingPot size={48} strokeWidth={1.9} className="shrink-0 text-ember" aria-hidden="true" />
          <span><span className={FEATURE_TITLE}>Healthy &amp; Nutritious</span><span className={FEATURE_TEXT}>Calories, nutrition and diet info.</span></span>
        </Link>
        <Link to="/settings" className={FEATURE}>
          <ChartNoAxesColumnIncreasing size={46} strokeWidth={2.6} className="shrink-0 text-crimson" aria-hidden="true" />
          <span><span className={FEATURE_TITLE}>Personalized for You</span><span className={FEATURE_TEXT}>Based on your taste &amp; preferences.</span></span>
        </Link>
      </div>

      <div className="mt-[1.6rem] grid gap-4 xl:grid-cols-[minmax(0,39fr)_minmax(0,61fr)]">
        <Card title="Quick Recipe Generator" icon={Zap} iconClass="fill-ember text-ember" className="!p-[1.05rem]">
          <p className="flex items-center gap-2 font-medium"><Flame size={22} className="fill-ember text-crimson" aria-hidden="true" />Taste Preference</p>
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            {TASTE_PRESETS.map((p) => (
              <button key={p.label} type="button" className="pill grow justify-center" aria-pressed={presetActive(selection.tastes, p)}
                onClick={() => setTastes(togglePreset(selection.tastes, p))}>{p.label}</button>
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 font-medium"><Leaf size={22} className="fill-green-600 text-green-700" aria-hidden="true" />Diet &amp; Allergies (Optional)</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-1 xl:flex-nowrap">
            {DIETS.map((d) => (
              <label key={d.key} className="pill cursor-pointer !gap-1 !px-1.5 !py-1.5 !text-[0.8rem] tracking-tight">
                <input type="checkbox" className="h-3.5 w-3.5 accent-crimson" checked={selection.diets.includes(d.key)} onChange={() => toggleDiet(d.key)} />{d.label}
              </label>
            ))}
            <Link to="/settings?tab=diet" className="pill !gap-0.5 !px-2 !py-1.5 !text-[0.8rem] tracking-tight">Allergies<ChevronDown size={15} aria-hidden="true" /></Link>
          </div>
          <button type="button" className="btn-primary mt-5 h-[3.75rem] w-full lg:text-[1.25rem]" onClick={generate}>
            <Sparkles size={24} className="fill-white" aria-hidden="true" />Generate Recipes Now<ArrowRight size={24} aria-hidden="true" />
          </button>
        </Card>

        <Card title="Popular & Trending Recipes" icon={Trophy} iconClass="fill-gold text-gold"
          action={<Link to="/recipes?tab=browse" className="btn-sm bg-white/90 !text-[0.98rem] text-crimson-deep shadow-sm">View All<ArrowRight size={18} /></Link>}>
          {popular === null ? <Spinner /> : popular.items.length === 0 ? (
            <EmptyState title="No published recipes yet">An administrator needs to publish curated recipes first.</EmptyState>
          ) : (
            <>
                            <ul className="grid gap-4 sm:grid-cols-3">
                {popular.items.map((r) => (
                  <li key={r.slug} className="relative rounded-[1.25rem] bg-white/80 p-4 shadow-sm">
                    <Link to={`/recipe/${r.slug}`} className="block">
                      <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} height="h-[8.3rem]" rounded="rounded-xl" />
                      <span className="absolute right-2 top-[1.1rem] rounded-full bg-[#b7f5c8] px-3 py-1 text-[0.9rem] font-semibold text-emerald-950">
                        {r.uses !== undefined ? `${r.uses} recent ${r.uses === 1 ? 'use' : 'uses'}` : 'Featured'}
                      </span>
                      <p className="mt-3 pr-12 text-[1.15rem] font-semibold leading-tight tracking-tight">{r.name}</p>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pr-12 text-[0.95rem] text-stone-800">
                        <span className="inline-flex items-center gap-1.5"><Clock size={18} aria-hidden="true" />{r.minutes} min</span>
                        <span className="inline-flex items-center gap-1.5"><Users size={18} aria-hidden="true" />{r.servings} servings</span>
                      </p>
                    </Link>
                    <button type="button" onClick={() => save(r)} disabled={!userId || saved[r.slug] === 'saving'}
                      aria-label={saved[r.slug] ? `${r.name} saved` : `Save ${r.name}`} title={userId ? undefined : 'Log in to save recipes'}
                      className="absolute bottom-6 right-3 grid h-11 w-11 place-items-center rounded-full border border-rose-200 bg-white text-crimson shadow-sm transition hover:bg-rose-50">
                      <Heart size={22} className={saved[r.slug] && saved[r.slug] !== 'saving' ? 'fill-current' : ''} />
                    </button>
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
