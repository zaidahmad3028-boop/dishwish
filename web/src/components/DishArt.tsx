// Recipe and ingredient imagery. A recipe shows its own photo (admin image_url, else the bundled/R2
// photo); without one, or if it fails to load, a neutral Dish-Wish default (a covered plate) is shown,
// so no other dish's photo is ever passed off as this one.
import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { Apple, Bean, Beef, CakeSlice, Carrot, ChefHat, Cookie, Croissant, CupSoda, Droplet, Drumstick, Egg, Fish, Flame, Leaf, Milk, Nut, Soup, Wheat, type LucideIcon } from 'lucide-react';
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

// Recipes without their own photo get a named, tinted tile (never another dish's picture).
const DISH_ICON: Record<string, LucideIcon> = {
  'Main Course': ChefHat, Vegetables: Carrot, Lentils: Bean, Rice: Wheat, Snacks: Cookie, Desserts: CakeSlice,
  Breakfast: Egg, Soups: Soup, Salads: Leaf, Drinks: CupSoda,
};
const DISH_TINT: Record<string, string> = {
  'Main Course': 'from-[#fde3d8] via-[#fbd0c0] to-[#f7b9a3] text-[#b4231b]', Vegetables: 'from-[#e3f4df] via-[#cfeac6] to-[#b7dea9] text-green-800',
  Lentils: 'from-[#fdf0cf] via-[#fae1a6] to-[#f5cf7d] text-amber-800', Rice: 'from-[#fbf3df] via-[#f4e3bb] to-[#ecd29a] text-amber-900',
  Snacks: 'from-[#fde8cf] via-[#fbd5a9] to-[#f6bd80] text-orange-800', Desserts: 'from-[#fde4ee] via-[#f9cddd] to-[#f3b2c8] text-rose-800',
  Breakfast: 'from-[#fff3d6] via-[#ffe6ad] to-[#fdd681] text-amber-800',
};

function NoPhotoTile({ name, category, className }: { name: string; category: string; className: string }) {
  const Icon = DISH_ICON[category] ?? ChefHat;
  return (
    <div role="img" aria-label={`${name} (${category}, no photo yet)`}
      className={`relative grid place-items-center overflow-hidden bg-gradient-to-br ${DISH_TINT[category] ?? DISH_TINT['Main Course']} ${className}`}>
      <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/30" aria-hidden="true" />
      <span className="absolute -bottom-8 -left-4 h-28 w-28 rounded-full bg-white/25" aria-hidden="true" />
      <span className="relative flex flex-col items-center gap-1.5 px-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/80 shadow-sm"><Icon size={26} aria-hidden="true" /></span>
        <span className="font-display text-[1.05rem] font-bold leading-tight">{name}</span>
        <span className="text-[0.72rem] font-medium uppercase tracking-wide opacity-75">Photo coming soon</span>
      </span>
    </div>
  );
}

function RecipeImg({ src, name, category, className }: { src?: string | null; name: string; category: string; className: string }) {
  if (!src) return <NoPhotoTile name={name} category={category} className={className} />;
  return <img src={src} alt={name} loading="lazy"
    onError={showDefaultOnError} className={`bg-stone-100 object-cover object-center ${className}`} />;
}

// Recipe images are standardised to 3:2 landscape (800×533): bundled photos are prepared at that size and
// uploads are cropped to it (lib/uploads.ts), so every frame below shows the same picture without surprises.
// Stand-alone recipe image (detail page, admin): full width, 3:2, rounded 1rem, cover-cropped.
export function DishArt({ category, imageUrl, name, className = '' }: { category: string; imageUrl?: string | null; name: string; className?: string }) {
  return <RecipeImg src={imageUrl} name={name} category={category} className={`aspect-[3/2] w-full rounded-2xl ${className}`} />;
}

// The top of every recipe card: edge to edge (the card itself has no padding above it), rounded top corners.
// The frame is exactly 3:2 like the pictures, so the whole dish shows at any card width; a design that crops wider passes `frame`.
// Badges/buttons go in `children`.
// The card <li> must be `overflow-hidden p-0` and put its text in its own padded block below.
// `zoomOut` is for frames much wider than the picture: it shrinks the dish to that share of the frame's width so the whole
// plate shows, with a soft blurred copy of the same picture filling the sides.
export function RecipeCardImage({ category, imageUrl, name, rounded = 'rounded-t-xl', frame = 'aspect-[3/2]', zoomOut, children }:
  { category: string; imageUrl?: string | null; name: string; rounded?: string; frame?: string; zoomOut?: number; children?: ReactNode }) {
  return (
    <div className={`relative ${frame} w-full overflow-hidden ${rounded}`}>
      {zoomOut && imageUrl ? (
        <>
          <img src={imageUrl || DEFAULT_RECIPE_IMAGE} alt="" aria-hidden="true" loading="lazy" onError={showDefaultOnError} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-90 blur-md" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 [mask-image:linear-gradient(90deg,transparent,black_9%,black_91%,transparent)]" style={{ width: `${zoomOut}%` }}>
            <RecipeImg src={imageUrl} name={name} category={category} className="block h-full w-full !bg-transparent" />
          </div>
        </>
      ) : <RecipeImg src={imageUrl} name={name} category={category} className="block h-full w-full" />}
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
