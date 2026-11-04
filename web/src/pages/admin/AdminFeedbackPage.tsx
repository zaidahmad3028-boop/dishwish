import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bug, CheckCircle2, Download, Eye, FileText, Lightbulb, Megaphone, MessageCircle, MessageSquare, MinusCircle, RefreshCw, Save, Settings, Star, ThumbsDown, ThumbsUp, XCircle, type LucideIcon } from 'lucide-react';
import { AreaTrend, Legend, PALETTE } from '../../components/charts';
import { Avatar, Card, Donut, EmptyState, ErrorNote, Notice, PageHeader, Pagination, SearchBox, Spinner, StatCard, Stars, STATUS_BADGE, downloadFile, formatDate, toCsv } from '../../components/ui';
import { allFeedbackForStats, listFeedback, updateFeedback, type AdminFeedback } from '../../lib/adminApi';

const PAGE_SIZE = 8;
const KIND_LABEL: Record<string, string> = { rating: 'Review', suggestion: 'Suggestion', complaint: 'Complaint', bug: 'Bug Report' };
const KIND_BADGE: Record<string, string> = { rating: 'badge-amber', suggestion: 'badge-purple', complaint: 'badge-red', bug: 'badge-red' };
const KIND_ICON: Record<string, LucideIcon> = { rating: Star, suggestion: Lightbulb, complaint: Megaphone, bug: Bug };
const RATING_COLOR: Record<number, string> = { 5: '#16a34a', 4: '#facc15', 3: '#fde047', 2: '#fb923c', 1: '#fca5a5' };

export function AdminFeedbackPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; counts: { open: number; in_progress: number; resolved: number }; rows: AdminFeedback[] } | null>(null);
  const [all, setAll] = useState<{ kind: string; rating: number | null; status: string; created_at: string }[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    listFeedback(search, status, kind, page, PAGE_SIZE).then((r) => { setResult(r); setError(''); }).catch((e: Error) => setError(e.message));
    allFeedbackForStats().then(setAll).catch(() => {});
  }, [search, status, kind, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [search, status, kind]);

  const selected = result?.rows.find((f) => f.id === selectedId) ?? result?.rows[0] ?? null;
  const selectedKey = selected?.id;
  const selectedNote = selected?.admin_note ?? '';
  useEffect(() => { setNote(selectedNote); }, [selectedKey, selectedNote]);

  const ratings = all.filter((f) => f.rating !== null).map((f) => f.rating as number);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const positive = ratings.filter((r) => r >= 4).length, neutral = ratings.filter((r) => r === 3).length, negative = ratings.filter((r) => r <= 2).length;
  const share = (n: number) => (ratings.length ? ` (${((n / ratings.length) * 100).toFixed(1)}%)` : '');
  const byKind = Object.keys(KIND_LABEL).map((k, i) => ({ label: KIND_LABEL[k], value: all.filter((f) => f.kind === k).length, color: [PALETTE[3], PALETTE[1], PALETTE[4], PALETTE[0]][i] }));
  const byRating = [5, 4, 3, 2, 1].map((n) => ({ n, value: ratings.filter((r) => r === n).length }));
  const trend = useMemo(() => {
    const days = [...Array(30)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().slice(0, 10); });
    return days.map((day) => ({ day, count: all.filter((f) => f.created_at.slice(0, 10) === day).length }));
  }, [all]);

  const update = async (f: AdminFeedback, patch: { status?: string; admin_note?: string }, done: string) => {
    try {
      await updateFeedback(f.id, patch);
      setNotice(done);
      setSelectedId(f.id);
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
  const kindBadge = (k: string) => {
    const Icon = KIND_ICON[k] ?? MessageCircle;
    return <span className={`badge whitespace-nowrap ${KIND_BADGE[k] ?? 'badge-gray'}`}><Icon size={14} aria-hidden="true" />{KIND_LABEL[k] ?? k}</span>;
  };

  return (
    <>
      <PageHeader title="Feedback &" accent="Reviews" icon={MessageSquare} subtitle="Monitor user feedback, reviews, complaints and suggestions to improve Dish-Wish."
        actions={<button type="button" className="btn-primary" onClick={exportCsv}><Download size={16} />Export Report</button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <StatCard icon={MessageSquare} value={all.length} label="Total Feedback" />
        <StatCard icon={Star} value={avg !== null ? <>{avg.toFixed(1)}<span className="text-lg font-semibold"> / 5</span></> : '—'} label="Overall Rating" tone="amber" />
        <StatCard icon={ThumbsUp} value={positive} label={`Positive${share(positive)}`} tone="green" />
        <StatCard icon={MinusCircle} value={neutral} label={`Neutral${share(neutral)}`} tone="amber" />
        <StatCard icon={ThumbsDown} value={negative} label={`Negative${share(negative)}`} />
        <StatCard icon={Megaphone} value={all.filter((f) => f.kind === 'complaint').length} label="Complaints" />
        <StatCard icon={Lightbulb} value={all.filter((f) => f.kind === 'suggestion').length} label="Suggestions" tone="amber" />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1.05fr_0.85fr_0.95fr]">
        <Card title="Feedback Trend" icon={MessageCircle}><AreaTrend data={trend} x="day" y="count" label="Feedback per day" height={118} /></Card>
        <Card title="Rating Distribution" icon={Star}>
          <div className="flex flex-wrap items-center gap-4">
            <Donut size={116} label="Ratings" parts={byRating.map((r) => ({ value: r.value, color: RATING_COLOR[r.n], label: `${r.n} stars` }))}
              center={<span><span className="block text-lg font-bold">{avg !== null ? avg.toFixed(1) : '—'}<span className="text-xs"> / 5</span></span><span className="text-[0.7rem] leading-none">Overall Rating</span></span>} />
            <ul className="min-w-40 flex-1 space-y-1 text-[0.92rem]">
              {byRating.map((r) => (
                <li key={r.n} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-sm" style={{ background: RATING_COLOR[r.n] }} /><Stars value={r.n} /></span>
                  <span>{ratings.length ? `${((r.value / ratings.length) * 100).toFixed(1)}%` : '0%'}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card title="Feedback by Type" icon={Megaphone}>
          <div className="flex flex-wrap items-center gap-4">
            <Donut size={116} label="Feedback by type" parts={byKind} center={<span><span className="block text-lg font-bold">{all.length}</span><span className="text-[0.72rem]">Feedback</span></span>} />
            <div className="min-w-36 flex-1"><Legend items={byKind.map((k) => ({ label: k.label, value: all.length ? `${((k.value / all.length) * 100).toFixed(1)}%` : '0%', color: k.color }))} /></div>
          </div>
        </Card>
      </div>
      {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} label="Search feedback" placeholder="Search feedback (e.g., recipe, feature, user)..." />
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type filter">
          <option value="">All Types</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All Status ({result ? result.counts.open + result.counts.in_progress + result.counts.resolved : 0})</option>
          <option value="open">Open ({result?.counts.open ?? 0})</option><option value="in_progress">In progress ({result?.counts.in_progress ?? 0})</option>
          <option value="resolved">Resolved ({result?.counts.resolved ?? 0})</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card className="min-w-0">
          {!result ? <Spinner /> : result.rows.length === 0 ? <EmptyState icon={MessageSquare} title="No feedback matches" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead><tr><th>User</th><th>Feedback / Review</th><th>Type</th><th>Rating</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {result.rows.map((f) => (
                    <tr key={f.id} className={selected?.id === f.id ? 'bg-rose-50/60' : ''}>
                      <td><span className="flex items-center gap-2"><Avatar name={f.author} size={24} /><strong className="max-w-24 truncate">{f.author}</strong></span></td>
                      <td className="max-w-72"><span className="line-clamp-2 text-[0.82rem] leading-snug">{f.subject && <strong>{f.subject}: </strong>}“{f.message}”</span></td>
                      <td>{kindBadge(f.kind)}</td>
                      <td className="whitespace-nowrap">{f.rating ? <><Stars value={f.rating} /> {f.rating.toFixed(1)}</> : '—'}</td>
                      <td className="whitespace-nowrap">{formatDate(f.created_at, true)}</td>
                      <td><span className={`badge whitespace-nowrap capitalize ${STATUS_BADGE[f.status]}`}>{f.status.replace('_', ' ')}</span></td>
                      <td><button type="button" className="icon-btn" aria-label={`Open feedback ${f.id}`} onClick={() => setSelectedId(f.id)}><Eye size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPage={setPage} noun="feedback" />}
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          <Card title="Feedback Details" icon={MessageSquare}>
            {!selected ? <p className="text-sm text-stone-500">No feedback to review yet.</p> : (
              <div className="space-y-2 text-[0.92rem]">
                <div className="flex items-center gap-3"><Avatar name={selected.author} size={38} /><strong className="min-w-0 flex-1 truncate">{selected.author}</strong>
                  {selected.rating && <span className="flex items-center gap-1"><Stars value={selected.rating} size="1.15rem" />{selected.rating.toFixed(1)}</span>}</div>
                <dl className="grid grid-cols-[4rem_1fr] items-center gap-y-1">
                  <dt>Type:</dt><dd>{kindBadge(selected.kind)}</dd>
                  <dt>Date:</dt><dd>{formatDate(selected.created_at, true)}</dd>
                  <dt>Status:</dt><dd><span className={`badge capitalize ${STATUS_BADGE[selected.status]}`}>{selected.status.replace('_', ' ')}</span></dd>
                  {selected.recipe_slug && <><dt>Recipe:</dt><dd><a className="text-crimson underline" href={`/recipe/${selected.recipe_slug}`} target="_blank" rel="noreferrer">{selected.recipe_slug}</a></dd></>}
                </dl>
                <p className="rounded-xl bg-rose-50 p-3">“{selected.message}”</p>
              </div>
            )}
          </Card>
          <Card title="Admin Actions" icon={Settings}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="pill !text-[0.84rem]" disabled={!selected || selected.status === 'resolved'} onClick={() => selected && update(selected, { status: 'resolved' }, 'Marked as resolved.')}><CheckCircle2 size={16} className="text-green-600" />Mark as Resolved</button>
              <button type="button" className="pill !text-[0.84rem]" disabled={!selected || selected.status === 'in_progress'} onClick={() => selected && update(selected, { status: 'in_progress' }, 'Marked in progress.')}><RefreshCw size={16} className="text-amber-500" />In Progress</button>
              <button type="button" className="pill !text-[0.84rem]" disabled={!selected || selected.status === 'open'} onClick={() => selected && update(selected, { status: 'open' }, 'Reopened.')}><XCircle size={16} className="text-crimson" />Reopen</button>
            </div>
          </Card>
          <Card title="Add Admin Note" icon={FileText}>
            <textarea className="field min-h-14" maxLength={2000} placeholder="Write a note (the user sees this as a reply)..." aria-label="Admin note" disabled={!selected} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex justify-end"><button type="button" className="btn-sm btn-red" disabled={!selected} onClick={() => selected && update(selected, { admin_note: note.trim() }, 'Note saved.')}><Save size={14} />Save Note</button></div>
          </Card>
        </div>
      </div>
    </>
  );
}
