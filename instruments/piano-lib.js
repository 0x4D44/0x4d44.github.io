/* THE WELL-TEMPERED MACHINE — shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, the palette as JS constants, music-theory helpers (equal
   temperament, cents, just/Pythagorean/meantone ratios, the harmonic
   series), vibrating-string physics (Mersenne + inharmonicity), a small
   Web Audio additive piano synth so intervals and overtones are audible,
   and the injected cartoon-character sprite. */
(function () {
  "use strict";

  const C = {
    bg: "#0e0a08",
    surface: "#1a1310",
    surface2: "#241a15",
    surface3: "#31241b",
    ink: "#f4ece0",
    ink2: "#cdbfab",
    muted: "#93816f",
    line: "rgba(244,236,224,0.10)",
    line2: "rgba(244,236,224,0.05)",
    brass: "#e0a83c",        // primary accent
    brassDim: "#a97c2b",
    gold: "#f4c869",         // hot highlight
    steel: "#6fb7d8",        // strings, links
    steelDim: "#3f7f9c",
    felt: "#d8556a",         // hammer felt / danger
    copper: "#c67b45",       // wound bass strings
    good: "#6fbf82",
    violet: "#b6a0e6",
    ivory: "#f6efe2",
    ebony: "#241d18",
    series: ["#6fb7d8", "#e0a83c", "#d8556a", "#6fbf82", "#b6a0e6", "#f4c869", "#c67b45", "#88a0c0"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const MONO = mono(11);

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------
     MUSIC THEORY
     A4 = 440 Hz = MIDI 69. The 88-key piano runs A0 (MIDI 21) to
     C8 (MIDI 108). All frequencies below assume 12-tone equal
     temperament unless a ratio table says otherwise.
     --------------------------------------------------------------- */
  const A4 = 440;
  const NAMES  = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLATS  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  // MIDI note number -> frequency (Hz), equal temperament
  const mtof = (m, a4) => (a4 || A4) * Math.pow(2, (m - 69) / 12);
  // frequency -> nearest MIDI number (float)
  const ftom = (f, a4) => 69 + 12 * Math.log2(f / (a4 || A4));
  // cents between two frequencies
  const cents = (f1, f2) => 1200 * Math.log2(f2 / f1);
  // note name for a MIDI number ("A4", "C#5"); flats:true for flat spellings
  function noteName(m, flats) {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    return (flats ? FLATS : NAMES)[pc] + oct;
  }
  const isBlack = (m) => [1, 3, 6, 8, 10].indexOf(((m % 12) + 12) % 12) >= 0;

  // The 88 keys as MIDI numbers 21..108
  const KEYS88 = [];
  for (let m = 21; m <= 108; m++) KEYS88.push(m);

  /* Interval ratio tables, from a tonic (semitone index 0..12 within an
     octave). Values are frequency multipliers of the tonic. */
  const RATIOS = {
    // 12-tone equal temperament
    equal: Array.from({ length: 13 }, (_, k) => Math.pow(2, k / 12)),
    // 5-limit just intonation (common "syntonic" major scale set)
    just: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8, 2],
    // Pythagorean (chain of pure fifths), reduced into one octave
    pythagorean: [
      1, 256 / 243, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 729 / 512,
      3 / 2, 128 / 81, 27 / 16, 16 / 9, 243 / 128, 2,
    ],
    // Quarter-comma meantone (pure major thirds; fifths flat by 1/4 comma)
    meantone: (function () {
      const S = Math.pow(5, 0.25);          // the meantone fifth = 5^(1/4)
      const red = (r) => { while (r >= 2) r /= 2; while (r < 1) r *= 2; return r; };
      // build by stacking meantone fifths for each pitch class, then order
      const byFifth = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: 7, 8: 8, 3: 9, 10: 10, 5: 11 };
      const out = new Array(13);
      for (let pc = 0; pc < 12; pc++) out[pc] = red(Math.pow(S, byFifth[pc]));
      out[12] = 2;
      return out;
    })(),
  };

  const PYTH_COMMA = Math.pow(3 / 2, 12) / Math.pow(2, 7); // 531441/524288
  const SYNT_COMMA = 81 / 80;

  /* Harmonic series of a fundamental: n = 1..N partials, freq n*f0 and the
     nearest equal-tempered note + cents deviation. */
  function harmonics(f0, n) {
    const out = [];
    for (let k = 1; k <= n; k++) {
      const f = k * f0;
      const midi = ftom(f);
      const near = Math.round(midi);
      out.push({ n: k, f, midi, near, name: noteName(near), dev: (midi - near) * 100 });
    }
    return out;
  }

  /* ---------------------------------------------------------------
     STRING PHYSICS
     Mersenne / Taylor: an ideal flexible string of length L (m),
     tension T (N), linear density mu (kg/m) has fundamental
     f = (1/2L) sqrt(T/mu). Real (stiff) piano strings are slightly
     inharmonic: the n-th partial sits at n*f0*sqrt(1 + B n^2), where
     the inharmonicity coefficient B rises for short thick strings.
     --------------------------------------------------------------- */
  const stringFreq = (L, T, mu) => (1 / (2 * L)) * Math.sqrt(T / mu);
  const stringTension = (L, f, mu) => mu * Math.pow(2 * L * f, 2); // N
  // linear density of a solid steel wire of diameter d (m): rho ~ 7850 kg/m^3
  const wireMu = (d) => 7850 * Math.PI * (d * d) / 4;
  // inharmonic partial n of fundamental f0 with coefficient B
  const inharmPartial = (f0, n, B) => n * f0 * Math.sqrt(1 + B * n * n);

  /* ---------------------------------------------------------------
     CANVAS FIGURE
     draw(ctx, w, h, t) — t in seconds (0 for static). opts.animate:
     run a rAF loop, paused while off-screen or user-paused.
     --------------------------------------------------------------- */
  function canvas(id, draw, opts) {
    opts = opts || {};
    const cv = typeof id === "string" ? document.getElementById(id) : id;
    if (!cv) { console.error("no canvas #" + id); return null; }
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, visible = true, userPaused = false, acc = 0, lastT = null;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      if (r.width < 10) return;
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!opts.animate) safeDraw(acc);
    }
    function safeDraw(t) {
      try { draw(ctx, w, h, t); } catch (e) { console.error("fig #" + id, e); }
    }
    new ResizeObserver(resize).observe(cv);
    resize();

    if (opts.animate) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);
      function loop(now) {
        requestAnimationFrame(loop);
        if (w === 0) return;
        const dt = lastT == null ? 0 : Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        if (!visible || userPaused) return;
        acc += dt;
        safeDraw(acc);
      }
      requestAnimationFrame(loop);
    }
    return {
      redraw: () => safeDraw(acc),
      setPaused: (p) => { userPaused = !!p; },
      get paused() { return userPaused; },
      get size() { return { w, h }; },
      el: cv, ctx,
    };
  }

  /* Range input binding. fmt(value) -> readout string. onChange(value, initial). */
  function slider(id, fmt, onChange) {
    const el = document.getElementById(id);
    if (!el) { console.error("no slider #" + id); return { value: 0, set() {} }; }
    const out = el.parentElement.querySelector("output");
    function fire(initial) {
      const v = parseFloat(el.value);
      if (out && fmt) out.textContent = fmt(v);
      if (onChange) onChange(v, initial === true);
    }
    el.addEventListener("input", () => fire(false));
    fire(true);
    return { get value() { return parseFloat(el.value); }, set(v) { el.value = v; fire(false); }, el };
  }

  /* Segmented control: container with <button data-v="...">. */
  function seg(id, onChange) {
    const el = document.getElementById(id);
    if (!el) { console.error("no seg #" + id); return { value: null }; }
    const btns = Array.from(el.querySelectorAll("button"));
    let value = (btns.find((b) => b.classList.contains("on")) || btns[0]).dataset.v;
    btns.forEach((b) =>
      b.addEventListener("click", () => {
        value = b.dataset.v;
        btns.forEach((x) => x.classList.toggle("on", x === b));
        if (onChange) onChange(value);
      })
    );
    if (onChange) onChange(value);
    return { get value() { return value; }, set(v) { const b = btns.find(x => x.dataset.v === v); if (b) b.click(); } };
  }

  function on(id, ev, fn) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (el) el.addEventListener(ev, fn);
    return el;
  }
  function set(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
  function html(id, s) { const el = document.getElementById(id); if (el) el.innerHTML = s; }

  function label(ctx, txt, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = opts.font || MONO;
    ctx.fillStyle = opts.color || C.muted;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    if (opts.angle) { ctx.translate(x, y); ctx.rotate(opts.angle); ctx.fillText(txt, 0, 0); }
    else ctx.fillText(txt, x, y);
    ctx.restore();
  }
  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fmtNum(v, dp) {
    return v.toLocaleString("en-GB", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }
  function fmtHz(f) {
    if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2) + " kHz";
    return f >= 100 ? f.toFixed(1) + " Hz" : f.toFixed(2) + " Hz";
  }
  function fmtCents(c) { return (c >= 0 ? "+" : "") + c.toFixed(1) + "¢"; }

  /* Mulberry32 PRNG */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------
     WEB AUDIO — a small additive piano-ish synth.
     A struck note is a bank of sine partials (piano spectrum, ~1/n
     roll-off), each detuned by string inharmonicity, under a fast
     attack + double-exponential decay, plus a short filtered noise
     "thunk" for the hammer. Good enough to *hear* an interval beat or
     an overtone ring; not a sampled Steinway.
     --------------------------------------------------------------- */
  let AC = null, master = null, unlocked = false;
  function actx() {
    if (!AC) {
      const AucCtx = window.AudioContext || window.webkitAudioContext;
      if (!AucCtx) return null;
      AC = new AucCtx();
      master = AC.createGain();
      master.gain.value = 0.9;
      master.connect(AC.destination);
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  // resume the context on the first user gesture (autoplay policy)
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    actx();
  }
  ["pointerdown", "keydown", "touchstart"].forEach((e) =>
    window.addEventListener(e, unlock, { once: false, passive: true }));

  /* Play one note. opts: dur (s), gain, partials, B (inharmonicity),
     bright (0..1 spectral tilt), noise (hammer thunk 0..1). Returns a
     stop() you can call for key-up damping. */
  function playNote(freq, opts) {
    const ac = actx();
    if (!ac) return { stop() {} };
    opts = opts || {};
    const now = ac.currentTime;
    const dur = opts.dur == null ? 2.2 : opts.dur;
    const g0 = opts.gain == null ? 0.5 : opts.gain;
    const nP = opts.partials == null ? 10 : opts.partials;
    const B = opts.B == null ? 0.0004 : opts.B;
    const bright = opts.bright == null ? 0.5 : opts.bright;

    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(master);

    const oscs = [];
    let norm = 0;
    for (let n = 1; n <= nP; n++) {
      const pf = freq * n * Math.sqrt(1 + B * n * n);
      if (pf > ac.sampleRate * 0.45) break;
      // piano-ish spectrum: 1/n^p roll-off, brighter = shallower
      const p = 1.6 - bright * 0.8;
      let amp = 1 / Math.pow(n, p);
      // gentle formant dip on very high partials
      amp *= Math.exp(-n * 0.06);
      norm += amp;
    }
    norm = norm || 1;

    for (let n = 1; n <= nP; n++) {
      const pf = freq * n * Math.sqrt(1 + B * n * n);
      if (pf > ac.sampleRate * 0.45) break;
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = pf;
      const gn = ac.createGain();
      const p = 1.6 - bright * 0.8;
      let amp = (1 / Math.pow(n, p)) * Math.exp(-n * 0.06) / norm;
      // higher partials decay faster (real piano behaviour)
      const decay = dur * (1 / (1 + (n - 1) * 0.55));
      const peak = amp * g0;
      gn.gain.setValueAtTime(0.0001, now);
      gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.004);
      gn.gain.exponentialRampToValueAtTime(0.00008, now + 0.02 + decay);
      osc.connect(gn); gn.connect(out);
      osc.start(now);
      osc.stop(now + 0.05 + decay);
      oscs.push({ osc, gn });
    }

    // hammer thunk: a short burst of low-passed noise
    const noiseAmt = opts.noise == null ? 0.25 : opts.noise;
    if (noiseAmt > 0) {
      const len = Math.floor(ac.sampleRate * 0.03);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass";
      lp.frequency.value = clamp(freq * 6, 400, 6000);
      const ng = ac.createGain(); ng.gain.value = noiseAmt * g0 * 0.5;
      src.connect(lp); lp.connect(ng); ng.connect(out);
      src.start(now); src.stop(now + 0.05);
    }

    function stop(when) {
      const t = (when == null ? actx().currentTime : when) + 0.02;
      oscs.forEach(({ osc, gn }) => {
        try {
          gn.gain.cancelScheduledValues(t);
          gn.gain.setValueAtTime(Math.max(0.0002, gn.gain.value), t);
          gn.gain.exponentialRampToValueAtTime(0.00008, t + 0.14);
          osc.stop(t + 0.2);
        } catch (_) {}
      });
    }
    return { stop, out };
  }

  // convenience: play several frequencies at once (interval / chord)
  function playFreqs(freqs, opts) {
    const nodes = freqs.map((f) => playNote(f, opts));
    return { stop() { nodes.forEach((n) => n.stop()); } };
  }
  // a soft sine "reference" tone (for tuning demos) with clean decay
  function playSine(freq, dur, gain) {
    const ac = actx(); if (!ac) return;
    const now = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain == null ? 0.3 : gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 1.2));
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now + (dur || 1.2) + 0.05);
  }

  /* ---- the cartoon cast: injected SVG sprite ---------------------- */
  const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- MALLET — the felt hammer, curious guide -->
    <symbol id="char-mallet" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="16" ry="3.6" fill="rgba(0,0,0,0.35)"/>
      <rect x="45" y="52" width="10" height="40" rx="4" fill="#a9784a"/>
      <rect x="45" y="52" width="4" height="40" rx="2" fill="#c9975f"/>
      <ellipse cx="50" cy="40" rx="30" ry="26" fill="#efe2d2"/>
      <ellipse cx="50" cy="34" rx="24" ry="18" fill="#f7efe2"/>
      <path d="M22 44 q28 14 56 0" fill="none" stroke="#d8c6ae" stroke-width="2" opacity="0.7"/>
      <circle cx="40" cy="36" r="8.5" fill="#fff"/>
      <circle cx="60" cy="36" r="8.5" fill="#fff"/>
      <circle cx="41.5" cy="37" r="3.8" fill="#2a211a"/>
      <circle cx="58.5" cy="37" r="3.8" fill="#2a211a"/>
      <circle cx="43" cy="35.6" r="1.3" fill="#fff"/>
      <circle cx="60" cy="35.6" r="1.3" fill="#fff"/>
      <path d="M43 46 q7 5 14 0" fill="none" stroke="#b98a52" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="30" cy="42" r="3.2" fill="#e0a83c" opacity="0.4"/>
      <circle cx="70" cy="42" r="3.2" fill="#e0a83c" opacity="0.4"/>
    </symbol>

    <!-- IVORY — a piano key, asks the questions -->
    <symbol id="char-ivory" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="15" ry="3.4" fill="rgba(0,0,0,0.32)"/>
      <rect x="30" y="14" width="40" height="78" rx="9" fill="#f6efe2"/>
      <rect x="30" y="14" width="40" height="78" rx="9" fill="url(#ivoryShade)"/>
      <rect x="41" y="10" width="18" height="30" rx="6" fill="#241d18"/>
      <circle cx="42" cy="52" r="8" fill="#fff"/>
      <circle cx="58" cy="52" r="8" fill="#fff"/>
      <circle cx="43.4" cy="53" r="3.6" fill="#2a211a"/>
      <circle cx="56.6" cy="53" r="3.6" fill="#2a211a"/>
      <circle cx="44.7" cy="51.7" r="1.2" fill="#fff"/>
      <circle cx="57.9" cy="51.7" r="1.2" fill="#fff"/>
      <ellipse cx="50" cy="64" rx="6" ry="7" fill="#2a211a"/>
      <ellipse cx="50" cy="62.5" rx="3.4" ry="3.2" fill="#d8556a"/>
      <circle cx="35" cy="62" r="3" fill="#d8556a" opacity="0.4"/>
      <circle cx="65" cy="62" r="3" fill="#d8556a" opacity="0.4"/>
      <linearGradient id="ivoryShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#c9b89c" stop-opacity="0.45"/>
      </linearGradient>
    </symbol>

    <!-- MISS WIRE — a vibrating string -->
    <symbol id="char-wire" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="13" ry="3.2" fill="rgba(0,0,0,0.3)"/>
      <path d="M50 8 C 30 22, 70 34, 50 48 C 30 62, 70 74, 50 88"
            fill="none" stroke="#6fb7d8" stroke-width="6" stroke-linecap="round"/>
      <path d="M50 8 C 30 22, 70 34, 50 48 C 30 62, 70 74, 50 88"
            fill="none" stroke="#bfe4f4" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
      <circle cx="50" cy="34" r="15" fill="#6fb7d8"/>
      <circle cx="50" cy="34" r="15" fill="url(#wireShade)"/>
      <circle cx="44" cy="32" r="5.4" fill="#fff"/>
      <circle cx="56" cy="32" r="5.4" fill="#fff"/>
      <circle cx="45" cy="33" r="2.5" fill="#123244"/>
      <circle cx="55" cy="33" r="2.5" fill="#123244"/>
      <path d="M44 41 q6 4 12 0" fill="none" stroke="#1c5772" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="26" cy="34" r="2.6" fill="#6fb7d8" opacity="0.5"/>
      <circle cx="74" cy="34" r="2.6" fill="#6fb7d8" opacity="0.5"/>
      <radialGradient id="wireShade" cx="0.42" cy="0.36" r="0.7">
        <stop offset="0" stop-color="#bfe4f4"/>
        <stop offset="1" stop-color="#5aa6c8"/>
      </radialGradient>
    </symbol>

    <!-- MAESTRO — the tuner, brings the maths (tuning fork + glasses) -->
    <symbol id="char-maestro" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="17" ry="3.6" fill="rgba(0,0,0,0.35)"/>
      <path d="M40 84 l-3 9 M55 84 l3 9" stroke="#7a5a34" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="50" cy="52" rx="32" ry="35" fill="#3b2f26"/>
      <ellipse cx="50" cy="63" rx="18" ry="19" fill="#5a4736"/>
      <path d="M28 22 q22 -14 44 0" fill="none" stroke="#2a211a" stroke-width="4" stroke-linecap="round"/>
      <circle cx="40" cy="49" r="11" fill="#f4ece0"/>
      <circle cx="60" cy="49" r="11" fill="#f4ece0"/>
      <circle cx="40" cy="49" r="11" fill="none" stroke="#e0a83c" stroke-width="2.5"/>
      <circle cx="60" cy="49" r="11" fill="none" stroke="#e0a83c" stroke-width="2.5"/>
      <line x1="51" y1="49" x2="49" y2="49" stroke="#e0a83c" stroke-width="2.5"/>
      <circle cx="41" cy="50" r="4.2" fill="#2a211a"/>
      <circle cx="59" cy="50" r="4.2" fill="#2a211a"/>
      <circle cx="42.4" cy="48.6" r="1.4" fill="#fff"/>
      <circle cx="60.4" cy="48.6" r="1.4" fill="#fff"/>
      <path d="M43 68 q7 5 14 0" fill="none" stroke="#3b2f26" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="50" cy="80" rx="9" ry="4" fill="#d8556a"/>
      <!-- tuning fork, held aloft -->
      <g transform="translate(78 30) rotate(18)">
        <rect x="-2.4" y="0" width="4.8" height="16" rx="2" fill="#cbb48f"/>
        <rect x="-8" y="-18" width="3.6" height="20" rx="1.8" fill="#e6d4ab"/>
        <rect x="4.4" y="-18" width="3.6" height="20" rx="1.8" fill="#e6d4ab"/>
        <circle cx="0" cy="-20" r="2.4" fill="#f4c869"/>
      </g>
    </symbol>

    <!-- FORK — a tuning-fork spark, the "pitch" character -->
    <symbol id="char-fork" viewBox="0 0 100 100">
      <g stroke="#e0a83c" stroke-width="3" stroke-linecap="round" opacity="0.65" fill="none">
        <path d="M20 30 q-8 20 0 40"/><path d="M12 24 q-12 26 0 52"/>
        <path d="M80 30 q8 20 0 40"/><path d="M88 24 q12 26 0 52"/>
      </g>
      <rect x="44" y="52" width="12" height="34" rx="6" fill="#cbb48f"/>
      <rect x="33" y="14" width="8" height="44" rx="4" fill="#e6d4ab"/>
      <rect x="59" y="14" width="8" height="44" rx="4" fill="#e6d4ab"/>
      <rect x="33" y="50" width="34" height="9" rx="4" fill="#e6d4ab"/>
      <circle cx="50" cy="40" r="15" fill="#f4c869"/>
      <circle cx="44" cy="38" r="3" fill="#6b4e12"/>
      <circle cx="56" cy="38" r="3" fill="#6b4e12"/>
      <path d="M44 46 q6 5 12 0" fill="none" stroke="#6b4e12" stroke-width="2.4" stroke-linecap="round"/>
    </symbol>
  </defs>
</svg>`;

  /* ---------------------------------------------------------------
     PLAYABLE KEYBOARD WIDGET
     buildKeyboard(el, opts) fills a container with white + black keys
     (MIDI from..to), wires pointer/keyboard play with legato gliss,
     and returns { press, release, highlight, setRoot, keyEls }.
     opts: from, to, small, labels ("c"|"all"|null), root, a4,
           onDown(midi,freq), onUp(midi), noteOpts (synth opts), silent.
     --------------------------------------------------------------- */
  function buildKeyboard(el, opts) {
    opts = opts || {};
    const from = opts.from == null ? 48 : opts.from;   // C3
    const to = opts.to == null ? 72 : opts.to;         // C5
    const a4 = opts.a4 || A4;
    el.classList.add("keyboard");
    if (opts.small) el.classList.add("small");
    el.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "wkeys";
    const bwrap = document.createElement("div"); bwrap.className = "bkeys";
    el.appendChild(wrap); el.appendChild(bwrap);

    const whites = [];
    for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
    const W = whites.length;
    const keyEls = {};
    const held = {};

    function fireDown(m) {
      if (held[m]) return;
      const freq = mtof(m, a4);
      let voice = null;
      if (!opts.silent) voice = playNote(freq, opts.noteOpts);
      held[m] = voice || {};
      (keyEls[m]) && keyEls[m].classList.add("on");
      if (opts.onDown) opts.onDown(m, freq);
    }
    function fireUp(m) {
      const v = held[m];
      if (!v) return;
      if (v.stop) v.stop();
      delete held[m];
      (keyEls[m]) && keyEls[m].classList.remove("on");
      if (opts.onUp) opts.onUp(m);
    }

    let pointerActive = false;
    function bindKey(node, m) {
      keyEls[m] = node;
      node.dataset.m = m;
      node.addEventListener("pointerdown", (e) => {
        e.preventDefault(); unlock(); pointerActive = true;
        node.setPointerCapture && node.releasePointerCapture &&
          (node.hasPointerCapture && node.hasPointerCapture(e.pointerId) && node.releasePointerCapture(e.pointerId));
        fireDown(m);
      });
      node.addEventListener("pointerenter", () => { if (pointerActive) fireDown(m); });
      node.addEventListener("pointerup", () => fireUp(m));
      node.addEventListener("pointerleave", () => fireUp(m));
    }
    window.addEventListener("pointerup", () => {
      pointerActive = false;
      Object.keys(held).forEach((m) => fireUp(+m));
    });

    // white keys
    whites.forEach((m) => {
      const k = document.createElement("div");
      k.className = "wkey";
      if (opts.root != null && m === opts.root) k.classList.add("root");
      if (opts.labels === "all" || (opts.labels === "c" && (m % 12) === 0)) {
        const lab = document.createElement("span");
        lab.className = "lab"; lab.textContent = noteName(m);
        k.appendChild(lab);
      }
      wrap.appendChild(k);
      bindKey(k, m);
    });

    // black keys, positioned at the boundary above their lower white neighbour
    const whiteIndex = {};
    whites.forEach((m, i) => (whiteIndex[m] = i));
    for (let m = from; m <= to; m++) {
      if (!isBlack(m)) continue;
      const lower = m - 1;                     // the white key just below
      if (whiteIndex[lower] == null) continue;
      const b = document.createElement("div");
      b.className = "bkey";
      if (opts.root != null && m === opts.root) b.classList.add("root");
      b.style.left = ((whiteIndex[lower] + 1) / W * 100) + "%";
      bwrap.appendChild(b);
      bindKey(b, m);
    }

    return {
      press: fireDown, release: fireUp, keyEls,
      highlight(m, on) { const k = keyEls[m]; if (k) k.classList.toggle("on", !!on); },
      setRoot(m) {
        Object.values(keyEls).forEach((k) => k.classList.remove("root"));
        const k = keyEls[m]; if (k) k.classList.add("root");
      },
    };
  }

  function injectSprite() {
    if (document.getElementById("piano-sprite")) return;
    const wrap = document.createElement("div");
    wrap.id = "piano-sprite";
    wrap.innerHTML = SPRITE;
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSprite);
  } else {
    injectSprite();
  }

  window.PZ = {
    C, TAU, clamp, lerp, MONO, mono, reducedMotion,
    canvas, slider, seg, on, set, html, label, line, roundRect, buildKeyboard,
    fmtNum, fmtHz, fmtCents, rng,
    // music
    A4, NAMES, FLATS, KEYS88, mtof, ftom, cents, noteName, isBlack,
    harmonics, RATIOS, PYTH_COMMA, SYNT_COMMA,
    // strings
    stringFreq, stringTension, wireMu, inharmPartial,
    // audio
    actx, unlock, playNote, playFreqs, playSine,
  };
})();
