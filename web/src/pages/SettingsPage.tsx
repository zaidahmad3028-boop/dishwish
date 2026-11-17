import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bell, CalendarDays, ChefHat, ChevronDown, ChevronRight, Download, Flame, KeyRound, Leaf, Lock, LogOut, Mail, Megaphone, MessageSquare, Monitor, Palette, Pencil, Phone, RotateCcw, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Trash2, UserRound, X, Zap, type LucideIcon } from 'lucide-react';
import { signOut, useAuth } from '../auth/AuthProvider';
import { avatarUrl, displayName } from '../components/AppShell';
import { FeedbackForm } from '../components/FeedbackForm';
import { AvatarPhotoButton, EditProfileModal } from '../components/ProfileEditing';
import { Avatar, Card, ErrorNote, Modal, PageHeader, Spinner, Toggle, downloadFile, formatDate, STATUS_BADGE } from '../components/ui';
import {
  applyTextSize, changePassword, defaultExtraPrefs, deleteMyAccount, detailsFromUser, exportMyData, listMyFeedback, loadExtraPrefs, saveExtraPrefs, saveSavoryTaste, savoryFromUser,
  type ExtraPrefs, type FeedbackRow,
} from '../lib/accountApi';
import { SETTINGS_DIETS, type Diet } from '../lib/curatedApi';
import { imageUrl } from '../lib/images';
import { ALLERGEN_CHIPS, CALORIE_TIERS, LEVELS, SPICE_CHOICES, TASTES, allergenLabel, parseCustomAllergens, resetPreferences, toggleSpice, toggleTaste, type AllergenTag, type Preferences, type TasteKey } from '../lib/preferences';
import { loadPreferences, savePreferences } from '../lib/preferencesApi';
import { useLiveTick } from '../lib/useLiveTick';

type Tab = 'profile' | 'diet' | 'notifications' | 'security' | 'appearance' | 'feedback' | 'data';
const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'profile', label: 'Profile & Preferences', icon: UserRound }, { key: 'diet', label: 'Diet & Allergies', icon: Leaf },
  { key: 'notifications', label: 'Notifications', icon: Bell }, { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'appearance', label: 'Appearance', icon: Palette },
];
// Reached from the links under Quick Actions (and from My Profile), not from the five main tabs.
const SECONDARY: Tab[] = ['feedback', 'data'];
const NOTIFY_ROWS: { key: 'recipe_ideas' | 'reminders' | 'tips'; label: string; icon: LucideIcon }[] = [
  { key: 'recipe_ideas', label: 'Recipe recommendations and new ideas', icon: Bell },
  { key: 'reminders', label: 'Meal plan and cooking reminders', icon: CalendarDays },
  { key: 'tips', label: 'Updates, new features and tips', icon: Megaphone },
];
const TASTE_TILES: { key: TasteKey; label: string; image: string }[] = [
  { key: 'salty', label: 'Salty', image: 'salty' }, { key: 'sweet', label: 'Sweet', image: 'sweet' }, { key: 'sour', label: 'Sour', image: 'sour' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<span className="mt-1 block font-normal">{children}</span></label>;
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-[0.56rem] text-[0.97rem] tracking-tight lg:h-[2.66rem] lg:py-0">
      <dt className="flex w-[11.6rem] shrink-0 items-center gap-[0.85rem]"><Icon size={24} strokeWidth={1.8} className="text-crimson" aria-hidden="true" />{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function TasteTile({ label, image, checked, onToggle, title, large = false }: { label: string; image: string; checked: boolean; onToggle: () => void; title?: string; large?: boolean }) {
  return (
    <li className="min-w-0"><button type="button" role="checkbox" aria-checked={checked} title={title} onClick={onToggle}
      className={`relative w-full rounded-[1.1rem] border text-left shadow-sm transition ${large ? 'h-[5.5rem]' : 'h-[6rem]'} ${checked ? 'border-rose-300 bg-rose-100/80' : 'border-white/90 bg-white/70 hover:bg-rose-50'}`}>
      <img src={imageUrl(`settings/taste-${image}.webp`)} alt="" aria-hidden="true" className="absolute left-[0.7rem] top-[0.75rem] h-[1.85rem] w-auto sm:left-[0.88rem] sm:top-[0.6rem] sm:h-[2.35rem]" />
      <span className={`absolute ${large ? 'right-[0.5rem] sm:right-[1.25rem]' : 'right-[0.8rem]'} top-[0.95rem] grid h-[1.3rem] w-[1.3rem] place-items-center rounded-[0.35rem] border ${checked ? 'border-crimson bg-crimson text-white' : 'border-stone-400 bg-white'}`}>{checked && <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
      <span className={`absolute left-[1.15rem] right-1 block text-[1rem] font-medium leading-[1.15] tracking-tight ${large ? 'top-[3.4rem]' : 'top-[3.05rem]'}`}>{label}</span>
    </button></li>
  );
}

// Selected allergies as removable chips, with the full catalog in a searchable list.
function AllergyPicker({ prefs, onChange }: { prefs: Preferences; onChange: (next: Preferences) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const text = query.trim().toLowerCase();
  const options = ALLERGEN_CHIPS.filter((c) => !prefs.allergens.includes(c.tag) && (!text || c.label.toLowerCase().includes(text) || c.example.toLowerCase().includes(text)));
  const canAddWord = text.length > 0 && !prefs.customAllergens.includes(text) && !ALLERGEN_CHIPS.some((c) => c.label.toLowerCase() === text);
  const pick = (tag: AllergenTag) => { onChange({ ...prefs, allergens: [...prefs.allergens, tag] }); setQuery(''); setOpen(false); };
  const addWord = () => { onChange({ ...prefs, customAllergens: parseCustomAllergens([...prefs.customAllergens, query].join(',')) }); setQuery(''); setOpen(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!text) return;
      if (options.length > 0) pick(options[0].tag); else if (canAddWord) addWord();
    }
  };
  const chip = (key: string, label: string, remove: () => void) => (
    <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-rose-100/90 py-[0.15rem] pl-3 pr-1.5 text-[0.9rem] font-medium tracking-tight">{label}
      <button type="button" className="text-crimson" aria-label={`Remove ${label}`} onClick={remove}><X size={17} strokeWidth={2.4} aria-hidden="true" /></button></span>
  );
  return (
    <div className="relative mt-[0.45rem]" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <div className="flex min-h-[2.65rem] flex-wrap items-center gap-1.5 rounded-[1.3rem] border border-white bg-white/80 py-1 pl-2 pr-3 shadow-sm">
        {prefs.allergens.map((tag) => chip(tag, allergenLabel(tag), () => onChange({ ...prefs, allergens: prefs.allergens.filter((x) => x !== tag) })))}
        {prefs.customAllergens.map((word) => chip(word, word, () => onChange({ ...prefs, customAllergens: prefs.customAllergens.filter((x) => x !== word) })))}
        <input role="combobox" aria-expanded={open} aria-controls="allergy-options" aria-label="Add more allergies" placeholder="Add more allergies..." value={query}
          className="min-w-[8rem] flex-1 bg-transparent px-1 text-[0.9rem] tracking-tight outline-none placeholder:text-stone-700"
          onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={onKey} />
        <button type="button" aria-label={open ? 'Hide allergy list' : 'Show allergy list'} onClick={() => setOpen((v) => !v)}><ChevronDown size={20} className="text-crimson-deep" aria-hidden="true" /></button>
      </div>
      {open && (
        <ul id="allergy-options" role="listbox" aria-label="Allergies" className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-rose-100 bg-white p-1.5 shadow-xl">
          {options.map((c) => (
            <li key={c.tag} role="option" aria-selected={false}><button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left text-[0.95rem] hover:bg-rose-50" onClick={() => pick(c.tag)}>
              <span className="font-medium">{c.label}</span><span className="truncate text-[0.8rem] text-stone-500">{c.example}</span></button></li>
          ))}
          {canAddWord && <li role="option" aria-selected={false}><button type="button" className="w-full rounded-xl px-3 py-1.5 text-left text-[0.95rem] font-medium text-crimson hover:bg-rose-50" onClick={addWord}>Add “{text}”</button></li>}
          {options.length === 0 && !canAddWord && <li className="px-3 py-1.5 text-[0.9rem] text-stone-500">Every allergy on our list is already selected.</li>}
        </ul>
      )}
    </div>
  );
}

function ActionLine({ icon: Icon, label, onClick, danger = false, children }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; children?: ReactNode }) {
  return (
    <li><button type="button" onClick={onClick} className={`flex h-full w-full items-center gap-[1.05rem] text-left hover:text-crimson ${danger ? 'font-semibold text-crimson' : ''}`}>
      <Icon size={25} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" /><span className="min-w-0 flex-1">{label}</span>{children}<ChevronRight size={23} strokeWidth={2.2} className="shrink-0 text-crimson-deep" aria-hidden="true" /></button></li>
  );
}

export function SettingsPage() {
  const { session } = useAuth();
  const user = session?.user;
  const userId = user?.id;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as Tab;
  const tab: Tab = TABS.some((t) => t.key === asked) || SECONDARY.includes(asked) ? asked : 'profile';
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [extra, setExtra] = useState<ExtraPrefs>(defaultExtraPrefs());
  const [savory, setSavory] = useState(savoryFromUser(user));
  const [name, setName] = useState(displayName(user));
  const [details, setDetails] = useState(detailsFromUser(user));
  const [editing, setEditing] = useState(false);
  const [intensity, setIntensity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: '', confirm: '' });

  // Choices save themselves shortly after each change, one save at a time, newest last.
  const pending = useRef<{ prefs: Preferences; extra: ExtraPrefs } | null>(null);
  const lastSaved = useRef<ExtraPrefs>(defaultExtraPrefs());
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (!job || !userId) return queue.current;
    pending.current = null;
    queue.current = queue.current.then(async () => {
      try {
        await savePreferences(userId, { ...job.prefs, onboarded: true });
        await saveExtraPrefs(userId, job.extra);
        lastSaved.current = job.extra;
        setNote('Saved');
        setError('');
      } catch (e) {
        // Don't leave a choice on screen that the account doesn't actually hold.
        if (!pending.current) setExtra(lastSaved.current);
        setNote('');
        setError((e as Error).message);
      }
    });
    return queue.current;
  }, [userId]);
  useEffect(() => () => { void flush(); }, [flush]);

  useEffect(() => {
    if (!userId) return;
    loadPreferences(userId).then(setPrefs).catch((e: Error) => setError(e.message));
    loadExtraPrefs(userId).then((x) => { setExtra(x); lastSaved.current = x; }).catch(() => {});
  }, [userId]);
  // Picks up changes from another device, but never over a change that is still being saved here.
  const tick = useLiveTick(['preferences']);
  useEffect(() => {
    if (!tick || !userId) return;
    Promise.all([loadPreferences(userId), loadExtraPrefs(userId)]).then(([p, x]) => {
      if (pending.current) return;
      setPrefs((old) => (JSON.stringify(old) === JSON.stringify(p) ? old : p));
      setExtra((old) => (JSON.stringify(old) === JSON.stringify(x) ? old : x));
      lastSaved.current = x;
    }).catch(() => {});
  }, [tick, userId]);
  useEffect(() => { setName(displayName(user)); setDetails(detailsFromUser(user)); setSavory(savoryFromUser(user)); }, [user]);
  useEffect(() => {
    if (tab === 'feedback' && user) listMyFeedback(user.id).then(setFeedback).catch(() => setFeedback([]));
  }, [tab, user]);
  useEffect(() => { setNote(''); setError(''); }, [tab]);
  useEffect(() => {
    if (!note) return undefined;
    const t = window.setTimeout(() => setNote(''), 2500);
    return () => window.clearTimeout(t);
  }, [note]);

  if (!user || !prefs) return <Spinner label="Loading settings" />;

  const change = (nextPrefs: Preferences, nextExtra: ExtraPrefs) => {
    setPrefs(nextPrefs);
    setExtra(nextExtra);
    pending.current = { prefs: nextPrefs, extra: nextExtra };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 400);
  };
  const changePrefs = (next: Preferences) => change(next, extra);
  const changeExtra = (next: ExtraPrefs) => change(prefs, next);

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setNote('');
    try { await fn(); setNote(success); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const toggleSavory = () => {
    const next = !savory;
    setSavory(next);
    saveSavoryTaste(next).then(() => setNote('Saved')).catch((e: Error) => { setSavory(!next); setError(e.message); });
  };
  const toggleDiet = (key: Diet) => changeExtra({ ...extra, diets: extra.diets.includes(key) ? extra.diets.filter((x) => x !== key) : [...extra.diets, key] });
  const exportData = () => run(async () => downloadFile(`dishwish-export-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(await exportMyData(user.id, { email: user.email, created_at: user.created_at, details: user.user_metadata }), null, 2)), 'Export downloaded');

  const changePw = (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { setError('The new passwords don’t match.'); return; }
    run(async () => { await changePassword(user.email ?? '', pw.current, pw.next); setPw({ current: '', next: '', confirm: '' }); },
      'Password changed. Other devices were signed out.');
  };
  const removeAccount = (e: FormEvent) => {
    e.preventDefault();
    if (deleteForm.confirm !== 'DELETE') { setError('Type DELETE to confirm.'); return; }
    run(async () => { await deleteMyAccount(user.email ?? '', deleteForm.password); navigate('/auth', { replace: true }); }, '');
  };
  const resetAll = () => run(async () => {
    const nextPrefs = resetPreferences(prefs);
    const nextExtra = { ...defaultExtraPrefs(), textSize: extra.textSize };
    pending.current = null;
    window.clearTimeout(timer.current);
    await savePreferences(user.id, nextPrefs);
    await saveExtraPrefs(user.id, nextExtra);
    await saveSavoryTaste(false);
    lastSaved.current = nextExtra;
    setPrefs(nextPrefs);
    setExtra(nextExtra);
    setSavory(false);
    setResetOpen(false);
  }, 'Preferences reset');

  const dietPills = (
    <div className="mt-[0.4rem] flex flex-wrap gap-x-[0.55rem] gap-y-[0.55rem]">
      <label className="diet-pill"><input type="checkbox" checked={extra.diets.length === 0} onChange={() => changeExtra({ ...extra, diets: [] })} />None</label>
      {SETTINGS_DIETS.map((d) => <label key={d.key} className="diet-pill"><input type="checkbox" checked={extra.diets.includes(d.key)} onChange={() => toggleDiet(d.key)} />{d.label}</label>)}
    </div>
  );
  const dietHeading = <p className="flex items-center gap-[0.8rem] text-[1.04rem] font-medium tracking-tight"><ChefHat size={24} strokeWidth={1.8} className="text-crimson" aria-hidden="true" />Diet Type</p>;
  const allergyHeading = <p className="mt-[0.8rem] flex items-center gap-[0.8rem] text-[1.04rem] font-medium tracking-tight"><AlertTriangle size={24} className="fill-crimson text-white" aria-hidden="true" />Allergies (if any)</p>;
  const notifyList = (
    <ul className="divide-y divide-stone-100 text-[0.92rem] tracking-tight">
      {NOTIFY_ROWS.map(({ key, label, icon: Icon }) => (
        <li key={key} className="flex min-h-[2.25rem] items-center gap-[1.05rem] py-1 pl-[0.4rem] sm:py-0 sm:pl-[1.1rem]"><Icon size={23} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" /><span className="min-w-0 flex-1 leading-tight">{label}</span>
          <Toggle label={label} checked={extra.notify[key]} onChange={(v) => changeExtra({ ...extra, notify: { ...extra.notify, [key]: v } })} /></li>
      ))}
    </ul>
  );

  const content: Record<Tab, ReactNode> = {
    profile: (
      <div className="settings-grid grid gap-[1.1rem] xl:grid-cols-[minmax(0,1.052fr)_minmax(0,1fr)_20.8rem] xl:gap-[1.25rem]">
        <div className="min-w-0 space-y-[1.05rem]">
          <Card title="Profile Information" icon={UserRound} className="settings-roomy" action={<button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-rose-100 bg-white/90 px-3 py-[0.42rem] text-[0.94rem] font-medium tracking-tight text-crimson-deep shadow-sm" onClick={() => setEditing(true)}><Pencil size={19} className="text-crimson" aria-hidden="true" />Edit Profile</button>}>
            <div className="flex items-center gap-[1.75rem] pb-[1.45rem] pl-[0.3rem] pt-[0.35rem]">
              <div className="relative shrink-0 rounded-full shadow-[0_0_0_4px_white,0_8px_18px_-6px_rgb(159_18_57/0.45)]">
                <Avatar name={name || '?'} size={108} src={avatarUrl(user)} />
                <AvatarPhotoButton hasPhoto={Boolean(avatarUrl(user))} className="bottom-[0.1rem] right-[-0.2rem] h-[2.1rem] w-[2.1rem]" iconSize={17} onError={setError} />
              </div>
              <div className="min-w-0"><p className="truncate font-display text-[1.52rem] font-extrabold leading-tight tracking-tight">{name}</p><p className="mt-[0.2rem] truncate text-[1rem] tracking-tight">{user.email}</p>
                <span className="mt-[0.4rem] inline-block rounded-full border border-rose-100 bg-white/90 px-3 py-[0.3rem] text-[0.94rem] font-medium tracking-tight text-crimson-deep">Registered User</span></div>
            </div>
            <dl className="divide-y divide-stone-100 border-t border-stone-100 pl-[0.3rem]">
              <Row icon={UserRound} label="Full Name">{name}</Row>
              <Row icon={Mail} label="Email">{user.email}</Row>
              <Row icon={Phone} label="Phone">{details.phone || <button type="button" className="font-medium text-crimson hover:underline" onClick={() => setEditing(true)}>Add information</button>}</Row>
              <Row icon={CalendarDays} label="Date of Birth">{details.birthDate ? formatDate(details.birthDate) : <button type="button" className="font-medium text-crimson hover:underline" onClick={() => setEditing(true)}>Add information</button>}</Row>
            </dl>
          </Card>
          <Card title="Taste Preferences" icon={Flame} iconClass="fill-crimson text-crimson" action={<button type="button" className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.86rem] font-medium text-crimson-deep hover:underline" onClick={() => setIntensity(true)}><SlidersHorizontal size={15} aria-hidden="true" />Intensity</button>}>
            <p className="settings-sub">Set your favorite taste profile for better recipe recommendations.</p>
            <ul className="-mx-[0.25rem] mt-[1.4rem] grid grid-cols-3 gap-[1rem] pr-[0.6rem]">
              {SPICE_CHOICES.map((c) => <TasteTile key={c.level} label={c.label} image={c.image} checked={prefs.tastes.spicy === c.level} large onToggle={() => changePrefs({ ...prefs, tastes: toggleSpice(prefs.tastes, c.level) })} />)}
            </ul>
            <ul className="-mx-[0.25rem] mt-[0.6rem] grid grid-cols-2 gap-[0.85rem] pb-[0.65rem] sm:grid-cols-[1.05fr_1fr_1fr_1fr]">
              <TasteTile label="Savory (Umami)" image="savory" checked={savory} title="Saved to your account. Recommendations don’t use savory yet." onToggle={toggleSavory} />
              {TASTE_TILES.map((t) => <TasteTile key={t.key} label={t.label} image={t.image} checked={prefs.tastes[t.key] !== null} onToggle={() => changePrefs({ ...prefs, tastes: toggleTaste(prefs.tastes, t.key) })} />)}
            </ul>
          </Card>
        </div>
        <div className="min-w-0 space-y-[1.05rem]">
          <Card title="Diet & Allergies" icon={Leaf} iconClass="fill-green-500 text-green-700" className="relative z-20">
            <p className="settings-sub">Tell us about your dietary needs and any ingredients to avoid.</p>
            <div className="mt-[0.7rem]">{dietHeading}{dietPills}{allergyHeading}<AllergyPicker prefs={prefs} onChange={changePrefs} /></div>
          </Card>
          <Card title="Notification Preferences" icon={Bell}>
            <p className="settings-sub">Choose what updates you want to receive.</p>
            <div className="mt-[0.5rem]">{notifyList}</div>
          </Card>
          <Card title="Security & Account" icon={ShieldCheck}>
            <p className="settings-sub">Keep your account safe and up to date.</p>
            <ul className="mt-[0.45rem] divide-y divide-stone-100 pl-[0.85rem] pr-[0.2rem] text-[0.96rem] font-medium tracking-tight [&>li]:flex [&>li]:min-h-[2.72rem]">
              <ActionLine icon={Lock} label="Change Password" onClick={() => setParams({ tab: 'security' })} />
              <li className="items-center gap-[1.05rem]"><KeyRound size={25} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" /><span className="min-w-0 flex-1">Two-Factor Authentication<span className="block text-[0.78rem] font-normal text-stone-500 sm:hidden">Not available yet</span></span>
                <span className="hidden whitespace-nowrap text-[0.78rem] font-normal text-stone-500 sm:inline">Not available yet</span><Toggle label="Two-Factor Authentication (not available yet)" checked={false} disabled onChange={() => {}} /></li>
              <ActionLine icon={Monitor} label="Active Sessions" onClick={() => setParams({ tab: 'security' })}><span className="whitespace-nowrap rounded-full bg-rose-100/90 px-3 py-[0.15rem] text-[0.93rem] text-crimson-deep">This device</span></ActionLine>
            </ul>
          </Card>
        </div>
        <div className="min-w-0 space-y-[1.05rem]">
          <section className="card px-4 pb-[1.75rem] pt-[1.6rem] text-center">
            <img src={imageUrl('settings/chef-bowl-large.webp')} alt="" aria-hidden="true" className="mx-auto w-[16.9rem] max-w-full" />
            <h2 className="-mt-[0.1rem] font-display text-[2.25rem] font-extrabold leading-[1.1] tracking-tight">Personalize<br />Your <span className="text-crimson">Dish-Wish</span></h2>
            <p className="mx-auto mt-[0.75rem] max-w-[18rem] text-[0.98rem] leading-[1.42] tracking-tight">Set your taste, diet and preferences to get recipes made just for you.</p>
          </section>
          <Card title="Quick Actions" icon={Zap} iconClass="fill-orange-500 text-orange-500" className="settings-roomy">
            <ul className="divide-y divide-stone-100 pl-[0.8rem] text-[0.97rem] font-medium tracking-tight [&>li]:h-[3.42rem]">
              <ActionLine icon={RotateCcw} label="Reset All Preferences" onClick={() => { setError(''); setResetOpen(true); }} />
              <ActionLine icon={Download} label="Export My Data" onClick={exportData} />
              <ActionLine icon={Trash2} danger label="Delete Account" onClick={() => { setError(''); setDeleteOpen(true); }} />
            </ul>
          </Card>
          <nav aria-label="More settings" className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[0.95rem] font-medium">
            <button type="button" className="inline-flex items-center gap-1.5 text-crimson-deep hover:underline" onClick={() => setParams({ tab: 'feedback' })}><MessageSquare size={17} aria-hidden="true" />Feedback</button>
            <button type="button" className="inline-flex items-center gap-1.5 text-crimson-deep hover:underline" onClick={() => setParams({ tab: 'data' })}><Download size={17} aria-hidden="true" />Your Data</button>
          </nav>
        </div>
      </div>
    ),
    diet: (
      <Card title="Diet & Allergies" icon={Leaf} iconClass="fill-green-500 text-green-700" className="max-w-[52rem]">
        <p className="mb-3 text-[0.98rem] tracking-tight">Allergies are hard filters: a recipe containing one is never recommended, whatever its score.</p>
        {dietHeading}{dietPills}{allergyHeading}<AllergyPicker prefs={prefs} onChange={changePrefs} />
        <p className="mt-4 font-medium">Daily calorie goal</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="pill" aria-pressed={prefs.calorieTier === null} onClick={() => changePrefs({ ...prefs, calorieTier: null })}>No goal</button>
          {CALORIE_TIERS.map((t) => (
            <button key={t.tier} type="button" className="pill" aria-pressed={prefs.calorieTier === t.tier} onClick={() => changePrefs({ ...prefs, calorieTier: t.tier })}>{t.label} · {t.kcal.toLocaleString()} kcal</button>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Allergen data comes from our ingredient catalog and can’t rule out cross-contact or brand differences. Always check labels.</p>
      </Card>
    ),
    notifications: (
      <Card title="Notification Preferences" icon={Bell} className="max-w-[52rem]">
        <p className="mb-2 text-[0.95rem] tracking-tight">Your choices are saved now. Dish-Wish does not send these messages yet; only account emails (confirmation and password reset) are sent today.</p>
        {notifyList}
        <div className="flex h-[2.25rem] items-center gap-[1.05rem] border-t border-stone-100 pl-[1.1rem] text-[0.99rem] tracking-tight"><MessageSquare size={23} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" /><span className="flex-1">Replies to my feedback</span>
          <Toggle label="Replies to my feedback" checked={extra.notify.feedback_replies} onChange={(v) => changeExtra({ ...extra, notify: { ...extra.notify, feedback_replies: v } })} /></div>
      </Card>
    ),
    security: (
      <div className="grid gap-[1.1rem] lg:grid-cols-2">
        <Card title="Change Password" icon={KeyRound}>
          <form onSubmit={changePw} className="space-y-3" noValidate>
            <Field label="Current password"><input className="field" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="New password (8+ characters)"><input className="field" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <Field label="Confirm new password"><input className="field" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            <button type="submit" className="btn-primary" disabled={busy}><KeyRound size={16} aria-hidden="true" />Update password</button>
          </form>
        </Card>
        <Card title="Active Sessions" icon={Monitor}>
          <p className="text-[0.98rem] tracking-tight">Signed in on this device as <strong>{user.email}</strong>. Sessions refresh automatically and end when you log out. Dish-Wish can’t list your other devices, but you can sign them all out.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => run(async () => { await signOut(); navigate('/auth', { replace: true }); }, '')}><LogOut size={16} aria-hidden="true" />Log out</button>
            <button type="button" className="btn-ghost" disabled={busy}
              onClick={() => run(async () => { const { supabase } = await import('../lib/supabase'); await supabase.auth.signOut({ scope: 'others' }); }, 'Other devices were signed out.')}>
              <LogOut size={16} aria-hidden="true" />Sign out other devices</button>
          </div>
          <p className="mt-4 text-[0.84rem] text-stone-600">Two-factor authentication isn’t available in Dish-Wish yet.</p>
        </Card>
      </div>
    ),
    appearance: (
      <Card title="Appearance" icon={Palette} className="max-w-[52rem]">
        <p className="font-medium">Text size</p>
        <div className="mt-2 flex gap-2">
          {(['normal', 'large'] as const).map((s) => (
            <button key={s} type="button" className="pill capitalize" aria-pressed={extra.textSize === s}
              onClick={() => { changeExtra({ ...extra, textSize: s }); applyTextSize(s); }}>{s}</button>
          ))}
        </div>
      </Card>
    ),
    feedback: (
      <div className="grid gap-[1.1rem] lg:grid-cols-2">
        <Card title="Send Feedback" icon={MessageSquare}><FeedbackForm onDone={() => listMyFeedback(user.id).then(setFeedback).catch(() => {})} /></Card>
        <Card title="My Feedback" icon={MessageSquare}>
          {feedback === null ? <Spinner /> : feedback.length === 0 ? <p className="text-sm text-stone-500">You haven’t sent any feedback yet.</p> : (
            <ul className="space-y-3">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-2xl bg-white/70 p-3 text-sm">
                  <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold capitalize">{f.kind}{f.rating ? ` · ${f.rating}★` : ''}</span>
                    <span className={`badge ${STATUS_BADGE[f.status] ?? 'badge-gray'}`}>{f.status.replace('_', ' ')}</span></p>
                  {f.subject && <p className="mt-1 font-semibold">{f.subject}</p>}
                  <p className="mt-1 text-stone-700">{f.message}</p>
                  {f.admin_note && <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-green-900"><strong>Reply:</strong> {f.admin_note}</p>}
                  <p className="mt-1 text-xs text-stone-500">{formatDate(f.created_at, true)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    ),
    data: (
      <div className="grid gap-[1.1rem] lg:grid-cols-2">
        <Card title="Export My Data" icon={Download}>
          <p className="text-[0.98rem] tracking-tight">Download everything Dish-Wish stores for your account as a JSON file: profile, preferences, pantry, saved recipes, history and feedback.</p>
          <button type="button" className="btn-primary mt-4" disabled={busy} onClick={exportData}><Download size={16} aria-hidden="true" />Export my data</button>
        </Card>
        <Card title="Delete Account" icon={Trash2}>
          <p className="text-[0.98rem] tracking-tight">Permanently deletes your account, pantry, saved recipes and history. Feedback you sent stays, without your name. This can’t be undone.</p>
          <button type="button" className="btn-sm btn-danger mt-4" onClick={() => { setError(''); setDeleteOpen(true); }}><Trash2 size={14} aria-hidden="true" />Delete my account</button>
        </Card>
      </div>
    ),
  };

  return (
    <div className="tight-page settings-page">
      <PageHeader title="Set" accent="tings" oneWord icon={SettingsIcon} subtitle="Manage your profile, preferences, diet, allergies, notifications and account security." />
      <div role="tablist" aria-label="Settings sections" className="mb-[1.9rem] grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-[1.3fr_1fr_1fr_1.08fr_1.365fr] xl:gap-[1.15rem]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams(key === 'profile' ? {} : { tab: key })}
            className={`flex h-[3.3rem] min-w-0 items-center justify-center gap-2 rounded-full text-[0.92rem] font-medium tracking-tight shadow-[0_6px_14px_-10px_rgb(159_18_57/0.5)] sm:gap-[1.35rem] sm:text-[1.15rem] ${tab === key ? 'bg-gradient-to-r from-[#dc1029] via-[#ea2526] to-ember text-white' : 'bg-white/65 hover:bg-white'}`}>
            <Icon strokeWidth={1.8} className={`h-6 w-6 shrink-0 sm:h-[2.1rem] sm:w-[2.1rem] ${tab === key ? '' : 'text-crimson'}`} aria-hidden="true" /><span className="min-w-0 truncate">{label}</span></button>
        ))}
      </div>
      {SECONDARY.includes(tab) && <button type="button" className="mb-3 inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-crimson-deep hover:underline" onClick={() => setParams({})}><ArrowLeft size={17} aria-hidden="true" />Back to Settings</button>}
      {error && !deleteOpen && !resetOpen && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
      <div role="tabpanel">{content[tab]}</div>
      <p role="status" className={`pointer-events-none fixed bottom-5 right-5 z-40 rounded-full bg-green-700 px-4 py-1.5 text-sm font-semibold text-white shadow-lg transition-opacity ${note ? 'opacity-100' : 'opacity-0'}`}>{note}</p>

      <EditProfileModal open={editing} userId={user.id} name={name} details={details} onClose={() => setEditing(false)} onSaved={(n, d) => { setName(n); setDetails(d); setNote('Saved'); }} />
      <Modal open={intensity} title="Taste intensity" onClose={() => setIntensity(false)}>
        <p className="mb-2 text-sm text-stone-600">Choose how strong each taste should be. Any means no preference.</p>
        <ul className="divide-y divide-stone-100 text-sm">
          {TASTES.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-semibold">{t.label}</span>
              <span className="flex flex-wrap gap-1">{[null, ...LEVELS].map((lv) => (
                <button key={lv ?? 'any'} type="button" className="pill !px-2.5 !py-0.5 !text-[0.84rem] capitalize" aria-pressed={prefs.tastes[t.key] === lv} aria-label={`${t.label}: ${lv ?? 'any'}`}
                  onClick={() => changePrefs({ ...prefs, tastes: { ...prefs.tastes, [t.key]: lv } })}>{lv ?? 'Any'}</button>
              ))}</span></li>
          ))}
        </ul>
      </Modal>
      <Modal open={resetOpen} title="Reset all preferences?" onClose={() => setResetOpen(false)}>
        <div className="space-y-3 text-sm">
          <p>This clears your tastes, diets, <strong>allergies</strong>, calorie goal, cuisines, cooking time and notification choices.</p>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Recipes will no longer be filtered for your allergies until you add them again.</p>
          <p className="text-stone-600">Your account, name, photo, pantry, saved recipes and history stay as they are.</p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <button type="button" className="btn-sm btn-danger" disabled={busy} onClick={resetAll}><RotateCcw size={14} aria-hidden="true" />Reset preferences</button>
            <button type="button" className="btn-sm btn-outline" onClick={() => setResetOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
      <Modal open={deleteOpen} title="Delete your account?" onClose={() => setDeleteOpen(false)}>
        <form onSubmit={removeAccount} className="space-y-3" noValidate>
          <p className="text-sm text-stone-600">This permanently deletes your account and can’t be undone. Enter your password and type <strong>DELETE</strong> to confirm.</p>
          <Field label="Password"><input className="field" type="password" autoComplete="current-password" value={deleteForm.password} onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })} /></Field>
          <Field label="Type DELETE"><input className="field" value={deleteForm.confirm} onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" className="btn-sm btn-danger" disabled={busy}><Trash2 size={14} aria-hidden="true" />Permanently delete</button>
        </form>
      </Modal>
    </div>
  );
}
