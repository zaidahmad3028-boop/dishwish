import { useState, type FormEvent } from 'react';
import { Send, Star } from 'lucide-react';
import { FEEDBACK_KINDS, submitFeedback, validateFeedback, type FeedbackKind } from '../lib/accountApi';
import { ErrorNote, Notice } from './ui';

export function FeedbackForm({ recipeSlug = null, defaultKind = 'suggestion', onDone }: {
  recipeSlug?: string | null; defaultKind?: FeedbackKind; onDone?: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>(defaultKind);
  const [rating, setRating] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateFeedback({ kind, rating, message, subject });
    if (problem) { setError(problem); return; }
    setError('');
    setState('sending');
    try {
      await submitFeedback({ kind, rating, subject, message, recipeSlug });
      setState('sent');
      setMessage(''); setSubject(''); setRating(null);
      onDone?.();
    } catch (err) {
      setState('idle');
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate aria-label="Send feedback">
      {state === 'sent' && <Notice>Thanks! Your feedback was sent to the Dish-Wish team.</Notice>}
      {error && <ErrorNote>{error}</ErrorNote>}
      <label className="block text-sm font-semibold">Type
        <select className="field mt-1" value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
          {FEEDBACK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">Rating {kind === 'rating' ? '(required)' : '(optional)'}</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating !== null && n <= rating}
              className="icon-btn"><Star size={22} className={rating !== null && n <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'} /></button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold">Subject (optional)
        <input className="field mt-1" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block text-sm font-semibold">Message
        <textarea className="field mt-1 min-h-28" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
        <span className="mt-1 block text-right text-xs font-normal text-stone-500">{message.length}/2000</span>
      </label>
      <button type="submit" className="btn-primary w-full" disabled={state === 'sending'}><Send size={16} />{state === 'sending' ? 'Sending…' : 'Send feedback'}</button>
    </form>
  );
}
