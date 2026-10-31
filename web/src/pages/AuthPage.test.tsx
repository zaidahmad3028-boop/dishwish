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
    ['Invalid login credentials', /don’t match/],
    ['Email rate limit exceeded', /Too many attempts/],
    ['Failed to fetch', /Can’t reach the server/],
    ['Error sending confirmation email', /couldn’t send the confirmation email.*Confirm email/],
    ['Email address not authorized', /couldn’t send the confirmation email/],
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
      email: 'ayesha@example.com', password: 'secret123', options: { data: { username: 'Ayesha' } },
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

  it('toggles password visibility', async () => {
    renderAuth();
    const password = await screen.findByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
