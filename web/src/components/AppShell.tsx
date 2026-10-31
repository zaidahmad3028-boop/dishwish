import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, ChefHat, ChevronDown, Home, Leaf, LogOut, Megaphone, Menu, MessageSquare, Refrigerator, Settings,
  Sparkles, UserRound, Users, Utensils, X, type LucideIcon } from 'lucide-react';
import { signOut, useAuth } from '../auth/AuthProvider';
import { useAccount } from '../auth/AccountProvider';
import { applyTextSize, loadAnnouncement, loadExtraPrefs } from '../lib/accountApi';
import { Avatar } from './ui';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

export const USER_NAV: NavItem[] = [
  { to: '/kitchen', label: 'Kitchen', icon: Home },
  { to: '/select', label: 'Ingredient Selection', icon: Sparkles },
  { to: '/recommendations', label: 'Recommendations', icon: ChefHat },
  { to: '/recipes', label: 'My Recipes', icon: BookOpen },
  { to: '/pantry', label: 'My Pantry', icon: Refrigerator },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: Home, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/ingredients', label: 'Ingredients', icon: Leaf },
  { to: '/admin/recipes', label: 'Recipes', icon: Utensils },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> } | undefined): string {
  const username = user?.user_metadata?.username;
  return (typeof username === 'string' && username.trim()) || user?.email?.split('@')[0] || 'Cook';
}

function Brand({ admin }: { admin: boolean }) {
  return (
    <Link to={admin ? '/admin' : '/kitchen'} className="flex flex-col items-center text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-crimson to-ember text-white shadow-lg shadow-rose-900/20">
        <ChefHat size={30} aria-hidden="true" />
      </span>
      <span className="mt-2 font-display text-2xl font-extrabold tracking-tight">Dish-Wish</span>
      <span className="text-xs font-medium text-stone-600">{admin ? 'Admin Panel' : 'Dream Recipe Creation'}</span>
    </Link>
  );
}

function UserCard({ name, admin, onLogout }: { name: string; admin: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const { account } = useAccount();
  return (
    <div className="relative">
      {open && (
        <div className="card absolute bottom-full left-0 right-0 mb-2 p-2" role="menu" aria-label="Account menu">
          {!admin && <Link to="/profile" role="menuitem" className="nav-link text-sm" onClick={() => setOpen(false)}><UserRound size={18} />My profile</Link>}
          {admin && <Link to="/kitchen" role="menuitem" className="nav-link text-sm" onClick={() => setOpen(false)}><Home size={18} />Open user kitchen</Link>}
          {!admin && account?.role === 'super_admin' && (
            <Link to="/admin" role="menuitem" className="nav-link text-sm" onClick={() => setOpen(false)}><Megaphone size={18} />Admin panel</Link>
          )}
          <button type="button" role="menuitem" className="nav-link w-full text-sm text-rose-700" onClick={onLogout}><LogOut size={18} />Log out</button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="card flex w-full items-center gap-3 p-3 text-left">
        <Avatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block text-xs text-stone-500">{admin ? 'Super Admin' : 'Registered User'}</span>
        </span>
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}

// Fixed sidebar on desktop; a slide-in drawer behind a menu button on small screens.
export function DashboardShell({ nav, admin = false }: { nav: NavItem[]; admin?: boolean }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const name = displayName(session?.user);
  const userId = session?.user.id;

  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (admin || !userId) return;
    loadAnnouncement().then(setAnnouncement).catch(() => setAnnouncement(''));
    loadExtraPrefs(userId).then((p) => applyTextSize(p.textSize)).catch(() => {});
  }, [admin, userId]);

  const logout = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <Brand admin={admin} />
      <nav aria-label="Main" className="flex-1">
        <ul className="flex flex-col gap-1.5">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={21} aria-hidden="true" />{label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <UserCard name={name} admin={admin} onLogout={logout} />
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/70 bg-white/45 backdrop-blur-xl lg:block">{sidebar}</aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/70 bg-white/80 px-4 py-2 backdrop-blur lg:hidden">
        <button type="button" className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22} /></button>
        <span className="font-display text-lg font-extrabold">Dish-Wish</span>
        <Link to={admin ? '/admin/settings' : '/profile'} aria-label="Your profile"><Avatar name={name} size={34} /></Link>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-stone-900/40" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-cream shadow-2xl">
            <button type="button" className="icon-btn absolute right-3 top-3" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={20} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {announcement && <p role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">{announcement}</p>}
        <Outlet />
      </main>
    </div>
  );
}

export function AppShell() {
  return <DashboardShell nav={USER_NAV} />;
}

export function AdminShell() {
  return <DashboardShell nav={ADMIN_NAV} admin />;
}
