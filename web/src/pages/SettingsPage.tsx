import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarDays, Check, ChefHat, Download, Flame, KeyRound, Leaf, LogOut, Mail, MessageSquare, Palette, Pencil, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, Trash2, UserRound, Zap } from 'lucide-react';
import { signOut, useAuth } from '../auth/AuthProvider';
import { avatarUrl, displayName } from '../components/AppShell';
import { FeedbackForm } from '../components/FeedbackForm';
import { ActionRow, Avatar, Card, ErrorNote, Modal, PageHeader, Spinner, Toggle, downloadFile, formatDate, STATUS_BADGE } from '../components/ui';
import {
  applyTextSize, changePassword, defaultExtraPrefs, deleteMyAccount, exportMyData, listMyFeedback, loadExtraPrefs, saveDisplayName,
  saveExtraPrefs, type ExtraPrefs, type FeedbackRow,
} from '../lib/accountApi';
import { ALL_DIETS } from '../lib/curatedApi';
import { imageUrl, IMAGES } from '../lib/images';
import { ALLERGEN_CHIPS, CALORIE_TIERS, LEVELS, TASTES, parseCustomAllergens, type Level, type Preferences } from '../lib/preferences';
import { loadPreferences, savePreferences } from '../lib/preferencesApi';

type Tab = 'profile' | 'diet' | 'notifications' | 'security' | 'appearance' | 'feedback' | 'data';
const TABS: { key: Tab; label: string; icon: typeof UserRound }[] = [
  { key: 'profile', label: 'Profile & Preferences', icon: UserRound }, { key: 'diet', label: 'Diet & Allergies', icon: Leaf },
  { key: 'notifications', label: 'Notifications', icon: Bell }, { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'appearance', label: 'Appearance', icon: Palette }, { key: 'feedback', label: 'Feedback', icon: MessageSquare },
  { key: 'data', label: 'Your Data', icon: Download },
];
const CUISINES = ['Pakistani', 'Pakistani-Chinese', 'Continental', 'Middle Eastern'];
// Tapping a taste tile steps through Any → low → medium → high → Any.
const nextLevel = (level: Level | null): Level | null => (level === null ? LEVELS[0] : LEVELS[LEVELS.indexOf(level) + 1] ?? null);

function SaveBar({ saving, onSave, note }: { saving: boolean; onSave: () => void; note: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" className="btn-primary" onClick={onSave} disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save changes'}</button>
      {note && <span role="status" className="text-sm font-semibold text-green-700">{note}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<span className="mt-1 block font-normal">{children}</span></label>;
}

export function SettingsPage() {
  const { session } = useAuth();
  const user = session?.user;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'profile') as Tab;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [extra, setExtra] = useState<ExtraPrefs>(defaultExtraPrefs());
  const [name, setName] = useState(displayName(user));
  const [customText, setCustomText] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: '', confirm: '' });

  useEffect(() => {
    if (!user) return;
    loadPreferences(user.id).then((p) => { setPrefs(p); setCustomText(p.customAllergens.join(', ')); }).catch((e: Error) => setError(e.message));
    loadExtraPrefs(user.id).then(setExtra).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  useEffect(() => {
    if (tab === 'feedback' && user) listMyFeedback(user.id).then(setFeedback).catch(() => setFeedback([]));
  }, [tab, user]);
  useEffect(() => { setNote(''); setError(''); }, [tab]);

  if (!user || !prefs) return <Spinner label="Loading settings" />;

  const run = async (fn: () => Promise<void>, success: string) => {
    setSaving(true); setError(''); setNote('');
    try { await fn(); setNote(success); } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const saveAll = () => run(async () => {
    const next = { ...prefs, customAllergens: parseCustomAllergens(customText), onboarded: true };
    await savePreferences(user.id, next);
    await saveExtraPrefs(user.id, extra);
    setPrefs(next);
  }, 'Saved. Recommendations now use these settings.');

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

  const content: Record<Tab, ReactNode> = {
    profile: (
      <div className="grid gap-3 xl:grid-cols-[1fr_1.1fr_0.75fr]">
        <div className="min-w-0 space-y-3">
          <Card title="Profile Information" icon={UserRound} action={<button type="button" className="pill !px-3 !py-1 !text-[0.86rem] !text-crimson" onClick={() => setEditingName((v) => !v)}><Pencil size={15} />Edit Profile</button>}>
            <div className="flex items-center gap-4"><Avatar name={name || '?'} size={96} src={avatarUrl(user)} />
              <div className="min-w-0"><p className="truncate font-display text-xl font-bold">{displayName(user)}</p><p className="truncate text-[0.95rem]">{user.email}</p><span className="badge badge-red mt-1 !text-[0.86rem]">Registered User</span></div></div>
            <dl className="mt-3 divide-y divide-stone-100 border-t border-stone-100 text-[0.95rem]">
              <div className="flex items-center gap-3 py-2"><dt className="flex w-32 items-center gap-2"><UserRound size={18} className="text-crimson" aria-hidden="true" />Full Name</dt><dd className="min-w-0 truncate">{displayName(user)}</dd></div>
              <div className="flex items-center gap-3 py-2"><dt className="flex w-32 items-center gap-2"><Mail size={18} className="text-crimson" aria-hidden="true" />Email</dt><dd className="min-w-0 truncate">{user.email}</dd></div>
              <div className="flex items-center gap-3 py-2"><dt className="flex w-32 items-center gap-2"><CalendarDays size={18} className="text-crimson" aria-hidden="true" />Joined</dt><dd>{formatDate(user.created_at)}</dd></div>
            </dl>
            {editingName && <div className="mt-2"><Field label="Display name"><input className="field" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></Field>
              <button type="button" className="btn-sm btn-red mt-2" disabled={saving} onClick={() => run(() => saveDisplayName(user.id, name), 'Display name updated.')}><Save size={14} />Save name</button></div>}
          </Card>
          <Card title="Taste Preferences" icon={Flame}>
            <p className="-mt-2 mb-2 text-[0.88rem]">Set your favorite taste profile for better recipe recommendations. Tap a taste to change its level.</p>
            <ul className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
              {TASTES.map((t) => {
                const level = prefs.tastes[t.key];
                return (
                  <li key={t.key}><button type="button" aria-label={`${t.label}: ${level ?? 'any'}`} onClick={() => setPrefs({ ...prefs, tastes: { ...prefs.tastes, [t.key]: nextLevel(level) } })}
                    className={`w-full rounded-2xl border p-2.5 text-left shadow-sm transition ${level ? 'border-rose-300 bg-rose-100/80' : 'border-white/90 bg-white/75 hover:bg-rose-50'}`}>
                    <span className="flex items-center justify-between"><Flame size={22} className="text-crimson" aria-hidden="true" />
                      <span className={`grid h-5 w-5 place-items-center rounded ${level ? 'bg-crimson text-white' : 'border border-stone-300 bg-white'}`}>{level && <Check size={14} strokeWidth={3} aria-hidden="true" />}</span></span>
                    <span className="mt-1 block font-semibold leading-tight">{t.label}</span><span className="text-[0.8rem] capitalize">{level ?? 'Any'}</span>
                  </button></li>
                );
              })}
            </ul>
            <SaveBar saving={saving} onSave={saveAll} note={note} />
          </Card>
        </div>
        <div className="min-w-0 space-y-3">
          <Card title="Diet & Allergies" icon={Leaf} iconClass="text-green-600">
            <p className="-mt-2 mb-2 text-[0.88rem]">Tell us about your dietary needs and any ingredients to avoid.</p>
            <p className="flex items-center gap-2 text-[0.95rem] font-semibold"><ChefHat size={18} className="text-crimson" aria-hidden="true" />Diet Type</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALL_DIETS.map((d) => (
                <label key={d.key} className="pill cursor-pointer !px-2.5 !py-1 !text-[0.86rem]"><input type="checkbox" className="accent-crimson" checked={extra.diets.includes(d.key)}
                  onChange={() => setExtra({ ...extra, diets: extra.diets.includes(d.key) ? extra.diets.filter((x) => x !== d.key) : [...extra.diets, d.key] })} />{d.label}</label>
              ))}
            </div>
            <p className="mt-2.5 flex items-center gap-2 text-[0.95rem] font-semibold"><AlertTriangle size={18} className="text-crimson" aria-hidden="true" />Allergies (if any)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALLERGEN_CHIPS.map((c) => (
                <button key={c.tag} type="button" className="pill !px-2.5 !py-1 !text-[0.86rem]" aria-pressed={prefs.allergens.includes(c.tag)} title={c.example}
                  onClick={() => setPrefs({ ...prefs, allergens: prefs.allergens.includes(c.tag) ? prefs.allergens.filter((x) => x !== c.tag) : [...prefs.allergens, c.tag] })}>{c.label}</button>
              ))}
            </div>
            <input className="field mt-2 !py-1.5" aria-label="Other ingredients to avoid" value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Add more allergies (comma separated)..." />
          </Card>
          <Card title="Notification Preferences" icon={Bell}>
            <p className="-mt-2 mb-1 text-[0.88rem]">Choose what updates you want to receive.</p>
            <ul className="divide-y divide-stone-100 text-[0.95rem]">
              <li className="flex items-center justify-between gap-3 py-1.5"><span>Replies to my feedback</span>
                <Toggle label="Replies to my feedback" checked={extra.notify.feedback_replies} onChange={(v) => setExtra({ ...extra, notify: { ...extra.notify, feedback_replies: v } })} /></li>
              <li className="flex items-center justify-between gap-3 py-1.5"><span>Cooking tips and new recipes</span>
                <Toggle label="Cooking tips and new recipes" checked={extra.notify.tips} onChange={(v) => setExtra({ ...extra, notify: { ...extra.notify, tips: v } })} /></li>
            </ul>
          </Card>
          <Card title="Security & Account" icon={ShieldCheck}>
            <ActionRow icon={KeyRound} label="Change Password" onClick={() => setParams({ tab: 'security' })} />
            <ActionRow icon={LogOut} label="Active Sessions" onClick={() => setParams({ tab: 'security' })} />
          </Card>
        </div>
        <div className="min-w-0 space-y-3">
          <section className="card overflow-hidden p-0 text-center">
            <img src={imageUrl(IMAGES.kitchenHero)} alt="" aria-hidden="true" className="h-40 w-full object-cover object-right" />
            <div className="p-4"><p className="font-display text-[1.7rem] font-extrabold leading-tight">Personalize Your <span className="text-crimson">Dish-Wish</span></p>
              <p className="mt-2 text-[0.95rem]">Set your taste, diet and preferences to get recipes made just for you.</p></div>
          </section>
          <Card title="Quick Actions" icon={Zap} iconClass="text-orange-500">
            <ActionRow icon={RotateCcw} label="Reset Preferences" onClick={() => { setPrefs({ ...prefs, tastes: { sweet: null, salty: null, sour: null, spicy: null } }); setExtra({ ...extra, diets: [], cuisines: [], maxMinutes: null }); setNote('Cleared. Choose Save changes to apply.'); }} />
            <ActionRow icon={Download} label="Export My Data" onClick={() => setParams({ tab: 'data' })} />
            <ActionRow icon={Trash2} danger label="Delete Account" onClick={() => setParams({ tab: 'data' })} />
          </Card>
        </div>
      </div>
    ),
    diet: (
      <Card title="Diet & Allergies" icon={Leaf} iconClass="text-green-600">
        <p className="-mt-2 mb-3 text-sm text-stone-600">Allergies are hard filters: a recipe containing one is never recommended, whatever its score.</p>
        <p className="text-sm font-semibold">Diet type</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_DIETS.map((d) => (
            <label key={d.key} className="pill cursor-pointer"><input type="checkbox" className="accent-crimson" checked={extra.diets.includes(d.key)}
              onChange={() => setExtra({ ...extra, diets: extra.diets.includes(d.key) ? extra.diets.filter((x) => x !== d.key) : [...extra.diets, d.key] })} />{d.label}</label>
          ))}
        </div>
        <p className="mt-5 text-sm font-semibold">Allergies</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALLERGEN_CHIPS.map((c) => (
            <button key={c.tag} type="button" className="pill" aria-pressed={prefs.allergens.includes(c.tag)} title={c.example}
              onClick={() => setPrefs({ ...prefs, allergens: prefs.allergens.includes(c.tag) ? prefs.allergens.filter((x) => x !== c.tag) : [...prefs.allergens, c.tag] })}>{c.label}</button>
          ))}
        </div>
        <div className="mt-4"><Field label="Other ingredients to avoid (comma separated)">
          <input className="field" value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="e.g. prawns, mushroom" /></Field></div>
        <p className="mt-5 text-sm font-semibold">Daily calorie goal</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="pill" aria-pressed={prefs.calorieTier === null} onClick={() => setPrefs({ ...prefs, calorieTier: null })}>No goal</button>
          {CALORIE_TIERS.map((t) => (
            <button key={t.tier} type="button" className="pill" aria-pressed={prefs.calorieTier === t.tier} onClick={() => setPrefs({ ...prefs, calorieTier: t.tier })}>{t.label} · {t.kcal.toLocaleString()} kcal</button>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Allergen data comes from our ingredient catalog and can’t rule out cross-contact or brand differences. Always check labels.</p>
        <SaveBar saving={saving} onSave={saveAll} note={note} />
      </Card>
    ),
    notifications: (
      <Card title="Notification Preferences" icon={Bell}>
        <p className="-mt-2 mb-4 text-sm text-stone-600">Your choices are saved now. Dish-Wish does not send these emails yet; only account emails (confirmation and password reset) are sent today.</p>
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-3"><span>Replies to my feedback</span>
            <Toggle label="Replies to my feedback" checked={extra.notify.feedback_replies} onChange={(v) => setExtra({ ...extra, notify: { ...extra.notify, feedback_replies: v } })} /></li>
          <li className="flex items-center justify-between gap-3"><span>Cooking tips and new recipes</span>
            <Toggle label="Cooking tips and new recipes" checked={extra.notify.tips} onChange={(v) => setExtra({ ...extra, notify: { ...extra.notify, tips: v } })} /></li>
        </ul>
        <SaveBar saving={saving} onSave={saveAll} note={note} />
      </Card>
    ),
    security: (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Change Password" icon={KeyRound}>
          <form onSubmit={changePw} className="space-y-3" noValidate>
            <Field label="Current password"><input className="field" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="New password (8+ characters)"><input className="field" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <Field label="Confirm new password"><input className="field" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            <button type="submit" className="btn-primary" disabled={saving}><KeyRound size={16} />Update password</button>
            {note && <p role="status" className="text-sm font-semibold text-green-700">{note}</p>}
          </form>
        </Card>
        <Card title="Sessions" icon={ShieldCheck}>
          <p className="text-sm text-stone-600">Signed in as <strong>{user.email}</strong>. Sessions refresh automatically and end when you log out.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => run(async () => { await signOut(); navigate('/auth', { replace: true }); }, '')}><LogOut size={16} />Log out</button>
            <button type="button" className="btn-ghost" disabled={saving}
              onClick={() => run(async () => { const { supabase } = await import('../lib/supabase'); await supabase.auth.signOut({ scope: 'others' }); }, 'Other devices were signed out.')}>
              <LogOut size={16} />Sign out other devices</button>
          </div>
          <p className="mt-4 text-xs text-stone-500">Two-factor authentication isn’t available in Dish-Wish yet.</p>
        </Card>
      </div>
    ),
    appearance: (
      <Card title="Appearance" icon={Palette}>
        <p className="text-sm font-semibold">Text size</p>
        <div className="mt-2 flex gap-2">
          {(['normal', 'large'] as const).map((s) => (
            <button key={s} type="button" className="pill capitalize" aria-pressed={extra.textSize === s}
              onClick={() => { setExtra({ ...extra, textSize: s }); applyTextSize(s); }}>{s}</button>
          ))}
        </div>
        <SaveBar saving={saving} onSave={saveAll} note={note} />
      </Card>
    ),
    feedback: (
      <div className="grid gap-6 lg:grid-cols-2">
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
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Export My Data" icon={Download}>
          <p className="text-sm text-stone-600">Download everything Dish-Wish stores for your account as a JSON file: profile, preferences, pantry, saved recipes, history and feedback.</p>
          <button type="button" className="btn-primary mt-4" disabled={saving}
            onClick={() => run(async () => downloadFile(`dishwish-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportMyData(user.id), null, 2)), 'Export downloaded.')}>
            <Download size={16} />Export my data</button>
          {note && <p role="status" className="mt-2 text-sm font-semibold text-green-700">{note}</p>}
        </Card>
        <Card title="Delete Account" icon={Trash2}>
          <p className="text-sm text-stone-600">Permanently deletes your account, pantry, saved recipes and history. Feedback you sent stays, without your name. This can’t be undone.</p>
          <button type="button" className="btn-sm btn-danger mt-4" onClick={() => setDeleteOpen(true)}><Trash2 size={14} />Delete my account</button>
        </Card>
      </div>
    ),
  };

  return (
    <div className="tight-page">
      <PageHeader title="Set" accent="tings" oneWord icon={SettingsIcon} subtitle="Manage your profile, preferences, diet, allergies, notifications and account security." />
      <div role="tablist" aria-label="Settings sections" className="mb-3 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="pill !px-4 !py-2 text-[0.98rem]" onClick={() => setParams(key === 'profile' ? {} : { tab: key })}>
            <Icon size={20} />{label}</button>
        ))}
      </div>
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      <div role="tabpanel">{content[tab]}</div>
      <Modal open={deleteOpen} title="Delete your account?" onClose={() => setDeleteOpen(false)}>
        <form onSubmit={removeAccount} className="space-y-3" noValidate>
          <p className="text-sm text-stone-600">Enter your password and type <strong>DELETE</strong> to confirm.</p>
          <Field label="Password"><input className="field" type="password" autoComplete="current-password" value={deleteForm.password} onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })} /></Field>
          <Field label="Type DELETE"><input className="field" value={deleteForm.confirm} onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" className="btn-sm btn-danger" disabled={saving}><Trash2 size={14} />Permanently delete</button>
        </form>
      </Modal>
    </div>
  );
}
