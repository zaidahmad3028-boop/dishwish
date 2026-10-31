// Star view of one ingredient's strongest compatibility edges (weights 0-1 from the stored graph).
export interface GraphEdge {
  name: string;
  weight: number;
  evidence?: string;
}

const short = (name: string) => name.replace(/\s*\(.*\)$/, '');

export function CompatibilityGraph({ center, edges, max = 6, onSelect }: {
  center: string; edges: GraphEdge[]; max?: number; onSelect?: (name: string) => void;
}) {
  const shown = edges.slice(0, max);
  const W = 420, H = 260, cx = W / 2, cy = H / 2, rx = 160, ry = 95;
  if (!shown.length) {
    return <p className="py-6 text-center text-sm text-stone-500">No stored compatibility edges for {short(center)} yet.</p>;
  }
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Compatibility graph for ${center}: ${shown.map((e) => `${e.name} ${e.weight.toFixed(2)}`).join(', ')}`}>
        {shown.map((e, i) => {
          const a = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
          return <line key={`l-${e.name}`} x1={cx} y1={cy} x2={x} y2={y} stroke="#e11d48" strokeOpacity={0.25 + e.weight * 0.6} strokeWidth={1 + e.weight * 3} />;
        })}
        {shown.map((e, i) => {
          const a = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
          const label = short(e.name);
          const w = Math.max(70, label.length * 7 + 20);
          return (
            <g key={e.name} transform={`translate(${x - w / 2}, ${y - 20})`} className={onSelect ? 'cursor-pointer' : undefined}
              onClick={onSelect ? () => onSelect(e.name) : undefined}>
              <title>{`${e.name}: ${e.weight.toFixed(2)}${e.evidence ? ` (${e.evidence})` : ''}`}</title>
              <rect width={w} height={40} rx={20} fill="white" stroke="#fecdd3" />
              <text x={w / 2} y={17} textAnchor="middle" fontSize="12" fontWeight="600" fill="#292524">{label}</text>
              <text x={w / 2} y={31} textAnchor="middle" fontSize="11" fontWeight="700" fill={e.weight >= 0.8 ? '#15803d' : e.weight >= 0.6 ? '#b45309' : '#b91c1c'}>
                {e.weight.toFixed(2)}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${cx - 55}, ${cy - 22})`}>
          <rect width={110} height={44} rx={22} fill="url(#graph-center)" />
          <text x={55} y={27} textAnchor="middle" fontSize="13" fontWeight="700" fill="white">{short(center).slice(0, 16)}</text>
        </g>
        <defs>
          <linearGradient id="graph-center" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#c81e3a" /><stop offset="1" stopColor="#f97316" />
          </linearGradient>
        </defs>
      </svg>
      <figcaption className="mt-1 text-center text-xs text-stone-500">Edge weight 0–1: how well the pair works together (1 = very well).</figcaption>
    </figure>
  );
}
