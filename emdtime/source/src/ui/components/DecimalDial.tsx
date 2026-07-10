/**
 * A circular decimal clock face: 10 decidays around the ring, a hand at the
 * current fraction of the day, and a filled arc for elapsed time.
 */
interface Props {
  /** 0 <= f < 1 — fraction of the day elapsed. */
  fraction: number;
  size?: number;
  /** finest-resolution seconds-of-day, for the sweeping second marker. */
  secondOfDay?: number;
  daySeconds?: number;
}

const TAU = Math.PI * 2;

function pointOnCircle(cx: number, cy: number, r: number, f: number): [number, number] {
  // f = 0 at top, increasing clockwise
  return [cx + r * Math.sin(f * TAU), cy - r * Math.cos(f * TAU)];
}

export function DecimalDial({ fraction, size = 320, secondOfDay = 0, daySeconds = 10000 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;
  const [hx, hy] = pointOnCircle(cx, cy, r - 10, fraction);

  // elapsed arc path
  const [sx, sy] = pointOnCircle(cx, cy, r, 0);
  const [ex, ey] = pointOnCircle(cx, cy, r, fraction);
  const largeArc = fraction > 0.5 ? 1 : 0;
  const arc =
    fraction <= 0.0001
      ? ""
      : `M ${cx} ${cy} L ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;

  const secFrac = (secondOfDay % daySeconds) / daySeconds;
  const [scx, scy] = pointOnCircle(cx, cy, r - 2, secFrac);

  const majors = Array.from({ length: 10 }, (_, i) => i);
  const minors = Array.from({ length: 100 }, (_, i) => i);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="dial" role="img" aria-label="Decimal day dial">
      <defs>
        <radialGradient id="dialFace" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="var(--bg-panel)" />
          <stop offset="100%" stopColor="var(--bg-inset)" />
        </radialGradient>
        <linearGradient id="handGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-warm)" />
        </linearGradient>
      </defs>

      <circle cx={cx} cy={cy} r={r + 8} fill="url(#dialFace)" stroke="var(--border-strong)" strokeWidth={1.5} />

      {/* elapsed arc */}
      {arc && <path d={arc} fill="var(--accent)" opacity={0.1} />}

      {/* minor ticks — centidays */}
      {minors.map((i) => {
        if (i % 10 === 0) return null;
        const [x1, y1] = pointOnCircle(cx, cy, r, i / 100);
        const [x2, y2] = pointOnCircle(cx, cy, r - 6, i / 100);
        return <line key={`mn${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth={1} />;
      })}

      {/* major ticks + labels — decidays */}
      {majors.map((i) => {
        const [x1, y1] = pointOnCircle(cx, cy, r, i / 10);
        const [x2, y2] = pointOnCircle(cx, cy, r - 14, i / 10);
        const [lx, ly] = pointOnCircle(cx, cy, r - 30, i / 10);
        return (
          <g key={`mj${i}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-dim)" strokeWidth={2.5} />
            <text x={lx} y={ly} className="dial-num mono" textAnchor="middle" dominantBaseline="central">
              {i}
            </text>
          </g>
        );
      })}

      {/* second marker */}
      <circle cx={scx} cy={scy} r={3} fill="var(--accent-2)" />

      {/* hand */}
      <line x1={cx} y1={cy} x2={hx} y2={hy} stroke="url(#handGrad)" strokeWidth={4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={7} fill="var(--accent)" stroke="var(--bg-inset)" strokeWidth={2} />

      {/* center fraction label */}
      <text x={cx} y={cy + r * 0.5} className="dial-frac mono" textAnchor="middle">
        {Math.floor(fraction * 100)}%
      </text>
    </svg>
  );
}
