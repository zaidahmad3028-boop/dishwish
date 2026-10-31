import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Database, FileText, Info, KeyRound, Megaphone, RotateCcw, Save, Settings, ShieldCheck, Sparkles, UserRound, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { displayName } from '../../components/AppShell';
import { Avatar, Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner, formatDate } from '../../components/ui';
import { changePassword, saveDisplayName } from '../../lib/accountApi';
import { getSetting, listAudit, saveSetting, systemStatus, validateRecommendationSettings, type AuditRow, type RecommendationSettings } from '../../lib/adminApi';

type Tab = 'general' | 'engine' | 'system' | 'security' | 'audit' | 'about';
const TABS: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: 'general', label: 'General', icon: Settings }, { key: 'engine', label: 'Recommendation Engine', icon: Sparkles },
  { key: 'system', label: 'System & Database', icon: Database }, { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'audit', label: 'Audit Logs', icon: FileText }, { key: 'about', label: 'About', icon: Info },
];
export const DEFAULT_ENGINE: RecommendationSettings = { weights: { coverage: 0.45, compatibility: 0.3, taste: 0.2, cooking: 0.05 }, missing_penalty: 0.03, missing_tolerance: 3, min_score: 0.2 };
const WEIGHT_LABEL = { coverage: 'Ingredient coverage', compatibility: 'Graph compatibility', taste: 'Taste similarity', cooking: 'Cooking time' } as const;

function Slider({ label, value, min, max, step, onChange, format = (v: number) => v.toFixed(2) }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="grid grid-cols-[11rem_1fr_3.5rem] items-center gap-3 text-sm">
      <span className="font-semibold">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-crimson" />
      <span className="rounded-lg bg-white px-2 py-1 text-center font-semibold shadow-sm">{format(value)}</span>
    </label>
  );
}

export function AdminSettingsPage() {
  const { session } = useAuth();
  const user = session?.user;
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'general') as Tab;
  const [engine, setEngine] = useState<RecommendationSettings | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof systemStatus>> | null>(null);
  const [name, setName] = useState(displayName(user));
  const [pw, setPw] = useState({ current: '', next: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getSetting<RecommendationSettings>('recommendation').then((s) => setEngine(s ?? DEFAULT_ENGINE)).catch((e: Error) => setError(e.message));
    getSetting<{ announcement?: string }>('general').then((g) => setAnnouncement(g?.announcement ?? '')).catch(() => {});
  }, []);
  useEffect(() => {
    if (tab === 'audit' || tab === 'general') listAudit(tab === 'audit' ? 100 : 5).then(setAudit).catch((e: Error) => setError(e.message));
    if (tab === 'system' || tab === 'general') systemStatus().then(setStatus).catch((e: Error) => setError(e.message));
    setNotice('');
  }, [tab]);

  const run = async (fn: () => Promise<void>, done: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(done); } catch (e) { setError((e as Error).message); }
  };
  const saveEngine = () => {
    if (!engine) return;
    const problem = validateRecommendationSettings(engine);
    if (problem) { setError(problem); return; }
    run(() => saveSetting('recommendation', engine), 'Recommendation settings saved. The API picks them up within a minute.');
  };
  const weightSum = engine ? Object.values(engine.weights).reduce((a, b) => a + b, 0) : 0;

  const auditTable = (rows: AuditRow[]) => rows.length === 0 ? <EmptyState icon={FileText} title="No admin actions recorded yet" /> : (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[560px]">
        <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Details</th><th>By</th></tr></thead>
        <tbody>{rows.map((a) => (
          <tr key={a.id}><td className="whitespace-nowrap">{formatDate(a.created_at, true)}</td>
            <td><span className={`badge ${a.action === 'delete' ? 'badge-red' : a.action === 'insert' ? 'badge-green' : 'badge-blue'}`}>{a.action}</span></td>
            <td>{a.entity} <span className="text-xs text-stone-500">#{a.entity_id}</span></td>
            <td className="text-xs">{Object.entries(a.details ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</td>
            <td className="text-xs">{a.actor === user?.id ? 'You' : a.actor ? 'Another admin' : 'System'}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );

  const content: Record<Tab, ReactNode> = {
    general: (
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Admin Profile" icon={UserRound}>
          <div className="flex items-center gap-4"><Avatar name={name || 'A'} size={72} />
            <div className="min-w-0"><p className="truncate font-display text-xl font-bold">{displayName(user)}</p><span className="badge badge-amber"><Crown size={12} />Super Admin</span>
              <p className="mt-1 truncate text-sm text-stone-600">{user?.email}</p><p className="text-xs text-stone-500">Last sign-in {formatDate(user?.last_sign_in_at, true)}</p></div></div>
          <label className="mt-4 block text-sm font-semibold">Display name<input className="field mt-1" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
          <button type="button" className="btn-sm btn-red mt-3" onClick={() => user && run(() => saveDisplayName(user.id, name), 'Name updated.')}><Save size={14} />Save</button>
        </Card>
        <Card title="User Announcement" icon={Megaphone}>
          <p className="-mt-2 mb-2 text-sm text-stone-600">Shown as a banner at the top of every user page. Leave empty to hide it.</p>
          <textarea className="field min-h-24" maxLength={280} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} aria-label="Announcement text" />
          <button type="button" className="btn-sm btn-red mt-3" onClick={() => run(() => saveSetting('general', { announcement: announcement.trim() }), announcement.trim() ? 'Announcement published.' : 'Announcement removed.')}>
            <Save size={14} />Save announcement</button>
        </Card>
        <Card title="Users & Roles" icon={Users}>
          <p className="text-sm">Roles: <strong>Registered User</strong> and <strong>Super Admin</strong>.</p>
          <p className="mt-2 text-sm">Super Admins: <strong>{status?.admins ?? '…'}</strong></p>
          <p className="mt-2 text-xs text-stone-500">Promoting an account is done server-side only (scripts/create_admin.py or the SQL function grant_super_admin), never from the browser.</p>
        </Card>
        <Card title="Recent Audit Activity" icon={FileText} className="xl:col-span-3">{audit ? auditTable(audit) : <Spinner />}</Card>
      </div>
    ),
    engine: !engine ? <Spinner /> : (
      <Card title="Recommendation Engine Configuration" icon={Sparkles}>
        <p className="-mt-2 mb-4 text-sm text-stone-600">Score = Σ weight × component ÷ Σ weights of the components available, minus the missing-ingredient penalty. Weights are relative, so they don’t need to add up to 1 (now {weightSum.toFixed(2)}). These are engineering defaults, not validated values.</p>
        <div className="space-y-3">
          {(Object.keys(WEIGHT_LABEL) as (keyof typeof WEIGHT_LABEL)[]).map((k) => (
            <Slider key={k} label={WEIGHT_LABEL[k]} value={engine.weights[k]} min={0} max={1} step={0.01} onChange={(v) => setEngine({ ...engine, weights: { ...engine.weights, [k]: v } })} />
          ))}
          <Slider label="Similarity threshold (min score)" value={engine.min_score} min={0} max={1} step={0.01} onChange={(v) => setEngine({ ...engine, min_score: v })} />
          <Slider label="Penalty per extra missing" value={engine.missing_penalty} min={0} max={0.2} step={0.01} onChange={(v) => setEngine({ ...engine, missing_penalty: v })} />
          <Slider label="Missing tolerance" value={engine.missing_tolerance} min={0} max={10} step={1} format={(v) => String(v)} onChange={(v) => setEngine({ ...engine, missing_tolerance: v })} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={saveEngine}><Save size={16} />Save configuration</button>
          <button type="button" className="btn-ghost" onClick={() => setEngine(DEFAULT_ENGINE)}><RotateCcw size={16} />Reset to defaults</button>
        </div>
      </Card>
    ),
    system: !status ? <Spinner /> : (
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Database & System" icon={Database}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Database status</dt><dd><span className="badge badge-green">Connected</span></dd></div>
            <div className="flex justify-between"><dt>PostgreSQL version</dt><dd className="font-semibold">{status.postgres_version}</dd></div>
            <div className="flex justify-between"><dt>Database size</dt><dd className="font-semibold">{(status.database_size_bytes / 1024 / 1024).toFixed(1)} MB</dd></div>
            <div className="flex justify-between"><dt>Server time</dt><dd className="font-semibold">{formatDate(status.server_time, true)}</dd></div>
            <div className="flex justify-between"><dt>Tables without RLS</dt><dd className={`font-semibold ${status.rls_disabled.length ? 'text-rose-700' : 'text-green-700'}`}>{status.rls_disabled.length ? status.rls_disabled.join(', ') : 'None'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-stone-500">Backups and restarts are handled by Supabase and your hosting, not from this page, so there are no backup or restart buttons here.</p>
        </Card>
        <Card title="Table Row Counts" icon={Database}>
          <ul className="grid grid-cols-2 gap-2 text-sm">{Object.entries(status.tables).map(([t, n]) => <li key={t} className="flex justify-between rounded-lg bg-white/70 px-3 py-1.5"><span>{t}</span><strong>{n}</strong></li>)}</ul>
        </Card>
      </div>
    ),
    security: (
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Security & Access" icon={ShieldCheck}>
          <ul className="space-y-2 text-sm">
            <li>✓ Passwords are hashed by Supabase Auth (bcrypt); Dish-Wish never stores them.</li>
            <li>✓ Every admin action is checked in the database (row-level security and admin-only functions).</li>
            <li>✓ Admin changes to the catalog, settings, feedback and users are written to the audit log.</li>
            <li>✓ Sessions use short-lived JWTs that refresh automatically; sign-up requires email confirmation.</li>
            <li>• Login attempt limits and session length are configured in Supabase → Authentication.</li>
          </ul>
        </Card>
        <Card title="Change Your Password" icon={KeyRound}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await changePassword(user?.email ?? '', pw.current, pw.next); setPw({ current: '', next: '' }); }, 'Password changed; other devices signed out.'); }}>
            <label className="block text-sm font-semibold">Current password<input className="field mt-1" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
            <label className="block text-sm font-semibold">New password (8+ characters)<input className="field mt-1" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
            <button type="submit" className="btn-primary"><KeyRound size={16} />Update password</button>
          </form>
        </Card>
      </div>
    ),
    audit: <Card title="Audit Logs (latest 100)" icon={FileText}>{audit ? auditTable(audit) : <Spinner />}</Card>,
    about: (
      <Card title="About Dish-Wish" icon={Info}>
        <p className="text-sm">Dish-Wish · Dream Recipe Creation. React + Vite web app, FastAPI recommendation API (NetworkX compatibility graph) and Supabase (Postgres, Auth, row-level security).</p>
        <p className="mt-2 text-sm text-stone-600">See docs/RECOMMENDATION_ENGINE.md for the scoring formula and docs/ARCHITECTURE.md for the system design.</p>
      </Card>
    ),
  };

  return (
    <>
      <PageHeader title="System" accent="Settings" icon={Settings} subtitle="Manage your admin account, recommendation engine, security and audit logs." />
      <div role="tablist" aria-label="Settings sections" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="pill" onClick={() => setParams(key === 'general' ? {} : { tab: key })}><Icon size={16} />{label}</button>
        ))}
      </div>
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      <div role="tabpanel">{content[tab]}</div>
    </>
  );
}
