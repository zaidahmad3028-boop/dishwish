import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ShieldCheck, SlidersHorizontal, Target, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { displayName } from '../components/AppShell';
import { SavedRecipesList } from '../components/SavedRecipesList';
import { ALLERGEN_CHIPS, TASTES, kcalForTier, type Preferences } from '../lib/preferences';
import { loadPreferences } from '../lib/preferencesApi';

export function ProfilePage() {
  const { session } = useAuth();
  const user = session?.user;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (user) loadPreferences(user.id).then(setPrefs).catch(() => setError(true));
  }, [user?.id]);

  if (!user) return null;

  const kcal = prefs ? kcalForTier(prefs.calorieTier) : null;
  const tastes = prefs ? TASTES.filter((t) => prefs.tastes[t.key]) : [];
  const allergenLabels = prefs ? ALLERGEN_CHIPS.filter((c) => prefs.allergens.includes(c.tag)).map((c) => c.label) : [];

  return (
    <div className="space-y-5">
      <section className="glass flex flex-wrap items-center gap-5 p-7">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 text-2xl font-bold text-white" aria-hidden="true">
          {displayName(user).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-extrabold tracking-tight">{displayName(user)}</h1>
          <p className="truncate text-stone-600">{user.email}</p>
          {user.created_at && (
            <p className="text-sm text-stone-500">Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          )}
        </div>
        <Link to="/onboarding" className="btn-primary"><SlidersHorizontal size={18} aria-hidden="true" />Edit preferences</Link>
      </section>

      {error && <p role="alert" className="glass p-5 text-rose-800">We couldn’t load your preferences. Please refresh to try again.</p>}

      {prefs && (
        <div className="grid gap-5 md:grid-cols-3">
          <section className="glass p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><UserRound size={18} className="text-rose-700" aria-hidden="true" />Taste Profile</h2>
            {tastes.length ? (
              <ul className="mt-3 space-y-1.5">
                {tastes.map((t) => <li key={t.key} className="flex justify-between"><span>{t.label}</span><span className="font-semibold capitalize">{prefs.tastes[t.key]}</span></li>)}
              </ul>
            ) : <p className="mt-3 text-stone-500">No taste preferences yet.</p>}
          </section>
          <section className="glass p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><ShieldCheck size={18} className="text-rose-700" aria-hidden="true" />Allergen Shield</h2>
            {allergenLabels.length || prefs.customAllergens.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {[...allergenLabels, ...prefs.customAllergens].map((a) => (
                  <li key={a} className="chip-selected rounded-full px-3 py-1 text-sm font-semibold">{a}</li>
                ))}
              </ul>
            ) : <p className="mt-3 text-stone-500">No allergens selected.</p>}
          </section>
          <section className="glass p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><Target size={18} className="text-rose-700" aria-hidden="true" />Calorie Target</h2>
            <p className="mt-3 text-stone-700">{kcal ? <><span className="font-display text-3xl font-extrabold">{kcal.toLocaleString()}</span> kcal/day</> : 'No calorie goal.'}</p>
          </section>
        </div>
      )}

      <section className="glass p-6" aria-label="My saved dishes">
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><BookOpen size={18} className="text-rose-700" aria-hidden="true" />My saved dishes</h2>
        <SavedRecipesList userId={user.id} />
      </section>
    </div>
  );
}
