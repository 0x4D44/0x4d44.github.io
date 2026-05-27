// mdminecraft site — architecture / determinism / performance / networking

const { useState: useStateB } = React;

// =====================================================
// Architecture: clickable crate workspace
// =====================================================
const CRATES = {
  // Application layer
  "mdminecraft": {
    layer: "app", role: "main binary · game loop", deps: ["world", "render", "physics", "ui3d", "assets", "audio"],
    title: "mdminecraft (root crate)",
    blurb: "The launcher and game loop. Owns the main `GameWorld` struct: renderer, chunks, player, input. Boots into the menu or — with --auto-play — straight into gameplay; can also run scripted-input sequences for headless CI demos.",
    types: ["GameWorld", "Menu", "InputBundle", "ScriptedInput"],
  },
  "server": {
    layer: "app", role: "dedicated multiplayer server", deps: ["world", "net", "physics", "ecs"],
    title: "mdminecraft-server",
    blurb: "Authoritative simulation host. Runs the world at 20 TPS, accepts QUIC clients, replicates entity deltas, streams chunks, and is the source of truth that clients reconcile against.",
    types: ["ServerTick", "ServerSnapshot", "ClientSession", "ChannelMux"],
  },
  "client": {
    layer: "app", role: "multiplayer client + prediction", deps: ["net", "world", "render", "physics"],
    title: "mdminecraft-client",
    blurb: "Networked client. Wraps the renderer + input loop, runs `ClientPredictor` for input prediction, reconciles against authoritative `ServerSnapshot` deltas. Reconciliation error stays ≤30ms at 100ms RTT.",
    types: ["ClientPredictor", "Reconciler", "InputBuffer"],
  },
  // Presentation
  "render": {
    layer: "pres", role: "wgpu GPU rendering", deps: ["world", "core", "assets"],
    title: "mdminecraft-render",
    blurb: "GPU-accelerated voxel rendering on wgpu (Vulkan / DirectX 12 / Metal). Owns the VoxelPipeline, SkyboxPipeline, and ParticlePipeline. ChunkManager handles mesh caching, frustum culling, and AO baking into the MeshVertex (pos + normal + texcoord + AO).",
    types: ["Renderer", "VoxelPipeline", "ChunkManager", "MeshVertex"],
  },
  "ui3d": {
    layer: "pres", role: "3D billboards + SDF text", deps: ["render", "core"],
    title: "mdminecraft-ui3d",
    blurb: "Optional in-world UI: billboards, name tags, floating damage numbers. SDF-rendered text. Feature-gated under `ui3d_billboards` so headless builds skip it cleanly.",
    types: ["Billboard", "SdfFont", "Nameplate"],
  },
  // Simulation
  "world": {
    layer: "sim", role: "chunks · terrain · lighting · save", deps: ["core", "ecs"],
    title: "mdminecraft-world",
    blurb: "The world. 16×256×16 voxel chunks; `Voxel` packs BlockId + BlockState + sky/block lighting in SoA layout. Multi-octave Perlin terrain with 14 biomes, propagated lighting, and a region-file save format with zstd at 498× compression.",
    types: ["Chunk", "Voxel", "Biome", "Heightmap", "RegionFile"],
  },
  "ecs": {
    layer: "sim", role: "deterministic scheduler", deps: ["core"],
    title: "mdminecraft-ecs",
    blurb: "Thin wrapper over `bevy_ecs` that pins schedule ordering so multi-system ticks are deterministic. Includes an `ecs_compare` benchmark harness that pits bevy_ecs vs. hecs on representative workloads.",
    types: ["Schedule", "SystemSet", "Stage"],
  },
  "physics": {
    layer: "sim", role: "AABB collision · raycast", deps: ["world", "core"],
    title: "mdminecraft-physics",
    blurb: "Axis-aligned bounding-box collision against voxel terrain. Raycasting for block break/place targeting. Sweep-and-resolve for moving entities — same algorithm on client and server, so prediction stays cheap.",
    types: ["AABB", "RaycastHit", "Sweep"],
  },
  // Foundation
  "core": {
    layer: "fnd", role: "shared types", deps: [],
    title: "mdminecraft-core",
    blurb: "Foundation types: `SimTick` (u64 at 20 TPS — the heartbeat of every deterministic loop), `Voxel`, world coordinates, `ItemStack`. No other crate boundary creates a layering inversion against this one.",
    types: ["SimTick", "ChunkPos", "ItemStack", "WorldCoord"],
  },
  "net": {
    layer: "fnd", role: "QUIC · protocol · prediction", deps: ["core"],
    title: "mdminecraft-net",
    blurb: "QUIC transport via quinn, postcard wire format, five typed channels (Input, EntityDelta, ChunkStream, Chat, Diagnostics), and the client-prediction state machine. Server cert from disk or self-signed dev cert; system root CAs on the client by default.",
    types: ["QuicTransport", "ServerSnapshot", "Channel", "Protocol"],
  },
  "assets": {
    layer: "fnd", role: "atlas + block registry", deps: ["core"],
    title: "mdminecraft-assets",
    blurb: "Block registry (id ↔ name, opacity, texture references). Texture atlas loader — atlas built offline by the `atlas_packer` tool, runtime falls back to a colour-coded debug atlas when files are missing. Atlas metadata is JSON with per-tile UVs.",
    types: ["BlockRegistry", "Atlas", "AtlasEntry"],
  },
  "audio": {
    layer: "fnd", role: "sound + music", deps: ["core"],
    title: "mdminecraft-audio",
    blurb: "Spatial audio for block breaks, footsteps, mobs, and ambient music. Optional — headless builds disable with --no-audio for byte-deterministic replay capture.",
    types: ["AudioSink", "Sample", "Mixer"],
  },
  // Tools
  "testkit": {
    layer: "tools", role: "metrics · event logging", deps: ["core"],
    title: "mdminecraft-testkit",
    blurb: "Metric exporter (`target/metrics/*.json`) and structured event log for worldtests. CI consumes these via the `metrics-diff` tool to gate against performance regression.",
    types: ["Metric", "EventLog", "MetricExporter"],
  },
  "cli": {
    layer: "tools", role: "debug-world · metrics-diff · save-upgrade", deps: ["world", "testkit"],
    title: "mdminecraft-cli",
    blurb: "Developer command-line surface: `debug-world` (heightmaps / biome maps / seam validation), `metrics-diff` (CI regression detection), `save-upgrade` (in-place save migration with timestamped backups).",
    types: ["DebugWorld", "MetricsDiff", "SaveUpgrade"],
  },
  "scripting": {
    layer: "tools", role: "mod API (planned)", deps: ["core"],
    title: "mdminecraft-scripting",
    blurb: "Planned WASM-based mod surface (Phase 6). Sketch only at MVP — there is intentionally no on-ramp built before the actual mod consumers exist.",
    types: ["ModApi (planned)", "WasmHost (planned)"],
  },
};

const LAYERS = [
  { id: "app",   label: "Application",   crates: ["mdminecraft", "server", "client"] },
  { id: "pres",  label: "Presentation",  crates: ["render", "ui3d"] },
  { id: "sim",   label: "Simulation",    crates: ["world", "ecs", "physics"] },
  { id: "fnd",   label: "Foundation",    crates: ["core", "net", "assets", "audio"] },
  { id: "tools", label: "Tools",         crates: ["testkit", "cli", "scripting"] },
];

function Architecture() {
  const [active, setActive] = useStateB("world");
  const c = CRATES[active];
  return (
    <section className="section" id="arch">
      <div className="container">
        <div className="section-header">
          <div className="section-num">02 — ARCHITECTURE</div>
          <div>
            <h2 className="section-title">Fifteen crates. One direction of flow.</h2>
            <p className="section-lede">
              The workspace is layered top-down: applications depend on presentation, which depends on
              simulation, which depends on foundation. Tools sit alongside. Click a crate to see what it
              owns — the central types are listed so you can read a stack trace without opening the repo.
            </p>
          </div>
        </div>

        <div className="arch">
          {LAYERS.map((l) => (
            <div className="arch-layer" key={l.id}>
              <div className="arch-layer-label">{l.label}</div>
              <div className="arch-crates">
                {l.crates.map((cid) => {
                  const cr = CRATES[cid];
                  return (
                    <div
                      key={cid}
                      className={"crate-box" + (cid === active ? " active" : "")}
                      onClick={() => setActive(cid)}
                    >
                      <div className="crate-name">mdm-{cid}</div>
                      <div className="crate-role">{cr.role}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="crate-detail">
            <h4>{c.title}</h4>
            <div className="cd-meta">depends on: {c.deps.length ? c.deps.map(d => "mdm-" + d).join(" · ") : "(no internal deps)"}</div>
            <p>{c.blurb}</p>
            <div className="cd-types">
              {c.types.map((t) => <span className="cd-type" key={t}>{t}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Determinism
// =====================================================
const DET = [
  {
    icon: "≡",
    name: "Same seed = same world",
    detail: "Terrain generation is a pure function of (seed, chunk_coord). The worldtest harness regenerates 18.9 M voxels across 2,601 chunks twice from the same seed and demands byte-equivalent output.",
    formula: "world(seed, x, z) ≡ world(seed, x, z)",
  },
  {
    icon: "⏱",
    name: "20 TPS · SimTick is u64",
    detail: "All gameplay time is in SimTick (u64), advancing at exactly 20 ticks per second. Render and physics decouple from wall clock; tick is the only deterministic time source the simulation ever sees.",
    formula: "SimTick(u64) @ 20 TPS",
  },
  {
    icon: "⊕",
    name: "Scoped RNG, seeded per chunk",
    detail: "No global RNG. Every RNG instance is seeded from `world_seed XOR chunk_hash XOR tick` — so parallel chunk generation is reproducible regardless of scheduling order.",
    formula: "rng = world_seed XOR chunk_hash XOR tick",
  },
  {
    icon: "↺",
    name: "Replay capture, replay deterministic",
    detail: "Record an input stream + initial seed; replay produces a byte-identical sequence of `ServerSnapshot`s. Used both for debugging player reports and for headless screenshot capture in CI.",
    formula: "replay(record(s, i)) = s′ ≡ s",
  },
  {
    icon: "⊣",
    name: "Server-authoritative, prediction reconciles",
    detail: "The client runs a parallel simulation for input prediction; when the server's `ServerSnapshot` arrives, divergence is reconciled by rolling back and replaying. At 100ms RTT, reconciliation error stays under 30ms.",
    formula: "reconcile_err ≤ 30 ms @ RTT = 100 ms",
  },
  {
    icon: "✓",
    name: "159 tests prove it",
    detail: "117 unit + 37 property (proptest, 25,600 cases) + 5 worldtests. The determinism worldtest alone validates 18.9 M voxels and 81,600 chunk seams per release — flaky tests: zero.",
    formula: "0 flaky · 0 known bugs",
  },
];

function Determinism() {
  return (
    <section className="section" id="determinism">
      <div className="container">
        <div className="section-header">
          <div className="section-num">03 — DETERMINISM</div>
          <div>
            <h2 className="section-title">The non-negotiable.</h2>
            <p className="section-lede">
              Determinism isn’t a feature here — it’s the floor. Replay relies on it; multiplayer
              reconciliation relies on it; save-format upgrades rely on it; CI regression checking relies
              on it. Six things have to be true simultaneously, and the test suite enforces all of them.
            </p>
          </div>
        </div>

        <div className="det-grid">
          {DET.map((d) => (
            <div className="det-card" key={d.name}>
              <div className="det-icon">{d.icon}</div>
              <h4>{d.name}</h4>
              <p>{d.detail}</p>
              <div className="det-formula">{d.formula}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Performance
// =====================================================
const PERF = [
  { system: "Terrain generation", sub: "per chunk",        actual: "4.4 ms",    target: "<30 ms",       mult: 6.8,   ratio: 0.85 },
  { system: "Mob simulation",     sub: "per mob",          actual: "0.016 µs",  target: "<1 µs",        mult: 63,    ratio: 0.97 },
  { system: "Item updates",       sub: "per item",         actual: "0.007 µs",  target: "<1 µs",        mult: 147,   ratio: 0.99 },
  { system: "Persistence",        sub: "save compression", actual: "498×",      target: ">3× ratio",    mult: 166,   ratio: 0.99 },
  { system: "Seam validation",    sub: "per release",      actual: "81,600",    target: "all-pass",     mult: null,  ratio: 1.0,  custom: "100%" },
  { system: "Determinism check",  sub: "voxels validated", actual: "18.9 M",    target: "byte-equal",   mult: null,  ratio: 1.0,  custom: "100%" },
];

function Performance() {
  return (
    <section className="section" id="performance">
      <div className="container">
        <div className="section-header">
          <div className="section-num">04 — PERFORMANCE</div>
          <div>
            <h2 className="section-title">Every target met. Most by more than an order of magnitude.</h2>
            <p className="section-lede">
              Targets are the brown bars. Actuals are the green. The right-hand column is the multiple
              by which the engine clears its own bar. The worldtest harness exports JSON metrics to
              <span className="mono"> target/metrics/*.json</span> on every release; the <span className="mono">metrics-diff</span>
              tool gates CI against any regression beyond a documented threshold.
            </p>
          </div>
        </div>

        <div className="perf-table">
          <div className="perf-row header">
            <div>System</div>
            <div>Actual</div>
            <div>Headroom vs. target</div>
            <div>Target</div>
            <div style={{textAlign:"right"}}>×</div>
          </div>
          {PERF.map((p) => (
            <div className="perf-row" key={p.system}>
              <div className="perf-system">
                {p.system}
                <span className="sub">{p.sub}</span>
              </div>
              <div className="perf-value">{p.actual}</div>
              <div className="perf-bar">
                <div className="perf-bar-target" style={{width: "30%"}}></div>
                <div className="perf-bar-actual" style={{width: (p.ratio * 100) + "%"}}></div>
              </div>
              <div className="perf-target">{p.target}</div>
              <div className="perf-mult">{p.mult ? p.mult + "×" : p.custom}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Networking
// =====================================================
const CHANNELS = [
  { name: "Input",       desc: "Client → server. Player movement, look, actions. Sequenced + reliable; input drives prediction so loss matters.",                                              mode: "reliable" },
  { name: "EntityDelta", desc: "Server → client. Quantised entity state diffs against a recent snapshot baseline. Stream of compact updates, not full state.",                                  mode: "reliable" },
  { name: "ChunkStream", desc: "Server → client. Zstd-compressed chunk payloads streamed near-player first. Asynchronous and prioritised by proximity to the player view frustum.",            mode: "reliable" },
  { name: "Chat",        desc: "Bidirectional. Text messages, system events. Reliable but low-priority — never starves the simulation channels.",                                              mode: "reliable" },
  { name: "Diagnostics", desc: "Bidirectional. Out-of-band tick counters, latency probes, telemetry. Unreliable — packet loss is acceptable, never blocks the gameplay path.",                  mode: "unrel" },
];

function Networking() {
  return (
    <section className="section" id="net">
      <div className="container">
        <div className="section-header">
          <div className="section-num">05 — NETWORKING</div>
          <div>
            <h2 className="section-title">QUIC, five channels, client prediction.</h2>
            <p className="section-lede">
              The server is the source of truth. Clients run a parallel simulation for input prediction and
              reconcile when the next <span className="mono">ServerSnapshot</span> arrives. Transport is QUIC
              (via <span className="mono">quinn</span>) — UDP-based with built-in reliability and stream multiplexing,
              so each of the five channels gets its own priority lane.
            </p>
          </div>
        </div>

        <div className="net">
          <div className="net-diagram">
            <svg viewBox="0 0 700 320">
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--rule-2)" />
                </marker>
                <marker id="ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--cyan)" />
                </marker>
              </defs>

              {/* Client box */}
              <g transform="translate(20, 70)">
                <rect width={200} height={180} rx={8} fill="var(--bg-3)" stroke="var(--rule-2)" />
                <text x={20} y={28} fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-4)" letterSpacing="0.05em">CLIENT</text>
                <text x={20} y={56} fontFamily="var(--font-display)" fontSize="18" fill="var(--fg)" fontWeight="600">mdm-client</text>
                <rect x={16} y={74} width={168} height={28} rx={4} fill="var(--bg)" stroke="var(--rule)" />
                <text x={26} y={92} fontFamily="var(--font-mono)" fontSize="11" fill="var(--cyan)">ClientPredictor</text>
                <rect x={16} y={108} width={168} height={28} rx={4} fill="var(--bg)" stroke="var(--rule)" />
                <text x={26} y={126} fontFamily="var(--font-mono)" fontSize="11" fill="var(--cyan)">Reconciler</text>
                <rect x={16} y={142} width={168} height={28} rx={4} fill="var(--bg)" stroke="var(--rule)" />
                <text x={26} y={160} fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-2)">Renderer · Input</text>
              </g>

              {/* Network */}
              <g transform="translate(260, 110)">
                <rect width={180} height={100} rx={8} fill="var(--bg-2)" stroke="var(--cyan-dim)" strokeDasharray="4 3" />
                <text x={90} y={28} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--cyan)" letterSpacing="0.05em">QUIC · quinn</text>
                <text x={90} y={52} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-3)">5 channels</text>
                <text x={90} y={70} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-4)">postcard wire fmt</text>
                <text x={90} y={86} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-4)">rustls / system roots</text>
              </g>

              {/* Server box */}
              <g transform="translate(480, 70)">
                <rect width={200} height={180} rx={8} fill="var(--bg-3)" stroke="var(--rule-2)" />
                <text x={20} y={28} fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-4)" letterSpacing="0.05em">SERVER · authoritative</text>
                <text x={20} y={56} fontFamily="var(--font-display)" fontSize="18" fill="var(--fg)" fontWeight="600">mdm-server</text>
                <rect x={16} y={74} width={168} height={28} rx={4} fill="var(--bg)" stroke="var(--rule)" />
                <text x={26} y={92} fontFamily="var(--font-mono)" fontSize="11" fill="var(--ember)">Simulation @ 20 TPS</text>
                <rect x={16} y={108} width={168} height={28} rx={4} fill="var(--bg)" stroke="var(--rule)" />
                <text x={26} y={126} fontFamily="var(--font-mono)" fontSize="11" fill="var(--ember)">ServerSnapshot</text>
                <rect x={16} y={142} width={168} height={28} rx={4} fill="var(--bg)" stroke="var(--rule)" />
                <text x={26} y={160} fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-2)">World · ECS · Physics</text>
              </g>

              {/* arrows */}
              <line x1={220} y1={130} x2={258} y2={130} stroke="var(--cyan)"   strokeWidth="1.5" markerEnd="url(#ahc)" />
              <line x1={442} y1={195} x2={478} y2={195} stroke="var(--cyan)"   strokeWidth="1.5" markerEnd="url(#ahc)" />
              <line x1={478} y1={150} x2={442} y2={150} stroke="var(--rule-2)" strokeWidth="1.5" markerEnd="url(#ah)"  />
              <line x1={258} y1={170} x2={220} y2={170} stroke="var(--rule-2)" strokeWidth="1.5" markerEnd="url(#ah)"  />

              {/* labels */}
              <text x={232} y={122} fontFamily="var(--font-mono)" fontSize="9" fill="var(--cyan)">InputBundle</text>
              <text x={232} y={186} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-4)">ServerSnapshot</text>

              <text x={20}  y={32} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-4)" letterSpacing="0.05em">PREDICTED LOCALLY</text>
              <text x={480} y={32} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-4)" letterSpacing="0.05em">AUTHORITATIVE</text>

              {/* reconciliation note */}
              <text x={350} y={290} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--moss)">
                reconciliation error ≤ 30 ms @ RTT = 100 ms
              </text>
            </svg>
          </div>

          <div className="channels-list">
            {CHANNELS.map((c) => (
              <div className="channel-row" key={c.name}>
                <div className="channel-name">{c.name}</div>
                <div className="channel-desc">{c.desc}</div>
                <div className={"channel-mode " + c.mode}>{c.mode === "reliable" ? "reliable" : "unreliable"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Architecture, Determinism, Performance, Networking });
