/* ROOT AND CROWN — shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, the palette as JS constants, dental helpers (the Stephan
   curve, demineralisation kinetics, restoration survival), a parametric
   tooth renderer shared by every chapter, and the injected cartoon cast. */
(function () {
  "use strict";

  const C = {
    bg: "#0a0d0f",
    surface: "#14191c",
    surface2: "#1c2226",
    surface3: "#262e33",
    ink: "#f3f1e9",
    ink2: "#c2c6c8",
    muted: "#86909a",
    line: "rgba(243,241,233,0.10)",
    line2: "rgba(243,241,233,0.05)",
    mint: "#4ad8c4",
    mintDim: "#2d9384",
    dentineAcc: "#e8b962",
    ice: "#6fd0ff",
    iceDim: "#3f8fba",
    cold: "#7a8cff",
    pulpAcc: "#ff6b7d",
    violet: "#b39dfc",
    good: "#57c98a",

    /* dental tissues, outside → in */
    enamel: "#eae6d8",
    enamelDeep: "#cfc9b6",
    dentine: "#d9b877",
    dentineDeep: "#b8945a",
    pulp: "#d8556a",
    pulpDark: "#9c3143",
    cementum: "#b9a888",
    bone: "#8f8a76",
    boneDark: "#6a6658",
    pdl: "#c58f7a",
    gum: "#d9788f",
    gumDark: "#a8556a",
    caries: "#4a3220",
    cariesSoft: "#6b4a2c",
    amalgam: "#9aa0a8",
    composite: "#e8e2d2",
    gutta: "#e0836a",
    porcelain: "#f0ece2",

    series: ["#6fd0ff", "#e8b962", "#ef8fa8", "#7ee0a3", "#b39dfc", "#4ad8c4", "#7a8cff", "#ff6b7d"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- dental constants & helpers --------------------------------- */
  const DENT = {
    criticalPH: 5.5,       // enamel dissolves below this in plaque fluid
    rootCriticalPH: 6.2,   // cementum/dentine dissolve earlier — root caries
    restingPH: 6.8,        // plaque pH at rest, no fermentable carbohydrate
    enamelKHN: 300,        // Knoop hardness, enamel (dentine ≈ 60)
    dentineKHN: 60,
    tubulesPerMM2: 45000,  // dentinal tubules near the pulp, per mm²
    tubuleDia_um: 2.5,     // tubule diameter near the pulp (≈0.8 µm at the DEJ)
    pulpPressure_mmHg: 10, // normal pulpal tissue pressure
    inflamedPressure_mmHg: 35, // localised, in acute inflammation
    enamelThick_mm: 2.5,   // maximum, over a molar cusp
    adultTeeth: 32,
  };

  /* Stephan curve: plaque pH after a fermentable-carbohydrate challenge.
     A gamma-shaped dip — fast fall as bacteria ferment sugar to acid, slow
     recovery as saliva buffers and clears it. `events` is an array of
     challenge times in minutes. Dips superpose (floored at pH 4.0). */
  function stephanPH(t, events, opts) {
    opts = opts || {};
    const rest = opts.rest == null ? DENT.restingPH : opts.rest;
    const amp = opts.amp == null ? 1.8 : opts.amp;      // depth of the dip
    const tau = opts.tau == null ? 9 : opts.tau;        // minutes to the minimum
    const decay = opts.decay == null ? 0.055 : opts.decay; // recovery rate
    let drop = 0;
    for (const e of events) {
      const dt = t - e;
      if (dt < 0) continue;
      // rise to the trough over `tau`, then exponential clearance
      const rise = 1 - Math.exp(-dt / (tau * 0.45));
      drop += amp * rise * Math.exp(-decay * Math.max(0, dt - tau));
    }
    return Math.max(4.0, rest - drop);
  }

  /* Minutes per day spent below the critical pH, given challenge times.
     This — not the total quantity of sugar — is what drives caries. */
  function minutesBelowCritical(events, crit, horizon) {
    crit = crit == null ? DENT.criticalPH : crit;
    horizon = horizon == null ? 16 * 60 : horizon;  // a waking day
    let mins = 0;
    for (let t = 0; t < horizon; t += 0.5) {
      if (stephanPH(t, events) < crit) mins += 0.5;
    }
    return mins;
  }

  /* Median-survival model for a restoration: annual failure rate compounding
     into a survival fraction at `years`. AFR values come from the longevity
     literature summarised in the Lexicon. */
  function survival(years, annualFailureRate) {
    return Math.pow(1 - annualFailureRate, years);
  }

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
  function html(id, s) { const el = document.getElementById(id); if (el) el.innerHTML = s; }

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

  /* A leader line from a label to a feature, with a dot at the target. */
  function leader(ctx, x1, y1, x2, y2, txt, opts) {
    opts = opts || {};
    const col = opts.color || C.muted;
    line(ctx, x1, y1, x2, y2, col, opts.width || 1, opts.dash || [3, 3]);
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x2, y2, opts.dot || 2.5, 0, TAU); ctx.fill();
    ctx.restore();
    if (txt) {
      label(ctx, txt, x1, y1 + (opts.dy == null ? -6 : opts.dy), {
        color: opts.textColor || col,
        align: opts.align || "left",
        font: opts.font || mono(11, true),
      });
    }
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

  /* fine mineral grain — mottles a flat tissue fill so it reads as biology */
  function grain(ctx, x, y, w, h, n, seed, col, alpha) {
    const r = rng(seed || 7);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h, s = r();
      ctx.globalAlpha = (alpha == null ? 0.12 : alpha) * (0.3 + s);
      ctx.fillStyle = col || "#ffffff";
      ctx.beginPath(); ctx.arc(px, py, s > 0.9 ? 1.3 : 0.8, 0, TAU); ctx.fill();
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

  /* ================================================================
     THE PARAMETRIC TOOTH
     ----------------------------------------------------------------
     A mesio-distal section through a lower molar, drawn into the box
     (x, y, w, h). Every chapter draws its tooth through this one
     function so the anatomy stays consistent from page to page.

     opts:
       wear         0..1  occlusal attrition — cusps flatten
       caries       0..1  lesion depth from the occlusal surface
                          (0.35 reaches the DEJ, 0.8 reaches the pulp)
       filling      0..1  restoration size (0 = none)
       fillMat      "amalgam" | "composite" | "temp"
       crown        bool  full-coverage crown over the prepared tooth
       pulpState    "healthy" | "inflamed" | "necrotic" | "removed"
       secondary    0..1  secondary dentine — the pulp shrinks with age
       recession    0..1  gingival recession, exposing root
       rootFilled   bool  gutta-percha in the canals
       lesion       0..1  apical radiolucency (bone loss at the root tip)
       showBone     bool  draw alveolar bone, PDL and gingiva (default true)
       labels       bool  draw anatomical leader labels
     ================================================================ */
  function toothPath(ctx, x, y, w, h, wear) {
    // Normalised landmarks. Crown occupies the top 46%, roots the rest.
    const cx = x + w / 2;
    const crownTop = y + h * (0.02 + 0.06 * wear);   // wear lowers the surface
    const widest = y + h * 0.20;
    const neck = y + h * 0.46;
    const apex = y + h * 0.98;
    const halfW = w * 0.42;
    const neckW = w * 0.30;

    ctx.beginPath();
    // occlusal surface: two cusps with a central fissure between them
    const cuspDrop = h * 0.045 * (1 - wear);
    ctx.moveTo(cx - neckW, neck);
    ctx.bezierCurveTo(cx - halfW, y + h * 0.36, cx - halfW, widest - h * 0.06, cx - halfW * 0.86, crownTop + cuspDrop * 0.4);
    ctx.quadraticCurveTo(cx - halfW * 0.45, crownTop - cuspDrop * 0.2, cx - halfW * 0.12, crownTop + cuspDrop);
    ctx.quadraticCurveTo(cx, crownTop + cuspDrop * 1.5, cx + halfW * 0.12, crownTop + cuspDrop);
    ctx.quadraticCurveTo(cx + halfW * 0.45, crownTop - cuspDrop * 0.2, cx + halfW * 0.86, crownTop + cuspDrop * 0.4);
    ctx.bezierCurveTo(cx + halfW, widest - h * 0.06, cx + halfW, y + h * 0.36, cx + neckW, neck);
    // mesial root, down and slightly out, tapering to a rounded apex
    ctx.bezierCurveTo(cx + neckW * 1.02, y + h * 0.66, cx + w * 0.30, y + h * 0.80, cx + w * 0.24, apex - h * 0.02);
    ctx.quadraticCurveTo(cx + w * 0.185, apex + h * 0.012, cx + w * 0.13, apex - h * 0.03);
    ctx.bezierCurveTo(cx + w * 0.11, y + h * 0.76, cx + w * 0.05, y + h * 0.62, cx + w * 0.035, y + h * 0.55);
    // the furcation — where the two roots part company
    ctx.quadraticCurveTo(cx, y + h * 0.52, cx - w * 0.035, y + h * 0.55);
    // distal root
    ctx.bezierCurveTo(cx - w * 0.05, y + h * 0.62, cx - w * 0.11, y + h * 0.76, cx - w * 0.13, apex - h * 0.03);
    ctx.quadraticCurveTo(cx - w * 0.185, apex + h * 0.012, cx - w * 0.24, apex - h * 0.02);
    ctx.bezierCurveTo(cx - w * 0.30, y + h * 0.80, cx - neckW * 1.02, y + h * 0.66, cx - neckW, neck);
    ctx.closePath();
    return { cx, crownTop, widest, neck, apex, halfW, neckW };
  }

  function drawTooth(ctx, x, y, w, h, o) {
    o = o || {};
    const wear = clamp(o.wear || 0, 0, 1);
    const caries = clamp(o.caries || 0, 0, 1);
    const fill = clamp(o.filling || 0, 0, 1);
    const sec = clamp(o.secondary || 0, 0, 1);
    const rec = clamp(o.recession || 0, 0, 1);
    const les = clamp(o.lesion || 0, 0, 1);
    const pulpState = o.pulpState || "healthy";
    const showBone = o.showBone !== false;
    const seed = o.seed || 4242;

    const g = toothPath(ctx, x, y, w, h, wear);
    const { cx, crownTop, neck, apex } = g;
    const gumLine = neck + h * 0.02 + rec * h * 0.16;

    ctx.save();

    /* ---- bone, PDL and gum behind the tooth ---- */
    if (showBone) {
      // Bone follows the receding gum but lags it — gingival recession usually
      // runs ahead of the bone loss underneath, so the crest stays a little
      // higher than the gum margin suggests.
      const boneTop = neck + h * 0.05 + rec * h * 0.10;
      ctx.fillStyle = C.bone;
      ctx.fillRect(x - w * 0.34, boneTop, w * 1.68, y + h * 1.02 - boneTop);
      grain(ctx, x - w * 0.34, boneTop, w * 1.68, y + h * 1.02 - boneTop, 340, seed + 3, "#efe8d0", 0.10);
      // trabecular hint
      ctx.strokeStyle = "rgba(255,255,255,0.055)"; ctx.lineWidth = 1;
      const r = rng(seed + 9);
      for (let i = 0; i < 26; i++) {
        const bx = x - w * 0.3 + r() * w * 1.6, by = boneTop + r() * (y + h - boneTop);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + (r() - 0.5) * w * 0.22, by + (r() - 0.5) * h * 0.1);
        ctx.stroke();
      }
      // Apical radiolucency — bone destroyed by infection draining out of the
      // root tip. Clipped to the bone itself: the lesion is a hole in bone, so
      // it must not bleed out past the bone's edge into the background.
      if (les > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - w * 0.34, boneTop, w * 1.68, y + h * 1.02 - boneTop);
        ctx.clip();
        const lr = h * 0.035 + les * h * 0.075;
        for (const rx of [cx - w * 0.185, cx + w * 0.185]) {
          const grd = ctx.createRadialGradient(rx, apex, 1, rx, apex, lr);
          grd.addColorStop(0, "rgba(26,22,17,0.80)");
          grd.addColorStop(0.72, "rgba(42,36,28,0.42)");
          grd.addColorStop(1, "rgba(60,52,40,0)");
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(rx, apex, lr, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // Gingiva — one band across the field that rises into a crest against
      // each side of the tooth neck. The tooth is drawn over the middle, so
      // only the two crests and the flanking band are visible.
      const gL = x - w * 0.34, gR = x + w * 1.34, band = h * 0.075;
      ctx.fillStyle = C.gum;
      ctx.beginPath();
      ctx.moveTo(gL, gumLine + band);
      ctx.lineTo(gL, gumLine + h * 0.012);
      ctx.quadraticCurveTo(cx - w * 0.36, gumLine + h * 0.008, cx - w * 0.29, gumLine - h * 0.022);
      ctx.lineTo(cx + w * 0.29, gumLine - h * 0.022);
      ctx.quadraticCurveTo(cx + w * 0.36, gumLine + h * 0.008, gR, gumLine + h * 0.012);
      ctx.lineTo(gR, gumLine + band);
      ctx.closePath();
      ctx.fill();
      // a lighter free-gingival margin catching the light along the crest
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(gL, gumLine + h * 0.012);
      ctx.quadraticCurveTo(cx - w * 0.36, gumLine + h * 0.008, cx - w * 0.29, gumLine - h * 0.022);
      ctx.moveTo(gR, gumLine + h * 0.012);
      ctx.quadraticCurveTo(cx + w * 0.36, gumLine + h * 0.008, cx + w * 0.29, gumLine - h * 0.022);
      ctx.stroke();
    }

    /* ---- the tooth body: dentine ---- */
    toothPath(ctx, x, y, w, h, wear);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.dentine;
    ctx.fillRect(x - w, y - h, w * 3, h * 3);
    grain(ctx, x, y, w, h, 260, seed, "#fff6dd", 0.13);

    // cementum: a thin darker sheath over the root, below the neck
    ctx.fillStyle = C.cementum;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x - w * 0.1, neck, w * 1.2, h);
    ctx.globalAlpha = 1;

    // dentinal tubules — fine radial lines from the pulp toward the surface.
    // They are the reason a tooth feels cold: fluid moves inside them.
    if (o.tubules !== false) {
      ctx.strokeStyle = "rgba(150,110,55,0.30)";
      ctx.lineWidth = 0.7;
      const pcx = cx, pcy = y + h * 0.30;
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * TAU;
        ctx.beginPath();
        ctx.moveTo(pcx + Math.cos(a) * w * 0.10, pcy + Math.sin(a) * h * 0.05);
        ctx.lineTo(pcx + Math.cos(a) * w * 0.44, pcy + Math.sin(a) * h * 0.30);
        ctx.stroke();
      }
    }
    ctx.restore();

    /* ---- enamel cap: only above the neck, thickest over the cusps ---- */
    ctx.save();
    toothPath(ctx, x, y, w, h, wear);
    ctx.clip();
    const eThick = h * 0.075 * (1 - wear * 0.55);
    ctx.beginPath();
    ctx.moveTo(cx - w, crownTop - h * 0.2);
    ctx.lineTo(cx + w, crownTop - h * 0.2);
    ctx.lineTo(cx + w, neck - h * 0.005);
    // the enamel's inner boundary — the dentino-enamel junction (DEJ)
    ctx.bezierCurveTo(cx + w * 0.30, neck - h * 0.02, cx + w * 0.34, y + h * 0.18, cx + w * 0.20, crownTop + eThick);
    ctx.quadraticCurveTo(cx, crownTop + eThick * 2.1, cx - w * 0.20, crownTop + eThick);
    ctx.bezierCurveTo(cx - w * 0.34, y + h * 0.18, cx - w * 0.30, neck - h * 0.02, cx - w, neck - h * 0.005);
    ctx.closePath();
    ctx.fillStyle = C.enamel;
    ctx.fill();
    grain(ctx, x, y, w, h * 0.5, 200, seed + 1, "#ffffff", 0.16);
    // enamel is translucent at the cusp tips — a hint of the dentine beneath
    ctx.fillStyle = "rgba(217,184,119,0.22)";
    ctx.fill();
    ctx.restore();

    /* ---- pulp chamber and root canals ---- */
    const pulpCol = pulpState === "necrotic" ? "#5c4a4a"
      : pulpState === "inflamed" ? C.pulpAcc
      : pulpState === "removed" ? "#2a2724"
      : C.pulp;
    const shrink = 1 - sec * 0.62;
    // "removed" still draws the space — an extirpated canal is an empty dark
    // void, not an absence of anatomy, and a temporary dressing sits over it.
    {
      ctx.save();
      toothPath(ctx, x, y, w, h, wear);
      ctx.clip();
      ctx.fillStyle = o.rootFilled ? C.gutta : pulpCol;
      // Chamber: wider than it is tall, with a pointed horn reaching up under
      // each cusp — the horns are why a deep cavity under a cusp finds nerve
      // long before an equally deep one in the middle of the tooth does.
      const chTop = y + h * (0.145 + wear * 0.03) + (1 - shrink) * h * 0.045;
      const chH = h * 0.105 * shrink;
      const chW = w * 0.34 * shrink;
      const hornH = h * 0.052 * shrink;
      ctx.beginPath();
      ctx.moveTo(cx - chW / 2, chTop + chH);
      ctx.lineTo(cx - chW / 2, chTop + chH * 0.32);
      ctx.lineTo(cx - chW * 0.31, chTop - hornH);
      ctx.lineTo(cx - chW * 0.10, chTop + chH * 0.20);
      ctx.lineTo(cx + chW * 0.10, chTop + chH * 0.20);
      ctx.lineTo(cx + chW * 0.31, chTop - hornH);
      ctx.lineTo(cx + chW / 2, chTop + chH * 0.32);
      ctx.lineTo(cx + chW / 2, chTop + chH);
      // the chamber floor sags gently toward the canal orifices
      ctx.quadraticCurveTo(cx, chTop + chH * 1.22, cx - chW / 2, chTop + chH);
      ctx.closePath();
      ctx.fill();
      // two canals, tapering from the chamber floor to each apex
      const canalW = w * 0.055 * shrink;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * chW * 0.34 - canalW / 2, chTop + chH * 0.9);
        ctx.bezierCurveTo(
          cx + s * w * 0.10, y + h * 0.66,
          cx + s * w * 0.17, y + h * 0.80,
          cx + s * w * 0.185 - canalW * 0.18, apex - h * 0.022
        );
        ctx.lineTo(cx + s * w * 0.185 + canalW * 0.18, apex - h * 0.022);
        ctx.bezierCurveTo(
          cx + s * w * 0.17 + s * canalW, y + h * 0.80,
          cx + s * w * 0.10 + s * canalW, y + h * 0.66,
          cx + s * chW * 0.34 + canalW / 2, chTop + chH * 0.9
        );
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    /* ---- carious lesion: enamel cone, then spreading along the DEJ ---- */
    if (caries > 0) {
      ctx.save();
      toothPath(ctx, x, y, w, h, wear);
      ctx.clip();
      const depth = caries * h * 0.42;
      const dejY = crownTop + h * 0.085;
      const r = rng(seed + 21);
      ctx.fillStyle = C.caries;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.045, crownTop + h * 0.012);
      ctx.lineTo(cx + w * 0.045, crownTop + h * 0.012);
      // narrow through enamel — decay follows the prism direction inward
      const enamelEnd = Math.min(depth, h * 0.085);
      ctx.lineTo(cx + w * 0.028, crownTop + enamelEnd);
      if (depth > h * 0.085) {
        // past the DEJ it spreads sideways: undermined enamel, a wide base
        const past = depth - h * 0.085;
        const spread = w * (0.05 + 0.30 * clamp(past / (h * 0.3), 0, 1));
        ctx.bezierCurveTo(
          cx + spread, dejY + past * 0.25,
          cx + spread * 0.9, dejY + past * 0.85,
          cx, dejY + past
        );
        ctx.bezierCurveTo(
          cx - spread * 0.9, dejY + past * 0.85,
          cx - spread, dejY + past * 0.25,
          cx - w * 0.028, crownTop + enamelEnd
        );
      } else {
        ctx.lineTo(cx - w * 0.028, crownTop + enamelEnd);
      }
      ctx.closePath();
      ctx.fill();
      // Softened, discoloured dentine at the advancing front. The halo must
      // scale with how deep the lesion actually is — an enamel-only lesion has
      // no dentine front to stain.
      if (depth > h * 0.085) {
        const frontR = w * 0.16 * clamp((depth - h * 0.085) / (h * 0.25), 0.15, 1);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = C.cariesSoft;
        for (let i = 0; i < 26; i++) {
          const a = r() * TAU, rr = r() * frontR;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * rr, dejY + (depth - h * 0.085) * 0.55 + Math.sin(a) * rr * 0.5,
            1 + r() * 2.0, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    /* ---- restoration ---- */
    if (fill > 0 && !o.crown) {
      ctx.save();
      toothPath(ctx, x, y, w, h, wear);
      ctx.clip();
      const mat = o.fillMat || "amalgam";
      // Sized so that even a large restoration stops just short of the pulp
      // horns (chamber roof sits at about 0.145h below the crown top).
      const fw = w * (0.13 + 0.26 * fill);
      const fd = h * (0.042 + 0.078 * fill);
      ctx.fillStyle = mat === "amalgam" ? C.amalgam : mat === "temp" ? "#c9c2a8" : C.composite;
      ctx.beginPath();
      // a cavity is cut wider at the base than the opening — it must not fall out
      ctx.moveTo(cx - fw / 2, crownTop + h * 0.006);
      ctx.lineTo(cx + fw / 2, crownTop + h * 0.006);
      ctx.lineTo(cx + fw * 0.58, crownTop + fd * 0.72);
      ctx.quadraticCurveTo(cx + fw * 0.56, crownTop + fd, cx + fw * 0.40, crownTop + fd);
      ctx.lineTo(cx - fw * 0.40, crownTop + fd);
      ctx.quadraticCurveTo(cx - fw * 0.56, crownTop + fd, cx - fw * 0.58, crownTop + fd * 0.72);
      ctx.closePath();
      ctx.fill();
      if (mat === "amalgam") {
        grain(ctx, cx - fw / 2, crownTop, fw, fd, 60, seed + 5, "#ffffff", 0.20);
        ctx.strokeStyle = "rgba(255,255,255,0.30)"; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - fw / 2, crownTop + h * 0.012);
        ctx.lineTo(cx + fw / 2, crownTop + h * 0.012);
        ctx.stroke();
      }
      // the margin — the join a filling eventually fails at
      ctx.strokeStyle = "rgba(40,30,18,0.55)"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - fw / 2, crownTop + h * 0.006);
      ctx.lineTo(cx - fw * 0.58, crownTop + fd * 0.72);
      ctx.quadraticCurveTo(cx - fw * 0.56, crownTop + fd, cx - fw * 0.40, crownTop + fd);
      ctx.lineTo(cx + fw * 0.40, crownTop + fd);
      ctx.quadraticCurveTo(cx + fw * 0.56, crownTop + fd, cx + fw * 0.58, crownTop + fd * 0.72);
      ctx.lineTo(cx + fw / 2, crownTop + h * 0.006);
      ctx.stroke();
      ctx.restore();
    }

    /* ---- full-coverage crown ---- */
    if (o.crown) {
      ctx.save();
      toothPath(ctx, x, y, w, h, wear);
      ctx.clip();
      // Drawn deliberately wider than the tooth and trimmed by the clip, so the
      // crown's silhouette is exactly the tooth's own outline down to the margin.
      ctx.fillStyle = o.crownMat === "gold" ? "#d9b64a" : C.porcelain;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.55, neck - h * 0.008);
      ctx.lineTo(cx - w * 0.55, y + h * 0.11);
      ctx.quadraticCurveTo(cx - w * 0.31, crownTop - h * 0.015, cx - w * 0.14, crownTop + h * 0.028);
      ctx.quadraticCurveTo(cx, crownTop + h * 0.060, cx + w * 0.14, crownTop + h * 0.028);
      ctx.quadraticCurveTo(cx + w * 0.31, crownTop - h * 0.015, cx + w * 0.55, y + h * 0.11);
      ctx.lineTo(cx + w * 0.55, neck - h * 0.008);
      ctx.closePath();
      ctx.fill();
      grain(ctx, cx - w * 0.45, crownTop, w * 0.9, h * 0.4, 120, seed + 8, "#ffffff", 0.14);
      // the cement lute line at the crown margin, where crown meets root
      ctx.strokeStyle = "rgba(60,50,35,0.5)"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.55, neck - h * 0.008);
      ctx.lineTo(cx + w * 0.55, neck - h * 0.008);
      ctx.stroke();
      ctx.restore();
    }

    /* ---- outline ---- */
    toothPath(ctx, x, y, w, h, wear);
    ctx.strokeStyle = "rgba(30,26,20,0.55)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
    return { ...g, gumLine, pulpTop: y + h * 0.15, pulpCx: cx };
  }

  /* ---- the cartoon cast: injected SVG sprite ---------------------- */
  const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- MOLAR — the tooth itself, our long-suffering narrator -->
    <symbol id="char-molar" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="26" ry="4" fill="rgba(0,0,0,0.35)"/>
      <path d="M22 30 C22 14 78 14 78 30 C78 44 74 52 72 66 C70 82 60 88 56 74
               C54 66 46 66 44 74 C40 88 30 82 28 66 C26 52 22 44 22 30 Z" fill="#f2eee0"/>
      <path d="M22 30 C22 14 78 14 78 30 C78 40 76 46 74 54 L26 54 C24 46 22 40 22 30 Z" fill="#fbf8ee"/>
      <ellipse cx="34" cy="27" rx="6" ry="4" fill="#ffffff" opacity="0.85"/>
      <circle cx="39" cy="40" r="8.5" fill="#fff"/>
      <circle cx="61" cy="40" r="8.5" fill="#fff"/>
      <circle cx="40.5" cy="41.5" r="4" fill="#1d2226"/>
      <circle cx="62.5" cy="41.5" r="4" fill="#1d2226"/>
      <circle cx="42" cy="40" r="1.4" fill="#fff"/>
      <circle cx="64" cy="40" r="1.4" fill="#fff"/>
      <path d="M42 53 q8 6 16 0" fill="none" stroke="#b9ae90" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M30 22 q20 -6 40 0" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5" stroke-linecap="round"/>
    </symbol>

    <!-- NERV — the pulp nerve: small, deep inside, and the source of all drama -->
    <symbol id="char-nerve" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="16" ry="3.5" fill="rgba(0,0,0,0.3)"/>
      <path d="M50 88 C50 74 38 70 38 58 C38 48 46 44 50 44 C54 44 62 48 62 58 C62 70 50 74 50 88 Z" fill="#d8556a"/>
      <g stroke="#e8798a" stroke-width="4" stroke-linecap="round" fill="none">
        <path d="M42 50 q-12 -6 -16 -18"/>
        <path d="M58 50 q12 -6 16 -18"/>
        <path d="M50 44 q0 -12 -6 -20"/>
        <path d="M50 44 q2 -13 9 -19"/>
      </g>
      <circle cx="26" cy="30" r="3.5" fill="#e8798a"/>
      <circle cx="74" cy="30" r="3.5" fill="#e8798a"/>
      <circle cx="44" cy="24" r="3.5" fill="#e8798a"/>
      <circle cx="59" cy="25" r="3.5" fill="#e8798a"/>
      <circle cx="44" cy="60" r="7" fill="#fff"/>
      <circle cx="58" cy="60" r="7" fill="#fff"/>
      <circle cx="44.5" cy="61" r="3.4" fill="#2a1016"/>
      <circle cx="58.5" cy="61" r="3.4" fill="#2a1016"/>
      <circle cx="46" cy="59.5" r="1.2" fill="#fff"/>
      <circle cx="60" cy="59.5" r="1.2" fill="#fff"/>
      <ellipse cx="51" cy="73" rx="6" ry="7" fill="#5e1622"/>
      <path d="M34 52 q-4 -3 -3 -7 M69 52 q4 -3 3 -7" stroke="#ffd0d8" stroke-width="2" fill="none" stroke-linecap="round"/>
    </symbol>

    <!-- STREP — Streptococcus mutans, the acid-maker; the villain -->
    <symbol id="char-strep" viewBox="0 0 100 100">
      <ellipse cx="50" cy="92" rx="24" ry="4" fill="rgba(0,0,0,0.3)"/>
      <circle cx="34" cy="52" r="20" fill="#a8c24a"/>
      <circle cx="62" cy="58" r="16" fill="#93ad3c"/>
      <circle cx="34" cy="52" r="20" fill="url(#strepG)"/>
      <circle cx="27" cy="44" r="6" fill="#c2da6a" opacity="0.7"/>
      <circle cx="28" cy="48" r="7.5" fill="#fff"/>
      <circle cx="44" cy="48" r="7.5" fill="#fff"/>
      <circle cx="29.5" cy="49.5" r="3.6" fill="#1c2408"/>
      <circle cx="45.5" cy="49.5" r="3.6" fill="#1c2408"/>
      <circle cx="31" cy="48" r="1.3" fill="#fff"/>
      <circle cx="47" cy="48" r="1.3" fill="#fff"/>
      <path d="M26 62 q10 8 20 1" fill="none" stroke="#3d4a12" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M30 63 l2 5 M38 66 l1 5" stroke="#6fd0ff" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="32" cy="72" r="2.6" fill="#6fd0ff"/>
      <circle cx="40" cy="74" r="2.2" fill="#6fd0ff"/>
      <text x="55" y="34" font-family="ui-monospace,monospace" font-size="13" font-weight="700" fill="#ff6b7d">pH</text>
      <path d="M62 38 l0 8 M58 43 l4 5 l4 -5" stroke="#ff6b7d" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <defs>
        <radialGradient id="strepG" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stop-color="#c8e07a"/><stop offset="1" stop-color="#8fa838"/>
        </radialGradient>
      </defs>
    </symbol>

    <!-- MISS MOLARIS — the dentist: mask, loupes, mirror -->
    <symbol id="char-dentist" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="20" ry="4" fill="rgba(0,0,0,0.35)"/>
      <path d="M28 92 q22 -10 44 0 l0 4 l-44 0 z" fill="#4ad8c4"/>
      <ellipse cx="50" cy="54" rx="30" ry="32" fill="#4ad8c4"/>
      <path d="M22 62 q28 16 56 0 l0 22 q-28 8 -56 0 z" fill="#68e3d2"/>
      <circle cx="40" cy="46" r="10.5" fill="#fff"/>
      <circle cx="60" cy="46" r="10.5" fill="#fff"/>
      <circle cx="40" cy="46" r="10.5" fill="none" stroke="#26343a" stroke-width="2.6"/>
      <circle cx="60" cy="46" r="10.5" fill="none" stroke="#26343a" stroke-width="2.6"/>
      <line x1="50.5" y1="46" x2="49.5" y2="46" stroke="#26343a" stroke-width="2.6"/>
      <circle cx="41" cy="47" r="4.2" fill="#1d2226"/>
      <circle cx="59" cy="47" r="4.2" fill="#1d2226"/>
      <circle cx="42.4" cy="45.5" r="1.4" fill="#fff"/>
      <circle cx="60.4" cy="45.5" r="1.4" fill="#fff"/>
      <path d="M30 60 q20 -6 40 0 l-2 12 q-18 6 -36 0 z" fill="#eaf6f4"/>
      <path d="M30 60 l-6 -3 M70 60 l6 -3" stroke="#eaf6f4" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M24 34 q26 -20 52 0 q-26 -8 -52 0 z" fill="#2a3b42"/>
      <circle cx="50" cy="26" r="6" fill="#f3f1e9"/>
      <circle cx="50" cy="26" r="3" fill="#4ad8c4"/>
      <!-- mouth mirror, held out to one side -->
      <line x1="82" y1="70" x2="88" y2="46" stroke="#c2c6c8" stroke-width="3" stroke-linecap="round"/>
      <circle cx="89" cy="42" r="6" fill="#dfe6e8" stroke="#9aa5a8" stroke-width="1.6"/>
    </symbol>

    <!-- CHILL — the cold stimulus; harmless to most, agony to a hot pulp -->
    <symbol id="char-chill" viewBox="0 0 100 100">
      <ellipse cx="50" cy="92" rx="20" ry="4" fill="rgba(0,0,0,0.3)"/>
      <path d="M26 32 l24 -12 l24 12 l0 34 l-24 12 l-24 -12 z" fill="#7fc9f5"/>
      <path d="M26 32 l24 12 l24 -12 l-24 -12 z" fill="#b6e2fb"/>
      <path d="M50 44 l0 34 l24 -12 l0 -34 z" fill="#5aabdd"/>
      <circle cx="40" cy="52" r="6.5" fill="#fff"/>
      <circle cx="58" cy="52" r="6.5" fill="#fff"/>
      <circle cx="41" cy="53" r="3.1" fill="#123344"/>
      <circle cx="59" cy="53" r="3.1" fill="#123344"/>
      <circle cx="42.3" cy="51.8" r="1.1" fill="#fff"/>
      <circle cx="60.3" cy="51.8" r="1.1" fill="#fff"/>
      <path d="M42 64 q8 5 15 -1" fill="none" stroke="#0f3444" stroke-width="2.4" stroke-linecap="round"/>
      <g stroke="#eaf7ff" stroke-width="2" stroke-linecap="round">
        <path d="M14 20 l0 10 M9 25 l10 0 M10.5 21.5 l7 7 M17.5 21.5 l-7 7"/>
        <path d="M86 16 l0 8 M82 20 l8 0"/>
      </g>
    </symbol>

    <!-- CROWNIE — the crown: the last line of defence for a hollow tooth -->
    <symbol id="char-crown" viewBox="0 0 100 100">
      <ellipse cx="50" cy="93" rx="24" ry="4" fill="rgba(0,0,0,0.3)"/>
      <path d="M24 40 C24 20 76 20 76 40 L74 72 C74 82 26 82 26 72 Z" fill="#f0ece2"/>
      <path d="M24 40 C24 20 76 20 76 40 L75 54 L25 54 Z" fill="#fbf9f3"/>
      <ellipse cx="35" cy="34" rx="7" ry="4.5" fill="#ffffff" opacity="0.9"/>
      <circle cx="39" cy="48" r="8" fill="#fff"/>
      <circle cx="61" cy="48" r="8" fill="#fff"/>
      <circle cx="40" cy="49" r="3.8" fill="#1d2226"/>
      <circle cx="62" cy="49" r="3.8" fill="#1d2226"/>
      <circle cx="41.4" cy="47.6" r="1.3" fill="#fff"/>
      <circle cx="63.4" cy="47.6" r="1.3" fill="#fff"/>
      <path d="M41 62 q9 7 18 0" fill="none" stroke="#b5ac96" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M26 74 q24 8 48 0" fill="none" stroke="#c9a24a" stroke-width="3" stroke-linecap="round"/>
      <g fill="#e8b962">
        <path d="M44 12 l3 7 l7 0 l-6 5 l2 7 l-6 -4 l-6 4 l2 -7 l-6 -5 l7 0 z"/>
      </g>
    </symbol>
  </defs>
</svg>`;

  function injectSprite() {
    if (document.getElementById("tc-sprite")) return;
    const wrap = document.createElement("div");
    wrap.id = "tc-sprite";
    wrap.innerHTML = SPRITE;
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSprite);
  } else {
    injectSprite();
  }

  window.TC = {
    C, TAU, clamp, lerp, MONO, mono, canvas, slider, seg, on, set, html,
    label, line, leader, fmtNum, fmtSci, sup, hex2rgb, mix, rng, grain, roundRect,
    reducedMotion, DENT, stephanPH, minutesBelowCritical, survival,
    toothPath, drawTooth,
  };
})();
