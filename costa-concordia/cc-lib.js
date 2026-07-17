/* COSTA CONCORDIA — tiny shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, clock formatting, and the validated palette as JS constants. */
(function () {
  "use strict";

  const C = {
    bg: "#0a0f16",
    surface: "#10181f",
    surface2: "#16212b",
    surface3: "#1d2a37",
    ink: "#e8e6dd",
    ink2: "#b6bec7",
    muted: "#7f8e9b",
    line: "rgba(232,230,221,0.10)",
    line2: "rgba(232,230,221,0.05)",
    amber: "#f0b429",
    amberDim: "#a87f1f",
    teal: "#56b7cf",
    sea: "#3987e5",
    seaDeep: "#1d4f8c",
    danger: "#e05252",
    good: "#3fae62",
    rock: "#8a7a5c",
    land: "#243428",
    series: ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70", "#d95926", "#9085e9", "#e66767"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);

  const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Seconds since midnight -> "21:45:07". showSec=false -> "21:45". */
  function hms(sec, showSec) {
    sec = Math.round(sec);
    const d = sec >= 86400 ? Math.floor(sec / 86400) : 0;
    sec = sec % 86400;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return p(h) + ":" + p(m) + (showSec === false ? "" : ":" + p(s));
  }
  /* "21:45:07" -> seconds since midnight (next-day times pass 24+ hours, e.g. "25:46"). */
  function t(str) {
    const a = str.split(":").map(Number);
    return a[0] * 3600 + a[1] * 60 + (a[2] || 0);
  }

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
    };
  }

  /* Range input binding. fmt(value) -> readout string. onChange(value) called
     on input and once at bind time. Returns { get value, set }. */
  function slider(id, fmt, onChange) {
    const el = document.getElementById(id);
    if (!el) { console.error("no slider #" + id); return { value: 0, set: () => {} }; }
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

  /* Play/scrub transport shared by the replay figures.
     opts: { min, max, rate (sim-seconds per real second), playBtn, slider (id),
             fmt (val->readout), onTime (val) } . Returns { get time, set, playing }. */
  function transport(opts) {
    let time = opts.min, playing = false, raf = null, lastNow = null;
    const btn = document.getElementById(opts.playBtn);
    const sl = slider(opts.slider, opts.fmt, (v, initial) => {
      time = v;
      if (!initial) stop();
      opts.onTime(time);
    });
    function stop() {
      playing = false;
      if (btn) btn.textContent = "▶ play";
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      lastNow = null;
    }
    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = lastNow == null ? 0 : Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      time += dt * opts.rate;
      if (time >= opts.max) { time = opts.max; stop(); }
      sl.set(time);
      opts.onTime(time);
    }
    if (btn) btn.addEventListener("click", () => {
      if (playing) { stop(); return; }
      if (time >= opts.max - 0.5) time = opts.min;
      playing = true;
      btn.textContent = "❚❚ pause";
      raf = requestAnimationFrame(tick);
    });
    return {
      get time() { return time; },
      set(v) { sl.set(v); },
      get playing() { return playing; },
    };
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

  /* Draw a small ship outline (plan view), centred at 0,0 pointing +x.
     len/beam in px. */
  function shipPath(ctx, len, beam) {
    const l2 = len / 2, b2 = beam / 2;
    ctx.beginPath();
    ctx.moveTo(-l2, -b2);
    ctx.lineTo(l2 * 0.45, -b2);
    ctx.quadraticCurveTo(l2 * 0.95, -b2 * 0.85, l2, 0);
    ctx.quadraticCurveTo(l2 * 0.95, b2 * 0.85, l2 * 0.45, b2);
    ctx.lineTo(-l2, b2);
    ctx.closePath();
  }

  function fmtNum(v, dp) {
    return v.toLocaleString("en-GB", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }

  window.CC = { C, TAU, clamp, lerp, ease, MONO, mono, hms, t, canvas, slider, seg, transport, label, line, shipPath, fmtNum, reducedMotion };
})();
