// Recipe and ingredient imagery. Admin-supplied https images are used when present; otherwise a
// category illustration stands in, so no stock photo is ever passed off as the actual dish.
import { Apple, Beef, CakeSlice, Carrot, CookingPot, Croissant, Droplet, Drumstick, Egg, Fish, Flame, Leaf, Milk, Nut,
  Salad, Soup, Wheat, type LucideIcon } from 'lucide-react';

const RECIPE_ART: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  'Main Course': { icon: CookingPot, from: '#f97316', to: '#c81e3a' },
  Rice: { icon: Wheat, from: '#fbbf24', to: '#ea580c' },
  Lentils: { icon: Soup, from: '#facc15', to: '#d97706' },
  Vegetables: { icon: Salad, from: '#4ade80', to: '#15803d' },
  Snacks: { icon: Flame, from: '#fb923c', to: '#dc2626' },
  Breakfast: { icon: Croissant, from: '#fcd34d', to: '#f59e0b' },
  Desserts: { icon: CakeSlice, from: '#f9a8d4', to: '#db2777' },
};

export function DishArt({ category, imageUrl, name, className = 'h-36' }: { category: string; imageUrl?: string | null; name: string; className?: string }) {
  if (imageUrl) return <img src={imageUrl} alt={name} loading="lazy" className={`w-full rounded-2xl object-cover ${className}`} />;
  const art = RECIPE_ART[category] ?? RECIPE_ART['Main Course'];
  const Icon = art.icon;
  return (
    <div role="img" aria-label={`${category} illustration for ${name}`}
      className={`relative grid w-full place-items-center overflow-hidden rounded-2xl ${className}`}
      style={{ backgroundImage: `radial-gradient(circle at 30% 20%, rgb(255 255 255 / 0.35), transparent 45%), linear-gradient(135deg, ${art.from}, ${art.to})` }}>
      <Icon size={56} className="text-white/90 drop-shadow" strokeWidth={1.5} aria-hidden="true" />
      <span className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/15" aria-hidden="true" />
    </div>
  );
}

const INGREDIENT_ICON: Record<string, LucideIcon> = {
  Meat: Drumstick, Vegetables: Carrot, Fruits: Apple, Dairy: Milk, Grocery: Wheat, Spices: Flame,
  'Pulses & Nuts': Nut, 'Oils & Sauces': Droplet,
};
const INGREDIENT_TINT: Record<string, string> = {
  Meat: 'bg-rose-100 text-rose-700', Vegetables: 'bg-green-100 text-green-700', Fruits: 'bg-orange-100 text-orange-700',
  Dairy: 'bg-sky-100 text-sky-700', Grocery: 'bg-amber-100 text-amber-700', Spices: 'bg-red-100 text-red-700',
  'Pulses & Nuts': 'bg-yellow-100 text-yellow-800', 'Oils & Sauces': 'bg-lime-100 text-lime-800',
};

export function ingredientIcon(name: string, category: string): LucideIcon {
  const lower = name.toLowerCase();
  if (lower.includes('fish') || lower.includes('prawn')) return Fish;
  if (lower.includes('egg')) return Egg;
  if (lower.includes('beef') || lower.includes('mutton')) return Beef;
  if (category === 'Vegetables' && /(coriander|mint|methi|spinach|saag|leaves|dill|lettuce)/.test(lower)) return Leaf;
  return INGREDIENT_ICON[category] ?? Leaf;
}

export function IngredientBadge({ name, category, size = 44 }: { name: string; category: string; size?: number }) {
  const Icon = ingredientIcon(name, category);
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${INGREDIENT_TINT[category] ?? 'bg-stone-100 text-stone-600'}`}
      style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={size * 0.5} />
    </span>
  );
}
