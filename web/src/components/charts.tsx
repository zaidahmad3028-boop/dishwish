// Recharts wrappers in the Dish-Wish palette. Charts get a fixed height so they never collapse.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const PALETTE = ['#c81e3a', '#f97316', '#f59e0b', '#16a34a', '#8b5cf6', '#0ea5e9', '#a8a29e'];
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Marks about seven points along the line, always including the last one.
const sparseDot = (count: number) => {
  const step = Math.max(1, Math.round(count / 6));
  return (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index = 0 } = props;
    const keep = (count - 1 - index) % step === 0;
    if (!keep || cx === undefined || cy === undefined) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={4.5} fill="#fff" stroke="#c81e3a" strokeWidth={2.5} />;
  };
};

const Callout = ({ text }: { text: string }) => (
  <figcaption className="absolute right-2 top-0 z-10 rounded-lg border border-rose-200 bg-white/90 px-2.5 py-0.5 text-[0.82rem] font-semibold text-crimson-deep shadow-sm">{text}</figcaption>
);

export function AreaTrend<T extends object>({ data, x, y, label, height = 220, callout }: { data: T[]; x: keyof T; y: keyof T; label: string; height?: number; callout?: string }) {
  return (
    <figure aria-label={label} role="img" className="relative" style={{ height }}>
      {callout && <Callout text={callout} />}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${String(y)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" stopOpacity={0.45} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f5e6e1" vertical={false} />
          <XAxis dataKey={String(x)} tickFormatter={(v) => (typeof v === 'string' && /^\d{4}-/.test(v) ? shortDay(v) : String(v))} tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(v) => (typeof v === 'string' && /^\d{4}-/.test(v) ? shortDay(v) : String(v))} />
          <Area type="monotone" dataKey={String(y)} name={label} stroke="#c81e3a" strokeWidth={2.5} fill={`url(#fill-${String(y)})`} dot={sparseDot(data.length)} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function BarTrend<T extends object>({ data, x, y, label, height = 220, colorful = false, callout }: {
  data: T[]; x: keyof T; y: keyof T; label: string; height?: number; colorful?: boolean; callout?: string;
}) {
  const fillId = `bar-${String(y)}`;
  return (
    <figure aria-label={label} role="img" className="relative" style={{ height }}>
      {callout && <Callout text={callout} />}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" /><stop offset="100%" stopColor="#fda4a4" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f5e6e1" vertical={false} />
          <XAxis dataKey={String(x)} tickFormatter={(v) => (typeof v === 'string' && /^\d{4}-/.test(v) ? shortDay(v) : String(v).replace(/\s*\(.*\)$/, ''))}
            tick={{ fontSize: 11 }} minTickGap={8} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(v) => (typeof v === 'string' && /^\d{4}-/.test(v) ? shortDay(v) : String(v))} />
          <Bar dataKey={String(y)} name={label} radius={[6, 6, 0, 0]} fill={`url(#${fillId})`}>
            {colorful && data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; value: string | number; color: string }[] }) {
  return (
    <ul className="space-y-1 text-[0.86rem]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: i.color }} />{i.label}</span>
          <span className="font-semibold">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
