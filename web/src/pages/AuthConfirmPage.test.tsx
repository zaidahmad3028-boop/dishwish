import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { linkError, waitSeconds } from '../lib/authEmail';
import { emptyPreferences } from '../lib/preferences';
import { loadPreferences } from '../lib/preferencesApi';
import { authFlags, fakeSession, resetSupabaseMock, setSession, supabase } from '../test/supabaseMock';
import { AuthConfirmPage } from './AuthConfirmPage';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(), savePreferences: vi.fn() }));

function renderConfirm(path: string) {
  window.history.replaceState({}, '', path); // the page reads the real URL, like supabase-js
  return render(
    <MemoryRouter initialEntries={['/auth/confirm']}>
      <AuthProvider>
        <Routes>
          <Route path="/auth/confirm" element={<AuthConfirmPage />} />
          <Route path="/onboarding" element={<p>Onboarding screen</p>} />
          <Route path="/kitchen" element={<p>Kitchen screen</p>} />
          <Route path="/reset-password" element={<p>Reset screen</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const signInOnVerify = () => supabase.auth.verifyOtp.mockImplementationOnce(async () => {
  setSession(fakeSession());
  return { data: {}, error: null };
});

beforeEach(() => {
  resetSupabaseMock();
  vi.mocked(loadPreferences).mockResolvedValue({ ...emptyPreferences(), onboarded: false });
});
afterEach(() => window.history.replaceState({}, '', '/'));

describe('helpers', () => {
  it('reads the wait time and link errors', () => {
    expect(waitSeconds('For security purposes, you can only request this after 9 seconds.')).toBe(9);
    expect(waitSeconds('Invalid login credentials')).toBeNull();
    expect(linkError(new URL('http://x/auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')))
      .toEqual({ code: 'otp_expired', description: 'Email link is invalid' });
    expect(linkError(new URL('http://x/auth/confirm?token_hash=a&type=email'))).toBeNull();
  });
});

describe('AuthConfirmPage', () => {
  it('verifies a sign-up link and starts onboarding for a new user', async () => {
    signInOnVerify();
    renderConfirm('/auth/confirm?token_hash=hash123&type=email');
    expect(await screen.findByText('Onboarding screen')).toBeInTheDocument();
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'email' });
  });

  it('sends an onboarded user to the kitchen', async () => {
    vi.mocked(loadPreferences).mockResolvedValue({ ...emptyPreferences(), onboarded: true });
    signInOnVerify();
    renderConfirm('/auth/confirm?token_hash=hash123&type=signup');
    expect(await screen.findByText('Kitchen screen')).toBeInTheDocument();
  });

  it('sends a recovery link to the new-password page', async () => {
    signInOnVerify();
    renderConfirm('/auth/confirm?token_hash=hash456&type=recovery');
    expect(await screen.findByText('Reset screen')).toBeInTheDocument();
  });

  it('follows a default Supabase link (?code=) using the recovery event', async () => {
    authFlags.passwordRecovery = true;
    setSession(fakeSession());
    renderConfirm('/auth/confirm?code=abc');
    expect(await screen.findByText('Reset screen')).toBeInTheDocument();
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('explains an expired or used link', async () => {
    renderConfirm('/auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(await screen.findByRole('alert')).toHaveTextContent('expired or was already used');
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/auth?mode=login');
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('reports a token that fails verification', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('Token has expired or is invalid') });
    renderConfirm('/auth/confirm?token_hash=old&type=email');
    expect(await screen.findByRole('alert')).toHaveTextContent('expired or was already used');
  });

  it('treats a bare visit as an invalid link', async () => {
    renderConfirm('/auth/confirm');
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/);
  });
});
