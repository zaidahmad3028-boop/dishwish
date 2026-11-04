import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CircleCheck, Flame, LayoutGrid, Leaf, List, Network, Plus, ShieldCheck, ShoppingBasket, Star, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { CategoryIcon, IngredientBadge, IngredientHero } from '../components/DishArt';
import { Card, ChefHatMark, ErrorNote, PageHeader, SearchBox, Spinner } from '../components/ui';
import { ALL_DIETS, checkCompatibility, compatibilityVerdict, type CompatibilityReport } from '../lib/curatedApi';
import { blockReason, effectiveAllergenTags } from '../lib/preferences';
import { MAX_SELECTED, presetActive, TASTE_PRESETS, togglePreset, useSeedTastes, useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';

// The reference design's first screen, in its order; everything else follows alphabetically.
const FIRST = ['Chicken Breast', 'Tomato', 'Onion', 'Garlic', 'Ginger', 'Potato', 'Green Chilli', 'Capsicum', 'Carrot', 'Cauliflower', 'Yogurt (Dahi)', 'Milk', 'Eggs', 'Fresh Coriander', 'Lemon'];
const rank = (name: string) => { const i = FIRST.indexOf(name); return i === -1 ? FIRST.length : i; };
const PAGE = 15; // three rows of five, as in the design; "Show more" adds the next rows

export function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { icon: ShoppingBasket, label: 'Select Ingredients', to: '/select' },
    { icon: Flame, label: 'Set Preferences', to: '/select#preferences' },
    { icon: Network, label: 'Check Compatibility', to: '/select#compatibility' },
    { label: 'Get Recommendations', to: '/recommendations' },
  ];
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2 xl:flex-nowrap xl:gap-3" aria-label="Progress">
      {steps.map(({ icon: Icon, label, to }, i) => {
        const state = i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2 xl:flex-1 xl:gap-3">
            <Link to={to} aria-current={state === 'current' ? 'step' : undefined}
              className={`flex min-h-[3.4rem] w-full items-center gap-4 whitespace-nowrap rounded-full px-7 text-[1.15rem] font-semibold tracking-tight shadow-sm transition ${state === 'current'
                ? 'bg-gradient-to-r from-[#dc1029] via-[#ea2526] to-ember text-white' : 'bg-white/75 hover:bg-white'}`}>
              {state === 'done' ? <Check size={28} className="text-green-600" /> : Icon
                ? <Icon size={30} className={state === 'current' ? '' : 'text-crimson'} aria-hidden="true" />
                : <ChefHatMark className="h-7 w-8" />}
              {label}
            </Link>
            {i < steps.length - 1 && <ArrowRight size={24} className="hidden shrink-0 text-crimson xl:block" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function IngredientSelectionPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { catalog, prefs, error } = useKitchenData(session?.user.id);
  const { selection, add, remove, clear, setTastes, toggleDiet } = useSelection();
  useSeedTastes(prefs?.tastes);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [reportError, setReportError] = useState('');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    (catalog ?? []).forEach((i) => counts.set(i.category, (counts.get(i.category) ?? 0) + 1));
    return [['All', catalog?.length ?? 0] as const, ...[...counts.entries()].sort()];
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog ?? []).filter((i) => (category === 'All' || i.category === category) && (!q || i.name.toLowerCase().includes(q)))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  }, [catalog, category, query]);

  useEffect(() => { setLimit(PAGE); }, [category, query]);

  const key = selection.ingredients.join('|');
  useEffect(() => {
    if (!prefs || selection.ingredients.length === 0) { setReport(null); return; }
    let live = true;
    setReportError('');
    checkCompatibility(selection.ingredients, prefs)
      .then((r) => { if (live) setReport(r); })
      .catch((e: Error) => { if (live) { setReport(null); setReportError(e.message); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, prefs]);

  const toggle = (name: string, reason: string | null) => {
    if (selection.ingredients.includes(name)) { remove(name); setMessage(''); return; }
    if (reason) { setMessage(`${name} is blocked: ${reason}.`); return; }
    if (!add(name)) setMessage(selection.ingredients.length >= MAX_SELECTED ? `You can select up to ${MAX_SELECTED} ingredients.` : `${name} is already selected.`);
    else setMessage('');
  };

  const verdict = compatibilityVerdict(report?.average ?? null);
  const canContinue = selection.ingredients.length >= 2;
  const noAllergies = prefs ? effectiveAllergenTags(prefs).length === 0 && prefs.customAllergens.length === 0 : true;
  const byName = new Map((catalog ?? []).map((i) => [i.name, i]));

  return (
    <>
      <PageHeader title="Select Your" accent="Ingredients"
        subtitle="Choose at least 2 ingredients. We’ll check compatibility, apply your preferences, and recommend the best meals." />
      <StepBar step={1} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {catalog === null ? <Spinner label="Loading ingredients" /> : (
        <div className="grid gap-4 xl:grid-cols-[15.3rem_minmax(0,1fr)_22.800rem] xl:gap-x-[1rem]">
          <Card title="Ingredient Categories" icon={LayoutGrid} className="min-w-0 !p-3 [&_h2]:!text-[1.2rem] [&_h2]:whitespace-nowrap">
            <ul className="flex gap-1 overflow-x-auto xl:flex-col" role="tablist" aria-label="Ingredient categories">
              {categories.map(([name, count]) => (
                <li key={name}>
                  <button type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)}
                    className={`flex min-h-[2.9rem] w-full items-center gap-2 whitespace-nowrap rounded-2xl px-2 text-[0.94rem] font-medium tracking-tight transition ${category === name ? 'bg-rose-100/80' : 'hover:bg-white/70'}`}>
                    {name === 'All' ? <LayoutGrid size={24} className="shrink-0 text-crimson" aria-hidden="true" /> : <CategoryIcon category={name} />}
                    <span className="min-w-0 flex-1 truncate text-left">{name === 'All' ? 'All Ingredients' : name}</span>
                    <span className={`rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold shadow-sm ${category === name ? 'text-crimson' : ''}`}>{count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <section aria-label="Ingredients" className="card min-w-0 p-4">
            <div className="flex items-center gap-3">
              <SearchBox value={query} onChange={setQuery} label="Search ingredients" placeholder="Search ingredients, e.g., Chicken, Tomato, Onion..." />
              <span className="flex shrink-0 rounded-full bg-white shadow-sm">
                <button type="button" className={`grid h-11 w-14 place-items-center rounded-full ${view === 'grid' ? 'bg-[#e0162f] text-white' : 'text-ink'}`} aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid view"><LayoutGrid size={22} /></button>
                <button type="button" className={`grid h-11 w-14 place-items-center rounded-full ${view === 'list' ? 'bg-[#e0162f] text-white' : 'text-ink'}`} aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="List view"><List size={22} /></button>
              </span>
            </div>
            {message && <p role="status" className="mt-3 text-sm font-semibold text-rose-700">{message}</p>}
            <ul className={`mt-4 grid gap-2.5 ${view === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1'}`}>
              {filtered.slice(0, limit).map((item) => {
                const picked = selection.ingredients.includes(item.name);
                const reason = prefs ? blockReason(item.name, item.allergens, prefs) : null;
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => toggle(item.name, reason)} aria-pressed={picked}
                      aria-label={reason ? `${item.name}, blocked: ${reason}` : picked ? `Remove ${item.name}` : `Add ${item.name}`}
                      className={`relative flex h-full w-full rounded-2xl border border-white text-left shadow-[0_2px_10px_-4px_rgb(190_70_50/0.3)] transition hover:-translate-y-0.5
                        ${view === 'grid' ? 'flex-col px-3 pb-3 pt-2' : 'items-center gap-3 p-3'} ${picked ? 'bg-rose-100/70' : 'bg-white/70'} ${reason ? 'opacity-60' : ''}`}>
                      {view === 'grid' ? (
                        <>
                          {/* Reference layout: big floating picture, name bottom-left, + bottom-right, check top-right. */}
                          <span className="relative block aspect-[4/3] w-full"><IngredientHero name={item.name} category={item.category} /></span>
                          <span className="mt-1 flex items-center justify-between gap-1">
                            <span className="min-w-0 text-[0.98rem] font-semibold leading-tight tracking-tight">{item.name}
                              {reason && <span className="block text-[11px] font-semibold text-rose-700">{reason}</span>}</span>
                            {!picked && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-rose-200 bg-white text-crimson" aria-hidden="true"><Plus size={15} /></span>}
                          </span>
                          {picked && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-crimson text-white shadow" aria-hidden="true"><Check size={15} /></span>}
                        </>
                      ) : (
                        <>
                          <IngredientBadge name={item.name} category={item.category} size={40} />
                          <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{item.name}
                            {reason && <span className="block text-[11px] font-semibold text-rose-700">{reason}</span>}</span>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${picked ? 'bg-crimson text-white' : 'border border-rose-200 bg-white text-crimson'}`} aria-hidden="true">
                            {picked ? <Check size={15} /> : <Plus size={15} />}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length === 0 && <p className="mt-6 text-center text-sm text-stone-500">No ingredients match “{query}”.</p>}
            {filtered.length > limit && (
              <div className="mt-4 text-center"><button type="button" className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} left)</button></div>
            )}

            </section>

          <Card title="Suggested Additions (Optional)" icon={Star} iconClass="fill-gold text-gold" className="xl:col-span-2 xl:col-start-1 xl:row-start-2">
              <p className="-mt-2 mb-3 text-sm text-stone-600">These ingredients are connected to your selection in the compatibility graph.</p>
              {!report || report.suggestions.length === 0 ? (
                <p className="text-sm text-stone-500">{selection.ingredients.length ? 'No graph suggestions for this selection.' : 'Select an ingredient to see suggestions.'}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {report.suggestions.map((s) => (
                    <li key={s.name}>
                      <button type="button" className="pill" onClick={() => toggle(s.name, null)} aria-label={`Add ${s.name}`}>
                        <IngredientBadge name={s.name} category={s.category} size={22} />{s.name}
                        <span className="text-xs text-stone-500">{s.support.toFixed(2)}</span><Plus size={14} className="text-crimson" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

          <div className="flex flex-col gap-4 xl:row-span-2 xl:col-start-3 xl:row-start-1 [&_h2]:!text-[1.35rem] [&_h2]:whitespace-nowrap">
            <Card title="Selection Summary" icon={ShoppingBasket}
              action={selection.ingredients.length > 0 && <button type="button" className="font-semibold text-crimson underline" onClick={clear}>Clear All</button>}>
              <p className="-mt-1 font-display text-xl font-bold">{selection.ingredients.length} Ingredient{selection.ingredients.length === 1 ? '' : 's'} Selected</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selection.ingredients.map((n) => (
                  <li key={n} className="inline-flex items-center gap-2 rounded-full bg-rose-50 py-1 pl-1 pr-1 font-medium shadow-sm">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white"><IngredientBadge name={n} category={byName.get(n)?.category ?? ''} size={32} /></span>{n}
                    <button type="button" className="icon-btn h-7 w-7 !text-crimson" onClick={() => remove(n)} aria-label={`Remove ${n}`}><X size={17} /></button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Taste Preference" icon={Flame} iconClass="fill-ember text-crimson" id="preferences">
              <div className="flex justify-between gap-1">
                {TASTE_PRESETS.map((p) => (
                  <button key={p.label} type="button" className="pill grow justify-center !px-2 !text-[0.95rem]" aria-pressed={presetActive(selection.tastes, p)}
                    onClick={() => setTastes(togglePreset(selection.tastes, p))}>{p.label}</button>
                ))}
              </div>
            </Card>
            <Card title="Diet & Allergies (Optional)" icon={Leaf} iconClass="fill-green-600 text-green-700">
              <div className="grid grid-cols-3 gap-x-2 gap-y-3 text-[0.92rem] tracking-tight">
                <label className="flex items-center gap-2 whitespace-nowrap" title="Your allergies are managed in Settings and always enforced">
                  <input type="checkbox" className="h-[1.15rem] w-[1.15rem] accent-crimson" checked={noAllergies} onChange={() => navigate('/settings?tab=diet')} />No Allergies
                </label>
                {ALL_DIETS.map((d) => (
                  <label key={d.key} className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" className="h-[1.15rem] w-[1.15rem] accent-crimson"
                    checked={selection.diets.includes(d.key)} onChange={() => toggleDiet(d.key)} />{d.label}</label>
                ))}
              </div>
            </Card>
            <section id="compatibility" aria-label="Compatibility check"
              className={`card flex items-start gap-3 !border-green-100 px-5 py-4 ${verdict.tone === 'green' ? '!bg-green-100/70' : verdict.tone === 'amber' ? 'bg-amber-50/90' : verdict.tone === 'red' ? 'bg-rose-50/90' : ''}`}>
              <ShieldCheck size={38} className={verdict.tone === 'green' ? 'text-green-600' : verdict.tone === 'red' ? 'text-rose-600' : 'text-amber-600'} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-[0.95rem]">
                <p className="font-display text-xl font-bold">Compatibility Check</p>
                <p>{verdict.label}{report?.average !== null && report?.average !== undefined && <> (average {report.average.toFixed(2)})</>}</p>
                {reportError && <p className="mt-1 text-rose-700">{reportError}</p>}
                {report && report.pairs.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold">Pair details</summary>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {report.pairs.slice(0, 15).map((p) => <li key={`${p.a}-${p.b}`}>{p.a} + {p.b}: <strong>{p.weight.toFixed(2)}</strong> · {p.evidence}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              {verdict.tone === 'green' && <CircleCheck size={28} className="mt-3 shrink-0 fill-green-600 text-white" aria-hidden="true" />}
            </section>
            <button type="button" className="btn-primary h-[3.6rem] lg:text-[1.2rem]" disabled={!canContinue} onClick={() => navigate('/recommendations')}>
              Continue to Recommendations<ArrowRight size={18} aria-hidden="true" />
            </button>
            {!canContinue && <p className="-mt-2 text-center text-xs text-stone-500">Select at least 2 different ingredients to continue.</p>}
          </div>
        </div>
      )}
    </>
  );
}
