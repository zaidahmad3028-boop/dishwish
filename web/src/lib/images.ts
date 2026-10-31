// App imagery. Served from a Cloudflare R2 public bucket when VITE_IMAGE_BASE_URL is set
// (e.g. https://pub-xxxx.r2.dev); otherwise from the copies bundled in web/public/images.
// Keep the same folder layout in both places, e.g. kitchen/counter-hero.webp.
const base = (import.meta.env.VITE_IMAGE_BASE_URL || '/images').replace(/\/+$/, '');

export const imageUrl = (path: string) => `${base}/${path.replace(/^\/+/, '')}`;

export const IMAGES = {
  kitchenHero: 'kitchen/counter-hero.webp',
} as const;
