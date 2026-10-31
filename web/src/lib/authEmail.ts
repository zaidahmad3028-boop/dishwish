import { useEffect, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Where every auth email link lands. Add `<origin>/**` to Supabase Redirect URLs. */
export const authConfirmUrl = () => `${window.location.origin}/auth/confirm`;

/** Seconds before Supabase allows another email to the same address. */
export const EMAIL_COOLDOWN_S = 60;

/** "For security purposes, you can only request this after 37 seconds." → 37 */
export function waitSeconds(message: string): number | null {
  const m = /after (\d+) seconds?/i.exec(message);
  return m ? Number(m[1]) : null;
}

export async function sendConfirmationEmail(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authConfirmUrl() } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authConfirmUrl() });
  if (error) throw error;
}

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];
export const isEmailOtpType = (t: string | null): t is EmailOtpType => OTP_TYPES.includes(t as EmailOtpType);

/** Error Supabase puts in the redirect URL (query or hash), e.g. an expired link. */
export function linkError(url: URL): { code: string; description: string } | null {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (k: string) => url.searchParams.get(k) ?? hash.get(k);
  const description = get('error_description');
  const code = get('error_code') ?? get('error');
  return description || code ? { code: code ?? '', description: (description ?? '').replace(/\+/g, ' ') } : null;
}

/** A countdown that disables "resend" buttons; start(n) begins it. */
export function useCooldown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: (seconds: number = EMAIL_COOLDOWN_S) => setLeft(seconds) };
}
