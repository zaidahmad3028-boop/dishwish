import { afterEach, describe, expect, it, vi } from 'vitest';
import html from '../index.html?raw';
import manifestText from '../public/manifest.webmanifest?raw';
import sw from '../public/sw.js?raw';
import { registerServiceWorker } from './registerServiceWorker';

const manifest = JSON.parse(manifestText);
const icons = Object.keys(import.meta.glob('../public/icons/*.png')).map((p) => p.replace('../public', ''));

describe('web app manifest', () => {
  it('is installable: name, standalone, start URL and 192/512 icons that exist', () => {
    expect(manifest).toMatchObject({ name: 'DishWish', short_name: 'DishWish', display: 'standalone', start_url: '/kitchen' });
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect(icons).toContain(icon.src);
  });

  it('is linked from index.html with an Apple touch icon', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(icons).toContain('/icons/apple-touch-icon.png');
  });

  it('service worker never caches cross-origin (Supabase/API) requests', () => {
    expect(sw).toContain('url.origin !== self.location.origin) return;');
  });
});

describe('registerServiceWorker', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing outside production builds', () => {
    const register = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    const add = vi.spyOn(window, 'addEventListener');
    registerServiceWorker();
    expect(add).not.toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('registers /sw.js on load in production', () => {
    vi.stubEnv('PROD', true);
    const register = vi.fn(async () => ({}));
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});
