// quarto-iso.jsx — Transport-Tycoon-style 2:1 isometric renderer.
//
// Projection convention: a tile is `tileW × tileH` with tileW = 2·tileH (the
// classic TTD/SimCity 2:1 dimetric). Z (height) goes straight up the screen.
// All pieces and the board live on the same SVG canvas so depth ordering is
// trivially correct: render back-to-front by sorting tiles by (row + col).
//
// Piece geometry (all dimensions in the per-piece viewBox of 60×100 with the
// piece's ground point at (30, 78)):
//
//                north (back) top
//                      ▲
//                     ╱ ╲
//             west   ╱   ╲   east
//             top  ◀       ▶  top
//                   ╲     ╱
//                    ╲   ╱
//                     ╲ ╱
//                south (front) top
//                      │
//                      │  side faces (light on the left, dark on the right)
//                      │
//                      ▼ ground
//
// Tall vs short → body height (h_tall / h_short).
// Light vs dark → wood palette pulled from the theme.
// Round vs square → cylinder (top ellipse + curved sides) vs box (top rhombus
//                   + two slanted side faces).
// Solid vs hollow → flat / sheened top vs sunken indent at the top centre.

const ISO = {
  // Camera: 1.5:1 dimetric (was 2:1). Steeper than TTD/SimCity, closer to
  // Civilization 3 — gives tall pieces enough vertical breathing room that
  // a back-row tall piece still shows ~70% of its body behind a front-row
  // tall piece directly in front of it.
  tileW: 60,
  tileH: 40,
  hTall: 38,
  hShort: 20,
  pieceRadius: 18,    // half-width across the iso x-axis for both round and square pieces
};

// ─────────────────────────────────────────────────────────────
// IsoPiece — single piece, drawn into its own SVG.
// Used for the tray (small) AND inside the board (large).
// ─────────────────────────────────────────────────────────────

function IsoPiece({ p, theme, size = 60, glow = false, selected = false, dim = false, lifted = false, grey = false, style = {} }) {
  const tall   = (p & 1) !== 0;
  const dark   = (p & 2) !== 0;
  const round  = (p & 4) !== 0;
  const hollow = (p & 8) !== 0;
  const pal    = dark ? theme.pieceDark : theme.pieceLight;
  const uid    = React.useId().replace(/:/g, '_');

  // viewBox 60 × 100; ground centre at (30, 78). The ground-contact ellipse
  // projects a circle of radius `r` through the iso camera, so its minor
  // radius is `r × tileH/tileW` — NOT half the tile height.
  const cx = 30, gy = 78;
  const h  = tall ? ISO.hTall : ISO.hShort;
  const ty = gy - h;                                  // top centre Y
  const r  = ISO.pieceRadius;                         // x radius (full width across iso x)
  const ry = r * (ISO.tileH / ISO.tileW);             // correct iso projection of a ground circle

  const aspect = 100 / 60;
  const W = size, H = size * aspect;

  // Gradient IDs
  const gTop   = `${uid}-iso-top`;
  const gLeft  = `${uid}-iso-left`;
  const gRight = `${uid}-iso-right`;
  const gCyl   = `${uid}-iso-cyl`;
  const gHole  = `${uid}-iso-hole`;

  return (
    <svg
      width={W} height={H}
      viewBox="0 0 60 100"
      style={{
        display: 'block',
        overflow: 'visible',
        opacity: dim ? (grey ? 0.3 : 0.4) : 1,
        transform: lifted ? 'translateY(-3px)' : 'none',
        filter: glow ? `drop-shadow(0 0 8px ${theme.accentGlow})`
              : (grey ? 'grayscale(0.85) brightness(0.85)' : 'none'),
        transition: 'transform .25s cubic-bezier(.3,.7,.2,1), opacity .25s, filter .25s',
        ...style,
      }}
    >
      <defs>
        {/* TOP face (brightest). Light source: upper-left. */}
        <linearGradient id={gTop} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={pal.topHi} />
          <stop offset="50%"  stopColor={pal.top} />
          <stop offset="100%" stopColor={pal.sideTop} />
        </linearGradient>
        {/* LEFT face (lit). */}
        <linearGradient id={gLeft} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={pal.sideTop} />
          <stop offset="100%" stopColor={pal.sideBot} />
        </linearGradient>
        {/* RIGHT face (shadowed). */}
        <linearGradient id={gRight} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={pal.sideBot} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
        {/* Cylinder body — radial-ish lighting using a linear stop chain. */}
        <linearGradient id={gCyl} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={pal.sideTop} />
          <stop offset="30%"  stopColor={pal.top} />
          <stop offset="60%"  stopColor={pal.sideTop} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
        {/* HOLE — sunken dark cavity for hollow pieces. */}
        <radialGradient id={gHole} cx="40%" cy="40%" r="70%">
          <stop offset="0%"   stopColor={pal.edge} />
          <stop offset="60%"  stopColor={pal.sideBot} />
          <stop offset="100%" stopColor={pal.sideTop} />
        </radialGradient>
      </defs>

      {/* GROUND CONTACT SHADOW — soft ellipse pinned to the ground. */}
      <ellipse cx={cx} cy={gy + 1} rx={r + 1} ry={ry + 1} fill="black" opacity="0.42" />

      {round ? (
        <>
          {/* Cylinder side body — straight on the left/right, curved on the bottom. */}
          <path d={`
            M ${cx - r} ${ty}
            L ${cx - r} ${gy}
            A ${r} ${ry} 0 0 0 ${cx + r} ${gy}
            L ${cx + r} ${ty}
            A ${r} ${ry} 0 0 1 ${cx - r} ${ty}
            Z
          `} fill={`url(#${gCyl})`} />
          {/* edge shadow at the right */}
          <path d={`
            M ${cx + r * 0.7} ${ty + 1}
            L ${cx + r * 0.7} ${gy}
            A ${r * 0.7} ${ry * 0.7} 0 0 0 ${cx + r} ${gy}
            L ${cx + r} ${ty + 1}
            Z
          `} fill={pal.edge} opacity="0.35" />
          {/* TOP face — ellipse */}
          <ellipse cx={cx} cy={ty} rx={r} ry={ry} fill={`url(#${gTop})`} stroke={pal.edge} strokeOpacity="0.45" strokeWidth="0.5" />
          {/* HOLLOW indent OR SOLID sheen */}
          {hollow ? (
            <>
              <ellipse cx={cx} cy={ty + 0.5} rx={r * 0.55} ry={ry * 0.55} fill={`url(#${gHole})`} />
              <ellipse cx={cx} cy={ty - 0.4} rx={r * 0.55} ry={ry * 0.55} fill="none" stroke={pal.edge} strokeOpacity="0.55" strokeWidth="0.4" />
            </>
          ) : (
            <ellipse cx={cx - r * 0.25} cy={ty - ry * 0.25} rx={r * 0.4} ry={ry * 0.4} fill={pal.topHi} opacity="0.55" />
          )}
        </>
      ) : (
        <>
          {/* BOX side faces. */}
          {/* Coordinates of the 4 top corners of the body's top face: */}
          {(() => {
            const tN = [cx, ty - ry];          // back top
            const tE = [cx + r, ty];           // right top
            const tS = [cx, ty + ry];          // front top
            const tW = [cx - r, ty];           // left top
            const bN = [cx, ty - ry + h];      // back base — same xy as ground point N
            const bE = [cx + r, ty + h];       // right base
            const bS = [cx, ty + ry + h];      // front base
            const bW = [cx - r, ty + h];       // left base
            // visible side faces: LEFT (W-top, S-top, S-bot, W-bot) and RIGHT (S-top, E-top, E-bot, S-bot)
            return (
              <>
                <polygon
                  points={`${tW.join(',')} ${tS.join(',')} ${bS.join(',')} ${bW.join(',')}`}
                  fill={`url(#${gLeft})`} stroke={pal.edge} strokeOpacity="0.4" strokeWidth="0.4"
                />
                <polygon
                  points={`${tS.join(',')} ${tE.join(',')} ${bE.join(',')} ${bS.join(',')}`}
                  fill={`url(#${gRight})`} stroke={pal.edge} strokeOpacity="0.4" strokeWidth="0.4"
                />
                {/* TOP face — rhombus */}
                <polygon
                  points={`${tN.join(',')} ${tE.join(',')} ${tS.join(',')} ${tW.join(',')}`}
                  fill={`url(#${gTop})`} stroke={pal.edge} strokeOpacity="0.5" strokeWidth="0.5"
                />
                {/* HOLLOW indent — smaller rhombus, darker */}
                {hollow && (
                  <>
                    <polygon
                      points={[
                        [cx, ty - ry * 0.55],
                        [cx + r * 0.55, ty],
                        [cx, ty + ry * 0.55],
                        [cx - r * 0.55, ty],
                      ].map(p => p.join(',')).join(' ')}
                      fill={`url(#${gHole})`}
                    />
                    <polygon
                      points={[
                        [cx, ty - ry * 0.55],
                        [cx + r * 0.55, ty],
                        [cx, ty + ry * 0.55],
                        [cx - r * 0.55, ty],
                      ].map(p => p.join(',')).join(' ')}
                      fill="none" stroke={pal.edge} strokeOpacity="0.55" strokeWidth="0.4"
                    />
                  </>
                )}
                {!hollow && (
                  <polygon
                    points={[
                      [cx - r * 0.5, ty - ry * 0.05],
                      [cx + r * 0.05, ty - ry * 0.5],
                      [cx + r * 0.1, ty - ry * 0.4],
                      [cx - r * 0.4, ty + ry * 0.05],
                    ].map(p => p.join(',')).join(' ')}
                    fill={pal.topHi} opacity="0.55"
                  />
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Selection ring at the ground (drawn last so it's on top). */}
      {selected && (
        <ellipse cx={cx} cy={gy} rx={r + 3} ry={ry + 1.5} fill="none"
          stroke={theme.accent} strokeWidth="1.5" strokeDasharray="2 2" />
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// IsoBoard — the whole 4×4 plinth as one composition.
//
// Layout: a thick wooden plinth holds 16 inset tiles. Tiles can be tapped
// when the player is in 'place' phase. Pieces are absolutely-positioned
// IsoPiece SVGs sitting above the SVG plinth, z-ordered by row+col so
// pieces in the back never occlude pieces in the front.
// ─────────────────────────────────────────────────────────────

function IsoBoard({ state, theme, onCellClick, assists, hintCell }) {
  const E = window.QuartoEngine;
  const { board, phase, current, held, winLine } = state;
  const youPlace = phase === 'place' && current === 'you';
  const placeable = youPlace && held != null;
  const lineInfo = React.useMemo(() => E.analyzeLines(board), [board]);

  const cellHotness = React.useMemo(() => {
    const out = Array(16).fill(null).map(() => ({ hot: false }));
    lineInfo.forEach(info => {
      info.line.forEach(cell => { if (info.isHot) out[cell].hot = true; });
    });
    return out;
  }, [lineInfo]);

  const tileW = ISO.tileW;
  const tileH = ISO.tileH;
  const pad = 18;
  const wallH = 14;
  const pieceClearance = ISO.hTall + 14;       // room above for tall pieces

  // Bounding box of the 4×4 grid (the rhombus that contains all 16 tiles).
  const gridBoxW = 4 * tileW;                  // 256
  const gridBoxH = 4 * tileH;                  // 128
  const W = gridBoxW + pad * 2;                // 292
  const H = pieceClearance + gridBoxH + wallH + pad * 2;

  // Centre of tile (0,0). Then each step in +c shifts (+tileW/2, +tileH/2);
  // each step in +r shifts (-tileW/2, +tileH/2).
  const baseX = W / 2;
  const baseY = pad + pieceClearance + tileH / 2;
  const tilePos = (r, c) => ({
    cx: baseX + (c - r) * tileW / 2,
    cy: baseY + (c + r) * tileH / 2,
  });

  // List of all cells with depth = r+c for back-to-front rendering.
  const cells = React.useMemo(() => {
    const out = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out.push({ r, c, i: r * 4 + c, depth: r + c });
    out.sort((a, b) => a.depth - b.depth || a.c - b.c);
    return out;
  }, []);

  // Diamond polygon points for a tile centred at (x,y).
  const diamond = (x, y, w = tileW, h = tileH) =>
    `${x},${y - h/2} ${x + w/2},${y} ${x},${y + h/2} ${x - w/2},${y}`;

  // Plinth top outline (the big rhombus that contains all 16 tiles).
  const plinthN = { x: baseX,                cy: baseY - tileH / 2 };
  const plinthE = { x: baseX + gridBoxW / 2, cy: baseY + tileH * 1.5 };
  const plinthS = { x: baseX,                cy: baseY + tileH * 3.5 };
  const plinthW = { x: baseX - gridBoxW / 2, cy: baseY + tileH * 1.5 };
  const plinthTopPts = `${plinthN.x},${plinthN.cy} ${plinthE.x},${plinthE.cy} ${plinthS.x},${plinthS.cy} ${plinthW.x},${plinthW.cy}`;
  const plinthLeftPts = `${plinthW.x},${plinthW.cy} ${plinthS.x},${plinthS.cy} ${plinthS.x},${plinthS.cy + wallH} ${plinthW.x},${plinthW.cy + wallH}`;
  const plinthRightPts = `${plinthS.x},${plinthS.cy} ${plinthE.x},${plinthE.cy} ${plinthE.x},${plinthE.cy + wallH} ${plinthS.x},${plinthS.cy + wallH}`;

  const [hoverCell, setHoverCell] = React.useState(null);

  return (
    <div style={{
      padding: '0 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: phase === 'select' && current === 'you' ? 0.5 : 1,
      transition: 'opacity .3s',
    }}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            {/* Plinth top wood grain. */}
            <linearGradient id="iso-plinth-top" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor={theme.pieceDark.sideTop} stopOpacity="0.95" />
              <stop offset="100%" stopColor={theme.pieceDark.sideBot} />
            </linearGradient>
            <linearGradient id="iso-plinth-left" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={theme.pieceDark.sideTop} />
              <stop offset="100%" stopColor={theme.pieceDark.edge} />
            </linearGradient>
            <linearGradient id="iso-plinth-right" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={theme.pieceDark.sideBot} />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
            <radialGradient id="iso-plinth-vignette" cx="50%" cy="50%" r="55%">
              <stop offset="60%" stopColor="black" stopOpacity="0" />
              <stop offset="100%" stopColor="black" stopOpacity="0.35" />
            </radialGradient>
            <pattern id="iso-grain" patternUnits="userSpaceOnUse" width="6" height="3" patternTransform="rotate(0)">
              <rect width="6" height="3" fill="transparent" />
              <line x1="0" y1="1.5" x2="6" y2="1.5" stroke={theme.pieceDark.edge} strokeOpacity="0.18" strokeWidth="0.4" />
            </pattern>
          </defs>

          {/* GROUND SHADOW under the plinth */}
          <ellipse cx={baseX} cy={plinthS.cy + wallH + 8} rx={gridBoxW / 2 + 14} ry={tileH / 2 + 6} fill="black" opacity="0.45" />

          {/* PLINTH side faces (right is darker) */}
          <polygon points={plinthRightPts} fill={`url(#iso-plinth-right)`} />
          <polygon points={plinthLeftPts}  fill={`url(#iso-plinth-left)`} />
          {/* edges */}
          <line x1={plinthW.x} y1={plinthW.cy + wallH} x2={plinthS.x} y2={plinthS.cy + wallH} stroke={theme.pieceDark.edge} strokeWidth="0.6" />
          <line x1={plinthS.x} y1={plinthS.cy + wallH} x2={plinthE.x} y2={plinthE.cy + wallH} stroke={theme.pieceDark.edge} strokeWidth="0.6" />
          <line x1={plinthS.x} y1={plinthS.cy}        x2={plinthS.x} y2={plinthS.cy + wallH} stroke={theme.pieceDark.edge} strokeWidth="0.6" />

          {/* PLINTH top — wood */}
          <polygon points={plinthTopPts} fill={`url(#iso-plinth-top)`} />
          <polygon points={plinthTopPts} fill={`url(#iso-grain)`} />
          {/* brass inlay around the outer rhombus */}
          <polygon points={plinthTopPts} fill="none" stroke={theme.accent} strokeOpacity="0.55" strokeWidth="0.9" />

          {/* Cells — 16 tile diamonds inset into the plinth top */}
          {cells.map(({ r, c, i }) => {
            const { cx, cy } = tilePos(r, c);
            const piece = board[i];
            const isPlaceable = placeable && piece == null;
            const isHover = hoverCell === i && isPlaceable;
            const isHot = assists?.threats && cellHotness[i].hot && piece == null;
            const inset = 2; // gap between tile and grid line
            const w = tileW - inset * 2;
            const h = tileH - inset * 2;

            let fill = theme.boardCell;
            if (isHover) fill = theme.boardCellHover;
            else if (isHot) fill = `${theme.accent}22`;
            else fill = 'rgba(0,0,0,0.18)';

            return (
              <g key={i}>
                {/* tile depression: a slightly darker rhombus */}
                <polygon
                  points={diamond(cx, cy, w, h)}
                  fill={fill}
                  stroke={theme.boardGrid}
                  strokeWidth="0.6"
                  style={{
                    cursor: isPlaceable ? 'pointer' : 'default',
                    transition: 'fill .15s',
                  }}
                  onClick={() => isPlaceable && onCellClick(i)}
                  onMouseEnter={() => isPlaceable && setHoverCell(i)}
                  onMouseLeave={() => setHoverCell(null)}
                />
                {/* hint marker */}
                {hintCell === i && piece == null && (
                  <polygon
                    points={diamond(cx, cy, w - 4, h - 4)}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    style={{ animation: 'qHintPulse 1.4s ease-in-out infinite', pointerEvents: 'none' }}
                  />
                )}
                {/* hot threat glow */}
                {isHot && (
                  <polygon
                    points={diamond(cx, cy, w - 2, h - 2)}
                    fill="none"
                    stroke={theme.accent}
                    strokeOpacity="0.55"
                    strokeWidth="0.6"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {/* WIN LINE — drawn over tiles, under pieces */}
          {winLine && (() => {
            const a = winLine[0], b = winLine[3];
            const pa = tilePos(Math.floor(a / 4), a % 4);
            const pb = tilePos(Math.floor(b / 4), b % 4);
            return (
              <line x1={pa.cx} y1={pa.cy} x2={pb.cx} y2={pb.cy}
                stroke={theme.accent} strokeWidth="3" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${theme.accentGlow})` }}
              />
            );
          })()}

          {/* corner brass studs */}
          {[plinthN, plinthE, plinthS, plinthW].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.cy} r="2.2" fill={theme.accent} opacity="0.85" />
          ))}
        </svg>

        {/* PIECES — absolutely positioned, z-ordered by depth so back pieces stay behind front pieces */}
        {cells.map(({ r, c, i, depth }) => {
          const piece = board[i];
          if (piece == null) return null;
          const { cx, cy } = tilePos(r, c);
          // IsoPiece is 60×100 viewBox with ground centred at (30, 78); we render at size=60 so 1 viewBox unit = 1 px.
          const pieceSize = 60;
          const left = cx - pieceSize / 2;
          const top  = cy - 78;
          return (
            <div key={i} style={{
              position: 'absolute',
              left, top,
              zIndex: 10 + depth * 4 + c,
              pointerEvents: 'none',
              animation: depth === 0 ? undefined : undefined,
            }}>
              <IsoPiece p={piece} theme={theme} size={pieceSize} />
            </div>
          );
        })}

        {/* HELD-PIECE GHOST — preview of where the held piece would land while hovering */}
        {placeable && hoverCell != null && (() => {
          const r = Math.floor(hoverCell / 4), c = hoverCell % 4;
          const { cx, cy } = tilePos(r, c);
          const pieceSize = 60;
          return (
            <div style={{
              position: 'absolute',
              left: cx - pieceSize / 2,
              top:  cy - 78,
              zIndex: 99,
              pointerEvents: 'none',
              opacity: 0.6,
            }}>
              <IsoPiece p={held} theme={theme} size={pieceSize} lifted />
            </div>
          );
        })()}

        {/* LINE CHIPS — render attribute chips along the outer rhombus */}
        {assists?.liveAttrs && <IsoLineChips lineInfo={lineInfo} tilePos={tilePos} theme={theme} />}
      </div>
    </div>
  );
}

// Small chips that hover beside each row/col/diag, on the iso plinth.
function IsoLineChips({ lineInfo, tilePos, theme }) {
  // lineInfo order: 4 rows, 4 cols, 2 diags
  const out = [];

  // Rows (constant r): chip at right edge — beyond cell (r, 3)
  for (let r = 0; r < 4; r++) {
    const info = lineInfo[r];
    if (info.count === 0 || (info.liveOnes | info.liveZeros) === 0) continue;
    const { cx, cy } = tilePos(r, 3);
    out.push(<ChipDot key={`r${r}`} x={cx + 22} y={cy - 4} info={info} theme={theme} />);
  }
  // Cols (constant c): chip at front (bottom) edge — beyond cell (3, c)
  for (let c = 0; c < 4; c++) {
    const info = lineInfo[4 + c];
    if (info.count === 0 || (info.liveOnes | info.liveZeros) === 0) continue;
    const { cx, cy } = tilePos(3, c);
    out.push(<ChipDot key={`c${c}`} x={cx - 4} y={cy + 22} info={info} theme={theme} />);
  }
  return out;
}

function ChipDot({ x, y, info, theme }) {
  const liveBits = [];
  for (let b = 0; b < 4; b++) {
    if (info.liveOnes & (1 << b)) liveBits.push({ bit: b, value: 1 });
    else if (info.liveZeros & (1 << b)) liveBits.push({ bit: b, value: 0 });
  }
  const glyph = liveBits.slice(0, 2).map(({ bit, value }) => {
    const set = [
      value ? '▲' : '▽',
      value ? '●' : '○',
      value ? '◯' : '◻',
      value ? '◌' : '◼',
    ];
    return set[bit];
  }).join('');
  return (
    <div style={{
      position: 'absolute', left: x - 9, top: y - 9,
      minWidth: 18, height: 18, padding: '0 4px',
      borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: info.isHot ? theme.accent : `${theme.accent}33`,
      color: info.isHot ? theme.chrome : theme.text,
      fontSize: 9, fontWeight: 600, lineHeight: 1,
      boxShadow: info.isHot ? `0 0 8px ${theme.accentGlow}` : 'none',
      transition: 'all .2s',
      pointerEvents: 'none',
    }} title={`${info.count}/4 placed${info.isHot ? ' — one move from Quarto' : ''}`}>
      {glyph || '·'}
    </div>
  );
}

window.IsoPiece = IsoPiece;
window.IsoBoard = IsoBoard;
window.ISO_CONST = ISO;
