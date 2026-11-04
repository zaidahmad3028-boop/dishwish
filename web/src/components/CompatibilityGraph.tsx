// Star view of one ingredient's strongest compatibility edges (weights 0-1 from the stored graph).
// Matches the reference designs: round white nodes with the ingredient picture, name and a score pill.
import { ingredientImage } from '../lib/images';

export interface GraphEdge {
  name: string;
  weight: number;
  evidence?: string;
}

const short = (name: string) => name.replace(/\s*\(.*\)$/, '');
const scoreColor = (w: number) => (w >= 0.8 ? '#16a34a' : w >= 0.6 ? '#d97706' : '#dc2626');

export function CompatibilityGraph({ center, edges, max = 6, onSelect }: {
  center: string; edges: GraphEdge[]; max?: number; onSelect?: (name: string) => void;
}) {
  const shown = edges.slice(0, max);
  const W = 440, H = 320, cx = W / 2, cy = H / 2, rx = 165, ry = 105, R = 36, RC = 50;
  if (!shown.length) {
    return <p className="py-6 text-center text-sm text-stone-500">No stored compatibility edges for {short(center)} yet.</p>;
  }
  const centerImg = ingredientImage(center);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Compatibility graph for ${center}: ${shown.map((e) => `${e.name} ${e.weight.toFixed(2)}`).join(', ')}`}>
        <defs>
          <filter id="graph-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#9f1239" floodOpacity="0.15" />
          </filter>
        </defs>
        {shown.map((e, i) => {
          const a = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
          return <line key={`l-${e.name}`} x1={cx} y1={cy} x2={x} y2={y} stroke="#e11d48" strokeOpacity={0.35 + e.weight * 0.5} strokeWidth={1.5 + e.weight * 2} />;
        })}
        {shown.map((e, i) => {
          const a = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
          const img = ingredientImage(e.name);
          const label = short(e.name).slice(0, 13);
          return (
            <g key={e.name} transform={`translate(${x}, ${y})`} className={onSelect ? 'cursor-pointer' : undefined}
              onClick={onSelect ? () => onSelect(e.name) : undefined}>
              <title>{`${e.name}: ${e.weight.toFixed(2)}${e.evidence ? ` (${e.evidence})` : ''}`}</title>
              <circle r={R} fill="white" stroke="#fecdd3" strokeWidth={1.5} filter="url(#graph-shadow)" />
              {img && <image href={img} x={-17} y={-R + 5} width={34} height={34} preserveAspectRatio="xMidYMid meet" />}
              <text y={img ? 16 : 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#292524">{label}</text>
              <rect x={-17} y={R - 9} width={34} height={17} rx={8.5} fill={scoreColor(e.weight)} />
              <text y={R + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">{e.weight.toFixed(2)}</text>
            </g>
          );
        })}
        <g transform={`translate(${cx}, ${cy})`}>
          <circle r={RC} fill="white" stroke="#e11d48" strokeWidth={2.5} filter="url(#graph-shadow)" />
          {centerImg && <image href={centerImg} x={-24} y={-RC + 6} width={48} height={48} preserveAspectRatio="xMidYMid meet" />}
          <text y={centerImg ? 26 : 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#292524">{short(center).slice(0, 14)}</text>
        </g>
      </svg>
      <figcaption className="mt-1 text-center text-xs text-stone-500">Edge weight 0–1: how well the pair works together (1 = very well).</figcaption>
    </figure>
  );
}
