import { supabase } from './supabase';
import { fromRow, toRow, type Preferences } from './preferences';

const COLUMNS = 'user_id, sweet, salty, sour, spicy, allergens, custom_allergens, calorie_tier, onboarded';

export async function loadPreferences(userId: string): Promise<Preferences> {
  const { data, error } = await supabase.from('preferences').select(COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

// Upsert: the signup trigger normally creates the row, but this also covers older accounts.
export async function savePreferences(userId: string, prefs: Preferences): Promise<void> {
  const { error } = await supabase
    .from('preferences')
    .upsert({ ...toRow(userId, prefs), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
