import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Bookmark, CheckCircle2, ChefHat, Clock, Crown, Eye, KeyRound, MessageSquare, ShieldCheck, UserCheck, UserRound, Users, Zap } from 'lucide-react';
import { AreaTrend, Legend } from '../../components/charts';
import { ActionRow, Avatar, Card, Donut, EmptyState, ErrorNote, Modal, Notice, PageHeader, Pagination, SearchBox, Spinner, StatCard, STATUS_BADGE, formatDate } from '../../components/ui';
import { allFeedbackForStats, listUsers, overview, pctShort, setUserStatus, timeseries, type AdminUser, type DayPoint, type Overview } from '../../lib/adminApi';
import { sendPasswordReset } from '../../lib/authEmail';
import { useAuth } from '../../auth/AuthProvider';

const PAGE_SIZE = 8;
type Sort = 'newest' | 'oldest' | 'name';

export function AdminUsersPage() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; rows: AdminUser[] } | null>(null);
  const [stats, setStats] = useState<{ o: Overview; series: DayPoint[]; admins: number; feedback: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    listUsers(search, status, page, PAGE_SIZE).then((r) => { setResult(r); setError(''); }).catch((e: Error) => setError(e.message));
  }, [search, status, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);
  useEffect(() => {
    Promise.all([overview(30), timeseries(30), listUsers('', 'admin', 1, 1), allFeedbackForStats()])
      .then(([o, series, admins, feedback]) => setStats({ o, series, admins: admins.total, feedback: feedback.length })).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const list = [...(result?.rows ?? [])];
    if (sort === 'name') return list.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email));
    if (sort === 'oldest') return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [result, sort]);
  const selected = rows.find((u) => u.user_id === selectedId) ?? rows[0] ?? null;

  const toggleStatus = async (u: AdminUser) => {
    const next = u.status === 'active' ? 'deactivated' : 'active';
    try {
      await setUserStatus(u.user_id, next);
      setNotice(`${u.display_name || u.email} is now ${next}.`);
      setConfirm(null);
      load();
    } catch (e) { setError((e as Error).message); setConfirm(null); }
  };
  const sendReset = async (u: AdminUser) => {
    try { await sendPasswordReset(u.email); setNotice(`Password reset email sent to ${u.email}.`); } catch (e) { setError((e as Error).message); }
  };
  const isProtected = (u: AdminUser) => u.is_admin || u.user_id === session?.user.id;

  const o = stats?.o;
  const regular = o && stats ? Math.max(0, o.total_users - stats.admins - o.deactivated_users) : 0;
  const roles = [
    { label: 'Users', value: regular, color: '#e11d48' },
    { label: 'Deactivated', value: o?.deactivated_users ?? 0, color: '#f59e0b' },
    { label: 'Super Admin', value: stats?.admins ?? 0, color: '#c084fc' },
  ];
  const activity = [
    { label: 'Cooked Recipes', value: o?.cooked ?? 0, icon: ChefHat, color: '#fb7185' },
    { label: 'Saved Recipes', value: o?.saves ?? 0, icon: Bookmark, color: '#fb923c' },
    { label: 'Generated Recipes', value: o?.generations ?? 0, icon: Zap, color: '#a3e635' },
    { label: 'Gave Feedback', value: stats?.feedback ?? 0, icon: MessageSquare, color: '#c084fc' },
  ];
  const activityMax = Math.max(1, ...activity.map((a) => a.value));
  const pct = (n: number) => (o?.total_users ? `${Math.round((n / o.total_users) * 100)}% (${n})` : `${n}`);

  return (
    <>
      <PageHeader title="Users" accent="Management" icon={Users} subtitle="Manage all registered users, their activity, recipes, and account status." />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={UserRound} value={o?.total_users.toLocaleString() ?? '–'} label="Total Users" trend={o && pctShort(o.new_users, o.new_users_prev)} />
            <StatCard icon={CheckCircle2} value={o?.active_users.toLocaleString() ?? '–'} label="Active Users" tone="green" />
            <StatCard icon={Clock} value={o ? Math.max(0, o.total_users - o.active_users - o.deactivated_users).toLocaleString() : '–'} label="Inactive (30+ days)" tone="amber" />
            <StatCard icon={Ban} value={o?.deactivated_users.toLocaleString() ?? '–'} label="Deactivated" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Users by Role">
              <div className="flex flex-wrap items-center gap-4">
                <Donut size={130} label="Users by role" parts={roles}
                  center={<span><span className="block text-xl font-bold">{o?.total_users.toLocaleString() ?? '–'}</span><span className="text-sm">Users</span></span>} />
                <div className="min-w-36 flex-1"><Legend items={roles.map((r) => ({ label: r.label, value: pct(r.value), color: r.color }))} /></div>
              </div>
            </Card>
            <Card title="Users by Activity">
              <ul className="grid grid-cols-4 gap-2 text-center">
                {activity.map(({ label, value, icon: Icon, color }) => (
                  <li key={label} className="flex min-w-0 flex-col items-center">
                    <span className="flex h-14 w-full items-end"><span className="block w-full rounded-t-lg" style={{ height: `${Math.max(8, (value / activityMax) * 56)}px`, background: `linear-gradient(${color}, ${color}66)` }} /></span>
                    <Icon size={24} className="-mt-2 text-crimson" aria-hidden="true" />
                    <strong className="text-[1.05rem] leading-tight">{value.toLocaleString()}</strong>
                    <span className="text-[0.8rem] leading-tight">{label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
        <Card title={<>User Registrations <span className="font-sans text-base font-normal">(Last 30 Days)</span></>}>
          {stats ? <AreaTrend data={stats.series} x="day" y="new_users" label="New users per day" height={214} callout={pctShort(stats.o.new_users, stats.o.new_users_prev) ?? undefined} /> : <Spinner />}
        </Card>
      </div>

      {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} label="Search users" placeholder="Search users by name or email..." />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All Status</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="admin">Super Admins</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="name">Sort: Name</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <Card className="min-w-0">
          {!result ? <Spinner /> : rows.length === 0 ? <EmptyState icon={Users} title="No users match" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead><tr><th>User</th><th>Email</th><th>Joined</th><th>Recipes</th><th>Last Active</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.user_id} className={selected?.user_id === u.user_id ? 'bg-rose-50/60' : ''}>
                      <td><span className="flex items-center gap-2"><Avatar name={u.display_name || u.email} size={24} /><strong className="max-w-28 truncate">{u.display_name || u.email.split('@')[0]}</strong></span></td>
                      <td className="max-w-44 truncate">{u.email}</td><td className="whitespace-nowrap">{formatDate(u.created_at)}</td><td>{u.generated}</td>
                      <td className="whitespace-nowrap">{formatDate(u.last_active, true)}</td>
                      <td><span className={`badge capitalize ${STATUS_BADGE[u.status]}`}>{u.status}</span></td>
                      <td>{u.is_admin ? <span className="badge badge-amber whitespace-nowrap"><Crown size={12} />Super Admin</span> : <span className="badge badge-gray">User</span>}</td>
                      <td className="whitespace-nowrap">
                        <button type="button" className="icon-btn" onClick={() => setSelectedId(u.user_id)} aria-label={`View ${u.email}`}><Eye size={16} /></button>
                        <button type="button" className="icon-btn" onClick={() => setConfirm(u)} disabled={isProtected(u)}
                          aria-label={`${u.status === 'active' ? 'Deactivate' : 'Activate'} ${u.email}`} title={u.is_admin ? 'Super Admin accounts are protected' : undefined}>
                          {u.status === 'active' ? <Ban size={16} /> : <UserCheck size={16} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPage={setPage} noun="users" />}
        </Card>

        <Card title="User Details" icon={UserRound}>
          {!selected ? <p className="text-sm text-stone-500">Select a user to see details.</p> : (
            <div>
              <div className="flex items-center gap-3">
                <Avatar name={selected.display_name || selected.email} size={72} src={null} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2"><span className="truncate font-display text-lg font-bold">{selected.display_name || selected.email.split('@')[0]}</span>
                    <span className={`badge capitalize ${STATUS_BADGE[selected.status]}`}>{selected.status}</span></p>
                  {selected.is_admin ? <p className="flex items-center gap-1 text-sm font-semibold text-amber-600"><Crown size={15} />Super Admin</p> : <p className="text-sm font-semibold text-stone-600">Registered User</p>}
                  <p className="text-[0.86rem]">Joined: {formatDate(selected.created_at)}</p>
                  <p className="text-[0.86rem]">Last Active: {formatDate(selected.last_active, true)}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <span className="action-tile !min-h-0 !flex-row"><Bookmark size={22} className="text-crimson" aria-hidden="true" /><span><strong className="block text-lg leading-none">{selected.saved}</strong>Saved</span></span>
                <span className="action-tile !min-h-0 !flex-row"><Zap size={22} className="text-amber-500" aria-hidden="true" /><span><strong className="block text-lg leading-none">{selected.generated}</strong>Generated</span></span>
              </div>
              <div className="mt-3">
                <ActionRow icon={KeyRound} label="Reset Password" onClick={() => sendReset(selected)} />
                <ActionRow icon={Ban} danger label={selected.status === 'active' ? 'Deactivate User' : 'Reactivate User'} onClick={() => setConfirm(selected)} disabled={isProtected(selected)} />
              </div>
              {selected.is_admin && <p className="mt-2 flex items-center gap-1 text-xs text-stone-500"><ShieldCheck size={14} />Super Admin accounts are protected.</p>}
            </div>
          )}
        </Card>
      </div>

      <Modal open={confirm !== null} title={confirm?.status === 'active' ? 'Deactivate this user?' : 'Reactivate this user?'} onClose={() => setConfirm(null)}>
        {confirm && (
          <div className="space-y-4 text-sm">
            <p>{confirm.status === 'active'
              ? <>“{confirm.display_name || confirm.email}” will lose access to their kitchen data until reactivated. Their data is kept.</>
              : <>“{confirm.display_name || confirm.email}” will regain access to their account.</>}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-sm btn-danger" onClick={() => toggleStatus(confirm)}>{confirm.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>
              <button type="button" className="btn-sm btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
