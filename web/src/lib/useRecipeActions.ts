import { useEffect, useMemo, useState } from 'react';
import type { RecipeActions } from '../components/RecipeView';
import type { Recipe, ShoppingLine } from './recipes';
import { isRecipeSaved, saveRecipe, shareRecipe, shareUrl } from './recipesApi';

// Save / share / "I bought these" for a freshly generated recipe. Knows whether the
// user already saved this exact recipe, so the button can say "Already saved".
export function useRecipeActions(
  userId: string | undefined,
  recipe: Recipe | null,
  addBought: (lines: ShoppingLine[]) => Promise<void>,
): RecipeActions {
  const [saved, setSaved] = useState<Record<string, RecipeActions['saveState']>>({});
  const fingerprint = recipe?.fingerprint;

  useEffect(() => {
    if (!userId || !fingerprint || saved[fingerprint]) return;
    isRecipeSaved(userId, fingerprint)
      .then((exists) => setSaved((s) => ({ ...s, [fingerprint]: s[fingerprint] ?? (exists ? 'exists' : 'new') })))
      .catch(() => {});
  }, [userId, fingerprint, saved]);

  return useMemo(() => ({
    saveState: fingerprint ? saved[fingerprint] ?? 'new' : 'new',
    onSave: async () => {
      if (!userId || !recipe) return;
      const result = await saveRecipe(userId, recipe);
      setSaved((s) => ({ ...s, [recipe.fingerprint]: result === 'saved' ? 'saved' : 'exists' }));
    },
    onShare: async () => {
      if (!userId || !recipe) throw new Error('Log in to share.');
      return shareUrl(await shareRecipe(userId, recipe));
    },
    onAddToPantry: addBought,
  }), [userId, recipe, fingerprint, saved, addBought]);
}
