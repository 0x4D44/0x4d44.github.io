// Page sections for Win16, Repaired.
const WM = window.WIN16_META;
const WI = window.WIN16_INTRO;
const WA = window.WIN16_APPROACH;
const WSB = window.WIN16_SCOREBOARD;
const WP = window.WIN16_PROGRESS;
const FIXES = window.WIN16_FIXES;

// ---------------------------------------------------------------- HERO
function Hero() {
  return (
    <header className="hero">
      <div className="wrap">
        <div className="hero-top">
          <span>{WM.kicker}</span>
          <span>
            <a href={WM.catalogUrl}>← 0x4D44 almanac</a>
            {"  ·  "}
            <a href={WM.parentUrl}>the emulator →</a>
          </span>
        </div>
        <div className="hero-grid">
          <div>
            <div className="hero-badges">
              <span className="chip"><span className="swatch" style={{ background: "var(--c-loader)" }}></span> NE loader</span>
              <span className="chip"><span className="swatch" style={{ background: "var(--c-user)" }}></span> KERNEL · USER · GDI</span>
              <span className="chip">30 case files</span>
            </div>
            <h1>Win16,<br /><em>Repaired.</em></h1>
            <p className="hero-lede">{WM.blurb}</p>
            <div className="hero-cta">
              <a href="#fixes" className="btn primary">Open the case files →</a>
              <a href="#background" className="btn">What we found</a>
            </div>
          </div>
          <div className="hero-stack" aria-hidden="true">
            <div className="win w1">
              <div className="win-bar"><span className="dots"><i></i><i></i><i></i></span><span className="title">PAINT — UNTITLED</span><span className="ctrls"><b>–</b><b>▢</b><b>✕</b></span></div>
              <div className="win-body">
                <div>palette: realized ✓</div>
                <div className="pix">
                  {Array.from({ length: 24 }).map((_, i) => {
                    const cols = ["#2D6BE0","#E8553B","#0E9BA6","#E0871C","#8A45D6","#1F9B59","#D23F8C"];
                    return <i key={i} style={{ background: cols[(i * 3) % cols.length] }}></i>;
                  })}
                </div>
              </div>
            </div>
            <div className="win w2">
              <div className="win-bar"><span className="dots"><i></i><i></i><i></i></span><span className="title">PROGRAM MANAGER</span><span className="ctrls"><b>–</b><b>▢</b><b>✕</b></span></div>
              <div className="win-body">$ relocations applied<br />$ DGROUP &nbsp;mapped<br />$ message pump &nbsp;live</div>
            </div>
            <div className="win w3">
              <div className="win-bar"><span className="dots"><i></i><i></i><i></i></span><span className="title">DIALOG — OPEN</span><span className="ctrls"><b>–</b><b>▢</b><b>✕</b></span></div>
              <div className="win-body">[ Open ] [ Cancel ] &nbsp; ← it cancels now.</div>
            </div>
          </div>
        </div>
        <div className="statline" style={{ marginTop: 46 }}>
          {WP.map((p) => (
            <div className="cell" key={p.k}>
              <div className="v">{p.v}</div>
              <div className="k">{p.k}</div>
              <div className="s">{p.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

// ----------------------------------------------------------- BACKGROUND
function Background() {
  return (
    <section className="section" id="background">
      <div className="wrap">
        <div className="eyebrow">00 · the background</div>
        <p className="intro-lede" style={{ marginTop: 16 }}>{WI.lede}</p>
        <div className="intro-cols">
          {WI.paras.map((b, i) => (
            <div className="prose-block" key={i}>
              <h3>{b.h}</h3>
              <p>{b.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------- NE ANATOMY
const NE_PARTS = [
  { key: "loader", nm: "MZ + NE header", sz: "stub", h: "The double identity",
    p: "Every NE file opens with a real-mode MZ stub — the part that prints “This program requires Microsoft Windows.” when you run it from DOS. Just past it sits the NE signature and a header full of offsets to everything below.",
    pin: "0x00  'MZ' …  →  0x3C points at the 'NE' header" },
  { key: "loader", nm: "Segment table", sz: "N segs", h: "Where the code lives",
    p: "One entry per segment: file offset, length, flags (CODE/DATA, MOVEABLE, DISCARDABLE, PRELOAD) and the minimum allocation size. The loader walks this to map — or, for self-loaders, to politely not map — each segment.",
    pin: "flags: MOVEABLE | DISCARDABLE | (DATA ? it's DGROUP)" },
  { key: "kernel", nm: "Module reference table", sz: "imports", h: "Who it needs",
    p: "The list of other modules this one imports from — KERNEL, USER, GDI, and any third-party DLLs. Relocation records point into this table to resolve imported ordinals and names.",
    pin: "1:KERNEL  2:USER  3:GDI  4:SHELL …" },
  { key: "kernel", nm: "Entry table", sz: "ordinals", h: "What it exports",
    p: "Run-length bundles, not a flat array — each bundle declares a run of entries of one type, and ordinals are counted through them. Get the bundle walk wrong and every export after the first gap is off by the size of the gap.",
    pin: "bundle{ count, type, [entries…] } · ordinal 1 = first" },
  { key: "resource", nm: "Resource table", sz: "rsrc", h: "Everything that isn't code",
    p: "Strings, bitmaps, icons, cursors, menus, dialog templates and accelerators, addressed by type and name-or-ordinal, with offsets scaled by a per-file alignment shift. Strings come bundled sixteen to a block.",
    pin: "align_shift: offsets << shift  ·  strings: 16 per block" },
  { key: "user", nm: "The segments", sz: "code + data", h: "The program itself",
    p: "Finally the actual bytes — code segments full of far calls waiting to be relocated, and the automatic data segment (DGROUP) that must be grown to hold globals, BSS, the local heap and the stack before anything runs.",
    pin: "CS:IP → entry point · DS → DGROUP (per instance)" },
];
function Anatomy() {
  const [sel, setSel] = useState(5);
  const part = NE_PARTS[sel];
  const c = catColor(part.key);
  return (
    <section className="section" id="anatomy">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">01 · the specimen</div>
          <h2>Anatomy of a Windows program.</h2>
          <p>Before USER can give an app a window, the loader has to make sense of its New Executable. Poke the parts — this is the map the first ten case files are drawn on.</p>
        </div>
        <div className="anatomy">
          <div className="ne-file">
            {NE_PARTS.map((p, i) => (
              <div key={i} className={"ne-seg" + (i === sel ? " active" : "")}
                   style={{ "--seg": catColor(p.key) }}
                   onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
                <span className="tag" style={{ background: catColor(p.key) }}></span>
                <span className="nm">{p.nm}</span>
                <span className="sz">{p.sz}</span>
              </div>
            ))}
          </div>
          <div className="ne-detail" style={{ "--seg": c }}>
            <div className="lbl" style={{ color: c }}>{part.nm}</div>
            <h3>{part.h}</h3>
            <p>{part.p}</p>
            <div className="pin">{part.pin}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------- APPROACH
function Approach() {
  return (
    <section className="section" id="approach">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">02 · the method</div>
          <h2>How the sweep works.</h2>
          <p>The same philosophy that governs the DOS side, pointed at Windows: fix the machine, not the program — and check your answers against something that has read the manuals so you don't have to.</p>
        </div>
        <div className="approach-grid">
          {WA.map((a, i) => (
            <div className="approach-card" key={i} style={{ borderTop: `7px solid ${SUBS[i % SUBS.length].hex}` }}>
              <div className="n">principle {String(i + 1).padStart(2, "0")}</div>
              <h4>{a.t}</h4>
              <p>{a.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------- SCOREBOARD
function Scoreboard() {
  return (
    <section className="section" id="scoreboard">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">03 · the scoreboard</div>
          <h2>What runs today.</h2>
          <p>The stock Windows 3.1 applets are the honest benchmark — small, varied, and merciless about every subsystem at once; we've thrown a couple of retail heavyweights onto the board too. Here's where they stand. Hover for the verdict.</p>
        </div>
        <div className="board">
          {WSB.map((a) => (
            <div className="app-cell" key={a.app}>
              <div className="top">
                <span className="nm">{a.app}</span>
                <span className={"tier t" + a.tier}>{a.tier === 3 ? "runs" : a.tier === 2 ? "rough edges" : "boots"}</span>
              </div>
              <div className="note">{a.note}</div>
            </div>
          ))}
        </div>
        <div className="legend">
          <span><span className="tier t3">runs</span> plays as intended</span>
          <span><span className="tier t2">rough edges</span> runs, long tail pending</span>
          <span><span className="tier t1">boots</span> loads, work in progress</span>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ GALLERY
function Gallery({ onOpen }) {
  const [filter, setFilter] = useState("all");
  const list = useMemo(
    () => filter === "all" ? FIXES : FIXES.filter(f => f.cat === filter),
    [filter]
  );
  return (
    <section className="section" id="fixes">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">04 · the case files</div>
          <h2>Thirty things we fixed.</h2>
          <p>Each card is a repair — the symptom an app showed, the real cause in the machine, the fix, what it unlocked, and the bit that hurt. Filter by subsystem; open any card for the full file. Three carry live demos.</p>
        </div>

        <div className="filterbar">
          <button className="fbtn" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>all · 30</button>
          {SUBS.map(s => {
            const n = FIXES.filter(f => f.cat === s.key).length;
            return (
              <button key={s.key} className="fbtn on-col" aria-pressed={filter === s.key}
                      style={{ "--fc": s.hex }} onClick={() => setFilter(s.key)}>
                <span className="swatch" style={{ background: s.hex }}></span>{s.label} · {n}
              </button>
            );
          })}
          <span className="fcount">{list.length} shown</span>
        </div>

        <div className="gallery">
          {list.map(f => {
            const c = catColor(f.cat);
            return (
              <button key={f.n} className={"fcard" + (f.toy ? " toychip" : "")}
                      style={{ "--fc": c }} onClick={() => onOpen(f)}>
                <div className="fbar" style={{ background: c }}>
                  <span className="num">№ {f.n}</span>
                  <span className="cat">{catLabel(f.cat)}</span>
                </div>
                <div className="fbody">
                  <div className="ftitle">{f.title}</div>
                  <div className="fsym">{f.symptom}</div>
                  <div className="ffoot">
                    <span className="ord">{f.ord}</span>
                    <Difficulty n={f.spanners} color={c} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ CLOSING
function Closing({ onEgg }) {
  return (
    <section className="closing" id="next">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">05 · the road ahead</div>
          <h2>Still on the bench.</h2>
          <p>Thirty closed, and the list of open fronts is, if anything, healthier for it. Win16 has stopped being a pile of parts and started being Windows. Now it has to become <i>all</i> of Windows.</p>
        </div>
        <div className="next-grid">
          <div className="next-card"><h4>MMSYSTEM &amp; MCI</h4><p>Media Player, sound events, the multimedia timer — wiring the audio stack the apps expect into the one the emulator already has.</p></div>
          <div className="next-card"><h4>The long-tail apps</h4><p>Word for Windows and Excel boot; their bespoke UI, custom controls and printing paths are the next mountain.</p></div>
          <div className="next-card"><h4>OLE &amp; the clipboard</h4><p>Compound documents, drag-and-drop between apps, and the object model that early Office leans on.</p></div>
          <div className="next-card"><h4>Printing</h4><p>The GDI device driver model pointed at a print spooler instead of a window — the same drawing code, a different surface.</p></div>
          <div className="next-card"><h4>More fuzzing</h4><p>Pushing fuzz_win16_wine deeper into USER and GDI, where the state machines are richest and the corner cases hide.</p></div>
          <div className="next-card" style={{ cursor: "pointer", borderTop: "7px solid var(--c-dialog)" }} onClick={onEgg}>
            <h4>An honest admission</h4><p>There is, of course, one bug we don't talk about. <span style={{ textDecoration: "underline" }}>Click for the official statement.</span></p>
          </div>
        </div>
        <div className="site-foot">
          <span>mddosem · win16 compatibility sweep · companion to <a href={WM.parentUrl}>the emulator</a></span>
          <span>API oracle: Wine · CPU oracle: Unicorn · DOS oracle: DOSBox-X</span>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------- STATUS BAR
const QUIPS = [
  "Ready.",
  "When the manual and the application disagree, the application wins.",
  "Emulate the hardware, not the game. Even when the game is Solitaire.",
  "The prologue rewrites itself. We've made our peace with this.",
  "18.2 ticks per second. The .2 is load-bearing.",
  "GlobalLock returns a different selector each time. This is fine. This is fine.",
  "One queue. One CPU. A gentleman's agreement.",
  "It was the palette. It is always, eventually, the palette.",
];
function StatusBar() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % QUIPS.length), 4200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="statusbar">
      <span className="blink"></span>
      <span className="quip">{QUIPS[i]}</span>
      <span className="right">NUM · CAPS · win16.sys</span>
    </div>
  );
}

// ------------------------------------------------------- EASTER EGG
function EggDialog({ onClose }) {
  return (
    <div className="dlg-scrim" onClick={onClose}>
      <div className="win dlg" onClick={e => e.stopPropagation()}>
        <div className="win-bar"><span className="dots"><i></i><i></i><i></i></span><span className="title">SYSTEM MESSAGE</span><span className="ctrls"><b onClick={onClose} style={{ cursor: "pointer" }}>✕</b></span></div>
        <div className="win-body">
          <div className="ico">⚠</div>
          <p>This program has performed an illegal operation and will be&hellip; absolutely fine, actually. We found the bug. It was a sign bit. We would prefer not to discuss it further.</p>
          <div className="btns">
            <button className="btn" onClick={onClose}>Ignore</button>
            <button className="btn primary" onClick={onClose}>Stoically Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Hero, Background, Anatomy, Approach, Scoreboard, Gallery, Closing, StatusBar, EggDialog,
});
