// Core journey and role routing: selection → recommendations → recipe, and admin-only areas.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import * as curatedApi from '../lib/curatedApi';
import { emptyPreferences } from '../lib/preferences';
import { CATALOG } from '../test/catalogFixture';
import { fakeSession, resetSupabaseMock, setAccountRole, setSession } from '../test/supabaseMock';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(async () => ({ ...emptyPreferences(), onboarded: true, allergens: ['milk'] })), savePreferences: vi.fn() }));
vi.mock('../lib/pantryApi', async (orig) => ({
  ...(await orig<typeof import('../lib/pantryApi')>()),
  loadCatalog: vi.fn(async () => CATALOG), loadPantry: vi.fn(async () => []),
}));

const MATCH: curatedApi.CuratedMatch = {
  slug: 'chicken-karahi', name: 'Chicken Karahi', category: 'Main Course', cuisine: 'Pakistani', minutes: 40, servings: 4,
  description: 'Wok-cooked chicken.', image_url: null, source: 'curated', match_percent: 62, score: 0.62,
  components: { coverage: 0.33, compatibility: 0.9, taste: 1, cooking: null }, weights_used: { coverage: 0.47, compatibility: 0.32, taste: 0.21 },
  penalty: 0.03, used: ['Chicken Breast', 'Tomato'], missing: ['Ginger', 'Garlic'], taste: { sweet: 1, salty: 6, sour: 4, spicy: 8 }, diets: [],
  nutrition_per_serving: { kcal: 420, protein: 38, carbs: 8, fat: 22 }, explanation: ['Uses Chicken Breast, Tomato from your selection.', 'Missing 2: Ginger, Garlic.'],
};
vi.mock('../lib/curatedApi', async (orig) => ({
  ...(await orig<typeof import('../lib/curatedApi')>()),
  fetchCuratedRecommendations: vi.fn(async () => ({ recipes: [MATCH], suggestions: [], excluded: { allergy: 1, diet: 0, no_overlap: 3 },
    settings: { weights: {}, missing_penalty: 0.03, missing_tolerance: 3, min_score: 0.2 }, data_source: 'database', notes: [] })),
  checkCompatibility: vi.fn(async () => ({ pairs: [{ a: 'Chicken Breast', b: 'Tomato', weight: 0.92, evidence: 'used together in 9 curated recipes', stored: true }],
    average: 0.92, stored_pairs: 1, suggestions: [{ name: 'Onion', category: 'Vegetables', support: 0.9 }] })),
  fetchCompatibility: vi.fn(async (name: string) => ({ ingredient: name, edges: [{ name: 'Tomato', weight: 0.92, relation: 'co-occurrence', evidence: 'test' }] })),
  fetchCuratedDetail: vi.fn(async () => ({ ...MATCH, ingredients: [
    { name: 'Chicken Leg Piece', grams: 750, display: '750 g', category: 'Meat', staple: false, have: true, allergens: [] },
    { name: 'Salt', grams: 8, display: '1 tsp', category: 'Grocery', staple: true, have: false, allergens: [] }],
    steps: ['Sear the chicken.', 'Add tomatoes.'], allergens: [] })),
  recordEvent: vi.fn(async () => {}),
  saveCurated: vi.fn(async () => 'saved' as const),
  listEvents: vi.fn(async () => []), trendingRecipes: vi.fn(async () => []), listCuratedRecipes: vi.fn(async () => []),
}));

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
beforeEach(() => { resetSupabaseMock(); vi.clearAllMocks(); sessionStorage.clear(); });

describe('core journey', () => {
  it('needs two ingredients, then recommends, explains and saves', async () => {
    setSession(fakeSession());
    renderAt('/select');
    const continueBtn = await screen.findByRole('button', { name: /continue to recommendations/i });
    expect(continueBtn).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Chicken Breast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Tomato' }));
    expect(await screen.findByText(/pair well/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Spicy' }));
    await userEvent.click(continueBtn);

    expect(await screen.findByRole('heading', { name: 'Chicken Karahi' })).toBeInTheDocument();
    expect(screen.getAllByText('62% Match').length).toBeGreaterThan(0);
    expect(curatedApi.fetchCuratedRecommendations).toHaveBeenCalledWith('token',
      expect.objectContaining({ ingredients: ['Chicken Breast', 'Tomato'], tastes: expect.objectContaining({ spicy: 'high' }) }),
      expect.objectContaining({ allergens: ['milk'] }), []);
    expect(curatedApi.recordEvent).toHaveBeenCalledWith('generated', expect.objectContaining({ slug: 'chicken-karahi' }), ['Chicken Breast', 'Tomato']);
    await userEvent.click(screen.getByRole('button', { name: /add to my recipes/i }));
    expect(curatedApi.saveCurated).toHaveBeenCalledWith('user-1', expect.objectContaining({ slug: 'chicken-karahi' }));
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled();
  }, 45000);

  it('blocks ingredients that conflict with saved allergies', async () => {
    setSession(fakeSession());
    renderAt('/select');
    const blocked = CATALOG.find((i) => i.allergens.includes('milk'))!;
    await userEvent.type(await screen.findByRole('searchbox', { name: /search ingredients/i }), blocked.name.slice(0, 5));
    await userEvent.click(await screen.findByRole('button', { name: `${blocked.name}, blocked: Contains Milk & Dairy` }));
    expect(screen.getByRole('status')).toHaveTextContent(`${blocked.name} is blocked`);
  });

  it('asks for ingredients before recommending', async () => {
    setSession(fakeSession());
    renderAt('/recommendations');
    expect(await screen.findByText(/choose at least 2 ingredients first/i)).toBeInTheDocument();
    expect(curatedApi.fetchCuratedRecommendations).not.toHaveBeenCalled();
  });

  it('tracks cooking progress and logs a cooked recipe when every step is done', async () => {
    setSession(fakeSession());
    renderAt('/recipe/chicken-karahi');
    expect(await screen.findByRole('heading', { name: 'Chicken Karahi', level: 1 })).toBeInTheDocument();
    for (const step of await screen.findAllByRole('checkbox')) await userEvent.click(step);
    expect(await screen.findByText(/added to your cooking history/i)).toBeInTheDocument();
    expect(curatedApi.recordEvent).toHaveBeenCalledWith('cooked', expect.objectContaining({ slug: 'chicken-karahi' }), []);
  });
});

describe('roles', () => {
  it('sends a registered user away from the admin area', async () => {
    setSession(fakeSession());
    renderAt('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Your Kitchen' })).toBeInTheDocument();
    expect(screen.queryByText('Users Management')).not.toBeInTheDocument();
  });

  it('lands a Super Admin on the admin panel with admin navigation', async () => {
    setAccountRole('super_admin');
    setSession(fakeSession('Admin'));
    renderAt('/');
    const [sidebar] = await screen.findAllByRole('navigation', { name: 'Main' });
    for (const label of ['Dashboard', 'Users', 'Ingredients', 'Recipes', 'Analytics', 'Feedback', 'Settings']) {
      expect(within(sidebar).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
  });
});
