import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { emptyPreferences } from '../lib/preferences';
import * as pantryApi from '../lib/pantryApi';
import * as recipes from '../lib/recipes';
import * as recipesApi from '../lib/recipesApi';
import { CATALOG } from '../test/catalogFixture';
import { KARAHI, SALAN } from '../test/recipeFixture';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';
import { KitchenPage } from './KitchenPage';

const prefs = { ...emptyPreferences(), allergens: ['milk' as const], calorieTier: 'medium' as const, onboarded: true };
vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(async () => prefs), savePreferences: vi.fn() }));
vi.mock('../lib/pantryApi', async (orig) => ({
  ...(await orig<typeof import('../lib/pantryApi')>()),
  loadCatalog: vi.fn(async () => CATALOG),
  loadPantry: vi.fn(async () => [{ ingredientId: 1, quantityG: 200 }, { ingredientId: 2, quantityG: 500 }, { ingredientId: 4, quantityG: 400 }]),
  setPantryItem: vi.fn(async () => {}),
}));
vi.mock('../lib/recipes', async (orig) => ({
  ...(await orig<typeof import('../lib/recipes')>()),
  generateRecipes: vi.fn(async () => ({ recipes: [KARAHI, SALAN], suggestions: ['Potato'] })),
}));
vi.mock('../lib/recipesApi', async (orig) => ({
  ...(await orig<typeof import('../lib/recipesApi')>()),
  saveRecipe: vi.fn(async () => ({ id: 'r1', title: KARAHI.title, createdAt: '', recipe: KARAHI })),
  shareRecipe: vi.fn(async () => '11111111-2222-4333-8444-555555555555'),
}));

const renderKitchen = () => render(
  <MemoryRouter initialEntries={['/kitchen']}>
    <AuthProvider><Routes><Route path="/kitchen" element={<KitchenPage />} /></Routes></AuthProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  resetSupabaseMock();
  setSession(fakeSession('Ayesha'));
  vi.clearAllMocks();
});

async function cook() {
  renderKitchen();
  const pantry = await screen.findByRole('group', { name: 'Pantry ingredients' });
  await userEvent.click(within(pantry).getByRole('button', { name: 'Chicken Breast' }));
  await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
  await userEvent.click(screen.getByRole('button', { name: /cook my recipes/i }));
  return screen.findByRole('article', { name: 'Chicken Breast Karahi' });
}

describe('KitchenPage', () => {
  it('greets, disables blocked pantry items and requires a pick before cooking', async () => {
    renderKitchen();
    expect(await screen.findByRole('heading', { name: 'Salaam, Ayesha!' })).toBeInTheDocument();
    const pantry = await screen.findByRole('group', { name: 'Pantry ingredients' });
    expect(within(pantry).getByRole('button', { name: 'Yogurt (Dahi)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cook my recipes/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Finish setting up' })).not.toBeInTheDocument();
  });

  it('cooks with the picks, servings and preferences, and shows nutrition', async () => {
    const article = await cook();
    expect(recipes.generateRecipes).toHaveBeenCalledWith('token', ['Chicken Breast'], prefs, 3);
    expect(within(article).getByRole('region', { name: 'Nutrition per serving' })).toHaveTextContent('400 kcal');
    expect(within(article).getByText(/Meal target 500 kcal · 27% of your day/)).toBeInTheDocument();
    expect(within(article).getByText('Nutrition values are approximate. Not medical advice.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Chicken Breast Salan/ }));
    expect(screen.getByRole('article', { name: 'Chicken Breast Salan' })).toBeInTheDocument();
  });

  it('adds an ingredient from search and from suggestions', async () => {
    renderKitchen();
    await screen.findByRole('group', { name: 'Pantry ingredients' });
    await userEvent.type(screen.getByPlaceholderText(/add any ingredient/i), 'rice');
    await userEvent.click(screen.getByRole('button', { name: 'Basmati Rice' }));
    expect(within(screen.getByRole('list', { name: 'Chosen ingredients' })).getByRole('button', { name: 'Remove Basmati Rice' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cook my recipes/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add Potato' }));
    expect(screen.getByRole('button', { name: 'Remove Potato' })).toBeInTheDocument();
  });

  it('shows the shopping list against the pantry and tops the pantry up', async () => {
    const article = await cook();
    const list = within(article).getByRole('region', { name: 'Shopping list' });
    expect(list).toHaveTextContent('Chicken Breast150 g (have 200 g)');
    expect(list).toHaveTextContent('Tomato100 g');
    expect(list).not.toHaveTextContent('Onion');
    await userEvent.click(within(list).getByRole('button', { name: /i bought these/i }));
    expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 1, 350);
    expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 3, 100);
  });

  it('saves and shares the recipe', async () => {
    const article = await cook();
    await userEvent.click(within(article).getByRole('button', { name: /save recipe/i }));
    expect(recipesApi.saveRecipe).toHaveBeenCalledWith('user-1', KARAHI);
    expect(await within(article).findByRole('button', { name: /saved/i })).toBeDisabled();
    await userEvent.click(within(article).getByRole('button', { name: /share/i }));
    expect(await within(article).findByLabelText('Share link')).toHaveValue(`${window.location.origin}/share/11111111-2222-4333-8444-555555555555`);
  });

  it('shows API errors', async () => {
    vi.mocked(recipes.generateRecipes).mockRejectedValueOnce(new Error('Prawns is blocked by your allergen shield'));
    renderKitchen();
    const pantry = await screen.findByRole('group', { name: 'Pantry ingredients' });
    await userEvent.click(within(pantry).getByRole('button', { name: 'Onion' }));
    await userEvent.click(screen.getByRole('button', { name: /cook my recipes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('blocked by your allergen shield');
  });
});
