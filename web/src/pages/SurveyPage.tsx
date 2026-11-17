import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Send } from 'lucide-react';
import { Card, ErrorNote, PageHeader } from '../components/ui';
import { FEATURES, SUS_ITEMS, submitSurvey, susGrade, type FeatureKey } from '../lib/survey';

const SCALE = [1, 2, 3, 4, 5] as const;

function Scale({ name, value, onChange, low = 'Strongly disagree', high = 'Strongly agree' }: {
  name: string; value: number; onChange: (v: number) => void; low?: string; high?: string;
}) {
  return (
    <div>
      <div role="radiogroup" aria-label={name} className="flex gap-1.5">
        {SCALE.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={`${v}`} onClick={() => onChange(v)}
            className={`h-10 w-10 rounded-full border text-sm font-bold transition ${value === v ? 'border-crimson bg-crimson text-white' : 'border-rose-200 bg-white hover:bg-rose-50'}`}>{v}</button>
        ))}
      </div>
      <div className="mt-1 flex w-[13.4rem] justify-between text-[0.7rem] text-stone-500"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

// Two-minute user testing survey: the 10 SUS statements, three feature ratings and an optional comment.
export function SurveyPage() {
  const [sus, setSus] = useState<number[]>(Array(10).fill(0));
  const [features, setFeatures] = useState<Record<FeatureKey, number>>({ rec: 0, gen: 0, safe: 0 });
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const answered = sus.filter(Boolean).length + Object.values(features).filter(Boolean).length;
  const total = SUS_ITEMS.length + FEATURES.length;

  const send = async () => {
    if (answered < total) { setError(`Please answer all ${total} questions (${total - answered} left).`); return; }
    setBusy(true); setError('');
    try { setScore(await submitSurvey({ sus, features, comment })); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send.'); }
    setBusy(false);
  };

  if (score !== null) {
    const g = susGrade(score);
    return (
      <div className="mx-auto max-w-2xl">
        <Card><div className="py-6 text-center">
          <CheckCircle2 size={56} className="mx-auto text-green-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-3xl font-bold">Thank you!</h1>
          <p className="mt-2 text-stone-700">Your answers help us improve Dish-Wish. Your usability score: <b>{score}</b> / 100 ({g.label}).</p>
          <Link to="/kitchen" className="btn-primary mt-5">Back to the kitchen</Link>
        </div></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Rate" accent="Dish-Wish" icon={ClipboardList} subtitle="A two-minute survey for our final-year project. Please answer honestly." />
      <Card title={`Part 1 · Using Dish-Wish (${sus.filter(Boolean).length}/10)`}>
        <ol className="space-y-4">
          {SUS_ITEMS.map((text, i) => (
            <li key={text} className="flex flex-col gap-2 border-b border-stone-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.97rem]"><b className="mr-1 text-crimson">{i + 1}.</b>{text}</p>
              <Scale name={`Statement ${i + 1}`} value={sus[i]} onChange={(v) => setSus((s) => s.map((x, j) => (j === i ? v : x)))} />
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Part 2 · Features">
        <ol className="space-y-4">
          {FEATURES.map((f) => (
            <li key={f.key} className="flex flex-col gap-2 border-b border-stone-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.97rem]">{f.label}</p>
              <Scale name={f.label} value={features[f.key]} onChange={(v) => setFeatures((s) => ({ ...s, [f.key]: v }))} />
            </li>
          ))}
        </ol>
        <label className="mt-4 block text-sm font-semibold" htmlFor="survey-comment">Anything we should improve? (optional)</label>
        <textarea id="survey-comment" className="mt-1 w-full rounded-2xl border border-rose-200 bg-white p-3 text-sm" rows={3} maxLength={1500}
          value={comment} onChange={(e) => setComment(e.target.value)} />
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">{answered} of {total} answered</p>
        <button type="button" className="btn-primary" onClick={() => void send()} disabled={busy}><Send size={16} />{busy ? 'Sending…' : 'Send answers'}</button>
      </div>
    </div>
  );
}
