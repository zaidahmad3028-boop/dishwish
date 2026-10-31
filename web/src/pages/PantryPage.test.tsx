import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { emptyPreferences } from '../lib/preferences';
import * as pantryApi from '../lib/pantryApi';
import { CATALOG } from '../test/catalogFixture';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';
import { PantryPage } from './PantryPage';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../lib/preferencesApi', () => ({
  loadPreferences: vi.fn(async () => ({ ...emptyPreferences(), allergens: ['milk'], customAllergens: ['prawn'] })),
  savePreferences: vi.fn(),
}));
vi.mock('../lib/pantryApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/pantryApi')>()),
  loadCatalog: vi.fn(async () => CATALOG),
  loadPantry: vi.fn(async () => [{ ingredientId: 2, quantityG: 500 }]),
  setPantryItem: vi.fn(async () => {}),
  removePantryItem: vi.fn(async () => {}),
}));

const renderPantry = () => render(
  <MemoryRouter initialEntries={['/pantry']}>
    <AuthProvider><Routes><Route path="/pantry" element={<PantryPage />} /></Routes></AuthProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  resetSupabaseMock();
  setSession(fakeSession());
  vi.mocked(pantryApi.setPantryItem).mockClear();
  vi.mocked(pantryApi.removePantryItem).mockClear();
});

describe('PantryPage', () => {
  it('lists saved items grouped by category', async () => {
    renderPantry();
    expect(await screen.findByText('1 item at home')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vegetables' })).toBeInTheDocument();
    expect(screen.getByLabelText('Onion grams')).toHaveValue('500');
  });

  it('searches and adds an ingredient with the chosen grams', async () => {
    renderPantry();
    await screen.findByText('1 item at home');
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'chicken');
    const qty = screen.getByLabelText('Quantity to add in grams');
    await userEvent.clear(qty);
    await userEvent.type(qty, '750');
    await userEvent.click(screen.getByRole('button', { name: 'Add Chicken Breast' }));
    expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 1, 750);
    expect(await screen.findByText('2 items at home')).toBeInTheDocument();
    expect(screen.getByLabelText('Chicken Breast grams')).toHaveValue('750');
  });

  it('refuses an invalid quantity', async () => {
    renderPantry();
    await screen.findByText('1 item at home');
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'rice');
    await userEvent.clear(screen.getByLabelText('Quantity to add in grams'));
    await userEvent.click(screen.getByRole('button', { name: 'Add Basmati Rice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 to 100,000 grams/);
    expect(pantryApi.setPantryItem).not.toHaveBeenCalled();
  });

  it('blocks ingredients from the allergen shield (tags and free-text words)', async () => {
    renderPantry();
    await screen.findByText('1 item at home');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'All');
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'a');
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(within(results).getByRole('button', { name: 'Add Yogurt (Dahi)' })).toBeDisabled();
    expect(within(results).getByRole('button', { name: 'Add Prawns' })).toBeDisabled();
    expect(within(results).getByRole('button', { name: 'Add Basmati Rice' })).toBeEnabled();
  });

  it('updates and removes items', async () => {
    renderPantry();
    const field = await screen.findByLabelText('Onion grams');
    await userEvent.clear(field);
    await userEvent.type(field, '1200{Enter}');
    expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 2, 1200);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Onion' }));
    expect(pantryApi.removePantryItem).toHaveBeenCalledWith('user-1', 2);
    expect(await screen.findByText(/pantry is empty/i)).toBeInTheDocument();
  });
});
