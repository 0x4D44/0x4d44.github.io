/* THE TEENAGE BRAIN — shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, the palette as JS constants, small charting helpers, and the
   injected cartoon-character sprite (Kurzgesagt-flavoured flat vectors). */
(function () {
  "use strict";

  const C = {
    bg: "#100a2c",
    surface: "#1b1442",
    surface2: "#241a55",
    surface3: "#2f2270",
    ink: "#f3efff",
    ink2: "#c5bdec",
    muted: "#8f86c4",
    line: "rgba(243,239,255,0.11)",
    line2: "rgba(243,239,255,0.055)",
    pink: "#ff5da2",
    pinkDim: "#c73f7c",
    teal: "#34e1c4",
    tealDim: "#23a894",
    yellow: "#ffd93d",
    purple: "#a889ff",
    orange: "#ff9f45",
    coral: "#ff6b6b",
    green: "#63d471",
    blue: "#5aa9ff",
    series: ["#34e1c4", "#ff5da2", "#ffd93d", "#a889ff", "#ff9f45", "#5aa9ff", "#63d471", "#ff6b6b"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const sans = (px, bold) =>
    (bold ? "bold " : "") + px + 'px "Segoe UI", system-ui, Arial, sans-serif';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  /* text label helper */
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

  /* Draw a smooth line through data points [{x,y}] already in pixel space
     (Catmull-Rom to Bezier). Stroke only; caller sets style/beginPath. */
  function smooth(ctx, pts) {
    if (pts.length < 2) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i], p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
    }
  }

  /* A framed chart plot area with x/y axes and gridlines.
     Returns {L,R,T,B,W,H, X(v), Y(v)} scale helpers over [x0,x1]×[y0,y1]. */
  function plot(ctx, w, h, opts) {
    opts = opts || {};
    const L = opts.left != null ? opts.left : 46;
    const R = w - (opts.right != null ? opts.right : 16);
    const T = opts.top != null ? opts.top : 14;
    const B = h - (opts.bottom != null ? opts.bottom : 30);
    const [x0, x1] = opts.xr || [0, 1];
    const [y0, y1] = opts.yr || [0, 1];
    const X = (v) => L + (v - x0) / (x1 - x0) * (R - L);
    const Y = (v) => B - (v - y0) / (y1 - y0) * (B - T);
    // gridlines
    if (opts.xticks) {
      ctx.save();
      ctx.font = MONO; ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const tk of opts.xticks) {
        const x = X(tk.v != null ? tk.v : tk);
        line(ctx, x, T, x, B, C.line2, 1);
        if (tk.label != null || typeof tk === "number")
          ctx.fillText(tk.label != null ? tk.label : String(tk), x, B + 6);
      }
      ctx.restore();
    }
    if (opts.yticks) {
      ctx.save();
      ctx.font = MONO; ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (const tk of opts.yticks) {
        const y = Y(tk.v != null ? tk.v : tk);
        line(ctx, L, y, R, y, C.line2, 1);
        if (tk.label != null || typeof tk === "number")
          ctx.fillText(tk.label != null ? tk.label : String(tk), L - 8, y);
      }
      ctx.restore();
    }
    // axes
    line(ctx, L, T, L, B, C.line, 1.2);
    line(ctx, L, B, R, B, C.line, 1.2);
    return { L, R, T, B, W: R - L, H: B - T, X, Y };
  }

  function fmtNum(v, dp) {
    return v.toLocaleString("en-GB", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
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

  /* Faint deterministic "sparkle" starfield for figure backdrops. */
  function sparkle(ctx, w, h, n, seed) {
    const r = rng(seed || 7);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, s = r();
      ctx.globalAlpha = 0.12 + 0.4 * s * s;
      ctx.fillStyle = s > 0.9 ? "#ffd93d" : "#c5bdec";
      ctx.fillRect(x, y, s > 0.95 ? 1.4 : 0.9, s > 0.95 ? 1.4 : 0.9);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- the cartoon cast: injected SVG sprite ---------------------- */
  const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- NEURA — the neuron guide (teal cell body, dendrite arms, axon tail) -->
    <symbol id="char-neura" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="17" ry="3.6" fill="rgba(0,0,0,0.30)"/>
      <!-- dendrite arms -->
      <path d="M28 46 l-16 -9 M24 55 l-17 2 M30 63 l-13 10" stroke="#23a894" stroke-width="4" stroke-linecap="round"/>
      <path d="M72 46 l16 -9 M76 55 l17 2" stroke="#23a894" stroke-width="4" stroke-linecap="round"/>
      <circle cx="11" cy="36" r="3" fill="#34e1c4"/><circle cx="6" cy="58" r="3" fill="#34e1c4"/>
      <circle cx="16" cy="74" r="3" fill="#34e1c4"/><circle cx="89" cy="36" r="3" fill="#34e1c4"/>
      <circle cx="94" cy="58" r="3" fill="#34e1c4"/>
      <!-- axon tail -->
      <path d="M50 78 q4 12 -6 18" stroke="#23a894" stroke-width="4.5" stroke-linecap="round" fill="none"/>
      <circle cx="43" cy="97" r="3.4" fill="#ffd93d"/>
      <!-- soma -->
      <circle cx="50" cy="54" r="30" fill="#34e1c4"/>
      <circle cx="50" cy="60" r="17" fill="#7ff0dd"/>
      <circle cx="40" cy="48" r="11" fill="#fff"/>
      <circle cx="61" cy="48" r="11" fill="#fff"/>
      <circle cx="42" cy="50" r="4.6" fill="#141033"/>
      <circle cx="59" cy="50" r="4.6" fill="#141033"/>
      <circle cx="43.6" cy="48.4" r="1.6" fill="#fff"/>
      <circle cx="60.6" cy="48.4" r="1.6" fill="#fff"/>
      <path d="M43 64 q7 6 14 0" fill="none" stroke="#186b5e" stroke-width="3" stroke-linecap="round"/>
    </symbol>

    <!-- CORTEX — the prefrontal cortex (purple brain, "under construction" hard hat) -->
    <symbol id="char-cortex" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="17" ry="3.6" fill="rgba(0,0,0,0.30)"/>
      <path d="M40 84 l-3 9 M56 84 l3 9" stroke="#7a5fce" stroke-width="4.5" stroke-linecap="round"/>
      <!-- brain body -->
      <ellipse cx="50" cy="55" rx="31" ry="30" fill="#a889ff"/>
      <ellipse cx="50" cy="63" rx="18" ry="18" fill="#c9b6ff"/>
      <!-- a couple of cortical folds -->
      <path d="M30 58 q7 -5 4 -12 M70 58 q-7 -5 -4 -12" fill="none" stroke="#8f79e0" stroke-width="2.6" stroke-linecap="round"/>
      <!-- hard hat -->
      <path d="M24 40 q26 -22 52 0 z" fill="#ffd93d"/>
      <rect x="21" y="38" width="58" height="6" rx="3" fill="#ffcf1f"/>
      <rect x="47" y="22" width="6" height="12" rx="3" fill="#ffcf1f"/>
      <circle cx="40" cy="52" r="10.5" fill="#fff"/>
      <circle cx="60" cy="52" r="10.5" fill="#fff"/>
      <circle cx="41" cy="53" r="4.3" fill="#141033"/>
      <circle cx="59" cy="53" r="4.3" fill="#141033"/>
      <circle cx="42.4" cy="51.6" r="1.5" fill="#fff"/>
      <circle cx="60.4" cy="51.6" r="1.5" fill="#fff"/>
      <path d="M44 68 q6 4 12 0" fill="none" stroke="#6f56b8" stroke-width="3" stroke-linecap="round"/>
    </symbol>

    <!-- AMY — the amygdala (coral almond, big feelings) -->
    <symbol id="char-amy" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="15" ry="3.4" fill="rgba(0,0,0,0.30)"/>
      <path d="M42 82 l-3 9 M57 82 l3 9" stroke="#d1483f" stroke-width="4.5" stroke-linecap="round"/>
      <!-- almond body -->
      <path d="M50 20 C74 30 78 62 50 84 C22 62 26 30 50 20 Z" fill="#ff6b6b"/>
      <path d="M50 34 C64 42 66 60 50 74 C34 60 36 42 50 34 Z" fill="#ff9a8f"/>
      <circle cx="41" cy="50" r="9.5" fill="#fff"/>
      <circle cx="59" cy="50" r="9.5" fill="#fff"/>
      <circle cx="42" cy="51" r="4" fill="#141033"/>
      <circle cx="58" cy="51" r="4" fill="#141033"/>
      <circle cx="43.3" cy="49.7" r="1.4" fill="#fff"/>
      <circle cx="59.3" cy="49.7" r="1.4" fill="#fff"/>
      <!-- worried/urgent brows -->
      <path d="M33 40 q6 -4 12 0 M55 40 q6 -4 12 0" fill="none" stroke="#c0362e" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M43 64 q7 -5 14 0" fill="none" stroke="#c0362e" stroke-width="3" stroke-linecap="round"/>
      <!-- alarm sparks -->
      <path d="M14 32 l-7 -5 M18 22 l-3 -8 M86 32 l7 -5 M82 22 l3 -8" stroke="#ffd93d" stroke-width="3" stroke-linecap="round"/>
    </symbol>

    <!-- DASH — the dopamine spark (yellow, electric, delighted) -->
    <symbol id="char-dash" viewBox="0 0 100 100">
      <g fill="#ffd93d">
        <path d="M50 6 l8 22 l22 -6 l-16 17 l16 17 l-22 -6 l-8 22 l-8 -22 l-22 6 l16 -17 l-16 -17 l22 6 z"/>
      </g>
      <circle cx="50" cy="50" r="18" fill="#fff0a8"/>
      <circle cx="44" cy="48" r="3.4" fill="#7a5a12"/>
      <circle cx="57" cy="48" r="3.4" fill="#7a5a12"/>
      <circle cx="45" cy="47" r="1.2" fill="#fff"/>
      <circle cx="58" cy="47" r="1.2" fill="#fff"/>
      <path d="M43 56 q7 6 14 0" fill="none" stroke="#7a5a12" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M8 44 h9 M6 54 h11 M11 64 h8" stroke="#ffd93d" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
    </symbol>

    <!-- TEI — the teenager (hoodie, headphones, easy grin) -->
    <symbol id="char-teen" viewBox="0 0 100 100">
      <ellipse cx="50" cy="95" rx="18" ry="3.6" fill="rgba(0,0,0,0.30)"/>
      <!-- hoodie body -->
      <path d="M22 96 q0 -26 28 -26 q28 0 28 26 z" fill="#ff5da2"/>
      <path d="M50 70 l-7 16 l7 6 l7 -6 z" fill="#ff89bd"/>
      <!-- head -->
      <circle cx="50" cy="44" r="24" fill="#f0c9a8"/>
      <path d="M27 40 q3 -22 23 -22 q20 0 23 22 q-10 -8 -23 -8 q-13 0 -23 8 z" fill="#5a3d6b"/>
      <!-- headphones -->
      <path d="M24 44 a26 26 0 0 1 52 0" fill="none" stroke="#a889ff" stroke-width="4"/>
      <rect x="19" y="40" width="9" height="16" rx="4" fill="#a889ff"/>
      <rect x="72" y="40" width="9" height="16" rx="4" fill="#a889ff"/>
      <circle cx="42" cy="45" r="6.5" fill="#fff"/>
      <circle cx="59" cy="45" r="6.5" fill="#fff"/>
      <circle cx="43" cy="46" r="3" fill="#141033"/>
      <circle cx="58" cy="46" r="3" fill="#141033"/>
      <circle cx="44" cy="45" r="1" fill="#fff"/>
      <circle cx="59" cy="45" r="1" fill="#fff"/>
      <path d="M43 55 q7 5 14 0" fill="none" stroke="#b07a52" stroke-width="2.6" stroke-linecap="round"/>
    </symbol>

    <!-- MELO — the sleep moon (for the circadian chapter) -->
    <symbol id="char-melo" viewBox="0 0 100 100">
      <ellipse cx="50" cy="94" rx="15" ry="3.4" fill="rgba(0,0,0,0.30)"/>
      <path d="M76 50 a30 30 0 1 1 -30 -30 a23 23 0 1 0 30 30 z" fill="#a889ff"/>
      <circle cx="44" cy="52" r="8.5" fill="#fff"/>
      <circle cx="62" cy="50" r="8.5" fill="#fff"/>
      <circle cx="44" cy="54" r="3.6" fill="#141033"/>
      <circle cx="61" cy="52" r="3.6" fill="#141033"/>
      <path d="M40 64 q8 5 16 -1" fill="none" stroke="#6f56b8" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M78 22 l3 -6 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 z" fill="#ffd93d"/>
      <text x="70" y="40" font-family="ui-monospace, Menlo, monospace" font-size="12" fill="#ffd93d">z</text>
    </symbol>
  </defs>
</svg>`;

  function injectSprite() {
    if (document.getElementById("tb-sprite")) return;
    const wrap = document.createElement("div");
    wrap.id = "tb-sprite";
    wrap.innerHTML = SPRITE;
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSprite);
  } else {
    injectSprite();
  }

  window.TB = {
    C, TAU, clamp, lerp, smoothstep, MONO, mono, sans, canvas, slider, seg, on, set,
    label, line, roundRect, smooth, plot, fmtNum, rng, sparkle, reducedMotion,
  };
})();
