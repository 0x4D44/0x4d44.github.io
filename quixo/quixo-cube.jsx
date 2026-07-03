// quixo-cube.jsx — a wooden Quixo cube, drawn as SVG, viewed softly from
// above so the top face dominates and a bevel of side wall grounds it.
//
// All 25 cubes are the same light wood (theme.cube); state lives in the
// engraving on the top face:
//   v = null   → blank face
//   v = 'you'  → engraved cross  (ink theme.symX)
//   v = 'ai'   → engraved circle (ink theme.symO, or symX when symbols='engraved')
//
// Interaction dressing mirrors the Quarto piece component: `eligible`
// (subtle accent hairline — this cube may be picked up), `selected`
// (bold ring + lift), `hint` (dashed pulse), `win`/`lose` line rings.

function QuixoCube({
  v, theme, size = 48,
  symbols = 'tinted',     // 'tinted' | 'engraved' (both inks dark, like the physical game)
  eligible = false,
  selected = false,
  hint = false,
  dim = false,
  lifted = false,
  winner = null,          // 'accent' | 'danger' — ring color when on the finished line
  style = {},
}) {
  const pal = theme.cube;
  const ink = v === 'ai' ? (symbols === 'engraved' ? theme.symX : theme.symO) : theme.symX;
  const uid = React.useId().replace(/:/g, '_');
  const gTop = `${uid}-top`;

  const ringColor = winner === 'danger' ? theme.danger
                  : winner === 'accent' ? theme.accent
                  : selected ? theme.accent : null;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{
      display: 'block', overflow: 'visible',
      opacity: dim ? 0.4 : 1,
      transform: (selected || lifted) ? 'translateY(-3px)' : 'none',
      transition: 'transform .2s cubic-bezier(.3,.7,.2,1), opacity .2s, filter .2s',
      filter: selected ? `drop-shadow(0 4px 8px ${theme.accentGlow})`
            : winner ? `drop-shadow(0 0 6px ${winner === 'danger' ? theme.danger + '88' : theme.accentGlow})`
            : 'none',
      ...style,
    }}>
      <defs>
        <radialGradient id={gTop} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={pal.topHi} />
          <stop offset="55%" stopColor={pal.top} />
          <stop offset="100%" stopColor={pal.sideTop} />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="50" cy="93" rx="38" ry="6" fill="black" opacity="0.3" />

      {/* side bevel (the sliver of cube wall below the top face) */}
      <rect x="10" y="18" width="80" height="74" rx="12" fill={pal.sideBot} />
      <rect x="10" y="14" width="80" height="74" rx="12" fill={pal.sideTop} />

      {/* top face */}
      <rect x="10" y="6" width="80" height="80" rx="12"
        fill={`url(#${gTop})`} stroke={pal.edge} strokeOpacity="0.45" strokeWidth="1" />
      {/* sheen along the top edge */}
      <rect x="16" y="10" width="68" height="10" rx="5" fill={pal.sheen} opacity="0.45" />

      {/* engraving — a light offset hairline below the dark cut sells the depth */}
      {v === 'you' && (
        <g strokeLinecap="round" fill="none">
          <path d="M32 30 L68 66 M68 30 L32 66" stroke={pal.sheen} strokeWidth="11"
            opacity="0.55" transform="translate(0 1.8)" />
          <path d="M32 30 L68 66 M68 30 L32 66" stroke={ink} strokeWidth="10" />
        </g>
      )}
      {v === 'ai' && (
        <g fill="none">
          <circle cx="50" cy="47.5" r="19" stroke={pal.sheen} strokeWidth="11"
            opacity="0.55" transform="translate(0 1.8)" />
          <circle cx="50" cy="46" r="19" stroke={ink} strokeWidth="10" />
        </g>
      )}

      {/* pick-up affordance: faint accent hairline */}
      {eligible && !selected && !ringColor && (
        <rect x="7" y="3" width="86" height="86" rx="14" fill="none"
          stroke={theme.accent} strokeOpacity="0.5" strokeWidth="1.5" />
      )}

      {/* hint: dashed pulse */}
      {hint && (
        <rect x="4" y="0" width="92" height="92" rx="16" fill="none"
          stroke={theme.accent} strokeWidth="3" strokeDasharray="7 6"
          style={{ animation: 'qHintPulse 1.4s ease-in-out infinite' }} />
      )}

      {/* selection / win-line ring */}
      {ringColor && (
        <rect x="4" y="0" width="92" height="92" rx="16" fill="none"
          stroke={ringColor} strokeWidth="3" />
      )}
    </svg>
  );
}

window.QuixoCube = QuixoCube;
