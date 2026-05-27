// mdminecraft site — biomes / testing / tools / harness / roadmap / status / footer

const { useState: useStateC } = React;

// =====================================================
// Biomes grid (uses WorldNoise.BIOMES from noise.js)
// =====================================================
function Biomes() {
  const biomes = window.WorldNoise.BIOMES;
  return (
    <section className="section" id="biomes">
      <div className="container">
        <div className="section-header">
          <div className="section-num">06 — WORLD GEN</div>
          <div>
            <h2 className="section-title">Fourteen biomes, seamlessly stitched.</h2>
            <p className="section-lede">
              Biome assignment is a pure function of elevation, moisture, and temperature — three separate
              noise fields, all seeded from the same world seed. Transitions are tested for continuity by
              the worldtest harness, which validates 81,600 chunk seams per release with zero mismatches
              tolerated.
            </p>
          </div>
        </div>

        <div className="biome-grid">
          {biomes.map((b) => (
            <div className="biome-card" key={b.id}>
              <div className="swatch" style={{
                background:
                  `linear-gradient(135deg, ${b.color}, ${b.color} 50%, oklch(0.155 0.012 60 / 0.18) 50%, oklch(0.155 0.012 60 / 0.18))`,
                backgroundSize: "12px 12px",
              }}></div>
              <div className="info">
                <div className="name">{b.name}</div>
                <div className="stat">id · {b.id}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Testing pyramid
// =====================================================
const WORLDTESTS = [
  { name: "Large-scale terrain",   meta: "2,601 chunks · 81,600 seam validations" },
  { name: "Persistence round-trip", meta: "save/load fidelity · compression validation" },
  { name: "Mob lifecycle",          meta: "80,000 mobs · 6,000 ticks of stress" },
  { name: "Determinism validation", meta: "18.9 M voxels · perfect reproducibility" },
  { name: "Stage 4 metrics",        meta: "full system integration · CI exported" },
];

function Testing() {
  return (
    <section className="section" id="testing">
      <div className="container">
        <div className="section-header">
          <div className="section-num">07 — TESTING</div>
          <div>
            <h2 className="section-title">A pyramid with a wide base and a heavy point.</h2>
            <p className="section-lede">
              159 tests, zero flaky, zero known bugs. The unit floor is broad; the property layer fuzzes
              invariants across 25,600 generated cases; the worldtests sit on top and validate at scale —
              determinism over millions of voxels, persistence over real save files, mobs across thousands
              of ticks.
            </p>
          </div>
        </div>

        <div className="testing">
          <div className="test-pyramid">
            <div className="test-tier tier-1">
              <div className="tier-bar"><div className="fill"></div><div className="label">UNIT · 117 tests</div></div>
              <div className="tier-meta"><strong>per-crate</strong><br/>core functionality</div>
            </div>
            <div className="test-tier tier-2">
              <div className="tier-bar"><div className="fill"></div><div className="label">PROPERTY · 37 tests</div></div>
              <div className="tier-meta"><strong>25,600 cases</strong><br/>via proptest</div>
            </div>
            <div className="test-tier tier-3">
              <div className="tier-bar"><div className="fill"></div><div className="label">WORLDTEST · 5</div></div>
              <div className="tier-meta"><strong>at scale</strong><br/>millions of voxels</div>
            </div>
          </div>

          <div className="test-side">
            <h4>The five worldtests</h4>
            <p>
              Worldtests are large-scale integration tests, opt-in (<span className="mono">--ignored</span> by
              default) and run on release builds for accurate timing. They export structured metrics that
              <span className="mono"> metrics-diff</span> compares against the committed baseline on every release.
            </p>
            <div className="test-list">
              {WORLDTESTS.map((w, i) => (
                <div className="test-item" key={w.name}>
                  <div className="n">0{i + 1}</div>
                  <div>
                    <div style={{fontWeight:500, color:"var(--fg)"}}>{w.name}</div>
                    <div style={{color:"var(--fg-4)", fontSize:"12px", fontFamily:"var(--font-mono)", marginTop:"3px"}}>{w.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Dev tools
// =====================================================
const TOOLS = [
  {
    name: "debug-world",
    bin: "cargo run --bin debug-world",
    desc: "Visual world-gen debugger. ASCII heightmaps, biome maps, chunk-seam validation. The interactive widget at the top of this page is a browser-side echo of this tool.",
    cmd: (
      <>
        <span className="pr">$ </span>cargo run --bin debug-world -- \{"\n"}
        {"  "}heightmap <span className="flag">--seed</span> 12345 <span className="flag">--region</span> -2,-2,2,2{"\n"}
        <span className="com"># Renders 5-level ASCII map: █ ▓ ▒ ░ ·</span>
      </>
    ),
  },
  {
    name: "metrics-diff",
    bin: "cargo run --bin metrics-diff",
    desc: "Performance-regression detector for CI. Compares two metric JSON files exported by worldtests; surfaces any system that crossed its threshold. JSON output for automation.",
    cmd: (
      <>
        <span className="pr">$ </span>cargo run --bin metrics-diff -- \{"\n"}
        {"  "}baseline.json current.json \{"\n"}
        {"  "}<span className="flag">--threshold-warning</span> 0.05 \{"\n"}
        {"  "}<span className="flag">--threshold-failure</span> 0.10
      </>
    ),
  },
  {
    name: "save-upgrade",
    bin: "cargo run --bin save-upgrade",
    desc: "In-place save-format migrator. Upgrades a save directory to the latest on-disk schema; writes a timestamped backup (.bak.*) so a rollback is one rename away.",
    cmd: (
      <>
        <span className="pr">$ </span>cargo run --bin save-upgrade -- \{"\n"}
        {"  "}<span className="flag">--world</span> saves/default{"\n"}
        <span className="com"># --seed N when world.meta is missing</span>{"\n"}
        <span className="com"># --no-backup to disable the bak.* copy</span>
      </>
    ),
  },
  {
    name: "atlas_packer",
    bin: "tools/atlas_packer",
    desc: "Offline texture-atlas builder. Packs authored textures into a runtime-ready atlas.png + atlas.json (per-tile UV metadata). Used at build time; the runtime falls back to a colour-coded debug atlas if files are missing.",
    cmd: (
      <>
        <span className="pr">$ </span>cargo run -p atlas_packer -- \{"\n"}
        {"  "}<span className="flag">--input</span> assets/textures/base \{"\n"}
        {"  "}<span className="flag">--output-image</span> build/atlas.png \{"\n"}
        {"  "}<span className="flag">--output-meta</span> build/atlas.json
      </>
    ),
  },
  {
    name: "ecs_compare",
    bin: "tools/ecs_compare",
    desc: "Micro-benchmark harness pitting bevy_ecs against hecs on representative mdminecraft workloads (position + velocity updates). Helps validate ECS choices against alternatives.",
    cmd: (
      <>
        <span className="pr">$ </span>cargo run -p ecs_compare -- \{"\n"}
        {"  "}<span className="flag">--entities</span> 200000 \{"\n"}
        {"  "}<span className="flag">--ticks</span> 400 <span className="flag">--seed</span> 42
      </>
    ),
  },
  {
    name: "headless capture",
    bin: "cargo run -- --headless",
    desc: "Tick-deterministic frame recorder. Captures frames + teen-style narration to JSONL, then a post-processor stitches MP4 + TTS (Windows SAPI + ffmpeg). For demo reels and bug reports.",
    cmd: (
      <>
        <span className="pr">$ </span>cargo run -- <span className="flag">--headless</span> <span className="flag">--no-audio</span> \{"\n"}
        {"  "}<span className="flag">--world-seed</span> 1 \{"\n"}
        {"  "}<span className="flag">--record-dir</span> video_insights/run \{"\n"}
        {"  "}<span className="flag">--record-duration-seconds</span> 30
      </>
    ),
  },
];

function DevTools() {
  return (
    <section className="section" id="tools">
      <div className="container">
        <div className="section-header">
          <div className="section-num">08 — TOOLING</div>
          <div>
            <h2 className="section-title">Six tools you’ll actually use.</h2>
            <p className="section-lede">
              The shell of an engine is its tooling. Each of these lives in the workspace as its own crate
              or workspace member, gets its own clippy + fmt gate, and is meant to be your first port of call
              when something’s wrong.
            </p>
          </div>
        </div>

        <div className="tools">
          {TOOLS.map((t) => (
            <div className="tool-card" key={t.name}>
              <h4>{t.name}<span className="bin">{t.bin}</span></h4>
              <p className="desc">{t.desc}</p>
              <pre className="cmd">{t.cmd}</pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Automation harness
// =====================================================
const HARNESS_OPS = [
  {
    id: "hello",
    label: "hello",
    request: {
      lines: [
        ['{ "op": "', "hello", '", "id": ', "1", ', "version": ', "1", " }"],
      ],
    },
    response: {
      lines: [
        ['{ "ok": ', "true", ', "id": ', "1", ', "engine": "', "mdminecraft", '" }'],
      ],
    },
    note: "Handshake. Negotiates protocol version.",
  },
  {
    id: "step",
    label: "step",
    request: {
      lines: [
        ['{ "op": "', "step", '", "id": ', "3", ', "ticks": ', "10", " }"],
      ],
    },
    response: {
      lines: [
        ['{ "ok": ', "true", ', "id": ', "3", ', "ticks_advanced": ', "10", ', "sim_tick": ', "10", " }"],
      ],
    },
    note: "Advances the simulation by N ticks. Blocking — returns when the requested tick is committed.",
  },
  {
    id: "screenshot",
    label: "screenshot",
    request: {
      lines: [
        ['{ "op": "', "screenshot", '", "id": ', "4", ', "tag": "', "overlook", '" }'],
      ],
    },
    response: {
      lines: [
        ['{ "ok": ', "true", ', "id": ', "4", ', "path": "', "target/harness/run1/overlook_t000010.png", '" }'],
      ],
    },
    note: "Captures a frame. Returns `unsupported` when --no-render is set.",
  },
  {
    id: "set_view",
    label: "set_view",
    request: {
      lines: [
        ['{ "op": "', "set_view", '", "id": ', "5", ', "yaw": ', "0.785", ', "pitch": ', "-0.262", " }"],
      ],
    },
    response: {
      lines: [
        ['{ "ok": ', "true", ', "id": ', "5", " }"],
      ],
    },
    note: "Camera control. Yaw / pitch in radians (yaw=0 looks +X, pitch clamped to ±π/2).",
  },
  {
    id: "shutdown",
    label: "shutdown",
    request: {
      lines: [
        ['{ "op": "', "shutdown", '", "id": ', "9", " }"],
      ],
    },
    response: {
      lines: [
        ['{ "ok": ', "true", ', "id": ', "9", ', "shutting_down": ', "true", " }"],
      ],
    },
    note: "Graceful exit. Persists save unless --no-save was set.",
  },
];

function renderJsonLine(line) {
  const parts = [];
  for (let i = 0; i < line.length; i++) {
    const chunk = line[i];
    // alternate roles: string, value, string, value, ...
    if (i === 0)                                  parts.push(<span key={i}>{chunk}</span>);
    else if (i % 2 === 1 && i !== line.length - 1) parts.push(<span key={i} className="k">{chunk}</span>);
    else                                           parts.push(<span key={i}>{chunk}</span>);
  }
  return parts;
}

function Harness() {
  const [active, setActive] = useStateC("step");
  const op = HARNESS_OPS.find((o) => o.id === active);
  return (
    <section className="section" id="harness">
      <div className="container">
        <div className="section-header">
          <div className="section-num">09 — HEADLESS AUTOMATION</div>
          <div>
            <h2 className="section-title">A TCP protocol for an entire game engine.</h2>
            <p className="section-lede">
              Launch the engine with <span className="mono">--automation-listen 127.0.0.1:4242</span> and it accepts
              newline-delimited JSON over a socket. With <span className="mono">--automation-step</span> it blocks
              until a <span className="mono">step</span> arrives, so a test driver can advance the world tick by tick
              and screenshot deterministic states. On Unix you can swap TCP for a Unix domain socket via
              <span className="mono"> --automation-uds</span>.
            </p>
          </div>
        </div>

        <div className="harness">
          <div className="harness-tabs">
            {HARNESS_OPS.map((o) => (
              <button
                key={o.id}
                className={"harness-tab" + (o.id === active ? " active" : "")}
                onClick={() => setActive(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="harness-body">
            <div className="harness-pane">
              <h6>→ Request (client)</h6>
              <pre>{op.request.lines.map((ln, i) => <div key={i}>{renderJsonLine(ln)}</div>)}</pre>
            </div>
            <div className="harness-pane">
              <h6>← Response (engine)</h6>
              <pre>{op.response.lines.map((ln, i) => <div key={i}>{renderJsonLine(ln)}</div>)}</pre>
            </div>
          </div>
          <div style={{
            padding:"16px 28px", borderTop:"1px solid var(--rule)",
            background:"var(--bg)", fontFamily:"var(--font-mono)", fontSize:"12px",
            color:"var(--fg-3)"
          }}>
            <span style={{color:"var(--cyan)"}}># </span>{op.note}
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Roadmap
// =====================================================
const PHASES = [
  { num: "00", name: "Foundations & Tooling",        meta: "Stage 0 · workspace, CI, hygiene",          status: "done", body: "Workspace scaffold, formatting and clippy gates, the testkit and metric exporter, the worldtest harness." },
  { num: "01", name: "Engine Core & World Primitives", meta: "Stage 1 · world / chunk / voxel",          status: "done", body: "SimTick, Voxel, Chunk, ChunkPos, BlockRegistry. Multi-octave Perlin terrain. The 14 biomes." },
  { num: "02", name: "Lighting, Environment, Saves",   meta: "Stage 2 · persistence at 498× ratio",       status: "done", body: "Skylight + blocklight propagation. Region file format (.rg) with zstd compression and CRC32 validation. Async I/O." },
  { num: "03", name: "Networking & Multiplayer",       meta: "Stage 3 · QUIC + prediction",               status: "done", body: "quinn QUIC transport, five typed channels, client prediction, server reconciliation. ≤30ms error at 100ms RTT." },
  { num: "04", name: "Biomes, Structures, Content",    meta: "Stage 4 · environmental fill",              status: "done", body: "14 biomes integrated, heightmap features (trees, ores), lifecycle for 80,000-mob stress tests. Full system integration metrics." },
  { num: "05", name: "Hardening, CI, Release Prep",    meta: "Stage 5 · MVP gate",                        status: "done", body: "159 tests stable. 0 flaky, 0 known bugs. Performance baselines committed. Release-ready." },
  { num: "06", name: "Phase 1 · Technical Foundation", meta: "active · documentation, asset pipeline",    status: "active", body: "Error-handling audit, public API docs, ADRs, default texture pack, integration tests for the main game loop, network fuzzing." },
  { num: "07", name: "Phase 2 · Multiplayer Completion", meta: "planned",                                  status: "future", body: "Server tick loop, full entity replication, chunk-streaming priority, reconnection logic, latency compensation, network simulation testing." },
  { num: "08", name: "Phases 3–6 · Gameplay → Modding", meta: "planned",                                  status: "future", body: "Combat, tools, full inventory, crafting UI, hunger; shadow mapping, water rendering, LOD, post-processing; underground biomes, structures; WASM scripting; resource packs; server plugins." },
];

function Roadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="container">
        <div className="section-header">
          <div className="section-num">10 — ROADMAP</div>
          <div>
            <h2 className="section-title">MVP complete. The post-MVP work is where the gameplay lives.</h2>
            <p className="section-lede">
              Stages 0–5 are the engine. Phases 1–6 are the game built on it. The MVP gate was crossed
              on the back of 159 stable tests and met-or-exceeded performance targets; the work ahead
              is feature breadth, not foundation repair.
            </p>
          </div>
        </div>

        <div className="roadmap">
          {PHASES.map((p) => (
            <div className={"phase " + p.status} key={p.num}>
              <div className="phase-num">{p.num}</div>
              <div className="phase-body">
                <h5>{p.name}</h5>
                <div className="ph-meta">{p.meta}</div>
                <p>{p.body}</p>
              </div>
              <div className="phase-status">
                <span className="badge">
                  {p.status === "done" ? "✓ done" : p.status === "active" ? "● active" : "○ planned"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Status strip
// =====================================================
function StatusStrip() {
  const items = [
    { label: "Version",      val: "0.1.0",         sub: "MVP · production-ready" },
    { label: "Edition",      val: "2021",          sub: "Rust 1.75+ supported" },
    { label: "Licence",      val: "MIT · Apache-2.0", sub: "dual-licensed, your choice" },
    { label: "Workspace",    val: "15 crates",     sub: "12 lib · 3 binaries · 2 tools" },
  ];
  return (
    <section className="section" id="status">
      <div className="container">
        <div className="section-header">
          <div className="section-num">11 — STATUS</div>
          <div>
            <h2 className="section-title">Open source, dual-licensed, ready to fork.</h2>
            <p className="section-lede">
              The MVP is the baseline — everything past it is incremental. Build it, run it, instrument it,
              fork it for your own voxel project, or contribute back: the test harness will catch any
              accidental drift in determinism or performance before your PR merges.
            </p>
          </div>
        </div>

        <div className="status-grid">
          {items.map((it) => (
            <div className="status-card" key={it.label}>
              <div className="sc-label">{it.label}</div>
              <div className="sc-val">{it.val}</div>
              <div className="sc-sub">{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// Footer
// =====================================================
function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">md<span className="accent">minecraft</span></div>
            <p className="footer-tag">
              A deterministic voxel sandbox engine, in Rust. Server-authoritative multiplayer with client
              prediction, GPU rendering on wgpu, fourteen biomes, and 159 tests holding determinism across
              18.9 million voxels.
            </p>
            <div className="footer-licence">© 2026 mdminecraft contributors · MIT · Apache-2.0</div>
          </div>

          <div>
            <h5>Project</h5>
            <a href="https://github.com/0x4D44/mdminecraft" target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://github.com/0x4D44/mdminecraft/blob/main/README.md" target="_blank" rel="noreferrer">README</a>
            <a href="https://github.com/0x4D44/mdminecraft/blob/main/ROADMAP.md" target="_blank" rel="noreferrer">Roadmap</a>
            <a href="https://github.com/0x4D44/mdminecraft/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">Changelog</a>
          </div>

          <div>
            <h5>Sections</h5>
            <a href="#demo">World generator</a>
            <a href="#arch">Architecture</a>
            <a href="#determinism">Determinism</a>
            <a href="#performance">Performance</a>
            <a href="#net">Networking</a>
            <a href="#harness">Automation</a>
          </div>

          <div>
            <h5>Built on</h5>
            <a href="https://wgpu.rs/" target="_blank" rel="noreferrer">wgpu</a>
            <a href="https://github.com/quinn-rs/quinn" target="_blank" rel="noreferrer">quinn</a>
            <a href="https://github.com/bevyengine/bevy" target="_blank" rel="noreferrer">bevy_ecs</a>
            <a href="https://github.com/facebook/zstd" target="_blank" rel="noreferrer">zstd</a>
            <a href="https://github.com/proptest-rs/proptest" target="_blank" rel="noreferrer">proptest</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Biomes, Testing, DevTools, Harness, Roadmap, StatusStrip, Footer });
