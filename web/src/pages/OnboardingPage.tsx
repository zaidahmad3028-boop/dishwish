import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Info, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { Logo } from '../components/Logo';
import {
  ALLERGEN_CHIPS, CALORIE_TIERS, LEVELS, TASTES, emptyPreferences, kcalForTier, mealSplit, parseCustomAllergens,
  type AllergenTag, type CalorieTier, type Level, type Preferences, type TasteKey,
} from '../lib/preferences';
import { loadPreferences, savePreferences } from '../lib/preferencesApi';

const STEPS = ['Taste Profile', 'Allergen Shield', 'Calorie Target'] as const;

const TASTE_STYLE: Record<TasteKey, { emoji: string; tile: string }> = {
  sweet: { emoji: '🍮', tile: 'from-pink-200 to-rose-300' },
  salty: { emoji: '🧂', tile: 'from-sky-200 to-blue-300' },
  sour: { emoji: '🍋', tile: 'from-lime-200 to-emerald-300' },
  spicy: { emoji: '🌶️', tile: 'from-orange-200 to-red-300' },
};

const MEAL_COLORS = ['var(--color-crimson)', 'var(--color-ember)', 'var(--color-mint)'];

function Progress({ step }: { step: number }) {
  return (
    <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Onboarding progress">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? 'step' : undefined} className="flex flex-col gap-2">
          <span className={`h-1.5 rounded-full ${i <= step ? 'chip-selected' : 'bg-stone-900/10'}`} />
          <span className={`flex items-center gap-1.5 text-xs font-semibold sm:text-sm ${i === step ? 'text-stone-900' : 'text-stone-500'}`}>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'chip-selected' : 'bg-stone-900/10'}`}>
              {i < step ? <Check size={12} aria-hidden="true" /> : i + 1}
            </span>
            <span className="truncate">{label}</span>
            <span className="sr-only">{i < step ? '(done)' : i === step ? '(current)' : ''}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Meter({ level }: { level: Level | null }) {
  const filled = level ? LEVELS.indexOf(level) + 1 : 0;
  return (
    <span className="flex items-end gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-2 rounded-sm ${i < filled ? 'chip-selected' : 'bg-stone-900/10'}`} style={{ height: 8 + i * 6 }} />
      ))}
    </span>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}

function TasteStep({ prefs, onChange }: { prefs: Preferences; onChange: (key: TasteKey, level: Level | null) => void }) {
  return (
    <div>
      <h2 className="font-display text-3xl font-extrabold tracking-tight">Taste Profile</h2>
      <p className="mt-1 text-stone-600">Pick how strongly you like each taste. All optional; tap a level again to clear it.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {TASTES.map(({ key, label, hint }) => {
          const current = prefs.tastes[key];
          return (
            <div key={key} className={`rounded-[24px] border-2 bg-white/70 p-5 transition ${current ? 'border-rose-500/70 shadow-lg shadow-rose-900/10' : 'border-transparent'}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-2xl ${TASTE_STYLE[key].tile}`} aria-hidden="true">{TASTE_STYLE[key].emoji}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-xl font-extrabold">{label}</h3>
                  <p className="truncate text-sm text-stone-500">{hint}</p>
                </div>
                <Meter level={current} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={`${label} level`}>
                {LEVELS.map((lvl) => (
                  <button key={lvl} type="button" aria-pressed={current === lvl}
                    onClick={() => onChange(key, current === lvl ? null : lvl)}
                    className={`rounded-full border py-2 text-sm font-semibold capitalize transition ${current === lvl ? 'chip-selected shadow' : 'border-stone-900/10 bg-white/80 text-stone-700 hover:bg-white'}`}>
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AllergenStep({ selected, onToggle, customText, onCustomText }: {
  selected: AllergenTag[]; onToggle: (tag: AllergenTag) => void; customText: string; onCustomText: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="font-display text-3xl font-extrabold tracking-tight">
        Allergen Shield <span className="ml-1 align-middle font-sans text-xs font-medium text-stone-400">Your food safety matters</span>
      </h2>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-stone-600">Choose anything you or your family can’t eat.</p>
        <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-rose-700" aria-live="polite">{selected.length} selected</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {ALLERGEN_CHIPS.map(({ tag, label, example }) => {
          const on = selected.includes(tag);
          return (
            <button key={tag} type="button" aria-pressed={on} onClick={() => onToggle(tag)}
              className={`rounded-2xl border px-3.5 py-2.5 text-left transition ${on ? 'chip-selected shadow-md' : 'border-stone-900/10 bg-white/75 hover:bg-white'}`}>
              <span className="flex items-center gap-1.5 text-sm font-bold">{on && <Check size={14} aria-hidden="true" />}{label}</span>
              <span className={`block truncate text-xs ${on ? 'text-white/85' : 'text-stone-500'}`}>{example}</span>
            </button>
          );
        })}
      </div>
      <label htmlFor="custom-allergens" className="mt-6 block text-sm font-semibold text-stone-800">Not in the list?</label>
      <textarea id="custom-allergens" rows={2} value={customText} onChange={(e) => onCustomText(e.target.value)}
        placeholder="e.g. shellfish, prawns, raw onion" className="field mt-1.5 resize-none" aria-describedby="custom-help" />
      <p id="custom-help" className="mt-1 text-xs text-stone-500">Separate items with commas. Any ingredient whose name contains one of these words will be blocked.</p>
      <p className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Blocked ingredients are removed from your kitchen counter automatically.
      </p>
    </div>
  );
}

function DailyPlan({ total }: { total: number }) {
  const meals = mealSplit(total);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <section className="mt-6 rounded-[24px] bg-white/70 p-5" aria-label="Your daily plan">
      <h3 className="font-display text-lg font-extrabold">Your daily plan</h3>
      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
        <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`${total.toLocaleString()} kcal per day split across three meals`}>
          <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(43 29 26 / 0.08)" strokeWidth="16" />
          {meals.map((m, i) => {
            const len = (m.kcal / total) * c;
            const el = (
              <circle key={m.meal} cx="70" cy="70" r={r} fill="none" stroke={MEAL_COLORS[i]} strokeWidth="16"
                strokeDasharray={`${Math.max(len - 3, 0)} ${c}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
          <text x="70" y="66" textAnchor="middle" transform="rotate(90 70 70)" className="fill-stone-900 font-display text-[22px] font-extrabold">{total.toLocaleString()}</text>
          <text x="70" y="86" textAnchor="middle" transform="rotate(90 70 70)" className="fill-stone-500 text-[11px] font-semibold">kcal / day</text>
        </svg>
        <ul className="w-full space-y-3">
          {meals.map((m, i) => (
            <li key={m.meal}>
              <div className="flex justify-between text-sm font-semibold"><span>{m.meal}</span><span>{m.kcal.toLocaleString()} kcal</span></div>
              <div className="mt-1 h-2.5 rounded-full bg-stone-900/8">
                <div className="h-full rounded-full" style={{ width: `${(m.kcal / total) * 100}%`, background: MEAL_COLORS[i] }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CalorieStep({ tier, onSelect }: { tier: CalorieTier | null; onSelect: (t: CalorieTier) => void }) {
  const total = kcalForTier(tier);
  return (
    <div>
      <h2 className="font-display text-3xl font-extrabold tracking-tight">Calorie Target</h2>
      <p className="mt-1 text-stone-600">Pick a daily target and we’ll size every recipe to fit.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Daily calorie target">
        {CALORIE_TIERS.map(({ tier: t, label, kcal, popular }) => {
          const on = tier === t;
          return (
            <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onSelect(t)}
              className={`relative overflow-hidden rounded-[24px] bg-white/75 p-5 text-left transition ${on ? 'border-4 border-rose-600 shadow-xl shadow-rose-900/15' : 'border-4 border-transparent hover:bg-white'}`}>
              {popular && (
                <span className="chip-selected absolute right-0 top-0 rounded-bl-2xl px-3 py-1 text-[11px] font-bold uppercase tracking-wider">Popular</span>
              )}
              {on && (
                <span className="absolute left-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white"><Check size={14} aria-hidden="true" /></span>
              )}
              <p className="mt-5 text-sm font-semibold text-stone-600">{label}</p>
              <p className="mt-1 font-display text-3xl font-extrabold">{kcal.toLocaleString()}<span className="ml-1 font-sans text-sm font-semibold text-stone-500">kcal/day</span></p>
              <p className="mt-1 text-sm text-stone-500">~{Math.round(kcal / 3)} per meal</p>
            </button>
          );
        })}
      </div>
      {total ? <DailyPlan total={total} /> : (
        <p className="mt-6 rounded-[24px] bg-white/60 p-5 text-sm text-stone-600">Choose a target to preview your daily plan.</p>
      )}
    </div>
  );
}

export function OnboardingPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Preferences>(emptyPreferences);
  const [customText, setCustomText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill when editing preferences later from the profile.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadPreferences(userId)
      .then((p) => { if (active) { setPrefs(p); setCustomText(p.customAllergens.join(', ')); } })
      .catch(() => { /* Start blank; saving will surface any connection problem. */ })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [userId]);

  async function persist(next: Preferences): Promise<boolean> {
    if (!userId) return false;
    setSaving(true);
    setError(null);
    try {
      await savePreferences(userId, next);
      setPrefs(next);
      return true;
    } catch {
      setError('We couldn’t save your choices. Check your connection and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const advance = async (next: Preferences, to: number) => {
    if (await persist(next)) setStep(to);
  };
  const finish = async (next: Preferences) => {
    if (await persist({ ...next, onboarded: true })) navigate('/kitchen', { replace: true });
  };
  const withCustom = (p: Preferences): Preferences => ({ ...p, customAllergens: parseCustomAllergens(customText) });

  if (!userId || !loaded) return <FullPageSpinner />;

  const nav = (label: string, onClick: () => void, primary = false) => (
    <button type="button" onClick={onClick} disabled={saving} className={primary ? 'btn-primary' : 'btn-ghost'}>
      {primary && saving && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
      {label}
    </button>
  );
  const skipLink = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} disabled={saving} className="text-sm font-semibold text-stone-500 underline-offset-4 hover:text-stone-800 hover:underline">
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex justify-center"><Logo /></div>
      <section className="glass p-6 sm:p-10" aria-label="Set up your kitchen">
        <Progress step={step} />

        {step === 0 && (
          <>
            <TasteStep prefs={prefs} onChange={(key, level) => setPrefs((p) => ({ ...p, tastes: { ...p.tastes, [key]: level } }))} />
            <Actions>
              {skipLink('Skip for now', () => advance({ ...prefs, tastes: emptyPreferences().tastes }, 1))}
              {nav('Next: Allergen Shield', () => advance(prefs, 1), true)}
            </Actions>
          </>
        )}

        {step === 1 && (
          <>
            <AllergenStep
              selected={prefs.allergens}
              onToggle={(tag) => setPrefs((p) => ({
                ...p, allergens: p.allergens.includes(tag) ? p.allergens.filter((t) => t !== tag) : [...p.allergens, tag],
              }))}
              customText={customText} onCustomText={setCustomText}
            />
            <Actions>
              {skipLink('Skip, I have no allergies', () => { setCustomText(''); advance({ ...prefs, allergens: [], customAllergens: [] }, 2); })}
              <div className="flex gap-3">
                {nav('Back', () => setStep(0))}
                {nav('Next: Calorie Target', () => advance(withCustom(prefs), 2), true)}
              </div>
            </Actions>
          </>
        )}

        {step === 2 && (
          <>
            <CalorieStep tier={prefs.calorieTier} onSelect={(t) => setPrefs((p) => ({ ...p, calorieTier: t }))} />
            <Actions>
              {skipLink('Skip, no calorie goal', () => finish({ ...prefs, calorieTier: null }))}
              <div className="flex gap-3">
                {nav('Back', () => setStep(1))}
                {nav('Finish & Open Kitchen', () => finish(prefs), true)}
              </div>
            </Actions>
          </>
        )}

        {error && <p role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      </section>
    </main>
  );
}
