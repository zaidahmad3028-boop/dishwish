import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bug, CheckCircle2, Download, Eye, Lightbulb, Loader2, Megaphone, MessageSquare, RotateCcw, Save, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { AreaTrend, Legend, PALETTE } from '../../components/charts';
import { Avatar, Card, Donut, EmptyState, ErrorNote, Notice, PageHeader, Pagination, SearchBox, Spinner, StatCard, STATUS_BADGE, downloadFile, formatDate, toCsv } from '../../components/ui';
import { allFeedbackForStats, listFeedback, updateFeedback, type AdminFeedback } from '../../lib/adminApi';

const PAGE_SIZE = 8;
const KIND_LABEL: Record<string, string> = { rating: 'Review', suggestion: 'Suggestion', complaint: 'Complaint', bug: 'Bug Report' };
const KIND_BADGE: Record<string, string> = { rating: 'badge-amber', suggestion: 'badge-purple', complaint: 'badge-red', bug: 'badge-red' };

export function AdminFeedbackPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; counts: { open: number; in_progress: number; resolved: number }; rows: AdminFeedback[] } | null>(null);
  const [all, setAll] = useState<{ kind: string; rating: number | null; status: string; created_at: string }[]>([]);
  const [selected, setSelected] = useState<AdminFeedback | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    listFeedback(search, status, kind, page, PAGE_SIZE).then((r) => { setResult(r); setError(''); }).catch((e: Error) => setError(e.message));
    allFeedbackForStats().then(setAll).catch(() => {});
  }, [search, status, kind, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [search, status, kind]);
  useEffect(() => { setNote(selected?.admin_note ?? ''); }, [selected]);

  const ratings = all.filter((f) => f.rating !== null).map((f) => f.rating as number);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const positive = ratings.filter((r) => r >= 4).length, negative = ratings.filter((r) => r <= 2).length;
  const byKind = Object.keys(KIND_LABEL).map((k, i) => ({ label: KIND_LABEL[k], value: all.filter((f) => f.kind === k).length, color: PALETTE[i] }));
  const trend = useMemo(() => {
    const days = [...Array(30)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().slice(0, 10); });
    return days.map((day) => ({ day, count: all.filter((f) => f.created_at.slice(0, 10) === day).length }));
  }, [all]);

  const update = async (f: AdminFeedback, patch: { status?: string; admin_note?: string }, done: string) => {
    try {
      await updateFeedback(f.id, patch);
      setNotice(done);
      setSelected({ ...f, ...patch });
      load();
    } catch (e) { setError((e as Error).message); }
  };
  const exportCsv = async () => {
    try {
      const rows = await listFeedback('', status, kind, 1, 50);
      downloadFile('dishwish-feedback.csv', toCsv(rows.rows.map((f) => ({ id: f.id, date: f.created_at, author: f.author, type: f.kind, rating: f.rating,
        subject: f.subject, message: f.message, status: f.status, admin_note: f.admin_note }))), 'text/csv');
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Feedback &" accent="Reviews" icon={MessageSquare} subtitle="Monitor user feedback, reviews, complaints and suggestions."
        actions={<button type="button" className="btn-primary" onClick={exportCsv}><Download size={16} />Export (latest 50)</button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={MessageSquare} value={all.length} label="Total Feedback" />
        <StatCard icon={Star} value={avg !== null ? `${avg.toFixed(1)} / 5` : '—'} label="Overall Rating" tone="amber" />
        <StatCard icon={ThumbsUp} value={positive} label="Positive (4–5★)" tone="green" />
        <StatCard icon={ThumbsDown} value={negative} label="Negative (1–2★)" />
        <StatCard icon={Megaphone} value={all.filter((f) => f.kind === 'complaint').length} label="Complaints" />
        <StatCard icon={Lightbulb} value={all.filter((f) => f.kind === 'suggestion').length} label="Suggestions" tone="amber" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Feedback Trend (30 days)" icon={MessageSquare}><AreaTrend data={trend} x="day" y="count" label="Feedback per day" height={180} /></Card>
        <Card title="Rating Distribution" icon={Star}>
          <ul className="space-y-1.5 text-sm">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = ratings.filter((r) => r === n).length;
              return <li key={n} className="grid grid-cols-[4rem_1fr_3rem] items-center gap-2"><span className="text-amber-500">{'★'.repeat(n)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-stone-100"><span className="block h-full bg-amber-400" style={{ width: `${ratings.length ? (c / ratings.length) * 100 : 0}%` }} /></span>
                <span className="text-right">{c}</span></li>;
            })}
          </ul>
        </Card>
        <Card title="Feedback by Type" icon={Bug}>
          <div className="flex flex-wrap items-center gap-4">
            <Donut size={110} label="Feedback by type" parts={byKind} center={<span className="font-display text-xl font-extrabold">{all.length}</span>} />
            <div className="min-w-36 flex-1"><Legend items={byKind.map((k) => ({ ...k, value: k.value }))} /></div>
          </div>
        </Card>
      </div>
      {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchBox value={search} onChange={setSearch} label="Search feedback" placeholder="Search feedback text..." />
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type filter">
              <option value="">All Types</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
              <option value="">All Status ({result ? result.counts.open + result.counts.in_progress + result.counts.resolved : 0})</option>
              <option value="open">Open ({result?.counts.open ?? 0})</option><option value="in_progress">In progress ({result?.counts.in_progress ?? 0})</option>
              <option value="resolved">Resolved ({result?.counts.resolved ?? 0})</option>
            </select>
          </div>
          {!result ? <Spinner /> : result.rows.length === 0 ? <EmptyState icon={MessageSquare} title="No feedback matches" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead><tr><th>User</th><th>Feedback</th><th>Type</th><th>Rating</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {result.rows.map((f) => (
                    <tr key={f.id} className={selected?.id === f.id ? 'bg-rose-50/60' : ''}>
                      <td><span className="flex items-center gap-2"><Avatar name={f.author} size={26} />{f.author}</span></td>
                      <td className="max-w-72"><span className="line-clamp-2">{f.subject && <strong>{f.subject}: </strong>}“{f.message}”</span></td>
                      <td><span className={`badge ${KIND_BADGE[f.kind]}`}>{KIND_LABEL[f.kind]}</span></td>
                      <td>{f.rating ? <span className="text-amber-500">{'★'.repeat(f.rating)}</span> : '—'}</td>
                      <td className="whitespace-nowrap">{formatDate(f.created_at, true)}</td>
                      <td><span className={`badge ${STATUS_BADGE[f.status]}`}>{f.status.replace('_', ' ')}</span></td>
                      <td><button type="button" className="icon-btn" aria-label={`Open feedback ${f.id}`} onClick={() => setSelected(f)}><Eye size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPage={setPage} noun="feedback" />}
        </Card>

        <Card title="Feedback Details" icon={MessageSquare}>
          {!selected ? <p className="text-sm text-stone-500">Open a feedback row to review it.</p> : (
            <div className="space-y-3 text-sm">
              <p className="flex items-center justify-between"><strong>{selected.author}</strong>{selected.rating && <span className="text-amber-500">{'★'.repeat(selected.rating)}</span>}</p>
              <p><span className="text-stone-500">Type:</span> {KIND_LABEL[selected.kind]} · <span className="text-stone-500">Date:</span> {formatDate(selected.created_at, true)}</p>
              {selected.recipe_slug && <p><span className="text-stone-500">Recipe:</span> <a className="text-crimson underline" href={`/recipe/${selected.recipe_slug}`} target="_blank" rel="noreferrer">{selected.recipe_slug}</a></p>}
              <p className="rounded-xl bg-rose-50 p-3">“{selected.message}”</p>
              <p><span className="text-stone-500">Status:</span> <span className={`badge ${STATUS_BADGE[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
                {selected.resolved_at && <span className="ml-1 text-xs text-stone-500">resolved {formatDate(selected.resolved_at)}</span>}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-sm btn-outline" disabled={selected.status === 'resolved'} onClick={() => update(selected, { status: 'resolved' }, 'Marked as resolved.')}><CheckCircle2 size={14} />Resolve</button>
                <button type="button" className="btn-sm btn-outline" disabled={selected.status === 'in_progress'} onClick={() => update(selected, { status: 'in_progress' }, 'Marked in progress.')}><Loader2 size={14} />In progress</button>
                <button type="button" className="btn-sm btn-outline" disabled={selected.status === 'open'} onClick={() => update(selected, { status: 'open' }, 'Reopened.')}><RotateCcw size={14} />Reopen</button>
              </div>
              <label className="block font-semibold">Admin note (the user sees this as a reply)
                <textarea className="field mt-1 min-h-24 font-normal" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <button type="button" className="btn-sm btn-red" onClick={() => update(selected, { admin_note: note.trim() }, 'Note saved.')}><Save size={14} />Save note</button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
