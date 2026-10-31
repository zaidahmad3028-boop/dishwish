import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChefHat, Flame, LayoutGrid, Leaf, List, Network, Plus, ShieldCheck, ShoppingBasket, Star, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { IngredientBadge } from '../components/DishArt';
import { Card, ErrorNote, PageHeader, SearchBox, Spinner } from '../components/ui';
import { checkCompatibility, compatibilityVerdict, DIETS, type CompatibilityReport } from '../lib/curatedApi';
import { blockReason } from '../lib/preferences';
import { MAX_SELECTED, presetActive, TASTE_PRESETS, togglePreset, useSeedTastes, useSelection } from '../lib/selection';
import { useKitchenData } from '../lib/useKitchenData';

const PAGE = 30;

export function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { icon: ShoppingBasket, label: 'Select Ingredients', to: '/select' },
    { icon: Flame, label: 'Set Preferences', to: '/select#preferences' },
    { icon: Network, label: 'Check Compatibility', to: '/select#compatibility' },
    { icon: ChefHat, label: 'Get Recommendations', to: '/recommendations' },
  ];
  return (
    <ol className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Progress">
      {steps.map(({ icon: Icon, label, to }, i) => {
        const state = i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'todo';
        return (
          <li key={label}>
            <Link to={to} aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-3 rounded-full px-5 py-3 font-semibold shadow-sm transition ${state === 'current'
                ? 'bg-gradient-to-r from-crimson to-ember text-white' : 'bg-white/80 hover:bg-white'}`}>
              {state === 'done' ? <Check size={20} className="text-green-600" /> : <Icon size={20} className={state === 'current' ? '' : 'text-crimson'} />}
              {label}
            </Link>
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
    return (catalog ?? []).filter((i) => (category === 'All' || i.category === category) && (!q || i.name.toLowerCase().includes(q)));
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
  const byName = new Map((catalog ?? []).map((i) => [i.name, i]));

  return (
    <>
      <PageHeader title="Select Your" accent="Ingredients"
        subtitle="Choose at least 2 ingredients. We’ll check compatibility, apply your preferences, and recommend the best meals." />
      <StepBar step={1} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {catalog === null ? <Spinner label="Loading ingredients" /> : (
        <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
          <Card title="Categories" className="h-fit min-w-0">
            <ul className="flex gap-2 overflow-x-auto xl:flex-col" role="tablist" aria-label="Ingredient categories">
              {categories.map(([name, count]) => (
                <li key={name}>
                  <button type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)}
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${category === name ? 'bg-rose-50 text-crimson' : 'hover:bg-white'}`}>
                    {name === 'All' ? 'All Ingredients' : name}<span className="badge badge-gray">{count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <section aria-label="Ingredients" className="min-w-0">
            <div className="flex items-center gap-2">
              <SearchBox value={query} onChange={setQuery} label="Search ingredients" placeholder="Search ingredients, e.g., Chicken, Tomato, Onion..." />
              <button type="button" className="icon-btn" aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid view"><LayoutGrid size={18} /></button>
              <button type="button" className="icon-btn" aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="List view"><List size={18} /></button>
            </div>
            {message && <p role="status" className="mt-3 text-sm font-semibold text-rose-700">{message}</p>}
            <ul className={`mt-4 grid gap-3 ${view === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-1'}`}>
              {filtered.slice(0, limit).map((item) => {
                const picked = selection.ingredients.includes(item.name);
                const reason = prefs ? blockReason(item.name, item.allergens, prefs) : null;
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => toggle(item.name, reason)} aria-pressed={picked}
                      aria-label={reason ? `${item.name}, blocked: ${reason}` : picked ? `Remove ${item.name}` : `Add ${item.name}`}
                      className={`card relative flex h-full w-full items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 ${view === 'grid' ? 'flex-col justify-center text-center' : ''}
                        ${picked ? 'ring-2 ring-crimson' : ''} ${reason ? 'opacity-60' : ''}`}>
                      <IngredientBadge name={item.name} category={item.category} size={view === 'grid' ? 56 : 36} />
                      <span className="text-sm font-semibold leading-snug">{item.name}
                        {reason && <span className="block text-[11px] font-semibold text-rose-700">{reason}</span>}</span>
                      <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full ${picked ? 'bg-crimson text-white' : 'bg-rose-50 text-crimson'}`} aria-hidden="true">
                        {picked ? <Check size={14} /> : <Plus size={14} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length === 0 && <p className="mt-6 text-center text-sm text-stone-500">No ingredients match “{query}”.</p>}
            {filtered.length > limit && (
              <div className="mt-4 text-center"><button type="button" className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} left)</button></div>
            )}

            <Card title="Suggested Additions (Optional)" icon={Star} className="mt-6">
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
          </section>

          <div className="flex flex-col gap-4">
            <Card title="Selection Summary" icon={ShoppingBasket}
              action={selection.ingredients.length > 0 && <button type="button" className="text-sm font-semibold text-crimson underline" onClick={clear}>Clear All</button>}>
              <p className="font-semibold">{selection.ingredients.length} Ingredient{selection.ingredients.length === 1 ? '' : 's'} Selected</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selection.ingredients.map((n) => (
                  <li key={n} className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-1 text-sm font-semibold shadow-sm">
                    <IngredientBadge name={n} category={byName.get(n)?.category ?? ''} size={24} />{n}
                    <button type="button" className="icon-btn h-6 w-6" onClick={() => remove(n)} aria-label={`Remove ${n}`}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Taste Preference" icon={Flame} id="preferences">
              <div className="flex flex-wrap gap-2">
                {TASTE_PRESETS.map((p) => (
                  <button key={p.label} type="button" className="pill" aria-pressed={presetActive(selection.tastes, p)}
                    onClick={() => setTastes(togglePreset(selection.tastes, p))}>{p.label}</button>
                ))}
              </div>
            </Card>
            <Card title="Diet (Optional)" icon={Leaf}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {DIETS.map((d) => (
                  <label key={d.key} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-crimson"
                    checked={selection.diets.includes(d.key)} onChange={() => toggleDiet(d.key)} />{d.label}</label>
                ))}
              </div>
              <p className="mt-3 text-xs text-stone-500">Allergies come from your <Link to="/settings?tab=diet" className="font-semibold text-crimson underline">settings</Link> and are always enforced.</p>
            </Card>
            <section id="compatibility" aria-label="Compatibility check"
              className={`card flex items-start gap-3 p-4 ${verdict.tone === 'green' ? 'bg-green-50/90' : verdict.tone === 'amber' ? 'bg-amber-50/90' : verdict.tone === 'red' ? 'bg-rose-50/90' : ''}`}>
              <ShieldCheck size={30} className={verdict.tone === 'green' ? 'text-green-600' : verdict.tone === 'red' ? 'text-rose-600' : 'text-amber-600'} aria-hidden="true" />
              <div className="flex-1 text-sm">
                <p className="font-display text-lg font-bold">Compatibility Check</p>
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
            </section>
            <button type="button" className="btn-primary" disabled={!canContinue} onClick={() => navigate('/recommendations')}>
              Continue to Recommendations<ArrowRight size={18} aria-hidden="true" />
            </button>
            {!canContinue && <p className="-mt-2 text-center text-xs text-stone-500">Select at least 2 different ingredients to continue.</p>}
          </div>
        </div>
      )}
    </>
  );
}
