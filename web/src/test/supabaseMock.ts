// In-memory stand-in for the supabase-js client used by component tests.
// Usage: vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type Listener = (event: string, session: Session | null) => void;
const listeners = new Set<Listener>();
let current: Session | null = null;

export const fakeSession = (username = 'Ayesha'): Session => ({
  access_token: 'token', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer',
  user: {
    id: 'user-1', email: 'ayesha@example.com', aud: 'authenticated', app_metadata: {},
    user_metadata: { username }, created_at: '2026-01-01T00:00:00Z',
  },
}) as Session;

export function setSession(session: Session | null) {
  current = session;
  listeners.forEach((l) => l(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

export const supabaseConfigured = true;
export const authFlags = { passwordRecovery: false };

export const supabase = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(async (): Promise<{ data: object; error: Error | null }> => ({ data: {}, error: null })),
    resend: vi.fn(async (): Promise<{ data: object; error: Error | null }> => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async (): Promise<{ data: object; error: Error | null }> => ({ data: {}, error: null })),
    updateUser: vi.fn(async (): Promise<{ data: object; error: Error | null }> => ({ data: {}, error: null })),
    signOut: vi.fn(async (opts?: { scope?: string }) => { if (opts?.scope !== 'others') setSession(null); return { error: null }; }),
  },
};

export function resetSupabaseMock() {
  current = null;
  listeners.clear();
  supabase.auth.signUp.mockReset();
  supabase.auth.signInWithPassword.mockReset();
  supabase.auth.resetPasswordForEmail.mockClear();
  supabase.auth.updateUser.mockClear();
  supabase.auth.resend.mockClear();
  supabase.auth.verifyOtp.mockClear();
  authFlags.passwordRecovery = false;
  supabase.auth.signOut.mockClear();
}
