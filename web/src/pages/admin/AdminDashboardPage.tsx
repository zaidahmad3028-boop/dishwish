import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, ChefHat, Database, Flame, HardDrive, Layers, Leaf, MessageSquare, PlusCircle, Server, Settings, ShieldCheck, Star, Trophy, UserRound, Users, UtensilsCrossed, Zap } from 'lucide-react';
import { AreaTrend, BarTrend, Legend, PALETTE } from '../../components/charts';
import { IngredientBadge, RecipeCardImage } from '../../components/DishArt';
import { ActionTile, Avatar, Bar, Card, Donut, EmptyState, ErrorNote, PageHeader, SegmentTabs, Spinner, StatCard, Stars, STATUS_BADGE, formatDate } from '../../components/ui';
import { categoryUsage, listFeedback, listUsers, overview, pctShort, systemStatus, timeseries, topIngredients, topRecipes,
  type AdminFeedback, type AdminUser, type DayPoint, type Overview } from '../../lib/adminApi';
import { recipeImage } from '../../lib/images';
import { API_URL } from '../../lib/recipes';

export function RangeSelect({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <select className="select" value={days} onChange={(e) => onChange(Number(e.target.value))} aria-label="Date range">
      <option value={7}>Last 7 Days</option><option value={30}>Last 30 Days</option><option value={90}>Last 90 Days</option><option value={365}>Last 12 Months</option>
    </select>
  );
}

// Running total of users per day: today's total minus everyone who joined after that day.
export function cumulativeUsers(series: DayPoint[], total: number) {
  let after = 0;
  return [...series].reverse().map((d) => { const point = { day: d.day, users: total - after }; after += d.new_users; return point; }).reverse();
}

const short = (name: string) => name.replace(/\s*\(.*\)$/, '');
const BAR_COLORS = ['#ef4444', '#f97316', '#fbbf24', '#a3e635', '#4ade80'];

// Bars standing on the ingredient's own picture, with its name and count below.
export function IngredientBars({ items }: { items: { name: string; uses: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.uses));
  return (
    <ul className="flex items-end justify-between gap-2">
      {items.map((i, n) => (
        <li key={i.name} className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className="block w-full rounded-t-lg" style={{ height: `${Math.max(8, (i.uses / max) * 56)}px`, background: `linear-gradient(${BAR_COLORS[n % BAR_COLORS.length]}, ${BAR_COLORS[n % BAR_COLORS.length]}99)` }} />
          <span className="-mt-2.5"><IngredientBadge name={i.name} category="" size={32} /></span>
          <span className="w-full truncate text-[0.82rem] font-semibold leading-tight">{short(i.name)}</span>
          <span className="text-[0.82rem] leading-tight">{i.uses.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

const METRICS = [['generations', 'Recipe Generations'], ['active_users', 'Active Users'], ['views', 'Recipe Views']] as const;

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ o: Overview; series: DayPoint[]; ingredients: { name: string; uses: number }[]; recipes: Awaited<ReturnType<typeof topRecipes>>;
    categories: Awaited<ReturnType<typeof categoryUsage>>; users: AdminUser[]; feedback: AdminFeedback[] } | null>(null);
  const [status, setStatus] = useState<{ db: string; api: string; size: number } | null>(null);
  const [metric, setMetric] = useState<'generations' | 'active_users' | 'views'>('generations');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    Promise.all([overview(days), timeseries(days), topIngredients(days, 6), topRecipes(days, 3), categoryUsage(days), listUsers('', '', 1, 4), listFeedback('', '', '', 1, 3)])
      .then(([o, series, ingredients, recipes, categories, users, feedback]) => {
        if (live) setData({ o, series, ingredients, recipes, categories, users: users.rows, feedback: feedback.rows });
      })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [days]);

  useEffect(() => {
    Promise.all([
      systemStatus().then((s) => ({ db: s.database === 'ok' ? 'Healthy' : 'Problem', size: s.database_size_bytes })).catch(() => ({ db: 'Unreachable', size: 0 })),
      fetch(`${API_URL}/api/health`).then((r) => (r.ok ? 'Online' : `HTTP ${r.status}`)).catch(() => 'Offline'),
    ]).then(([db, api]) => setStatus({ db: db.db, size: db.size, api }));
  }, []);

  if (error) return <><PageHeader title="Admin" accent="Dashboard" /><ErrorNote>{error}</ErrorNote></>;
  if (!data) return <Spinner label="Loading dashboard" />;
  const { o } = data;
  const usageTotal = data.ingredients.reduce((s, i) => s + i.uses, 0);
  const catMax = Math.max(1, ...data.categories.map((c) => c.uses));
  const statusRow = (icon: typeof Server, label: string, value: string | undefined, good: boolean) => {
    const Icon = icon;
    return (
      <div className="flex items-center justify-between gap-2 border-b border-stone-100 py-1.5 text-[0.92rem] last:border-0">
        <dt className="flex items-center gap-2"><Icon size={18} className="text-crimson" aria-hidden="true" />{label}</dt>
        <dd className={`flex items-center gap-1.5 font-semibold ${good ? 'text-green-700' : 'text-rose-700'}`}><span className={`h-2 w-2 rounded-full ${good ? 'bg-green-500' : 'bg-rose-500'}`} />{value ?? '…'}</dd>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Admin" accent="Dashboard" subtitle="Monitor users, recipes, ingredients and overall platform performance." actions={<RangeSelect days={days} onChange={setDays} />} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={UserRound} value={o.total_users.toLocaleString()} label="Total Users" trend={pctShort(o.new_users, o.new_users_prev)} />
        <StatCard icon={ChefHat} value={o.total_recipes.toLocaleString()} label="Total Recipes" note={`${o.draft_recipes} drafts`} />
        <StatCard icon={Leaf} value={o.total_ingredients.toLocaleString()} label="Total Ingredients" tone="green" note={`${o.edges.toLocaleString()} compatibility links`} />
        <StatCard icon={UtensilsCrossed} value={o.generations.toLocaleString()} label="Recipe Generations" trend={pctShort(o.generations, o.generations_prev)} />
        <StatCard icon={Star} value={o.avg_rating !== null ? <>{o.avg_rating}<span className="text-lg font-semibold"> / 5</span></> : '—'} label="Avg. User Rating" tone="amber" note={`${o.ratings} ratings`} />
      </div>

      <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-2.5">
          <div className="grid gap-2.5 lg:grid-cols-[1.32fr_1.1fr_0.9fr]">
            <Card title="User Growth" icon={Users}>
              <AreaTrend data={cumulativeUsers(data.series, o.total_users)} x="day" y="users" label="Total users" height={148} callout={`${o.total_users.toLocaleString()} Users`} />
            </Card>
            <Card title="Ingredient Usage" icon={Leaf} iconClass="text-green-600">
              {data.ingredients.length === 0 ? <EmptyState title="No generations in this period" /> : (
                <div className="flex items-center gap-3">
                  <Donut size={112} label="Ingredient usage" parts={data.ingredients.map((i, n) => ({ value: i.uses, color: PALETTE[n % PALETTE.length], label: i.name }))}
                    center={<span><span className="block text-lg font-bold">{usageTotal.toLocaleString()}</span><span className="text-[0.72rem]">Total Uses</span></span>} />
                  <div className="min-w-0 flex-1"><Legend items={data.ingredients.map((i, n) => ({ label: short(i.name), value: `${Math.round((i.uses / usageTotal) * 100)}%`, color: PALETTE[n % PALETTE.length] }))} /></div>
                </div>
              )}
            </Card>
            <Card title="Recipe Categories" icon={ChefHat}>
              <ul className="space-y-1.5 text-[0.86rem]">
                {data.categories.slice(0, 6).map((c) => (
                  <li key={c.category} className="grid grid-cols-[4.8rem_1fr_2.2rem] items-center gap-2">
                    <span className="truncate">{c.category}</span>
                    <Bar value={c.uses} max={catMax} color="linear-gradient(90deg, #dc1029, #fb7185)" label={c.category} />
                    <span className="text-right font-semibold">{c.uses}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-[1.25fr_1fr]">
            <Card title="Platform Analytics" icon={BarChart3} action={<SegmentTabs label="Chart metric" value={metric} options={METRICS} onChange={setMetric} />}>
              <BarTrend data={data.series} x="day" y={metric} label={metric.replace('_', ' ')} height={128} />
            </Card>
            <Card title="Recent Users" icon={Users} action={<Link to="/admin/users" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">View All<ArrowRight size={15} /></Link>}>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Joined</th><th>Recipes</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.user_id}>
                        <td><span className="flex items-center gap-2"><Avatar name={u.display_name || u.email} size={24} /><span className="max-w-24 truncate font-semibold">{u.display_name || u.email.split('@')[0]}</span></span></td>
                        <td className="whitespace-nowrap">{formatDate(u.created_at)}</td><td>{u.generated}</td>
                        <td><span className={`badge capitalize ${STATUS_BADGE[u.status]}`}>{u.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-[1.2fr_1fr_0.95fr]">
            <Card title={<>Top Recipes <span className="font-sans text-base font-normal">(This Period)</span></>} icon={Trophy} iconClass="text-amber-600">
              {data.recipes.length === 0 ? <EmptyState title="No recipe activity yet" /> : (
                <ul className="grid grid-cols-3 gap-2">
                  {data.recipes.map((r) => (
                    <li key={r.recipe_slug ?? r.recipe_name} className="min-w-0 text-center">
                      <RecipeCardImage category="" imageUrl={r.recipe_slug ? recipeImage(r.recipe_slug) : null} name={r.recipe_name} height="h-[4.6rem]" rounded="rounded-xl" />
                      <p className="mt-1 truncate text-[0.92rem] font-semibold">{r.recipe_name}</p>
                      <p className="flex items-center justify-center gap-1 text-[0.82rem]"><Flame size={14} className="text-crimson" aria-hidden="true" />{(r.generated + r.viewed + r.saved + r.cooked).toLocaleString()} uses</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Most Used Ingredients" icon={Leaf} iconClass="text-green-600" action={<Link to="/admin/ingredients" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">View All<ArrowRight size={15} /></Link>}>
              {data.ingredients.length === 0 ? <EmptyState title="No generations in this period" /> : <IngredientBars items={data.ingredients.slice(0, 5)} />}
            </Card>
            <Card title="System Overview" icon={Layers}>
              <dl>
                {statusRow(Server, 'Server Status', status?.api, status?.api === 'Online')}
                {statusRow(Database, 'Database', status?.db, status?.db === 'Healthy')}
                {statusRow(ShieldCheck, 'Open Feedback', String(o.open_feedback), true)}
                <div className="flex items-center justify-between gap-2 py-1.5 text-[0.92rem]">
                  <dt className="flex items-center gap-2"><HardDrive size={18} className="text-crimson" aria-hidden="true" />Database Size</dt>
                  <dd className="font-semibold">{status ? `${(status.size / 1024 / 1024).toFixed(1)} MB` : '…'}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>

        <div className="min-w-0 space-y-2.5">
          <Card title="Quick Actions" icon={Zap}>
            <div className="grid grid-cols-3 gap-2">
              <ActionTile icon={PlusCircle} label="Add Recipe" onClick={() => navigate('/admin/recipes?new=1')} />
              <ActionTile icon={Leaf} label="Add Ingredient" iconClass="text-green-600" onClick={() => navigate('/admin/ingredients?new=1')} />
              <ActionTile icon={Users} label="Manage Users" onClick={() => navigate('/admin/users')} />
              <ActionTile icon={BarChart3} label="View Analytics" onClick={() => navigate('/admin/analytics')} />
              <ActionTile icon={MessageSquare} label="Review Feedback" onClick={() => navigate('/admin/feedback')} />
              <ActionTile icon={Settings} label="System Settings" onClick={() => navigate('/admin/settings')} />
            </div>
          </Card>
          <Card title="Recent Feedback" icon={MessageSquare} action={<Link to="/admin/feedback" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">View All<ArrowRight size={15} /></Link>}>
            {data.feedback.length === 0 ? <EmptyState title="No feedback yet" /> : (
              <ul className="divide-y divide-stone-100">
                {data.feedback.map((f) => (
                  <li key={f.id} className="flex gap-3 py-3 first:pt-0">
                    <Avatar name={f.author} size={32} />
                    <div className="min-w-0 flex-1 text-[0.92rem]">
                      <p className="flex flex-wrap items-center justify-between gap-x-2"><strong className="truncate">{f.author}</strong>{f.rating && <Stars value={f.rating} />}<span className="text-[0.8rem] text-stone-600">{formatDate(f.created_at)}</span></p>
                      <p className="mt-1 line-clamp-3">“{f.message}”</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
