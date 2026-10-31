import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { loadAccount, touchLastSeen, type Account } from '../lib/accountApi';
import { signOut, useAuth } from './AuthProvider';
import { FullPageSpinner } from './RequireAuth';

interface AccountState { account: Account | null; error: string; refresh: () => void }
const AccountContext = createContext<AccountState>({ account: null, error: '', refresh: () => {} });

// Role and status come from the database (my_account RPC). The UI uses them for routing only;
// every admin action is enforced again by RLS and the admin RPCs.
export function AccountProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) { setAccount(null); return; }
    let live = true;
    setError('');
    loadAccount()
      .then((a) => { if (live) setAccount(a); })
      .catch((e: Error) => { if (live) { setError(e.message); setAccount({ role: 'user', status: 'active' }); } });
    touchLastSeen(userId);
    return () => { live = false; };
  }, [userId, nonce]);

  return <AccountContext.Provider value={{ account, error, refresh }}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);

export function DeactivatedNotice() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <section className="card max-w-md p-8 text-center">
        <ShieldAlert size={40} className="mx-auto text-crimson" aria-hidden="true" />
        <h1 className="mt-3 font-display text-2xl font-extrabold">Account deactivated</h1>
        <p className="mt-2 text-stone-600">An administrator has deactivated this account, so your kitchen data is unavailable. Contact the Dish-Wish team if you think this is a mistake.</p>
        <button type="button" className="btn-primary mt-5" onClick={() => signOut()}>Log out</button>
      </section>
    </main>
  );
}

// Registered-user area: admins are sent to their dashboard, deactivated users see a notice.
export function RequireUser() {
  const { account } = useAccount();
  if (!account) return <FullPageSpinner />;
  if (account.status === 'deactivated') return <DeactivatedNotice />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { account } = useAccount();
  if (!account) return <FullPageSpinner />;
  if (account.role !== 'super_admin') return <Navigate to="/kitchen" replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const { account } = useAccount();
  if (!account) return <FullPageSpinner />;
  return <Navigate to={account.role === 'super_admin' ? '/admin' : '/kitchen'} replace />;
}
