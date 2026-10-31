import { ChefHat } from 'lucide-react';

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl text-white shadow-lg shadow-rose-900/20"
      style={{ width: size, height: size, backgroundImage: 'linear-gradient(135deg, var(--color-crimson), var(--color-ember))' }}
    >
      <ChefHat size={size * 0.5} aria-hidden="true" />
    </span>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-3">
      <LogoMark />
      <span className="font-display text-xl font-extrabold leading-none tracking-tight">
        Dish<span className="text-gradient">Wish</span>
      </span>
    </span>
  );
}
