// mdminecraft site — hero + interactive world preview

const { useState, useEffect, useRef, useMemo } = React;

// =====================================================
// Brand glyph (isometric voxel mark)
// =====================================================
function BrandGlyph({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{display:"block"}}>
      {/* top face */}
      <path d="M16 4 L28 10 L16 16 L4 10 Z" fill="oklch(0.80 0.13 200)" />
      {/* left face */}
      <path d="M4 10 L16 16 L16 28 L4 22 Z" fill="oklch(0.58 0.10 200)" />
      {/* right face */}
      <path d="M28 10 L16 16 L16 28 L28 22 Z" fill="oklch(0.40 0.06 200)" />
      {/* outline */}
      <path d="M16 4 L28 10 L16 16 L4 10 Z M4 10 L16 16 L16 28 L4 22 Z M28 10 L28 22 L16 28 L16 16"
        fill="none" stroke="oklch(0.155 0.012 60)" strokeWidth="0.6" />
    </svg>
  );
}

// =====================================================
// Hero
// =====================================================
function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">
              <span className="dot"></span>
              v0.1.0 · MIT / Apache-2.0 · MVP complete
            </div>
            <h1>md<span className="ember-accent">minecraft</span></h1>
            <p className="hero-tagline">
              A deterministic voxel sandbox engine, built end-to-end in Rust. Server-authoritative
              multiplayer, complete replay, fourteen biomes — and a determinism guarantee that holds across
              18.9 million voxels.
            </p>
            <p className="hero-desc">
              Same seed, same inputs, same outputs — always. Built on a 14-crate Rust workspace
              with QUIC networking via client prediction, GPU rendering on <span className="mono">wgpu</span>, an
              <span className="mono"> bevy_ecs</span> scheduler, and a 159-test gauntlet that includes 18.9 M
              voxels of determinism validation and 80,000 mobs running 6,000 ticks of stress. Every system
              ships 6–166× faster than its performance target.
            </p>
            <div className="hero-buttons">
              <a className="btn btn-primary" href="https://github.com/0x4D44/mdminecraft" target="_blank" rel="noreferrer">
                cargo run --release ↗
              </a>
              <a className="btn btn-secondary" href="#demo">
                Try the world generator ↓
              </a>
            </div>
          </div>

          <HeroTerminal />
        </div>

        <HeroStats />
      </div>
    </section>
  );
}

function HeroTerminal() {
  return (
    <div className="term-card">
      <div className="term-card-header">
        <span>~/mdminecraft</span>
        <div className="dots"><span></span><span></span><span></span></div>
      </div>
      <div className="term-card-body">
<span className="term-line"><span className="pr">$</span> <span className="cmd">cargo test --all</span></span>
<span className="term-line"><span className="out">    Finished `test` profile in 18.4s</span></span>
<span className="term-line"><span className="out">     Running 159 tests across 14 crates</span></span>
<span className="term-line"><span className="ok">  ✓  117 unit tests          (0.84s)</span></span>
<span className="term-line"><span className="ok">  ✓   37 property tests      (25,600 cases)</span></span>
<span className="term-line"><span className="ok">  ✓    5 worldtests          (large-scale)</span></span>
<span className="term-line"><span className="ok">  ✓ determinism validated   18.9 M voxels</span></span>
<span className="term-line"> </span>
<span className="term-line"><span className="pr">$</span> <span className="cmd">cargo run -- --auto-play</span></span>
<span className="term-line"><span className="com">    # Skips menu, drops straight into gameplay</span></span>
<span className="term-line"><span className="out">    Booting renderer (wgpu / Vulkan)</span></span>
<span className="term-line"><span className="out">    World seed 12345 · 14 biomes loaded</span></span>
<span className="term-line"><span className="out">    SimTick 0 · 20 TPS · server-authoritative</span></span>
<span className="term-line"><span className="ok">  ✓ Joined game</span></span>
<span className="term-line"> </span>
<span className="term-line"><span className="pr">$</span> <span className="cmd">cargo run --bin debug-world -- \</span></span>
<span className="term-line indent"><span className="cmd">heightmap --seed 12345 --region -2,-2,2,2</span></span>
<span className="term-line"><span className="out">  ░░·░░░▒▒▒░░░·······</span></span>
<span className="term-line"><span className="out">  ░▒▒▒▓▓▓▓▒▒▒░░·····░</span></span>
<span className="term-line"><span className="out">  ▒▒▓▓█████▓▓▒░░···░░</span></span>
<span className="term-line"><span className="out">  ▒▓▓███████▓▒░░··░▒▒</span></span>
<span className="term-line"><span className="out">  ░▓▓████▓▓▒▒░░·░░▒▒▒</span></span>
      </div>
    </div>
  );
}

function HeroStats() {
  const stats = [
    { v: "159",     l: "tests passing",      unit: "✓" },
    { v: "100",     l: "determinism",        unit: "%" },
    { v: "498",     l: "save compression",   unit: "×" },
    { v: "14",      l: "biome types",        unit: "▦" },
  ];
  return (
    <div className="hero-stats">
      {stats.map((s, i) => (
        <div className="stat" key={i}>
          <div className="stat-value">{s.v}<span className="unit">{s.unit}</span></div>
          <div className="stat-label">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

// =====================================================
// World preview (interactive)
// =====================================================
const SEED_PRESETS = [
  { label: "12345",       seed: "12345" },
  { label: "minecraft",   seed: "minecraft" },
  { label: "archipelago", seed: "archipelago" },
  { label: "tundra",      seed: "tundra" },
];

function WorldPreview() {
  const [seed, setSeed]   = useState("12345");
  const [mode, setMode]   = useState("biomes");
  const [scale, setScale] = useState(0.012);
  const canvasRef = useRef(null);
  const [result, setResult] = useState(null);

  // Re-render on any change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = window.WorldNoise.renderWorld(c, seed, mode, { scale });
    setResult(r);
  }, [seed, mode, scale]);

  const biomeCounts = result?.counts || {};
  const total = result?.total || 1;
  const sortedBiomes = window.WorldNoise.BIOMES
    .map((b) => ({ ...b, count: biomeCounts[b.id] || 0 }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <section className="section" id="demo">
      <div className="container">
        <div className="section-header">
          <div className="section-num">01 — INTERACTIVE</div>
          <div>
            <h2 className="section-title">Type a seed. Get a world.</h2>
            <p className="section-lede">
              Below is a browser-side echo of the engine’s <span className="mono">debug-world</span> CLI. It renders
              the same kind of multi-octave noise + biome assignment the Rust engine uses to materialise terrain —
              every pixel is a deterministic function of (seed, x, y). Change one bit; the picture jumps.
              Change nothing; the picture is byte-identical, forever.
            </p>
          </div>
        </div>

        <div className="world-demo">
          <div className="world-controls">
            <div className="control-group">
              <label className="control-label">World seed</label>
              <input
                className="seed-input"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="i64 or string"
              />
              <div className="seed-presets">
                {SEED_PRESETS.map((p) => (
                  <button key={p.seed} className="preset-chip" onClick={() => setSeed(p.seed)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <label className="control-label">View</label>
              <div className="toggle-group">
                <button className={"toggle-btn" + (mode === "biomes"     ? " active" : "")} onClick={() => setMode("biomes")}>Biomes</button>
                <button className={"toggle-btn" + (mode === "heightmap"  ? " active" : "")} onClick={() => setMode("heightmap")}>Height</button>
                <button className={"toggle-btn" + (mode === "seams"      ? " active" : "")} onClick={() => setMode("seams")}>Seams</button>
              </div>
            </div>

            <div className="control-group">
              <label className="control-label">Zoom · {(scale * 1000).toFixed(1)}</label>
              <input
                type="range" min="0.004" max="0.032" step="0.001"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                style={{accentColor:"var(--cyan)"}}
              />
            </div>

            <div className="world-readout">
              <div><span className="k">world_seed:</span> <span className="v">{result?.seedInt ?? "—"}</span></div>
              <div><span className="k">scale:      </span> <span className="v">{scale.toFixed(4)}</span></div>
              <div><span className="k">view:       </span> <span className="v">{mode}</span></div>
              <div><span className="k">chunks:     </span> <span className="v">{result?.chunks ?? "—"}</span></div>
              <div><span className="k">samples:    </span> <span className="v">{(result?.total ?? 0).toLocaleString()}</span></div>
            </div>
          </div>

          <div className="world-canvas-wrap">
            <div className="world-canvas-header">
              <span className="lh">●</span>
              <span>debug-world · {mode} · region {-12},{-12} → {12},{12}</span>
              <span className="stat-mini">
                <span className="k">render </span><span className="v">deterministic</span>
              </span>
            </div>
            <div className="world-canvas-area">
              <div className="world-canvas-main">
                <canvas ref={canvasRef} width={384} height={288} />
              </div>
              <div className="world-side">
                <div>
                  <h5>{mode === "biomes" ? "Biome distribution" : mode === "heightmap" ? "Elevation tiers" : "Chunk seams (24×18)"}</h5>
                  {mode === "biomes" && (
                    <div className="biome-legend">
                      {sortedBiomes.slice(0, 9).map((b) => (
                        <div className="biome-row" key={b.id}>
                          <span className="biome-swatch" style={{background: b.color}}></span>
                          <span>{b.name}</span>
                          <span className="pct">{((b.count / total) * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mode === "heightmap" && (
                    <div className="biome-legend">
                      {[
                        ["█", "Peaks",      "#e8edf0"],
                        ["▓", "Highland",   "#b2bcc5"],
                        ["▒", "Lowland",    "#6e7480"],
                        ["░", "Shallows",   "#3c4148"],
                        ["·", "Sea floor",  "#23262b"],
                      ].map(([g, l, c]) => (
                        <div className="biome-row" key={l}>
                          <span className="biome-swatch" style={{background: c}}></span>
                          <span>{l}</span>
                          <span className="pct mono">{g}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mode === "seams" && (
                    <div className="biome-legend">
                      <div className="biome-row">
                        <span className="biome-swatch" style={{background:"#50c882"}}></span>
                        <span>Seam OK</span>
                        <span className="pct">∀</span>
                      </div>
                      <div className="biome-row">
                        <span className="biome-swatch" style={{background:"#dc5a50"}}></span>
                        <span>Seam mismatch</span>
                        <span className="pct">0</span>
                      </div>
                      <p style={{
                        marginTop:"10px", fontSize:"11.5px", color:"var(--fg-3)",
                        lineHeight:1.55, fontFamily:"var(--font-mono)"
                      }}>
                        81,600 seams<br/>validated in worldtest
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero, WorldPreview, BrandGlyph });
