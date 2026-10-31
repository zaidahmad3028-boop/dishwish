import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { emptyPreferences } from '../lib/preferences';
import * as pantryApi from '../lib/pantryApi';
import * as recipes from '../lib/recipes';
import * as recipesApi from '../lib/recipesApi';
import { CATALOG } from '../test/catalogFixture';
import { KARAHI, SALAN } from '../test/recipeFixture';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';
import { KitchenPage } from './KitchenPage';

const prefs = {
  ...emptyPreferences(), tastes: { sweet: null, salty: null, sour: 'low' as const, spicy: 'high' as const },
  allergens: ['milk' as const], customAllergens: ['prawn', 'tomato'], calorieTier: 'medium' as const, onboarded: true,
};
vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(async () => prefs), savePreferences: vi.fn() }));
vi.mock('../lib/pantryApi', async (orig) => ({
  ...(await orig<typeof import('../lib/pantryApi')>()),
  loadCatalog: vi.fn(async () => CATALOG),
  loadPantry: vi.fn(async () => [{ ingredientId: 1, quantityG: 200 }, { ingredientId: 2, quantityG: 500 }]),
  setPantryItem: vi.fn(async () => {}),
}));
vi.mock('../lib/recipes', async (orig) => ({
  ...(await orig<typeof import('../lib/recipes')>()),
  generateRecipes: vi.fn(async () => ({ recipes: [KARAHI, SALAN], suggestions: [] })),
}));
vi.mock('../lib/recipesApi', async (orig) => ({
  ...(await orig<typeof import('../lib/recipesApi')>()),
  saveRecipe: vi.fn(async () => 'saved'),
  isRecipeSaved: vi.fn(async () => false),
  shareRecipe: vi.fn(async () => '11111111-2222-4333-8444-555555555555'),
}));

const recommendBody = {
  recommendations: [
    { name: 'Onion', score: 0.92, allergens: [], contributions: { 'Chicken Breast': 0.92 } },
    { name: 'Yogurt (Dahi)', score: 0.9, allergens: ['milk'], contributions: { 'Chicken Breast': 0.9 } },
    { name: 'Prawns', score: 0.8, allergens: ['shellfish'], contributions: { 'Chicken Breast': 0.8 } },
    { name: 'Basmati Rice', score: 0.71, allergens: [], contributions: { 'Chicken Breast': 0.71 } },
  ],
};
let fetchMock: ReturnType<typeof vi.fn>;

const renderKitchen = () => render(
  <MemoryRouter initialEntries={['/kitchen']}>
    <AuthProvider><Routes><Route path="/kitchen" element={<KitchenPage />} /></Routes></AuthProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  resetSupabaseMock();
  setSession(fakeSession('Ayesha'));
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(recommendBody), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function cook() {
  renderKitchen();
  await userEvent.click(await screen.findByRole('button', { name: 'Add Chicken Breast' }));
  await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
  await userEvent.click(screen.getByRole('button', { name: /generate my dream recipe/i }));
  return screen.findByRole('article', { name: 'Chicken Breast Karahi' });
}

describe('KitchenPage', () => {
  it('starts with an empty counter, category tabs with counts and blocked cards', async () => {
    renderKitchen();
    expect(await screen.findByRole('heading', { name: 'Salaam, Ayesha!' })).toBeInTheDocument();
    expect(screen.getByText(/your counter is empty/i)).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Ingredient categories' });
    expect(within(tabs).getByRole('tab', { name: 'All (7)' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: 'Meat (2)' })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: 'In pantry (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yogurt (Dahi), blocked: Contains Milk & Dairy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prawns, blocked: Contains Shellfish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tomato, blocked: Matches “tomato”' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /generate my dream recipe/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters by category tab and search', async () => {
    renderKitchen();
    await userEvent.click(await screen.findByRole('tab', { name: 'Vegetables (2)' }));
    const grid = screen.getByRole('list', { name: 'Ingredients' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: 'All (7)' }));
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'rice');
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
  });

  it('keeps picks in order and asks for recommendations with tastes and allergen tags', async () => {
    renderKitchen();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Chicken Breast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Masoor Dal' }));
    const counter = screen.getByRole('list', { name: 'Counter ingredients' });
    expect(within(counter).getAllByRole('button').map((b) => b.textContent)).toEqual(['1Chicken Breast', '2Masoor Dal']);
    const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/recommend$/);
    expect(JSON.parse(init.body as string)).toEqual({
      selected_ingredients: ['Chicken Breast', 'Masoor Dal'], taste_preferences: { sour: 2, spicy: 8 },
      excluded_allergens: ['milk', 'shellfish'], limit: 20,
    });
    expect(screen.getByRole('progressbar', { name: 'Counter progress' })).toHaveAttribute('aria-valuenow', '2');
  });

  it('shows match % and pairs-with, hides blocked suggestions, and adds on click', async () => {
    renderKitchen();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Chicken Breast' }));
    const panel = screen.getByRole('region', { name: 'Recommended for you' });
    const onion = await within(panel).findByRole('button', { name: 'Add Onion, 92% match' });
    expect(onion).toHaveTextContent('pairs with Chicken Breast');
    expect(within(panel).queryByText('Yogurt (Dahi)')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Prawns')).not.toBeInTheDocument();
    await userEvent.click(onion);
    expect(within(screen.getByRole('list', { name: 'Counter ingredients' })).getByRole('button', { name: 'Remove Onion' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // refreshed after the add
  });

  it('shows a recommendation error with retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    renderKitchen();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Chicken Breast' }));
    const panel = screen.getByRole('region', { name: 'Recommended for you' });
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Could not load recommendations.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    expect(await within(panel).findByRole('button', { name: 'Add Onion, 92% match' })).toBeInTheDocument();
  });

  it('shows the calorie check against the meal target', async () => {
    renderKitchen();
    const check = await screen.findByRole('region', { name: 'Calorie check' });
    expect(check).toHaveTextContent('Meal target 500 kcal');
    await userEvent.click(screen.getByRole('button', { name: 'Add Chicken Breast' }));
    expect(check).toHaveTextContent('165 kcal at 100 g each');
  });

  it('generates recipes with picks, servings and preferences, with nutrition and taste', async () => {
    const article = await cook();
    expect(recipes.generateRecipes).toHaveBeenCalledWith('token', ['Chicken Breast'], prefs, 3);
    expect(within(article).getByRole('region', { name: 'Nutrition per serving' })).toHaveTextContent('400 kcal');
    expect(within(article).getByRole('region', { name: 'Taste profile' })).toHaveTextContent('Spicy7.5/10');
    expect(within(article).getByRole('region', { name: 'Allergen notice' })).toHaveTextContent('kept out Milk & Dairy');
    expect(within(article).getByText('Nutrition values are approximate. Not medical advice.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Chicken Breast Salan/ }));
    expect(screen.getByRole('article', { name: 'Chicken Breast Salan' })).toBeInTheDocument();
  });

  it('shows the shopping list with PKR estimates and tops the pantry up', async () => {
    const article = await cook();
    const list = within(article).getByRole('region', { name: 'Shopping list' });
    expect(list).toHaveTextContent('Chicken Breast 150 g (have 200 g)Rs 113');
    expect(list).toHaveTextContent('Estimated total');
    expect(list).not.toHaveTextContent('Onion');
    await userEvent.click(within(list).getByRole('button', { name: /i bought these/i }));
    expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 1, 350);
  });

  it('saves once and shares an /r/ link', async () => {
    const article = await cook();
    await userEvent.click(within(article).getByRole('button', { name: /save to profile/i }));
    expect(recipesApi.saveRecipe).toHaveBeenCalledWith('user-1', KARAHI);
    expect(await within(article).findByRole('button', { name: /saved to profile/i })).toBeDisabled();
    await userEvent.click(within(article).getByRole('button', { name: /share link/i }));
    expect(await within(article).findByLabelText('Share link')).toHaveValue(`${window.location.origin}/r/11111111-2222-4333-8444-555555555555`);
  });

  it('says "Already saved" for a recipe that is already in the profile', async () => {
    vi.mocked(recipesApi.isRecipeSaved).mockResolvedValue(true);
    const article = await cook();
    expect(await within(article).findByRole('button', { name: /already saved/i })).toBeDisabled();
  });

  it('shows recipe API errors', async () => {
    vi.mocked(recipes.generateRecipes).mockRejectedValueOnce(new Error('Choose 1–12 ingredients'));
    renderKitchen();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Onion' }));
    await userEvent.click(screen.getByRole('button', { name: /generate my dream recipe/i }));
    expect(await screen.findByText('Choose 1–12 ingredients')).toBeInTheDocument();
  });
});

describe('KitchenPage on phones', () => {
  it('offers a floating generate bar once something is on the counter', async () => {
    renderKitchen();
    await screen.findByRole('button', { name: 'Add Chicken Breast' });
    expect(screen.queryByRole('button', { name: /generate recipe with/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Chicken Breast' }));
    expect(screen.getByRole('link', { name: '1 on counter · see pairings' })).toHaveAttribute('href', '#counter-panel');
    await userEvent.click(screen.getByRole('button', { name: 'Generate recipe with 1 picked' }));
    expect(await screen.findByRole('article', { name: 'Chicken Breast Karahi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate recipe with/i })).not.toBeInTheDocument();
  });
});
