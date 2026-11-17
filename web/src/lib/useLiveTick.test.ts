import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitRealtime, supabase } from '../test/supabaseMock';
import { LIVE_INTERVAL_MS, useLiveTick } from './useLiveTick';

vi.mock('./supabase', () => import('../test/supabaseMock'));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000); });
afterEach(() => { vi.useRealTimers(); });

describe('useLiveTick', () => {
  it('reloads on the fallback timer', () => {
    const { result, unmount } = renderHook(() => useLiveTick());
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(LIVE_INTERVAL_MS); });
    expect(result.current).toBe(1);
    unmount();
    act(() => { vi.advanceTimersByTime(LIVE_INTERVAL_MS); });
    expect(result.current).toBe(1);
  });

  it('reloads right away on a change to a watched table only', () => {
    const { result, unmount } = renderHook(() => useLiveTick(['feedback']));
    act(() => { emitRealtime('recipes'); });
    expect(result.current).toBe(0);
    act(() => { emitRealtime('feedback'); });
    expect(result.current).toBe(1);
    unmount();
  });

  it('turns a burst of changes into one reload', () => {
    const { result, unmount } = renderHook(() => useLiveTick(['feedback']));
    act(() => { for (let i = 0; i < 20; i += 1) emitRealtime('feedback'); });
    expect(result.current).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(2);
    unmount();
  });

  it('does not poll while the tab is hidden, and catches up on return', () => {
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { result, unmount } = renderHook(() => useLiveTick());
    act(() => { vi.advanceTimersByTime(LIVE_INTERVAL_MS * 3); });
    expect(result.current).toBe(0);
    state.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe(1);
    state.mockRestore();
    unmount();
  });

  it('removes its channel when the page closes', () => {
    const { unmount } = renderHook(() => useLiveTick(['feedback']));
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
