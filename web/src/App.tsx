import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { Backdrop } from './components/Backdrop';
import { supabaseConfigured } from './lib/supabase';
import { AuthConfirmPage } from './pages/AuthConfirmPage';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { PantryPage } from './pages/PantryPage';
import { KitchenPage } from './pages/KitchenPage';
import { RecipesPage, SavedRecipePage } from './pages/RecipesPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SharePage } from './pages/SharePage';

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
          <AuthLinkRedirect>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/confirm" element={<AuthConfirmPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/r/:token" element={<SharePage />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route element={<AppShell />}>
                <Route path="/kitchen" element={<KitchenPage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/recipes/:id" element={<SavedRecipePage />} />
                <Route path="/pantry" element={<PantryPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/kitchen" replace />} />
          </Routes>
          </AuthLinkRedirect>
        </AuthProvider>
      ) : <SetupNotice />}
    </>
  );
}
