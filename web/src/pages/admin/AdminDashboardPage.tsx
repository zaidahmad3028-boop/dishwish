import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, ChefHat, Database, Leaf, MessageSquare, PlusCircle, Server, Settings, Star, Trophy, UserPlus, Users, Zap } from 'lucide-react';
import { AreaTrend, BarTrend, Legend, PALETTE } from '../../components/charts';
import { Avatar, Card, Donut, EmptyState, ErrorNote, PageHeader, Spinner, StatCard, STATUS_BADGE, formatDate } from '../../components/ui';
import { categoryUsage, listFeedback, listUsers, overview, pctChange, systemStatus, timeseries, topIngredients, topRecipes,
  type AdminFeedback, type AdminUser, type DayPoint, type Overview } from '../../lib/adminApi';
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

export function AdminDashboardPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ o: Overview; series: DayPoint[]; ingredients: { name: string; uses: number }[]; recipes: Awaited<ReturnType<typeof topRecipes>>;
    categories: Awaited<ReturnType<typeof categoryUsage>>; users: AdminUser[]; feedback: AdminFeedback[] } | null>(null);
  const [status, setStatus] = useState<{ db: string; api: string; source: string; size: number } | null>(null);
  const [metric, setMetric] = useState<'generations' | 'active_users' | 'views'>('generations');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    Promise.all([overview(days), timeseries(days), topIngredients(days, 6), topRecipes(days, 3), categoryUsage(days), listUsers('', '', 1, 5), listFeedback('', '', '', 1, 3)])
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
    ]).then(([db, api]) => setStatus({ db: db.db, size: db.size, api, source: '' }));
  }, []);

  if (error) return <><PageHeader title="Admin" accent="Dashboard" /><ErrorNote>{error}</ErrorNote></>;
  if (!data) return <Spinner label="Loading dashboard" />;
  const { o } = data;
  const usageTotal = data.ingredients.reduce((s, i) => s + i.uses, 0);
  const catMax = Math.max(1, ...data.categories.map((c) => c.uses));

  return (
    <>
      <PageHeader title="Admin" accent="Dashboard" subtitle="Monitor users, recipes, ingredients and overall platform performance." actions={<RangeSelect days={days} onChange={setDays} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} value={o.total_users.toLocaleString()} label="Total Users" note={pctChange(o.new_users, o.new_users_prev) && `${o.new_users} new · ${pctChange(o.new_users, o.new_users_prev)}`} />
        <StatCard icon={ChefHat} value={o.total_recipes} label="Published Recipes" note={`${o.draft_recipes} drafts`} />
        <StatCard icon={Leaf} value={o.total_ingredients} label="Total Ingredients" tone="green" note={`${o.edges} compatibility edges`} />
        <StatCard icon={Zap} value={o.generations.toLocaleString()} label="Recipe Generations" tone="amber" note={pctChange(o.generations, o.generations_prev)} />
        <StatCard icon={Star} value={o.avg_rating !== null ? `${o.avg_rating} / 5` : '—'} label="Avg. User Rating" tone="amber" note={`${o.ratings} ratings`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="User Growth" icon={Users}><AreaTrend data={cumulativeUsers(data.series, o.total_users)} x="day" y="users" label="Total users" /></Card>
        <Card title="Ingredient Usage" icon={Leaf}>
          {data.ingredients.length === 0 ? <EmptyState title="No generations in this period" /> : (
            <div className="flex flex-wrap items-center gap-4">
              <Donut size={130} label="Ingredient usage" parts={data.ingredients.map((i, n) => ({ value: i.uses, color: PALETTE[n % PALETTE.length], label: i.name }))}
                center={<span><span className="block font-display text-xl font-extrabold">{usageTotal}</span><span className="text-[11px]">Total uses</span></span>} />
              <div className="min-w-40 flex-1"><Legend items={data.ingredients.map((i, n) => ({ label: i.name, value: `${Math.round((i.uses / usageTotal) * 100)}%`, color: PALETTE[n % PALETTE.length] }))} /></div>
            </div>
          )}
        </Card>
        <Card title="Recipe Categories" icon={ChefHat}>
          <ul className="space-y-2 text-sm">
            {data.categories.map((c) => (
              <li key={c.category} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2">
                <span>{c.category}</span>
                <span className="h-2 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-crimson" style={{ width: `${(c.uses / catMax) * 100}%` }} /></span>
                <span className="text-right font-semibold">{c.uses}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">Recipe activity (generated, viewed, saved, cooked) per category in this period.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Platform Analytics" icon={BarChart3} action={
          <div role="tablist" className="flex gap-1">
            {([['generations', 'Generations'], ['active_users', 'Active Users'], ['views', 'Recipe Views']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={metric === k} className="pill px-2.5 py-1 text-xs" onClick={() => setMetric(k)}>{l}</button>
            ))}
          </div>}>
          <BarTrend data={data.series} x="day" y={metric} label={metric.replace('_', ' ')} />
        </Card>
        <Card title="Recent Users" icon={UserPlus} action={<Link to="/admin/users" className="btn-sm btn-outline">View All<ArrowRight size={14} /></Link>}>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.users.map((u) => (
              <li key={u.user_id} className="flex items-center gap-2 py-2">
                <Avatar name={u.display_name || u.email} size={30} />
                <span className="min-w-0 flex-1 truncate font-semibold">{u.display_name || u.email.split('@')[0]}<span className="block text-xs font-normal text-stone-500">{formatDate(u.created_at)}</span></span>
                <span className={`badge ${STATUS_BADGE[u.status]}`}>{u.status}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recent Feedback" icon={MessageSquare} action={<Link to="/admin/feedback" className="btn-sm btn-outline">View All<ArrowRight size={14} /></Link>}>
          {data.feedback.length === 0 ? <EmptyState title="No feedback yet" /> : (
            <ul className="space-y-3 text-sm">
              {data.feedback.map((f) => (
                <li key={f.id}><p className="flex justify-between"><strong>{f.author}</strong><span className="text-xs text-stone-500">{formatDate(f.created_at)}</span></p>
                  {f.rating && <p className="text-amber-500" aria-label={`${f.rating} stars`}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</p>}
                  <p className="line-clamp-2 text-stone-600">“{f.message}”</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Top Recipes" icon={Trophy}>
          {data.recipes.length === 0 ? <EmptyState title="No recipe activity yet" /> : (
            <ul className="space-y-2 text-sm">{data.recipes.map((r) => (
              <li key={r.recipe_slug ?? r.recipe_name} className="flex justify-between"><span className="font-semibold">{r.recipe_name}</span>
                <span className="text-stone-600">{r.generated + r.viewed + r.saved + r.cooked} uses</span></li>))}</ul>
          )}
        </Card>
        <Card title="Quick Actions" icon={PlusCircle}>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
            {[
              { to: '/admin/recipes?new=1', icon: PlusCircle, label: 'Add Recipe' }, { to: '/admin/ingredients?new=1', icon: Leaf, label: 'Add Ingredient' },
              { to: '/admin/users', icon: Users, label: 'Manage Users' }, { to: '/admin/analytics', icon: BarChart3, label: 'View Analytics' },
              { to: '/admin/feedback', icon: MessageSquare, label: 'Review Feedback' }, { to: '/admin/settings', icon: Settings, label: 'System Settings' },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={label} to={to} className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 shadow-sm hover:bg-rose-50"><Icon size={22} className="text-crimson" />{label}</Link>
            ))}
          </div>
        </Card>
        <Card title="System Overview" icon={Server}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="flex items-center gap-2"><Database size={16} />Database</dt><dd className="font-semibold text-green-700">{status?.db ?? '…'}</dd></div>
            <div className="flex justify-between"><dt className="flex items-center gap-2"><Server size={16} />Recipe API</dt><dd className={`font-semibold ${status?.api === 'Online' ? 'text-green-700' : 'text-rose-700'}`}>{status?.api ?? '…'}</dd></div>
            <div className="flex justify-between"><dt>Database size</dt><dd className="font-semibold">{status ? `${(status.size / 1024 / 1024).toFixed(1)} MB` : '…'}</dd></div>
            <div className="flex justify-between"><dt>Open feedback</dt><dd className="font-semibold">{o.open_feedback}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-stone-500">Backups are managed by Supabase (Dashboard → Database → Backups); Dish-Wish doesn’t run its own.</p>
        </Card>
      </div>
    </>
  );
}
