import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Download, Gauge, MessageSquare, Star, Users } from 'lucide-react';
import { Bar, Card, EmptyState, ErrorNote, PageHeader, Spinner, StatCard, downloadFile, formatDate, toCsv } from '../../components/ui';
import { listFeedback } from '../../lib/adminApi';
import { FEATURES, SURVEY_SUBJECT, SUS_ITEMS, decodeSurvey, summarize, type SurveySummary } from '../../lib/survey';
import { useLiveTick } from '../../lib/useLiveTick';

type Row = { message: string; created_at: string; author: string };

// All survey responses (feedback rows with the SUS encoding), paging through the admin feedback RPC.
async function loadResponses(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await listFeedback('SUS v1', '', 'rating', page, 50);
    rows.push(...res.rows.map((r) => ({ message: r.message, created_at: r.created_at, author: r.author })));
    if (rows.length >= res.total || res.rows.length === 0) break;
  }
  return rows;
}

export function AdminSurveyPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [error, setError] = useState('');
  const tick = useLiveTick(['feedback']);
  const load = useCallback(() => {
    loadResponses().then((r) => { setRows(r); setSummary(summarize(r)); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load, tick]);

  const exportCsv = () => {
    if (!rows) return;
    const data = rows.map((r) => ({ r, d: decodeSurvey(r.message) })).filter((x) => x.d).map(({ r, d }) => ({
      date: r.created_at, participant: r.author || 'anonymous', sus_score: d!.score,
      ...Object.fromEntries(d!.sus.map((v, i) => [`q${i + 1}`, v])), recommendations: d!.features.rec, generation: d!.features.gen,
      safety: d!.features.safe, comment: d!.comment,
    }));
    downloadFile('dishwish-survey.csv', toCsv(data), 'text/csv');
  };

  return (
    <div className="space-y-4">
      <PageHeader title="User" accent="Testing" icon={ClipboardList} subtitle={`Results of the in-app survey (“${SURVEY_SUBJECT}”): System Usability Scale and feature ratings.`}
        actions={<button type="button" className="btn-primary" onClick={exportCsv} disabled={!summary}><Download size={16} />Export CSV</button>} />
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
      {!rows && !error && <Spinner />}
      {rows && !summary && (
        <Card><EmptyState icon={ClipboardList} title="No survey responses yet">
          Ask testers to open <b>Profile → Rate Dish-Wish</b> (or /survey). Results appear here live.
        </EmptyState></Card>
      )}
      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} value={summary.responses} label="Responses" tone="blue" />
            <StatCard icon={Gauge} value={summary.averageSus} label={`Average SUS score (${summary.grade.label})`} tone={summary.averageSus >= 68 ? 'green' : 'amber'} note="68 = industry average" />
            <StatCard icon={Star} value={`${summary.features.rec.toFixed(1)} / 5`} label="Recommendations rating" tone="red" />
            <StatCard icon={MessageSquare} value={summary.comments.length} label="Written comments" tone="purple" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Feature ratings" icon={Star}>
              <ul className="space-y-3">{FEATURES.map((f) => (
                <li key={f.key}><div className="mb-1 flex justify-between text-sm"><span>{f.label}</span><b>{summary.features[f.key].toFixed(1)} / 5</b></div>
                  <Bar value={summary.features[f.key]} max={5} label={f.label} /></li>))}</ul>
            </Card>
            <Card title="SUS statements (average answer, 1–5)" icon={Gauge}>
              <ol className="space-y-2 text-sm">{SUS_ITEMS.map((t, i) => (
                <li key={t}><div className="flex justify-between gap-3"><span className="min-w-0"><b className="text-crimson">{i + 1}.</b> {t}</span><b>{summary.perItem[i].toFixed(1)}</b></div>
                  <Bar value={summary.perItem[i]} max={5} color={i % 2 === 0 ? '#16a34a' : '#e11d36'} label={`Statement ${i + 1}`} /></li>))}</ol>
              <p className="mt-2 text-xs text-stone-500">Green statements are positive (higher is better); red ones are negative (lower is better).</p>
            </Card>
          </div>
          <Card title="What testers said" icon={MessageSquare}>
            {summary.comments.length === 0 ? <p className="text-sm text-stone-500">No comments yet.</p> : (
              <ul className="divide-y divide-stone-100">{summary.comments.map((c) => (
                <li key={`${c.at}-${c.text}`} className="py-2 text-sm"><span className="text-stone-500">{formatDate(c.at)} · SUS {c.score}</span><p>{c.text}</p></li>))}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
