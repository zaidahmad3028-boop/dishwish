import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Bookmark, CalendarDays, Camera, Check, ChefHat, ChevronRight, Clock, CookingPot, Download, Flame, Heart, KeyRound, LayoutGrid, Leaf, ListChecks, Mail, Pencil,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Target, Trash2, UserRound, Utensils, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { avatarUrl, displayName } from '../components/AppShell';
import { RecipeCardImage } from '../components/DishArt';
import { imageUrl, IMAGES, recipeImage } from '../lib/images';
import { uploadAvatar } from '../lib/uploads';
import { Avatar, Card, Donut, ErrorNote, PageHeader, formatDate } from '../components/ui';
import { loadExtraPrefs, saveAvatarUrl, type ExtraPrefs } from '../lib/accountApi';
import { DIETS, isCuratedSnapshot, listEvents, type RecipeEvent } from '../lib/curatedApi';
import { ALLERGEN_CHIPS, TASTES, kcalForTier, type Preferences } from '../lib/preferences';
import { loadPreferences } from '../lib/preferencesApi';
import { listSavedRecipes, type SavedRecipe } from '../lib/recipesApi';

type Tab = 'overview' | 'activity' | 'preferences';
const TABS = [{ key: 'overview', label: 'Overview', icon: LayoutGrid }, { key: 'activity', label: 'Activity', icon: Activity }, { key: 'preferences', label: 'Meal Preferences', icon: Utensils }] as const;

export function ProfilePage() {
  const { session } = useAuth();
  const user = session?.user;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [extra, setExtra] = useState<ExtraPrefs | null>(null);
  const [events, setEvents] = useState<RecipeEvent[]>([]);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [error, setError] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  const changePhoto = (file: File) => {
    setPhotoBusy(true);
    setPhotoError('');
    uploadAvatar(file).then(saveAvatarUrl).catch((e: Error) => setPhotoError(e.message)).finally(() => setPhotoBusy(false));
  };

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
  const allergenLabels = prefs ? [...ALLERGEN_CHIPS.filter((c) => prefs.allergens.includes(c.tag)).map((c) => c.label), ...prefs.customAllergens] : [];
  const count = (k: RecipeEvent['kind']) => events.filter((e) => e.kind === k).length;
  const dietText = extra?.diets.length ? extra.diets.map((d) => DIETS.find((x) => x.key === d)?.label).join(', ') : 'None';

  // Completion counts only things this app actually stores for the cook.
  const checks = [
    { label: 'Display name', done: Boolean(user.user_metadata?.username) },
    { label: 'Taste preferences', done: tastes.length > 0 },
    { label: 'Allergies reviewed', done: Boolean(prefs?.onboarded) },
    { label: 'Diet preferences', done: Boolean(extra && (extra.diets.length || extra.cuisines.length || extra.maxMinutes)) },
    { label: 'First saved recipe', done: saved.length > 0 },
  ];
  const completion = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  const stats = [
    { icon: ChefHat, value: count('generated'), label: 'Generated Recipes' }, { icon: Bookmark, value: saved.length, label: 'Saved Recipes' },
    { icon: CookingPot, value: count('cooked'), label: 'Cooked Recipes', cls: 'text-orange-500' }, { icon: Heart, value: saved.filter((s) => s.favorite).length, label: 'Favorites' },
  ];
  const recent = saved.slice(0, 3);
  const prefRows = [
    { icon: Flame, label: 'Taste', value: tastes.length ? tastes.map((t) => t.label).join(', ') : 'Any' }, { icon: Leaf, label: 'Diet', value: dietText, cls: 'text-green-600' },
    { icon: ShieldAlert, label: 'Allergies', value: allergenLabels.length ? allergenLabels.join(', ') : 'None' }, { icon: ChefHat, label: 'Preferred Cuisine', value: extra?.cuisines.length ? extra.cuisines.join(', ') : 'Any' },
    { icon: Clock, label: 'Typical Cooking Time', value: extra?.maxMinutes ? `≤ ${extra.maxMinutes} minutes` : 'Any' }, { icon: Target, label: 'Calorie Goal', value: kcal ? `${kcal.toLocaleString()} kcal/day` : 'None' },
  ];
  const activity = (
    <Card title="Recent Activity" icon={Activity}>
      {events.length === 0 ? <p className="text-sm text-stone-500">No activity yet.</p> : (
        <ul className="divide-y divide-stone-100 text-[0.92rem]">
          {events.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-1.5"><span className="min-w-0 truncate"><span className="capitalize text-stone-600">{e.kind}</span> <strong>{e.recipe_name}</strong></span><span className="whitespace-nowrap text-[0.84rem]">{formatDate(e.created_at)}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="tight-page">
      <PageHeader title="My" accent="Profile" icon={UserRound} subtitle="View and manage your personal information, cooking preferences and activity on Dish-Wish." />
      {error && <ErrorNote>We couldn’t load your preferences. Please refresh to try again.</ErrorNote>}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0 space-y-3">
          <section className="card relative flex flex-wrap items-center gap-6 overflow-hidden p-5 lg:pr-72">
            <img src={imageUrl(IMAGES.kitchenHero)} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 hidden h-full w-72 object-cover object-right [mask-image:linear-gradient(to_right,transparent,black_45%)] lg:block" />
            <div className="relative">
              <Avatar name={name} size={136} src={avatarUrl(user)} />
              <label title={avatarUrl(user) ? 'Change photo' : 'Upload photo'} className={`absolute bottom-1 right-0 grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-rose-100 bg-white text-crimson shadow ${photoBusy ? 'opacity-60' : ''}`}>
                <Camera size={20} aria-hidden="true" /><span className="sr-only">{photoBusy ? 'Uploading…' : avatarUrl(user) ? 'Change photo' : 'Upload photo'}</span>
                <input type="file" accept="image/webp,image/jpeg,image/png" className="sr-only" disabled={photoBusy}
                  onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) changePhoto(file); }} />
              </label>
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate font-display text-[2.1rem] font-extrabold leading-tight">{name}</h2>
                <span className="badge badge-red !text-[0.88rem]">Registered User</span>
              </div>
              <p className="mt-2 flex items-center gap-2.5 text-[1.02rem]"><Mail size={20} className="shrink-0 text-crimson" aria-hidden="true" /><span className="truncate">{user.email}</span></p>
              {user.created_at && <p className="mt-1.5 flex items-center gap-2.5 text-[1.02rem]"><CalendarDays size={20} className="shrink-0 text-crimson" aria-hidden="true" />Member since {formatDate(user.created_at)}</p>}
              {photoError && <p className="mt-1 text-xs text-crimson" role="alert">{photoError}</p>}
            </div>
            <Link to="/settings" className="btn-sm btn-outline absolute right-4 top-4"><Pencil size={15} />Edit Profile</Link>
          </section>

          <div role="tablist" aria-label="Profile sections" className="grid gap-2 sm:grid-cols-3">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className="pill justify-center !py-2.5 text-[1rem]" onClick={() => setTab(key)}><Icon size={22} aria-hidden="true" />{label}</button>
            ))}
          </div>

          <div role="tabpanel">
            {tab === 'overview' && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
                <Card title="Taste & Safety" icon={UserRound}>
                  <p className="text-[0.86rem] font-semibold">Taste Profile</p>
                  {tastes.length ? (
                    <ul className="mt-1 divide-y divide-stone-100 text-[0.95rem]">
                      {tastes.map((t) => <li key={t.key} className="flex justify-between py-1"><span>{t.label}</span><span className="font-semibold capitalize">{prefs?.tastes[t.key]}</span></li>)}
                    </ul>
                  ) : <p className="mt-1 text-sm text-stone-500">No taste preferences yet.</p>}
                  <p className="mt-3 flex items-center gap-1.5 text-[0.86rem] font-semibold"><ShieldCheck size={16} className="text-crimson" aria-hidden="true" />Allergen Shield</p>
                  {allergenLabels.length ? (
                    <ul className="mt-1 flex flex-wrap gap-1.5">{allergenLabels.map((a) => <li key={a} className="badge badge-red !text-[0.84rem]">{a}</li>)}</ul>
                  ) : <p className="mt-1 text-sm text-stone-500">No allergens selected.</p>}
                  <p className="mt-3 flex items-center gap-1.5 text-[0.86rem] font-semibold"><Target size={16} className="text-crimson" aria-hidden="true" />Calorie Target</p>
                  <p className="mt-1">{kcal ? <><strong className="text-xl">{kcal.toLocaleString()}</strong> kcal/day</> : <span className="text-sm text-stone-500">No calorie goal.</span>}</p>
                  <div className="mt-3 text-center"><Link to="/onboarding" className="btn-sm btn-outline"><Pencil size={15} className="text-crimson" />Edit Details</Link></div>
                </Card>
                <div className="min-w-0 space-y-3">
                  <Card title="Cooking Stats" icon={Zap}>
                    <ul className="grid grid-cols-2 gap-2">
                      {stats.map(({ icon: Icon, value, label, cls }) => (
                        <li key={label} className="flex items-center gap-3 rounded-2xl bg-white/80 p-2.5 shadow-sm"><Icon size={36} strokeWidth={1.7} className={cls ?? 'text-crimson'} aria-hidden="true" />
                          <span className="min-w-0"><strong className="block text-xl leading-none">{value}</strong><span className="text-[0.88rem] leading-tight">{label}</span></span></li>
                      ))}
                    </ul>
                  </Card>
                  <Card title="Recent Recipes" icon={Clock} action={<Link to="/recipes" className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-crimson">View All<ArrowRight size={15} /></Link>}>
                    {recent.length === 0 ? <p className="text-sm text-stone-500">Recipes you save will appear here.</p> : (
                      <ul className="grid grid-cols-3 gap-2">
                        {recent.map((r) => {
                          const curated = isCuratedSnapshot(r.recipe) ? r.recipe : null;
                          return (
                            <li key={r.id} className="min-w-0 overflow-hidden rounded-2xl bg-white/80 shadow-sm"><Link to={curated ? `/recipe/${curated.slug}` : `/recipes/${r.id}`} className="block">
                              <RecipeCardImage category={curated?.category ?? 'Main Course'} imageUrl={curated ? recipeImage(curated.slug) : null} name={r.title} rounded="rounded-t-2xl" />
                              <span className="block truncate px-2 pt-1 text-[0.9rem] font-semibold" title={r.title}>{r.title}</span>
                              <span className="flex items-center gap-1 px-2 pb-1.5 text-[0.82rem]"><Clock size={14} className="text-crimson" aria-hidden="true" />{r.recipe.minutes} min</span></Link></li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                </div>
              </div>
            )}
            {tab === 'activity' && activity}
            {tab === 'preferences' && (
              <Card title="Meal Preferences" icon={Utensils} action={<Link to="/onboarding" className="btn-sm btn-outline"><SlidersHorizontal size={15} />Edit Preferences</Link>}>
                <dl className="divide-y divide-stone-100 text-[0.95rem]">
                  {prefRows.map(({ label, value }) => <div key={label} className="flex justify-between gap-3 py-2"><dt>{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
                </dl>
              </Card>
            )}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card title="Profile Completion" icon={Target}>
            <div className="flex items-center gap-5">
              <Donut parts={[{ value: completion, color: '#16a34a', label: 'complete' }, { value: 100 - completion, color: '#f5ebe7', label: 'rest' }]}
                size={124} label={`Profile ${completion}% complete`} center={<span className="text-2xl font-bold">{completion}%</span>} />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[0.95rem] font-medium">{completion === 100 ? 'Your profile is complete!' : 'Your profile is almost complete!'}</p>
                <ul className="space-y-1 text-[0.92rem]">
                  {checks.map((c) => <li key={c.label} className="flex items-center gap-2"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded ${c.done ? 'bg-green-600 text-white' : 'border border-stone-300 bg-white'}`}>{c.done && <Check size={14} strokeWidth={3} aria-label="Done" />}</span>{c.label}</li>)}
                </ul>
              </div>
            </div>
          </Card>
          <Card title={<>My Preferences <span className="font-sans text-base font-normal">(Summary)</span></>} icon={ListChecks}>
            <dl className="divide-y divide-stone-100">
              {prefRows.slice(0, 5).map(({ icon: Icon, label, value, cls }) => (
                <div key={label} className="flex items-center justify-between gap-2 py-1.5 text-[0.95rem]"><dt className="flex items-center gap-2.5 whitespace-nowrap"><Icon size={20} className={cls ?? 'text-crimson'} aria-hidden="true" />{label}</dt>
                  <dd className="badge badge-red max-w-44 truncate !text-[0.84rem]" title={value}><span className="truncate">{value}</span></dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Account Actions" icon={KeyRound}>
            <ul className="divide-y divide-stone-100 text-[1rem] font-semibold">
              {[
                { to: '/settings?tab=security', icon: KeyRound, label: 'Change Password' },
                { to: '/settings?tab=security', icon: ShieldCheck, label: 'Privacy & Security' },
                { to: '/settings?tab=data', icon: Download, label: 'Export My Data' },
                { to: '/settings?tab=data', icon: Trash2, label: 'Delete Account', danger: true },
              ].map(({ to, icon: Icon, label, danger }) => (
                <li key={label}><Link to={to} className={`flex items-center gap-3 py-2.5 hover:text-crimson ${danger ? 'text-crimson' : ''}`}>
                  <Icon size={22} className="text-crimson" aria-hidden="true" />{label}<ChevronRight size={18} className="ml-auto" aria-hidden="true" /></Link></li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
