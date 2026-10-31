// Account-level data: role/status, profile, extra preferences, feedback and public app settings.
import { supabase } from './supabase';
import type { Diet } from './curatedApi';

export type Role = 'user' | 'super_admin';
export interface Account { role: Role; status: 'active' | 'deactivated' }

export async function loadAccount(): Promise<Account> {
  const { data, error } = await supabase.rpc('my_account');
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Partial<Account>;
  return { role: raw.role === 'super_admin' ? 'super_admin' : 'user', status: raw.status === 'deactivated' ? 'deactivated' : 'active' };
}

export interface Profile { displayName: string; createdAt: string }

export async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('display_name, created_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return { displayName: data?.display_name ?? '', createdAt: data?.created_at ?? '' };
}

export async function saveDisplayName(userId: string, name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 30) throw new Error('Display name must be 1–30 characters.');
  const { error } = await supabase.from('profiles').update({ display_name: clean }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  // Keep the auth metadata in step so the sidebar name updates everywhere.
  await supabase.auth.updateUser({ data: { username: clean } });
}

export async function touchLastSeen(userId: string) {
  await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', userId)
    .then(() => undefined, () => undefined);
}

export interface ExtraPrefs { diets: Diet[]; cuisines: string[]; maxMinutes: number | null; notify: { tips: boolean; feedback_replies: boolean }; textSize: 'normal' | 'large' }
export const defaultExtraPrefs = (): ExtraPrefs => ({ diets: [], cuisines: [], maxMinutes: null, notify: { tips: false, feedback_replies: true }, textSize: 'normal' });

export async function loadExtraPrefs(userId: string): Promise<ExtraPrefs> {
  const { data, error } = await supabase.from('preferences').select('diets, cuisines, max_minutes, notify, text_size').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return defaultExtraPrefs();
  const notify = (data.notify ?? {}) as Partial<ExtraPrefs['notify']>;
  return {
    diets: (data.diets ?? []) as Diet[], cuisines: data.cuisines ?? [], maxMinutes: data.max_minutes ?? null,
    notify: { tips: notify.tips ?? false, feedback_replies: notify.feedback_replies ?? true },
    textSize: data.text_size === 'large' ? 'large' : 'normal',
  };
}

export async function saveExtraPrefs(userId: string, p: ExtraPrefs) {
  const { error } = await supabase.from('preferences').update({
    diets: p.diets, cuisines: p.cuisines, max_minutes: p.maxMinutes, notify: p.notify, text_size: p.textSize, updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export function applyTextSize(size: 'normal' | 'large') {
  document.documentElement.dataset.textSize = size;
}

// ---- Feedback ----
export type FeedbackKind = 'rating' | 'suggestion' | 'complaint' | 'bug';
export const FEEDBACK_KINDS: { key: FeedbackKind; label: string }[] = [
  { key: 'rating', label: 'Review / rating' }, { key: 'suggestion', label: 'Suggestion' },
  { key: 'complaint', label: 'Complaint' }, { key: 'bug', label: 'Bug report' },
];
export interface FeedbackRow { id: number; kind: FeedbackKind; rating: number | null; subject: string; message: string; recipe_slug: string | null; status: string; admin_note: string; created_at: string }

export function validateFeedback(f: { kind: FeedbackKind; rating: number | null; message: string; subject: string }): string | null {
  if (f.kind === 'rating' && !f.rating) return 'Choose a star rating.';
  if (!f.message.trim()) return 'Write a short message.';
  if (f.message.length > 2000) return 'Keep the message under 2,000 characters.';
  if (f.subject.length > 120) return 'Keep the subject under 120 characters.';
  return null;
}

export async function submitFeedback(f: { kind: FeedbackKind; rating: number | null; subject: string; message: string; recipeSlug?: string | null }) {
  const { error } = await supabase.from('feedback').insert({
    kind: f.kind, rating: f.rating, subject: f.subject.trim(), message: f.message.trim(), recipe_slug: f.recipeSlug ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listMyFeedback(userId: string): Promise<FeedbackRow[]> {
  const { data, error } = await supabase.from('feedback').select('id, kind, rating, subject, message, recipe_slug, status, admin_note, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackRow[];
}

// ---- Public settings (announcement banner) ----
export async function loadAnnouncement(): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'general').maybeSingle();
  const text = (data?.value as { announcement?: string } | undefined)?.announcement;
  return typeof text === 'string' ? text.trim() : '';
}

// ---- Self-service account actions ----
export async function verifyPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Your current password is incorrect.');
}

export async function changePassword(email: string, current: string, next: string) {
  if (next.length < 8) throw new Error('Use at least 8 characters for the new password.');
  if (next === current) throw new Error('Your new password must be different from your current one.');
  await verifyPassword(email, current);
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error(error.message);
  await supabase.auth.signOut({ scope: 'others' });
}

export async function deleteMyAccount(email: string, password: string) {
  await verifyPassword(email, password);
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}

export async function exportMyData(userId: string) {
  const tables = ['profiles', 'preferences', 'pantry_items', 'saved_recipes', 'recipe_events', 'feedback'] as const;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), note: 'Your Dish-Wish data. Passwords are never exported.' };
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').eq('user_id', userId);
    if (error) throw new Error(`${t}: ${error.message}`);
    out[t] = data;
  }
  return out;
}
