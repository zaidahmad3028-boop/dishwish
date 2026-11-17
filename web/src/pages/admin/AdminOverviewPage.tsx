import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, CheckCircle2, ChefHat, ChevronRight, Flame, Layers, Leaf, MessageSquare, Network, Sparkles, Star, Target, Trophy, UserPlus, Users, Utensils, XCircle } from 'lucide-react';
import { AreaTrend, BarTrend, PALETTE } from '../../components/charts';
import { IngredientBadge, RecipeCardImage } from '../../components/DishArt';
import { Bar, Card, Donut, EmptyState, ErrorNote, PageHeader, Spinner, StatCard, formatDate } from '../../components/ui';
import { listEdges, listFeedback, listUsers, overview, pctShort, preferenceStats, systemStatus, timeseries, topIngredients, topRecipes, type DayPoint, type Edge, type Overview, type PreferenceStats } from '../../lib/adminApi';
import { IMAGES, imageUrl, recipeImage } from '../../lib/images';
import { API_URL } from '../../lib/recipes';
import { TASTE_PRESETS } from '../../lib/selection';
import { useLiveTick } from '../../lib/useLiveTick';
import { RangeSelect, cumulativeUsers } from './AdminDashboardPage';

const short = (name: string) => name.replace(/\s*\(.*\)$/, '');

// Spice levels first, then the other tastes, each counted from the cooks' saved preferences.
export function tasteDistribution(tastes: PreferenceStats['tastes']) {
  const level = (k: string) => tastes[k] ?? { low: 0, medium: 0, high: 0 };
  const rows = [
    { label: 'Spicy', value: level('spicy').high, color: '#ef4444' }, { label: 'Medium', value: level('spicy').medium, color: '#fb923c' }, { label: 'Mild', value: level('spicy').low, color: '#fcd34d' },
    { label: 'Sweet', value: level('sweet').low + level('sweet').medium + level('sweet').high, color: '#a78bfa' }, { label: 'Sour', value: level('sour').low + level('sour').medium + level('sour').high, color: '#f472b6' },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({ ...r, percent: total ? Math.round((r.value / total) * 100) : 0 }));
}

interface Data {
  o: Overview; series: DayPoint[]; ingredients: { name: string; uses: number }[]; recipes: Awaited<ReturnType<typeof topRecipes>>; prefs: PreferenceStats; edges: Edge[];
  activity: { key: string; icon: typeof Users; title: string; detail: string; at: string }[];
}

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [health, setHealth] = useState<{ label: string; ok: boolean; note: string }[] | null>(null);
  const [text, setText] = useState('');
  const [taste, setTaste] = useState('Spicy');
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const tick = useLiveTick(['feedback', 'curated_recipes', 'ingredients', 'ingredient_compatibility']);

  useEffect(() => {
    let live = true;
    Promise.all([overview(days), timeseries(days), topIngredients(days, 5), topRecipes(days, 3), preferenceStats(), listEdges(), listUsers('', '', 1, 2), listFeedback('', '', '', 1, 2)])
      .then(([o, series, ingredients, recipes, prefs, edges, users, feedback]) => {
        if (!live) return;
        const activity = [
          ...users.rows.map((u) => ({ key: `u${u.user_id}`, icon: UserPlus, title: 'New user registered', detail: u.display_name || 'A new cook', at: u.created_at })),
          ...feedback.rows.map((f) => ({ key: `f${f.id}`, icon: f.rating ? Star : MessageSquare, title: f.rating ? `Gave ${f.rating} star rating` : 'New feedback', detail: f.author, at: f.created_at })),
        ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
        setData({ o, series, ingredients, recipes, prefs, edges, activity });
        setUpdatedAt(new Date());
      })
      .catch((e: Error) => { if (live && tick === 0) setError(e.message); });
    return () => { live = false; };
  }, [days, tick]);
  useEffect(() => {
    Promise.all([
      systemStatus().then((s) => ({ db: s.database === 'ok', rls: s.rls_disabled.length })).catch(() => ({ db: false, rls: -1 })),
      fetch(`${API_URL}/api/health`).then((r) => r.ok).catch(() => false),
    ]).then(([s, api]) => setHealth([
      { label: 'Recommendation API', ok: api, note: api ? 'Operational' : 'Not reachable' },
      { label: 'Database', ok: s.db, note: s.db ? 'Operational' : 'Not reachable' },
      { label: 'Row-Level Security', ok: s.rls === 0, note: s.rls === 0 ? 'On for every table' : s.rls > 0 ? `${s.rls} tables without it` : 'Unknown' },
    ]));
  }, [tick]);

  const recommend = (e: FormEvent) => {
    e.preventDefault();
    const query = new URLSearchParams({ ingredients: text, taste });
    navigate(`/admin/match?${query}`);
  };

  if (error) return <div className="admin-page"><PageHeader title="Dashboard" icon={BarChart3} /><ErrorNote>{error}</ErrorNote></div>;
  if (!data) return <Spinner label="Loading overview" />;
  const { o } = data;
  const saveRate = o.generations ? Math.round((o.saves / o.generations) * 100) : null;
  const tastes = tasteDistribution(data.prefs.tastes);
  const tastePeak = Math.max(1, ...tastes.map((t) => t.percent));
  const cuisines = Object.entries(data.prefs.cuisines).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  const cuisineTotal = cuisines.reduce((s, c) => s + c.value, 0);
  const links = [
    { label: 'Strong Links', color: '#22a447', value: data.edges.filter((e) => e.weight >= 0.75).length },
    { label: 'Moderate Links', color: '#fbbf24', value: data.edges.filter((e) => e.weight >= 0.55 && e.weight < 0.75).length },
    { label: 'Weak Links', color: '#e11d36', value: data.edges.filter((e) => e.weight < 0.55).length },
  ];
  const usesMax = Math.max(1, ...data.ingredients.map((i) => i.uses));
  const strongShare = data.edges.length ? Math.round((links[0].value / data.edges.length) * 100) : null;

  return (
    <div className="admin-page admin-overview">
      <PageHeader title="Dashboard" icon={BarChart3} subtitle="Monitor, analyze, and grow Dish-Wish." actions={<><Link to="/admin" className="pill">Admin Dashboard</Link><RangeSelect days={days} onChange={setDays} /></>} />
      <div className="grid gap-[0.85rem] xl:grid-cols-[minmax(0,1fr)_19.4rem]">
        <div className="min-w-0 space-y-[0.8rem]">
          <div className="admin-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} value={o.total_users.toLocaleString()} label="Registered Users" trend={pctShort(o.new_users, o.new_users_prev)} />
            <StatCard icon={Utensils} value={o.generations.toLocaleString()} label="Recipe Generations" tone="amber" trend={pctShort(o.generations, o.generations_prev)} />
            <StatCard icon={Target} value={saveRate !== null ? `${saveRate}%` : '—'} label="Save Rate" tone="green" />
            <StatCard icon={Star} value={o.avg_rating !== null ? <>{o.avg_rating}<span className="text-lg font-semibold"> / 5</span></> : '—'} label="Avg. User Rating" tone="amber" />
          </div>
          <section className="card relative overflow-hidden p-6" aria-label="Find your perfect meal">
            <img src={imageUrl(IMAGES.kitchenHero)} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 hidden h-full w-[42%] object-cover object-right lg:block [mask-image:linear-gradient(90deg,transparent,black_35%)]" />
            <div className="relative">
              <h2 className="font-display text-[2.7rem] font-extrabold leading-tight tracking-tight">Find Your <span className="text-crimson-deep">Perfect Meal</span></h2>
              <p className="text-[1.04rem] tracking-tight">Add ingredients, choose your taste, and get personalized meal recommendations.</p>
              <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={recommend}>
                <input className="field !w-auto min-w-[15rem] flex-1 lg:max-w-[27rem]" aria-label="Ingredients" placeholder="Add ingredients (e.g., Chicken, Tomato, Onion...)" value={text} onChange={(e) => setText(e.target.value)} />
                <label className="flex items-center gap-2 rounded-2xl bg-white/90 px-3 py-1.5 shadow-sm"><Flame size={19} className="text-crimson" aria-hidden="true" />
                  <select className="bg-transparent outline-none" aria-label="Taste" value={taste} onChange={(e) => setTaste(e.target.value)}>{TASTE_PRESETS.map((p) => <option key={p.label} value={p.label}>Taste: {p.label}</option>)}</select></label>
                <button type="submit" className="btn-primary"><Sparkles size={16} aria-hidden="true" />Recommend Meals</button>
              </form>
            </div>
          </section>
          <div className="grid gap-[0.7rem] lg:grid-cols-[1.25fr_1.17fr_1fr]">
            <Card title="User Growth" icon={Users}><AreaTrend data={cumulativeUsers(data.series, o.total_users)} x="day" y="users" label="Total users" height={160} callout={`${o.total_users.toLocaleString()} Users`} /></Card>
            <Card title="Recipe Generation Trend" icon={ChefHat}><BarTrend data={data.series.slice(-7)} x="day" y="generations" label="Generations per day" height={160} callout={`${o.generations.toLocaleString()} Recipes`} /></Card>
            <Card title="Ingredient Match Analysis" icon={Network}>
              <div className="flex flex-col items-center gap-2 sm:flex-row">
                <Donut size={118} thickness={6} label="Stored link strength" parts={links.map((l) => ({ value: l.value, color: l.color, label: l.label }))} center={<span><span className="block text-xl font-bold leading-none">{strongShare !== null ? `${strongShare}%` : '—'}</span><span className="text-[0.74rem]">Strong</span></span>} />
                <ul className="space-y-2 text-[0.8rem]">{links.map((l) => <li key={l.label} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: l.color }} />{l.label} ({l.value})</li>)}</ul>
              </div>
            </Card>
          </div>
          <div className="grid gap-[0.7rem] lg:grid-cols-[1.13fr_1fr_1fr]">
            <Card title="Popular Ingredients" icon={Leaf} iconClass="text-green-600">
              {data.ingredients.length === 0 ? <EmptyState title="No generations in this period" /> : (
                <ul className="space-y-1.5 text-[0.9rem]">
                  {data.ingredients.map((i) => <li key={i.name} className="grid grid-cols-[1.8rem_5.2rem_1fr_2.6rem] items-center gap-2"><IngredientBadge name={i.name} category="" size={26} /><span className="truncate">{short(i.name)}</span><Bar value={i.uses} max={usesMax} color="linear-gradient(90deg, #fb7185, #dc1029)" label={i.name} /><span className="text-right font-medium">{i.uses.toLocaleString()}</span></li>)}
                </ul>
              )}
            </Card>
            <Card title="Cuisine Preferences" icon={ChefHat}>
              {cuisines.length === 0 ? <EmptyState title="No cuisines saved yet" /> : (
                <div className="flex items-center gap-3">
                  <Donut size={118} thickness={6} label="Cuisine preferences" parts={cuisines} center={<span><span className="block text-lg font-bold leading-none">{cuisineTotal}</span><span className="text-[0.74rem]">Choices</span></span>} />
                  <ul className="min-w-0 flex-1 space-y-1 text-[0.84rem]">{cuisines.map((c) => <li key={c.label} className="flex items-center justify-between gap-1.5"><span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} /><span className="truncate">{c.label}</span></span><span>{Math.round((c.value / cuisineTotal) * 100)}%</span></li>)}</ul>
                </div>
              )}
            </Card>
            <Card title="Taste Preference Distribution" icon={Flame}>
              {tastes.every((t) => !t.value) ? <EmptyState title="No tastes saved yet" /> : (
                <ul className="flex h-[9.5rem] items-end justify-between gap-2 text-center text-[0.84rem]">
                  {tastes.map((t) => <li key={t.label} className="flex h-full min-w-0 flex-1 flex-col justify-end"><span className="font-semibold">{t.percent}%</span><span className="mx-auto w-full max-w-[2.6rem] rounded-t" style={{ height: `${Math.max(4, (t.percent / tastePeak) * 74)}%`, background: t.color }} /><span className="mt-1">{t.label}</span></li>)}
                </ul>
              )}
            </Card>
          </div>
        </div>
        <aside className="admin-small-titles flex min-w-0 flex-col gap-[0.7rem]" aria-label="Activity and health">
          <Card title="Live Activity" icon={Activity} action={updatedAt && <span className="badge badge-green whitespace-nowrap" title="Updates by itself"><span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />{updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}>
            {data.activity.length === 0 ? <EmptyState title="Nothing yet" /> : (
              <ul className="space-y-2 text-[0.9rem]">
                {data.activity.map(({ key, icon: Icon, title, detail, at }) => <li key={key} className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-crimson"><Icon size={19} aria-hidden="true" /></span><span className="min-w-0 leading-tight"><strong className="block truncate font-medium">{title}</strong><span className="block truncate text-[0.8rem]">{detail} • {formatDate(at)}</span></span></li>)}
              </ul>
            )}
          </Card>
          <Card title="Top Recommended Recipes" icon={Trophy} iconClass="text-amber-600">
            {data.recipes.length === 0 ? <EmptyState title="No recipe activity yet" /> : (
              <ul className="space-y-2 text-[0.92rem]">
                {data.recipes.map((r) => <li key={r.recipe_slug ?? r.recipe_name} className="flex items-center gap-2.5"><div className="w-[3.8rem] shrink-0"><RecipeCardImage category="" imageUrl={r.recipe_slug ? recipeImage(r.recipe_slug) : null} name={r.recipe_name} rounded="rounded-lg" /></div><span className="min-w-0 flex-1 leading-tight"><strong className="block truncate font-medium">{r.recipe_name}</strong><span className="text-[0.8rem]">{r.generated.toLocaleString()} recommendations</span></span>
                  <Link to="/admin/recipes" aria-label={`Open ${r.recipe_name} in Recipes`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-crimson"><ChevronRight size={17} aria-hidden="true" /></Link></li>)}
              </ul>
            )}
          </Card>
          <Card title="System Health" icon={Layers}>
            {!health ? <Spinner /> : (
              <ul className="divide-y divide-stone-100 text-[0.92rem]">
                {health.map((h) => <li key={h.label} className="flex items-center gap-3 py-1.5">{h.ok ? <CheckCircle2 size={25} className="shrink-0 text-green-600" aria-hidden="true" /> : <XCircle size={25} className="shrink-0 text-crimson" aria-hidden="true" />}<span className="leading-tight"><strong className="block font-medium">{h.label}</strong><span className={h.ok ? 'text-green-700' : 'text-crimson'}>{h.note}</span></span></li>)}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
