import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { emptyPreferences } from './lib/preferences';
import { CATALOG } from './test/catalogFixture';
import { fakeSession, resetSupabaseMock, setSession, supabase } from './test/supabaseMock';

vi.mock('./lib/supabase', () => import('./test/supabaseMock'));
vi.mock('./lib/preferencesApi', () => ({
  loadPreferences: vi.fn(async () => ({ ...emptyPreferences(), allergens: ['milk'], customAllergens: ['prawns'], calorieTier: 'high' })),
  savePreferences: vi.fn(),
}));
vi.mock('./lib/recipesApi', async (orig) => ({
  ...(await orig<typeof import('./lib/recipesApi')>()),
  listSavedRecipes: vi.fn(async () => []),
}));
vi.mock('./lib/pantryApi', async (orig) => ({
  ...(await orig<typeof import('./lib/pantryApi')>()),
  loadCatalog: vi.fn(async () => CATALOG), loadPantry: vi.fn(async () => []),
}));

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

beforeEach(() => resetSupabaseMock());

describe('routing', () => {
  it.each(['/kitchen', '/profile', '/onboarding', '/'])('sends signed-out visitors from %s to the auth page', async (path) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: /cook your dream recipe/i })).toBeInTheDocument();
  });

  it('shows the app shell with sidebar navigation and no header', async () => {
    setSession(fakeSession('Ayesha'));
    renderAt('/kitchen');
    expect(await screen.findByRole('heading', { name: 'Your Kitchen' })).toBeInTheDocument();
    expect(screen.getByText('Turn your ingredients into amazing recipes.')).toBeInTheDocument();
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Main' });
    // The same menu on every page, Ingredient Selection included.
    for (const label of ['Kitchen', 'Ingredient Selection', 'Recommendations', 'My Recipes', 'My Pantry', 'Profile', 'Settings']) {
      expect(within(sidebar).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Smart Matching/ })).toHaveAttribute('href', '/select');
    expect(within(sidebar).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up|create account/i })).not.toBeInTheDocument();
    // Not onboarded, but allergies and a calorie goal are already saved, so the kitchen doesn't nag about setup.
    expect(await screen.findByText('Quick Recipe Generator')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Finish setting up' })).toBeNull());
  });

  it('navigates between sections and shows saved preferences on the profile', async () => {
    setSession(fakeSession());
    renderAt('/kitchen');
    const [sidebar] = await screen.findAllByRole('navigation', { name: 'Main' });
    await userEvent.click(within(sidebar).getByRole('link', { name: 'Profile' }));
    // Saved allergies show in the summary; the calorie goal moved to the Meal Preferences tab.
    expect(await screen.findByText(/Milk & Dairy.*prawns/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Meal Preferences' }));
    expect(await screen.findByText(/Your saved goal: 1,800 kcal/)).toBeInTheDocument();
  });

  it('logs out back to the auth page', async () => {
    setSession(fakeSession());
    renderAt('/kitchen');
    await userEvent.click((await screen.findAllByRole('button', { name: /registered user/i }))[0]);
    await userEvent.click(screen.getAllByRole('menuitem', { name: /log out/i })[0]);
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /cook your dream recipe/i })).toBeInTheDocument();
  });
});
