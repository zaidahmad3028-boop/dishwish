import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BookOpen, ChefHat, ChevronDown, Home, Leaf, LogOut, Megaphone, Menu, MessageSquare, Refrigerator, Settings,
  Sparkles, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { signOut, useAuth } from '../auth/AuthProvider';
import { useAccount } from '../auth/AccountProvider';
import { applyTextSize, loadAnnouncement, loadExtraPrefs } from '../lib/accountApi';
import { listFeedback } from '../lib/adminApi';
import { Avatar, ChefHatMark } from './ui';

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
  { to: '/admin/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> } | undefined): string {
  const username = user?.user_metadata?.username;
  return (typeof username === 'string' && username.trim()) || user?.email?.split('@')[0] || 'Cook';
}

// The profile photo URL (uploaded to R2 from the Profile page), if any.
export function avatarUrl(user: { user_metadata?: Record<string, unknown> } | undefined): string | null {
  const url = user?.user_metadata?.avatar_url;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

function Brand({ admin }: { admin: boolean }) {
  return (
    <Link to={admin ? '/admin' : '/kitchen'} className="flex flex-col items-center text-center">
      <ChefHatMark className="h-14 w-16" />
      <span className="mt-1 font-display text-[1.9rem] font-extrabold leading-tight tracking-tight">Dish-Wish</span>
      <span className="text-[0.95rem] text-stone-700">{admin ? 'Admin Panel' : 'Dream Recipe Creation'}</span>
    </Link>
  );
}

// Bell and avatar, top right of every page. The number counts real notices only: the announcement for users, open feedback for admins.
function TopActions({ name, photo, admin, announcement, openFeedback }: { name: string; photo: string | null; admin: boolean; announcement: string; openFeedback: number }) {
  const [open, setOpen] = useState(false);
  const count = admin ? openFeedback : announcement ? 1 : 0;
  const message = admin ? (openFeedback ? `${openFeedback} feedback item${openFeedback === 1 ? '' : 's'} waiting for review.` : '') : announcement;
  return (
    <div className="absolute right-5 top-5 z-20 hidden items-center gap-6 lg:flex">
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={count ? `Notifications, ${count} new` : 'Notifications'}
          className="relative grid h-12 w-12 place-items-center rounded-full bg-white/70 text-ink shadow-sm transition hover:bg-white">
          <Bell size={26} aria-hidden="true" />
          {count > 0 && <span className="absolute right-1 top-0.5 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-crimson px-0.5 text-[0.7rem] font-bold text-white">{count > 99 ? '99+' : count}</span>}
        </button>
        {open && (
          <div role="status" className="card absolute right-0 top-full mt-2 w-72 p-4 text-sm">
            {message || 'No new notifications.'}
          </div>
        )}
      </div>
      <Link to={admin ? '/admin/settings' : '/profile'} aria-label="Your profile"><Avatar name={name} size={54} src={photo} /></Link>
    </div>
  );
}

function UserCard({ name, photo, admin, onLogout }: { name: string; photo: string | null; admin: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const { account } = useAccount();
  return (
    <div className="relative">
      {open && (
        <div className="card absolute bottom-full left-0 right-0 mb-2 p-2" role="menu" aria-label="Account menu">
          {!admin && <Link to="/profile" role="menuitem" className="nav-link text-sm" onClick={() => setOpen(false)}><UserRound size={18} />My profile</Link>}
          {!admin && account?.role === 'super_admin' && (
            <Link to="/admin" role="menuitem" className="nav-link text-sm" onClick={() => setOpen(false)}><Megaphone size={18} />Admin panel</Link>
          )}
          <button type="button" role="menuitem" className="nav-link w-full text-sm text-rose-700" onClick={onLogout}><LogOut size={18} />Log out</button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="card flex w-full items-center gap-2.5 px-3 py-3 text-left">
        <Avatar name={name} src={photo} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold">{name}</span>
          <span className="block whitespace-nowrap text-sm text-stone-600">{admin || account?.role === 'super_admin' ? 'Super Admin' : 'Registered User'}</span>
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
  const [openFeedback, setOpenFeedback] = useState(0);
  const name = displayName(session?.user);
  const photo = avatarUrl(session?.user);
  const userId = session?.user.id;
  // The designs give only the Kitchen and Ingredient Selection the wider sidebar.
  const wideSidebar = !admin && ['/kitchen', '/select'].includes(location.pathname);

  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (!admin) return;
    listFeedback('', '', '', 1, 1).then((r) => setOpenFeedback(Number(r.counts?.open ?? 0))).catch(() => setOpenFeedback(0));
  }, [admin, location.pathname]);
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
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-[0.95rem] pb-5 pt-5">
      <Brand admin={admin} />
      <nav aria-label="Main" className="flex-1">
        <ul className="flex flex-col gap-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={27} strokeWidth={1.7} className="shrink-0" aria-hidden="true" />{label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <UserCard name={name} photo={photo} admin={admin} onLogout={logout} />
    </div>
  );

  return (
    <div className={`relative min-h-dvh ${wideSidebar ? 'lg:pl-[17rem]' : 'lg:pl-[14.8rem]'}`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden rounded-r-[1.75rem] border-r border-white/70 bg-white/40 backdrop-blur-md lg:block ${wideSidebar ? 'w-[17rem]' : 'w-[14.8rem]'} ${!admin && !wideSidebar ? '[&_.nav-link]:!gap-2.5 [&_.nav-link]:!px-2.5 [&_.nav-link]:!text-[1.04rem]' : ''}`}>{sidebar}</aside>
      <TopActions name={name} photo={photo} admin={admin} announcement={announcement} openFeedback={openFeedback} />
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/70 bg-white/80 px-4 py-2 backdrop-blur lg:hidden">
        <button type="button" className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22} /></button>
        <span className="font-display text-lg font-extrabold">Dish-Wish</span>
        <Link to={admin ? '/admin/settings' : '/profile'} aria-label="Your profile"><Avatar name={name} size={34} src={photo} /></Link>
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
      <main className={`px-4 pb-10 pt-5 sm:px-6 lg:pl-[1.3rem] lg:pr-[1.2rem] lg:pt-4 ${admin ? 'tight-page' : ''}`}>
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
