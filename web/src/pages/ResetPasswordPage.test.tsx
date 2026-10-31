import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { fakeSession, resetSupabaseMock, setSession, supabase } from '../test/supabaseMock';
import { ResetPasswordPage, validateNewPassword } from './ResetPasswordPage';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));

const renderReset = () => render(
  <MemoryRouter initialEntries={['/reset-password']}>
    <AuthProvider>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/kitchen" element={<p>Kitchen screen</p>} />
        <Route path="/auth" element={<p>Auth screen</p>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>,
);

beforeEach(() => resetSupabaseMock());

describe('validateNewPassword', () => {
  it('needs 8+ characters and a matching confirmation', () => {
    expect(validateNewPassword('short', '')).toEqual({ password: 'Use at least 8 characters.', confirm: 'Please confirm your password.' });
    expect(validateNewPassword('longenough', 'other')).toEqual({ confirm: 'Passwords don’t match.' });
    expect(validateNewPassword('longenough', 'longenough')).toEqual({});
  });
});

describe('ResetPasswordPage', () => {
  it('explains an invalid or expired link', async () => {
    renderReset();
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/);
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/auth?mode=forgot');
    await userEvent.click(screen.getByRole('link', { name: /back to login/i }));
    expect(screen.getByText('Auth screen')).toBeInTheDocument();
  });

  it('saves the new password and opens the kitchen', async () => {
    setSession(fakeSession());
    renderReset();
    await userEvent.type(await screen.findByLabelText('New password'), 'brandnew123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brandnew123');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'brandnew123' });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(await screen.findByText('Kitchen screen')).toBeInTheDocument();
  });

  it('blocks mismatched passwords and shows Supabase errors', async () => {
    setSession(fakeSession());
    supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error: new Error('New password should be different from the old password.') });
    renderReset();
    await userEvent.type(await screen.findByLabelText('New password'), 'brandnew123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different1');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Confirm new password'));
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brandnew123');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
