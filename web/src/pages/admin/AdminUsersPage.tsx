import { useCallback, useEffect, useState } from 'react';
import { Ban, Bookmark, CheckCircle2, Crown, Eye, KeyRound, ShieldCheck, UserCheck, Users, Zap } from 'lucide-react';
import { AreaTrend } from '../../components/charts';
import { Avatar, Card, EmptyState, ErrorNote, Modal, Notice, PageHeader, Pagination, SearchBox, Spinner, StatCard, STATUS_BADGE, formatDate } from '../../components/ui';
import { listUsers, overview, setUserStatus, timeseries, type AdminUser, type DayPoint, type Overview } from '../../lib/adminApi';
import { sendPasswordReset } from '../../lib/authEmail';
import { useAuth } from '../../auth/AuthProvider';

const PAGE_SIZE = 10;

export function AdminUsersPage() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; rows: AdminUser[] } | null>(null);
  const [stats, setStats] = useState<{ o: Overview; series: DayPoint[] } | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    listUsers(search, status, page, PAGE_SIZE).then((r) => { setResult(r); setError(''); }).catch((e: Error) => setError(e.message));
  }, [search, status, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);
  useEffect(() => { Promise.all([overview(30), timeseries(30)]).then(([o, series]) => setStats({ o, series })).catch(() => {}); }, []);

  const toggleStatus = async (u: AdminUser) => {
    const next = u.status === 'active' ? 'deactivated' : 'active';
    try {
      await setUserStatus(u.user_id, next);
      setNotice(`${u.display_name || u.email} is now ${next}.`);
      setConfirm(null);
      setSelected((s) => (s?.user_id === u.user_id ? { ...s, status: next } : s));
      load();
    } catch (e) { setError((e as Error).message); setConfirm(null); }
  };
  const sendReset = async (u: AdminUser) => {
    try { await sendPasswordReset(u.email); setNotice(`Password reset email sent to ${u.email}.`); } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Users" accent="Management" icon={Users} subtitle="Manage registered users, their activity and account status." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} value={stats?.o.total_users ?? '–'} label="Total Users" note={stats && `${stats.o.new_users} joined in 30 days`} />
        <StatCard icon={CheckCircle2} value={stats?.o.active_users ?? '–'} label="Active (30 days)" tone="green" note="Used the recipe features" />
        <StatCard icon={Ban} value={stats?.o.deactivated_users ?? '–'} label="Deactivated" />
        <StatCard icon={Zap} value={stats?.o.generations ?? '–'} label="Generations (30 days)" tone="amber" />
      </div>
      <Card title="User Registrations (last 30 days)" icon={UserCheck} className="mt-6">
        {stats ? <AreaTrend data={stats.series} x="day" y="new_users" label="New users per day" height={180} /> : <Spinner />}
      </Card>

      {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            <SearchBox value={search} onChange={setSearch} label="Search users" placeholder="Search users by name or email..." />
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
              <option value="">All Status</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="admin">Super Admins</option>
            </select>
          </div>
          {!result ? <Spinner /> : result.rows.length === 0 ? <EmptyState icon={Users} title="No users match" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead><tr><th>User</th><th>Email</th><th>Joined</th><th>Saved</th><th>Generated</th><th>Last Active</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>
                  {result.rows.map((u) => (
                    <tr key={u.user_id} className={selected?.user_id === u.user_id ? 'bg-rose-50/60' : ''}>
                      <td><span className="flex items-center gap-2"><Avatar name={u.display_name || u.email} size={28} /><strong>{u.display_name || '—'}</strong></span></td>
                      <td>{u.email}</td><td>{formatDate(u.created_at)}</td><td>{u.saved}</td><td>{u.generated}</td>
                      <td>{formatDate(u.last_active, true)}</td>
                      <td><span className={`badge ${STATUS_BADGE[u.status]}`}>{u.status}</span></td>
                      <td>{u.is_admin ? <span className="badge badge-amber"><Crown size={12} />Super Admin</span> : <span className="badge badge-gray">User</span>}</td>
                      <td className="whitespace-nowrap">
                        <button type="button" className="icon-btn" onClick={() => setSelected(u)} aria-label={`View ${u.email}`}><Eye size={16} /></button>
                        <button type="button" className="icon-btn" onClick={() => setConfirm(u)} disabled={u.is_admin || u.user_id === session?.user.id}
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

        <Card title="User Details" icon={Eye}>
          {!selected ? <p className="text-sm text-stone-500">Select a user to see details.</p> : (
            <div>
              <div className="flex items-center gap-3"><Avatar name={selected.display_name || selected.email} size={56} />
                <div className="min-w-0"><p className="truncate font-display text-lg font-bold">{selected.display_name || '—'}</p><p className="truncate text-sm text-stone-600">{selected.email}</p>
                  <span className={`badge ${STATUS_BADGE[selected.status]}`}>{selected.status}</span></div></div>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt>Joined</dt><dd>{formatDate(selected.created_at)}</dd></div>
                <div className="flex justify-between"><dt>Last active</dt><dd>{formatDate(selected.last_active, true)}</dd></div>
                <div className="flex justify-between"><dt className="flex items-center gap-1"><Bookmark size={14} />Saved recipes</dt><dd>{selected.saved}</dd></div>
                <div className="flex justify-between"><dt className="flex items-center gap-1"><Zap size={14} />Generations</dt><dd>{selected.generated}</dd></div>
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className="btn-sm btn-outline" onClick={() => sendReset(selected)}><KeyRound size={14} />Send password reset email</button>
                <button type="button" className="btn-sm btn-danger" onClick={() => setConfirm(selected)} disabled={selected.is_admin || selected.user_id === session?.user.id}>
                  {selected.status === 'active' ? <><Ban size={14} />Deactivate user</> : <><UserCheck size={14} />Reactivate user</>}
                </button>
                {selected.is_admin && <p className="flex items-center gap-1 text-xs text-stone-500"><ShieldCheck size={14} />Super Admin accounts are protected.</p>}
              </div>
              <p className="mt-3 text-xs text-stone-500">Accounts are deleted by their owners (Settings → Your Data). Private data such as pantry contents is not shown here.</p>
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
