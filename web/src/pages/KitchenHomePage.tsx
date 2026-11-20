import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Heart, Plus, Search, Sparkles, Trophy, Users, X, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { IngredientBadge, RecipeCardImage } from '../components/DishArt';
import { Card, ChefHatMark, EmptyState, ErrorNote, PageHeader, Spinner, formatDate } from '../components/ui';
import { listCuratedRecipes, listEvents, saveCurated, trendingRecipes, type CuratedSummary, type RecipeEvent } from '../lib/curatedApi';
import { blockReason } from '../lib/preferences';
import { useSeedTastes, useSelection } from '../lib/selection';
import { QuickPreferences } from '../components/QuickPreferences';
import { IMAGES, imageUrl, photosFirst, recipeImage } from '../lib/images';
import { useLiveTick } from '../lib/useLiveTick';
import { useKitchenData } from '../lib/useKitchenData';

const QUICK_ADD = ['Chicken Breast', 'Tomato', 'Onion', 'Garlic'];
const HERO_FADE = { maskImage: 'linear-gradient(to right, transparent, black 22%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 22%)' };
const FEATURE = 'card flex items-center gap-[1.05rem] px-[1.2rem] py-3 transition hover:-translate-y-0.5 hover:shadow-lg';
const FEATURE_TITLE = 'block whitespace-nowrap font-display text-[1.22rem] font-bold leading-tight tracking-tight';
const FEATURE_TEXT = 'mt-0.5 block whitespace-nowrap text-[0.92rem] tracking-tight text-stone-800';
const shortName = (n: string) => n.replace(/\s*\(.*\)$/, '').replace(/^Chicken Breast$/, 'Chicken');
// The design's own chip pictures. Other pages keep the regular catalog pictures.
const CHIP_PICTURE: Record<string, string> = { 'Chicken Breast': 'chip-chicken', Tomato: 'chip-tomato', Onion: 'chip-onion', Garlic: 'chip-garlic' };

function MatchingIcon() {
  return (
    <svg viewBox="0 0 56 56" className="h-[3.3rem] w-[3.3rem] shrink-0" fill="none" stroke="#e8192c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 32a11 11 0 0 0 16 1l8-8a11 11 0 0 0-16-16l-4 4" /><path d="M32 24a11 11 0 0 0-16-1l-8 8a11 11 0 0 0 16 16l4-4" />
    </svg>
  );
}

function HealthyIcon() {
  return (
    <svg viewBox="0 0 56 56" className="h-[3.3rem] w-[3.3rem] shrink-0" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 28h44c0 10-5 17-12 20H18C11 45 6 38 6 28z" stroke="#f97316" strokeWidth="3.6" fill="#fff4e8" />
      <path d="M28 8v10M15 11l5 8M41 11l-5 8" stroke="#e8192c" strokeWidth="3.6" /><path d="M21 22l7 4 7-4" stroke="#e8192c" strokeWidth="3" />
    </svg>
  );
}

function PersonalIcon() {
  return (
    <svg viewBox="0 0 56 56" className="h-[3.3rem] w-[3.3rem] shrink-0" aria-hidden="true">
      <defs><linearGradient id="bar-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" /><stop offset="100%" stopColor="#e8192c" /></linearGradient></defs>
      {[[5, 38, 12], [17, 30, 20], [29, 24, 26], [41, 15, 35]].map(([x, y, h]) => <rect key={x} x={x} y={y} width="9" height={h} rx="2" fill="url(#bar-fill)" />)}
      <path d="M5 28 19 19l10 3 15-14" fill="none" stroke="#e8192c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47 11c-3-2-5-4-5-6.500 0-2 2-3 3.500-2 .7.400 1.200 1 1.500 1.500.300-.5.800-1.100 1.500-1.500 1.500-1 3.500 0 3.500 2C52 7 50 9 47 11z" fill="#e8192c" />
    </svg>
  );
}

export function KitchenHomePage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const { catalog, prefs, error } = useKitchenData(userId);
  const { selection, add, remove } = useSelection();
  useSeedTastes(prefs?.tastes);
  const tick = useLiveTick(['curated_recipes', 'recipe_events']);
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
  }, [userId, tick]);

  useEffect(() => {
    if (!userId) return;
    listEvents(userId, 30).then((rows) => setRecent(rows.filter((r) => r.kind === 'generated').slice(0, 3))).catch(() => { if (!tick) setRecent([]); });
  }, [userId, tick]);

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
    <div className="kitchen-page">
      <PageHeader title="Your" accent="Kitchen" subtitle="Turn your ingredients into amazing recipes." />
      {error && <ErrorNote>{error}</ErrorNote>}
      {prefs && !prefs.onboarded && !Object.values(prefs.tastes).some(Boolean) && prefs.allergens.length === 0 && !prefs.calorieTier && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tell us your tastes and allergies so recommendations fit you. <Link to="/onboarding" className="font-bold underline">Finish setting up</Link>
        </p>
      )}

      <section className="card relative p-6 sm:px-10 sm:pb-4 sm:pt-5 lg:min-h-[14.5rem]" aria-labelledby="counter-heading">
        {/* Photo on its own clipped layer, so the search dropdown below can still overflow the card. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-r from-[#fff7f2] via-[#fdebe4] to-[#f9dfd3]" aria-hidden="true">
          {/* Wider screens: the photo docked on the right at the design's scale, its left edge fading into the card colour. */}
          <img src={imageUrl(IMAGES.kitchenHero)} alt="" className="absolute -top-[3.2rem] right-0 hidden w-[34rem] max-w-[42%] md:block" style={HERO_FADE} />
          {/* Phones: too narrow for a side photo, so a faint full-card photo instead. */}
          <div className="absolute inset-0 bg-cover bg-center opacity-15 md:hidden" style={{ backgroundImage: `url(${imageUrl(IMAGES.kitchenHero)})` }} />
        </div>
        <div className="relative">
        <h2 id="counter-heading" className="font-display text-3xl font-extrabold leading-none tracking-tight sm:text-4xl lg:text-[2.85rem]">What’s on Your <span className="text-crimson">Counter?</span></h2>
        <p className="mt-2 text-stone-900 lg:text-[1.2rem] lg:leading-tight">Add ingredients, choose your taste, and get personalized recipe recommendations.</p>
        <div className="relative mt-3 max-w-[50.3rem] lg:-ml-4">
          <label className="flex items-center gap-4 rounded-full bg-white py-[0.42rem] pl-[0.95rem] pr-4 shadow-[0_4px_16px_-6px_rgb(190_70_50/0.25)] focus-within:ring-2 focus-within:ring-crimson/40">
            <span className="grid h-[3rem] w-[3.9rem] shrink-0 place-items-center rounded-full bg-[#e0162f] text-white"><Search size={26} aria-hidden="true" /></span>
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-medium lg:text-[1.2rem]">Quick Add:</span>
          {QUICK_ADD.filter((n) => catalog?.some((i) => i.name === n)).map((n) => {
            return (
              <button key={n} type="button" className="pill h-11 !gap-2 !px-3.5 !text-[1.08rem]" onClick={() => tryAdd(n)} aria-pressed={selection.ingredients.includes(n)}>
                <img src={imageUrl(`kitchen/${CHIP_PICTURE[n]}.webp`)} alt="" aria-hidden="true" className="h-[1.9rem] w-[1.9rem] object-contain" />{shortName(n)}
              </button>
            );
          })}
          <Link to="/select" className="pill h-11 !gap-2 !px-3.5 !text-[1.08rem]"><Plus size={24} className="rounded-full border border-rose-200 p-0.5 text-crimson" />More</Link>
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

      <div className="mt-4 grid gap-[1.1rem] xl:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
        <Card title="Quick Recipe Generator" icon={Zap} iconClass="fill-ember text-ember" className="!p-[1.05rem]">
          <QuickPreferences userId={userId} prefs={prefs} />
          <button type="button" className="btn-primary mt-3 h-[3.2rem] w-full lg:text-[1.15rem]" onClick={generate}>
            <Sparkles size={24} className="fill-white" aria-hidden="true" />Generate Recipes Now<ArrowRight size={24} aria-hidden="true" />
          </button>
        </Card>

        <Card title="Popular & Trending Recipes" icon={Trophy} iconClass="fill-gold text-gold" className="!p-[0.95rem]"
          action={<Link to="/recipes?tab=browse" className="btn-sm bg-white/90 !text-[0.98rem] text-crimson-deep shadow-sm">View All<ArrowRight size={18} /></Link>}>
          {popular === null ? <Spinner /> : popular.items.length === 0 ? (
            <EmptyState title="No published recipes yet">An administrator needs to publish curated recipes first.</EmptyState>
          ) : (
            <>
                            <ul className="grid gap-4 sm:grid-cols-3">
                {popular.items.map((r) => (
                  <li key={r.slug} className="relative rounded-[1.25rem] bg-white/80 p-4 shadow-sm">
                    <Link to={`/recipe/${r.slug}`} className="block">
                      <RecipeCardImage category={r.category} imageUrl={recipeImage(r.slug, r.image_url)} name={r.name} rounded="rounded-xl" />
                      <span className="absolute -right-0.5 top-[1.1rem] rounded-full bg-[#b7f5c8] px-3 py-1 text-[0.9rem] font-semibold text-emerald-950">
                        {r.uses !== undefined ? `${r.uses} recent ${r.uses === 1 ? 'use' : 'uses'}` : 'Featured'}
                      </span>
                      <p className="mt-3 truncate pr-2 text-[1.18rem] font-semibold leading-tight tracking-tight">{r.name}</p>
                      <p className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 pr-11 text-[0.92rem] text-stone-800 xl:flex-nowrap xl:whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><Clock size={18} aria-hidden="true" />{r.minutes} min</span>
                        <span className="inline-flex items-center gap-1"><Users size={18} aria-hidden="true" />{r.servings} servings</span>
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

      <div className="mt-4 grid gap-[1.2rem] sm:grid-cols-2 xl:grid-cols-[1.02fr_1.015fr_1.005fr_1fr]">
        <Link to="/recommendations" className={FEATURE}>
          <ChefHatMark className="h-[3.4rem] w-[4rem] shrink-0" />
          <span><span className={FEATURE_TITLE}>Find Recipes</span><span className={FEATURE_TEXT}>Cook with what you have.</span></span>
        </Link>
        <Link to="/select" className={FEATURE}>
          <MatchingIcon />
          <span><span className={FEATURE_TITLE}>Smart <span className="text-crimson-deep">Matching</span></span><span className={FEATURE_TEXT}>AI-powered ingredient pairing.</span></span>
        </Link>
        <Link to="/settings?tab=diet" className={FEATURE}>
          <HealthyIcon />
          <span><span className={FEATURE_TITLE}>Healthy &amp; Nutritious</span><span className={FEATURE_TEXT}>Calories, nutrition and diet info.</span></span>
        </Link>
        <Link to="/settings" className={FEATURE}>
          <PersonalIcon />
          <span><span className={FEATURE_TITLE}>Personalized for You</span><span className={FEATURE_TEXT}>Based on your taste &amp; preferences.</span></span>
        </Link>
      </div>

      <Card title="Recently Generated" icon={Clock} className="mt-4"
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
    </div>
  );
}
