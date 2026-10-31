import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { Backdrop } from './components/Backdrop';
import { supabaseConfigured } from './lib/supabase';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { PantryPage } from './pages/PantryPage';
import { KitchenPage, RecipesPage } from './pages/SectionPages';

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

export function App() {
  return (
    <>
      <Backdrop />
      {supabaseConfigured ? (
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route element={<AppShell />}>
                <Route path="/kitchen" element={<KitchenPage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/pantry" element={<PantryPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/kitchen" replace />} />
          </Routes>
        </AuthProvider>
      ) : <SetupNotice />}
    </>
  );
}
