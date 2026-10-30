import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, CookingPot, LogOut, Refrigerator, UserRound, type LucideIcon } from 'lucide-react';
import { signOut, useAuth } from '../auth/AuthProvider';
import { LogoMark } from './Logo';

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/kitchen', label: 'Kitchen', icon: CookingPot },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/pantry', label: 'Pantry', icon: Refrigerator },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> } | undefined): string {
  const username = user?.user_metadata?.username;
  return (typeof username === 'string' && username.trim()) || user?.email?.split('@')[0] || 'Cook';
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 font-bold text-white shadow-md" aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// No top navbar: a slim icon rail on the left (desktop) that becomes a bottom tab bar on mobile.
export function AppShell() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const name = displayName(session?.user);

  const logout = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group relative grid h-12 w-12 place-items-center rounded-2xl transition ${isActive ? 'chip-selected shadow-lg shadow-rose-900/20' : 'text-stone-600 hover:bg-white/80 hover:text-stone-900'}`;

  return (
    <div className="min-h-dvh md:pl-24">
      <nav aria-label="Main" className="glass fixed inset-y-4 left-4 z-30 hidden w-[4.5rem] flex-col items-center py-4 md:flex">
        <LogoMark size={44} />
        <ul className="mt-8 flex flex-1 flex-col gap-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} className={linkClass} aria-label={label} title={label}>
                <Icon size={22} aria-hidden="true" />
                <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {label}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-3">
          <span title={name}><Avatar name={name} /></span>
          <button type="button" onClick={logout} aria-label="Log out" title="Log out"
            className="grid h-10 w-10 place-items-center rounded-2xl text-stone-600 transition hover:bg-rose-50 hover:text-rose-700">
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-5 pb-28 pt-6 md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      <nav aria-label="Main" className="glass fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[24px] px-2 py-2 md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-semibold ${isActive ? 'text-rose-700' : 'text-stone-500'}`}>
            <Icon size={22} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
        <button type="button" onClick={logout} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[11px] font-semibold text-stone-500">
          <LogOut size={22} aria-hidden="true" />
          Log out
        </button>
      </nav>
    </div>
  );
}
