import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Flame, Loader2, MailCheck, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import {
  EMAIL_COOLDOWN_S, authConfirmUrl, sendConfirmationEmail, sendPasswordReset, useCooldown, waitSeconds,
} from '../lib/authEmail';
import { supabase } from '../lib/supabase';

export type Mode = 'register' | 'login' | 'forgot';
type Field = 'email' | 'username' | 'password' | 'confirm';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[\p{L}\p{N}_.\- ]{3,30}$/u;

export function validate(mode: Mode, values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address, like ayesha@example.com.';
  if (mode === 'forgot') return errors;
  if (mode === 'login') {
    if (!values.password) errors.password = 'Enter your password.';
    return errors;
  }
  if (!USERNAME_RE.test(values.username.trim())) {
    errors.username = 'Use 3–30 letters, numbers, spaces, dots, dashes or underscores.';
  }
  if (values.password.length < 8) errors.password = 'Use at least 8 characters.';
  if (!values.confirm) errors.confirm = 'Please confirm your password.';
  else if (values.confirm !== values.password) errors.confirm = 'Passwords don’t match.';
  return errors;
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  const wait = waitSeconds(message);
  if (wait) return `For your security, please wait ${wait} seconds before trying again.`;
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  // Supabase deliberately doesn't say whether the email or the password was wrong.
  if (m.includes('invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (m.includes('email not confirmed')) {
    return 'Your email isn’t confirmed yet. Open the link we emailed you, or send a new one.';
  }
  if (m.includes('email rate limit')) return 'We’ve sent too many emails recently. Please try again a little later.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('error sending') || m.includes('sending confirmation') || m.includes('sending recovery') || m.includes('not authorized')) {
    return 'We couldn’t send the email right now. Please try again in a few minutes.';
  }
  if (m.includes('expired') || m.includes('invalid') && m.includes('link')) return 'This link is invalid or has expired. Please request a new one.';
  if (m.includes('email') && m.includes('invalid')) return 'That email address looks invalid. Please check it.';
  if (m.includes('should be different')) return 'Your new password must be different from your current one.';
  if (m.includes('password')) return 'Please choose a stronger password (at least 8 characters).';
  if (m.includes('fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection and try again.';
  const detail = message.trim().slice(0, 160);
  return detail ? `Something went wrong: ${detail}` : 'Something went wrong. Please try again.';
}

function FoodPlate() {
  const garnish = [
    ['🌶️', 'left-[6%] top-[18%]'], ['🍅', 'right-[4%] top-[12%]'], ['🧄', 'right-[0%] bottom-[22%]'],
    ['🍋', 'left-[10%] bottom-[8%]'], ['🧅', 'left-[-2%] top-[52%]'], ['🥬', 'right-[22%] bottom-[-2%]'],
  ];
  return (
    <div role="img" aria-label="A plate of karahi surrounded by fresh ingredients" className="relative mx-auto aspect-square w-56 sm:w-64">
      <div className="absolute inset-[12%] rounded-full bg-white shadow-2xl shadow-rose-900/20 ring-8 ring-white/60" />
      <div className="absolute inset-[22%] grid place-items-center rounded-full bg-gradient-to-br from-orange-100 to-rose-100 text-7xl">🍛</div>
      {garnish.map(([emoji, pos]) => (
        <span key={emoji} className={`absolute text-3xl drop-shadow-md ${pos}`} aria-hidden="true">{emoji}</span>
      ))}
    </div>
  );
}

function BrandPanel() {
  const chips: [ReactNode, string][] = [
    [<Flame size={14} key="t" />, 'Taste Profile'],
    [<ShieldCheck size={14} key="a" />, 'Allergen Shield'],
    [<Target size={14} key="c" />, 'Calorie Target'],
  ];
  return (
    <section className="flex flex-col justify-center gap-6 px-1 lg:pr-6">
      <Logo />
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/80 bg-white/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-rose-800 backdrop-blur">
        <Sparkles size={14} aria-hidden="true" /> Automated Culinary Engine
      </span>
      <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
        Cook Your <span className="text-gradient">Dream Recipe</span>
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-stone-700">
        Turn the ingredients already in your kitchen into personalised Pakistani recipes, made for your taste,
        your allergies and your calorie goals.
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="What we tailor for you">
        {chips.map(([icon, label]) => (
          <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-sm font-semibold text-stone-800 shadow-sm">
            <span className="text-rose-700">{icon}</span>{label}
          </li>
        ))}
      </ul>
      <div className="hidden lg:block"><FoodPlate /></div>
    </section>
  );
}

export function TextField(props: {
  id: string; label: string; type?: string; value: string; error?: string; autoComplete: string;
  onChange: (v: string) => void; onBlur: () => void; trailing?: ReactNode;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div>
      <label htmlFor={props.id} className="mb-1.5 block text-sm font-semibold text-stone-800">{props.label}</label>
      <div className="relative">
        <input
          id={props.id} type={props.type ?? 'text'} value={props.value} autoComplete={props.autoComplete}
          onChange={(e) => props.onChange(e.target.value)} onBlur={props.onBlur}
          aria-invalid={props.error ? 'true' : 'false'} aria-describedby={props.error ? errorId : undefined}
          className={`field ${props.trailing ? 'pr-12' : ''}`}
        />
        {props.trailing}
      </div>
      {props.error && <p id={errorId} className="mt-1.5 text-sm font-medium text-rose-700">{props.error}</p>}
    </div>
  );
}

type Sent = { kind: 'signup' | 'reset'; email: string };

/** "Check your inbox" panel shown after a confirmation or reset email is sent. */
function EmailSent({ sent, onBack }: { sent: Sent; onBack: () => void }) {
  const cooldown = useCooldown();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => cooldown.start(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      await (sent.kind === 'signup' ? sendConfirmationEmail(sent.email) : sendPasswordReset(sent.email));
      setMessage({ ok: true, text: 'Sent again. It can take a minute to arrive.' });
      cooldown.start();
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      cooldown.start(waitSeconds(text) ?? EMAIL_COOLDOWN_S);
      setMessage({ ok: false, text: friendlyAuthError(text) });
    }
    setBusy(false);
  }

  return (
    <div>
      <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100 text-rose-700">
        <MailCheck size={28} aria-hidden="true" />
      </span>
      <h2 id="auth-title" className="mt-5 font-display text-3xl font-extrabold tracking-tight">Check your inbox</h2>
      <p className="mt-2 text-stone-700">
        {sent.kind === 'signup'
          ? <>We sent a confirmation link to <strong>{sent.email}</strong>. Open it to activate your account.</>
          : <>If an account exists for <strong>{sent.email}</strong>, we sent a link to set a new password.</>}
      </p>
      <p className="mt-2 text-sm text-stone-500">The link works once and expires after 1 hour. Not there? Check your spam or promotions folder.</p>
      {message && (
        <p role={message.ok ? 'status' : 'alert'}
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${message.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {message.text}
        </p>
      )}
      <button type="button" className="btn-primary mt-6 w-full" onClick={resend} disabled={busy || cooldown.left > 0}>
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
        {cooldown.left > 0 ? `Resend email in ${cooldown.left}s` : 'Resend email'}
      </button>
      <button type="button" onClick={onBack}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
        <ArrowLeft size={16} aria-hidden="true" /> Back to login
      </button>
    </div>
  );
}

export function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => {
    const m = params.get('mode');
    return m === 'login' || m === 'forgot' ? m : 'register';
  });
  const [values, setValues] = useState<Record<Field, string>>({ email: '', username: '', password: '', confirm: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const cooldown = useCooldown();

  // Already signed in (e.g. reload on /auth): go straight to the app. Skipped while a
  // submit is in flight so registration can route to onboarding instead.
  if (!loading && session && !busy) return <Navigate to="/kitchen" replace />;

  const errors = validate(mode, values);
  const shown = (f: Field) => ((submitted || touched[f]) ? errors[f] : undefined);
  const set = (f: Field) => (v: string) => { setValues((s) => ({ ...s, [f]: v })); setFormError(null); setUnconfirmed(false); };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  // Passwords never carry over between forms; the email does.
  const switchMode = (next: Mode) => {
    setMode(next); setSubmitted(false); setTouched({}); setFormError(null); setUnconfirmed(false); setSent(null);
    setShowPassword(false);
    setValues((s) => ({ ...s, password: '', confirm: '' }));
  };

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const wait = waitSeconds(message);
    if (wait) cooldown.start(wait);
    setUnconfirmed(/email not confirmed/i.test(message));
    setFormError(friendlyAuthError(message));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length || cooldown.left > 0) return;
    setBusy(true);
    setFormError(null);
    setUnconfirmed(false);
    const email = values.email.trim();
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email);
        setSent({ kind: 'reset', email });
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email, password: values.password,
          options: { data: { username: values.username.trim() }, emailRedirectTo: authConfirmUrl() },
        });
        if (error) throw error;
        if (data.session) {
          navigate('/onboarding', { replace: true });
          return;
        }
        // "Confirm email" is on: the account exists but waits for the email link.
        setValues((s) => ({ ...s, password: '', confirm: '' }));
        setSent({ kind: 'signup', email });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: values.password });
        if (error) {
          setValues((s) => ({ ...s, password: '' }));
          throw error;
        }
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from !== '/auth' ? from : '/kitchen', { replace: true });
        return;
      }
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  async function resendConfirmation() {
    setBusy(true);
    try {
      await sendConfirmationEmail(values.email.trim());
      setSent({ kind: 'signup', email: values.email.trim() });
      setFormError(null);
      setUnconfirmed(false);
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  const eye = (
    <button type="button" onClick={() => setShowPassword((s) => !s)}
      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-stone-500 hover:text-stone-800"
      aria-label={showPassword ? 'Hide password' : 'Show password'}>
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  const submitLabel = { register: 'Create account', login: 'Log in', forgot: 'Send reset link' }[mode];

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-2 lg:px-8">
      <BrandPanel />
      <section className="glass p-6 sm:p-9" aria-labelledby="auth-title">
        {sent ? <EmailSent sent={sent} onBack={() => switchMode('login')} /> : (
          <>
            {mode === 'forgot' ? (
              <button type="button" onClick={() => switchMode('login')}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
                <ArrowLeft size={16} aria-hidden="true" /> Back to login
              </button>
            ) : (
              <div className="mb-7 grid grid-cols-2 rounded-full bg-stone-900/5 p-1" role="tablist" aria-label="Account">
                {(['register', 'login'] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                    className={`rounded-full py-2.5 text-sm font-bold transition ${mode === m ? 'chip-selected shadow-md' : 'text-stone-600 hover:text-stone-900'}`}>
                    {m === 'register' ? 'Register' : 'Login'}
                  </button>
                ))}
              </div>
            )}
            <h2 id="auth-title" className="font-display text-3xl font-extrabold tracking-tight">
              {{ register: 'Create your account', login: 'Welcome back', forgot: 'Reset your password' }[mode]}
            </h2>
            <p className="mt-1 text-stone-600">
              {{
                register: 'Set up your kitchen in under a minute.',
                login: 'Log in to open your kitchen.',
                forgot: 'Enter your account email and we’ll send you a link to set a new password.',
              }[mode]}
            </p>
            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              <TextField id="email" label="Email" type="email" autoComplete="email" value={values.email}
                onChange={set('email')} onBlur={blur('email')} error={shown('email')} />
              {mode === 'register' && (
                <TextField id="username" label="Username" autoComplete="username" value={values.username}
                  onChange={set('username')} onBlur={blur('username')} error={shown('username')} />
              )}
              {mode !== 'forgot' && (
                <TextField id="password" label="Password" type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={values.password}
                  onChange={set('password')} onBlur={blur('password')} error={shown('password')} trailing={eye} />
              )}
              {mode === 'login' && (
                <div className="-mt-1 text-right">
                  <button type="button" onClick={() => switchMode('forgot')} className="text-sm font-semibold text-rose-700 hover:text-rose-900 hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}
              {mode === 'register' && (
                <TextField id="confirm" label="Confirm password" type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password" value={values.confirm}
                  onChange={set('confirm')} onBlur={blur('confirm')} error={shown('confirm')} />
              )}
              {formError && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                  {formError}
                  {unconfirmed && (
                    <button type="button" onClick={resendConfirmation} disabled={busy}
                      className="mt-2 block font-bold text-rose-900 underline hover:no-underline">
                      Resend confirmation email
                    </button>
                  )}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={busy || cooldown.left > 0}>
                {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                {cooldown.left > 0 ? `Try again in ${cooldown.left}s` : submitLabel}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
