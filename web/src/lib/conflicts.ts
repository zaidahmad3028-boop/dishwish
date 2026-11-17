// Warnings when a chosen ingredient works against the cook's own choices: taste, allergies, calories or diet.
// Allergy conflicts block the ingredient; the others only warn, and the cook may proceed.
import type { Diet } from './curatedApi';
import { blockReason, type Level, type Preferences, type TasteKey } from './preferences';

export interface ConflictItem {
  name: string; category: string; kcal: number; carbs?: number; allergens: string[];
  sweet?: number; salty?: number; sour?: number; spicy?: number;
}
export type ConflictKind = 'allergy' | 'taste' | 'calories' | 'diet';
export interface Conflict { kind: ConflictKind; title: string; message: string }

export const TASTE_LABEL: Record<TasteKey, string> = { sweet: 'Sweet', salty: 'Salty', sour: 'Sour', spicy: 'Spicy' };
const STRONG = 7; // catalog taste score (0-10) from which an ingredient clearly tastes of something
const RICH_KCAL = 400; // per 100 g: oils, ghee, nuts, sugar
const MEATY = /meat|poultry|fish|seafood|chicken|beef|mutton|lamb|keema|prawn|shrimp/i;

export function ingredientConflicts(item: ConflictItem, ctx: {
  tastes: Record<TasteKey, Level | null>; prefs?: Pick<Preferences, 'allergens' | 'customAllergens'> | null; diets?: Diet[]; maxKcal?: number | null;
}): Conflict[] {
  const out: Conflict[] = [];
  const reason = ctx.prefs ? blockReason(item.name, item.allergens, ctx.prefs) : null;
  if (reason) out.push({ kind: 'allergy', title: 'Allergy Conflict', message: `${item.name} goes against your allergy settings (${reason}), so it can't be added.` });

  const high = (Object.keys(TASTE_LABEL) as TasteKey[]).filter((t) => ctx.tastes[t] === 'high');
  for (const t of Object.keys(TASTE_LABEL) as TasteKey[]) {
    const score = item[t] ?? 0;
    if (score < STRONG) continue;
    if (ctx.tastes[t] === 'low') {
      out.push({ kind: 'taste', title: 'Taste Conflict', message: `You selected “${TASTE_LABEL[t]}: Low”, but ${item.name} is very ${t} and might make the recipe too ${t}.` });
    } else if (ctx.tastes[t] == null && high.length) {
      const other = high[0];
      out.push({ kind: 'taste', title: 'Taste Conflict', message: `You selected “${TASTE_LABEL[other]}: High”, but adding ${item.name} might make the recipe too ${t} and not match your taste.` });
    }
  }

  if (ctx.maxKcal && item.kcal >= RICH_KCAL) {
    out.push({ kind: 'calories', title: 'Calorie Conflict', message: `${item.name} has ${Math.round(item.kcal)} kcal per 100 g, which makes staying under ${ctx.maxKcal} kcal per serving harder.` });
  }

  const diets = ctx.diets ?? [];
  const meaty = MEATY.test(item.category) || MEATY.test(item.name);
  if (diets.includes('vegetarian') && meaty) {
    out.push({ kind: 'diet', title: 'Diet Conflict', message: `${item.name} isn't vegetarian, but you chose a Vegetarian diet.` });
  } else if (diets.includes('vegan') && (meaty || item.allergens.some((a) => a === 'milk' || a === 'eggs'))) {
    out.push({ kind: 'diet', title: 'Diet Conflict', message: `${item.name} isn't vegan, but you chose a Vegan diet.` });
  }
  if ((diets.includes('keto') || diets.includes('low_carb')) && (item.carbs ?? 0) >= 50) {
    out.push({ kind: 'diet', title: 'Diet Conflict', message: `${item.name} is high in carbohydrates (${Math.round(item.carbs ?? 0)} g per 100 g), which doesn't fit a ${diets.includes('keto') ? 'Keto' : 'Low Carb'} diet.` });
  }
  return out;
}

// Heading for the alert: the kind of the first problem, as in the design ("Taste Conflict Detected").
export const conflictHeading = (list: Conflict[]) => (list.length ? `${list[0].title} Detected` : '');
