import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CookingPot } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { displayName } from '../components/AppShell';
import { loadPreferences } from '../lib/preferencesApi';

// Kitchen, Recipes and Pantry get their full features in the next phases.
function Section({ icon, title, intro, children }: { icon: ReactNode; title: string; intro: string; children?: ReactNode }) {
  return (
    <section className="glass p-7 sm:p-10">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 text-rose-700 shadow-sm">{icon}</span>
      <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-xl text-stone-600">{intro}</p>
      {children}
    </section>
  );
}

export function KitchenPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (userId) loadPreferences(userId).then((p) => setOnboarded(p.onboarded)).catch(() => setOnboarded(null));
  }, [userId]);

  return (
    <Section icon={<CookingPot size={28} />} title={`Salaam, ${displayName(session?.user)}!`}
      intro="Your kitchen is ready. Soon you’ll pick what’s on your counter and get recipes matched to your taste, allergens and calorie target.">
      {onboarded === false ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[24px] border border-rose-200 bg-rose-50/80 p-5">
          <p className="flex-1 text-stone-700">Finish setting up your taste profile, allergen shield and calorie target so every recipe fits you.</p>
          <Link to="/onboarding" className="btn-primary">Finish setting up</Link>
        </div>
      ) : (
        <Link to="/profile" className="btn-ghost mt-6">Review my preferences</Link>
      )}
    </Section>
  );
}

export function RecipesPage() {
  return <Section icon={<BookOpen size={28} />} title="Recipes" intro="Your saved and shared recipes will live here." />;
}
