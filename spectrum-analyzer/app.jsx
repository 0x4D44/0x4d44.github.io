/* Spectrum Analyser Explainer — single-file React app
   Loaded via <script type="text/babel">. */

const { useState, useEffect, useRef, useMemo } = React;

/* The FFT teaching section (live demo, Fourier builder, etc) is in
   fft-section.jsx — it exports <FftSection /> onto window. */

/* ============================================================
   Section head
   ============================================================ */
function SectionHead({ n, eyebrow, title, lede }) {
  return (
    <div className="section-head">
      <div className="num"><b>{n}</b> / 09 — {eyebrow}</div>
      <div>
        <h2>{title}</h2>
        {lede ? <p className="lede" style={{marginTop: 18}}>{lede}</p> : null}
      </div>
    </div>
  );
}

/* ============================================================
   HERO — title + live decorative spectrogram
   ============================================================ */
function Hero() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = c.getContext("2d");
    let t = 0;
    let raf;

    // "blue" colour map approx — values 0..255 -> rgb
    const cmap = (v) => {
      v = Math.max(0, Math.min(255, v));
      const r = Math.max(0, v - 130) * 2;
      const g = v < 60 ? 0 : Math.min(255, (v - 60) * 1.5);
      const b = Math.min(255, v * 1.8);
      return `rgb(${r|0}, ${g|0}, ${b|0})`;
    };

    function tick() {
      const W = c.width, H = c.height;
      // shift left
      const img = ctx.getImageData(2, 0, W - 2, H);
      ctx.putImageData(img, 0, 0);
      // clear last column
      ctx.fillStyle = "#0a0f10";
      ctx.fillRect(W - 2, 0, 2, H);

      // synthesize a column of spectrum data
      const bins = 64;
      const colH = H / bins;
      for (let b = 0; b < bins; b++) {
        // a few peaks that wander
        const f1 = Math.sin(t * 0.013 + b * 0.18) * 0.5 + 0.5;
        const f2 = Math.sin(t * 0.007 + b * 0.42 + 2) * 0.5 + 0.5;
        const f3 = Math.exp(-Math.pow((b - (20 + Math.sin(t * 0.01) * 6)) / 4, 2));
        const f4 = Math.exp(-Math.pow((b - (40 + Math.sin(t * 0.005 + 1) * 8)) / 5, 2));
        const noise = Math.random() * 0.1;
        let v = (f3 * 0.9 + f4 * 0.7 + f1 * 0.2 + f2 * 0.15 + noise) * 220;
        // boost lows
        v *= Math.exp(-b / 70);
        v = Math.max(0, Math.min(255, v));
        ctx.fillStyle = cmap(v);
        ctx.fillRect(W - 2, H - (b + 1) * colH, 2, colH + 1);
      }
      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <section className="hero" style={{paddingTop: 80}}>
      <div className="wrap">
        <div className="meta-row">
          <span>FILE&nbsp;COUNT&nbsp;·&nbsp;<b>34</b></span>
          <span>LANGUAGE&nbsp;·&nbsp;<b>C++ / WIN32</b></span>
          <span>AUTHOR&nbsp;·&nbsp;<b>MARTIN DAVIDSON</b></span>
          <span>WINDOW&nbsp;·&nbsp;<b>1995 → 1997</b></span>
        </div>

        <div className="eyebrow">Codebase walkthrough</div>
        <h1 style={{marginTop: 16}}>
          <span className="a">Spectrum</span><br/>
          <span className="b">Analyser</span>
        </h1>

        <p className="blurb">
          A real-time audio FFT for Windows 95 and NT 4.0, written in 1996 by Martin Davidson
          in <em className="serif">C++ / MFC</em>. It captures samples from your sound card, runs them
          through an integer Fast Fourier Transform on a dedicated worker thread, and paints the
          frequency spectrum onto four oscilloscope panels — line, bar or scrolling spectrogram. This
          is a tour of how it&apos;s built, what&apos;s clever, what&apos;s broken, and what it tells us about
          consumer-grade DSP in the 16 MB era.
        </p>

        <div className="scope-frame">
          <div className="scope-top">
            <div>SPECTROGRAM&nbsp;·&nbsp;LEFT CHANNEL&nbsp;·&nbsp;22 kHz&nbsp;·&nbsp;1024 pt</div>
            <div className="dots">
              <div className="dot"></div><div className="dot"></div>
              <div className="dot live"></div>
            </div>
          </div>
          <canvas ref={canvasRef}></canvas>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="v">14<span className="small">.k</span></div>
            <div className="l">Lines of C++</div>
          </div>
          <div className="stat">
            <div className="v">11</div>
            <div className="l">Translation units</div>
          </div>
          <div className="stat">
            <div className="v">256<span className="small">pt</span></div>
            <div className="l">Samples / frame</div>
          </div>
          <div className="stat">
            <div className="v">v1.6.0</div>
            <div className="l">Final release</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   "What is it"
   ============================================================ */
function WhatItIs() {
  return (
    <section id="what">
      <div className="wrap">
        <SectionHead
          n="01"
          eyebrow="The brief"
          title="A consumer FFT scope for 16-bit Windows."
          lede={
            <>It&apos;s a hobbyist&apos;s tool that does one thing well: open the microphone,
            chop the incoming PCM into 256-sample blocks, transform each block to the
            frequency domain, and paint it. Two channels in, four scopes out.</>
          }
        />

        <div className="prose-2col">
          <div>
            <h3>What you see when you launch it</h3>
            <p>
              A small SDI window divided into four panels. Top-left and top-right
              display the raw <em className="serif">time-domain</em> waveform for the
              left and right inputs — a literal oscilloscope. Bottom-left and bottom-right
              show the <em className="serif">frequency-domain</em> FFT magnitude for the same
              channels, redrawn ~30 times a second.
            </p>
            <p>
              A tabbed <b style={{color:"var(--ink)"}}>Control Panel</b> floats alongside.
              Four property pages: <em>General</em> (sample rate, mono/stereo, thread priority,
              display style), <em>FFT</em> (windowing, amplification, zoom),
              <em> Spectrogram</em> (colour maps), and <em>Colour map editor</em> for the three
              user-defined polynomial maps.
            </p>
          </div>
          <div>
            <h3>What ships in the binary</h3>
            <ul>
              <li><b>SPECTRUM.EXE</b> — ~250 KB application</li>
              <li><b>MDMDG_.DLL</b> — Martin Davidson&apos;s personal utility DLL (registry, memory, tracing). Lives in a sibling folder <code>..\mdgen.v21\</code>.</li>
              <li><b>SPECTRUM.HLP</b> — compiled WinHelp file, source kept as RTF + a <code>.hpj</code> project.</li>
              <li><b>SPLSH16.BMP</b>, <b>TOOLBAR.BMP</b>, <b>SPECTRUM.ICO</b> — splash, toolbar strip, app icon.</li>
            </ul>
            <p style={{marginTop: 18}}>
              Settings persist to <code style={{color:"var(--amber)", fontFamily:"var(--mono)", fontSize:13}}>HKCU\Software\MD Soft\Spectrum Analyser\Version 1.6.0\Settings</code>
              — a registry key per minor version.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   ARCHITECTURE — SVG diagram with hoverable nodes
   ============================================================ */
const ARCH_NODES = {
  hw: {
    title: "Sound card",
    role: "Hardware · waveIn device",
    desc: "Whatever WAVE_MAPPER hands back from waveInGetDevCaps. App startup probes for 11/22/44 kHz × mono/stereo support, ensures at least 11 kHz mono is available, or bails with a MessageBox.",
    src: "SPECTWND.CPP · DetermineWaveModes",
  },
  wavein: {
    title: "WaveIn callback",
    role: "Kernel boundary · MMSYSTEM",
    desc: "Each filled WAVEHDR triggers an MM_WIM_DATA callback. That handler does one thing: SetEvent(hEvtNewWaveData). No drawing, no allocation. Producer side of the producer/consumer pair.",
    src: "SPECTWND.CPP · waveInProc",
  },
  ring: {
    title: "4-buffer ring",
    role: "Shared memory",
    desc: "Two buffers permanently with the wave device; one is being drawn; one holds the previous frame so the FFT can redraw over the old polyline in the background colour — a poor-man's double buffer.",
    src: "GENERAL.H · SPC_NUM_BUFFERS = 4",
  },
  calc: {
    title: "Calculation thread",
    role: "Worker · CWinThread",
    desc: "Waits on the NewWaveData event, copies 256 samples in, runs a hand-rolled radix-2 FFT in fixed-point 4096-scaled integers, scales the magnitude, and paints all four scopes directly via GDI. Loops until the KillThread event fires.",
    src: "CALCTHRD.CPP · CLTCalcThreadProc (~1700 lines)",
  },
  raw: {
    title: "Raw scopes",
    role: "Time domain · L + R",
    desc: "Two 266×138 px regions. The thread Polylines the previous frame in the background pen to erase it, then Polylines the new samples in the line pen. No buffering, no flicker because the eraser stroke is exactly the previous one.",
    src: "CALCTHRD.CPP · raw data drawing block",
  },
  fft: {
    title: "FFT scopes",
    role: "Frequency · L + R",
    desc: "Three styles: line (Polyline), bar (FillRect per bin), or spectrogram (DIB blit). Spectrogram has three variants: safe (back-buffered), fast (direct GDI), and a compile-time DirectDraw mode that's disabled by default.",
    src: "CALCTHRD.CPP · FFT screen drawing switch",
  },
  ui: {
    title: "UI thread",
    role: "Main · CSpectrumWnd",
    desc: "Owns the Wnd, handles menu/toolbar commands, and manages the calc thread (start, stop, pause via CRITICAL_SECTION, kill). Pushes user changes by tearing the thread down and rebuilding it — no live parameter sharing.",
    src: "SPECTWND.CPP · CSpectrumWnd",
  },
  cp: {
    title: "Control Panel",
    role: "Tabbed dialog · CPropertySheet",
    desc: "Four CPropertyPage tabs. Most knobs PostMessage back to the parent window with custom WM_USER messages (FFT_WINDOW_CHANGED, COLOUR_MAP_CHANGED) which then tear down and restart the calc thread.",
    src: "CPSHEETS.CPP · 3200 lines, four CPropertyPage classes",
  },
  reg: {
    title: "Registry",
    role: "Persistence",
    desc: "On exit, ReadRegistry / SaveRegistry serialise every knob — window position, sample rate, FFT style, amplification, colours, all three user-defined polynomial colour maps — into HKCU. On launch, defaults are restored.",
    src: "SPECTWND.CPP · ReadRegistry / SaveRegistry",
  },
};

function Architecture() {
  const [active, setActive] = useState("calc");
  const node = ARCH_NODES[active];

  // node rect helper
  const Node = ({ id, x, y, w = 150, h = 60, title, sub }) => (
    <g
      className={"arch-node" + (active === id ? " active" : "")}
      onMouseEnter={() => setActive(id)}
      onClick={() => setActive(id)}
      tabIndex="0"
    >
      <rect className="arch-rect" x={x} y={y} width={w} height={h} rx="4" />
      <text className="arch-label" x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle">{title}</text>
      <text className="arch-sub" x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle">{sub}</text>
    </g>
  );

  return (
    <section id="arch">
      <div className="wrap">
        <SectionHead
          n="02"
          eyebrow="Architecture"
          title="Two threads, four buffers, one event."
          lede={
            <>The structural idea is small. A worker thread blocks on an event;
            the wave callback signals it; the worker pulls a buffer, FFTs it, draws it,
            and goes back to sleep. Everything else hangs off that loop.</>
          }
        />

        <div className="arch-grid">
          <div className="arch-svg">
            <svg viewBox="0 0 760 540" width="100%" height="540">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                </marker>
              </defs>

              {/* Producer side */}
              <Node id="hw"     x={20}  y={30}  title="Sound card" sub="WAVEIN HW" />
              <Node id="wavein" x={210} y={30}  title="WaveIn callback" sub="MMSYSTEM · KERNEL" />
              <Node id="ring"   x={400} y={30}  title="4-buffer ring" sub="PRODUCER / CONSUMER" />

              {/* Calc thread */}
              <Node id="calc"   x={400} y={170} w={250} h={90} title="Calculation thread" sub="CWINTHREAD · INTEGER FFT" />

              {/* Scopes */}
              <Node id="raw"    x={20}  y={300} title="Raw scopes" sub="TIME · L + R" />
              <Node id="fft"    x={210} y={300} title="FFT scopes" sub="FREQ · L + R" />

              {/* UI side */}
              <Node id="ui"     x={580} y={300} title="UI thread" sub="CSPECTRUMWND" />
              <Node id="cp"     x={580} y={400} title="Control Panel" sub="CPROPERTYSHEET · 4 TABS" />
              <Node id="reg"    x={400} y={400} title="Registry" sub="HKCU · MD SOFT" />

              {/* Arrows */}
              <g style={{color: "var(--phos-deep)"}}>
                <path className="arch-arrow live" d="M170,60 L210,60" markerEnd="url(#arr)" />
                <path className="arch-arrow live" d="M360,60 L400,60" markerEnd="url(#arr)" />
                <path className="arch-arrow live" d="M525,90 L525,170" markerEnd="url(#arr)" />
              </g>
              <g style={{color: "var(--line)"}}>
                <path className="arch-arrow" d="M450,260 C450,290 240,290 240,300" markerEnd="url(#arr)" />
                <path className="arch-arrow" d="M520,260 C520,290 290,290 290,300" markerEnd="url(#arr)" />
                <path className="arch-arrow" d="M650,215 L735,215 L735,290" markerEnd="url(#arr)" />
                <path className="arch-arrow" d="M655,330 L580,330" markerEnd="url(#arr)" />
                <path className="arch-arrow" d="M655,430 L580,430" markerEnd="url(#arr)" />
                <path className="arch-arrow" d="M655,330 C690,360 660,395 580,415" markerEnd="url(#arr)" />
              </g>

              {/* Labels along arrows */}
              <text x={195} y={50} textAnchor="middle" className="arch-sub" fill="var(--ink-mute)">PCM</text>
              <text x={380} y={50} textAnchor="middle" className="arch-sub" fill="var(--ink-mute)">SetEvent</text>
              <text x={540} y={140} textAnchor="start" className="arch-sub" fill="var(--ink-mute)">WAIT FOR</text>

              {/* group brackets */}
              <text x={20} y={20} className="arch-sub" fill="var(--ink-mute)">PRODUCER PATH</text>
              <text x={20} y={290} className="arch-sub" fill="var(--ink-mute)">GDI OUTPUT</text>
              <text x={580} y={290} className="arch-sub" fill="var(--ink-mute)">CONTROL PATH</text>
            </svg>
          </div>

          <div className="arch-inspector">
            <h4>Inspect node</h4>
            <div className="title">{node.title}</div>
            <div className="role">{node.role}</div>
            <div className="desc">{node.desc}</div>
            <div className="src">SOURCE · <b>{node.src}</b></div>
          </div>
        </div>

        <p style={{marginTop: 32, maxWidth: "70ch"}}>
          The decoupling is deliberate. Whenever the user changes a parameter that the
          calc thread captured at startup — anything except FFT zoom — the UI thread
          <em className="serif"> kills and recreates</em> the worker rather than mutating
          its state. It&apos;s a sledge-hammer, but it&apos;s also bulletproof: there&apos;s no live
          data race surface beyond the single critical section.
        </p>
      </div>
    </section>
  );
}


/* ============================================================
   STEREO PACK TRICK
   ============================================================ */
function StereoTrick() {
  const cRef = useRef(null);
  useEffect(() => {
    const c = cRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, W, H);

    // Draw a packed buffer: L in real, R in imag
    const N = 64;
    const cellW = W / N;
    const top = 20 * dpr, hRow = 60 * dpr;

    ctx.fillStyle = "rgba(94,243,154,0.5)";
    ctx.font = `${11 * dpr}px Geist Mono, monospace`;
    ctx.fillText("LEFT  → real part", 8 * dpr, top - 6 * dpr);

    for (let i = 0; i < N; i++) {
      const v = 0.5 + 0.4 * Math.sin(i * 0.4);
      ctx.fillStyle = `rgba(94,243,154,${0.2 + v * 0.6})`;
      ctx.fillRect(i * cellW + 1, top, cellW - 2, hRow);
    }

    ctx.fillStyle = "rgba(255,184,77,0.5)";
    ctx.fillText("RIGHT → imag part", 8 * dpr, top + hRow + 18 * dpr);

    for (let i = 0; i < N; i++) {
      const v = 0.5 + 0.4 * Math.cos(i * 0.55 + 1.2);
      ctx.fillStyle = `rgba(255,184,77,${0.2 + v * 0.6})`;
      ctx.fillRect(i * cellW + 1, top + hRow + 24 * dpr, cellW - 2, hRow);
    }

    // brace and arrow to FFT box
    const fftX = W - 130 * dpr, fftY = top + hRow * 0.5;
    ctx.strokeStyle = "rgba(94,243,154,0.6)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(W - 200 * dpr, top + hRow + 12 * dpr);
    ctx.lineTo(W - 140 * dpr, top + hRow + 12 * dpr);
    ctx.stroke();

    ctx.fillStyle = "rgba(94,243,154,0.06)";
    ctx.strokeStyle = "var(--phos)";
    ctx.strokeStyle = "#5ef39a";
    ctx.strokeRect(W - 130 * dpr, top + 14 * dpr, 120 * dpr, hRow * 2 + 8 * dpr);
    ctx.fillRect(W - 130 * dpr, top + 14 * dpr, 120 * dpr, hRow * 2 + 8 * dpr);
    ctx.fillStyle = "#5ef39a";
    ctx.font = `${15 * dpr}px Newsreader, serif`;
    ctx.fillText("FFT", W - 90 * dpr, top + hRow + 20 * dpr);
    ctx.font = `${10 * dpr}px Geist Mono, monospace`;
    ctx.fillStyle = "rgba(154,167,163,0.8)";
    ctx.fillText("one pass", W - 105 * dpr, top + hRow + 40 * dpr);
  }, []);

  return (
    <section id="stereo">
      <div className="wrap">
        <SectionHead
          n="04"
          eyebrow="A clever trick"
          title="Two channels, one FFT."
          lede={
            <>The most distinctive thing about this code is that running it in stereo
            costs the same as running it in mono. Davidson&apos;s trick: feed the left
            channel into the real part of a complex FFT, the right channel into the
            imaginary part, and recover both spectra from one transform.</>
          }
        />

        <div className="stereo-grid">
          <div>
            <h3 style={{marginBottom: 18}}>How it works</h3>

            <div className="stereo-step">
              <div className="num">1</div>
              <div className="txt">
                <b>Pack.</b> The 256-sample buffer is interleaved <code>L R L R …</code> by
                the wave device. Davidson treats this as a single 256-point complex sequence
                where <code>Re = L[n]</code> and <code>Im = R[n]</code>.
              </div>
            </div>

            <div className="stereo-step">
              <div className="num">2</div>
              <div className="txt">
                <b>Transform.</b> One Cooley-Tukey pass produces a complex spectrum
                <code> Z[k]</code> that conflates both channels. Calling it once instead of
                twice halves the multiply count.
              </div>
            </div>

            <div className="stereo-step">
              <div className="num">3</div>
              <div className="txt">
                <b>Unpack.</b> Because both inputs were real, their spectra have
                conjugate symmetry. The left channel comes back as
                <code>½ ( Z[k] + Z*[N-k] )</code>, the right as
                <code>−½ⱼ ( Z[k] − Z*[N-k] )</code>. The code does this in fixed-point with
                a single multiply per side.
              </div>
            </div>

            <div className="stereo-step">
              <div className="num">4</div>
              <div className="txt">
                <b>Display.</b> Each side is then absolute-valued and amplified to produce
                two independent magnitude spectra to paint into the lower scopes.
              </div>
            </div>
          </div>

          <div>
            <h3 style={{marginBottom: 18}}>The buffer, visualised</h3>
            <canvas ref={cRef} style={{width: "100%", height: 200, display: "block", borderRadius: 4, background: "#0a0f10", border: "1px solid var(--line)"}}></canvas>
            <p style={{marginTop: 16, fontSize: 14, color: "var(--ink-dim)"}}>
              The cost saving is real but not enormous on a Pentium — a 256-point FFT was
              already cheap by 1996. The bigger payoff was that the code only had to maintain
              <em className="serif"> one</em> bit-reversal table and one set of twiddle factors.
              Modern DSP libraries still do this for real-valued stereo input.
            </p>
            <p style={{marginTop: 12, fontSize: 13, color: "var(--ink-mute)", fontFamily: "var(--mono)"}}>
              See: CALCTHRD.CPP · the <code>complexZ.x / complexZ.y</code> block immediately after
              the Danielson–Lanczos loop.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   MODULE CARDS
   ============================================================ */
const MODULES = [
  { f: "SPECTRUM.CPP",  t: "CSpectrumApp",       d: "Entry point. Enforces single-instance via FindWindow on the title bar string, registers the document template, and kicks off the splash and main frame.", lines: 286, since: "1.0" },
  { f: "MAINFRM.CPP",   t: "CMainFrame",         d: "The SDI frame. Owns the toolbar, status bar and menu, and manages the application palette so 8-bit displays don't go technicolour when another app grabs focus.", lines: 643, since: "1.0" },
  { f: "SPECTWND.CPP",  t: "CSpectrumWnd",       d: "The view. Holds the calc thread, the wave handles, the four scope rectangles, and the master CTRL_SETTINGS. Reads and writes the registry. The brain.", lines: 2900, since: "1.0" },
  { f: "CALCTHRD.CPP",  t: "CLTCalcThreadProc",  d: "The worker. Sets up GDI objects, hand-rolls a fixed-point radix-2 FFT, scales the magnitude, paints all four scopes, loops. Compile-time DirectDraw branch lives here.", lines: 1696, since: "1.4" },
  { f: "CPSHEETS.CPP",  t: "CPropertyPages (×4)",d: "All four tabs of the Control Panel: General, FFT, Spectrogram, Colour Map editor. Wired to the parent CSpectrumWnd by custom WM_USER messages.", lines: 3209, since: "1.5" },
  { f: "CPPrpSht.cpp",  t: "CCPPropSheet",       d: "The CPropertySheet host that holds the four pages above. Mostly boilerplate.", lines: 480, since: "1.5" },
  { f: "COLOURS.CPP",   t: "CColours",           d: "Modal dialog with two buttons — Line colour, Background colour — each opening the standard Win32 ChooseColor dialog. The simplest file in the project.", lines: 279, since: "1.0" },
  { f: "CUSRFNCM.CPP",  t: "CUserFnColourMap",   d: "Polynomial colour-map generator for the three user-defined spectrogram palettes. First/second/third-order polynomials in red, green and blue, with random-mutation operators (small, medium, large).", lines: 730, since: "1.5" },
  { f: "ABOUT.CPP",     t: "CAboutDlg",          d: "The About box. Reads physical memory, hard-codes the release date as 1 Feb 1997, and queries waveInGetDevCaps to display the highest supported sampling mode.", lines: 259, since: "1.0" },
  { f: "SPLASH.CPP",    t: "CSplashWnd",         d: "Standard MFC splash-screen component from the ClassWizard wizard. Shown for ~750 ms at launch unless suppressed via command line.", lines: 220, since: "1.4" },
  { f: "SPECTDOC.CPP",  t: "CSpectrumDoc",       d: "A vestigial CDocument. Required by the SDI template but holds no state — the document model is unused. A small but interesting fingerprint of MFC's bias.", lines: 170, since: "1.0" },
  { f: "GENERAL.H",     t: "Project-wide defs",  d: "Every constant, macro, struct and typedef shared across the project. CTRL_SETTINGS and CALC_THREAD_INFO live here. 469 lines of pure header.", lines: 469, since: "1.0" },
];

function Modules() {
  return (
    <section id="modules">
      <div className="wrap">
        <SectionHead
          n="05"
          eyebrow="Files"
          title="Eleven translation units, one DLL dependency."
          lede={
            <>The code is laid out flat in a single directory. There&apos;s no <code style={{color:"var(--amber)",fontFamily:"var(--mono)"}}>src/</code>,
            no namespaces, no subsystems — just a column of <code style={{color:"var(--amber)",fontFamily:"var(--mono)"}}>.CPP</code> /
            <code style={{color:"var(--amber)",fontFamily:"var(--mono)"}}>.H</code> pairs that include each other through
            <code style={{color:"var(--amber)",fontFamily:"var(--mono)"}}> stdafx.h</code>.</>
          }
        />

        <div className="module-grid">
          {MODULES.map((m, i) => (
            <div className="module" key={i}>
              <div className="file">{m.f}</div>
              <div className="title">{m.t}</div>
              <div className="desc">{m.d}</div>
              <div className="meta">
                <span><b>{m.lines.toLocaleString()}</b> lines</span>
                <span>since <b>v{m.since}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   COLOUR MAPS
   ============================================================ */
function colourMapStrip(canvas, fn) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const [r0, g0, b0] = fn(t);
    ctx.fillStyle = `rgb(${r0|0},${g0|0},${b0|0})`;
    ctx.fillRect(x, 0, 1, H);
  }
}

const PRESET_MAPS = {
  blue:   t => [255 * t * t,           255 * Math.pow(t, 1.6),  Math.min(255, 255 * (0.4 + t * 0.9))],
  cool:   t => [255 * t,               255 * (1 - t * 0.6),     255],
  copper: t => [Math.min(255, 255 * (t * 1.25)), 255 * t * 0.78, 255 * t * 0.5],
};

function CmapCard({ title, sub, mapFn }) {
  const stripRef = useRef(null);
  const sgRef = useRef(null);
  useEffect(() => { colourMapStrip(stripRef.current, mapFn); }, [mapFn]);

  useEffect(() => {
    const c = sgRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    // synth scrolling spectrogram
    const cols = 80, rows = 32;
    const cw = W / cols, rh = H / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const peak1 = Math.exp(-Math.pow((y - (10 + Math.sin(x * 0.2) * 5)) / 4, 2));
        const peak2 = Math.exp(-Math.pow((y - (22 + Math.cos(x * 0.1) * 4)) / 3, 2));
        const noise = Math.random() * 0.05;
        let v = peak1 * 0.9 + peak2 * 0.7 + noise;
        v *= Math.exp(-y / 60);
        v = Math.max(0, Math.min(1, v));
        const [rr, gg, bb] = mapFn(v);
        ctx.fillStyle = `rgb(${rr|0},${gg|0},${bb|0})`;
        ctx.fillRect(x * cw, H - (y + 1) * rh, cw + 1, rh + 1);
      }
    }
  }, [mapFn]);

  return (
    <div className="cmap-card">
      <div className="h">
        <div className="nm">{title}</div>
        <div className="sub">{sub}</div>
      </div>
      <canvas ref={sgRef}></canvas>
      <canvas ref={stripRef} className="strip" style={{height: 14, marginTop: 8}}></canvas>
    </div>
  );
}

function UserDefinedCmap() {
  const [rPow, setRPow] = useState(2);
  const [gPow, setGPow] = useState(1.2);
  const [bPow, setBPow] = useState(0.55);
  const [phase, setPhase] = useState(0);

  const mapFn = useMemo(() => (t => {
    const p = Math.min(1, Math.max(0, t + phase));
    return [
      255 * Math.pow(p, rPow),
      255 * Math.pow(p, gPow) * (1 - Math.abs(p - 0.5) * 0.4),
      255 * Math.pow(1 - p, bPow),
    ];
  }), [rPow, gPow, bPow, phase]);

  return (
    <div className="cmap-card" style={{gridColumn: "1 / -1"}}>
      <div className="h">
        <div className="nm">User-defined polynomial</div>
        <div className="sub">CUserFnColourMap — live</div>
      </div>
      <div className="fft-split" style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start"}}>
        <div>
          <div className="slider-row">
            <div className="lbl"><span className="name">Red exponent</span><span className="val">{rPow.toFixed(2)}</span></div>
            <input type="range" min="0.2" max="4" step="0.05" value={rPow} onChange={e => setRPow(+e.target.value)} />
          </div>
          <div className="slider-row">
            <div className="lbl"><span className="name">Green exponent</span><span className="val">{gPow.toFixed(2)}</span></div>
            <input type="range" min="0.2" max="4" step="0.05" value={gPow} onChange={e => setGPow(+e.target.value)} />
          </div>
          <div className="slider-row">
            <div className="lbl"><span className="name">Blue exponent</span><span className="val">{bPow.toFixed(2)}</span></div>
            <input type="range" min="0.2" max="4" step="0.05" value={bPow} onChange={e => setBPow(+e.target.value)} />
          </div>
          <div className="slider-row">
            <div className="lbl"><span className="name">Phase shift</span><span className="val">{phase.toFixed(2)}</span></div>
            <input type="range" min="-0.5" max="0.5" step="0.01" value={phase} onChange={e => setPhase(+e.target.value)} />
          </div>
          <p style={{fontSize: 13, color: "var(--ink-mute)", marginTop: 12, lineHeight: 1.5}}>
            The original ships small/medium/large random-mutation operators that nudge
            polynomial coefficients without leaving the [0, 255] band. The result is a
            slot-machine of new colour maps you can save into three persistent slots.
          </p>
        </div>
        <div>
          <CmapCardInner mapFn={mapFn} />
        </div>
      </div>
    </div>
  );
}

function CmapCardInner({ mapFn }) {
  const stripRef = useRef(null);
  const sgRef = useRef(null);
  useEffect(() => { colourMapStrip(stripRef.current, mapFn); }, [mapFn]);
  useEffect(() => {
    const c = sgRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    const cols = 80, rows = 32;
    const cw = W / cols, rh = H / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const peak1 = Math.exp(-Math.pow((y - (10 + Math.sin(x * 0.2) * 5)) / 4, 2));
        const peak2 = Math.exp(-Math.pow((y - (22 + Math.cos(x * 0.1) * 4)) / 3, 2));
        let v = peak1 * 0.9 + peak2 * 0.7 + Math.random() * 0.05;
        v *= Math.exp(-y / 60);
        v = Math.max(0, Math.min(1, v));
        const [rr, gg, bb] = mapFn(v);
        ctx.fillStyle = `rgb(${rr|0},${gg|0},${bb|0})`;
        ctx.fillRect(x * cw, H - (y + 1) * rh, cw + 1, rh + 1);
      }
    }
  }, [mapFn]);
  return (
    <div>
      <canvas ref={sgRef} style={{width: "100%", height: 120, display: "block", borderRadius: 3}}></canvas>
      <canvas ref={stripRef} style={{width: "100%", height: 14, display: "block", marginTop: 8, borderRadius: 3}}></canvas>
    </div>
  );
}

function ColourMaps() {
  return (
    <section id="colours">
      <div className="wrap">
        <SectionHead
          n="06"
          eyebrow="Spectrogram"
          title="Three built-in palettes, three slots for your own."
          lede={
            <>The colour-map system is the most ambitious bit of the project. Three preset
            maps (Blue, Cool, Copper) and three user-editable slots driven by per-channel
            polynomials with random-mutation operators.</>
          }
        />

        <div className="cmap-gallery">
          <CmapCard title="Blue"   sub="SPC_COLOUR_MAP_BLUE"   mapFn={PRESET_MAPS.blue} />
          <CmapCard title="Cool"   sub="SPC_COLOUR_MAP_COOL"   mapFn={PRESET_MAPS.cool} />
          <CmapCard title="Copper" sub="SPC_COLOUR_MAP_COPPER" mapFn={PRESET_MAPS.copper} />
          <UserDefinedCmap />
        </div>

        <p style={{marginTop: 32, maxWidth: "70ch"}}>
          On 8-bit displays — still common in 1996 — the app builds a 256-entry
          <code style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:13}}> CPalette</code>{" "}
          from the chosen map and handles <code style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:13}}>WM_QUERYNEWPALETTE</code> /
          <code style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:13}}>WM_PALETTECHANGED</code> so other applications don&apos;t
          corrupt its colours when they grab focus. This is one of the artefacts of the era
          that has no modern equivalent.
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   TIMELINE
   ============================================================ */
const TIMELINE = [
  {
    date: "Apr 1995", v: "v1.0", major: false,
    title: "Borland C++ · OWL 2.0 · Win32",
    body: <>The first release. Single-threaded, written against Borland&apos;s OWL framework, runs on Windows 3.1 with the Win32s subsystem. No splash, no spectrogram, no thread.</>
  },
  {
    date: "1995", v: "v1.3", major: false,
    title: "The last single-threaded build",
    body: <>Final version that runs on Windows 3.1 / 3.11 — because Win32s does not allow more than one execution thread per process.</>
  },
  {
    date: "1995/96", v: "v1.4.0", major: true,
    title: "Calculation thread split off",
    body: <>The big restructure. The FFT loop moves into its own <code>CWinThread</code>, the UI stays responsive, and the project drops Windows 3.x support permanently. The DSP loop also gets an integer-only rewrite.</>
  },
  {
    date: "1996", v: "v1.4.1", major: false,
    title: "Memory leak fixes",
    body: <>Minor MFC object cleanup. The leaks were caught at process exit and weren&apos;t harmful, but flagged.</>
  },
  {
    date: "1996", v: "v1.4.2", major: false,
    title: "Move to MSVC 2.1 / Windows 95",
    body: <>Borland out, Microsoft in. Project re-tooled around Visual C++ 2.1 and MFC, becomes a true Win95 / NT4 application.</>
  },
  {
    date: "10 Mar 1996", v: "v1.5.0", major: true,
    title: "Spectrogram, tabbed control panel, MDMDG_.DLL",
    body: <>The big visual upgrade. Adds the scrolling spectrogram display, the three preset colour maps, the random-map generator, and the tabbed property-sheet control panel. The shared utility code (memory, registry, tracing) moves out into <code>MDMDG_.DLL</code>. Switches to <code>Polyline</code> for the scopes — a real performance win.</>
  },
  {
    date: "28 Dec 1996", v: "v1.6.0", major: true,
    title: "Palette manager · DirectDraw (compiled-out)",
    body: <>Final release. Adds 8-bit display palette management, a third <em>back-buffered safe</em> spectrogram mode, and a DirectDraw branch that&apos;s gated behind <code>SPC_USE_DDRAW</code> and never shipped enabled — Davidson decided it wasn&apos;t faster than the GDI path and dropped it.</>
  },
  {
    date: "1 Feb 1997", v: "—", major: false,
    title: "“No future improvements are currently planned.”",
    body: <>The line from the v1.5 help file persists into v1.6. The codebase still lives in someone&apos;s archive 29 years later because of it.</>
  },
];

function Timeline() {
  return (
    <section id="history">
      <div className="wrap">
        <SectionHead
          n="07"
          eyebrow="Evolution"
          title="From OWL on Win 3.1 to threaded MFC in two years."
          lede={
            <>The project moves through three frameworks (OWL → MFC), one runtime model
            (single-thread → multi-thread), and two compilers (Borland → Microsoft) in
            roughly 24 months — almost the same lifespan as the Pentium it targeted.</>
          }
        />

        <div className="timeline">
          {TIMELINE.map((t, i) => (
            <div className={"tl-item " + (t.major ? "major" : "")} key={i}>
              <div className="date"><b>{t.date}</b> &nbsp; · &nbsp; {t.v}</div>
              <div className="vt">{t.title}</div>
              <div className="body">{t.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   BUG HUNT
   ============================================================ */
const BUG_CODE = {
  b1: `<span class="c">/* SPECTWND.CPP · DetermineWaveModes */</span>
<span class="k">if</span> ((sWaveCaps.dwFormats &amp; WAVE_FORMAT_4M08) == WAVE_FORMAT_4M08)
{
    <span class="c">/* 44kHz mono is supported. */</span>
    SET_FLAG(ctrlSettings.modes, <span class="hl">MODE_22KHZ_MONO</span>);
    <span class="c">/* ^^^ should be MODE_44KHZ_MONO */</span>
}`,
  b2: `<span class="c">/* CALCTHRD.CPP · FFT input pre-multiply */</span>
rawData[i] = (4096 *
<span class="hl">//  ((pThrdInfo-&gt;windowCoeffs[(i/2)]) *</span>
                       (((MDINT32)(*pTemp))-128)) / 128;`,
  b3: `<span class="c">/* GENERAL.H */</span>
<span class="k">inline</span> MDVOID SPC_Swap(MDINT a, MDINT b)
{
    MDINT tempValue;
    tempValue = a;
    <span class="hl">a = b;</span>
    <span class="hl">b = tempValue;</span>
    <span class="k">return</span>;
}`,
  b4: `<span class="c">/* SPECTRUM.RTF · written in v1.4 */</span>
<span class="ok">No future improvements are currently planned.</span>

<span class="c">/* ... then v1.5 added: */</span>
<span class="hl">Spectrogram display</span>
<span class="hl">Tabbed control panel</span>
<span class="hl">Random colour-map generator</span>
<span class="hl">Polyline performance pass</span>
<span class="hl">MDMDG_.DLL split-out</span>

<span class="c">/* ... and v1.6 added: */</span>
<span class="hl">8-bit palette support</span>
<span class="hl">DirectDraw branch (gated out)</span>`,
};

function BugCode({ html }) {
  return <pre dangerouslySetInnerHTML={{ __html: html }} />;
}

function BugHunt() {
  return (
    <section id="bugs">
      <div className="wrap">
        <SectionHead
          n="08"
          eyebrow="What's broken"
          title="Bugs, contradictions, and one disabled feature."
          lede={
            <>Reading carefully, four interesting defects fall out. Two are real and would
            ship today as P1 / P2; one is a no-op function nobody calls; one is a contradiction
            between the docs and the code.</>
          }
        />

        <div className="bug-grid">
          <div className="bug">
            <span className="severity major">Major · §08·01</span>
            <h3>The 44 kHz mono mode never registers</h3>
            <BugCode html={BUG_CODE.b1} />
            <div className="why">
              Classic copy-paste. The capability probe correctly detects 44 kHz mono support
              on the sound card, then sets the wrong flag. Effect: the 44 kHz mono radio button
              in the Control Panel is gated by <code style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:13}}>TEST_FLAG(MODE_44KHZ_MONO)</code>,
              which never becomes true via this branch. <b>The only way to get 44 kHz from this
              build is in stereo.</b>
            </div>
          </div>

          <div className="bug">
            <span className="severity major">Major · §08·02</span>
            <h3>Windowing is commented out</h3>
            <BugCode html={BUG_CODE.b2} />
            <div className="why">
              The UI lets you pick Hamming, Hanning or Blackman-Harris. The thread allocates
              and computes a 512-entry <code style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:13}}>windowCoeffs[]</code> table.
              The save/restore logic round-trips the choice to the registry. But{" "}
              <b>the actual multiply that applies the window is commented out</b> — so all four
              window settings produce bit-identical output. The whole windowing feature is
              cosmetic.
            </div>
          </div>

          <div className="bug">
            <span className="severity weird">Curiosity · §08·03</span>
            <h3>An inline swap that swaps nothing</h3>
            <BugCode html={BUG_CODE.b3} />
            <div className="why">
              Takes both parameters by <em>value</em>. Swaps the local copies. Returns.
              The actual FFT bit-reversal step doesn&apos;t call this — it uses a separate
              <code style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:13}}> SWAP</code> macro
              that does it properly with a temporary. So this lives in the header
              unused and unnoticed for two years.
            </div>
          </div>

          <div className="bug">
            <span className="severity minor">Soft · §08·04</span>
            <h3>The &ldquo;no future improvements&rdquo; promise</h3>
            <BugCode html={BUG_CODE.b4} />
            <div className="why">
              The line is left in the v1.6 help file too. It&apos;s the most relatable
              software-engineering bug in the codebase — and a useful reminder that{" "}
              <em className="serif">final</em> is a word software writes in pencil.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FINAL — strengths & weaknesses
   ============================================================ */
function Closing() {
  return (
    <section>
      <div className="wrap">
        <SectionHead
          n="09"
          eyebrow="In summary"
          title="What it gets right, what it gets wrong."
          lede={
            <>Strip away the era-specific noise and Spectrum Analyser is a tight, well-commented
            piece of consumer DSP. It mostly suffers from the things every MFC application of its
            generation suffers from.</>
          }
        />

        <div className="prose-2col">
          <div>
            <h3 style={{color: "var(--phos)"}}>What&apos;s good</h3>
            <ul>
              <li><b>Real concurrency model.</b> A genuine producer/consumer setup with an event, a critical section and a kill signal. No spinlocks, no busy waits.</li>
              <li><b>Triple buffering.</b> Four wave buffers used so two are always with the device, one is being processed, and one is the previous frame used as a custom eraser. Smart, simple, no extra GDI memory.</li>
              <li><b>Stereo packed into one FFT.</b> The complex-pack trick is textbook DSP, executed cleanly.</li>
              <li><b>Bone-deep documentation.</b> Every file has a banner, every function has a contract, every modification history is dated and initialled. You can read the project end-to-end in an afternoon.</li>
              <li><b>Four build configs.</b> Debug, Release, Working-set tuning, and CAP (Microsoft&apos;s Call Attributed Profiling). Davidson actually profiled this thing.</li>
              <li><b>Defensive about the platform.</b> Probes wave caps on startup, refuses to launch if no device exists, gracefully falls back through sample rates, manages the 8-bit display palette.</li>
            </ul>
          </div>

          <div>
            <h3 style={{color: "var(--amber)"}}>What hasn&apos;t aged well</h3>
            <ul>
              <li><b>SDI ceremony with no document.</b> A <code>CSpectrumDoc</code> exists but holds nothing — pure MFC framework tax.</li>
              <li><b>Magic numbers in the FFT.</b> <code>4096</code>, <code>&gt;&gt; 12</code>, <code>SPC_INTERNAL_FFT_SIGNIFICANCE = 8</code>, all spread across <code>CALCTHRD.CPP</code> with no single fixed-point manifest.</li>
              <li><b>Hand-rolled π.</b> <code>theta = 6.2831 / mmax</code> — perfectly fine, but begs for <code>2&middot;M_PI</code>.</li>
              <li><b>Restart-the-thread to mutate.</b> Almost every Control Panel knob tears down and recreates the worker. Pragmatic, but it precludes live tuning.</li>
              <li><b>External DLL dependency.</b> <code>MDMDG_.DLL</code> lives at <code>..\mdgen.v21\</code> outside the project tree. The codebase isn&apos;t self-contained without it.</li>
              <li><b>Single-instance via FindWindow on the title bar.</b> Brittle: rename the window and you double-launch.</li>
              <li><b>Mixed-encoding everything.</b> Source is ANSI / MBCS, registry keys are ASCII, file names alternate between SHOUTING.CPP and PascalCase.cpp depending on which file Davidson was using ClassWizard on.</li>
            </ul>
          </div>
        </div>

        <div className="panel" style={{marginTop: 56, padding: 32}}>
          <span className="panel-label">Closing read</span>
          <p style={{maxWidth: "70ch", color: "var(--ink)", fontSize: 17, lineHeight: 1.55}}>
            What&apos;s most striking is how <em className="serif">small</em> this codebase is for what it
            does. A real-time stereo FFT visualiser with a tabbed control panel, three colour-map
            engines, palette management, a help file, a splash, registry persistence and four build
            profiles — in about <b style={{color: "var(--phos)"}}>14,000 lines</b> of C++. Half of
            those lines are banner comments. The signal-to-ceremony ratio is, by 2026 standards,
            extraordinary.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   ROOT
   ============================================================ */
function App() {
  return (
    <>
      <Hero />
      <WhatItIs />
      <Architecture />
      <FftSection />
      <StereoTrick />
      <Modules />
      <ColourMaps />
      <Timeline />
      <BugHunt />
      <Closing />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
