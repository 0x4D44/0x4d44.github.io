// ropus interactive components

const { useState, useEffect, useRef, useMemo } = React;
const D = window.ROPUS_DATA;

/* ----------------------------- Animated waveform ----------------------------- */
function Waveform() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf;
    const tick = () => { setT(performance.now() / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const bars = 96;
  const heights = [];
  for (let i = 0; i < bars; i++) {
    const f1 = Math.sin(i * 0.22 + t * 1.7) * 0.5 + 0.5;
    const f2 = Math.sin(i * 0.07 + t * 0.6) * 0.5 + 0.5;
    const f3 = Math.sin(i * 0.45 - t * 2.4) * 0.4 + 0.5;
    const env = Math.exp(-Math.pow((i / bars - 0.5) * 2.2, 2));
    heights.push((f1 * 0.45 + f2 * 0.35 + f3 * 0.2) * env);
  }

  return (
    <div className="waveform">
      <svg width="100%" height="80" viewBox={`0 0 ${bars * 6} 80`} preserveAspectRatio="none">
        {heights.map((h, i) => {
          const bh = Math.max(2, h * 70);
          return (
            <rect
              key={i}
              x={i * 6}
              y={(80 - bh) / 2}
              width="3"
              height={bh}
              rx="1"
              fill={i < bars * 0.3 ? "var(--accent-2)" : i < bars * 0.65 ? "var(--accent)" : "var(--accent-3)"}
              opacity={0.4 + h * 0.6}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ----------------------------- Hero ----------------------------- */
function Hero() {
  return (
    <section className="hero">
      <div className="hero-grid" />
      <div className="hero-glow" />
      <div className="container hero-content">
        <div className="hero-tag">
          <span className="pulse" />
          <span>v0.12.18 · published on crates.io · BSD-3-Clause</span>
        </div>
        <h1>
          The <span className="accent">Opus</span> codec,<br/>
          ported to <span className="accent">safe Rust</span>,<br/>
          <span className="strike">close to</span> bit-exact<sup style={{fontSize:"0.4em",color:"var(--muted)"}}>*</sup> against the C reference.
        </h1>
        <p className="hero-sub">
          ropus is a Rust port of <a href="#" onClick={e => e.preventDefault()}>xiph/opus</a> — the fixed-point audio codec running inside every modern VoIP stack, WebRTC, YouTube, Discord, and most video-conferencing products. It compiles without a C toolchain, exposes an idiomatic Rust API, and is validated frame-by-frame against the upstream C codec on every commit.
        </p>
        <div className="hero-stats">
          <div className="hero-stat"><div className="n">~36k</div><div className="l">Lines of Rust</div></div>
          <div className="hero-stat"><div className="n">26 / 26</div><div className="l">Modules ported</div></div>
          <div className="hero-stat"><div className="n">280 / 280</div><div className="l">Harness configs</div></div>
          <div className="hero-stat"><div className="n">24 / 24</div><div className="l">IETF RFC vectors</div></div>
        </div>
        <Waveform />
        <p style={{fontSize: "0.78rem", color: "var(--dim)", marginTop: 18, fontFamily: "var(--font-mono)"}}>
          * Tier-1 bit-exact on CELT, SILK, Opus, range coder, RDOVAE, DRED payload. Tier-2 SNR-bounded (≥50 dB) on the float-path DNN modules where cross-platform determinism isn't reachable.
        </p>
      </div>
    </section>
  );
}

/* ----------------------------- What is Opus? ----------------------------- */
function WhatIsOpus() {
  return (
    <section className="section" id="what">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">01 — Context</div>
          <h2>What is Opus, and why port it?</h2>
          <p className="lede">
            Opus is the IETF-standardized royalty-free audio codec described by <a>RFC 6716</a> and its 2017 extension <a>RFC 8251</a>. It scales seamlessly from 8 kbps mono speech to 510 kbps stereo full-band audio, with frame sizes from 2.5 ms to 120 ms. It's the audio layer of WebRTC, the default codec in Zoom, Discord, Teams, and YouTube live audio.
          </p>
        </div>

        <div className="cards">
          <div className="card">
            <div className="ico">1</div>
            <h3>One codec, two engines</h3>
            <p>Internally Opus is two codecs fused: <b>SILK</b> (the Skype speech codec) handles low-rate voice; <b>CELT</b> (Constrained Energy Lapped Transform) handles music and full-band. A hybrid mode runs both. The encoder picks per-frame.</p>
          </div>
          <div className="card">
            <div className="ico">2</div>
            <h3>Production-critical, C-only</h3>
            <p>Every existing implementation is the xiph C reference or a fork of it — DSP-heavy, hand-tuned SSE/AVX2, ~60–80k lines of production-grade C. A bug-for-bug match in a safer language is non-trivial.</p>
          </div>
          <div className="card">
            <div className="ico">3</div>
            <h3>The oracle is free</h3>
            <p>xiph/opus is open-source. Which means correctness has an <i>executable definition</i> — link the C reference into the same Rust binary and compare outputs byte-for-byte. ropus turns the port into a bisection problem.</p>
          </div>
        </div>

        <div className="callout">
          The whole project rests on one idea: the C reference is correct, compilable, and a <code>memcpy</code> away. Most ambitious ports don't have this luxury. Pretend otherwise and the method evaporates.
          <span className="src">— from <i>Porting Opus to Rust in 24 Days</i></span>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Mode picker ----------------------------- */
function ModePicker() {
  const [mode, setMode] = useState("silk");
  const m = D.modes.find(x => x.key === mode);
  const sampleRates = [8, 12, 16, 24, 48];

  return (
    <section className="section" id="modes">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">02 — Architecture</div>
          <h2>SILK, CELT, and the hybrid in between</h2>
          <p className="lede">
            Opus dispatches each 20 ms frame to one of three internal codec configurations. The encoder picks based on content and bitrate; the decoder reads the configuration from the TOC byte. Click a mode to see where it lives in the sample-rate spectrum.
          </p>
        </div>

        <div className="mode-picker">
          <div className="mode-tabs">
            {D.modes.map(opt => (
              <button
                key={opt.key}
                className={"mode-tab" + (mode === opt.key ? " active" : "")}
                onClick={() => setMode(opt.key)}
              >
                <div className="t">{opt.title}</div>
                <div className="s">{opt.sub}</div>
              </button>
            ))}
          </div>
          <div className="mode-detail">
            <h3>{m.title} — {m.sub}</h3>
            <p>{m.desc}</p>
            <div className="eyebrow" style={{marginTop:18}}>Sample rate coverage</div>
            <div className="mode-grid">
              {sampleRates.map(r => (
                <div key={r} className={"mode-cell " + (m.rates[r] ? "on" : "off")}>
                  <div className="khz">{r} kHz</div>
                  <div className="lbl">{m.labels[r]}</div>
                </div>
              ))}
            </div>
            <p style={{marginTop:18,fontSize:"0.86rem",color:"var(--dim)",fontFamily:"var(--font-mono)"}}>
              NB narrowband · MB mediumband · WB wideband · SWB super-wideband · FB fullband
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Oracle simulator ----------------------------- */
function Oracle() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState("clean"); // "clean" | "qconst" | "slice"

  // Hand-crafted byte patterns. "clean" = identical. "qconst" = small diff at byte 14. "slice" = burst diff starting byte 9.
  const baseBytes = ["fc", "84", "a3", "0e", "92", "7b", "41", "c0", "11", "55", "9a", "2d", "08", "ee", "37", "b4", "62", "1f", "8c", "d3", "47", "a9", "05", "fb"];
  const variant = useMemo(() => {
    if (scenario === "clean") return [...baseBytes];
    if (scenario === "qconst") {
      const v = [...baseBytes];
      v[14] = "3c"; // single-byte delta — the QCONST32 story
      return v;
    }
    // slice
    const v = [...baseBytes];
    ["b1", "92", "44", "7f", "20", "ff"].forEach((b, i) => { v[9 + i] = b; });
    return v;
  }, [scenario]);

  useEffect(() => {
    if (!running) return;
    if (step >= baseBytes.length) { setRunning(false); return; }
    const id = setTimeout(() => setStep(s => s + 1), 90);
    return () => clearTimeout(id);
  }, [running, step]);

  const firstDiff = useMemo(() => {
    for (let i = 0; i < baseBytes.length; i++) {
      if (baseBytes[i] !== variant[i]) return i;
    }
    return -1;
  }, [variant]);

  const run = () => { setStep(0); setRunning(true); };

  return (
    <section className="section" id="oracle">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">03 — How it's validated</div>
          <h2>The differential oracle</h2>
          <p className="lede">
            <code>harness/build.rs</code> compiles 89 files of the xiph/opus C source into <code>libopus_ref</code>, links it into the same Rust binary as ropus, and exposes one function: <code>compare(c_encode(x), rust_encode(x))</code>. Both run in-process. Both receive byte-identical input. The harness returns the first offset at which the encoded packets diverge.
          </p>
        </div>

        <div className="oracle">
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:18,alignItems:"flex-end",marginBottom:24}}>
            <div>
              <h3 style={{fontFamily:"var(--font-mono)",fontSize:"1rem"}}>$ ropus-compare encode 48k_sine1k_loud.wav</h3>
              <p style={{color:"var(--muted)",fontSize:"0.88rem",margin:"6px 0 0",fontFamily:"var(--font-mono)"}}>Pick a scenario and run the sweep.</p>
            </div>
            <div className="oracle-controls">
              <button className={"btn" + (scenario === "clean" ? " primary" : "")} onClick={() => { setScenario("clean"); setStep(0); }}>Identical</button>
              <button className={"btn" + (scenario === "qconst" ? " primary" : "")} onClick={() => { setScenario("qconst"); setStep(0); }}>1-byte delta</button>
              <button className={"btn" + (scenario === "slice" ? " primary" : "")} onClick={() => { setScenario("slice"); setStep(0); }}>Cascading drift</button>
              <button className="btn primary" onClick={run} disabled={running}>{running ? "Comparing…" : "▶ Run"}</button>
            </div>
          </div>

          <div className="lane">
            <div className="lane-label">
              C reference<br/>
              <span className="impl-tag c">libopus_ref</span>
            </div>
            <div className="byte-stream">
              {baseBytes.map((b, i) => (
                <span key={i} className={"byte" + (i < step ? " same" : "")}>{b}</span>
              ))}
            </div>
          </div>

          <div className="lane">
            <div className="lane-label">
              ropus<br/>
              <span className="impl-tag r">Rust port</span>
            </div>
            <div className="byte-stream">
              {variant.map((b, i) => {
                let cls = "byte";
                if (i < step) cls += (b === baseBytes[i]) ? " same" : " diff";
                return <span key={i} className={cls}>{b}</span>;
              })}
            </div>
          </div>

          <div className="diff-readout">
            <div><span className="l">bytes compared:</span> <span className="v">{step} / {baseBytes.length}</span></div>
            <div>
              <span className="l">first divergence:</span>{" "}
              {step === 0 || (firstDiff !== -1 && step <= firstDiff)
                ? <span className="v">—</span>
                : firstDiff === -1
                  ? <span className="v ok">none</span>
                  : <span className="v bad">@ offset 0x{firstDiff.toString(16).padStart(2,"0")}</span>}
            </div>
            <div>
              <span className="l">verdict:</span>{" "}
              {step < baseBytes.length
                ? <span className="v">…</span>
                : firstDiff === -1
                  ? <span className="v ok">PASS — byte-exact parity</span>
                  : <span className="v bad">FAIL — bisect from offset</span>}
            </div>
          </div>

          <div style={{marginTop:24, paddingTop:24, borderTop:"1px solid var(--border)"}}>
            <div className="eyebrow">Why this matters</div>
            <p style={{color:"var(--muted)",marginTop:8}}>
              Most generative work has no way to check correctness at scale. Codec porting does — and that&apos;s the whole game. Every bug has an offset. Every offset points to a frame. Every frame came from a specific codec path. A full sweep runs in ~100 ms.
            </p>
            <div className="tag-row">
              <span className="tag-pill">encode</span>
              <span className="tag-pill">decode</span>
              <span className="tag-pill">roundtrip</span>
              <span className="tag-pill">framecompare</span>
              <span className="tag-pill">decodecompare</span>
              <span className="tag-pill">mathcompare</span>
              <span className="tag-pill">rngtest</span>
              <span className="tag-pill">unit &lt;module&gt;</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Modules tree ----------------------------- */
function Modules() {
  const [open, setOpen] = useState(null);
  const groups = ["CELT", "SILK", "Opus", "DNN"];
  return (
    <section className="section" id="modules">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">04 — Anatomy</div>
          <h2>26 modules, four families</h2>
          <p className="lede">
            Ported bottom-up by dependency. Tier-1 means bit-exact against the C reference. Tier-2 means SNR-bounded (≥50 dB) where the C-float reference itself drifts cross-platform. Click any row.
          </p>
        </div>
        <div className="modules">
          {groups.map(g => (
            <div className="mod-group" key={g}>
              <h3><span>{g}</span><span className="badge">{D.modules[g].length}</span></h3>
              <div className="mod-list">
                {D.modules[g].map(m => (
                  <React.Fragment key={m.i}>
                    <div
                      className={"mod-item" + (open === `${g}-${m.i}` ? " open" : "")}
                      onClick={() => setOpen(open === `${g}-${m.i}` ? null : `${g}-${m.i}`)}
                    >
                      <span className="idx">{String(m.i).padStart(2,"0")}</span>
                      <span className="name">{m.name}</span>
                      <span className={"tier " + m.t}>{m.t === "t1" ? "tier-1" : "tier-2"}</span>
                    </div>
                    {open === `${g}-${m.i}` && <div className="mod-detail">{m.d}</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Testing pyramid ----------------------------- */
function Testing() {
  const [active, setActive] = useState(0);
  return (
    <section className="section" id="testing">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">05 — Validation</div>
          <h2>Eight layers of testing, four independent oracles</h2>
          <p className="lede">
            Unit tests for fast local feedback, the differential harness for routine regression, fuzzing for adversarial input, and the IETF spec vectors as the canonical truth source. Each layer catches what the others can't.
          </p>
        </div>
        <div>
          {D.tests.map((t, i) => (
            <div
              key={t.n}
              className={"pyramid-layer" + (active === i ? " active" : "")}
              onClick={() => setActive(i)}
            >
              <h4><span className="num">{t.n}</span> {t.title}</h4>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Performance chart ----------------------------- */
function Perf() {
  const [view, setView] = useState("encode");
  const rows = D.perf[view];
  const max = 1.6; // scale: 0..2× where 1× is parity
  const mean = (rows.reduce((s, r) => s + r.r, 0) / rows.length);

  return (
    <section className="section" id="perf">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">06 — Performance</div>
          <h2>At C-reference parity on AVX2</h2>
          <p className="lede">
            Ratio of Rust wall time over the xiph/opus C 1.5.2 reference, measured via <code>tools/bench_sweep.sh --iters=30</code>. Both sides dispatch to AVX2 at runtime. <code>&lt;1.0×</code> means ropus is <i>faster</i> than C. The centre line is parity.
          </p>
        </div>

        <div className="perf">
          <div className="perf-tabs">
            <button className={view === "encode" ? "on" : ""} onClick={() => setView("encode")}>Encode</button>
            <button className={view === "decode" ? "on" : ""} onClick={() => setView("decode")}>Decode</button>
          </div>
          {rows.map(row => {
            const fast = row.r < 1;
            const delta = Math.abs(row.r - 1);
            const widthPct = Math.min(50, (delta / (max - 1)) * 50);
            return (
              <div className="perf-row" key={row.v}>
                <div className="label">{row.v}</div>
                <div className="perf-bar">
                  <div className="baseline" />
                  <div
                    className={"fill " + (fast ? "fast" : "slow")}
                    style={fast ? { width: widthPct + "%", right: "50%" } : { width: widthPct + "%", left: "50%" }}
                  />
                </div>
                <div className={"ratio " + (fast ? "fast" : "slow")}>{row.r.toFixed(2)}×</div>
              </div>
            );
          })}
          <div className="perf-row" style={{borderTop:"1px solid var(--border-strong)", borderBottom: "none", marginTop:8, paddingTop:14}}>
            <div className="label" style={{fontWeight:600, color:"var(--text)"}}>Mean</div>
            <div className="perf-bar" />
            <div className={"ratio " + (mean < 1 ? "fast" : "slow")}>{mean.toFixed(2)}×</div>
          </div>

          <div style={{marginTop:24, fontSize:"0.88rem", color:"var(--muted)"}}>
            Three encode vectors run <i>faster</i> than C (sine, sweep, SPEECH); MUSIC at 1.01× is essentially parity; the remaining six run 3–14% slower, dominated by SILK paths where the C reference dispatches to hand-tuned SSE. Decode is faster or at parity on eight of ten vectors.
          </div>

          <div className="tag-row">
            <span className="tag-pill">target-cpu = x86-64-v3</span>
            <span className="tag-pill">lto = thin (not fat)</span>
            <span className="tag-pill">no PGO (wash-to-negative)</span>
            <span className="tag-pill">wide crate for portable SIMD</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- 24-day timeline ----------------------------- */
function Timeline() {
  const [idx, setIdx] = useState(4); // VICTORY
  const e = D.timeline[idx];

  return (
    <section className="section" id="timeline">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">07 — Story</div>
          <h2>24 days, in events</h2>
          <p className="lede">
            From a 53,852-line bulk import to a shippable crate on crates.io. The bumps are real; the lessons are reusable. Click any dot.
          </p>
        </div>

        <div className="timeline">
          <div className="timeline-track">
            <div className="timeline-axis" />
            {D.timeline.map((ev, i) => (
              <div
                key={i}
                className={"tl-event" + (idx === i ? " active" : "")}
                style={{ left: ev.pos + "%" }}
                onClick={() => setIdx(i)}
              >
                <div className="tip">{ev.date}</div>
              </div>
            ))}
          </div>
          <div className="tl-detail">
            <div className="date">{e.date}</div>
            <h3>{e.title}</h3>
            <p>{e.desc}</p>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:18,fontFamily:"var(--font-mono)",fontSize:"0.78rem",color:"var(--muted)"}}>
            <span>27 Mar 2026</span>
            <span style={{color:"var(--accent)"}}>~ 6 weeks elapsed</span>
            <span>11 May 2026</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Code tabs (Usage) ----------------------------- */
function Usage() {
  const [tab, setTab] = useState("lib");
  const [copied, setCopied] = useState(false);

  const code = {
    lib: (
`use ropus::{Application, Channels, DecodeMode, Decoder, Encoder};

let mut encoder = Encoder::builder(48_000, Channels::Mono, Application::Voip)
    .build()
    .unwrap();

let pcm_in = [0i16; 960]; // 20 ms at 48 kHz mono
let mut packet = [0u8; 4000];
let len = encoder.encode(&pcm_in, &mut packet).unwrap();

let mut decoder = Decoder::new(48_000, Channels::Mono).unwrap();
let mut pcm_out = [0i16; 960];
let samples = decoder
    .decode(&packet[..len], &mut pcm_out, DecodeMode::Normal)
    .unwrap();
assert_eq!(samples, 960);`),
    cli: (
`# Encode any symphonia-supported input to Ogg Opus
cargo run -p ropusenc  -- input.wav -o output.opus

# Decode Ogg Opus to WAV or raw PCM
cargo run -p ropusdec  -- input.opus -o output.wav

# Print Ogg Opus stream metadata
cargo run -p ropusinfo -- input.opus

# Play via the default output device
cargo run -p ropusplay -- input.opus`),
    harness: (
`# Bit-exact differential against the C reference (in-process)
cargo run --bin ropus-compare -- encode    tests/vectors/48k_sine1k_loud.wav
cargo run --bin ropus-compare -- decode    tests/vectors/48k_impulse.wav
cargo run --bin ropus-compare -- roundtrip tests/vectors/48k_sine1k_loud.wav --bitrate 64000

# Module-level unit comparison
cargo run --bin ropus-compare -- unit range_coder

# Performance comparison
cargo run --bin ropus-compare -- bench tests/vectors/48k_sine1k_loud.wav --iters 30`),
    conformance: (
`# All 7 xiph reference test binaries against the capi shim.
# --test-threads=1 is mandatory (the C tests have file-scope state).
cargo test -p conformance -- --test-threads=1

# IETF RFC 6716 / RFC 8251 bitstream vectors (24 subtests).
# Provision once via:
tools/fetch_ietf_vectors.sh          # Linux/macOS/Git Bash
tools/fetch_ietf_vectors.ps1         # Windows
cargo test -p conformance --test ietf_vectors -- --test-threads=1`)
  };

  const labels = {
    lib: "Library (cargo add ropus)",
    cli: "End-user CLIs",
    harness: "ropus-compare harness",
    conformance: "Conformance suite"
  };

  const copy = () => {
    navigator.clipboard.writeText(code[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // crude syntax highlight
  const highlight = (src, kind) => {
    if (kind === "shell" || tab !== "lib") {
      const lines = src.split("\n").map((ln, i) => {
        if (ln.trim().startsWith("#")) return <div key={i}><span className="com">{ln}</span></div>;
        return <div key={i}>{ln}</div>;
      });
      return <code>{lines}</code>;
    }
    // Rust quasi-highlight
    const tokenize = (line) => {
      const parts = [];
      const re = /(\/\/.*$)|("[^"]*")|\b(use|let|mut|fn|pub|struct|enum|impl|self|as|match|if|else|return|unwrap|assert_eq)\b|\b(\d[\d_]*)\b/g;
      let last = 0, m;
      while ((m = re.exec(line)) !== null) {
        if (m.index > last) parts.push(line.slice(last, m.index));
        if (m[1]) parts.push(<span className="com" key={parts.length}>{m[1]}</span>);
        else if (m[2]) parts.push(<span className="str" key={parts.length}>{m[2]}</span>);
        else if (m[3]) parts.push(<span className="kw" key={parts.length}>{m[3]}</span>);
        else if (m[4]) parts.push(<span className="num" key={parts.length}>{m[4]}</span>);
        last = re.lastIndex;
      }
      if (last < line.length) parts.push(line.slice(last));
      return parts;
    };
    return <code>{src.split("\n").map((l, i) => <div key={i}>{tokenize(l)}</div>)}</code>;
  };

  return (
    <section className="section" id="usage">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">08 — Using it</div>
          <h2>From <code>cargo add</code> to the foobar2000 plugin</h2>
          <p className="lede">
            The crates.io install needs no C toolchain. The CLI suite (<code>ropusenc</code>, <code>ropusdec</code>, <code>ropusinfo</code>, <code>ropusplay</code>) wraps the codec for day-to-day use. The harness and conformance suite are how parity is enforced.
          </p>
        </div>
        <div className="code-tabs">
          <div className="code-tabs-header">
            {Object.keys(code).map(k => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{labels[k]}</button>
            ))}
          </div>
          <div className="code-tabs-body">
            <button className="copy" onClick={copy}>{copied ? "copied ✓" : "copy"}</button>
            <pre>{highlight(code[tab], tab === "lib" ? "rust" : "shell")}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Ecosystem ----------------------------- */
function Ecosystem() {
  const items = [
    { name: "ropus", tag: "library", desc: "The published crate. Almost entirely safe Rust. Only runtime dep is the wide crate for portable SIMD. cargo add ropus works without a C toolchain.", cmd: "cargo add ropus" },
    { name: "capi", tag: "C ABI shim", desc: "Exposes the Rust codec through the libopus C ABI. The official xiph test binaries — including test_opus_encode, test_opus_decode, test_opus_api — compile unmodified against this shim.", cmd: "// drop-in libopus replacement" },
    { name: "ropusenc · ropusdec · ropusinfo · ropusplay", tag: "CLIs", desc: "End-user tooling. ropusenc accepts anything symphonia handles (WAV, FLAC, MP3, AAC, …) and emits standard Ogg Opus per RFC 7845.", cmd: "cargo install --path ropusenc" },
    { name: "ropus-fb2k · foo_ropus.dll", tag: "foobar2000 plugin", desc: "Windows foobar2000 input-component. ropus-fb2k is Rust + Ogg demux behind a stable C ABI; foo_ropus is the C++ SDK adapter. Decodes real-world .opus files at tier-2 SNR with live VBR bitrate in the status bar.", cmd: "pwsh -File foo_ropus\\build.ps1" },
    { name: "harness", tag: "internal", desc: "publish=false. The cc-crate build script that compiles 89 xiph C files into libopus_ref. The 280-config differential matrix. Fuzz drivers. The reason the project shipped.", cmd: "cargo run --bin ropus-compare -- …" },
    { name: "tools/coordinator.py", tag: "process", desc: "Python multi-agent orchestrator. Drove Document → HLD → Test Harness → Implement → Integrate phases. Wrote 17 'Trace-fix iteration 3' commits in a row before being mostly abandoned in favour of hand-orchestrated parallel agents.", cmd: "python tools/coordinator.py status" }
  ];

  return (
    <section className="section" id="ecosystem">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">09 — Workspace</div>
          <h2>The crates that ship around the codec</h2>
          <p className="lede">
            The Cargo workspace at the root carries fifteen members. The library crate is one of them; the rest are CLIs, the C ABI shim, comparison and fuzz harnesses, a foobar2000 backend, and the test infrastructure.
          </p>
        </div>
        <div className="eco">
          {items.map(it => (
            <div className="eco-card" key={it.name}>
              <div className="head">
                <h3>{it.name}</h3>
                <span className="tag">{it.tag}</span>
              </div>
              <p>{it.desc}</p>
              <div className="cmd">{it.cmd}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Community ----------------------------- */
function Community() {
  return (
    <section className="section" id="community">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">10 — Community fit</div>
          <h2>Independent port, not a fork</h2>
        </div>
        <div className="cards">
          <div className="card">
            <div className="ico">↑</div>
            <h3>Upstream is xiph/opus</h3>
            <p>The C codec is maintained by the <a>Xiph.Org Foundation</a>. ropus tracks upstream's fixed-point path. Reference C source lives in <code>reference/</code>, fetched via <code>cargo run -p fetch-assets</code> at a pinned commit; never committed to ropus.</p>
          </div>
          <div className="card">
            <div className="ico">⚖</div>
            <h3>BSD-3-Clause, royalty-free</h3>
            <p>The port inherits the licence; upstream Xiph.Org copyright is preserved verbatim per BSD-3-Clause clause 1. The Opus IETF IPR contributors — Xiph.Org, Microsoft, Skype, Broadcom — grant royalty-free patent terms.</p>
          </div>
          <div className="card">
            <div className="ico">⌬</div>
            <h3>Drop-in via capi/</h3>
            <p>The C ABI shim lets existing libopus consumers link ropus without code changes. Useful for safety-sensitive environments (real-time conferencing, embedded VoIP) where unsafe-by-default is a liability.</p>
          </div>
          <div className="card">
            <div className="ico">✱</div>
            <h3>Not affiliated, not endorsed</h3>
            <p>ropus is independent. The acknowledgement in the crate&apos;s README is explicit: credit upstream, but don't claim affiliation. Bugs found in ropus stay in ropus's tracker.</p>
          </div>
          <div className="card">
            <div className="ico">◈</div>
            <h3>Real consumer: foobar2000</h3>
            <p>The <code>ropus-fb2k</code> + <code>foo_ropus.dll</code> stack lets Windows users actually listen to .opus files decoded by ropus today, with live VBR bitrate display in the status bar. First non-test consumer of the codec.</p>
          </div>
          <div className="card">
            <div className="ico">◷</div>
            <h3>Published, versioned, changelog'd</h3>
            <p>0.12.18 on crates.io as of 11 May 2026. Keep-a-Changelog format, SemVer pre-1.0. Every patch release lists which fuzz cluster it closes and which divergence it removed.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Lessons ----------------------------- */
function Lessons() {
  return (
    <section className="section" id="lessons">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">11 — What didn't generalise</div>
          <h2>If you take one thing away</h2>
          <p className="lede">
            The headline reading is that multi-agent AI ported 36k lines of production codec in 24 days. The sharper framing: <i>multi-agent AI, given an executable oracle and a skeptical human in the loop, can execute an ambitious translation against that oracle at a pace that would have been implausible two years ago.</i> Most of the leverage is in the oracle.
          </p>
        </div>
        <div className="lessons">
          {D.lessons.map(l => (
            <div className="lesson" key={l.n}>
              <div className="n">{l.n}</div>
              <h3>{l.title}</h3>
              <p>{l.body}</p>
            </div>
          ))}
        </div>
        <div className="callout" style={{marginTop:36}}>
          Go find your oracle first. If there isn&apos;t one, build one. If you can&apos;t build one, pick a different problem.
          <span className="src">— closing line, <i>Porting Opus to Rust in 24 Days</i></span>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Footer ----------------------------- */
function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:"var(--accent)",boxShadow:"0 0 12px var(--accent)"}} />
              <span style={{fontFamily:"var(--font-mono)",fontWeight:600}}>ropus</span>
            </div>
            <p style={{maxWidth:"40ch"}}>
              A Rust port of xiph/opus, validated frame-by-frame against the C reference. BSD-3-Clause. Independent, not affiliated with Xiph.Org.
            </p>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li><a>github.com/0x4D44/ropus</a></li>
              <li><a>docs.rs/ropus</a></li>
              <li><a>crates.io/crates/ropus</a></li>
              <li><a>CHANGELOG.md</a></li>
            </ul>
          </div>
          <div>
            <h4>References</h4>
            <ul>
              <li><a>xiph/opus (upstream)</a></li>
              <li><a>RFC 6716 — Opus</a></li>
              <li><a>RFC 7845 — Ogg Opus</a></li>
              <li><a>RFC 8251 — extensions</a></li>
            </ul>
          </div>
        </div>
        <div style={{marginTop:48,paddingTop:24,borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,fontSize:"0.82rem",fontFamily:"var(--font-mono)",color:"var(--dim)"}}>
          <span>This page is an explainer of the ropus project. Content drawn from the project&apos;s README, CHANGELOG, journals, and HLDs.</span>
          <span>2026</span>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------- Nav ----------------------------- */
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-logo">
        <span className="dot" />
        <span>ropus</span>
        <span style={{color:"var(--dim)",fontWeight:400}}>· opus in rust</span>
      </div>
      <div className="nav-links">
        <a href="#what">Overview</a>
        <a href="#modes">Architecture</a>
        <a href="#oracle">Oracle</a>
        <a href="#testing">Testing</a>
        <a href="#perf">Performance</a>
        <a href="#timeline">Story</a>
        <a href="#usage">Usage</a>
      </div>
      <a className="nav-cta" href="#usage">cargo add ropus →</a>
    </nav>
  );
}

/* ----------------------------- App ----------------------------- */
function App() {
  return (
    <div className="shell">
      <Nav />
      <Hero />
      <WhatIsOpus />
      <ModePicker />
      <Oracle />
      <Modules />
      <Testing />
      <Perf />
      <Timeline />
      <Usage />
      <Ecosystem />
      <Community />
      <Lessons />
      <Footer />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
