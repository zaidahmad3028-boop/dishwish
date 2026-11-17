// The floating warning from the design: what conflicts, and the choice to change preferences or carry on.
import { AlertTriangle, X } from 'lucide-react';
import { conflictHeading, type Conflict } from '../lib/conflicts';

export function ConflictAlert({ conflicts, onChange, onProceed, onClose }: {
  conflicts: Conflict[]; onChange: () => void; onProceed?: () => void; onClose: () => void;
}) {
  if (!conflicts.length) return null;
  const blocked = conflicts.some((c) => c.kind === 'allergy');
  return (
    <div role="alertdialog" aria-modal="false" aria-labelledby="conflict-title"
      className="fixed left-1/2 top-3 z-50 w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border-2 border-rose-300 bg-white/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex gap-3">
        <AlertTriangle size={40} strokeWidth={1.8} className="shrink-0 text-crimson" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p id="conflict-title" className="text-[1.15rem] font-bold text-crimson">{conflictHeading(conflicts)}</p>
          <ul className="mt-1 space-y-1 text-[0.92rem] leading-snug">{conflicts.map((c) => <li key={c.message}>{c.message}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-sm btn-red" onClick={onChange}>{blocked ? 'Change Allergies' : 'Change Preferences'}</button>
            {!blocked && onProceed && <button type="button" className="btn-sm btn-outline" onClick={onProceed}>Proceed Anyway</button>}
          </div>
        </div>
        <button type="button" className="icon-btn h-8 w-8 shrink-0" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
