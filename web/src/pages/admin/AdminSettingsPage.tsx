import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock, Crown, Database, Download, FileText, Info, KeyRound, Leaf, Lock, Mail, Megaphone, MessageSquare, Monitor, Pencil, RefreshCw, RotateCcw, Save, Server, Settings, ShieldCheck, Sparkles, UserRound, Users, Zap } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { displayName } from '../../components/AppShell';
import { ActionTile, Avatar, Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner, downloadFile, formatDate, toCsv } from '../../components/ui';
import { changePassword, saveDisplayName } from '../../lib/accountApi';
import { getSetting, listAudit, saveSetting, systemStatus, validateRecommendationSettings, type AuditRow, type RecommendationSettings } from '../../lib/adminApi';
import { API_URL } from '../../lib/recipes';

type Tab = 'general' | 'roles' | 'engine' | 'system' | 'security' | 'audit' | 'about';
const TABS: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: 'general', label: 'General', icon: Settings }, { key: 'roles', label: 'Users & Roles', icon: Users }, { key: 'engine', label: 'Recommendation Engine', icon: Sparkles },
  { key: 'system', label: 'System & Database', icon: Database }, { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'audit', label: 'Audit Logs', icon: FileText }, { key: 'about', label: 'About', icon: Info },
];
export const DEFAULT_ENGINE: RecommendationSettings = { weights: { coverage: 0.45, compatibility: 0.3, taste: 0.2, cooking: 0.05 }, missing_penalty: 0.03, missing_tolerance: 3, min_score: 0.2 };
const WEIGHT_LABEL = { coverage: 'Ingredient coverage', compatibility: 'Graph compatibility', taste: 'Taste similarity', cooking: 'Cooking time' } as const;

function Slider({ label, value, min, max, step, onChange, format = (v: number) => v.toFixed(2) }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="grid grid-cols-[1fr_3.5rem] items-center gap-x-3 gap-y-1 text-[0.9rem] sm:grid-cols-[9.5rem_1fr_3.5rem]">
      <span className="col-span-2 font-semibold sm:col-span-1">{label}</span>
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
  const [editingName, setEditingName] = useState(false);
  const [apiStatus, setApiStatus] = useState('…');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getSetting<RecommendationSettings>('recommendation').then((s) => setEngine(s ?? DEFAULT_ENGINE)).catch((e: Error) => setError(e.message));
    getSetting<{ announcement?: string }>('general').then((g) => setAnnouncement(g?.announcement ?? '')).catch(() => {});
  }, []);
  const refreshStatus = useCallback(() => {
    systemStatus().then(setStatus).catch((e: Error) => setError(e.message));
    fetch(`${API_URL}/api/health`).then((r) => setApiStatus(r.ok ? 'Online' : `HTTP ${r.status}`)).catch(() => setApiStatus('Offline'));
  }, []);
  useEffect(() => {
    if (tab === 'audit' || tab === 'general') listAudit(tab === 'audit' ? 100 : 25).then(setAudit).catch((e: Error) => setError(e.message));
    if (tab === 'system' || tab === 'general' || tab === 'roles') refreshStatus();
    setNotice('');
  }, [tab, refreshStatus]);

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

  const auditList = (rows: AuditRow[]) => rows.length === 0 ? <EmptyState icon={FileText} title="No admin actions recorded yet" /> : (
    <table className="data-table table-fixed text-[0.8rem]">
      <thead><tr><th className="w-[8.5rem]">Time</th><th className="w-[4.6rem]">Action</th><th>Details</th></tr></thead>
      <tbody>{rows.map((a) => (
        <tr key={a.id}><td className="whitespace-nowrap"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-500" />{formatDate(a.created_at, true)}</td>
          <td><span className={`badge ${a.action === 'delete' ? 'badge-red' : a.action === 'insert' ? 'badge-green' : 'badge-blue'}`}>{a.action}</span></td>
          <td className="truncate" title={`${a.entity} #${a.entity_id}`}>{a.entity.replace(/_/g, ' ')} #{a.entity_id}</td></tr>
      ))}</tbody>
    </table>
  );

  const content: Record<Tab, ReactNode> = {
    general: (
      <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr_1.1fr]">
        <div className="min-w-0 space-y-3">
          <Card title="Admin Profile" icon={UserRound} action={<button type="button" className="btn-sm btn-outline" onClick={() => setEditingName((v) => !v)}><Pencil size={14} />Edit Profile</button>}>
            <div className="flex items-center gap-4"><Avatar name={name || 'A'} size={96} />
              <div className="min-w-0"><p className="truncate font-display text-xl font-bold">{displayName(user)}</p><span className="badge badge-amber !text-[0.86rem]"><Crown size={14} />Super Admin</span>
                <p className="mt-1 flex items-center gap-2 truncate text-[0.9rem]"><Mail size={16} className="shrink-0 text-crimson" aria-hidden="true" /><span className="truncate">{user?.email}</span></p>
                <p className="mt-1 flex items-center gap-2 text-[0.9rem]"><CalendarDays size={16} className="shrink-0 text-crimson" aria-hidden="true" />Last Login: {formatDate(user?.last_sign_in_at, true)}</p></div></div>
            {editingName && <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (user) run(() => saveDisplayName(user.id, name), 'Name updated.'); }}>
              <label className="block text-sm font-semibold">Display name<input className="field mt-1" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
              <button type="submit" className="btn-sm btn-red mt-2"><Save size={14} />Save</button></form>}
          </Card>
          <Card title={<>Users &amp; Roles <span className="font-sans text-base font-normal">(Quick)</span></>} icon={Users} action={<Link to="/admin/users" className="flex items-center gap-1 text-sm font-semibold text-crimson">Manage<ArrowRight size={15} /></Link>}>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[{ icon: ShieldCheck, n: status?.admins, label: 'Super Admin' }, { icon: Users, n: status?.tables.profiles, label: 'Accounts' }, { icon: UserRound, n: status ? Math.max(0, (status.tables.profiles ?? 0) - status.admins) : undefined, label: 'Registered Users' }].map(({ icon: Icon, n, label }) => (
                <div key={label} className="action-tile"><Icon size={28} className="text-crimson" aria-hidden="true" /><strong className="text-xl leading-none">{n ?? '…'}</strong>{label}</div>
              ))}
            </div>
          </Card>
          <Card title="Security & Access" icon={ShieldCheck} action={<button type="button" className="flex items-center gap-1 text-sm font-semibold text-crimson" onClick={() => setParams({ tab: 'security' })}>Configure<ArrowRight size={15} /></button>}>
            <ul className="divide-y divide-stone-100 text-[0.92rem]">
              {[[Lock, 'Passwords hashed by Supabase Auth'], [KeyRound, 'Admin actions checked in the database'], [FileText, 'Admin changes written to the audit log'], [Clock, 'Short-lived sessions that refresh automatically']].map(([Icon, text]) => {
                const I = Icon as typeof Lock;
                return <li key={text as string} className="flex items-center gap-3 py-2"><I size={20} className="shrink-0 text-crimson" aria-hidden="true" /><span className="flex-1">{text as string}</span><CheckCircle2 size={18} className="shrink-0 text-green-600" aria-hidden="true" /></li>;
              })}
            </ul>
          </Card>
        </div>
        <div className="min-w-0 space-y-3">
          <Card title="User Announcement" icon={Megaphone}>
            <p className="-mt-2 mb-2 text-[0.9rem]">Shown as a banner at the top of every user page. Leave empty to hide it.</p>
            <textarea className="field min-h-20" maxLength={280} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} aria-label="Announcement text" />
            <button type="button" className="btn-sm btn-red mt-2" onClick={() => run(() => saveSetting('general', { announcement: announcement.trim() }), announcement.trim() ? 'Announcement published.' : 'Announcement removed.')}>
              <Save size={14} />Save announcement</button>
          </Card>
          <Card title="Recommendation Engine Configuration" icon={Sparkles} action={<button type="button" className="flex items-center gap-1 text-sm font-semibold text-crimson" onClick={() => setParams({ tab: 'engine' })}>Configure<ArrowRight size={15} /></button>}>
            {!engine ? <Spinner /> : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm"><span className="w-44 font-semibold">Algorithm</span><span className="field !w-auto flex-1 !py-1.5">Content-Based + Graph Similarity</span></div>
                <Slider label="Similarity Threshold" value={engine.min_score} min={0} max={1} step={0.01} onChange={(v) => setEngine({ ...engine, min_score: v })} />
                <Slider label="Ingredient Weight" value={engine.weights.coverage} min={0} max={1} step={0.01} onChange={(v) => setEngine({ ...engine, weights: { ...engine.weights, coverage: v } })} />
                <Slider label="Compatibility Weight" value={engine.weights.compatibility} min={0} max={1} step={0.01} onChange={(v) => setEngine({ ...engine, weights: { ...engine.weights, compatibility: v } })} />
                <Slider label="Taste Weight" value={engine.weights.taste} min={0} max={1} step={0.01} onChange={(v) => setEngine({ ...engine, weights: { ...engine.weights, taste: v } })} />
                <button type="button" className="btn-sm btn-red" onClick={saveEngine}><Save size={14} />Save configuration</button>
              </div>
            )}
          </Card>
          <Card title={<>Audit Logs <span className="font-sans text-base font-normal">(Recent Activity)</span></>} icon={FileText} className="min-w-0" action={<button type="button" className="flex items-center gap-1 text-sm font-semibold text-crimson" onClick={() => setParams({ tab: 'audit' })}>View All<ArrowRight size={15} /></button>}>
            {audit ? auditList(audit.slice(0, 4)) : <Spinner />}
          </Card>
        </div>
        <div className="min-w-0 space-y-3">
          <Card title="Application Status" icon={Monitor}>
            <dl className="divide-y divide-stone-100 text-[0.92rem]">
              {[[Server, 'Recipe API', apiStatus], [Database, 'Database', status ? 'Connected' : '…'], [BookOpen, 'Recipes', status?.tables.curated_recipes], [Leaf, 'Ingredients', status?.tables.ingredients], [MessageSquare, 'Feedback', status?.tables.feedback]].map(([Icon, label, value]) => {
                const I = Icon as typeof Server;
                return <div key={label as string} className="flex items-center gap-3 py-2"><dt className="flex flex-1 items-center gap-3"><I size={20} className="text-crimson" aria-hidden="true" />{label as string}</dt><dd className="font-semibold">{String(value ?? '…')}</dd></div>;
              })}
            </dl>
          </Card>
          <Card title="Database & System" icon={Database} action={<button type="button" className="flex items-center gap-1 text-sm font-semibold text-crimson" onClick={() => setParams({ tab: 'system' })}>Manage<ArrowRight size={15} /></button>}>
            <dl className="space-y-2 text-[0.92rem]">
              <div className="flex items-center justify-between"><dt>Database Status</dt><dd><span className="badge badge-green !text-[0.86rem]"><CheckCircle2 size={14} />Connected</span></dd></div>
              <div className="flex items-center justify-between"><dt>PostgreSQL</dt><dd className="font-semibold">{status?.postgres_version ?? '…'}</dd></div>
              <div className="flex items-center justify-between"><dt>Database Size</dt><dd className="font-semibold">{status ? `${(status.database_size_bytes / 1024 / 1024).toFixed(1)} MB` : '…'}</dd></div>
              <div className="flex items-center justify-between"><dt>Tables without RLS</dt><dd className={`font-semibold ${status?.rls_disabled.length ? 'text-rose-700' : 'text-green-700'}`}>{status ? status.rls_disabled.length || 'None' : '…'}</dd></div>
            </dl>
          </Card>
          <Card title="System Actions" icon={Zap}>
            <div className="grid grid-cols-2 gap-2">
              <ActionTile icon={Download} label="Export Audit Log" disabled={!audit?.length} onClick={() => downloadFile('dishwish-audit-log.csv', toCsv((audit ?? []).map((a) => ({ time: a.created_at, action: a.action, entity: a.entity, entity_id: a.entity_id, details: a.details }))), 'text/csv')} />
              <ActionTile icon={Download} label="Export Settings" disabled={!engine} onClick={() => downloadFile('dishwish-settings.json', JSON.stringify({ recommendation: engine, announcement }, null, 2))} />
              <ActionTile icon={RefreshCw} label="Refresh Status" onClick={refreshStatus} />
              <ActionTile icon={RotateCcw} label="Reset Engine" onClick={() => { setEngine(DEFAULT_ENGINE); setNotice('Defaults loaded. Choose Save configuration to apply them.'); }} />
            </div>
          </Card>
        </div>
      </div>
    ),
    roles: (
      <div className="grid gap-3 xl:grid-cols-2">
        <Card title="Users & Roles" icon={Users}>
          <p className="text-sm">Roles: <strong>Registered User</strong> and <strong>Super Admin</strong>.</p>
          <p className="mt-2 text-sm">Super Admins: <strong>{status?.admins ?? '…'}</strong> · Accounts: <strong>{status?.tables.profiles ?? '…'}</strong></p>
          <p className="mt-2 text-xs text-stone-500">Promoting an account is done server-side only (scripts/create_admin.py or the SQL function grant_super_admin), never from the browser.</p>
          <Link to="/admin/users" className="btn-sm btn-outline mt-3">Manage users<ArrowRight size={14} /></Link>
        </Card>
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
    audit: <Card title="Audit Logs (latest 100)" icon={FileText} className="min-w-0">{audit ? auditTable(audit) : <Spinner />}</Card>,
    about: (
      <Card title="About Dish-Wish" icon={Info}>
        <p className="text-sm">Dish-Wish · Dream Recipe Creation. React + Vite web app, FastAPI recommendation API (NetworkX compatibility graph) and Supabase (Postgres, Auth, row-level security).</p>
        <p className="mt-2 text-sm text-stone-600">See docs/RECOMMENDATION_ENGINE.md for the scoring formula and docs/ARCHITECTURE.md for the system design.</p>
      </Card>
    ),
  };

  return (
    <>
      <PageHeader title="System" accent="Settings" icon={Settings} subtitle="Manage your account, system configuration, AI recommendation, security and more." />
      <div role="tablist" aria-label="Settings sections" className="mb-3 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="pill !px-5 !py-2 text-[0.98rem]" onClick={() => setParams(key === 'general' ? {} : { tab: key })}><Icon size={22} />{label}</button>
        ))}
      </div>
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      <div role="tabpanel">{content[tab]}</div>
    </>
  );
}
