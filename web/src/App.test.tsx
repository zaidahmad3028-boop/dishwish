import { render, screen, within } from '@testing-library/react';
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
    expect(await screen.findByRole('heading', { name: 'Salaam, Ayesha!' })).toBeInTheDocument();
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Main' });
    for (const label of ['Kitchen', 'Recipes', 'Pantry', 'Profile']) {
      expect(within(sidebar).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up|register/i })).not.toBeInTheDocument();
    // Mocked preferences are not onboarded yet, so the kitchen offers to finish setup.
    expect(await screen.findByRole('link', { name: 'Finish setting up' })).toHaveAttribute('href', '/onboarding');
  });

  it('navigates between sections and shows saved preferences on the profile', async () => {
    setSession(fakeSession());
    renderAt('/kitchen');
    const [sidebar] = await screen.findAllByRole('navigation', { name: 'Main' });
    await userEvent.click(within(sidebar).getByRole('link', { name: 'Profile' }));
    expect(await screen.findByText('Milk & Dairy')).toBeInTheDocument();
    expect(screen.getByText('prawns')).toBeInTheDocument();
    expect(screen.getByText('1,800')).toBeInTheDocument();
  });

  it('logs out back to the auth page', async () => {
    setSession(fakeSession());
    renderAt('/kitchen');
    await userEvent.click((await screen.findAllByRole('button', { name: /log out/i }))[0]);
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /cook your dream recipe/i })).toBeInTheDocument();
  });
});
