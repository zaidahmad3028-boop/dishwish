import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bookmark, ChefHat, Download, Flame, Grid3x3, Leaf, Lightbulb, PieChart, Star, Trophy, Users, Zap } from 'lucide-react';
import { AreaTrend, BarTrend, Legend, PALETTE } from '../../components/charts';
import { Bar, Card, Donut, EmptyState, ErrorNote, PageHeader, Spinner, StatCard, downloadFile } from '../../components/ui';
import {
  listEdges, listIngredients, overview, pctChange, preferenceStats, timeseries, topIngredients, topRecipes,
  type DayPoint, type Edge, type Overview, type PreferenceStats,
} from '../../lib/adminApi';
import { RangeSelect, cumulativeUsers } from './AdminDashboardPage';

const HEATMAP_DEFAULT = ['Chicken Breast', 'Tomato', 'Onion', 'Garlic', 'Potato', 'Green Chilli'];

export function heatColor(w: number | null): string {
  if (w === null) return '#f5f5f4';
  if (w >= 0.9) return '#16a34a';
  if (w >= 0.8) return '#86efac';
  if (w >= 0.7) return '#fde047';
  if (w >= 0.6) return '#fdba74';
  return '#f87171';
}

export function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ o: Overview; series: DayPoint[]; ingredients: { name: string; uses: number }[];
    recipes: Awaited<ReturnType<typeof topRecipes>>; prefs: PreferenceStats } | null>(null);
  const [graph, setGraph] = useState<{ edges: Edge[]; names: Map<number, string> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([overview(days), timeseries(days), topIngredients(days, 8), topRecipes(days, 6), preferenceStats()])
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
  const saveRate = o.generations ? Math.round((o.saves / o.generations) * 100) : null;
  const funnel = [
    { label: 'Recommendation runs', value: o.generations, color: PALETTE[0] }, { label: 'Recipe views', value: o.views, color: PALETTE[1] },
    { label: 'Saves', value: o.saves, color: PALETTE[2] }, { label: 'Cooked', value: o.cooked, color: PALETTE[3] },
  ];
  const usageTotal = funnel.reduce((s, f) => s + f.value, 0);
  const insights = [
    pctChange(o.generations, o.generations_prev) && `Recipe generations: ${o.generations} (${pctChange(o.generations, o.generations_prev)}).`,
    pctChange(o.new_users, o.new_users_prev) && `${o.new_users} new users (${pctChange(o.new_users, o.new_users_prev)}).`,
    data.ingredients.length >= 3 && `${data.ingredients.slice(0, 3).map((i) => i.name).join(', ')} are the most used ingredients.`,
    data.recipes[0] && `${data.recipes[0].recipe_name} is the most active recipe.`,
    saveRate !== null && `${saveRate}% of recommendation runs ended in a save.`,
  ].filter(Boolean) as string[];

  const exportReport = () => downloadFile(`dishwish-analytics-${days}d-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ generated_at: new Date().toISOString(), range_days: days, overview: o, daily: data.series, top_ingredients: data.ingredients,
      top_recipes: data.recipes, preferences: data.prefs }, null, 2));

  return (
    <>
      <PageHeader title="Analytics &" accent="Insights" icon={BarChart3} subtitle="Platform usage trends and preference insights, computed from live database rows."
        actions={<><RangeSelect days={days} onChange={setDays} /><button type="button" className="btn-primary" onClick={exportReport}><Download size={16} />Export Report</button></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={Users} value={o.total_users} label="Total Users" note={`${o.active_users} active in range`} />
        <StatCard icon={ChefHat} value={o.total_recipes} label="Published Recipes" />
        <StatCard icon={Leaf} value={o.total_ingredients} label="Ingredients" tone="green" />
        <StatCard icon={Zap} value={o.generations} label="Recipe Generations" tone="amber" />
        <StatCard icon={Bookmark} value={saveRate !== null ? `${saveRate}%` : '—'} label="Save Rate" tone="blue" note="Saves ÷ generations" />
        <StatCard icon={Star} value={o.avg_rating ?? '—'} label="Avg. User Rating" tone="amber" note={`${o.ratings} ratings`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="User Growth" icon={Users}><AreaTrend data={cumulativeUsers(data.series, o.total_users)} x="day" y="users" label="Total users" /></Card>
        <Card title="Recipe Generation Trend" icon={Zap}><BarTrend data={data.series} x="day" y="generations" label="Generations per day" /></Card>
        <Card title="Recommendation Usage" icon={Trophy}>
          <ul className="space-y-3 text-sm">
            {funnel.map((f) => (
              <li key={f.label}><span className="flex justify-between"><span>{f.label}</span><strong>{f.value}</strong></span>
                <Bar value={f.value} max={Math.max(1, funnel[0].value, funnel[1].value)} color={f.color} label={f.label} /></li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">Accuracy, precision, recall and F1 are not shown: they need a labelled evaluation dataset, which Dish-Wish does not have yet.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Ingredient Compatibility (Heatmap)" icon={Grid3x3}>
          {!heat ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="text-[11px]" aria-label="Compatibility heatmap">
                <thead><tr><th />{heat.axis.map((a) => <th key={a} className="px-1 pb-1 font-semibold">{a.replace(/\s*\(.*\)$/, '').split(' ')[0]}</th>)}</tr></thead>
                <tbody>
                  {heat.axis.map((row) => (
                    <tr key={row}><th className="pr-2 text-right font-semibold">{row.replace(/\s*\(.*\)$/, '')}</th>
                      {heat.axis.map((col) => {
                        const w = row === col ? 1 : heat.weight(row, col);
                        return <td key={col} className="h-8 w-10 border border-white text-center" style={{ background: row === col ? '#e7e5e4' : heatColor(w) }}
                          title={w === null ? 'No stored edge' : w.toFixed(2)}>{row === col ? '' : w === null ? '–' : w.toFixed(2)}</td>;
                      })}</tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-500">Stored edge weights; “–” means no stored edge (the engine then uses a labelled heuristic).</p>
            </div>
          )}
        </Card>
        <Card title="Platform Usage Distribution" icon={PieChart}>
          {usageTotal === 0 ? <EmptyState title="No activity in this period" /> : (
            <div className="flex flex-wrap items-center gap-4">
              <Donut size={130} label="Usage distribution" parts={funnel.map((f) => ({ value: f.value, color: f.color, label: f.label }))}
                center={<span><span className="block font-display text-xl font-extrabold">{usageTotal}</span><span className="text-[11px]">Total events</span></span>} />
              <div className="min-w-40 flex-1"><Legend items={funnel.map((f) => ({ label: f.label, value: `${Math.round((f.value / usageTotal) * 100)}%`, color: f.color }))} /></div>
            </div>
          )}
        </Card>
        <Card title="Top Recipes" icon={Trophy}>
          {data.recipes.length === 0 ? <EmptyState title="No recipe activity yet" /> : (
            <ul className="space-y-2 text-sm">
              {data.recipes.map((r) => {
                const total = r.generated + r.viewed + r.saved + r.cooked;
                const max = data.recipes[0].generated + data.recipes[0].viewed + data.recipes[0].saved + data.recipes[0].cooked;
                return <li key={r.recipe_slug ?? r.recipe_name}><span className="flex justify-between"><span>{r.recipe_name}</span><strong>{total}</strong></span><Bar value={total} max={max} label={r.recipe_name} /></li>;
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Taste Preferences" icon={Flame}>
          <table className="data-table text-xs">
            <thead><tr><th>Taste</th><th>Low</th><th>Medium</th><th>High</th></tr></thead>
            <tbody>{Object.entries(data.prefs.tastes ?? {}).map(([t, v]) => <tr key={t}><td className="capitalize">{t}</td><td>{v.low}</td><td>{v.medium}</td><td>{v.high}</td></tr>)}</tbody>
          </table>
          <p className="mt-3 text-xs font-semibold">Diets</p>
          <p className="text-xs text-stone-600">{Object.entries(data.prefs.diets ?? {}).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(' · ') || 'None chosen yet'}</p>
          <p className="mt-2 text-xs font-semibold">Cuisines</p>
          <p className="text-xs text-stone-600">{Object.entries(data.prefs.cuisines ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'None chosen yet'}</p>
        </Card>
        <Card title="Most Used Ingredients" icon={Leaf}>
          {data.ingredients.length === 0 ? <EmptyState title="No generations in this period" /> : <BarTrend data={data.ingredients} x="name" y="uses" label="Uses" colorful />}
        </Card>
        <Card title="Key Insights" icon={Lightbulb}>
          {insights.length === 0 ? <p className="text-sm text-stone-500">Not enough activity yet to draw insights.</p> : (
            <ul className="space-y-2 text-sm">{insights.map((i) => <li key={i} className="flex gap-2"><Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" />{i}</li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
