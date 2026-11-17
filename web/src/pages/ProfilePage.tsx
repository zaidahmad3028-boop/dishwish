import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, ClipboardList, Award, BarChart3, Bookmark, BookOpen, CalendarDays, Camera, Check, ChefHat, ChevronRight, Clock, CookingPot, Download, Flame, Heart, KeyRound, LayoutGrid, Leaf, ListChecks, Lock, Mail, MapPin, Pencil, Phone, Save,
  ShieldAlert, ShieldCheck, Sparkles, Target, Trash2, Trophy, UserRound, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { avatarUrl, displayName } from '../components/AppShell';
import { RecipeCardImage } from '../components/DishArt';
import { AvatarPhotoButton, EditProfileModal } from '../components/ProfileEditing';
import { LearnedCard } from '../components/PersonalWeights';
import { imageUrl, recipeImage } from '../lib/images';
import { Avatar, Card, Donut, EmptyState, ErrorNote, Modal, Notice, PageHeader, Spinner, Toggle, formatDate } from '../components/ui';
import { CUISINE_OPTIONS, ageFrom, defaultExtraPrefs, detailsFromUser, loadExtraPrefs, saveExtraPrefs, type ExtraPrefs, type ProfileDetails } from '../lib/accountApi';
import { SETTINGS_DIETS, isCuratedSnapshot, listCuratedRecipes, listEvents, type CuratedSummary, type RecipeEvent } from '../lib/curatedApi';
import { ALLERGEN_CHIPS, CALORIE_TIERS, LEVELS, TASTES, kcalForTier, parseCustomAllergens, type Preferences } from '../lib/preferences';
import { loadPreferences, savePreferences } from '../lib/preferencesApi';
import { listSavedRecipes, type SavedRecipe } from '../lib/recipesApi';
import { useLiveTick } from '../lib/useLiveTick';

type Tab = 'overview' | 'activity' | 'preferences' | 'achievements';
const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid }, { key: 'activity', label: 'Activity', icon: BarChart3 },
  { key: 'preferences', label: 'Meal Preferences', icon: UtensilsCrossed }, { key: 'achievements', label: 'Achievements', icon: Award },
] as const;
const ACTIVITY_LABEL: Record<RecipeEvent['kind'], string> = { generated: 'Generated', viewed: 'Viewed', saved: 'Saved', cooked: 'Cooked' };
const ACTIVITY_ICON: Record<RecipeEvent['kind'], LucideIcon> = { generated: Sparkles, viewed: BookOpen, saved: Bookmark, cooked: CookingPot };

// Dishes this cook saved, generated or cooked, each counted once however many times it was used.
export function totalRecipes(saved: { title: string }[], events: { kind: string; recipe_name: string }[]) {
  const names = new Set(saved.map((s) => s.title.toLowerCase()));
  for (const e of events) if (e.kind !== 'viewed') names.add(e.recipe_name.toLowerCase());
  return names.size;
}

// Unlocked only from what is really recorded for this cook.
export function achievementsFor(saved: { favorite?: boolean }[], events: { kind: string }[]) {
  const count = (k: string) => events.filter((e) => e.kind === k).length;
  return [
    { title: 'First Ingredient Match', hint: 'Generate your first recommendations', icon: Sparkles, have: count('generated'), need: 1 },
    { title: 'First Recipe Saved', hint: 'Save one recipe', icon: Bookmark, have: saved.length, need: 1 },
    { title: 'First Recipe Cooked', hint: 'Finish every step of one recipe', icon: CookingPot, have: count('cooked'), need: 1 },
    { title: 'First Favorite', hint: 'Heart one saved recipe', icon: Heart, have: saved.filter((s) => s.favorite).length, need: 1 },
    { title: 'Five Recipes Cooked', hint: 'Cook five times', icon: ChefHat, have: count('cooked'), need: 5 },
    { title: 'Ten Recipes Saved', hint: 'Save ten recipes', icon: Trophy, have: saved.length, need: 10 },
  ].map((a) => ({ ...a, unlocked: a.have >= a.need }));
}

function InfoLine({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <p className="flex items-center gap-3 text-[1.17rem] tracking-tight"><Icon size={24} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" /><span className="min-w-0 truncate">{children}</span></p>;
}

function AddInfo({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-[0.98rem] font-medium text-crimson hover:underline">Add information</button>;
}

function AboutRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <li className="flex items-center gap-[1.4rem] border-b border-stone-100 py-[1rem] text-[1.06rem] font-medium leading-tight tracking-tight last:border-0"><Icon size={26} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" /><span className="min-w-0">{children}</span></li>;
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="max-w-[12rem] truncate rounded-full border border-rose-200 bg-rose-50/80 px-2.5 py-[0.15rem] text-[0.92rem] font-medium tracking-tight text-crimson-deep">{children}</span>;
}

const CheckBox = ({ done }: { done: boolean }) => (
  <span className={`grid h-[1.2rem] w-[1.2rem] shrink-0 place-items-center rounded ${done ? 'bg-green-600 text-white' : 'border border-stone-300 bg-white'}`}>{done && <Check size={14} strokeWidth={3} aria-label="Done" />}</span>
);

export function ProfilePage() {
  const { session } = useAuth();
  const user = session?.user;
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [extra, setExtra] = useState<ExtraPrefs | null>(null);
  const [events, setEvents] = useState<RecipeEvent[]>([]);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [catalog, setCatalog] = useState<CuratedSummary[]>([]);
  const [error, setError] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [details, setDetails] = useState<ProfileDetails>(detailsFromUser(user));
  const [name, setName] = useState(displayName(user));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // The Meal Preferences form lives here so a half-finished edit survives switching tabs.
  const [draft, setDraft] = useState<{ prefs: Preferences; extra: ExtraPrefs; custom: string } | null>(null);
  const [notice, setNotice] = useState('');
  const tick = useLiveTick(['preferences', 'saved_recipes', 'recipe_events', 'curated_recipes']);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { setName(displayName(user)); setDetails(detailsFromUser(user)); }, [user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([loadPreferences(user.id), loadExtraPrefs(user.id).catch(() => defaultExtraPrefs())])
      .then(([p, x]) => { setPrefs(p); setExtra(x); setDraft((d) => d ?? { prefs: p, extra: x, custom: p.customAllergens.join(', ') }); })
      .catch(() => { if (!tick) setError(true); });
    listEvents(user.id).then(setEvents).catch(() => { if (!tick) setEvents([]); });
    listSavedRecipes(user.id).then(setSaved).catch(() => { if (!tick) setSaved([]); });
    listCuratedRecipes().then(setCatalog).catch(() => { if (!tick) setCatalog([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tick]);

  // Newest dishes the cook actually touched: saved ones, plus generated or cooked ones from the history.
  const recent = useMemo(() => {
    const bySlug = new Map(catalog.map((r) => [r.slug, r]));
    const rows = [
      ...saved.map((s) => {
        const slug = isCuratedSnapshot(s.recipe) ? s.recipe.slug : null;
        return { key: slug ?? s.id, name: s.title, slug, to: slug ? `/recipe/${slug}` : `/recipes/${s.id}`, minutes: s.recipe.minutes, category: slug ? bySlug.get(slug)?.category ?? '' : 'Main Course', date: s.createdAt };
      }),
      ...events.filter((e) => e.kind !== 'viewed' && e.recipe_slug && bySlug.has(e.recipe_slug)).map((e) => {
        const r = bySlug.get(e.recipe_slug as string) as CuratedSummary;
        return { key: r.slug, name: r.name, slug: r.slug as string | null, to: `/recipe/${r.slug}`, minutes: r.minutes, category: r.category, date: e.created_at };
      }),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return [...new Map(rows.reverse().map((r) => [r.key, r])).values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  }, [saved, events, catalog]);

  if (!user) return null;
  const kcal = prefs ? kcalForTier(prefs.calorieTier) : null;
  const tastes = prefs ? TASTES.filter((t) => prefs.tastes[t.key]) : [];
  const allergenLabels = prefs ? [...ALLERGEN_CHIPS.filter((c) => prefs.allergens.includes(c.tag)).map((c) => c.label), ...prefs.customAllergens] : [];
  const count = (k: RecipeEvent['kind']) => events.filter((e) => e.kind === k).length;
  const dietText = extra?.diets.length ? extra.diets.map((d) => SETTINGS_DIETS.find((x) => x.key === d)?.label).join(', ') : 'None';
  const cuisineText = extra?.cuisines.length ? extra.cuisines.join(', ') : '';
  const age = ageFrom(details.birthDate);
  const openEdit = () => setEditing(true);

  // Completion counts only things this app actually stores for the cook.
  const checks = [
    { label: 'Basic Information', done: Boolean(user.user_metadata?.username || details.bio || details.location) },
    { label: 'Meal Preferences', done: Boolean(extra && (extra.cuisines.length || extra.maxMinutes)) },
    { label: 'Diet & Allergies', done: Boolean(prefs?.onboarded) },
    { label: 'Taste Preferences', done: tastes.length > 0 },
    { label: 'Profile Photo', done: Boolean(avatarUrl(user)) },
  ];
  const completion = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  const stats = [
    { icon: ChefHat, value: totalRecipes(saved, events), label: 'Total Recipes', hint: 'Different dishes you saved, generated or cooked' }, { icon: Bookmark, value: saved.length, label: 'Saved Recipes' },
    { icon: CookingPot, value: count('cooked'), label: 'Cooked Recipes', cls: 'text-orange-500' }, { icon: Heart, value: saved.filter((s) => s.favorite).length, label: 'Favorites' },
  ];
  const prefRows = [
    { icon: Flame, label: 'Taste', value: tastes.length ? tastes.map((t) => t.label).join(', ') : 'Any' }, { icon: Leaf, label: 'Diet', value: dietText, cls: 'text-green-600' },
    { icon: ShieldAlert, label: 'Allergies', value: allergenLabels.length ? allergenLabels.join(', ') : 'None' }, { icon: ChefHat, label: 'Preferred Cuisine', value: cuisineText || 'Any' },
    { icon: Clock, label: 'Typical Cooking Time', value: extra?.maxMinutes ? `≤ ${extra.maxMinutes} minutes` : 'Any' },
  ];
  const earned = achievementsFor(saved, events);

  const savePrefs = async () => {
    if (!draft) return;
    setBusy(true);
    setNotice('');
    setSaveError('');
    try {
      const next = { ...draft.prefs, customAllergens: parseCustomAllergens(draft.custom), onboarded: true };
      await savePreferences(user.id, next);
      await saveExtraPrefs(user.id, draft.extra);
      setPrefs(next);
      setExtra(draft.extra);
      setNotice('Saved. Your preferences summary is updated.');
    } catch (err) { setSaveError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="tight-page profile-page">
      <PageHeader title="My" accent="Profile" icon={UserRound} subtitle="View and manage your personal information, cooking preferences and activity on Dish-Wish." />
      {error && <ErrorNote>We couldn’t load your preferences. Please refresh to try again.</ErrorNote>}
      <div className="grid gap-[1.25rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0 space-y-[1.3rem] xl:mt-[0.3rem]">
          <section className="card relative flex flex-wrap items-center gap-x-6 gap-y-3 overflow-hidden bg-gradient-to-r from-[#fdeee8]/90 via-[#fff6f2]/80 to-[#fddcd4]/80 p-5 lg:h-[15.2rem] lg:flex-nowrap lg:pl-[2.3rem]" aria-label="Your details">
            <img src={imageUrl('profile/chef-bowl.webp')} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[56%] hidden w-[13.6rem] lg:block" />
            <div className="relative shrink-0 rounded-full shadow-[0_0_0_5px_white,0_8px_18px_-6px_rgb(159_18_57/0.45)]">
              <Avatar name={name} size={150} src={avatarUrl(user)} />
              <AvatarPhotoButton hasPhoto={Boolean(avatarUrl(user))} className="bottom-0 right-[-0.2rem] h-[2.9rem] w-[2.9rem]" onError={setPhotoError} />
            </div>
            <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 lg:max-w-[30rem]">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 lg:flex-nowrap">
                <h2 className="truncate font-display text-[2.3rem] font-extrabold leading-tight tracking-tight">{name}</h2>
                <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50/90 px-3 py-1 text-[0.98rem] font-medium tracking-tight text-crimson-deep">Registered User</span>
              </div>
              <div className="ml-3 mt-3 space-y-[0.62rem] lg:ml-[0.9rem] lg:max-w-[20rem]">
                <InfoLine icon={Mail}>{user.email}</InfoLine>
                <InfoLine icon={Phone}>{details.phone || <AddInfo onClick={openEdit} />}</InfoLine>
                <InfoLine icon={CalendarDays}>{details.birthDate ? <>{formatDate(details.birthDate)}{age !== null && ` (Age: ${age})`}</> : <AddInfo onClick={openEdit} />}</InfoLine>
              </div>
              {photoError && <p className="mt-1 text-xs text-crimson" role="alert">{photoError}</p>}
            </div>
            <button type="button" onClick={openEdit} className="absolute right-[1.45rem] top-[1.45rem] z-10 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-[0.45rem] text-[1rem] font-semibold tracking-tight text-crimson-deep shadow"><Pencil size={18} className="text-crimson" aria-hidden="true" />Edit Profile</button>
            {user.created_at && (
              <div className="relative flex items-center gap-3 lg:absolute lg:right-[2.2rem] lg:top-[6.9rem] lg:border-y lg:border-stone-100 lg:py-2">
                <CalendarDays size={26} strokeWidth={1.8} className="text-crimson" aria-hidden="true" />
                <p className="text-[1rem] leading-snug tracking-tight">Member Since<span className="block">{formatDate(user.created_at)}</span></p>
              </div>
            )}
          </section>

          <div role="tablist" aria-label="Profile sections" className="grid grid-cols-2 gap-[0.7rem] lg:grid-cols-[1.08fr_1fr_1.2fr_1.2fr]">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`flex h-[3rem] items-center justify-center gap-2 whitespace-nowrap rounded-full text-[0.9rem] font-medium tracking-tight sm:gap-3 sm:text-[1.08rem] shadow-[0_6px_14px_-10px_rgb(159_18_57/0.5)] ${tab === key ? 'bg-gradient-to-r from-[#dc1029] via-[#ea2526] to-ember text-white' : 'bg-white/75 hover:bg-white'}`} onClick={() => setTab(key)}>
                <Icon size={24} strokeWidth={1.8} className={tab === key ? '' : 'text-crimson'} aria-hidden="true" />{label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="xl:pt-[0.12rem]">
            {tab === 'overview' && (
              <div className="grid gap-[1rem] lg:grid-cols-[minmax(0,0.69fr)_minmax(0,1fr)]">
                <Card title="About Me" icon={UserRound} className="flex flex-col">
                  {details.bio ? <p className="text-[1.1rem] leading-[1.32] tracking-tight">{details.bio}</p> : (
                    <p className="text-[1rem] leading-snug text-stone-600">Tell other cooks a little about yourself. <AddInfo onClick={openEdit} /></p>
                  )}
                  <ul className="mt-3 pl-2">
                    <AboutRow icon={MapPin}>{details.location || <AddInfo onClick={openEdit} />}</AboutRow>
                    <AboutRow icon={Heart}>Favorite Cuisine<span className="block font-normal">{cuisineText || <button type="button" onClick={() => setTab('preferences')} className="text-[0.98rem] font-medium text-crimson hover:underline">Add information</button>}</span></AboutRow>
                    <AboutRow icon={Clock}>Cooking Level<span className="block font-normal">{details.cookingLevel || <AddInfo onClick={openEdit} />}</span></AboutRow>
                  </ul>
                  <div className="mt-auto pt-3 text-center"><button type="button" onClick={openEdit} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-[1.02rem] font-semibold tracking-tight text-crimson-deep shadow"><Pencil size={18} className="text-crimson" aria-hidden="true" />Edit Details</button></div>
                </Card>
                <div className="min-w-0 space-y-[1rem]">
                  <Card title="Cooking Stats" icon={BarChart3}>
                    <ul className="grid grid-cols-2 gap-x-[0.95rem] gap-y-[0.75rem]">
                      {stats.map(({ icon: Icon, value, label, cls, hint }) => (
                        <li key={label} title={hint} className="flex h-[4.4rem] items-center gap-2.5 rounded-2xl bg-white/80 px-3 shadow-sm sm:gap-4 sm:px-5"><Icon size={42} strokeWidth={1.7} className={cls ?? 'text-crimson'} aria-hidden="true" />
                          <span className="min-w-0"><strong className="block text-[1.55rem] font-bold leading-none">{value}</strong><span className="mt-1 block text-[1rem] leading-tight tracking-tight lg:whitespace-nowrap">{label}</span></span></li>
                      ))}
                    </ul>
                  </Card>
                  <Card title="Recent Recipes" icon={Clock} action={<Link to="/recipes" className="flex items-center gap-1 whitespace-nowrap text-[1rem] font-semibold text-crimson-deep">View All<ArrowRight size={17} /></Link>}>
                    {recent.length === 0 ? <p className="py-3 text-[0.98rem] text-stone-600">Recipes you save, generate or cook will appear here.</p> : (
                      <ul className="grid gap-[1rem] sm:grid-cols-3">
                        {recent.map((r) => (
                          <li key={r.key} className="min-w-0 overflow-hidden rounded-2xl bg-white/85 shadow-sm"><Link to={r.to} className="block">
                            <RecipeCardImage category={r.category} imageUrl={r.slug ? recipeImage(r.slug) : null} name={r.name} frame="aspect-[162/98]" rounded="rounded-t-2xl" />
                            <span className="block truncate px-3.5 pt-2 text-[1.06rem] font-semibold tracking-tight" title={r.name}>{r.name}</span>
                            <span className="flex items-center gap-1.5 px-3.5 pb-2.5 pt-0.5 text-[0.98rem]"><Clock size={17} className="text-crimson" aria-hidden="true" />{r.minutes} min</span></Link></li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <Card title="Recent Activity" icon={Activity}>
                {events.length === 0 ? <EmptyState icon={Activity} title="No activity yet">Generate, save or cook a recipe and it will appear here.</EmptyState> : (
                  <ul className="divide-y divide-stone-100 text-[0.98rem]">
                    {events.slice(0, 20).map((e) => {
                      const Icon = ACTIVITY_ICON[e.kind];
                      return (
                        <li key={e.id} className="flex items-center gap-3 py-2">
                          <Icon size={22} className="shrink-0 text-crimson" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate"><span className="text-stone-600">{ACTIVITY_LABEL[e.kind]}</span> <strong>{e.recipe_name}</strong>{e.match_percent !== null && <span className="ml-2 text-[0.86rem] text-green-700">{e.match_percent}% match</span>}</span>
                          <span className="whitespace-nowrap text-[0.86rem]">{formatDate(e.created_at, true)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 text-[0.8rem] text-stone-500">Pantry changes aren’t recorded in your history, so they don’t appear here.</p>
              </Card>
            )}

            {tab === 'preferences' && (
              <Card title="Meal Preferences" icon={UtensilsCrossed}>
                {!draft ? <Spinner label="Loading preferences" /> : (
                  <div className="space-y-4 text-[0.95rem]">
                    <section aria-label="Taste">
                      <p className="flex items-center gap-1.5 font-semibold"><Flame size={18} className="text-crimson" aria-hidden="true" />Taste Profile</p>
                      <ul className="mt-1.5 divide-y divide-stone-100">
                        {TASTES.map((t) => (
                          <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{t.label}</span>
                            <span className="flex flex-wrap gap-1">{[null, ...LEVELS].map((lv) => (
                              <button key={lv ?? 'any'} type="button" className="pill !px-2.5 !py-0.5 !text-[0.84rem] capitalize" aria-pressed={draft.prefs.tastes[t.key] === lv} aria-label={`${t.label}: ${lv ?? 'any'}`}
                                onClick={() => setDraft({ ...draft, prefs: { ...draft.prefs, tastes: { ...draft.prefs.tastes, [t.key]: lv } } })}>{lv ?? 'Any'}</button>
                            ))}</span></li>
                        ))}
                      </ul>
                    </section>
                    <section aria-label="Cuisine">
                      <p className="font-semibold">Preferred Cuisine</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{CUISINE_OPTIONS.map((c) => (
                        <button key={c} type="button" className="pill !px-2.5 !py-1 !text-[0.86rem]" aria-pressed={draft.extra.cuisines.includes(c)}
                          onClick={() => setDraft({ ...draft, extra: { ...draft.extra, cuisines: draft.extra.cuisines.includes(c) ? draft.extra.cuisines.filter((x) => x !== c) : [...draft.extra.cuisines, c] } })}>{c}</button>
                      ))}</div>
                    </section>
                    <section aria-label="Diet">
                      <p className="flex items-center gap-1.5 font-semibold"><Leaf size={18} className="text-green-600" aria-hidden="true" />Diet</p>
                      <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">{SETTINGS_DIETS.map((d) => (
                        <li key={d.key} className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-1.5"><span>{d.label}</span>
                          <Toggle label={d.label} checked={draft.extra.diets.includes(d.key)} onChange={(on) => setDraft({ ...draft, extra: { ...draft.extra, diets: on ? [...draft.extra.diets, d.key] : draft.extra.diets.filter((x) => x !== d.key) } })} /></li>
                      ))}</ul>
                    </section>
                    <section aria-label="Allergies">
                      <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck size={18} className="text-crimson" aria-hidden="true" />Allergen Shield</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{ALLERGEN_CHIPS.map((c) => (
                        <button key={c.tag} type="button" className="pill !px-2.5 !py-1 !text-[0.86rem]" aria-pressed={draft.prefs.allergens.includes(c.tag)} title={c.example}
                          onClick={() => setDraft({ ...draft, prefs: { ...draft.prefs, allergens: draft.prefs.allergens.includes(c.tag) ? draft.prefs.allergens.filter((x) => x !== c.tag) : [...draft.prefs.allergens, c.tag] } })}>{c.label}</button>
                      ))}</div>
                      <input className="field mt-2 !py-1.5" aria-label="Other ingredients to avoid" placeholder="Other ingredients to avoid (comma separated)" value={draft.custom} onChange={(e) => setDraft({ ...draft, custom: e.target.value })} />
                      <p className="mt-1 text-[0.78rem] text-stone-500">Allergen tags come from our catalog and can’t rule out cross-contact or brand differences. Always check labels.</p>
                    </section>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block font-semibold">Typical Cooking Time
                        <select className="field mt-1 font-normal" value={draft.extra.maxMinutes ?? 0} onChange={(e) => setDraft({ ...draft, extra: { ...draft.extra, maxMinutes: Number(e.target.value) || null } })}>
                          <option value={0}>Any</option><option value={30}>Up to 30 minutes</option><option value={45}>Up to 45 minutes</option><option value={60}>Up to 60 minutes</option><option value={90}>Up to 90 minutes</option>
                        </select></label>
                      <label className="block font-semibold">Calorie Target
                        <select className="field mt-1 font-normal" value={draft.prefs.calorieTier ?? ''} onChange={(e) => setDraft({ ...draft, prefs: { ...draft.prefs, calorieTier: (e.target.value || null) as Preferences['calorieTier'] } })}>
                          <option value="">No goal</option>{CALORIE_TIERS.map((t) => <option key={t.tier} value={t.tier}>{t.label} · {t.kcal.toLocaleString()} kcal</option>)}
                        </select></label>
                    </div>
                    {kcal && <p className="text-[0.84rem] text-stone-600">Your saved goal: {kcal.toLocaleString()} kcal/day</p>}
                    {notice && <Notice>{notice}</Notice>}
                    {saveError && <ErrorNote>{saveError}</ErrorNote>}
                    <button type="button" className="btn-primary" disabled={busy} onClick={savePrefs}><Save size={16} aria-hidden="true" />{busy ? 'Saving…' : 'Save preferences'}</button>
                  </div>
                )}
              </Card>
            )}

            {tab === 'achievements' && (
              <Card title="Achievements" icon={Award}>
                <p className="-mt-1 mb-3 text-[0.95rem]">{earned.filter((a) => a.unlocked).length} of {earned.length} unlocked, based on your real activity.</p>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {earned.map(({ title, hint, icon: Icon, have, need, unlocked }) => (
                    <li key={title} className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ${unlocked ? 'bg-white/90' : 'bg-white/45'}`}>
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${unlocked ? 'bg-rose-100 text-crimson' : 'bg-stone-100 text-stone-400'}`}>{unlocked ? <Icon size={26} aria-hidden="true" /> : <Lock size={22} aria-hidden="true" />}</span>
                      <span className="min-w-0"><strong className={`block leading-tight ${unlocked ? '' : 'text-stone-600'}`}>{title}</strong>
                        <span className="text-[0.84rem] text-stone-600">{unlocked ? 'Unlocked' : `${hint} (${Math.min(have, need)}/${need})`}</span></span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-[1.05rem]" aria-label="Profile summary">
          <Card title="Profile Completion" icon={Target}>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 pl-[0.45rem]">
              <Donut parts={[{ value: completion, color: '#2eaa2c', label: 'complete' }, { value: 100 - completion, color: '#f5e3dd', label: 'rest' }]}
                size={128} thickness={5.5} label={`Profile ${completion}% complete`} center={<span className="text-[1.95rem] font-bold tracking-tight">{completion}%</span>} />
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-[0.98rem] sm:whitespace-nowrap font-medium  font-medium tracking-tight">{completion === 100 ? 'Your profile is complete!' : 'Your profile is almost complete!'}</p>
                <ul className="space-y-[0.48rem] text-[0.97rem] tracking-tight">
                  {checks.map((c) => <li key={c.label} className="flex items-center gap-[1.05rem] leading-tight"><CheckBox done={c.done} />{c.label}</li>)}
                </ul>
              </div>
            </div>
          </Card>
          <Card title={<span>My Preferences <span className="text-[1.05rem] font-normal">(Summary)</span></span>} icon={ListChecks}>
            <dl className="divide-y divide-stone-100 px-2">
              {prefRows.map(({ icon: Icon, label, value, cls }) => (
                <div key={label} className="flex items-center justify-between gap-2 py-[0.22rem] text-[0.97rem] font-medium tracking-tight"><dt className="flex items-center gap-4 sm:whitespace-nowrap"><Icon size={24} className={cls ?? 'text-crimson'} aria-hidden="true" />{label}</dt>
                  <dd title={value}><Pill>{value}</Pill></dd></div>
              ))}
            </dl>
          </Card>
          <LearnedCard userId={session?.user.id} token={session?.access_token} />
          <Card title="Account Actions" icon={ShieldCheck}>
            <ul className="divide-y divide-stone-100 pb-[1rem] pl-[1.2rem] pr-[0.55rem] pt-[0.3rem] text-[0.99rem] font-medium tracking-tight">
              {[
                { to: '/survey', icon: ClipboardList, label: 'Rate Dish-Wish (2-min survey)' },
                { to: '/settings?tab=security', icon: KeyRound, label: 'Change Password' },
                { to: '/settings?tab=security', icon: ShieldCheck, label: 'Privacy & Security' },
                { to: '/settings?tab=data', icon: Download, label: 'Export My Data' },
                { to: '/settings?tab=data', icon: Trash2, label: 'Delete Account', danger: true },
              ].map(({ to, icon: Icon, label, danger }) => (
                <li key={label}><button type="button" onClick={() => navigate(to)} className={`flex h-[3.2rem] w-full items-center gap-[1.3rem] text-left hover:text-crimson ${danger ? 'font-semibold text-crimson' : ''}`}>
                  <Icon size={27} strokeWidth={1.8} className="text-crimson" aria-hidden="true" />{label}<ChevronRight size={22} className="ml-auto text-crimson" aria-hidden="true" /></button></li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <EditProfileModal open={editing} userId={user.id} name={name} details={details} onClose={() => setEditing(false)} onSaved={(n, d) => { setName(n); setDetails(d); }} />
    </div>
  );
}
