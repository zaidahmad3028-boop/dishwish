import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { deleteSavedRecipe, listSavedRecipes, type SavedRecipe } from '../lib/recipesApi';

// The signed-in user's own saved dishes (RLS limits rows to them), newest first.
export function SavedRecipesList({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<SavedRecipe[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listSavedRecipes(userId).then(setSaved).catch((e: Error) => { setSaved([]); setError(e.message); });
  }, [userId]);

  const remove = async (id: string) => {
    setError('');
    try { await deleteSavedRecipe(userId, id); setSaved((s) => (s ?? []).filter((r) => r.id !== id)); } catch (e) { setError((e as Error).message); }
  };

  if (saved === null) return <p className="mt-4 text-sm text-stone-500">Loading your saved dishes…</p>;
  return (
    <>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {saved.length === 0 ? (
        <p className="mt-4 rounded-[24px] border border-dashed border-stone-300 p-6 text-center text-stone-500">
          No saved recipes yet. <Link to="/kitchen" className="font-semibold text-rose-700 underline">Cook something in your kitchen</Link> and tap Save to Profile.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Saved dishes">
          {saved.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-[24px] bg-white/70 p-4">
              <Link to={`/recipes/${r.id}`} className="min-w-0 flex-1">
                <span className="block font-display text-lg font-extrabold">{r.title}</span>
                <span className="text-sm text-stone-600">
                  {r.recipe.nutrition.per_serving.kcal} kcal per serving · {r.recipe.minutes} min · serves {r.recipe.servings}
                </span>
                <span className="block text-xs text-stone-500">Saved {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </Link>
              <button type="button" onClick={() => remove(r.id)} aria-label={`Delete ${r.title}`}
                className="grid h-9 w-9 place-items-center rounded-xl text-stone-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={18} /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
