import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Bookmark, CalendarDays, ChefHat, ChevronRight, Clock, CookingPot, Download, Heart, KeyRound, ListChecks, Mail,
  ShieldCheck, SlidersHorizontal, Target, Trash2, UserRound, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { displayName } from '../components/AppShell';
import { SavedRecipesList } from '../components/SavedRecipesList';
import { Avatar, Card, Donut, ErrorNote, PageHeader, StatCard } from '../components/ui';
import { loadExtraPrefs, type ExtraPrefs } from '../lib/accountApi';
import { DIETS, listEvents, type RecipeEvent } from '../lib/curatedApi';
import { ALLERGEN_CHIPS, TASTES, kcalForTier, type Preferences } from '../lib/preferences';
import { loadPreferences } from '../lib/preferencesApi';
import { listSavedRecipes, type SavedRecipe } from '../lib/recipesApi';

export function ProfilePage() {
  const { session } = useAuth();
  const user = session?.user;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [extra, setExtra] = useState<ExtraPrefs | null>(null);
  const [events, setEvents] = useState<RecipeEvent[]>([]);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadPreferences(user.id).then(setPrefs).catch(() => setError(true));
    loadExtraPrefs(user.id).then(setExtra).catch(() => setExtra(null));
    listEvents(user.id).then(setEvents).catch(() => setEvents([]));
    listSavedRecipes(user.id).then(setSaved).catch(() => setSaved([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;
  const name = displayName(user);
  const kcal = prefs ? kcalForTier(prefs.calorieTier) : null;
  const tastes = prefs ? TASTES.filter((t) => prefs.tastes[t.key]) : [];
  const allergenLabels = prefs ? ALLERGEN_CHIPS.filter((c) => prefs.allergens.includes(c.tag)).map((c) => c.label) : [];
  const count = (k: RecipeEvent['kind']) => events.filter((e) => e.kind === k).length;

  // Completion counts only things this app actually stores for the cook.
  const checks = [
    { label: 'Display name', done: Boolean(user.user_metadata?.username) },
    { label: 'Taste preferences', done: tastes.length > 0 },
    { label: 'Allergies reviewed', done: Boolean(prefs?.onboarded) },
    { label: 'Diet preferences', done: Boolean(extra && (extra.diets.length || extra.cuisines.length || extra.maxMinutes)) },
    { label: 'First saved recipe', done: saved.length > 0 },
  ];
  const completion = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  return (
    <>
      <PageHeader title="My" accent="Profile" icon={UserRound} subtitle="View and manage your information, cooking preferences and activity on Dish-Wish." />
      {error && <ErrorNote>We couldn’t load your preferences. Please refresh to try again.</ErrorNote>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card flex flex-wrap items-center gap-6 p-6">
            <Avatar name={name} size={104} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate font-display text-3xl font-extrabold">{name}</h2>
                <span className="badge badge-red">Registered User</span>
              </div>
              <p className="mt-2 flex items-center gap-2 text-stone-600"><Mail size={16} className="text-crimson" />{user.email}</p>
              {user.created_at && (
                <p className="mt-1 flex items-center gap-2 text-sm text-stone-600"><CalendarDays size={16} className="text-crimson" />
                  Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Link to="/settings" className="btn-sm btn-outline"><UserRound size={14} />Edit profile</Link>
              <Link to="/onboarding" className="btn-sm btn-red"><SlidersHorizontal size={14} />Edit preferences</Link>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Zap} value={count('generated')} label="Generated" tone="amber" />
            <StatCard icon={Bookmark} value={saved.length} label="Saved Recipes" />
            <StatCard icon={CookingPot} value={count('cooked')} label="Cooked Recipes" tone="green" />
            <StatCard icon={Heart} value={saved.filter((s) => s.favorite).length} label="Favorites" />
          </div>

          {prefs && (
            <div className="grid gap-6 md:grid-cols-3">
              <Card title="Taste Profile" icon={ChefHat}>
                {tastes.length ? (
                  <ul className="space-y-1.5">
                    {tastes.map((t) => <li key={t.key} className="flex justify-between"><span>{t.label}</span><span className="font-semibold capitalize">{prefs.tastes[t.key]}</span></li>)}
                  </ul>
                ) : <p className="text-stone-500">No taste preferences yet.</p>}
              </Card>
              <Card title="Allergen Shield" icon={ShieldCheck}>
                {allergenLabels.length || prefs.customAllergens.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {[...allergenLabels, ...prefs.customAllergens].map((a) => <li key={a} className="chip-selected rounded-full px-3 py-1 text-sm font-semibold">{a}</li>)}
                  </ul>
                ) : <p className="text-stone-500">No allergens selected.</p>}
              </Card>
              <Card title="Calorie Target" icon={Target}>
                <p className="text-stone-700">{kcal ? <><span className="font-display text-3xl font-extrabold">{kcal.toLocaleString()}</span> kcal/day</> : 'No calorie goal.'}</p>
              </Card>
            </div>
          )}

          <section className="card p-5" aria-label="My saved dishes">
            <h2 className="card-title"><BookOpen size={20} className="text-crimson" aria-hidden="true" />My saved dishes</h2>
            <SavedRecipesList userId={user.id} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <Card title="Profile Completion" icon={ListChecks}>
            <div className="flex items-center gap-4">
              <Donut parts={[{ value: completion, color: '#16a34a', label: 'complete' }, { value: 100 - completion, color: '#f5ebe7', label: 'rest' }]}
                size={96} label={`Profile ${completion}% complete`} center={<span className="font-display text-xl font-extrabold">{completion}%</span>} />
              <ul className="space-y-1 text-sm">
                {checks.map((c) => <li key={c.label} className={c.done ? '' : 'text-stone-400'}>{c.done ? '✓' : '○'} {c.label}</li>)}
              </ul>
            </div>
          </Card>
          <Card title="My Preferences" icon={SlidersHorizontal}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt>Diet</dt><dd className="text-right font-semibold">{extra?.diets.length ? extra.diets.map((d) => DIETS.find((x) => x.key === d)?.label).join(', ') : 'None'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Preferred cuisine</dt><dd className="text-right font-semibold">{extra?.cuisines.length ? extra.cuisines.join(', ') : 'Any'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Typical cooking time</dt><dd className="font-semibold">{extra?.maxMinutes ? `≤ ${extra.maxMinutes} min` : 'Any'}</dd></div>
            </dl>
          </Card>
          <Card title="Recent Activity" icon={Clock}>
            {events.slice(0, 5).map((e) => (
              <p key={e.id} className="flex justify-between border-b border-stone-100 py-1.5 text-sm last:border-0">
                <span><span className="capitalize text-stone-500">{e.kind}</span> {e.recipe_name}</span>
              </p>
            ))}
            {events.length === 0 && <p className="text-sm text-stone-500">No activity yet.</p>}
          </Card>
          <Card title="Account Actions" icon={KeyRound}>
            <ul className="text-sm font-semibold">
              {[
                { to: '/settings?tab=security', icon: KeyRound, label: 'Change Password' },
                { to: '/settings?tab=security', icon: ShieldCheck, label: 'Privacy & Security' },
                { to: '/settings?tab=data', icon: Download, label: 'Export My Data' },
                { to: '/settings?tab=data', icon: Trash2, label: 'Delete Account', danger: true },
              ].map(({ to, icon: Icon, label, danger }) => (
                <li key={label}><Link to={to} className={`flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-rose-50 ${danger ? 'text-rose-700' : ''}`}>
                  <Icon size={18} className="text-crimson" />{label}<ChevronRight size={16} className="ml-auto" /></Link></li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
