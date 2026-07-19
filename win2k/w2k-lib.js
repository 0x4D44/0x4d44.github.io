/* BOOT TO DESKTOP — tiny shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, a step-through
   harness for SVG/DOM figures, slider/segment bindings, formatting,
   and the validated palette as JS constants. House pattern follows
   world-in-640k/w640-lib.js. */
(function () {
  "use strict";

  const C = {
    bg: "#0a0e17",
    surface: "#111a2c",
    surface2: "#16223a",
    surface3: "#1e2e4e",
    ink: "#e8e6df",
    ink2: "#b6bdc9",
    muted: "#7c8698",
    line: "rgba(232,230,223,0.12)",
    line2: "rgba(232,230,223,0.05)",
    cobalt: "#6cb1f2",
    cobaltHi: "#9ccaff",
    cobaltDim: "#33639c",
    teal: "#56d0b4",
    ntblue: "#16244f",
    good: "#4cc26e",
    warn: "#e0a63c",
    danger: "#e05252",
    /* validated 7-slot categorical order (dark surface #111a2c) */
    series: ["#4f8fe0", "#bd8b16", "#22916b", "#7d86ef", "#d466a8", "#d47c2e", "#3399ba"],
    /* the four fixes = flag panes (validated 4-slot; always direct-labelled) */
    fix: ["#d64b3a", "#2f9d85", "#3489d6", "#bd8b16"],
    /* recreated Win2K chrome (illustration only) */
    w2kFace: "#d4d0c8", w2kShade: "#808080", w2kDark: "#404040",
    w2kTitle1: "#0a246a", w2kTitle2: "#a6caf0",
    w2kDesk: "#3a6ea5", w2kFelt: "#0a7d40",
    bsod: "#0000aa", bsodInk: "#c0c0c0",
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace';
  const disp = (px, weight) =>
    (weight || 700) + " " + px + 'px "Libre Franklin", "Franklin Gothic Medium", "Segoe UI", sans-serif';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* number formatting */
  const fmtInt = (n) => Math.round(n).toLocaleString("en-GB");
  const fmtBytes = (n) => fmtInt(n) + " B";
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w || 4, "0");
  const addr = (n) => "0x" + hex(n >>> 0, 8);

  /* ---------- canvas figure: DPR scale, resize, off-screen pause ---------- */
  function makeFig(canvasOrId, draw) {
    const canvas =
      typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const fig = {
      canvas, ctx, draw,
      playing: false,
      visible: true,
      t: 0,
      _raf: 0,
      _last: 0,
      w: 0, h: 0,
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      if (r.width === 0) return;
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      fig.w = r.width; fig.h = r.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(ms) {
      fig._raf = 0;
      if (!fig.playing || !fig.visible) return;
      if (fig._last) fig.t += Math.min(0.05, (ms - fig._last) / 1000);
      fig._last = ms;
      resize();
      draw(ctx, fig.w, fig.h, fig);
      fig._raf = requestAnimationFrame(frame);
    }

    fig.redraw = function () {
      resize();
      if (fig.w) draw(ctx, fig.w, fig.h, fig);
    };
    fig.start = function () {
      if (fig.playing) return;
      fig.playing = true;
      fig._last = 0;
      if (!fig._raf) fig._raf = requestAnimationFrame(frame);
    };
    fig.stop = function () {
      fig.playing = false;
      if (fig._raf) { cancelAnimationFrame(fig._raf); fig._raf = 0; }
    };

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => {
        for (const e of es) {
          fig.visible = e.isIntersecting;
          if (fig.visible && fig.playing && !fig._raf) {
            fig._last = 0;
            fig._raf = requestAnimationFrame(frame);
          }
        }
      }, { rootMargin: "60px" }).observe(canvas);
    }
    window.addEventListener("resize", () => fig.redraw());
    requestAnimationFrame(() => fig.redraw());
    return fig;
  }

  /* ---------- stepper: step-through harness for SVG/DOM figures ----------
     makeStepper({ prev, next, out, log, steps, apply, start })
       prev/next : button ids
       out       : id of an <output> showing "n / N" (optional)
       log       : id of an .evlog element for the caption (optional)
       steps     : array — each entry may be a string (caption HTML) or
                   { cap, ... } consumed by apply
       apply(i, step) : called on every change with the index + entry
       start     : initial index (default 0)
     Returns { go(i), idx }; binds ← → keys when the stage has focus. */
  function makeStepper(opts) {
    const bPrev = document.getElementById(opts.prev);
    const bNext = document.getElementById(opts.next);
    const out = opts.out ? document.getElementById(opts.out) : null;
    const log = opts.log ? document.getElementById(opts.log) : null;
    const n = opts.steps.length;
    const st = { idx: -1 };

    function go(i) {
      i = clamp(i, 0, n - 1);
      if (i === st.idx) return;
      st.idx = i;
      const step = opts.steps[i];
      if (out) out.textContent = (i + 1) + " / " + n;
      if (log) log.innerHTML = typeof step === "string" ? step : (step.cap || "");
      if (bPrev) bPrev.disabled = i === 0;
      if (bNext) bNext.disabled = i === n - 1;
      opts.apply(i, step);
    }
    st.go = go;

    if (bPrev) bPrev.addEventListener("click", () => go(st.idx - 1));
    if (bNext) bNext.addEventListener("click", () => go(st.idx + 1));
    if (opts.stage) {
      const el = document.getElementById(opts.stage);
      if (el) {
        el.tabIndex = 0;
        el.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight") { go(st.idx + 1); e.preventDefault(); }
          if (e.key === "ArrowLeft") { go(st.idx - 1); e.preventDefault(); }
        });
      }
    }
    go(opts.start || 0);
    return st;
  }

  /* ---------- controls ---------- */

  function bindSlider(id, oninput, fmt) {
    const el = document.getElementById(id);
    if (!el) return null;
    const out = el.parentElement && el.parentElement.querySelector("output");
    const upd = () => {
      if (out) out.textContent = fmt ? fmt(+el.value) : el.value;
      if (oninput) oninput(+el.value);
    };
    el.addEventListener("input", upd);
    upd();
    return el;
  }

  function bindSeg(id, onpick) {
    const box = document.getElementById(id);
    if (!box) return;
    const btns = [...box.querySelectorAll("button")];
    for (const b of btns) {
      b.addEventListener("click", () => {
        for (const x of btns) x.setAttribute("aria-pressed", x === b ? "true" : "false");
        onpick(b.dataset.v, b);
      });
    }
  }

  function bindPlay(id, fig, labels) {
    const b = document.getElementById(id);
    if (!b || !fig) return null;
    const L = labels || ["▶ play", "❚❚ pause"];
    b.addEventListener("click", () => {
      if (fig.playing) { fig.stop(); b.textContent = L[0]; }
      else { fig.start(); b.textContent = L[1]; }
    });
    return b;
  }

  /* ---------- drawing helpers ---------- */

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color || C.cobalt;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = color || C.cobalt;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(a - 0.42), y2 - 8 * Math.sin(a - 0.42));
    ctx.lineTo(x2 - 8 * Math.cos(a + 0.42), y2 - 8 * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function onHover(canvas, cb) {
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      cb(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener("mouseleave", () => cb(null, null));
  }

  /* boot-style typewriter into an element; lines: [string]; returns promise */
  function typeLines(el, lines, cps) {
    if (reducedMotion) { el.textContent = lines.join("\n"); return Promise.resolve(); }
    el.textContent = "";
    const speed = 1000 / (cps || 90);
    return new Promise((res) => {
      let li = 0, ci = 0;
      (function tick() {
        if (li >= lines.length) return res();
        const line = lines[li];
        if (ci <= line.length) {
          el.textContent = lines.slice(0, li).join("\n") + (li ? "\n" : "") + line.slice(0, ci);
          ci++;
          setTimeout(tick, speed);
        } else { li++; ci = 0; setTimeout(tick, speed * 8); }
      })();
    });
  }

  window.W2K = {
    C, TAU, clamp, lerp, ease, easeOut,
    mono, disp, reducedMotion,
    fmtInt, fmtBytes, hex, addr,
    makeFig, makeStepper, bindSlider, bindSeg, bindPlay,
    rrect, drawArrow, onHover, typeLines,
  };
})();
