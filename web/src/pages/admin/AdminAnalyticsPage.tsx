import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUp, BarChart3, Bookmark, ChefHat, CheckCircle2, Cpu, Download, Eye, Layers, Leaf, Lightbulb, RefreshCw, Star, Target, Trophy, UserRound, Users, Zap } from 'lucide-react';
import { AreaTrend, BarTrend, Legend, PALETTE } from '../../components/charts';
import { RecipeCardImage } from '../../components/DishArt';
import { ActionTile, Bar, Card, Donut, EmptyState, ErrorNote, PageHeader, SegmentTabs, Spinner, StatCard, downloadFile } from '../../components/ui';
import {
  listEdges, listIngredients, overview, pctChange, pctShort, preferenceStats, timeseries, topIngredients, topRecipes,
  type DayPoint, type Edge, type Overview, type PreferenceStats,
} from '../../lib/adminApi';
import { recipeImage } from '../../lib/images';
import { IngredientBars, RangeSelect, cumulativeUsers } from './AdminDashboardPage';

const HEATMAP_DEFAULT = ['Chicken Breast', 'Tomato', 'Onion', 'Garlic', 'Potato', 'Green Chilli'];
const HEAT_LEGEND = [
  { color: '#16a34a', label: '≥ 0.90', note: 'Highly Compatible' }, { color: '#86efac', label: '0.80 – 0.89', note: 'Compatible' },
  { color: '#fde047', label: '0.70 – 0.79', note: 'Moderate' }, { color: '#fdba74', label: '0.60 – 0.69', note: 'Low' }, { color: '#f87171', label: '< 0.60', note: 'Not Compatible' },
];
const PERIODS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const;
type Period = (typeof PERIODS)[number][0];
const short = (name: string) => name.replace(/\s*\(.*\)$/, '');

export function heatColor(w: number | null): string {
  if (w === null) return '#f5f5f4';
  if (w >= 0.9) return '#16a34a';
  if (w >= 0.8) return '#86efac';
  if (w >= 0.7) return '#fde047';
  if (w >= 0.6) return '#fdba74';
  return '#f87171';
}

// Groups daily rows into weeks or months. `pick` adds values up, or keeps the last one for running totals.
function bucket<T extends { day: string }>(rows: T[], period: Period, key: keyof T, pick: 'sum' | 'last'): { day: string; value: number }[] {
  const out = new Map<string, number>();
  rows.forEach((r, i) => {
    const label = period === 'daily' ? r.day
      : period === 'monthly' ? new Date(`${r.day}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })
      : rows[Math.floor(i / 7) * 7].day;
    const v = Number(r[key]);
    out.set(label, pick === 'sum' ? (out.get(label) ?? 0) + v : v);
  });
  return [...out].map(([day, value]) => ({ day, value }));
}

// Half ring showing one percentage, as in the reference gauge.
function Gauge({ value, label }: { value: number | null; label: string }) {
  const r = 70, len = Math.PI * r;
  return (
    <figure className="relative mx-auto w-48 shrink-0" role="img" aria-label={`${label}: ${value ?? 0}%`}>
      <svg viewBox="0 0 180 104" className="w-full">
        <defs><linearGradient id="gauge-fill" x1="0" x2="1"><stop offset="0%" stopColor="#16a34a" /><stop offset="70%" stopColor="#facc15" /><stop offset="100%" stopColor="#dc2626" /></linearGradient></defs>
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="#f5ebe7" strokeWidth="16" strokeLinecap="round" />
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="url(#gauge-fill)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${((value ?? 0) / 100) * len} ${len}`} />
      </svg>
      <figcaption className="absolute inset-x-0 bottom-0 text-center leading-tight"><span className="block text-[1.75rem] font-bold">{value === null ? '—' : `${value}%`}</span><span className="text-[0.9rem]">{label}</span></figcaption>
    </figure>
  );
}

export function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ o: Overview; series: DayPoint[]; ingredients: { name: string; uses: number }[];
    recipes: Awaited<ReturnType<typeof topRecipes>>; prefs: PreferenceStats } | null>(null);
  const [graph, setGraph] = useState<{ edges: Edge[]; names: Map<number, string> } | null>(null);
  const [growthPeriod, setGrowthPeriod] = useState<Period>('weekly');
  const [genPeriod, setGenPeriod] = useState<Period>('weekly');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([overview(days), timeseries(days), topIngredients(days, 8), topRecipes(days, 5), preferenceStats()])
      .then(([o, series, ingredients, recipes, prefs]) => { if (live) setData({ o, series, ingredients, recipes, prefs }); })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [days]);
  useEffect(() => {
    Promise.all([listEdges(), listIngredients()]).then(([edges, items]) => setGraph({ edges, names: new Map(items.map((i) => [i.id, i.name])) })).catch(() => {});
  }, []);

  const heat = useMemo(() => {
    if (!graph || !data) return null;
    const used = data.ingredients.map((i) => i.name).filter((n) => [...graph.names.values()].includes(n));
    const axis = (used.length >= 4 ? used : HEATMAP_DEFAULT).slice(0, 6);
    const idOf = new Map([...graph.names.entries()].map(([id, n]) => [n, id]));
    const weight = (a: string, b: string) => {
      const x = idOf.get(a), y = idOf.get(b);
      if (x === undefined || y === undefined) return null;
      const e = graph.edges.find((g) => (g.ingredient_a === Math.min(x, y) && g.ingredient_b === Math.max(x, y)));
      return e ? e.weight : null;
    };
    return { axis, weight };
  }, [graph, data]);

  if (error) return <><PageHeader title="Analytics &" accent="Insights" /><ErrorNote>{error}</ErrorNote></>;
  if (!data) return <Spinner label="Loading analytics" />;
  const { o } = data;
  const rate = (part: number) => (o.generations ? Math.round((part / o.generations) * 100) : null);
  const saveRate = rate(o.saves);
  const funnel = [
    { label: 'Recommendation Runs', value: o.generations, color: PALETTE[0] }, { label: 'Recipe Views', value: o.views, color: PALETTE[1] },
    { label: 'Saves', value: o.saves, color: PALETTE[2] }, { label: 'Cooked', value: o.cooked, color: PALETTE[3] },
  ];
  const usageTotal = funnel.reduce((s, f) => s + f.value, 0);
  const insights = [
    pctChange(o.generations, o.generations_prev) && `Recipe generations: ${o.generations} (${pctChange(o.generations, o.generations_prev)}).`,
    pctChange(o.new_users, o.new_users_prev) && `${o.new_users} new users (${pctChange(o.new_users, o.new_users_prev)}).`,
    data.ingredients.length >= 3 && `${data.ingredients.slice(0, 3).map((i) => short(i.name)).join(', ')} are the most used ingredients.`,
    data.recipes[0] && `${data.recipes[0].recipe_name} is the most active recipe.`,
    saveRate !== null && `${saveRate}% of recommendation runs ended in a save.`,
  ].filter(Boolean) as string[];
  const recipeTotal = (r: (typeof data.recipes)[number]) => r.generated + r.viewed + r.saved + r.cooked;

  const exportReport = () => downloadFile(`dishwish-analytics-${days}d-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ generated_at: new Date().toISOString(), range_days: days, overview: o, daily: data.series, top_ingredients: data.ingredients,
      top_recipes: data.recipes, preferences: data.prefs }, null, 2));
  const engagement = [
    { icon: CheckCircle2, cls: 'text-green-600', label: 'Saved', value: o.saves },
    { icon: RefreshCw, cls: 'text-amber-500', label: 'Viewed', value: o.views },
    { icon: ChefHat, cls: 'text-crimson', label: 'Cooked', value: o.cooked },
  ];

  return (
    <>
      <PageHeader title="Analytics &" accent="Insights" icon={BarChart3} subtitle="Comprehensive platform analytics and usage trends."
        actions={<><RangeSelect days={days} onChange={setDays} /><button type="button" className="btn-primary" onClick={exportReport}><Download size={16} />Export Report</button></>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={UserRound} value={o.total_users.toLocaleString()} label="Total Users" trend={pctShort(o.new_users, o.new_users_prev)} />
        <StatCard icon={ChefHat} value={o.total_recipes.toLocaleString()} label="Total Recipes" />
        <StatCard icon={Leaf} value={o.total_ingredients.toLocaleString()} label="Total Ingredients" tone="green" />
        <StatCard icon={Zap} value={o.generations.toLocaleString()} label="Recipe Generations" tone="amber" trend={pctShort(o.generations, o.generations_prev)} />
        <StatCard icon={Target} value={saveRate !== null ? `${saveRate}%` : '—'} label="Save Rate" />
        <StatCard icon={Star} value={o.avg_rating !== null ? <>{o.avg_rating}<span className="text-lg font-semibold"> / 5</span></> : '—'} label="Avg. User Rating" tone="amber" />
      </div>

      <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[1.05fr_1fr_0.98fr]">
        <Card title="User Growth" icon={Users} action={<SegmentTabs label="User growth period" value={growthPeriod} options={PERIODS} onChange={setGrowthPeriod} />}>
          <AreaTrend data={bucket(cumulativeUsers(data.series, o.total_users), growthPeriod, 'users', 'last')} x="day" y="value" label="Total users" height={132} callout={`${o.total_users.toLocaleString()} Users`} />
        </Card>
        <Card title="Recipe Generation Trend" icon={Zap} iconClass="text-orange-500" action={<SegmentTabs label="Generation period" value={genPeriod} options={PERIODS} onChange={setGenPeriod} />}>
          <BarTrend data={bucket(data.series, genPeriod, 'generations', 'sum')} x="day" y="value" label="Generations" height={132} callout={o.generations.toLocaleString()} />
        </Card>
        <Card title="Recommendation Engagement" icon={Target}>
          <div className="flex flex-wrap items-center gap-3">
            <Gauge value={saveRate} label="Save Rate" />
            <ul className="min-w-36 flex-1 space-y-3 text-[0.92rem]">
              {engagement.map(({ icon: Icon, cls, label, value }) => (
                <li key={label} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Icon size={20} className={cls} aria-hidden="true" />{label}</span><strong>{value.toLocaleString()}</strong></li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[1.05fr_0.95fr_1fr]">
        <Card title={<>Ingredient Compatibility <span className="font-sans text-base font-normal">(Heatmap)</span></>} icon={Layers}>
          {!heat ? <Spinner /> : (
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <table className="w-full table-fixed border-collapse text-[0.8rem]" aria-label="Compatibility heatmap">
                  <tbody>
                    {heat.axis.map((row) => (
                      <tr key={row}><th className="w-[4.6rem] truncate pr-1.5 text-right font-medium" title={short(row)}>{short(row).split(' ')[0]}</th>
                        {heat.axis.map((col) => {
                          const w = row === col ? 1 : heat.weight(row, col);
                          return <td key={col} className="h-6 border border-white" style={{ background: row === col ? '#15803d' : heatColor(w) }} title={w === null ? 'No stored edge' : `${short(row)} + ${short(col)}: ${w.toFixed(2)}`} />;
                        })}</tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td />{heat.axis.map((a) => <th key={a} className="truncate pt-1 text-center text-[0.68rem] font-medium">{short(a).split(' ')[0]}</th>)}</tr></tfoot>
                </table>
              </div>
              <ul className="space-y-0.5 text-[0.72rem] leading-tight">
                {HEAT_LEGEND.map((l) => <li key={l.label} className="flex items-start gap-1.5"><span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: l.color }} /><span>{l.label}<span className="block">({l.note})</span></span></li>)}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Platform Usage Distribution" icon={ChefHat}>
          {usageTotal === 0 ? <EmptyState title="No activity in this period" /> : (
            <div className="flex flex-wrap items-center gap-4">
              <Donut size={118} label="Usage distribution" parts={funnel.map((f) => ({ value: f.value, color: f.color, label: f.label }))}
                center={<span><span className="block text-xl font-bold">{usageTotal.toLocaleString()}</span><span className="text-sm">Total Uses</span></span>} />
              <div className="min-w-36 flex-1"><Legend items={funnel.map((f) => ({ label: f.label, value: `${((f.value / usageTotal) * 100).toFixed(1)}%`, color: f.color }))} /></div>
            </div>
          )}
        </Card>
        <Card title="Top Generated Recipes" icon={Trophy} iconClass="text-amber-600" action={<Link to="/admin/recipes" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">View All<ArrowRight size={15} /></Link>}>
          {data.recipes.length === 0 ? <EmptyState title="No recipe activity yet" /> : (
            <ul className="space-y-1 text-[0.9rem]">
              {data.recipes.map((r) => (
                <li key={r.recipe_slug ?? r.recipe_name} className="grid grid-cols-[3.2rem_7.5rem_1fr_2.8rem] items-center gap-2">
                  <RecipeCardImage category="" imageUrl={r.recipe_slug ? recipeImage(r.recipe_slug) : null} name={r.recipe_name} rounded="rounded-md" />
                  <span className="truncate font-medium">{r.recipe_name}</span>
                  <Bar value={recipeTotal(r)} max={recipeTotal(data.recipes[0])} color="linear-gradient(90deg, #dc1029, #fb7185)" label={r.recipe_name} />
                  <strong className="text-right">{recipeTotal(r).toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[1fr_1fr_1fr]">
        <Card title="Key Insights" icon={Lightbulb} iconClass="text-amber-500">
          {insights.length === 0 ? <p className="text-sm text-stone-500">Not enough activity yet to draw insights.</p> : (
            <ul className="divide-y divide-stone-100 text-[0.92rem]">{insights.slice(0, 4).map((i) => <li key={i} className="flex items-center gap-3 py-1.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green-50 text-green-600"><ArrowUp size={16} aria-hidden="true" /></span>{i}</li>)}</ul>
          )}
        </Card>
        <Card title="Recommendation Performance" icon={Cpu}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ActionTile icon={Target} label={`${saveRate ?? 0}% Save Rate`} />
            <ActionTile icon={Eye} label={`${o.views.toLocaleString()} Views`} />
            <ActionTile icon={Bookmark} label={`${o.saves.toLocaleString()} Saves`} />
            <ActionTile icon={ChefHat} label={`${o.cooked.toLocaleString()} Cooked`} />
          </div>
          <p className="mt-2 text-[0.78rem] text-stone-500">Accuracy, precision and recall need a labelled test set, which Dish-Wish does not have yet, so they aren’t shown.</p>
        </Card>
        <Card title="Most Used Ingredients" icon={Leaf} iconClass="text-green-600" action={<Link to="/admin/ingredients" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">View All<ArrowRight size={15} /></Link>}>
          {data.ingredients.length === 0 ? <EmptyState title="No generations in this period" /> : <IngredientBars items={data.ingredients.slice(0, 5)} />}
        </Card>
      </div>
    </>
  );
}
