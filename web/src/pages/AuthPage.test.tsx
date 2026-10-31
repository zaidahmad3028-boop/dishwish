import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { fakeSession, resetSupabaseMock, setSession, supabase } from '../test/supabaseMock';
import { AuthPage, friendlyAuthError, validate } from './AuthPage';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));

function renderAuth(initial = '/auth') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/onboarding" element={<p>Onboarding screen</p>} />
          <Route path="/kitchen" element={<p>Kitchen screen</p>} />
          <Route path="/" element={<p>Kitchen screen</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const fill = async (label: RegExp, value: string) => userEvent.type(screen.getByLabelText(label), value);

beforeEach(() => resetSupabaseMock());

describe('validate', () => {
  const ok = { email: 'a@b.co', username: 'Ayesha', password: 'longenough', confirm: 'longenough' };
  it('accepts a valid registration', () => expect(validate('register', ok)).toEqual({}));
  it('flags each register field', () => {
    expect(Object.keys(validate('register', { email: 'nope', username: 'a', password: 'short', confirm: 'other' })))
      .toEqual(['email', 'username', 'password', 'confirm']);
  });
  it('only needs email and password to log in', () => {
    expect(validate('login', { ...ok, username: '', confirm: '' })).toEqual({});
  });
});

describe('friendlyAuthError', () => {
  it.each([
    ['User already registered', /already exists/],
    ['Invalid login credentials', /^Incorrect email or password\. Please try again\.$/],
    ['Email not confirmed', /isn’t confirmed yet/],
    ['email rate limit exceeded', /sent too many emails recently/],
    ['Request rate limit reached', /Too many attempts/],
    ['For security purposes, you can only request this after 37 seconds.', /wait 37 seconds/],
    ['Failed to fetch', /Can’t reach the server/],
    ['Error sending confirmation email', /couldn’t send the email right now/],
    ['Error sending recovery email', /couldn’t send the email right now/],
    ['Email link is invalid or has expired', /invalid or has expired/],
    ['Email address "x@y" is invalid', /looks invalid/],
    ['Database error saving new user', /Something went wrong: Database error saving new user/],
    ['', /^Something went wrong\. Please try again\.$/],
  ])('%s', (message, expected) => expect(friendlyAuthError(message)).toMatch(expected));
});

describe('AuthPage', () => {
  it('shows the branding and no website header', async () => {
    renderAuth();
    expect(await screen.findByRole('heading', { name: /cook your dream recipe/i })).toBeInTheDocument();
    expect(screen.getByText(/automated culinary engine/i)).toBeInTheDocument();
    expect(screen.getByText('Taste Profile')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bAI\b/);
  });

  it('shows inline errors and does not call Supabase when the form is invalid', async () => {
    renderAuth();
    await fill(/^email$/i, 'not-an-email');
    await fill(/^password$/i, 'short');
    await fill(/confirm password/i, 'different');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/passwords don’t match/i)).toBeInTheDocument();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('registers with the username in metadata and goes to onboarding', async () => {
    supabase.auth.signUp.mockImplementation(async () => {
      const session = fakeSession();
      setSession(session); // Supabase emits SIGNED_IN before resolving
      return { data: { session, user: session.user }, error: null };
    });
    renderAuth();
    await fill(/^email$/i, ' ayesha@example.com ');
    await fill(/username/i, 'Ayesha');
    await fill(/^password$/i, 'secret123');
    await fill(/confirm password/i, 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Onboarding screen')).toBeInTheDocument();
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'ayesha@example.com', password: 'secret123',
      options: { data: { username: 'Ayesha' }, emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
  });

  it('shows a friendly error when the email is taken', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: new Error('User already registered') });
    renderAuth();
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/username/i, 'Ayesha');
    await fill(/^password$/i, 'secret123');
    await fill(/confirm password/i, 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
  });

  it('logs in and goes to the kitchen', async () => {
    supabase.auth.signInWithPassword.mockImplementation(async () => {
      setSession(fakeSession());
      return { data: {}, error: null };
    });
    renderAuth();
    await userEvent.click(await screen.findByRole('tab', { name: 'Login' }));
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/^password$/i, 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('Kitchen screen')).toBeInTheDocument();
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ayesha@example.com', password: 'secret123' });
  });

  it('redirects an existing session straight to the kitchen', async () => {
    setSession(fakeSession());
    renderAuth();
    expect(await screen.findByText('Kitchen screen')).toBeInTheDocument();
  });

  it('never carries the password over to the Login form', async () => {
    renderAuth();
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/^password$/i, 'secret123');
    await fill(/confirm password/i, 'secret123');
    await userEvent.click(screen.getByRole('tab', { name: 'Login' }));
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('ayesha@example.com');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
  });

  it('shows "Check your inbox" with a timed resend after an email-confirm sign-up', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    renderAuth();
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/username/i, 'Ayesha');
    await fill(/^password$/i, 'secret123');
    await fill(/confirm password/i, 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText(/confirmation link to/)).toHaveTextContent('ayesha@example.com');
    expect(screen.getByRole('button', { name: /resend email in \d+s/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /back to login/i }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
  });

  it('says the password is incorrect and empties the field on a failed login', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('Invalid login credentials') });
    renderAuth();
    await userEvent.click(await screen.findByRole('tab', { name: 'Login' }));
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/^password$/i, 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password. Please try again.');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
  });

  it('offers to resend the confirmation email when the email is not confirmed', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('Email not confirmed') });
    renderAuth('/auth?mode=login');
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/^password$/i, 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn’t confirmed yet/);
    await userEvent.click(screen.getByRole('button', { name: /resend confirmation email/i }));
    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup', email: 'ayesha@example.com', options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
  });

  it('counts down when Supabase asks the user to wait', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {}, error: new Error('For security purposes, you can only request this after 42 seconds.'),
    });
    renderAuth('/auth?mode=login');
    await fill(/^email$/i, 'ayesha@example.com');
    await fill(/^password$/i, 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('wait 42 seconds');
    expect(screen.getByRole('button', { name: /try again in 4\ds/i })).toBeDisabled();
  });

  it('sends a reset link from "Forgot password?"', async () => {
    renderAuth();
    expect(screen.queryByRole('button', { name: /forgot password/i })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('tab', { name: 'Login' }));
    await fill(/^email$/i, 'ayesha@example.com');
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('ayesha@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'ayesha@example.com', { redirectTo: `${window.location.origin}/auth/confirm` });
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText(/link to set a new password/)).toBeInTheDocument();
  });

  it('opens straight on the forgot-password form from ?mode=forgot', async () => {
    renderAuth('/auth?mode=forgot');
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  });

  it('validates the email before sending a reset link', async () => {
    renderAuth();
    await userEvent.click(await screen.findByRole('tab', { name: 'Login' }));
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('toggles password visibility', async () => {
    renderAuth();
    const password = await screen.findByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
