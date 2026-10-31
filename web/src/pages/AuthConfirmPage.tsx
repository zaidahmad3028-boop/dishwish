import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { isEmailOtpType, linkError } from '../lib/authEmail';
import { loadPreferences } from '../lib/preferencesApi';
import { authFlags, supabase } from '../lib/supabase';
import { friendlyAuthError } from './AuthPage';

/**
 * Landing page for every auth email (confirm sign-up, reset password, change email).
 * Preferred link: /auth/confirm?token_hash=…&type=… (our email templates), verified here,
 * so it works on any device. Supabase's default links (?code=… or an error in the URL)
 * are handled too: supabase-js exchanges the code itself (detectSessionInUrl).
 */
export function AuthConfirmPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const started = useRef(false);
  const recovery = useRef(false);

  // Step 1: read the link once (React strict mode runs effects twice; a token works only once).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const failed = linkError(url);
    if (failed) {
      setError(failed.code === 'otp_expired'
        ? 'This link has expired or was already used. Please request a new one.'
        : friendlyAuthError(failed.description || failed.code));
      setVerifying(false);
      return;
    }
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    recovery.current = type === 'recovery';
    if (tokenHash && isEmailOtpType(type)) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: err }) => {
        if (err) setError(/expired|invalid/i.test(err.message)
          ? 'This link has expired or was already used. Please request a new one.'
          : friendlyAuthError(err.message));
        setVerifying(false);
      });
    } else {
      setVerifying(false); // ?code=… or nothing: rely on the session supabase-js restores
    }
  }, []);

  // Step 2: once signed in, send the user where the link meant to take them.
  useEffect(() => {
    if (verifying || loading || error || !session) return;
    if (recovery.current || authFlags.passwordRecovery) {
      authFlags.passwordRecovery = false;
      navigate('/reset-password', { replace: true });
      return;
    }
    loadPreferences(session.user.id)
      .then((prefs) => navigate(prefs.onboarded ? '/kitchen' : '/onboarding', { replace: true }))
      .catch(() => navigate('/kitchen', { replace: true }));
  }, [verifying, loading, error, session, navigate]);

  const waiting = !error && (verifying || loading || session);

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5 py-10">
      <section className="glass w-full p-6 sm:p-9" aria-labelledby="confirm-title">
        <Logo />
        {waiting ? (
          <>
            <h1 id="confirm-title" className="mt-6 font-display text-3xl font-extrabold tracking-tight">Verifying your link</h1>
            <p className="mt-3 flex items-center gap-2 text-stone-600" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" /> One moment…
            </p>
          </>
        ) : (
          <>
            <h1 id="confirm-title" className="mt-6 font-display text-3xl font-extrabold tracking-tight">Link not valid</h1>
            <p role="alert" className="mt-3 text-stone-700">
              {error ?? 'This link is invalid or has expired. Please request a new one.'}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              If you already confirmed your email, you can simply log in.
            </p>
            <div className="mt-6 grid gap-3">
              <Link to="/auth?mode=login" className="btn-primary w-full">Go to login</Link>
              <Link to="/auth?mode=forgot" className="text-center text-sm font-semibold text-rose-700 hover:underline">
                Request a new password reset link
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
