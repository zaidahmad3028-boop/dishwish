import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { supabase } from '../lib/supabase';
import { TextField, friendlyAuthError } from './AuthPage';

export function validateNewPassword(password: string, confirm: string) {
  const errors: { password?: string; confirm?: string } = {};
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  if (!confirm) errors.confirm = 'Please confirm your password.';
  else if (confirm !== password) errors.confirm = 'Passwords don’t match.';
  return errors;
}

// Landing page for the reset link: Supabase signs the user in from the URL
// (detectSessionInUrl), then we let them choose a new password.
export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = validateNewPassword(password, confirm);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(friendlyAuthError(err.message));
      setBusy(false);
      return;
    }
    navigate('/kitchen', { replace: true });
  }

  const eye = (
    <button type="button" onClick={() => setShow((s) => !s)}
      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-stone-500 hover:text-stone-800"
      aria-label={show ? 'Hide password' : 'Show password'}>
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5 py-10">
      <section className="glass w-full p-6 sm:p-9" aria-labelledby="reset-title">
        <Logo />
        <h1 id="reset-title" className="mt-6 font-display text-3xl font-extrabold tracking-tight">Set a new password</h1>
        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-stone-600"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Checking your link…</p>
        ) : !session ? (
          <div className="mt-3 space-y-4">
            <p role="alert" className="text-stone-700">This reset link is invalid or has expired. Please request a new one.</p>
            <Link to="/auth" className="btn-primary w-full">Back to login</Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <p className="text-stone-600">For {session.user.email}</p>
            <TextField id="new-password" label="New password" type={show ? 'text' : 'password'} autoComplete="new-password"
              value={password} onChange={(v) => { setPassword(v); setError(null); }} onBlur={() => {}}
              error={submitted ? errors.password : undefined} trailing={eye} />
            <TextField id="confirm-new-password" label="Confirm new password" type={show ? 'text' : 'password'} autoComplete="new-password"
              value={confirm} onChange={(v) => { setConfirm(v); setError(null); }} onBlur={() => {}}
              error={submitted ? errors.confirm : undefined} />
            {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
              Save new password
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
