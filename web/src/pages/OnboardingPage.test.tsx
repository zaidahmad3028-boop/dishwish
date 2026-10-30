import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { emptyPreferences, type Preferences } from '../lib/preferences';
import { loadPreferences, savePreferences } from '../lib/preferencesApi';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';
import { OnboardingPage } from './OnboardingPage';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(), savePreferences: vi.fn() }));

const load = vi.mocked(loadPreferences);
const save = vi.mocked(savePreferences);
const lastSaved = (): Preferences => save.mock.calls.at(-1)![1];

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>
          <Route path="/kitchen" element={<p>Kitchen screen</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const click = (name: RegExp | string) => userEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  resetSupabaseMock();
  setSession(fakeSession());
  load.mockReset().mockResolvedValue(emptyPreferences());
  save.mockReset().mockResolvedValue(undefined);
});

describe('OnboardingPage', () => {
  it('walks through all three steps, saving on every Next and at the end', async () => {
    renderOnboarding();
    expect(await screen.findByRole('heading', { name: 'Taste Profile' })).toBeInTheDocument();
    expect(screen.getByText('Karahi, nihari, biryani')).toBeInTheDocument();

    // Step 1: pick Spicy High and Sour Low, then change mind on Sour (deselect).
    await userEvent.click(within(screen.getByRole('group', { name: 'Spicy level' })).getByRole('button', { name: 'high' }));
    const sour = within(screen.getByRole('group', { name: 'Sour level' }));
    await userEvent.click(sour.getByRole('button', { name: 'low' }));
    await userEvent.click(sour.getByRole('button', { name: 'low' }));
    expect(sour.getByRole('button', { name: 'low' })).toHaveAttribute('aria-pressed', 'false');
    await click(/next: allergen shield/i);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe('user-1');
    expect(lastSaved().tastes).toEqual({ sweet: null, salty: null, sour: null, spicy: 'high' });

    // Step 2: 18 chips, counter, free text.
    expect(await screen.findByText('Your food safety matters')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shellfish/i })).not.toBeInTheDocument();
    await click(/milk & dairy/i);
    await click(/daal & chana/i);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/not in the list/i), 'Shellfish, raw onion');
    await click(/next: calorie target/i);
    expect(lastSaved().allergens).toEqual(['milk', 'legumes']);
    expect(lastSaved().customAllergens).toEqual(['shellfish', 'raw onion']);

    // Step 3: choose Moderate Deficit and see the daily plan.
    expect(await screen.findByText('Popular')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /moderate deficit/i }));
    expect(screen.getByRole('radio', { name: /moderate deficit/i })).toHaveAttribute('aria-checked', 'true');
    const plan = screen.getByRole('region', { name: /your daily plan/i });
    expect(within(plan).getAllByText('500 kcal')).toHaveLength(3);
    await click(/finish & open kitchen/i);
    expect(await screen.findByText('Kitchen screen')).toBeInTheDocument();
    expect(lastSaved()).toMatchObject({ calorieTier: 'medium', onboarded: true, allergens: ['milk', 'legumes'] });
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('skip buttons clear the step and still save', async () => {
    load.mockResolvedValue({ ...emptyPreferences(), tastes: { sweet: 'high', salty: null, sour: null, spicy: null }, allergens: ['corn'] });
    renderOnboarding();
    await screen.findByRole('heading', { name: 'Taste Profile' });
    await click('Skip for now');
    expect(lastSaved().tastes.sweet).toBeNull();
    await screen.findByText('1 selected');
    await click(/skip, i have no allergies/i);
    expect(lastSaved()).toMatchObject({ allergens: [], customAllergens: [] });
    await userEvent.click(await screen.findByRole('radio', { name: /balanced fit/i }));
    await click(/skip, no calorie goal/i);
    expect(await screen.findByText('Kitchen screen')).toBeInTheDocument();
    expect(lastSaved()).toMatchObject({ calorieTier: null, onboarded: true });
  });

  it('prefills saved answers and lets you go back without saving', async () => {
    load.mockResolvedValue({ ...emptyPreferences(), customAllergens: ['prawns'], calorieTier: 'low' });
    renderOnboarding();
    await click(await screen.findByRole('button', { name: /next: allergen shield/i }).then(() => /next: allergen shield/i));
    expect(await screen.findByLabelText(/not in the list/i)).toHaveValue('prawns');
    await click(/next: calorie target/i);
    expect(screen.getByRole('radio', { name: /weight loss extreme/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('400 kcal')).toHaveLength(3);
    const saves = save.mock.calls.length;
    await click('Back');
    expect(await screen.findByText('Your food safety matters')).toBeInTheDocument();
    expect(save.mock.calls.length).toBe(saves);
  });

  it('stays on the step and explains when saving fails', async () => {
    save.mockRejectedValue(new Error('network'));
    renderOnboarding();
    await click(await screen.findByRole('button', { name: /next: allergen shield/i }).then(() => /next: allergen shield/i));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t save/i);
    expect(screen.getByRole('heading', { name: 'Taste Profile' })).toBeInTheDocument();
  });
});
