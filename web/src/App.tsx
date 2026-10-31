import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccountProvider, HomeRedirect, RequireAdmin, RequireUser } from './auth/AccountProvider';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AdminShell, AppShell } from './components/AppShell';
import { Backdrop } from './components/Backdrop';
import { SelectionProvider } from './lib/selection';
import { supabaseConfigured } from './lib/supabase';
import { AuthConfirmPage } from './pages/AuthConfirmPage';
import { AuthPage } from './pages/AuthPage';
import { CuratedRecipePage } from './pages/CuratedRecipePage';
import { IngredientSelectionPage } from './pages/IngredientSelectionPage';
import { KitchenHomePage } from './pages/KitchenHomePage';
import { KitchenPage } from './pages/KitchenPage';
import { MyRecipesPage } from './pages/MyRecipesPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PantryPage } from './pages/PantryPage';
import { ProfilePage } from './pages/ProfilePage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SavedRecipePage } from './pages/RecipesPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { SharePage } from './pages/SharePage';
import { Spinner } from './components/ui';

// Admin pages (and the chart library they use) load only when a Super Admin opens them.
const admin = <K extends string>(name: K, load: () => Promise<Record<K, React.ComponentType>>) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const AdminDashboardPage = admin('AdminDashboardPage', () => import('./pages/admin/AdminDashboardPage'));
const AdminUsersPage = admin('AdminUsersPage', () => import('./pages/admin/AdminUsersPage'));
const AdminIngredientsPage = admin('AdminIngredientsPage', () => import('./pages/admin/AdminIngredientsPage'));
const AdminRecipesPage = admin('AdminRecipesPage', () => import('./pages/admin/AdminRecipesPage'));
const AdminAnalyticsPage = admin('AdminAnalyticsPage', () => import('./pages/admin/AdminAnalyticsPage'));
const AdminFeedbackPage = admin('AdminFeedbackPage', () => import('./pages/admin/AdminFeedbackPage'));
const AdminSettingsPage = admin('AdminSettingsPage', () => import('./pages/admin/AdminSettingsPage'));

function SetupNotice() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <section className="glass max-w-lg p-8">
        <h1 className="font-display text-2xl font-extrabold">Almost ready</h1>
        <p className="mt-2 text-stone-600">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>web/.env.example</code>), then restart or redeploy.
        </p>
      </section>
    </main>
  );
}

// Email links that land on the wrong path (e.g. Site URL fallback) still reach /auth/confirm.
// It replaces the routes for that render so no other redirect (e.g. "*" → /kitchen) can win.
function AuthLinkRedirect({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const isAuthLink = /[?&#](token_hash|code|error_code)=/.test(search + hash);
  if (!isAuthLink || pathname === '/auth/confirm' || pathname.startsWith('/r/') || pathname.startsWith('/share/')) return children;
  return <Navigate to={`/auth/confirm${search}${hash}`} replace />;
}

export function App() {
  return (
    <>
      <Backdrop />
      {supabaseConfigured ? (
        <AuthProvider>
          <AccountProvider>
          <SelectionProvider>
          <AuthLinkRedirect>
          <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/confirm" element={<AuthConfirmPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/r/:token" element={<SharePage />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route element={<RequireUser />}>
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route element={<AppShell />}>
                  <Route path="/kitchen" element={<KitchenHomePage />} />
                  <Route path="/select" element={<IngredientSelectionPage />} />
                  <Route path="/recommendations" element={<RecommendationsPage />} />
                  <Route path="/recipe/:slug" element={<CuratedRecipePage />} />
                  <Route path="/create" element={<KitchenPage />} />
                  <Route path="/recipes" element={<MyRecipesPage />} />
                  <Route path="/recipes/:id" element={<SavedRecipePage />} />
                  <Route path="/pantry" element={<PantryPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route element={<RequireAdmin />}>
                <Route element={<AdminShell />}>
                  <Route path="/admin" element={<AdminDashboardPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/ingredients" element={<AdminIngredientsPage />} />
                  <Route path="/admin/recipes" element={<AdminRecipesPage />} />
                  <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
                  <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
                  <Route path="/admin/settings" element={<AdminSettingsPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </AuthLinkRedirect>
          </SelectionProvider>
          </AccountProvider>
        </AuthProvider>
      ) : <SetupNotice />}
    </>
  );
}
