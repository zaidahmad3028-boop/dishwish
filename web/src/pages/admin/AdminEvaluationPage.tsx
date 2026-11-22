import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FlaskConical, Gauge, RefreshCw, ShieldCheck, Target, TrendingUp, Trophy, Users } from 'lucide-react';
import { Bar, Card, ErrorNote, PageHeader, Spinner, StatCard } from '../../components/ui';
import { engineEvaluation, type EvalReport, type EvalRow } from '../../lib/adminApi';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const COLORS: Record<string, string> = {
  'Random order': '#a8a29e', 'Coverage only': '#fb923c', 'Graph only': '#f59e0b', 'Without TF-IDF': '#f472b6', 'Full engine': '#e11d36',
};
const NOTES: Record<string, string> = {
  'Random order': 'Baseline: recipes that share an ingredient, in random order',
  'Coverage only': 'Only counts how many of the dish\'s ingredients you have',
  'Graph only': 'Only the NetworkX ingredient-pairing weights',
  'Without TF-IDF': 'Full engine with the TF-IDF similarity switched off',
  'Full engine': 'The weights currently used for every cook',
};

export function MethodRow({ row, best }: { row: EvalRow; best: boolean }) {
  return (
    <li className={`rounded-2xl border p-3.5 ${best ? 'border-rose-200 bg-rose-50/70' : 'border-stone-100 bg-white'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{row.method}{best && <span className="badge badge-red ml-2 !text-[0.75rem]"><Trophy size={12} /> Best</span>}</p>
        <p className="text-sm text-stone-600">MRR <b className="text-stone-900">{row.mrr.toFixed(3)}</b></p>
      </div>
      <p className="mb-2 text-xs text-stone-500">{NOTES[row.method] ?? ''}</p>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {(['hit@1', 'hit@3', 'hit@5'] as const).map((k) => (
          <div key={k}>
            <div className="mb-0.5 flex justify-between text-xs"><span>{k.replace('hit@', 'Top ')}</span><b>{pct(row[k])}</b></div>
            <Bar value={row[k]} max={1} color={COLORS[row.method] ?? '#e11d36'} label={`${row.method} ${k}`} />
          </div>
        ))}
      </div>
    </li>
  );
}

export function AdminEvaluationPage() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setBusy(true); setError('');
    try { setReport(await engineEvaluation(fresh)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not run the evaluation.'); }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const full = report?.methods.find((m) => m.method === 'Full engine');
  const random = report?.methods.find((m) => m.method === 'Random order');

  return (
    <div className="space-y-4">
      <PageHeader title="Engine" accent="Evaluation" icon={FlaskConical} subtitle="How accurately the recommender finds the right recipe, compared with simpler methods."
        actions={<button type="button" className="btn-primary" onClick={() => void load(true)} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> {busy ? 'Running…' : 'Run again'}</button>} />
      {error && <ErrorNote onRetry={() => void load()}>{error}</ErrorNote>}
      {!report && !error && <Spinner label="Running the offline evaluation (a few seconds)" />}
      {report && full && random && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Target} value={pct(full['hit@5'])} label="Original recipe in the top 5 (offline)" tone="red" note={`${full.trials} test cases`} />
            <StatCard icon={Gauge} value={full.mrr.toFixed(3)} label="Mean reciprocal rank (MRR)" tone="purple" note="1.0 = always first" />
            <StatCard icon={TrendingUp} value={report.lift_hit5_vs_random ? `${report.lift_hit5_vs_random}×` : '—'} label="Better than the random-order baseline (top 5)" tone="green" note={`Random: ${pct(random['hit@5'])}`} />
            <StatCard icon={ShieldCheck} value={report.safety.violations} label="Allergen violations (simulated profiles)" tone={report.safety.violations ? 'red' : 'green'}
              note={`${report.safety.profiles} allergy profiles · ${report.safety.recipes_checked} results checked`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card title="Method comparison" icon={Trophy}>
              <ul className="space-y-2.5" aria-label="Accuracy of each method">
                {report.methods.map((row) => <MethodRow key={row.method} row={row} best={row.method === report.best} />)}
              </ul>
            </Card>
            <div className="space-y-4">
              <Card title="How the test works" icon={FlaskConical}>
                <ol className="list-decimal space-y-2 pl-5 text-[0.95rem] text-stone-700">
                  <li>For each of the {report.recipes} published recipes, keep its main ingredient and a random half of the other main ingredients.</li>
                  <li>Give only those ingredients to each method and rank all recipes.</li>
                  <li>Record where the real recipe lands. Repeated with {report.seeds.length} random seeds.</li>
                  <li><b>Top k</b> = share of tests with the real recipe in the first k results. <b>MRR</b> = average of 1 ÷ its position.</li>
                </ol>
              </Card>
              {report.personalization && (
                <Card title="Personalisation (simulated cooks)" icon={Users}>
                  <p className="mb-3 text-[0.95rem] text-stone-700">{report.personalization.users} simulated cooks with hidden preferences each cooked {report.personalization.history_per_user} recipes.
                    The model learned from those choices and then predicted their next favourite ({report.personalization.test_cases} new cases).</p>
                  {([['Global weights', report.personalization.hit1_global, '#a8a29e'], ['Learned personal weights', report.personalization.hit1_personal, '#e11d36']] as const).map(([label, v, c]) => (
                    <div key={label} className="mb-2"><div className="mb-0.5 flex justify-between text-sm"><span>{label}</span><b>{pct(v)} first-choice accuracy</b></div><Bar value={v} max={1} color={c} label={label} /></div>
                  ))}
                  <p className="mt-2 text-xs text-stone-500">Live setting: {report.personalization.enabled ? `on, strength ${report.personalization.strength}` : 'off'} (change it in Settings → Recommendation Engine).</p>
                </Card>
              )}
              <Card title="Safety test" icon={ShieldCheck} iconClass="text-green-600">
                <p className="flex items-start gap-2 text-[0.95rem] text-stone-700">
                  <CheckCircle2 size={20} className={`mt-0.5 shrink-0 ${report.safety.violations ? 'text-crimson' : 'text-green-600'}`} />
                  {report.safety.violations
                    ? `${report.safety.violations} returned recipes contained an excluded allergen. Check the ingredient allergen tags.`
                    : `Across ${report.safety.profiles} random allergy profiles, no returned recipe contained an excluded allergen.`}
                </p>
              </Card>
              <Card title="Weights evaluated" icon={Gauge}>
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(report.weights).map(([k, w]) => (
                    <li key={k} className="flex items-center gap-2"><span className="w-28 capitalize">{k}</span><Bar value={w} max={1} label={`${k} weight`} /><b className="w-10 text-right">{w.toFixed(2)}</b></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-stone-500">Data: {report.data_source} catalog · computed in {report.seconds}s. With more recipes the test becomes harder and more informative.</p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
