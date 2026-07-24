/* THE ROAD TO RUIN — shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, the palette as JS constants, pavement-engineering helpers
   (the fourth-power damage law, freeze–thaw expansion, a deterioration
   curve), a small colour-mix utility, and the injected cartoon cast. */
(function () {
  "use strict";

  const C = {
    bg: "#0d0d10",
    surface: "#17171d",
    surface2: "#1f1f27",
    surface3: "#2a2a35",
    ink: "#f1f0ec",
    ink2: "#c3c2cc",
    muted: "#8a899a",
    line: "rgba(241,240,236,0.10)",
    line2: "rgba(241,240,236,0.05)",
    amber: "#ff9d3c",
    amberDim: "#c4722a",
    gold: "#ffd43b",
    cyan: "#5ad1ff",
    cyanDim: "#3a8fb8",
    blue: "#6f9bff",
    red: "#ff5d6c",
    violet: "#b39dfc",
    good: "#46c07a",
    /* pavement layer colours, surface → subgrade */
    surf: "#3a3a44",      // surface course (asphalt)
    binder: "#4a453f",    // binder course
    base: "#6b5d47",      // base course (bound / granular)
    subbase: "#8a7a5a",   // sub-base (granular)
    subgrade: "#7a6a4e",  // subgrade (soil)
    series: ["#5ad1ff", "#ff9d3c", "#e57fa8", "#7ee0a3", "#b39dfc", "#ffd43b", "#6f9bff", "#ff5d6c"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- pavement-engineering constants & helpers ------------------- */
  const PAVE = {
    stdAxle_kN: 80,        // AASHTO standard single-axle load (80 kN ≈ 8.16 t)
    stdAxle_t: 8.16,       // the same in tonnes
    iceExpansion: 0.09,    // water expands ~9% by volume on freezing
    tyrePressure_kPa: 800, // typical HGV tyre contact pressure
    bitumenPct: 5,         // ~5% bitumen by mass in a dense asphalt mix
  };
  // Load Equivalency Factor: damage of an axle relative to the 80 kN standard,
  // to the fourth power ("Generalised Fourth Power Law", AASHO Road Test 1958–60).
  const LEF = (axle_kN, power) => Math.pow(axle_kN / PAVE.stdAxle_kN, power == null ? 4 : power);
  // Equivalent Single Axle Loads from a count of axles at a given load.
  const ESAL = (nAxles, axle_kN, power) => nAxles * LEF(axle_kN, power);

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
  /* compact scientific string for a positive value */
  function fmtSci(v, unit) {
    unit = unit || "";
    if (v === 0) return "0" + (unit ? " " + unit : "");
    const neg = v < 0; v = Math.abs(v);
    const e = Math.floor(Math.log10(v));
    if (e >= -1 && e < 5) {
      const s = v >= 1000 ? Math.round(v).toLocaleString("en-GB")
        : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
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

  /* hex "#rrggbb" → [r,g,b] */
  function hex2rgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  /* linear mix of two hex colours, t in 0..1, → css rgb(a) */
  function mix(a, b, t, alpha) {
    const [r1, g1, b1] = hex2rgb(a), [r2, g2, b2] = hex2rgb(b);
    const r = Math.round(lerp(r1, r2, t)), g = Math.round(lerp(g1, g2, t)), bl = Math.round(lerp(b1, b2, t));
    return alpha == null ? `rgb(${r},${g},${bl})` : `rgba(${r},${g},${bl},${alpha})`;
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

  /* aggregate speckle — draw scattered light grains onto a dark asphalt fill */
  function speckle(ctx, x, y, w, h, n, seed, col) {
    const r = rng(seed || 11);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h, s = r();
      ctx.globalAlpha = 0.10 + 0.35 * s;
      ctx.fillStyle = s > 0.85 ? (col || "#b8b4aa") : "#5a5750";
      const rad = s > 0.9 ? 1.5 : 1;
      ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* rounded-rect path helper */
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

  /* ---- the cartoon cast: injected SVG sprite ---------------------- */
  const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- TARMAC — the road itself, our guide (dark asphalt slab, yellow line) -->
    <symbol id="char-tarmac" viewBox="0 0 100 100">
      <ellipse cx="50" cy="93" rx="30" ry="4.5" fill="rgba(0,0,0,0.35)"/>
      <rect x="14" y="18" width="72" height="70" rx="14" fill="#2c2c33"/>
      <rect x="14" y="18" width="72" height="70" rx="14" fill="url(#tarmGrad)"/>
      <circle cx="30" cy="34" r="1.6" fill="#6a675f"/><circle cx="66" cy="30" r="1.4" fill="#7a766c"/>
      <circle cx="74" cy="58" r="1.6" fill="#6a675f"/><circle cx="26" cy="66" r="1.5" fill="#79756b"/>
      <circle cx="58" cy="74" r="1.4" fill="#6a675f"/><circle cx="42" cy="24" r="1.3" fill="#75716a"/>
      <g fill="#ffd43b"><rect x="47" y="20" width="6" height="12" rx="2"/><rect x="47" y="40" width="6" height="12" rx="2"/><rect x="47" y="74" width="6" height="12" rx="2"/></g>
      <circle cx="37" cy="50" r="11" fill="#fff"/>
      <circle cx="63" cy="50" r="11" fill="#fff"/>
      <circle cx="39" cy="52" r="4.6" fill="#181822"/>
      <circle cx="61" cy="52" r="4.6" fill="#181822"/>
      <circle cx="40.6" cy="50.2" r="1.5" fill="#fff"/>
      <circle cx="62.6" cy="50.2" r="1.5" fill="#fff"/>
      <path d="M40 66 q10 8 20 0" fill="none" stroke="#0c0c10" stroke-width="3" stroke-linecap="round"/>
      <defs>
        <linearGradient id="tarmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a3a42"/><stop offset="1" stop-color="#232329"/>
        </linearGradient>
      </defs>
    </symbol>

    <!-- PROF CAMBER — the engineer (hard hat, hi-vis, glasses) -->
    <symbol id="char-prof" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="18" ry="4" fill="rgba(0,0,0,0.35)"/>
      <path d="M40 84 l-3 9 M55 84 l3 9" stroke="#4a4a55" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="50" cy="54" rx="33" ry="35" fill="#ff9d3c"/>
      <path d="M22 58 q28 20 56 0 l0 26 q-28 8 -56 0 z" fill="#ffb968"/>
      <rect x="30" y="60" width="40" height="7" rx="3" fill="#eaeaf0" opacity="0.85"/>
      <rect x="30" y="72" width="40" height="7" rx="3" fill="#eaeaf0" opacity="0.85"/>
      <circle cx="40" cy="47" r="11.5" fill="#fff"/>
      <circle cx="60" cy="47" r="11.5" fill="#fff"/>
      <circle cx="40" cy="47" r="11.5" fill="none" stroke="#3a2f2b" stroke-width="2.4"/>
      <circle cx="60" cy="47" r="11.5" fill="none" stroke="#3a2f2b" stroke-width="2.4"/>
      <line x1="51.5" y1="47" x2="48.5" y2="47" stroke="#3a2f2b" stroke-width="2.4"/>
      <circle cx="41" cy="48" r="4.4" fill="#181822"/>
      <circle cx="59" cy="48" r="4.4" fill="#181822"/>
      <circle cx="42.4" cy="46.5" r="1.4" fill="#fff"/>
      <circle cx="60.4" cy="46.5" r="1.4" fill="#fff"/>
      <path d="M43 65 q7 5 14 0" fill="none" stroke="#8a5a25" stroke-width="3" stroke-linecap="round"/>
      <!-- hard hat -->
      <path d="M20 40 q30 -34 60 0 z" fill="#ffd43b"/>
      <path d="M16 40 h68 v5 q-34 6 -68 0 z" fill="#ffcf1f"/>
      <rect x="46" y="12" width="8" height="16" rx="3" fill="#f4b800"/>
    </symbol>

    <!-- HAULER — the heavy lorry (villain of the fourth-power law) -->
    <symbol id="char-lorry" viewBox="0 0 100 100">
      <ellipse cx="50" cy="88" rx="42" ry="5" fill="rgba(0,0,0,0.35)"/>
      <rect x="8" y="40" width="52" height="34" rx="4" fill="#4b4f5e"/>
      <rect x="8" y="40" width="52" height="10" fill="#5a5f70"/>
      <path d="M60 46 h14 l14 14 v14 h-28 z" fill="#e0504f"/>
      <path d="M64 50 h11 l9 9 h-20 z" fill="#bfe6f4"/>
      <circle cx="70" cy="54" r="2.4" fill="#181822"/>
      <circle cx="79" cy="56" r="2.4" fill="#181822"/>
      <path d="M63 66 q9 4 18 0" fill="none" stroke="#3a1414" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="85" y="60" width="4" height="8" rx="1" fill="#f4c542"/>
      <g>
        <circle cx="24" cy="76" r="10" fill="#1c1c22"/><circle cx="24" cy="76" r="4" fill="#5a5a66"/>
        <circle cx="44" cy="76" r="10" fill="#1c1c22"/><circle cx="44" cy="76" r="4" fill="#5a5a66"/>
        <circle cx="74" cy="76" r="10" fill="#1c1c22"/><circle cx="74" cy="76" r="4" fill="#5a5a66"/>
      </g>
      <text x="30" y="62" font-family="ui-monospace,monospace" font-size="11" font-weight="700" fill="#ffd43b">44 t</text>
    </symbol>

    <!-- DRIP — the water droplet (the sneaky enemy) -->
    <symbol id="char-drip" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="15" ry="3.5" fill="rgba(0,0,0,0.3)"/>
      <path d="M50 12 C50 12 24 46 24 64 a26 26 0 0 0 52 0 C76 46 50 12 50 12 Z" fill="#5ad1ff"/>
      <path d="M50 12 C50 12 24 46 24 64 a26 26 0 0 0 52 0 C76 46 50 12 50 12 Z" fill="url(#dripGrad)"/>
      <ellipse cx="38" cy="52" rx="6" ry="9" fill="#bff0ff" opacity="0.7"/>
      <circle cx="43" cy="62" r="6.5" fill="#fff"/>
      <circle cx="59" cy="62" r="6.5" fill="#fff"/>
      <circle cx="44.5" cy="63" r="3" fill="#123a4a"/>
      <circle cx="60.5" cy="63" r="3" fill="#123a4a"/>
      <path d="M42 74 q9 6 18 -1" fill="none" stroke="#0e3040" stroke-width="2.6" stroke-linecap="round"/>
      <defs>
        <radialGradient id="dripGrad" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stop-color="#9fe4ff"/><stop offset="1" stop-color="#3aa9dd"/>
        </radialGradient>
      </defs>
    </symbol>

    <!-- POTHOLE — the gap-toothed crater (the damage, personified) -->
    <symbol id="char-pot" viewBox="0 0 100 100">
      <ellipse cx="50" cy="92" rx="34" ry="5" fill="rgba(0,0,0,0.3)"/>
      <path d="M10 60 h80 v22 a40 40 0 0 1 -80 0 z" fill="#33333c"/>
      <path d="M10 60 q10 -6 22 -2 q10 3 18 -2 q12 -5 22 0 q10 4 18 -1 v6 q-10 4 -18 1 q-12 -4 -22 1 q-10 4 -18 -1 q-12 -4 -22 2 z" fill="#3f3f49"/>
      <path d="M28 60 C24 74 30 88 50 88 C70 88 76 74 72 60 C64 66 56 62 50 66 C42 62 36 66 28 60 Z" fill="#0c0c11"/>
      <path d="M40 76 l4 -6 l3 6 l4 -6 l4 7 l4 -6" fill="none" stroke="#26262e" stroke-width="2"/>
      <circle cx="42" cy="72" r="4.6" fill="#fff"/>
      <circle cx="58" cy="72" r="4.6" fill="#fff"/>
      <circle cx="43" cy="73.5" r="2.3" fill="#181822"/>
      <circle cx="59" cy="73.5" r="2.3" fill="#181822"/>
      <path d="M8 60 l-5 -5 M92 60 l5 -5 M50 58 l0 -6" stroke="#26262e" stroke-width="2" stroke-linecap="round"/>
    </symbol>

    <!-- ROLLA — the road roller (the fixer / hero) -->
    <symbol id="char-roller" viewBox="0 0 100 100">
      <ellipse cx="50" cy="90" rx="40" ry="5" fill="rgba(0,0,0,0.35)"/>
      <rect x="30" y="30" width="40" height="30" rx="5" fill="#ffd43b"/>
      <rect x="34" y="20" width="26" height="16" rx="4" fill="#f4b800"/>
      <rect x="38" y="23" width="18" height="10" rx="2" fill="#173042" opacity="0.85"/>
      <rect x="30" y="46" width="40" height="8" fill="#e0a800"/>
      <circle cx="72" cy="70" r="20" fill="#3a3a44"/>
      <circle cx="72" cy="70" r="20" fill="none" stroke="#555562" stroke-width="3"/>
      <circle cx="72" cy="70" r="6" fill="#55555f"/>
      <circle cx="28" cy="74" r="11" fill="#1c1c22"/><circle cx="28" cy="74" r="4" fill="#55555f"/>
      <circle cx="44" cy="60" r="5.5" fill="#fff"/>
      <circle cx="58" cy="60" r="5.5" fill="#fff"/>
      <circle cx="45.5" cy="61" r="2.6" fill="#181822"/>
      <circle cx="59.5" cy="61" r="2.6" fill="#181822"/>
      <path d="M44 27 h10" stroke="#8a5a00" stroke-width="2.5" stroke-linecap="round"/>
    </symbol>
  </defs>
</svg>`;

  function injectSprite() {
    if (document.getElementById("rw-sprite")) return;
    const wrap = document.createElement("div");
    wrap.id = "rw-sprite";
    wrap.innerHTML = SPRITE;
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSprite);
  } else {
    injectSprite();
  }

  window.RW = {
    C, TAU, clamp, lerp, MONO, mono, canvas, slider, seg, on, set, label, line,
    fmtNum, fmtSci, sup, hex2rgb, mix, rng, speckle, roundRect,
    reducedMotion, PAVE, LEF, ESAL,
  };
})();
