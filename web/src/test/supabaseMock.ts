// In-memory stand-in for the supabase-js client used by component tests.
// Usage: vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type Listener = (event: string, session: Session | null) => void;
const listeners = new Set<Listener>();
let current: Session | null = null;
let accountRole: 'user' | 'super_admin' = 'user';
export const setAccountRole = (role: 'user' | 'super_admin') => { accountRole = role; };

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

// Chainable stand-in for supabase.from(...): every query resolves to an empty result.
// Tests that care about data mock the lib/*Api modules instead.
function emptyQuery(): Record<string, unknown> {
  const result = { data: [], error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'order', 'limit', 'range', 'gte', 'lte']) builder[m] = () => builder;
  builder.maybeSingle = async () => ({ data: null, error: null });
  builder.single = async () => ({ data: null, error: null });
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

export const supabase = {
  from: vi.fn(() => emptyQuery()),
  rpc: vi.fn(async (fn: string): Promise<{ data: unknown; error: { message: string; code?: string } | null }> =>
    (fn === 'my_account' ? { data: { role: accountRole, status: 'active' }, error: null } : { data: [], error: null })),
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
  accountRole = 'user';
  supabase.rpc.mockClear();
  supabase.from.mockClear();
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
