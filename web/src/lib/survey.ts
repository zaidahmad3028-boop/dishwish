// User testing survey: the standard System Usability Scale (SUS, Brooke 1996) plus three feature ratings.
// Responses are stored as ordinary feedback rows (kind 'rating'), so no new table is needed; the message
// holds a compact, versioned encoding that the admin page decodes.
import { supabase } from './supabase';

export const SUS_ITEMS = [
  'I think that I would like to use Dish-Wish frequently.',
  'I found Dish-Wish unnecessarily complex.',
  'I thought Dish-Wish was easy to use.',
  'I think that I would need the support of a technical person to be able to use Dish-Wish.',
  'I found the various functions in Dish-Wish were well integrated.',
  'I thought there was too much inconsistency in Dish-Wish.',
  'I would imagine that most people would learn to use Dish-Wish very quickly.',
  'I found Dish-Wish very cumbersome to use.',
  'I felt very confident using Dish-Wish.',
  'I needed to learn a lot of things before I could get going with Dish-Wish.',
] as const;

export const FEATURES = [
  { key: 'rec', label: 'Recipe recommendations matched my ingredients and taste' },
  { key: 'gen', label: 'Generated recipes were useful and easy to follow' },
  { key: 'safe', label: 'Allergy and conflict alerts made me feel safe' },
] as const;
export type FeatureKey = (typeof FEATURES)[number]['key'];

export const SURVEY_SUBJECT = 'Usability survey (SUS)';
const PREFIX = 'SUS v1';

export interface SurveyAnswers { sus: number[]; features: Record<FeatureKey, number>; comment: string }

// SUS score 0-100: odd items count (answer - 1), even items count (5 - answer); the sum is multiplied by 2.5.
export function susScore(sus: number[]): number {
  if (sus.length !== 10 || sus.some((v) => !(v >= 1 && v <= 5))) throw new Error('Answer all ten statements (1-5).');
  return sus.reduce((total, v, i) => total + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
}

// Adjective scale from Bangor, Kortum and Miller (2009).
export function susGrade(score: number): { grade: string; label: string } {
  if (score >= 85) return { grade: 'A', label: 'Excellent' };
  if (score >= 72) return { grade: 'B', label: 'Good' };
  if (score >= 52) return { grade: 'C', label: 'OK' };
  if (score >= 38) return { grade: 'D', label: 'Poor' };
  return { grade: 'F', label: 'Awful' };
}

export function encodeSurvey(a: SurveyAnswers): string {
  const comment = a.comment.replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, 1500);  // '|' separates fields
  return `${PREFIX}|q=${a.sus.join(',')}|rec=${a.features.rec}|gen=${a.features.gen}|safe=${a.features.safe}|note=${comment || '-'}`;
}

export function decodeSurvey(message: string): (SurveyAnswers & { score: number }) | null {
  if (!message.startsWith(`${PREFIX}|`)) return null;
  const parts = Object.fromEntries(message.split('|').slice(1).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
  const sus = String(parts.q ?? '').split(',').map(Number);
  const features = { rec: Number(parts.rec), gen: Number(parts.gen), safe: Number(parts.safe) };
  try {
    const score = susScore(sus);
    if (Object.values(features).some((v) => !(v >= 1 && v <= 5))) return null;
    return { sus, features, comment: parts.note && parts.note !== '-' ? parts.note : '', score };
  } catch {
    return null;
  }
}

export async function submitSurvey(a: SurveyAnswers): Promise<number> {
  const score = susScore(a.sus);
  const overall = Math.max(1, Math.min(5, Math.round(score / 20)));
  const { error } = await supabase.from('feedback').insert({ kind: 'rating', rating: overall, subject: SURVEY_SUBJECT, message: encodeSurvey(a) });
  if (error) throw new Error(error.message);
  return score;
}

export interface SurveySummary {
  responses: number; averageSus: number; grade: { grade: string; label: string };
  features: Record<FeatureKey, number>; perItem: number[]; comments: { at: string; text: string; score: number }[];
}

export function summarize(rows: { message: string; created_at: string }[]): SurveySummary | null {
  const decoded = rows.map((r) => ({ at: r.created_at, d: decodeSurvey(r.message) })).filter((r): r is { at: string; d: NonNullable<ReturnType<typeof decodeSurvey>> } => r.d !== null);
  if (!decoded.length) return null;
  const n = decoded.length;
  const avg = (f: (d: (typeof decoded)[number]['d']) => number) => decoded.reduce((s, r) => s + f(r.d), 0) / n;
  const averageSus = Math.round(avg((d) => d.score) * 10) / 10;
  return {
    responses: n, averageSus, grade: susGrade(averageSus),
    features: { rec: avg((d) => d.features.rec), gen: avg((d) => d.features.gen), safe: avg((d) => d.features.safe) },
    perItem: SUS_ITEMS.map((_, i) => avg((d) => d.sus[i])),
    comments: decoded.filter((r) => r.d.comment).map((r) => ({ at: r.at, text: r.d.comment, score: r.d.score })),
  };
}
