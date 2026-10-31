import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { emptyPreferences } from '../lib/preferences';
import * as recipesApi from '../lib/recipesApi';
import { CATALOG } from '../test/catalogFixture';
import { KARAHI } from '../test/recipeFixture';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';

const TOKEN = '11111111-2222-4333-8444-555555555555';
vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(async () => emptyPreferences()), savePreferences: vi.fn() }));
vi.mock('../lib/pantryApi', async (orig) => ({
  ...(await orig<typeof import('../lib/pantryApi')>()),
  loadCatalog: vi.fn(async () => CATALOG), loadPantry: vi.fn(async () => []), setPantryItem: vi.fn(),
}));
vi.mock('../lib/recipesApi', async (orig) => ({
  ...(await orig<typeof import('../lib/recipesApi')>()),
  listSavedRecipes: vi.fn(async () => [{ id: 'r1', title: KARAHI.title, createdAt: '2026-10-31', recipe: KARAHI }]),
  getSavedRecipe: vi.fn(async (id: string) => (id === 'r1' ? { id: 'r1', title: KARAHI.title, createdAt: '', recipe: KARAHI } : null)),
  deleteSavedRecipe: vi.fn(async () => {}),
  loadSharedRecipe: vi.fn(async (t: string) => (t === TOKEN ? KARAHI : null)),
}));

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
beforeEach(() => { resetSupabaseMock(); vi.clearAllMocks(); });

describe('saved recipes', () => {
  it('lists, opens and deletes saved recipes', async () => {
    setSession(fakeSession());
    renderAt('/recipes');
    await userEvent.click(await screen.findByRole('link', { name: /Chicken Breast Karahi/ }));
    expect(await screen.findByRole('article', { name: 'Chicken Breast Karahi' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shopping list' })).toHaveTextContent('Chicken Breast350 g');
    await userEvent.click(screen.getByRole('button', { name: /all recipes/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chicken Breast Karahi' }));
    expect(recipesApi.deleteSavedRecipe).toHaveBeenCalledWith('user-1', 'r1');
    expect(await screen.findByText(/no saved recipes yet/i)).toBeInTheDocument();
  });

  it('shows not found for an unknown id', async () => {
    setSession(fakeSession());
    renderAt('/recipes/nope');
    expect(await screen.findByRole('heading', { name: 'Recipe not found' })).toBeInTheDocument();
  });
});

describe('shared recipe page', () => {
  it('is public and shows the recipe without pantry or save actions', async () => {
    renderAt(`/share/${TOKEN}`);
    expect(await screen.findByRole('article', { name: 'Chicken Breast Karahi' })).toBeInTheDocument();
    expect(screen.getByText('Nutrition values are approximate. Not medical advice.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save recipe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Shopping list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cook your own on dishwish/i })).toHaveAttribute('href', '/auth');
  });

  it('handles a bad link', async () => {
    renderAt('/share/not-a-token');
    expect(await screen.findByRole('heading', { name: /link doesn’t work/ })).toBeInTheDocument();
  });

  it('prints for PDF export', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderAt(`/share/${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: /download pdf/i }));
    expect(print).toHaveBeenCalled();
  });
});
