import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Values copied unchanged from .env.example ("YOUR_...") count as missing.
export const isRealEnvValue = (v: string | undefined) => Boolean(v && v.trim() && !/YOUR_/i.test(v));

export const supabaseConfigured = isRealEnvValue(url) && isRealEnvValue(anonKey);

// Placeholders keep the module importable when env vars are missing; the app
// shows a setup notice instead of calling Supabase in that case.
export const supabase = createClient(supabaseConfigured && url ? url : 'http://localhost:54321', supabaseConfigured && anonKey ? anonKey : 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
