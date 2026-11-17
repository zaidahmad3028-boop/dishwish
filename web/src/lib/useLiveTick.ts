// Keeps admin pages current. The returned number goes up whenever the data may have changed: right away on a
// Supabase Realtime event, every 30 seconds as a fallback, and when the admin comes back to the tab. Pages reload
// quietly on each change, without a spinner, so forms and scroll position stay as they are.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const LIVE_INTERVAL_MS = 30000;
const MIN_GAP_MS = 1000;
let channelCount = 0;

export function useLiveTick(tables: readonly string[] = [], intervalMs = LIVE_INTERVAL_MS) {
  const [tick, setTick] = useState(0);
  const key = tables.join(',');

  useEffect(() => {
    // A burst of changes causes one reload, not one per row.
    let last = 0;
    let pending: number | undefined;
    const bump = () => {
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait <= 0) { last = Date.now(); setTick((t) => t + 1); return; }
      if (pending === undefined) pending = window.setTimeout(() => { pending = undefined; last = Date.now(); setTick((t) => t + 1); }, wait);
    };
    const visible = () => document.visibilityState === 'visible';
    const timer = window.setInterval(() => { if (visible()) bump(); }, intervalMs);
    const onReturn = () => { if (visible()) bump(); };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);

    channelCount += 1;
    const names = key ? key.split(',') : [];
    const channel = names.length ? supabase.channel(`admin-live-${channelCount}`) : null;
    if (channel) {
      for (const table of names) channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump);
      channel.subscribe();
    }

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(pending);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [key, intervalMs]);

  return tick;
}
