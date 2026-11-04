// Recipe and ingredient imagery. A recipe shows its own photo (admin image_url, else the bundled/R2
// photo); without one, or if it fails to load, a neutral Dish-Wish default (a covered plate) is shown,
// so no other dish's photo is ever passed off as this one.
import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { Apple, Bean, Beef, Carrot, Croissant, Droplet, Drumstick, Egg, Fish, Flame, Leaf, Milk, Nut, Soup, Wheat, type LucideIcon } from 'lucide-react';
import { imageUrl as assetUrl, ingredientImage } from '../lib/images';

export const DEFAULT_RECIPE_IMAGE = assetUrl('recipes/default.svg');

// A picture can fail on a weak connection, so try it once more before giving up. True means a retry is on its way.
function retryOnce(img: HTMLImageElement): boolean {
  if (img.dataset.retried) return false;
  img.dataset.retried = '1';
  const url = `${img.src}${img.src.includes('?') ? '&' : '?'}retry=1`;
  setTimeout(() => { img.src = url; }, 800);
  return true;
}

function showDefaultOnError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src.endsWith(DEFAULT_RECIPE_IMAGE) || retryOnce(img)) return;
  img.src = DEFAULT_RECIPE_IMAGE;
}

function RecipeImg({ src, name, category, className }: { src?: string | null; name: string; category: string; className: string }) {
  return <img src={src || DEFAULT_RECIPE_IMAGE} alt={src ? name : `${name} (${category}, no photo yet)`} loading="lazy"
    onError={showDefaultOnError} className={`bg-stone-100 object-cover object-center ${className}`} />;
}

// Recipe images are standardised to 3:2 landscape (800×533): bundled photos are prepared at that size and
// uploads are cropped to it (lib/uploads.ts), so every frame below shows the same picture without surprises.
// Stand-alone recipe image (detail page, admin): full width, 3:2, rounded 1rem, cover-cropped.
export function DishArt({ category, imageUrl, name, className = '' }: { category: string; imageUrl?: string | null; name: string; className?: string }) {
  return <RecipeImg src={imageUrl} name={name} category={category} className={`aspect-[3/2] w-full rounded-2xl ${className}`} />;
}

// The top of every recipe card: edge to edge (the card itself has no padding above it), rounded top corners.
// The frame is exactly 3:2 like the pictures, so the whole dish shows at any card width. Badges/buttons go in `children`.
// The card <li> must be `overflow-hidden p-0` and put its text in its own padded block below.
export function RecipeCardImage({ category, imageUrl, name, rounded = 'rounded-t-xl', children }:
  { category: string; imageUrl?: string | null; name: string; rounded?: string; children?: ReactNode }) {
  return (
    <div className={`relative aspect-[3/2] w-full overflow-hidden ${rounded}`}>
      <RecipeImg src={imageUrl} name={name} category={category} className="block h-full w-full" />
      {children}
    </div>
  );
}

// Fallback icons when an ingredient has no photo. Display categories (13) plus the old names (8).
const INGREDIENT_ICON: Record<string, LucideIcon> = {
  'Meat & Poultry': Drumstick, 'Fish & Seafood': Fish, Vegetables: Carrot, 'Fresh Herbs': Leaf, Fruits: Apple,
  'Dairy & Eggs': Milk, 'Grains & Flours': Wheat, 'Bakery & Baking': Croissant, 'Pulses & Lentils': Bean,
  'Nuts, Seeds & Dry Fruits': Nut, 'Spices & Masalas': Flame, 'Sauces & Condiments': Soup, 'Oils, Ghee & Sweeteners': Droplet,
  Meat: Drumstick, Dairy: Milk, Grocery: Wheat, Spices: Flame, 'Pulses & Nuts': Nut, 'Oils & Sauces': Droplet,
};
const INGREDIENT_TINT: Record<string, string> = {
  'Meat & Poultry': 'bg-rose-100 text-rose-700', 'Fish & Seafood': 'bg-sky-100 text-sky-700', 'Fresh Herbs': 'bg-emerald-100 text-emerald-700',
  'Dairy & Eggs': 'bg-sky-100 text-sky-700', 'Grains & Flours': 'bg-amber-100 text-amber-700', 'Bakery & Baking': 'bg-orange-100 text-orange-800',
  'Pulses & Lentils': 'bg-yellow-100 text-yellow-800', 'Nuts, Seeds & Dry Fruits': 'bg-stone-200 text-stone-700',
  'Spices & Masalas': 'bg-red-100 text-red-700', 'Sauces & Condiments': 'bg-lime-100 text-lime-800', 'Oils, Ghee & Sweeteners': 'bg-yellow-100 text-yellow-700',
  Meat: 'bg-rose-100 text-rose-700', Vegetables: 'bg-green-100 text-green-700', Fruits: 'bg-orange-100 text-orange-700',
  Dairy: 'bg-sky-100 text-sky-700', Grocery: 'bg-amber-100 text-amber-700', Spices: 'bg-red-100 text-red-700',
  'Pulses & Nuts': 'bg-yellow-100 text-yellow-800', 'Oils & Sauces': 'bg-lime-100 text-lime-800',
};

const CATEGORY_COLOR: Record<string, string> = {
  'Meat & Poultry': 'text-orange-700', 'Fish & Seafood': 'text-sky-600', Vegetables: 'text-green-600', 'Fresh Herbs': 'text-emerald-600',
  Fruits: 'text-red-600', 'Dairy & Eggs': 'text-sky-500', 'Grains & Flours': 'text-amber-600', 'Bakery & Baking': 'text-orange-500',
  'Pulses & Lentils': 'text-orange-600', 'Nuts, Seeds & Dry Fruits': 'text-amber-800', 'Spices & Masalas': 'text-red-500',
  'Sauces & Condiments': 'text-lime-600', 'Oils, Ghee & Sweeteners': 'text-yellow-500',
  Meat: 'text-orange-700', Dairy: 'text-sky-500', Grocery: 'text-amber-600', Spices: 'text-red-500', 'Pulses & Nuts': 'text-orange-600', 'Oils & Sauces': 'text-yellow-500',
};

// Small coloured icon beside a category name (category lists).
export function CategoryIcon({ category, size = 24 }: { category: string; size?: number }) {
  const Icon = INGREDIENT_ICON[category] ?? Leaf;
  return <Icon size={size} className={`shrink-0 ${CATEGORY_COLOR[category] ?? 'text-stone-500'}`} strokeWidth={2} aria-hidden="true" />;
}

export function ingredientIcon(name: string, category: string): LucideIcon {
  const lower = name.toLowerCase();
  if (lower.includes('fish') || lower.includes('prawn')) return Fish;
  if (lower.includes('egg')) return Egg;
  if (lower.includes('beef') || lower.includes('mutton')) return Beef;
  if ((category === 'Vegetables' || category === 'Fresh Herbs') && /(coriander|mint|methi|spinach|saag|leaves|dill|lettuce)/.test(lower)) return Leaf;
  return INGREDIENT_ICON[category] ?? Leaf;
}

// Ingredient picture as in the reference designs: the item floats on the card, no circle or box. Pictures are
// transparent cut-outs (scripts/slice_ingredient_sheets.py); multiply blending also hides a plain white background.
export function IngredientBadge({ name, category, size = 44 }: { name: string; category: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const photo = ingredientImage(name);
  if (photo && !failed) return <IngredientPicture src={photo} onFail={() => setFailed(true)} style={{ width: size, height: size }} />;
  const Icon = ingredientIcon(name, category);
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${INGREDIENT_TINT[category] ?? 'bg-stone-100 text-stone-600'}`}
      style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={size * 0.5} />
    </span>
  );
}

function IngredientPicture({ src, className = '', style, onFail }: { src: string; className?: string; style?: CSSProperties; onFail: () => void }) {
  return <img src={src} alt="" aria-hidden="true" style={style} onError={(e) => { if (!retryOnce(e.currentTarget)) onFail(); }}
    className={`block shrink-0 object-contain mix-blend-multiply ${className}`} />;
}

// The large picture on an ingredient card (selection grid): fills its (relative, sized) parent; icon fallback.
export function IngredientHero({ name, category }: { name: string; category: string }) {
  const [failed, setFailed] = useState(false);
  const photo = ingredientImage(name);
  if (photo && !failed) return <IngredientPicture src={photo} onFail={() => setFailed(true)} className="absolute inset-0 h-full w-full" />;
  return <span className="absolute inset-0 grid place-items-center"><IngredientBadge name={name} category={category} size={64} /></span>;
}
