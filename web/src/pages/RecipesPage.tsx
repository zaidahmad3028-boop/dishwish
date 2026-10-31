import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { RecipeView } from '../components/RecipeView';
import { SavedRecipesList } from '../components/SavedRecipesList';
import { getSavedRecipe, isGenerated, shareRecipe, shareUrl, type SavedRecipe } from '../lib/recipesApi';
import { useKitchenData } from '../lib/useKitchenData';

export function RecipesPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  if (!userId) return <FullPageSpinner />;
  return (
    <section className="glass p-6 sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 text-rose-700 shadow-sm"><BookOpen size={24} /></span>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">Recipes</h1>
      <p className="mt-1 text-stone-600">Your saved recipes.</p>
      <SavedRecipesList userId={userId} />
    </section>
  );
}

export function SavedRecipePage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const { prefs, pantryByName, addBought, catalog } = useKitchenData(userId);
  const [saved, setSaved] = useState<SavedRecipe | null | undefined>(undefined);

  useEffect(() => { getSavedRecipe(id).then(setSaved).catch(() => setSaved(null)); }, [id]);

  if (!userId || saved === undefined || catalog === null) return <FullPageSpinner />;
  if (saved === null) {
    return (
      <section className="glass p-8">
        <h1 className="font-display text-2xl font-extrabold">Recipe not found</h1>
        <Link to="/recipes" className="btn-ghost mt-4">Back to recipes</Link>
      </section>
    );
  }
  const recipe = saved.recipe;
  // Curated recipes are stored as a pointer; show the live curated page instead.
  if (!isGenerated(recipe)) return <Navigate to={`/recipe/${recipe.slug}`} replace />;
  return (
    <RecipeView recipe={recipe} prefs={prefs} pantryByName={pantryByName} actions={{
      onShare: async () => shareUrl(await shareRecipe(userId, recipe)),
      onAddToPantry: addBought,
    }}>
      <button type="button" onClick={() => navigate('/recipes')} className="print-hide mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
        <ArrowLeft size={16} />All recipes
      </button>
    </RecipeView>
  );
}
