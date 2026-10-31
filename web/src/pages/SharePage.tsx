import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { Logo } from '../components/Logo';
import { RecipeView } from '../components/RecipeView';
import type { Recipe } from '../lib/recipes';
import { loadSharedRecipe } from '../lib/recipesApi';

// Public page: anyone with the link can read the shared snapshot, signed in or not.
export function SharePage() {
  const { token = '' } = useParams();
  const { session } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);

  useEffect(() => { loadSharedRecipe(token).then(setRecipe).catch(() => setRecipe(null)); }, [token]);

  if (recipe === undefined) return <FullPageSpinner />;
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="print-hide mb-6"><Logo /></div>
      {recipe ? (
        <RecipeView recipe={recipe} prefs={null}>
          <p className="print-hide mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">Shared recipe</p>
        </RecipeView>
      ) : (
        <section className="glass p-8">
          <h1 className="font-display text-2xl font-extrabold">This link doesn’t work</h1>
          <p className="mt-2 text-stone-600">The recipe may have been removed or the link is incomplete.</p>
        </section>
      )}
      <p className="print-hide mt-6 text-center text-sm text-stone-600">
        <Link to={session ? '/kitchen' : '/auth'} className="font-semibold text-rose-700 underline">{session ? 'Back to your kitchen' : 'Cook your own on DishWish'}</Link>
      </p>
    </main>
  );
}
