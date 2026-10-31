import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from '../auth/RequireAuth';
import { RecipeView } from '../components/RecipeView';
import { deleteSavedRecipe, getSavedRecipe, listSavedRecipes, shareRecipe, shareUrl, type SavedRecipe } from '../lib/recipesApi';
import { useKitchenData } from '../lib/useKitchenData';

export function RecipesPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [saved, setSaved] = useState<SavedRecipe[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userId) listSavedRecipes(userId).then(setSaved).catch((e: Error) => { setSaved([]); setError(e.message); });
  }, [userId]);

  if (!userId || saved === null) return <FullPageSpinner />;

  const remove = async (id: string) => {
    setError('');
    try { await deleteSavedRecipe(userId, id); setSaved((s) => s!.filter((r) => r.id !== id)); } catch (e) { setError((e as Error).message); }
  };

  return (
    <section className="glass p-6 sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 text-rose-700 shadow-sm"><BookOpen size={24} /></span>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">Recipes</h1>
      <p className="mt-1 text-stone-600">Your saved recipes.</p>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {saved.length === 0 ? (
        <p className="mt-6 rounded-[24px] border border-dashed border-stone-300 p-6 text-center text-stone-500">
          No saved recipes yet. <Link to="/kitchen" className="font-semibold text-rose-700 underline">Cook something in your kitchen</Link> and tap Save.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {saved.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-[24px] bg-white/70 p-4">
              <Link to={`/recipes/${r.id}`} className="min-w-0 flex-1">
                <span className="block font-display text-lg font-extrabold">{r.title}</span>
                <span className="text-sm text-stone-600">{r.recipe.nutrition.per_serving.kcal} kcal per serving · {r.recipe.minutes} min · serves {r.recipe.servings}</span>
              </Link>
              <button type="button" onClick={() => remove(r.id)} aria-label={`Delete ${r.title}`}
                className="grid h-9 w-9 place-items-center rounded-xl text-stone-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={18} /></button>
            </li>
          ))}
        </ul>
      )}
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
  return (
    <RecipeView recipe={saved.recipe} prefs={prefs} pantryByName={pantryByName} actions={{
      onShare: async () => shareUrl(await shareRecipe(userId, saved.recipe)),
      onAddToPantry: addBought,
    }}>
      <button type="button" onClick={() => navigate('/recipes')} className="print-hide mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
        <ArrowLeft size={16} />All recipes
      </button>
    </RecipeView>
  );
}
