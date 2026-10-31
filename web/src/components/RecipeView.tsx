import { useState, type ReactNode } from 'react';
import { Check, Clock, Copy, Download, Heart, Link2, ShoppingBasket, Users } from 'lucide-react';
import type { Preferences } from '../lib/preferences';
import { formatGrams } from '../lib/pantryApi';
import { dailyShare, macroShares, shoppingList, shoppingText, type Recipe, type ShoppingLine } from '../lib/recipes';

export function NutritionNote() {
  return <p className="mt-6 text-center text-xs text-stone-500">Nutrition values are approximate. Not medical advice.</p>;
}

function Bar({ label, value, unit, share, color }: { label: string; value: number; unit: string; share: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span>{value} {unit} · {share}%</span></div>
      <div className="mt-1 h-2 rounded-full bg-stone-200/70" role="presentation">
        <div className="h-2 rounded-full" style={{ width: `${share}%`, background: color }} />
      </div>
    </div>
  );
}

export function NutritionPanel({ recipe, prefs }: { recipe: Recipe; prefs: Pick<Preferences, 'calorieTier'> | null }) {
  const m = recipe.nutrition.per_serving;
  const shares = macroShares(m);
  const target = recipe.nutrition.meal_target_kcal;
  const ofDay = dailyShare(recipe, prefs);
  const fit = target ? Math.min(100, Math.round((m.kcal / target) * 100)) : null;
  return (
    <section aria-label="Nutrition per serving" className="rounded-[24px] bg-white/70 p-5">
      <h3 className="font-display text-lg font-extrabold">Nutrition per serving</h3>
      <p className="mt-1 font-display text-4xl font-extrabold"><span className="text-gradient">{m.kcal}</span> <span className="text-base font-semibold text-stone-500">kcal</span></p>
      {target && (
        <div className="mt-2">
          <p className="text-sm text-stone-600">Meal target {target} kcal{ofDay !== null && ` · ${ofDay}% of your day`}</p>
          <div className="mt-1 h-2 rounded-full bg-stone-200/70"><div className="h-2 rounded-full bg-emerald-400" style={{ width: `${fit}%` }} /></div>
        </div>
      )}
      <div className="mt-4 space-y-3">
        <Bar label="Protein" value={m.protein} unit="g" share={shares.protein} color="var(--color-mint)" />
        <Bar label="Carbs" value={m.carbs} unit="g" share={shares.carbs} color="var(--color-ember)" />
        <Bar label="Fat" value={m.fat} unit="g" share={shares.fat} color="var(--color-crimson)" />
      </div>
      <p className="mt-3 text-xs text-stone-500">Whole recipe: {Math.round(recipe.nutrition.total.kcal)} kcal for {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}.</p>
    </section>
  );
}

function ShoppingPanel({ recipe, lines, onAddToPantry }: { recipe: Recipe; lines: ShoppingLine[]; onAddToPantry?: (lines: ShoppingLine[]) => Promise<void> }) {
  const [status, setStatus] = useState('');
  if (lines.length === 0) {
    return <p className="flex items-center gap-2 rounded-[24px] bg-emerald-50/90 p-4 text-sm font-semibold text-emerald-800"><Check size={18} />You have everything for this recipe.</p>;
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(shoppingText(recipe, lines)); setStatus('List copied.'); } catch { setStatus('Copy is not available in this browser.'); }
  };
  const bought = async () => {
    if (!onAddToPantry) return;
    try { await onAddToPantry(lines); setStatus('Added to your pantry.'); } catch (e) { setStatus((e as Error).message); }
  };
  return (
    <section aria-label="Shopping list" className="rounded-[24px] bg-white/70 p-5">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold"><ShoppingBasket size={20} />Shopping list</h3>
      <ul className="mt-3 space-y-1.5 text-sm">
        {lines.map((l) => (
          <li key={l.name} className="flex justify-between gap-3">
            <span>{l.name}</span>
            <span className="font-semibold">{formatGrams(l.buyG)}{l.haveG > 0 && <span className="font-normal text-stone-500"> (have {formatGrams(l.haveG)})</span>}</span>
          </li>
        ))}
      </ul>
      <div className="print-hide mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={copy}><Copy size={16} />Copy list</button>
        {onAddToPantry && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={bought}><Check size={16} />I bought these</button>}
      </div>
      {status && <p role="status" className="mt-2 text-sm text-stone-600">{status}</p>}
    </section>
  );
}

export interface RecipeActions {
  onSave?: () => Promise<void>;
  saved?: boolean;
  onShare?: () => Promise<string>;
  onAddToPantry?: (lines: ShoppingLine[]) => Promise<void>;
}

export function RecipeView({ recipe, prefs, pantryByName, actions = {}, children }: {
  recipe: Recipe;
  prefs: Pick<Preferences, 'calorieTier'> | null;
  pantryByName?: ReadonlyMap<string, number>;
  actions?: RecipeActions;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const lines = pantryByName ? shoppingList(recipe, pantryByName) : null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await fn(); } catch (e) { setMessage((e as Error).message || 'Something went wrong. Try again.'); } finally { setBusy(false); }
  };
  const share = () => run(async () => {
    const url = await actions.onShare!();
    setLink(url);
    try { await navigator.clipboard.writeText(url); setMessage('Share link copied.'); } catch { setMessage('Share link ready.'); }
  });

  return (
    <article className="print-area glass p-6 sm:p-8" aria-label={recipe.title}>
      {children}
      <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{recipe.title}</h2>
      <p className="mt-2 flex flex-wrap gap-4 text-sm text-stone-600">
        <span className="inline-flex items-center gap-1.5"><Clock size={16} />{recipe.minutes} min</span>
        <span className="inline-flex items-center gap-1.5"><Users size={16} />Serves {recipe.servings}</span>
      </p>

      <div className="print-hide mt-4 flex flex-wrap gap-2">
        {actions.onSave && (
          <button type="button" className={actions.saved ? 'btn-ghost' : 'btn-primary'} disabled={busy || actions.saved} onClick={() => run(actions.onSave!)}>
            <Heart size={18} fill={actions.saved ? 'currentColor' : 'none'} />{actions.saved ? 'Saved' : 'Save recipe'}
          </button>
        )}
        {actions.onShare && <button type="button" className="btn-ghost" disabled={busy} onClick={share}><Link2 size={18} />Share</button>}
        <button type="button" className="btn-ghost" onClick={() => window.print()}><Download size={18} />Download PDF</button>
      </div>
      {message && <p role="status" className="print-hide mt-2 text-sm text-stone-600">{message}</p>}
      {link && <input readOnly className="field print-hide mt-2 text-sm" value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <h3 className="font-display text-xl font-extrabold">Ingredients</h3>
          <ul className="mt-3 divide-y divide-stone-200/70 rounded-2xl bg-white/60">
            {recipe.ingredients.map((i) => {
              const have = pantryByName?.get(i.name) ?? 0;
              return (
                <li key={i.name} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span>{i.name}{(i.role === 'main' || i.role === 'yours') && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">your pick</span>}</span>
                  <span className="flex items-center gap-2 font-semibold">
                    {formatGrams(i.grams)}
                    {pantryByName && (have >= i.grams
                      ? <Check size={16} className="text-emerald-600" aria-label="In pantry" />
                      : <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Need more" />)}
                  </span>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-6 font-display text-xl font-extrabold">Method</h3>
          <ol className="mt-3 space-y-3">
            {recipe.steps.map((step, n) => (
              <li key={n} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-orange-500 text-sm font-bold text-white">{n + 1}</span>
                <span className="pt-0.5 text-stone-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-4">
          <NutritionPanel recipe={recipe} prefs={prefs} />
          {lines && <ShoppingPanel recipe={recipe} lines={lines} onAddToPantry={actions.onAddToPantry} />}
        </div>
      </div>
      <NutritionNote />
    </article>
  );
}
