// Image uploads to Cloudflare R2 through the Dish-Wish API. The browser first crops and resizes the
// photo to its standard size; the API checks the user (and the admin role for recipe images) and the
// file, stores it in R2 and returns its public https URL.
import { API_URL } from './recipes';
import { supabase } from './supabase';

export type UploadFolder = 'recipes' | 'ingredients';
const MAX_BYTES = 3 * 1024 * 1024;

// Standard sizes. Recipe images are always 3:2 landscape, 800×533; profile photos are square.
export const IMAGE_SIZES = {
  recipe: { width: 800, height: 533 },
  avatar: { width: 400, height: 400 },
} as const;

// Centre-crop to the target shape (like CSS object-fit: cover), resize and re-encode as WebP.
// Falls back to the original file where the browser can't (very old browsers, tests).
export async function cropToSize(file: File, width: number, height: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const sw = width / scale, sh = height / scale;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.82));
    return blob && blob.type === 'image/webp' ? blob : file;
  } catch {
    return file;
  }
}

async function send(path: string, file: File, size: { width: number; height: number }): Promise<string> {
  if (!/^image\/(webp|jpeg|png)$/.test(file.type)) throw new Error('Choose a WebP, JPEG or PNG image.');
  const body = await cropToSize(file, size.width, size.height);
  if (body.size > MAX_BYTES) throw new Error('The image is still larger than 3 MB after resizing; choose a smaller one.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Log in to upload images.');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST', body, headers: { 'Content-Type': body.type || file.type, Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Could not reach the Dish-Wish API to upload the image.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : `Upload failed (HTTP ${response.status}).`);
  return payload.url as string;
}

// Super Admin: a recipe or ingredient photo, stored as <folder>/<name>-<random>.webp at 800×533.
export function uploadImage(file: File, folder: UploadFolder, name: string): Promise<string> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'image';
  return send(`/api/uploads/image?folder=${folder}&name=${encodeURIComponent(slug)}`, file, IMAGE_SIZES.recipe);
}

// Any signed-in user: their own profile photo, stored as avatars/<user id>-<random>.webp at 400×400.
export function uploadAvatar(file: File): Promise<string> {
  return send('/api/uploads/avatar', file, IMAGE_SIZES.avatar);
}
