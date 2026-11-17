// What the recommendation ranking has learned from one cook's own choices (user side of personalisation).
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Bar, Card } from './ui';
import { fetchPersonalization, personalHistory, type Personalization } from '../lib/curatedApi';

export const COMPONENT_NAMES: Record<string, string> = { coverage: 'Ingredients you have', similarity: 'Closeness to your selection', compatibility: 'Ingredient pairing', taste: 'Taste match', cooking: 'Cooking time' };

// What the ranking learned from this cook (shown in "Why this match?" and on the Profile page).
export function PersonalWeights({ info }: { info: Personalization }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">Learned from <b>{info.events_used}</b> of your recipes · confidence <b>{Math.round(info.confidence * 100)}%</b></p>
      {info.changes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm">{info.changes.map((c) => <li key={c.component}>{c.text}</li>)}</ul>}
      <ul className="space-y-1.5 text-xs" aria-label="Your ranking weights">
        {Object.keys(info.weights).map((k) => (
          <li key={k}>
            <span className="flex justify-between"><span>{COMPONENT_NAMES[k] ?? k}</span>
              <span><span className="text-stone-500">default {Math.round(info.base_weights[k] * 100)}%</span> → <b>you {Math.round(info.weights[k] * 100)}%</b></span></span>
            <Bar value={info.weights[k]} max={0.6} label={`${COMPONENT_NAMES[k] ?? k} weight for you`} />
          </li>
        ))}
      </ul>
    </div>
  );
}


// Profile card: loads the cook's history, asks the API what it learned, and explains it in plain words.
export function LearnedCard({ userId, token }: { userId?: string; token?: string }) {
  const [info, setInfo] = useState<Personalization | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!userId || !token) return;
    let live = true;
    personalHistory(userId).then((h) => fetchPersonalization(token, h)).then((r) => { if (live) setInfo(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [userId, token]);
  if (failed) return null;
  return (
    <Card title="What Dish-Wish Learned" icon={Sparkles}>
      {!info ? <p className="text-sm text-stone-500">Checking your cooking history…</p>
        : !info.enabled ? <p className="text-sm text-stone-600">Personalisation is switched off by the administrator.</p>
        : info.active ? <PersonalWeights info={info} />
        : <p className="text-sm text-stone-600">Save or cook {Math.max(1, 2 - info.events_used)} more recipe{2 - info.events_used === 1 ? '' : 's'} and your recommendations will start adapting to you.</p>}
    </Card>
  );
}
