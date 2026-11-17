import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { emptyPreferences } from '../lib/preferences';
import { SelectionProvider } from '../lib/selection';
import * as pantryApi from '../lib/pantryApi';
import { CATALOG } from '../test/catalogFixture';
import { fakeSession, resetSupabaseMock, setSession } from '../test/supabaseMock';
import { PantryPage, shelfOf, stockStatus, toGrams, wholePercents } from './PantryPage';

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
    <AuthProvider><SelectionProvider><Routes><Route path="/pantry" element={<PantryPage />} /></Routes></SelectionProvider></AuthProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  resetSupabaseMock();
  setSession(fakeSession());
  vi.mocked(pantryApi.setPantryItem).mockClear();
  vi.mocked(pantryApi.removePantryItem).mockClear();
});

describe('PantryPage', () => {
  it('lists saved items with their category shelf', async () => {
    renderPantry();
    expect(await screen.findByText('1 item at home')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vegetables/ })).toBeInTheDocument();
    expect(screen.getByText('500 g')).toBeInTheDocument();
    expect(screen.getAllByText('In Stock').length).toBeGreaterThan(0);
  });

  it('searches and adds an ingredient with the chosen grams', async () => {
    renderPantry();
    await screen.findByText('1 item at home');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Ingredient' })[0]);
    await userEvent.type(screen.getByPlaceholderText(/Search e\.g\./), 'chicken');
    const qty = screen.getByLabelText('Quantity to add');
    await userEvent.clear(qty);
    await userEvent.type(qty, '750');
    await userEvent.click(screen.getByRole('button', { name: 'Add Chicken Breast' }));
    expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 1, 750);
    expect(await screen.findByText('2 items at home')).toBeInTheDocument();
    expect(screen.getByText('750 g')).toBeInTheDocument();
  });

  it('refuses an invalid quantity', async () => {
    renderPantry();
    await screen.findByText('1 item at home');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Ingredient' })[0]);
    await userEvent.type(screen.getByPlaceholderText(/Search e\.g\./), 'rice');
    await userEvent.clear(screen.getByLabelText('Quantity to add'));
    await userEvent.click(screen.getByRole('button', { name: 'Add Basmati Rice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 to 100,000 grams/);
    expect(pantryApi.setPantryItem).not.toHaveBeenCalled();
  });

  it('blocks ingredients from the allergen shield (tags and free-text words)', async () => {
    renderPantry();
    await screen.findByText('1 item at home');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Ingredient' })[0]);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'All');
    await userEvent.type(screen.getByPlaceholderText(/Search e\.g\./), 'a');
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(within(results).getByRole('button', { name: 'Add Yogurt (Dahi)' })).toBeDisabled();
    expect(within(results).getByRole('button', { name: 'Add Prawns' })).toBeDisabled();
    expect(within(results).getByRole('button', { name: 'Add Basmati Rice' })).toBeEnabled();
  });

  it('updates and removes items', async () => {
    renderPantry();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Onion' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Update quantity of Onion' }));
    const field = screen.getByLabelText('Onion quantity');
    await userEvent.clear(field);
    await userEvent.type(field, '1200{Enter}');
    await waitFor(() => expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 2, 1200));
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Onion' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove Onion' }));
    expect(pantryApi.removePantryItem).not.toHaveBeenCalled(); // removing asks first
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(pantryApi.removePantryItem).toHaveBeenCalledWith('user-1', 2));
    expect(await screen.findByText(/pantry is empty/i)).toBeInTheDocument();
  });

  it('marks an item out of stock when its quantity is set to zero', async () => {
    renderPantry();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Onion' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Update quantity of Onion' }));
    const field = screen.getByLabelText('Onion quantity');
    await userEvent.clear(field);
    await userEvent.type(field, '0{Enter}');
    await waitFor(() => expect(pantryApi.setPantryItem).toHaveBeenCalledWith('user-1', 2, 0));
    expect(await screen.findByRole('button', { name: /^0 Out of Stock|1 Out of Stock/ })).toBeInTheDocument();
  });

  it('classifies stock, shelves, units and percentages', () => {
    expect([stockStatus(0), stockStatus(99), stockStatus(100)]).toEqual(['out', 'low', 'in']);
    expect([shelfOf('Dairy & Eggs'), shelfOf('Fresh Herbs'), shelfOf('Bakery & Baking'), shelfOf('Pulses & Lentils')]).toEqual(['Dairy', 'Spices & Herbs', 'Grains & Cereals', 'Others']);
    expect([toGrams('1.5', 'kg'), toGrams('250', 'g'), toGrams('0', 'g'), toGrams('0', 'g', true), toGrams('101', 'kg')]).toEqual([1500, 250, null, 0, null]);
    expect(wholePercents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(wholePercents([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
