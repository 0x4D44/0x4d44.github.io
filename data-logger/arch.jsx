// ---------------------------------------------------------------------------
// arch.jsx — interactive architecture diagram
// ---------------------------------------------------------------------------
// Three-tier layout (application / foundation / vendored). Hover or focus a
// module to highlight its outgoing and incoming edges; click to "pin" the
// detail card on the right.
// ---------------------------------------------------------------------------

const ArchDiagram = () => {
  const { modules, edges } = window.DLOG_DATA;
  const [hover, setHover]   = React.useState(null);
  const [picked, setPicked] = React.useState("wtlgmain");
  const active = hover || picked;

  // Layout: three rows. Position nodes manually for legibility.
  // Coordinates are in an 1000x620 viewBox.
  const positions = {
    // L2 — application (top row)
    wtlgmain: { x: 500, y: 80,  w: 150 },
    wtlgcom:  { x: 80,  y: 80,  w: 110 },
    wtlgdata: { x: 220, y: 80,  w: 110 },
    wtlgdis:  { x: 360, y: 80,  w: 110 },
    wtlgset:  { x: 660, y: 80,  w: 100 },
    wtlgcfg:  { x: 770, y: 80,  w: 100 },
    wtlgcmd:  { x: 880, y: 80,  w: 100 },
    wtlglog:  { x: 80,  y: 180, w: 100 },
    wtlgsyl:  { x: 190, y: 180, w: 100 },
    wtlgabt:  { x: 300, y: 180, w: 100 },
    wtlgdat:  { x: 410, y: 180, w: 100 },

    // L1 — foundation (middle row)
    wmdgapi:  { x: 100, y: 350, w: 130 },
    wmdgint:  { x: 240, y: 350, w: 110 },
    wmdgcac:  { x: 360, y: 350, w: 100 },
    wmdgmru:  { x: 470, y: 350, w: 100 },
    wmdgtyp:  { x: 580, y: 350, w: 110 },
    wmdgtrg:  { x: 700, y: 350, w: 100 },
    wmdgdbg:  { x: 810, y: 350, w: 100 },
    wmdgdata: { x: 920, y: 350, w: 100 },

    // L3 — vendored (bottom row)
    zlib:     { x: 460, y: 530, w: 130 }
  };

  // Build adjacency lookup for highlighting.
  const adj = React.useMemo(() => {
    const map = {};
    edges.forEach(([a, b]) => {
      map[a] = map[a] || new Set();
      map[b] = map[b] || new Set();
      map[a].add(b);
      map[b].add(a);
    });
    return map;
  }, [edges]);

  const isActive = (id) => active === id;
  const isNeighbor = (id) => active && adj[active] && adj[active].has(id);

  const layerColor = (l) => l === 1 ? "#dbcca7" : l === 2 ? "#e8d9b5" : "#cdd9c8";
  const layerStroke = (l) => l === 1 ? "#9e8a5a" : l === 2 ? "#a37a3d" : "#7a8b6e";

  const W = 1000, H = 620;

  // Render an edge if it touches the active node.
  const visibleEdges = React.useMemo(() => {
    if (!active) return [];
    return edges.filter(([a, b]) => a === active || b === active);
  }, [active, edges]);

  const picked_mod = modules.find((m) => m.id === active) || modules[0];

  return (
    <div className="arch-wrap">
      <div>
        <div className="arch-svg-wrap">
          <svg className="arch-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
            {/* layer band labels */}
            <g style={{ pointerEvents: "none", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: "#a39576", letterSpacing: "0.16em" }}>
              <text x="12" y="40">LAYER 2 — APPLICATION (WTLG*)</text>
              <text x="12" y="310">LAYER 1 — FOUNDATION LIBRARY (WMDG*)</text>
              <text x="12" y="490">LAYER 3 — VENDORED</text>
            </g>

            {/* horizontal divider rules */}
            <line x1="0" x2={W} y1="270" y2="270" stroke="#d0c4a0" strokeDasharray="3 5" />
            <line x1="0" x2={W} y1="460" y2="460" stroke="#d0c4a0" strokeDasharray="3 5" />

            {/* edges (only shown when something is active) */}
            <g>
              {visibleEdges.map(([a, b], i) => {
                const pa = positions[a], pb = positions[b];
                if (!pa || !pb) return null;
                const x1 = pa.x + pa.w/2;
                const y1 = pa.y + 22;
                const x2 = pb.x + pb.w/2;
                const y2 = pb.y + 22;
                // curve through midpoint
                const midY = (y1 + y2) / 2;
                const d = `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
                return (
                  <path key={i} d={d}
                        fill="none"
                        stroke="#b8741f"
                        strokeOpacity={0.7}
                        strokeWidth={1.2} />
                );
              })}
            </g>

            {/* nodes */}
            <g>
              {modules.map((m) => {
                const p = positions[m.id];
                if (!p) return null;
                const a = isActive(m.id);
                const n = isNeighbor(m.id);
                const dim = active && !a && !n;
                const h = 44;
                return (
                  <g key={m.id}
                     className="arch-node"
                     opacity={dim ? 0.28 : 1}
                     onMouseEnter={() => setHover(m.id)}
                     onMouseLeave={() => setHover(null)}
                     onClick={() => setPicked(m.id)}
                     tabIndex={0}>
                    <rect
                      x={p.x} y={p.y}
                      width={p.w} height={h}
                      rx={4}
                      fill={a ? "#b8741f" : layerColor(m.layer)}
                      stroke={a ? "#8d540f" : layerStroke(m.layer)}
                      strokeWidth={a ? 1.4 : 1}
                    />
                    <text
                      x={p.x + p.w/2} y={p.y + 19}
                      textAnchor="middle"
                      fontFamily="JetBrains Mono, monospace"
                      fontSize="12"
                      fontWeight="500"
                      fill={a ? "#fbf2dc" : "#2a2520"}
                    >{m.label}</text>
                    <text
                      x={p.x + p.w/2} y={p.y + 34}
                      textAnchor="middle"
                      fontFamily="IBM Plex Sans, sans-serif"
                      fontSize="10"
                      fill={a ? "rgba(251,242,220,.85)" : "#6b6457"}
                    >{m.role}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="arch-legend">
          <span><span className="sw" style={{ background:"#e8d9b5", border:"1px solid #a37a3d" }} />Application</span>
          <span><span className="sw" style={{ background:"#dbcca7", border:"1px solid #9e8a5a" }} />Foundation</span>
          <span><span className="sw" style={{ background:"#cdd9c8", border:"1px solid #7a8b6e" }} />Vendored</span>
          <span style={{ marginLeft: "auto" }}>Hover a module · Click to pin</span>
        </div>
      </div>

      <aside className="arch-detail">
        <div className="role">{picked_mod.role}</div>
        <h3>{picked_mod.label}</h3>
        <p>{picked_mod.blurb}</p>
        <div className="lines">
          {picked_mod.lines.toLocaleString()} lines
          {adj[picked_mod.id] && (
            <> · {adj[picked_mod.id].size} connection{adj[picked_mod.id].size === 1 ? "" : "s"}</>
          )}
        </div>
      </aside>
    </div>
  );
};

window.ArchDiagram = ArchDiagram;
