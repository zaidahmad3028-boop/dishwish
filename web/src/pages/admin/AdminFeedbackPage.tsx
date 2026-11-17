import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bug, CheckCircle2, Download, Eye, FileText, Lightbulb, Megaphone, MessageCircle, MessageSquare, MinusCircle, Pencil, Plus, RefreshCw, Save, Settings, Star, ThumbsDown, ThumbsUp, XCircle, type LucideIcon } from 'lucide-react';
import { AreaTrend, Legend, PALETTE } from '../../components/charts';
import { Avatar, Card, Donut, EmptyState, ErrorNote, Notice, PageHeader, Pagination, SearchBox, SegmentTabs, Spinner, StatCard, Stars, STATUS_BADGE, downloadFile, formatDate, toCsv } from '../../components/ui';
import { allFeedbackForStats, listAllFeedback, pctShort, updateFeedback, type AdminFeedback } from '../../lib/adminApi';
import { useLiveTick } from '../../lib/useLiveTick';
import { PERIODS, bucket, type Period } from './AdminAnalyticsPage';
import { RangeSelect } from './AdminDashboardPage';

const PAGE_SIZE = 8;
const KIND_LABEL: Record<string, string> = { rating: 'Review', suggestion: 'Suggestion', complaint: 'Complaint', bug: 'Bug Report' };
const KIND_BADGE: Record<string, string> = { rating: 'badge-amber', suggestion: 'badge-purple', complaint: 'badge-red', bug: 'badge-red' };
const KIND_ICON: Record<string, LucideIcon> = { rating: Star, suggestion: Lightbulb, complaint: Megaphone, bug: Bug };
const RATING_COLOR: Record<number, string> = { 5: '#16a34a', 4: '#facc15', 3: '#fde047', 2: '#fb923c', 1: '#fca5a5' };
const DAY = 86400000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Rating and sort work across every row, not only the page on screen.
export function filterFeedback(rows: AdminFeedback[], days: number, rating: number, sort: string, now = Date.now()) {
  const since = now - days * DAY;
  const out = rows.filter((f) => new Date(f.created_at).getTime() >= since && (!rating || f.rating === rating));
  return out.sort((a, b) => sort === 'oldest' ? a.created_at.localeCompare(b.created_at)
    : sort === 'rating' ? (b.rating ?? 0) - (a.rating ?? 0) || b.created_at.localeCompare(a.created_at)
    : b.created_at.localeCompare(a.created_at));
}

export function AdminFeedbackPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [rating, setRating] = useState(0);
  const [sort, setSort] = useState('newest');
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState<Period>('weekly');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ counts: { open: number; in_progress: number; resolved: number }; rows: AdminFeedback[] } | null>(null);
  const [all, setAll] = useState<{ kind: string; rating: number | null; status: string; created_at: string }[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const tick = useLiveTick(['feedback']);

  const load = useCallback((quiet = false) => {
    listAllFeedback(search, status, kind).then((r) => { setResult(r); if (!quiet) setError(''); }).catch((e: Error) => { if (!quiet) setError(e.message); });
    allFeedbackForStats().then(setAll).catch(() => {});
  }, [search, status, kind]);
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (tick) load(true); }, [tick, load]);
  useEffect(() => { setPage(1); }, [search, status, kind, rating, sort, days]);

  const filtered = useMemo(() => filterFeedback(result?.rows ?? [], days, rating, sort), [result, days, rating, sort]);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = filtered.find((f) => f.id === selectedId) ?? rows[0] ?? null;
  const selectedKey = selected?.id;
  const selectedNote = selected?.admin_note ?? '';
  useEffect(() => { setNote(selectedNote); }, [selectedKey, selectedNote]);

  const since = Date.now() - days * DAY;
  const current = all.filter((f) => new Date(f.created_at).getTime() >= since);
  const previous = all.filter((f) => { const t = new Date(f.created_at).getTime(); return t < since && t >= since - days * DAY; });
  const ratingsOf = (list: typeof all) => list.filter((f) => f.rating !== null).map((f) => f.rating as number);
  const ratings = ratingsOf(current);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const positive = ratings.filter((r) => r >= 4).length, neutral = ratings.filter((r) => r === 3).length, negative = ratings.filter((r) => r <= 2).length;
  const share = (n: number) => (ratings.length ? ` (${((n / ratings.length) * 100).toFixed(1)}%)` : '');
  const countKind = (list: typeof all, k: string) => list.filter((f) => f.kind === k).length;
  const prevRatings = ratingsOf(previous);
  const byKind = Object.keys(KIND_LABEL).map((k, i) => ({ label: KIND_LABEL[k], value: countKind(current, k), color: [PALETTE[3], PALETTE[1], PALETTE[4], PALETTE[0]][i] }));
  const byRating = [5, 4, 3, 2, 1].map((n) => ({ n, value: ratings.filter((r) => r === n).length }));
  const trend = useMemo(() => {
    const list = [...Array(days)].map((_, i) => isoDay(new Date(Date.now() - (days - 1 - i) * DAY)));
    return bucket(list.map((day) => ({ day, count: all.filter((f) => f.created_at.slice(0, 10) === day).length })), period, 'count', 'sum');
  }, [all, days, period]);

  const update = async (f: AdminFeedback, patch: { status?: string; admin_note?: string }, done: string) => {
    try {
      await updateFeedback(f.id, patch);
      setNotice(done);
      setSelectedId(f.id);
      load();
    } catch (e) { setError((e as Error).message); }
  };
  // Ticked rows if there are any, otherwise the one open in the details card.
  const setStatusOf = async (value: string, done: string) => {
    const targets = checked.length ? filtered.filter((f) => checked.includes(f.id)) : selected ? [selected] : [];
    try {
      for (const f of targets) await updateFeedback(f.id, { status: value });
      setNotice(targets.length > 1 ? `${targets.length} items: ${done.toLowerCase()}` : done);
      setChecked([]);
      load();
    } catch (e) { setError((e as Error).message); }
  };
  const exportCsv = () => downloadFile('dishwish-feedback.csv', toCsv(filtered.map((f) => ({ id: f.id, date: f.created_at, author: f.author, type: f.kind, rating: f.rating,
    subject: f.subject, message: f.message, status: f.status, admin_note: f.admin_note }))), 'text/csv');
  const kindBadge = (k: string) => {
    const Icon = KIND_ICON[k] ?? MessageCircle;
    return <span className={`badge whitespace-nowrap ${KIND_BADGE[k] ?? 'badge-gray'}`}><Icon size={14} aria-hidden="true" />{KIND_LABEL[k] ?? k}</span>;
  };
  const allOnPage = rows.length > 0 && rows.every((f) => checked.includes(f.id));

  return (
    <div className="admin-page admin-feedback">
      <PageHeader title="Feedback &" accent="Reviews" icon={MessageSquare} subtitle="Monitor user feedback, reviews, complaints and suggestions to improve Dish-Wish."
        actions={<><RangeSelect days={days} onChange={setDays} /><button type="button" className="btn-primary" onClick={exportCsv}><Download size={16} aria-hidden="true" />Export Report</button></>} />
      <div className="admin-stats admin-compact grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <StatCard icon={MessageSquare} value={current.length} label="Total Feedback" trend={pctShort(current.length, previous.length)} />
        <StatCard icon={Star} value={avg !== null ? <>{avg.toFixed(1)}<span className="text-base font-semibold"> / 5</span></> : '—'} label="Overall Rating" tone="amber" trend={pctShort(ratings.length, prevRatings.length)} />
        <StatCard icon={ThumbsUp} value={positive} label={`Positive${share(positive)}`} tone="green" trend={pctShort(positive, prevRatings.filter((r) => r >= 4).length)} />
        <StatCard icon={MinusCircle} value={neutral} label={`Neutral${share(neutral)}`} tone="amber" trend={pctShort(neutral, prevRatings.filter((r) => r === 3).length)} />
        <StatCard icon={ThumbsDown} value={negative} label={`Negative${share(negative)}`} trend={pctShort(negative, prevRatings.filter((r) => r <= 2).length)} />
        <StatCard icon={Megaphone} value={countKind(current, 'complaint')} label="Complaints" trend={pctShort(countKind(current, 'complaint'), countKind(previous, 'complaint'))} />
        <StatCard icon={Lightbulb} value={countKind(current, 'suggestion')} label="Suggestions" tone="amber" trend={pctShort(countKind(current, 'suggestion'), countKind(previous, 'suggestion'))} />
      </div>
      <div className="mt-[0.85rem] grid gap-3 xl:grid-cols-[1.24fr_1fr_1.13fr]">
        <Card title="Feedback Trend" icon={MessageCircle} action={<SegmentTabs label="Feedback trend period" value={period} options={PERIODS} onChange={setPeriod} />}><AreaTrend data={trend} x="day" y="value" label="Feedback per period" height={122} /></Card>
        <Card title="Rating Distribution" icon={Star}>
          <div className="flex flex-wrap items-center gap-5">
            <Donut size={134} thickness={6} label="Ratings" parts={byRating.map((r) => ({ value: r.value, color: RATING_COLOR[r.n], label: `${r.n} stars` }))}
              center={<span><span className="block text-[1.4rem] font-bold leading-tight">{avg !== null ? avg.toFixed(1) : '—'}<span className="text-sm"> / 5</span></span><span className="block text-[0.74rem] leading-none">Overall Rating</span></span>} />
            <ul className="min-w-36 flex-1 space-y-[0.32rem] text-[0.9rem]">
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
          <div className="flex flex-wrap items-center gap-5">
            <Donut size={134} thickness={6} label="Feedback by type" parts={byKind} center={<span><span className="block text-[1.4rem] font-bold leading-tight">{current.length}</span><span className="text-[0.84rem]">Feedback</span></span>} />
            <div className="min-w-36 flex-1"><Legend items={byKind.map((k) => ({ label: k.label, value: current.length ? `${((k.value / current.length) * 100).toFixed(1)}%` : '0%', color: k.color }))} /></div>
          </div>
        </Card>
      </div>
      {notice && <div className="mt-2"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-[0.8rem] flex flex-wrap items-center gap-[0.9rem]">
        <div className="min-w-[16rem] flex-[1_1_26rem] xl:max-w-[26.5rem]"><SearchBox value={search} onChange={setSearch} label="Search feedback" placeholder="Search feedback (e.g., recipe, feature, user)..." /></div>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type filter">
          <option value="">All Types</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={rating} onChange={(e) => setRating(Number(e.target.value))} aria-label="Rating filter">
          <option value={0}>All Ratings</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All Status</option>
          <option value="open">Open ({result?.counts.open ?? 0})</option><option value="in_progress">In progress ({result?.counts.in_progress ?? 0})</option>
          <option value="resolved">Resolved ({result?.counts.resolved ?? 0})</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="rating">Sort: Highest Rating</option>
        </select>
        <button type="button" className="btn-primary xl:ml-auto" disabled={!selected} onClick={() => noteRef.current?.focus()}><Plus size={16} aria-hidden="true" />Add Note</button>
      </div>

      <div className="mt-[0.8rem] grid gap-[1.1rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card className="min-w-0">
          {!result ? <Spinner /> : rows.length === 0 ? <EmptyState icon={MessageSquare} title="No feedback matches" /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead><tr><th className="w-7"><input type="checkbox" className="h-4 w-4 accent-crimson" aria-label="Select all on this page" checked={allOnPage} onChange={() => setChecked(allOnPage ? checked.filter((id) => !rows.some((f) => f.id === id)) : [...new Set([...checked, ...rows.map((f) => f.id)])])} /></th><th>User</th><th>Feedback / Review</th><th>Type</th><th>Rating</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id} className={selected?.id === f.id ? 'bg-rose-50/60' : ''}>
                      <td><input type="checkbox" className="h-4 w-4 accent-crimson" aria-label={`Select feedback from ${f.author}`} checked={checked.includes(f.id)} onChange={() => setChecked(checked.includes(f.id) ? checked.filter((id) => id !== f.id) : [...checked, f.id])} /></td>
                      <td><span className="flex items-center gap-2"><Avatar name={f.author} size={26} /><strong className="max-w-24 truncate font-medium">{f.author}</strong></span></td>
                      <td className="max-w-64"><span className="line-clamp-2 text-[0.8rem] leading-[1.25]">{f.subject && <strong>{f.subject}: </strong>}“{f.message}”</span></td>
                      <td>{kindBadge(f.kind)}</td>
                      <td className="whitespace-nowrap">{f.rating ? <><Stars value={f.rating} /> {f.rating.toFixed(1)}</> : '—'}</td>
                      <td className="text-[0.8rem] leading-tight">{formatDate(f.created_at, true)}</td>
                      <td><span className={`badge whitespace-nowrap capitalize ${STATUS_BADGE[f.status]}`}>{f.status.replace('_', ' ')}</span></td>
                      <td className="whitespace-nowrap"><button type="button" className="icon-btn" aria-label={`Open feedback ${f.id}`} onClick={() => setSelectedId(f.id)}><Eye size={16} aria-hidden="true" /></button>
                        <button type="button" className="icon-btn" aria-label={`Write a note on feedback ${f.id}`} onClick={() => { setSelectedId(f.id); noteRef.current?.focus(); }}><Pencil size={16} aria-hidden="true" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} noun="feedback" />}
        </Card>

        <div className="admin-small-titles flex min-w-0 flex-col gap-[0.65rem]">
          <Card title="Feedback Details" icon={MessageSquare}>
            {!selected ? <p className="text-sm text-stone-500">No feedback to review yet.</p> : (
              <div className="space-y-1.5 text-[0.9rem]">
                <div className="flex items-center gap-3"><Avatar name={selected.author} size={38} /><strong className="min-w-0 flex-1 truncate font-medium">{selected.author}</strong>
                  {selected.rating && <span className="flex items-center gap-1"><Stars value={selected.rating} size="1.15rem" />{selected.rating.toFixed(1)}</span>}</div>
                <dl className="grid grid-cols-[4rem_1fr] items-center">
                  <dt>Type:</dt><dd>{kindBadge(selected.kind)}</dd>
                  <dt>Date:</dt><dd>{formatDate(selected.created_at, true)}</dd>
                  <dt>Status:</dt><dd><span className={`badge capitalize ${STATUS_BADGE[selected.status]}`}>{selected.status.replace('_', ' ')}</span></dd>
                  {selected.recipe_slug && <><dt>Recipe:</dt><dd><a className="text-crimson underline" href={`/recipe/${selected.recipe_slug}`} target="_blank" rel="noreferrer">{selected.recipe_slug}</a></dd></>}
                </dl>
                <p className="line-clamp-2 rounded-xl bg-rose-50 px-3 py-1.5 leading-snug">“{selected.message}”</p>
              </div>
            )}
          </Card>
          <Card title="Admin Actions" icon={Settings}>
            <div className="flex gap-1.5">
              <button type="button" className="pill !gap-1 !px-2 !text-[0.8rem]" disabled={!selected} onClick={() => setStatusOf('resolved', 'Marked as resolved.')}><CheckCircle2 size={15} className="text-green-600" aria-hidden="true" />Mark as Resolved</button>
              <button type="button" className="pill !gap-1 !px-2 !text-[0.8rem]" disabled={!selected} onClick={() => setStatusOf('in_progress', 'Marked in progress.')}><RefreshCw size={15} className="text-amber-500" aria-hidden="true" />In Progress</button>
              <button type="button" className="pill !gap-1 !px-2 !text-[0.8rem]" disabled={!selected} onClick={() => setStatusOf('open', 'Reopened.')}><XCircle size={15} className="text-crimson" aria-hidden="true" />Reopen</button>
            </div>
          </Card>
          <Card title="Add Admin Note" icon={FileText}>
            <div className="flex items-end gap-2">
              <textarea ref={noteRef} className="field !min-h-0 min-w-0 flex-1 !py-1.5 text-[0.88rem]" rows={2} maxLength={2000} placeholder="Write a note (the user sees this as a reply)..." aria-label="Admin note" disabled={!selected} value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="btn-sm btn-red shrink-0 whitespace-nowrap" disabled={!selected} onClick={() => selected && update(selected, { admin_note: note.trim() }, 'Note saved.')}><Save size={14} aria-hidden="true" />Save Note</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
