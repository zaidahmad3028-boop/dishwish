import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, BarChart3, CheckCircle2, Clock, Flame, Link2, Network, Plus, Sparkles, Star, Target, Users, Utensils, Layers, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { AreaTrend } from '../../components/charts';
import { IngredientBadge, RecipeCardImage } from '../../components/DishArt';
import { Bar, Card, Donut, EmptyState, ErrorNote, PageHeader, SegmentTabs, Spinner, StatCard } from '../../components/ui';
import { listEdges, listIngredients, overview, pctShort, timeseries, topIngredients, type AdminIngredient, type DayPoint, type Edge, type Overview } from '../../lib/adminApi';
import { checkCompatibility, fetchCuratedRecommendations, fetchSubstitutes, type CompatibilityReport, type CuratedMatch, type Substitute } from '../../lib/curatedApi';
import { recipeImage } from '../../lib/images';
import { emptyPreferences, type TasteKey } from '../../lib/preferences';
import { TASTE_PRESETS, togglePreset } from '../../lib/selection';
import { useLiveTick } from '../../lib/useLiveTick';
import { RangeSelect } from './AdminDashboardPage';

const short = (name: string) => name.replace(/\s*\(.*\)$/, '');
const NO_TASTE: Record<TasteKey, null> = { sweet: null, salty: null, sour: null, spicy: null };
const BANDS = [
  { label: 'Strong pairs', color: '#22a447', test: (w: number) => w >= 0.75 },
  { label: 'Moderate pairs', color: '#fbbf24', test: (w: number) => w >= 0.55 && w < 0.75 },
  { label: 'Weak pairs', color: '#e11d36', test: (w: number) => w < 0.55 },
];

// Ingredients not chosen yet, ranked by their average stored link to the chosen ones.
export function compatibleWith(selected: string[], edges: Edge[], items: { id: number; name: string }[]) {
  const ids = new Map(items.map((i) => [i.name, i.id]));
  const chosen = new Set(selected.map((n) => ids.get(n)).filter((id): id is number => id !== undefined));
  const scores = new Map<number, number[]>();
  for (const e of edges) {
    const other = chosen.has(e.ingredient_a) ? e.ingredient_b : chosen.has(e.ingredient_b) ? e.ingredient_a : null;
    if (other === null || chosen.has(other)) continue;
    scores.set(other, [...(scores.get(other) ?? []), e.weight]);
  }
  const names = new Map(items.map((i) => [i.id, i.name]));
  return [...scores].map(([id, w]) => ({ name: names.get(id) ?? '?', score: w.reduce((a, b) => a + b, 0) / w.length }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// How well each chosen ingredient pairs with the others, on average.
export function pairBreakdown(selected: string[], pairs: { a: string; b: string; weight: number }[]) {
  return selected.map((name) => {
    const own = pairs.filter((p) => p.a === name || p.b === name);
    return { name, score: own.length ? own.reduce((s, p) => s + p.weight, 0) / own.length : null };
  });
}

// Compact star of pills for the wide, short network card.
const SPOTS = [[50, 10], [80, 26], [80, 74], [50, 90], [20, 74], [20, 26]];
function NetworkPills({ center, edges }: { center: string; edges: { name: string; weight: number }[] }) {
  if (!edges.length) return <p className="py-8 text-center text-sm text-stone-500">No stored links for {short(center)} yet.</p>;
  const shown = edges.slice(0, SPOTS.length);
  return (
    <figure role="img" aria-label={`${short(center)} pairs with ${shown.map((e) => short(e.name)).join(', ')}`} className="relative h-[9.6rem] text-[0.8rem]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {shown.map((e, i) => <line key={e.name} x1="50" y1="50" x2={SPOTS[i][0]} y2={SPOTS[i][1]} stroke="#e8778a" strokeWidth="0.5" />)}
      </svg>
      <span className="absolute left-1/2 top-1/2 grid h-[3.9rem] w-[5rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-[#e11d36] to-[#b4122a] px-1 text-center font-semibold leading-tight text-white shadow">{short(center)}</span>
      {shown.map((e, i) => (
        <span key={e.name} title={`${short(e.name)}: ${e.weight.toFixed(2)}`} className="absolute flex max-w-[8rem] -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-rose-100 bg-white py-0.5 pl-1 pr-2.5 shadow-sm" style={{ left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%` }}>
          <IngredientBadge name={e.name} category="" size={22} /><span className="truncate">{short(e.name)}</span></span>
      ))}
    </figure>
  );
}

// Admin tool: what the engine would suggest when a recipe needs an ingredient the cook does not have.
export function SubstituteFinder({ names }: { names: string[] }) {
  const [query, setQuery] = useState('Lemon');
  const [rows, setRows] = useState<Substitute[] | null>(null);
  const [error, setError] = useState('');
  const run = useCallback(async (name: string) => {
    if (!name.trim()) return;
    setError('');
    try { setRows((await fetchSubstitutes(name.trim(), { limit: 5 })).substitutes); } catch (e) { setRows(null); setError(e instanceof Error ? e.message : 'Lookup failed'); }
  }, []);
  useEffect(() => { void run('Lemon'); }, [run]);
  return (
    <Card title="Substitute Finder" icon={ArrowLeftRight}>
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(query); }}>
        <input className="min-w-0 flex-1 rounded-full border border-rose-200 bg-white px-4 py-2 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-rose-200" list="substitute-names" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Ingredient to replace" placeholder="e.g. Lemon" />
        <datalist id="substitute-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <button type="submit" className="btn-primary !px-4">Find</button>
      </form>
      {error && <p className="text-sm text-crimson">{error}</p>}
      {rows && (rows.length === 0 ? <p className="text-sm text-stone-500">No safe substitute found.</p> : (
        <ol className="space-y-2" aria-label="Substitutes">
          {rows.map((r, i) => (
            <li key={r.name} className="rounded-xl bg-white/80 p-2 shadow-sm">
              <div className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-bold text-crimson">{i + 1}</span>
                <IngredientBadge name={r.name} category={r.category} size={26} /><b className="min-w-0 flex-1 truncate">{short(r.name)}</b><span className="text-sm font-semibold">{Math.round(r.score * 100)}%</span></div>
              <Bar value={r.score} max={1} label={`${r.name} substitute score`} />
              <p className="mt-1 text-xs text-stone-600">{r.reason}</p>
            </li>
          ))}
        </ol>
      ))}
    </Card>
  );
}

export function AdminMatchPage() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<{ o: Overview; series: DayPoint[] } | null>(null);
  const [items, setItems] = useState<AdminIngredient[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [chips, setChips] = useState<string[]>(() => (params.get('ingredients') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const [text, setText] = useState('');
  const [taste, setTaste] = useState<Record<TasteKey, 'low' | 'medium' | 'high' | null>>(() => {
    const preset = TASTE_PRESETS.find((p) => p.label === params.get('taste'));
    return preset ? togglePreset(NO_TASTE, preset) : NO_TASTE;
  });
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [top, setTop] = useState<CuratedMatch | null>(null);
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState<'best' | 'also'>('best');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const tick = useLiveTick(['ingredients', 'ingredient_compatibility']);

  useEffect(() => {
    let live = true;
    Promise.all([overview(days), timeseries(days)]).then(([o, series]) => { if (live) setStats({ o, series }); }).catch((e: Error) => { if (live && tick === 0) setLoadError(e.message); });
    return () => { live = false; };
  }, [days, tick]);
  useEffect(() => {
    Promise.all([listIngredients(), listEdges()]).then(([i, e]) => { setItems(i); setEdges(e); }).catch((e: Error) => { if (tick === 0) setLoadError(e.message); });
    topIngredients(30, 4).then((t) => setChips((c) => (c.length ? c : t.map((x) => x.name)))).catch(() => {});
  }, [tick]);

  const check = useCallback(async (names: string[]) => {
    if (names.length < 2) { setError('Choose at least two ingredients.'); return; }
    setChecking(true); setError('');
    try {
      const prefs = emptyPreferences();
      const [r, recs] = await Promise.all([
        checkCompatibility(names, prefs),
        fetchCuratedRecommendations(session?.access_token ?? '', { ingredients: names, tastes: taste, diets: [], maxMinutes: null }, prefs, []),
      ]);
      setReport(r);
      setTop(recs.recipes[0] ?? null);
    } catch (e) { setError((e as Error).message); } finally { setChecking(false); }
  }, [session?.access_token, taste]);

  // Show a real result as soon as the starting ingredients arrive.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started && chips.length >= 2) { setStarted(true); void check(chips); }
  }, [chips, started, check]);

  const candidates = useMemo(() => compatibleWith(chips, edges, items), [chips, edges, items]);
  const shownCandidates = (view === 'best' ? candidates.filter((c) => c.score >= 0.8) : candidates.filter((c) => c.score < 0.8)).slice(0, 4);
  const graphEdges = useMemo(() => {
    const first = items.find((i) => i.name === chips[0]);
    if (!first) return [];
    const names = new Map(items.map((i) => [i.id, i.name]));
    return edges.filter((e) => e.ingredient_a === first.id || e.ingredient_b === first.id)
      .map((e) => ({ name: names.get(e.ingredient_a === first.id ? e.ingredient_b : e.ingredient_a) ?? '?', weight: e.weight, evidence: e.evidence }))
      .sort((a, b) => b.weight - a.weight);
  }, [items, edges, chips]);
  const strongest = useMemo(() => {
    const names = new Map(items.map((i) => [i.id, i.name]));
    return [...edges].sort((a, b) => b.weight - a.weight).slice(0, 5).map((e) => ({ a: names.get(e.ingredient_a) ?? '?', b: names.get(e.ingredient_b) ?? '?', weight: e.weight }));
  }, [items, edges]);

  const addChip = (name: string) => {
    const clean = name.trim();
    const known = items.find((i) => i.name.toLowerCase() === clean.toLowerCase());
    if (!clean) return;
    if (!known) { setError(`“${clean}” isn’t in the ingredient list.`); return; }
    setError('');
    setChips((c) => (c.includes(known.name) || c.length >= 20 ? c : [...c, known.name]));
    setText('');
  };
  const submit = (e: FormEvent) => { e.preventDefault(); addChip(text); };

  if (loadError) return <div className="admin-page"><PageHeader title="Ingredients" accent="Match" icon={Link2} /><ErrorNote>{loadError}</ErrorNote></div>;
  if (!stats) return <Spinner label="Loading ingredient match" />;
  const { o, series } = stats;
  const avgEdge = edges.length ? edges.reduce((s, e) => s + e.weight, 0) / edges.length : null;
  const covered = new Set(edges.flatMap((e) => [e.ingredient_a, e.ingredient_b])).size;
  const pairWeights = (report?.pairs ?? []).map((p) => p.weight);
  const bandParts = BANDS.map((b) => ({ value: pairWeights.filter(b.test).length, color: b.color, label: b.label }));

  return (
    <div className="admin-page admin-match">
      <PageHeader title="Ingredients" accent="Match" icon={Link2} subtitle="Check ingredient compatibility, find best combinations, and analyze match results." actions={<RangeSelect days={days} onChange={setDays} />} />
      <div className="admin-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Link2} value={o.generations.toLocaleString()} label="Match Queries" tone="green" trend={pctShort(o.generations, o.generations_prev)} />
        <StatCard icon={CheckCircle2} value={avgEdge !== null ? `${Math.round(avgEdge * 100)}%` : '—'} label="Avg. Pair Score" tone="green" />
        <StatCard icon={Layers} value={edges.filter((e) => e.weight >= 0.6).length.toLocaleString()} label="Compatible Pairs" />
        <StatCard icon={Star} value={o.avg_rating !== null ? <>{o.avg_rating}<span className="text-lg font-semibold"> / 5</span></> : '—'} label="User Rating" tone="amber" />
        <StatCard icon={Target} value={items.length ? `${Math.round((covered / items.length) * 100)}%` : '—'} label="Graph Coverage" />
      </div>

      <div className="mt-[0.95rem] grid gap-[0.85rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-[0.8rem]">
          <div className="grid gap-[0.85rem] lg:grid-cols-[minmax(0,1.94fr)_minmax(0,1fr)]">
            <Card title="Check Ingredient Match" icon={Utensils}>
              <p className="-mt-1 pl-[2.45rem] text-[0.92rem] tracking-tight">Add ingredients and see compatible items, match score, and recipe suggestions.</p>
              <form onSubmit={submit} className="mt-2 rounded-2xl bg-white/70 p-2.5 shadow-sm">
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-rose-100/90 py-0.5 pl-3 pr-1.5 text-[0.92rem] font-medium">{short(c)}<button type="button" className="text-crimson" aria-label={`Remove ${c}`} onClick={() => setChips(chips.filter((x) => x !== c))}><X size={16} strokeWidth={2.4} aria-hidden="true" /></button></span>)}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input list="match-ingredients" className="min-w-0 flex-1 bg-transparent py-1 text-[0.92rem] outline-none" aria-label="Add ingredient" placeholder="Add ingredient (e.g., Ginger, Green Chilli...)" value={text} onChange={(e) => setText(e.target.value)} />
                  <datalist id="match-ingredients">{items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
                  <button type="submit" className="grid h-6 w-6 place-items-center rounded-full border border-crimson text-crimson" aria-label="Add this ingredient"><Plus size={15} aria-hidden="true" /></button>
                </div>
              </form>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[0.92rem]"><Flame size={17} className="text-crimson" aria-hidden="true" />Taste Preference</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {TASTE_PRESETS.map((p) => <button key={p.label} type="button" className="pill !px-3.5 !py-1 !text-[0.9rem]" aria-pressed={Object.entries(p.apply).every(([k, v]) => taste[k as TasteKey] === v)} onClick={() => setTaste(togglePreset(taste, p))}>{p.label}</button>)}
                  </div>
                </div>
                <button type="button" className="btn-primary" disabled={checking} onClick={() => check(chips)}><Sparkles size={16} aria-hidden="true" />{checking ? 'Checking…' : 'Check Match'}</button>
              </div>
              {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
            </Card>
            <Card title="Match Analysis" icon={BarChart3}>
              {pairWeights.length === 0 ? <EmptyState title="Check a match to see the analysis" /> : (
                <div className="flex flex-wrap items-center gap-3">
                  <Donut size={142} thickness={6} label="Pair strength" parts={bandParts} center={<span><span className="block text-[1.7rem] font-bold leading-none">{report?.average !== null && report?.average !== undefined ? `${Math.round(report.average * 100)}%` : '—'}</span><span className="text-[0.86rem]">Pair Score</span></span>} />
                  <ul className="min-w-0 flex-1 space-y-2 text-[0.88rem]">
                    {bandParts.map((b) => <li key={b.label} className="flex items-center gap-2"><span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: b.color }} />{b.label} ({b.value})</li>)}
                  </ul>
                </div>
              )}
            </Card>
          </div>
          <Card title="Match Result" icon={CheckCircle2} iconClass="text-green-600" action={top && <span className="badge badge-green whitespace-nowrap !text-[0.88rem]"><CheckCircle2 size={15} aria-hidden="true" />{top.match_percent >= 75 ? 'High' : top.match_percent >= 50 ? 'Medium' : 'Low'} Compatibility ({top.match_percent}%)</span>}>
            {!top ? <EmptyState title={checking ? 'Checking…' : 'No recipe matches yet'} /> : (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <div className="flex flex-wrap gap-4 rounded-2xl bg-white/70 p-2.5 shadow-sm sm:flex-nowrap">
                  <div className="w-[11.2rem] shrink-0"><RecipeCardImage category={top.category} imageUrl={recipeImage(top.slug, top.image_url)} name={top.name} rounded="rounded-xl" frame="aspect-[3/2]" /></div>
                  <div className="min-w-0 text-[0.88rem]">
                    <p>Top Recommended Meal</p>
                    <p className="font-display text-[1.4rem] font-extrabold leading-tight text-crimson">{top.name}</p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1"><Clock size={15} className="text-crimson" aria-hidden="true" />{top.minutes} min</span><span className="inline-flex items-center gap-1"><Users size={15} className="text-crimson" aria-hidden="true" />{top.servings} servings</span><span>{top.category}</span></p>
                    <p className="mt-1 line-clamp-2 leading-snug">{top.description}</p>
                    <a href={`/recipe/${top.slug}`} target="_blank" rel="noreferrer" className="btn-sm btn-red mt-1.5">View Recipe<ArrowRight size={14} aria-hidden="true" /></a>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/70 p-2.5 shadow-sm">
                  <p className="mb-1.5 text-[0.98rem] font-semibold">Compatibility Breakdown</p>
                  <ul className="space-y-1.5 text-[0.88rem]">
                    {pairBreakdown(chips, report?.pairs ?? []).slice(0, 4).map((b) => (
                      <li key={b.name} className="grid grid-cols-[1.7rem_6.4rem_1fr_2.4rem] items-center gap-2"><IngredientBadge name={b.name} category="" size={24} /><span className="truncate">{short(b.name)}</span>
                        <Bar value={b.score ?? 0} max={1} color="linear-gradient(90deg, #22a447, #4ade80)" label={b.name} /><span className="text-right font-medium">{b.score === null ? '—' : `${Math.round(b.score * 100)}%`}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </div>
        <Card title="Compatible Ingredients" icon={Network}>
          <SegmentTabs label="Compatible ingredients view" value={view} options={[['best', 'Best Matches'], ['also', 'Also Works']] as const} onChange={setView} />
          {shownCandidates.length === 0 ? <div className="mt-3"><EmptyState title="No stored matches here" /></div> : (
            <ul className="mt-2 divide-y divide-stone-100 text-[0.94rem]">
              {shownCandidates.map((c) => (
                <li key={c.name} className="flex items-center gap-3 py-2"><IngredientBadge name={c.name} category="" size={46} /><span className="min-w-0 flex-1"><strong className="block truncate font-medium">{short(c.name)}</strong><span className="text-[0.86rem] text-green-700">+ ({Math.round(c.score * 100)}% match)</span></span>
                  <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-crimson shadow-sm" aria-label={`Add ${c.name}`} onClick={() => addChip(c.name)}><Plus size={17} aria-hidden="true" /></button></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-[0.8rem] grid gap-[0.85rem] xl:grid-cols-[1.08fr_1fr_1.09fr]">
        <SubstituteFinder names={items.map((i) => i.name)} />
        <Card title="Ingredient Match Trends" icon={BarChart3}><AreaTrend data={series} x="day" y="generations" label="Match queries per day" height={150} callout={`${o.generations.toLocaleString()} Queries`} /></Card>
        <Card title="Strongest Matched Pairs" icon={Link2}>
          {strongest.length === 0 ? <EmptyState title="No stored pairs yet" /> : (
            <ul className="space-y-[0.42rem] text-[0.9rem]">
              {strongest.map((p) => <li key={`${p.a}-${p.b}`} className="grid grid-cols-[1.6rem_minmax(0,1.2fr)_minmax(0,1fr)_2.3rem] items-center gap-2"><IngredientBadge name={p.a} category="" size={24} /><span className="truncate">{short(p.a)} + {short(p.b)}</span>
                <Bar value={p.weight} max={1} color="linear-gradient(90deg, #dc1029, #fb923c)" label={`${p.a} and ${p.b}`} /><strong className="text-right font-medium">{p.weight.toFixed(2)}</strong></li>)}
            </ul>
          )}
        </Card>
        <Card title="Ingredient Network (Graph View)" icon={Network} action={<Link to="/admin/ingredients" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">Full Graph<ArrowRight size={15} aria-hidden="true" /></Link>}>
          <NetworkPills center={chips[0] ?? 'Tomato'} edges={graphEdges} />
        </Card>
      </div>
    </div>
  );
}
