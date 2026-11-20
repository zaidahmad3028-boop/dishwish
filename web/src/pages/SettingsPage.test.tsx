import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import * as accountApi from '../lib/accountApi';
import { emptyPreferences } from '../lib/preferences';
import * as preferencesApi from '../lib/preferencesApi';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';
import { SettingsPage } from './SettingsPage';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({ loadPreferences: vi.fn(), savePreferences: vi.fn(async () => {}) }));
vi.mock('../lib/accountApi', async (importOriginal) => ({
  ...(await importOriginal<typeof accountApi>()),
  loadExtraPrefs: vi.fn(async () => ({ ...(await importOriginal<typeof accountApi>()).defaultExtraPrefs(), diets: ['vegetarian'] })),
  saveExtraPrefs: vi.fn(async () => {}),
  saveSavoryTaste: vi.fn(async () => {}),
  exportMyData: vi.fn(async () => ({})),
  listMyFeedback: vi.fn(async () => []),
}));
vi.mock('../components/ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/ui')>()), downloadFile: vi.fn() }));

// Choices save after a short delay, which a busy full test run can stretch past the default wait.
configure({ asyncUtilTimeout: 4000 });

const renderAt = (url = '/settings') => render(<MemoryRouter initialEntries={[url]}><AuthProvider><SettingsPage /></AuthProvider></MemoryRouter>);
const savedPrefs = () => vi.mocked(preferencesApi.savePreferences).mock.lastCall?.[1];
const savedExtra = () => vi.mocked(accountApi.saveExtraPrefs).mock.lastCall?.[1];

beforeEach(() => {
  resetSupabaseMock();
  setSession(fakeSession());
  vi.mocked(preferencesApi.savePreferences).mockClear();
  vi.mocked(accountApi.saveExtraPrefs).mockClear();
  vi.mocked(accountApi.saveSavoryTaste).mockClear();
  vi.mocked(preferencesApi.loadPreferences).mockResolvedValue({ ...emptyPreferences(), onboarded: true, allergens: ['milk'], customAllergens: ['prawn'], tastes: { sweet: 'low', salty: null, sour: null, spicy: 'high' } });
});

describe('SettingsPage', () => {
  it('shows five tabs and keeps Feedback and Your Data reachable', async () => {
    renderAt();
    await screen.findByRole('heading', { name: 'Profile Information' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Profile & Preferences', 'Diet & Allergies', 'Notifications', 'Security', 'Appearance']);
    await userEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    expect(await screen.findByRole('heading', { name: 'Send Feedback' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Your Data' }));
    expect(await screen.findByRole('heading', { name: 'Export My Data' })).toBeInTheDocument();
  });

  it('invites missing details instead of inventing them', async () => {
    renderAt();
    await screen.findByRole('heading', { name: 'Profile Information' });
    expect(screen.getAllByRole('button', { name: 'Add information' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Profile' })).toBeInTheDocument();
  });

  it('sets each flavour to Low, Moderate, High or Not set, like the Kitchen', async () => {
    renderAt();
    const spicy = await screen.findByRole('radiogroup', { name: 'Spicy intensity' });
    expect(within(spicy).getByRole('radio', { name: 'High' })).toBeChecked();
    await userEvent.click(within(spicy).getByRole('radio', { name: 'Low' }));
    expect(within(spicy).getByRole('radio', { name: 'Low' })).toBeChecked();
    await waitFor(() => expect(savedPrefs()?.tastes.spicy).toBe('low'));
    expect(savedPrefs()?.tastes.sweet).toBe('low'); // an existing strength is left alone
  });

  it('saves savory separately, because the engine has no savory score', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Savory (Umami)' }));
    await waitFor(() => expect(accountApi.saveSavoryTaste).toHaveBeenCalledWith(true));
  });

  it('keeps None and a diet from being selected together', async () => {
    renderAt();
    const none = await screen.findByRole('checkbox', { name: 'None' });
    expect(none).not.toBeChecked();
    await userEvent.click(none);
    await waitFor(() => expect(savedExtra()?.diets).toEqual([]));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Keto' }));
    expect(none).not.toBeChecked();
    await waitFor(() => expect(savedExtra()?.diets).toEqual(['keto']));
  });

  it('shows saved allergies as chips and adds or removes them', async () => {
    renderAt();
    expect(await screen.findByRole('button', { name: 'Remove Milk & Dairy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove prawn' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox', { name: 'Add more allergies' }), 'pean');
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('button', { name: /Peanuts/ }));
    await waitFor(() => expect(savedPrefs()?.allergens).toEqual(['milk', 'peanuts']));
    await userEvent.type(screen.getByRole('combobox', { name: 'Add more allergies' }), 'okra{Enter}');
    await waitFor(() => expect(savedPrefs()?.customAllergens).toEqual(['prawn', 'okra']));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Milk & Dairy' }));
    await waitFor(() => expect(savedPrefs()?.allergens).toEqual(['peanuts']));
  });

  it('saves notification toggles', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('switch', { name: 'Meal plan and cooking reminders' }));
    await waitFor(() => expect(savedExtra()?.notify.reminders).toBe(true));
    expect(savedExtra()?.notify.feedback_replies).toBe(true);
  });

  it('never presents two-factor as working or invents a device count', async () => {
    renderAt();
    expect(await screen.findByRole('switch', { name: /Two-Factor/ })).toBeDisabled();
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0);
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.queryByText(/\d device/)).not.toBeInTheDocument();
  });

  it('resets only after confirming, and says what is cleared', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Reset All Preferences' }));
    expect(preferencesApi.savePreferences).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: /Reset all preferences/ });
    expect(dialog).toHaveTextContent('allergies');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset preferences' }));
    await waitFor(() => expect(savedPrefs()?.allergens).toEqual([]));
    expect(savedPrefs()?.onboarded).toBe(true);
    expect(savedExtra()?.diets).toEqual([]);
    expect(accountApi.saveSavoryTaste).toHaveBeenCalledWith(false);
  });

  it('asks for a password and DELETE before deleting the account', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Account' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete your account/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Permanently delete' }));
    expect(await within(dialog).findByText('Type DELETE to confirm.')).toBeInTheDocument();
  });

  it('exports data straight from Quick Actions', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Export My Data' }));
    await waitFor(() => expect(accountApi.exportMyData).toHaveBeenCalled());
  });
});
