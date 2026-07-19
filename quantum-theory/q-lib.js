/* QUANTA — tiny shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, the palette as JS constants, and a spectral-colour helper. */
(function () {
  "use strict";

  const C = {
    bg: "#0b0a14",
    surface: "#14122a",
    surface2: "#1a1735",
    surface3: "#232045",
    ink: "#ece9f4",
    ink2: "#bcb7d1",
    muted: "#85809f",
    line: "rgba(236,233,244,0.10)",
    line2: "rgba(236,233,244,0.05)",
    violet: "#b39dfc",
    violetDim: "#7e6bc4",
    cyan: "#5fd0ee",
    photon: "#f2c14e",
    danger: "#e06070",
    good: "#46c07a",
    series: ["#5fd0ee", "#f2c14e", "#e57fa8", "#7ee0a3", "#b39dfc", "#e08a4e", "#8fa7ff", "#e06070"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const MONO_B = 'bold 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Canvas figure. draw(ctx, w, h, t) — t in seconds (0 for static).
     opts.animate: run a rAF loop, paused while off-screen.
     Returns { redraw, setPaused, paused, size }. */
  function canvas(id, draw, opts) {
    opts = opts || {};
    const cv = document.getElementById(id);
    if (!cv) { console.error("no canvas #" + id); return null; }
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, visible = true, userPaused = false;
    let acc = 0, lastT = null; // animation clock that freezes while paused

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      if (r.width < 10) return;
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!opts.animate) safeDraw(0);
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

  /* Range input binding. fmt(value) -> readout string. onChange(value) called
     on input and once at bind time. Returns { get value, set }. */
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

  /* Simple axis text helper */
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

  /* Visible-spectrum colour for a wavelength in nm (CIE-ish piecewise fit).
     Returns [r,g,b] 0-255; dims smoothly outside 380-750 nm. */
  function wavelengthToRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; g = 0; b = 1; }
    else if (nm < 490) { r = 0; g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { r = 0; g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; b = 0; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; b = 0; }
    else if (nm <= 780) { r = 1; g = 0; b = 0; }
    let f = 1;
    if (nm < 380) { f = 0; }
    else if (nm < 420) { f = 0.3 + 0.7 * (nm - 380) / 40; }
    else if (nm > 700 && nm <= 780) { f = 0.3 + 0.7 * (780 - nm) / 80; }
    else if (nm > 780) { f = 0; }
    const gamma = 0.8;
    const conv = (c) => Math.round(255 * Math.pow(clamp(c * f, 0, 1), gamma));
    return [conv(r), conv(g), conv(b)];
  }
  function wavelengthCSS(nm, alpha) {
    const [r, g, b] = wavelengthToRGB(nm);
    return alpha == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
  }

  /* Mulberry32 — small deterministic PRNG for repeatable "measurements". */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.Q = {
    C, TAU, clamp, lerp, MONO, MONO_B, mono, canvas, slider, seg, label, line,
    fmtNum, wavelengthToRGB, wavelengthCSS, rng, reducedMotion,
  };
})();
