// Shared building blocks for the dashboard pages (user and admin), styled by the tokens in styles.css.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X, type LucideIcon } from 'lucide-react';

export function PageHeader({ title, accent, subtitle, icon: Icon, actions }: {
  title: string; accent?: string; subtitle?: string; icon?: LucideIcon; actions?: ReactNode;
}) {
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-4 lg:pr-36">
      <div className="flex items-start gap-3">
        {Icon && <Icon size={52} className="mt-1 hidden shrink-0 text-crimson sm:block" strokeWidth={1.7} aria-hidden="true" />}
        <div>
          <h1 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
            {title}{accent && <> <span className="text-crimson">{accent}</span></>}
          </h1>
          {subtitle && <p className="mt-1 text-stone-800 lg:text-[1.35rem]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, icon: Icon, iconClass = 'text-crimson', action, className = '', children, id }: {
  title?: ReactNode; icon?: LucideIcon; iconClass?: string; action?: ReactNode; className?: string; children: ReactNode; id?: string;
}) {
  const headingId = useId();
  return (
    <section className={`card p-5 ${className}`} aria-labelledby={title ? headingId : undefined} id={id}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 id={headingId} className="card-title">{Icon && <Icon size={30} className={iconClass} aria-hidden="true" />}{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  red: 'bg-rose-50 text-crimson', green: 'bg-green-50 text-green-600', amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', gray: 'bg-stone-100 text-stone-600',
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({ icon: Icon, value, label, tone = 'red', note, trend }: {
  icon: LucideIcon; value: ReactNode; label: string; tone?: Tone; note?: ReactNode; trend?: string | null;
}) {
  const down = trend?.startsWith('-');
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={`grid h-[4.4rem] w-[4.4rem] shrink-0 place-items-center rounded-full ${TONES[tone]}`}><Icon size={40} strokeWidth={1.7} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[1.75rem] font-bold leading-none tracking-tight">{value}</p>
        <p className="mt-1 text-[0.98rem] leading-tight text-stone-700">{label}</p>
        {trend && <p className={`badge mt-1.5 ${down ? 'badge-red' : 'badge-green'} !text-[0.82rem]`}>{down ? <ArrowDown size={13} /> : <ArrowUp size={13} />}{trend}</p>}
        {note && <div className="mt-1 text-xs font-semibold text-stone-500">{note}</div>}
      </div>
    </div>
  );
}

// Square shortcut with an icon above its label (the "Quick Actions" grids).
export function ActionTile({ icon: Icon, label, onClick, disabled, iconClass = 'text-crimson' }: {
  icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; iconClass?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="action-tile">
      <Icon size={28} strokeWidth={1.8} className={iconClass} aria-hidden="true" />{label}
    </button>
  );
}

// Full-width row with an icon, a label and a chevron (account and detail action lists).
export function ActionRow({ icon: Icon, label, onClick, disabled, danger = false }: {
  icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex w-full items-center gap-3 border-b border-stone-100 py-2 text-left text-[0.95rem] font-semibold last:border-0 hover:text-crimson disabled:opacity-40 ${danger ? 'text-crimson' : ''}`}>
      <Icon size={20} className="text-crimson" aria-hidden="true" /><span className="flex-1">{label}</span><ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

// Daily / Weekly / Monthly switch shown beside a chart title.
export function SegmentTabs<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-full bg-white/80 p-0.5 shadow-sm">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8rem] font-semibold ${value === k ? 'bg-gradient-to-r from-crimson to-[#ea2526] text-white shadow' : 'text-stone-700'}`}>{l}</button>
      ))}
    </div>
  );
}

export function Stars({ value, size = '1rem' }: { value: number; size?: string }) {
  const n = Math.round(value);
  return (
    <span aria-label={`${n} out of 5 stars`} role="img" style={{ fontSize: size }} className="whitespace-nowrap tracking-tight">
      <span className="text-amber-500">{'★'.repeat(n)}</span><span className="text-stone-300">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid place-items-center py-10" role="status" aria-label={label}>
      <Loader2 className="animate-spin text-crimson" size={28} aria-hidden="true" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center px-4 py-10 text-center">
      <Icon size={36} className="text-stone-300" aria-hidden="true" />
      <p className="mt-3 font-semibold text-stone-700">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-stone-500">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{children}</p>;
}

export function SearchBox({ value, onChange, placeholder, label }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pl-1 pr-3 shadow-sm focus-within:border-crimson">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-crimson to-ember text-white"><Search size={18} aria-hidden="true" /></span>
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" />
    </label>
  );
}

export function Pagination({ page, pageSize, total, onPage, noun = 'items' }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  // Numbered buttons around the current page, then "…" and the last page.
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const shown = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-stone-600">Showing {from}–{Math.min(total, page * pageSize)} of {total.toLocaleString()} {noun}</span>
      <span className="flex items-center gap-1">
        <button type="button" className="page-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={18} /></button>
        {shown.map((p) => (
          <button key={p} type="button" className={`page-btn ${p === page ? 'page-btn-active' : ''}`} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined} aria-label={`Page ${p}`}>{p}</button>
        ))}
        {shown[shown.length - 1] < pages && <>
          <span aria-hidden="true" className="px-1">…</span>
          <button type="button" className="page-btn" onClick={() => onPage(pages)} aria-label={`Page ${pages}`}>{pages}</button>
        </>}
        <button type="button" className="page-btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={18} /></button>
      </span>
    </nav>
  );
}

// Accessible modal on the native <dialog> element (focus trap and Escape come for free).
export function Modal({ open, title, onClose, children, wide = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined}
      onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={title}
      className={`card m-auto w-[calc(100%-2rem)] p-0 backdrop:bg-stone-900/40 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="card-title">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-crimson' : 'bg-stone-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

// Ring chart: one value out of 100, or several parts that add up to a total.
export function Donut({ parts, size = 132, center, label }: {
  parts: { value: number; color: string; label: string }[]; size?: number; center: ReactNode; label: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 15.9155;
  let offset = 25;
  return (
    <figure className="relative shrink-0" style={{ width: size, height: size }} aria-label={label} role="img">
      <svg viewBox="0 0 36 36" className="h-full w-full">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#f5ebe7" strokeWidth="4" />
        {total > 0 && parts.map((p) => {
          const pct = (p.value / total) * 100;
          const el = <circle key={p.label} cx="18" cy="18" r={r} fill="none" stroke={p.color} strokeWidth="4"
            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
          offset -= pct;
          return el;
        })}
      </svg>
      <figcaption className="absolute inset-0 grid place-items-center text-center leading-tight">{center}</figcaption>
    </figure>
  );
}

export function Bar({ value, max = 1, color = 'var(--color-crimson)', label }: { value: number; max?: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100" role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// A profile photo (square, cover-cropped) when the user uploaded one, otherwise their initial.
export function Avatar({ name, size = 40, src }: { name: string; size?: number; src?: string | null }) {
  if (src) return <img src={src} alt="" aria-hidden="true" className="shrink-0 rounded-full object-cover shadow-md" style={{ width: size, height: size }} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-crimson to-crimson-deep font-display font-bold text-white shadow-md"
      style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {(name.trim().charAt(0) || '?').toUpperCase()}
    </span>
  );
}

export const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', deactivated: 'badge-red', published: 'badge-green', draft: 'badge-amber', archived: 'badge-gray',
  open: 'badge-blue', in_progress: 'badge-amber', resolved: 'badge-green',
};

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

// Download a text file the browser builds locally (exports and reports); nothing is uploaded.
export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Leading = + - @ would run as formulas in spreadsheet apps.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

// The red chef-hat mark of the Dish-Wish brand (logo, "Find Recipes").
export function ChefHatMark({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={className} aria-hidden="true">
      <path d="M18 37C10.500 37 4 31.600 4 23.800 4 16 10.200 10.400 17.200 11 19.800 5.200 25.500 2 32 2s12.200 3.200 14.800 9C53.800 10.400 60 16 60 23.800 60 31.600 53.500 37 46 37z" fill="#ef2f2b" />
      <path d="M15 41h34v11a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" fill="#d9122a" />
      <path d="M25 26v12M32 26v12M39 26v12" stroke="#fff" strokeWidth="2.600" strokeLinecap="round" />
      <path d="M15 37.500h34" stroke="#fff" strokeWidth="2.600" />
    </svg>
  );
}
