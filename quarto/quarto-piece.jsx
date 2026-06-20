// quarto-piece.jsx — wooden Quarto piece, drawn as SVG.
//
// Attributes encoded in the 4-bit piece id (see quarto-engine.jsx):
//   tall vs short  → body height
//   light vs dark  → wood palette (from theme)
//   round vs square → silhouette
//   solid vs hollow → top-face treatment (dome highlight vs sunken hole)
//
// The component is sized via `size` (the visual diameter in px); the
// underlying viewBox is 100×140 so tall pieces extend higher within the
// same footprint and short pieces hug the bottom — the baseline is
// constant so a row of mixed-height pieces aligns nicely.

function QuartoPiece({
  p, theme, size = 56,
  glow = false,           // soft accent halo (used for "held in hand" and hover affordance)
  selected = false,       // bold accent ring (used while picking a piece for opponent)
  dim = false,            // fade out (used pieces in tray, AI-thinking blur)
  lifted = false,         // a tiny vertical hop, used when the piece is the held one
  flatStyle = 'iso',      // 'iso' | 'three-quarter' | 'topdown' | 'sticker'
  style = {},
}) {
  // Delegate to the dedicated iso renderer when requested.
  if (flatStyle === 'iso' && window.IsoPiece) {
    const Iso = window.IsoPiece;
    return <Iso p={p} theme={theme} size={size} glow={glow} selected={selected} dim={dim} lifted={lifted} style={style} />;
  }
  const tall    = (p & 1) !== 0;
  const dark    = (p & 2) !== 0;
  const round   = (p & 4) !== 0;
  const hollow  = (p & 8) !== 0;
  const palette = dark ? theme.pieceDark : theme.pieceLight;
  const uid     = React.useId().replace(/:/g, '_');

  const W = size, H = size * 1.45;

  // ─── three-quarter (the default — most "wooden chess piece" feel) ────
  // y-coordinates in viewBox 100×140 (centered horizontally at x=50)
  const groundY   = 128;
  const baseY     = 124;                       // top of base
  const topY      = tall ? 32 : 62;            // top face center y
  const sideTopY  = topY;
  const sideBotY  = baseY;

  // Round piece dimensions
  const rxBody = 28, ryCap = 8, ryBase = 10;
  // Square piece dimensions
  const sqX = 22, sqW = 56, sqCapH = 11, sqCapR = 2;

  // Per-instance gradients
  const gSide  = `${uid}-side`;
  const gTop   = `${uid}-top`;
  const gHole  = `${uid}-hole`;
  const gBase  = `${uid}-base`;
  const gSheen = `${uid}-sheen`;

  // Hover/affordance glow filter
  const glowFilter = `${uid}-glow`;

  const opacity = dim ? 0.35 : 1;
  const transform = lifted ? 'translateY(-2px)' : 'none';

  // ─── TOPDOWN (alternative piece style) ─────────────────────────────────
  if (flatStyle === 'topdown') {
    const rOuter = tall ? 40 : 30;
    const rInner = hollow ? rOuter * 0.55 : 0;
    return (
      <svg width={W} height={W} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible', opacity, transform, transition: 'transform .2s, opacity .2s', ...style }}>
        <defs>
          <radialGradient id={gTop} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={palette.topHi} />
            <stop offset="55%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.sideBot} />
          </radialGradient>
          <radialGradient id={gHole}>
            <stop offset="0%" stopColor={palette.edge} />
            <stop offset="70%" stopColor={palette.sideBot} />
          </radialGradient>
        </defs>
        {/* ground shadow */}
        <ellipse cx="50" cy="92" rx={rOuter * 0.92} ry={rOuter * 0.18} fill="black" opacity="0.35" />
        {/* shape */}
        {round
          ? <circle cx="50" cy="50" r={rOuter} fill={`url(#${gTop})`} stroke={palette.edge} strokeOpacity="0.5" strokeWidth="0.6" />
          : <rect x={50 - rOuter} y={50 - rOuter} width={rOuter * 2} height={rOuter * 2} rx="4" fill={`url(#${gTop})`} stroke={palette.edge} strokeOpacity="0.5" strokeWidth="0.6" />}
        {hollow && (round
          ? <circle cx="50" cy="50" r={rInner} fill={`url(#${gHole})`} />
          : <rect x={50 - rInner} y={50 - rInner} width={rInner * 2} height={rInner * 2} rx="2" fill={`url(#${gHole})`} />)}
        {selected && (round
          ? <circle cx="50" cy="50" r={rOuter + 3} fill="none" stroke={theme.accent} strokeWidth="2" />
          : <rect x={50 - rOuter - 3} y={50 - rOuter - 3} width={(rOuter + 3) * 2} height={(rOuter + 3) * 2} rx="6" fill="none" stroke={theme.accent} strokeWidth="2" />)}
      </svg>
    );
  }

  // ─── STICKER (flat, no shading — bold UI iconography) ──────────────────
  if (flatStyle === 'sticker') {
    const rOuter = tall ? 38 : 28;
    const rInner = hollow ? rOuter * 0.45 : 0;
    const fill = dark ? palette.sideTop : palette.top;
    return (
      <svg width={W} height={W} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible', opacity, transform, transition: 'transform .2s', ...style }}>
        {round
          ? <circle cx="50" cy="50" r={rOuter} fill={hollow ? 'none' : fill} stroke={fill} strokeWidth="6" />
          : <rect x={50 - rOuter} y={50 - rOuter} width={rOuter * 2} height={rOuter * 2} rx="3" fill={hollow ? 'none' : fill} stroke={fill} strokeWidth="6" />}
        {selected && <circle cx="50" cy="50" r={rOuter + 6} fill="none" stroke={theme.accent} strokeWidth="2" />}
      </svg>
    );
  }

  // ─── THREE-QUARTER (default) ───────────────────────────────────────────
  return (
    <svg width={W} height={H} viewBox="0 0 100 140" style={{
      display: 'block',
      overflow: 'visible',
      opacity,
      transform,
      transition: 'transform .25s cubic-bezier(.3,.7,.2,1), opacity .25s, filter .25s',
      filter: glow ? `drop-shadow(0 0 6px ${theme.accentGlow})` : 'none',
      ...style,
    }}>
      <defs>
        <linearGradient id={gSide} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sideTop} />
          <stop offset="100%" stopColor={palette.sideBot} />
        </linearGradient>
        <radialGradient id={gTop} cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor={palette.topHi} />
          <stop offset="55%" stopColor={palette.top} />
          <stop offset="100%" stopColor={palette.sideTop} />
        </radialGradient>
        <radialGradient id={gHole} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={palette.edge} />
          <stop offset="65%" stopColor={palette.sideBot} />
          <stop offset="100%" stopColor={palette.sideTop} />
        </radialGradient>
        <linearGradient id={gBase} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sideBot} />
          <stop offset="100%" stopColor={palette.edge} />
        </linearGradient>
        <linearGradient id={gSheen} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.sheen} stopOpacity="0" />
          <stop offset="35%" stopColor={palette.sheen} stopOpacity="0.7" />
          <stop offset="55%" stopColor={palette.sheen} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="50" cy={groundY} rx={round ? rxBody + 2 : sqW / 2 + 4} ry="5" fill="black" opacity="0.45" />

      {round ? (
        <>
          {/* base ring (slightly darker bottom) */}
          <ellipse cx="50" cy={baseY} rx={rxBody} ry={ryBase} fill={`url(#${gBase})`} />
          {/* side wall — drawn as a path so we can include the curved bottom */}
          <path d={`
            M ${50 - rxBody} ${sideTopY}
            L ${50 - rxBody} ${sideBotY}
            A ${rxBody} ${ryBase} 0 0 0 ${50 + rxBody} ${sideBotY}
            L ${50 + rxBody} ${sideTopY}
            A ${rxBody} ${ryCap} 0 0 1 ${50 - rxBody} ${sideTopY}
            Z
          `} fill={`url(#${gSide})`} />
          {/* sheen down the cylinder */}
          <rect x={50 - rxBody * 0.9} y={sideTopY + 2} width={rxBody * 1.8} height={sideBotY - sideTopY - 4} fill={`url(#${gSheen})`} opacity="0.55" />
          {/* top cap face */}
          <ellipse cx="50" cy={sideTopY} rx={rxBody} ry={ryCap} fill={`url(#${gTop})`} stroke={palette.edge} strokeOpacity="0.4" strokeWidth="0.5" />
          {/* hollow indent */}
          {hollow && (
            <>
              <ellipse cx="50" cy={sideTopY + 0.5} rx={rxBody * 0.55} ry={ryCap * 0.55} fill={`url(#${gHole})`} />
              <ellipse cx="50" cy={sideTopY - 0.5} rx={rxBody * 0.55} ry={ryCap * 0.55} fill="none" stroke={palette.edge} strokeOpacity="0.45" strokeWidth="0.5" />
            </>
          )}
          {/* solid: subtle catchlight */}
          {!hollow && (
            <ellipse cx={50 - rxBody * 0.35} cy={sideTopY - ryCap * 0.35} rx={rxBody * 0.35} ry={ryCap * 0.4} fill={palette.topHi} opacity="0.55" />
          )}
        </>
      ) : (
        <>
          {/* base shadow strip */}
          <rect x={sqX - 1} y={baseY - 2} width={sqW + 2} height="6" rx="2" fill={palette.edge} opacity="0.65" />
          {/* side body */}
          <rect x={sqX} y={sideTopY} width={sqW} height={sideBotY - sideTopY} fill={`url(#${gSide})`} />
          {/* sheen */}
          <rect x={sqX + sqW * 0.15} y={sideTopY + 1} width={sqW * 0.7} height={sideBotY - sideTopY - 2} fill={`url(#${gSheen})`} opacity="0.5" />
          {/* edge hairlines */}
          <line x1={sqX} y1={sideTopY} x2={sqX} y2={sideBotY} stroke={palette.edge} strokeOpacity="0.45" strokeWidth="0.6" />
          <line x1={sqX + sqW} y1={sideTopY} x2={sqX + sqW} y2={sideBotY} stroke={palette.edge} strokeOpacity="0.45" strokeWidth="0.6" />
          {/* top face — a slightly-trapezoidal rect to suggest looking-down angle */}
          <path d={`
            M ${sqX} ${sideTopY}
            L ${sqX + sqW} ${sideTopY}
            L ${sqX + sqW - 1} ${sideTopY - sqCapH}
            L ${sqX + 1} ${sideTopY - sqCapH}
            Z
          `} fill={`url(#${gTop})`} stroke={palette.edge} strokeOpacity="0.5" strokeWidth="0.5" />
          {/* hollow indent — sunken square */}
          {hollow && (
            <>
              <rect
                x={sqX + sqW * 0.25} y={sideTopY - sqCapH * 0.7}
                width={sqW * 0.5} height={sqCapH * 0.85}
                rx="1.5" fill={`url(#${gHole})`}
              />
              <rect
                x={sqX + sqW * 0.25} y={sideTopY - sqCapH * 0.7}
                width={sqW * 0.5} height={sqCapH * 0.85}
                rx="1.5" fill="none" stroke={palette.edge} strokeOpacity="0.5" strokeWidth="0.5"
              />
            </>
          )}
          {!hollow && (
            <rect x={sqX + 4} y={sideTopY - sqCapH + 1.5} width={sqW * 0.45} height={sqCapH * 0.35} rx="0.8" fill={palette.topHi} opacity="0.55" />
          )}
        </>
      )}

      {/* selection ring (drawn over) */}
      {selected && (
        round
          ? <ellipse cx="50" cy={(sideTopY + baseY) / 2} rx={rxBody + 5} ry={(baseY - sideTopY) / 2 + 7} fill="none" stroke={theme.accent} strokeWidth="2" strokeDasharray="3 3" />
          : <rect x={sqX - 5} y={sideTopY - sqCapH - 4} width={sqW + 10} height={baseY - sideTopY + sqCapH + 8} rx="4" fill="none" stroke={theme.accent} strokeWidth="2" strokeDasharray="3 3" />
      )}
    </svg>
  );
}

window.QuartoPiece = QuartoPiece;
