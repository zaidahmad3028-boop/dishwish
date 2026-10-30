import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Flame, Loader2, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { supabase } from '../lib/supabase';

type Mode = 'register' | 'login';
type Field = 'email' | 'username' | 'password' | 'confirm';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[\p{L}\p{N}_.\- ]{3,30}$/u;

export function validate(mode: Mode, values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address, like ayesha@example.com.';
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
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Please try again.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first, then log in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password')) return 'Please choose a stronger password (at least 8 characters).';
  if (m.includes('fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
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

function TextField(props: {
  id: Field; label: string; type?: string; value: string; error?: string; autoComplete: string;
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

export function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('register');
  const [values, setValues] = useState<Record<Field, string>>({ email: '', username: '', password: '', confirm: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Already signed in (e.g. reload on /auth): go straight to the app. Skipped while a
  // submit is in flight so registration can route to onboarding instead.
  if (!loading && session && !busy) return <Navigate to="/kitchen" replace />;

  const errors = validate(mode, values);
  const shown = (f: Field) => ((submitted || touched[f]) ? errors[f] : undefined);
  const set = (f: Field) => (v: string) => { setValues((s) => ({ ...s, [f]: v })); setFormError(null); };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  const switchMode = (next: Mode) => {
    setMode(next); setSubmitted(false); setTouched({}); setFormError(null); setNotice(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setNotice(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const email = values.email.trim();
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email, password: values.password, options: { data: { username: values.username.trim() } },
        });
        if (error) throw error;
        if (data.session) {
          navigate('/onboarding', { replace: true });
          return;
        }
        // Only when "Confirm email" is enabled in Supabase.
        switchMode('login');
        setNotice('Account created. Check your inbox to confirm your email, then log in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: values.password });
        if (error) throw error;
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from !== '/auth' ? from : '/kitchen', { replace: true });
        return;
      }
    } catch (err) {
      setFormError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
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

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-2 lg:px-8">
      <BrandPanel />
      <section className="glass p-6 sm:p-9" aria-labelledby="auth-title">
        <div className="mb-7 grid grid-cols-2 rounded-full bg-stone-900/5 p-1" role="tablist" aria-label="Account">
          {(['register', 'login'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
              className={`rounded-full py-2.5 text-sm font-bold transition ${mode === m ? 'chip-selected shadow-md' : 'text-stone-600 hover:text-stone-900'}`}>
              {m === 'register' ? 'Register' : 'Login'}
            </button>
          ))}
        </div>
        <h2 id="auth-title" className="font-display text-3xl font-extrabold tracking-tight">
          {mode === 'register' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="mt-1 text-stone-600">
          {mode === 'register' ? 'Set up your kitchen in under a minute.' : 'Log in to open your kitchen.'}
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <TextField id="email" label="Email" type="email" autoComplete="email" value={values.email}
            onChange={set('email')} onBlur={blur('email')} error={shown('email')} />
          {mode === 'register' && (
            <TextField id="username" label="Username" autoComplete="username" value={values.username}
              onChange={set('username')} onBlur={blur('username')} error={shown('username')} />
          )}
          <TextField id="password" label="Password" type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={values.password}
            onChange={set('password')} onBlur={blur('password')} error={shown('password')} trailing={eye} />
          {mode === 'register' && (
            <TextField id="confirm" label="Confirm password" type={showPassword ? 'text' : 'password'}
              autoComplete="new-password" value={values.confirm}
              onChange={set('confirm')} onBlur={blur('confirm')} error={shown('confirm')} />
          )}
          {formError && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{formError}</p>}
          {notice && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
            {mode === 'register' ? 'Create account' : 'Log in'}
          </button>
        </form>
      </section>
    </main>
  );
}
