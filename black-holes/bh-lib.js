/* EVENT HORIZON — shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, the palette as JS constants, black-hole physics helpers,
   a blackbody-colour function, and the injected cartoon-character sprite. */
(function () {
  "use strict";

  const C = {
    bg: "#07070d",
    surface: "#10111e",
    surface2: "#171a2c",
    surface3: "#21243c",
    ink: "#eef0fb",
    ink2: "#b7bad4",
    muted: "#7d81a3",
    line: "rgba(238,240,251,0.10)",
    line2: "rgba(238,240,251,0.05)",
    amber: "#ff9d3c",
    amberDim: "#c4722a",
    gold: "#ffd166",
    cyan: "#5ad1ff",
    cyanDim: "#3a8fb8",
    blue: "#6f9bff",
    red: "#ff5d6c",
    violet: "#b39dfc",
    good: "#46c07a",
    series: ["#5ad1ff", "#ff9d3c", "#e57fa8", "#7ee0a3", "#b39dfc", "#ffd166", "#6f9bff", "#ff5d6c"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- physical constants (SI) ------------------------------------ */
  const PHYS = {
    G: 6.674e-11,          // m^3 kg^-1 s^-2
    c: 2.998e8,            // m/s
    hbar: 1.0546e-34,      // J s
    kB: 1.381e-23,         // J/K
    Msun: 1.989e30,        // kg
    Rsun: 6.957e8,         // m
    Rearth: 6.371e6,       // m
    Mearth: 5.972e24,      // kg
    AU: 1.496e11,          // m
    ly: 9.461e15,          // m
    pc: 3.086e16,          // m
    yr: 3.156e7,           // s
  };
  // Schwarzschild radius (m) for a mass in kg
  const rSchwarzschild = (m_kg) => 2 * PHYS.G * m_kg / (PHYS.c * PHYS.c);
  // Hawking temperature (K) for a mass in kg
  const hawkingT = (m_kg) =>
    PHYS.hbar * Math.pow(PHYS.c, 3) / (8 * Math.PI * PHYS.G * m_kg * PHYS.kB);
  // Evaporation lifetime (s) — Page/Hawking, photons+3 neutrino flavours approx
  const evapLife = (m_kg) => 5120 * Math.PI * PHYS.G * PHYS.G * Math.pow(m_kg, 3) /
    (PHYS.hbar * Math.pow(PHYS.c, 4));

  /* Canvas figure. draw(ctx, w, h, t) — t in seconds (0 for static).
     opts.animate: run a rAF loop, paused while off-screen. */
  function canvas(id, draw, opts) {
    opts = opts || {};
    const cv = document.getElementById(id);
    if (!cv) { console.error("no canvas #" + id); return null; }
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, visible = true, userPaused = false;
    let acc = 0, lastT = null;

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
      try { draw(ctx, w, h, t); }
      catch (e) { console.error("fig #" + id, e); }
    }
    new ResizeObserver(resize).observe(cv);
    resize();

    if (opts.animate) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);
      function loop(now) {
        requestAnimationFrame(loop);
        if (w === 0) return;
        const dt = lastT == null ? 0 : Math.min(0.1, (now - lastT) / 1000);
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
      el: cv,
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
    return {
      get value() { return parseFloat(el.value); },
      set(v) { el.value = v; fire(false); },
    };
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
    return { get value() { return value; } };
  }

  function on(id, ev, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
    return el;
  }
  function set(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

  /* axis / label text helper */
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

  function fmtNum(v, dp) {
    return v.toLocaleString("en-GB", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }
  /* compact scientific / SI-ish string for a positive metre or second value */
  function fmtSci(v, unit) {
    unit = unit || "";
    if (v === 0) return "0" + (unit ? " " + unit : "");
    const neg = v < 0; v = Math.abs(v);
    const e = Math.floor(Math.log10(v));
    if (e >= -1 && e < 4) {
      const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
      return (neg ? "-" : "") + s + (unit ? " " + unit : "");
    }
    const mant = v / Math.pow(10, e);
    return (neg ? "-" : "") + mant.toFixed(2) + "×10" + sup(e) + (unit ? " " + unit : "");
  }
  function sup(n) {
    const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³",
      4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
    return String(n).split("").map((ch) => map[ch] || ch).join("");
  }
  /* format a duration in seconds into a human string spanning ns to Gyr */
  function fmtTime(s) {
    const yr = PHYS.yr;
    if (s < 1e-6) return fmtSci(s, "s");
    if (s < 60) return s.toFixed(2) + " s";
    if (s < 3600) return (s / 60).toFixed(1) + " min";
    if (s < 86400) return (s / 3600).toFixed(1) + " h";
    if (s < yr) return (s / 86400).toFixed(1) + " days";
    const y = s / yr;
    if (y < 1e3) return y.toFixed(0) + " yr";
    if (y < 1e6) return (y / 1e3).toFixed(1) + " thousand yr";
    if (y < 1e9) return (y / 1e6).toFixed(1) + " million yr";
    if (y < 1e12) return (y / 1e9).toFixed(1) + " billion yr";
    return fmtSci(y, "yr");
  }

  /* Blackbody colour: temperature (K) -> [r,g,b] 0-255 (Tanner Helland fit,
     good ~1000-40000 K). Used for accretion-disk and star colours. */
  function blackbodyRGB(kelvin) {
    const t = clamp(kelvin, 1000, 40000) / 100;
    let r, g, b;
    if (t <= 66) r = 255;
    else r = clamp(329.7 * Math.pow(t - 60, -0.1332), 0, 255);
    if (t <= 66) g = clamp(99.47 * Math.log(t) - 161.1, 0, 255);
    else g = clamp(288.1 * Math.pow(t - 60, -0.0755), 0, 255);
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = clamp(138.5 * Math.log(t - 10) - 305.0, 0, 255);
    return [Math.round(r), Math.round(g), Math.round(b)];
  }
  function blackbodyCSS(kelvin, alpha) {
    const [r, g, b] = blackbodyRGB(kelvin);
    return alpha == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
  }

  /* Mulberry32 — small deterministic PRNG. */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Deterministic starfield — draw once into the given ctx. */
  function stars(ctx, w, h, n, seed) {
    const r = rng(seed || 7);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, s = r();
      ctx.globalAlpha = 0.25 + 0.6 * s * s;
      ctx.fillStyle = s > 0.92 ? "#bcd2ff" : "#e9ecff";
      const rad = s > 0.96 ? 1.3 : 0.8;
      ctx.fillRect(x, y, rad, rad);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- the cartoon cast: injected SVG sprite ---------------------- */
  const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- PIP — the curious guide (teal blob-bird) -->
    <symbol id="char-pip" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="18" ry="4" fill="rgba(0,0,0,0.35)"/>
      <path d="M42 84 l-4 9 M53 85 l3 9" stroke="#ff9d3c" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M50 6 q-3 -6 -8 -6 q6 4 4 10 z" fill="#2fa9b8"/>
      <ellipse cx="50" cy="52" rx="33" ry="36" fill="#33bccb"/>
      <ellipse cx="50" cy="63" rx="20" ry="22" fill="#8be6ef"/>
      <ellipse cx="24" cy="52" rx="9" ry="15" fill="#2aa6b6"/>
      <circle cx="41" cy="44" r="13" fill="#fff"/>
      <circle cx="60" cy="44" r="13" fill="#fff"/>
      <circle cx="43" cy="46" r="5.4" fill="#181528"/>
      <circle cx="59" cy="46" r="5.4" fill="#181528"/>
      <circle cx="44.6" cy="44" r="1.8" fill="#fff"/>
      <circle cx="60.6" cy="44" r="1.8" fill="#fff"/>
      <path d="M45 59 l6 5 l5 -5 q-5 3 -11 0 z" fill="#ff9d3c"/>
    </symbol>

    <!-- PROF — the explainer (violet, round glasses) -->
    <symbol id="char-prof" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="18" ry="4" fill="rgba(0,0,0,0.35)"/>
      <path d="M40 84 l-3 9 M55 84 l3 9" stroke="#6a5aa8" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="50" cy="52" rx="33" ry="36" fill="#b39dfc"/>
      <ellipse cx="50" cy="64" rx="19" ry="20" fill="#d8ccff"/>
      <path d="M30 20 q20 -12 40 0" fill="none" stroke="#8f79e0" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M27 40 q7 -6 14 -1 M59 39 q7 -5 14 1" fill="none" stroke="#5a4a92" stroke-width="3" stroke-linecap="round"/>
      <circle cx="40" cy="49" r="12" fill="#fff"/>
      <circle cx="60" cy="49" r="12" fill="#fff"/>
      <circle cx="40" cy="49" r="12" fill="none" stroke="#3a2f6b" stroke-width="2.5"/>
      <circle cx="60" cy="49" r="12" fill="none" stroke="#3a2f6b" stroke-width="2.5"/>
      <line x1="52" y1="49" x2="48" y2="49" stroke="#3a2f6b" stroke-width="2.5"/>
      <circle cx="41" cy="50" r="4.5" fill="#181528"/>
      <circle cx="59" cy="50" r="4.5" fill="#181528"/>
      <circle cx="42.4" cy="48.5" r="1.5" fill="#fff"/>
      <circle cx="60.4" cy="48.5" r="1.5" fill="#fff"/>
      <path d="M43 68 q7 5 14 0" fill="none" stroke="#5a4a92" stroke-width="3" stroke-linecap="round"/>
    </symbol>

    <!-- BOB — the astronaut test subject (white suit, gold visor) -->
    <symbol id="char-bob" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="17" ry="3.6" fill="rgba(0,0,0,0.35)"/>
      <rect x="14" y="44" width="12" height="30" rx="6" fill="#e7e9f4"/>
      <rect x="74" y="40" width="12" height="26" rx="6" fill="#e7e9f4" transform="rotate(18 80 52)"/>
      <rect x="30" y="70" width="15" height="22" rx="7" fill="#e7e9f4"/>
      <rect x="55" y="70" width="15" height="22" rx="7" fill="#e7e9f4"/>
      <rect x="26" y="34" width="48" height="46" rx="18" fill="#f2f3fb"/>
      <rect x="40" y="58" width="20" height="14" rx="3" fill="#c9cde0"/>
      <circle cx="45" cy="65" r="2.4" fill="#46c07a"/>
      <circle cx="55" cy="65" r="2.4" fill="#ff5d6c"/>
      <circle cx="50" cy="34" r="26" fill="#f7f8ff"/>
      <circle cx="50" cy="34" r="20" fill="#12203a"/>
      <path d="M34 30 a20 20 0 0 1 14 -12 q-12 4 -12 14 z" fill="#ff9d3c" opacity="0.85"/>
      <path d="M40 40 q10 6 20 0" fill="none" stroke="#5ad1ff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <circle cx="44" cy="33" r="3" fill="#eef0fb"/>
      <circle cx="57" cy="33" r="3" fill="#eef0fb"/>
    </symbol>

    <!-- ZIP — the photon (gold spark with a face) -->
    <symbol id="char-photon" viewBox="0 0 100 100">
      <g fill="#ffd166">
        <path d="M50 8 l7 24 l24 -8 l-18 18 l18 18 l-24 -8 l-7 24 l-7 -24 l-24 8 l18 -18 l-18 -18 l24 8 z"/>
      </g>
      <circle cx="50" cy="50" r="17" fill="#ffe9a8"/>
      <circle cx="44" cy="48" r="3.2" fill="#7a5a12"/>
      <circle cx="56" cy="48" r="3.2" fill="#7a5a12"/>
      <path d="M44 56 q6 5 12 0" fill="none" stroke="#7a5a12" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M8 40 h10 M6 52 h12 M10 64 h9" stroke="#ffd166" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    </symbol>

    <!-- STAR — the doomed star (yellow, worried) -->
    <symbol id="char-star" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="16" ry="3.5" fill="rgba(0,0,0,0.3)"/>
      <circle cx="50" cy="50" r="36" fill="#ffce54"/>
      <circle cx="50" cy="50" r="36" fill="url(#starGrad)"/>
      <circle cx="40" cy="46" r="6.5" fill="#fff"/>
      <circle cx="61" cy="46" r="6.5" fill="#fff"/>
      <circle cx="40" cy="47.5" r="3" fill="#5a3d08"/>
      <circle cx="61" cy="47.5" r="3" fill="#5a3d08"/>
      <path d="M30 34 q7 -5 13 -1 M57 33 q7 -4 13 1" fill="none" stroke="#a9781a" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M42 64 q8 -6 16 0" fill="none" stroke="#8a5f10" stroke-width="3" stroke-linecap="round"/>
      <circle cx="30" cy="60" r="4" fill="#ff9d3c" opacity="0.55"/>
      <circle cx="70" cy="60" r="4" fill="#ff9d3c" opacity="0.55"/>
      <radialGradient id="starGrad" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#fff2c0"/>
        <stop offset="0.7" stop-color="#ffce54"/>
        <stop offset="1" stop-color="#f6a623"/>
      </radialGradient>
    </symbol>
  </defs>
</svg>`;

  function injectSprite() {
    if (document.getElementById("bh-sprite")) return;
    const wrap = document.createElement("div");
    wrap.id = "bh-sprite";
    wrap.innerHTML = SPRITE;
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSprite);
  } else {
    injectSprite();
  }

  window.BH = {
    C, TAU, clamp, lerp, MONO, mono, canvas, slider, seg, on, set, label, line,
    fmtNum, fmtSci, sup, fmtTime, blackbodyRGB, blackbodyCSS, rng, stars,
    reducedMotion, PHYS, rSchwarzschild, hawkingT, evapLife,
  };
})();
