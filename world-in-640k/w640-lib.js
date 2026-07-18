/* A WORLD IN 640K — tiny shared helper library (no dependencies).
   Canvas figures with DPR scaling + off-screen pause, slider/segment
   bindings, byte/hex formatting, and the validated palette as JS
   constants. House pattern follows costa-concordia/cc-lib.js. */
(function () {
  "use strict";

  const C = {
    bg: "#0b0e14",
    surface: "#121826",
    surface2: "#182136",
    surface3: "#223048",
    ink: "#e6e2d6",
    ink2: "#b8bcc4",
    muted: "#7d8794",
    line: "rgba(230,226,214,0.12)",
    line2: "rgba(230,226,214,0.05)",
    amber: "#f0a132",
    amberHi: "#ffc35c",
    amberDim: "#9a6a1e",
    cyan: "#5ad7e6",
    dosblue: "#16244f",
    good: "#4cc26e",
    warn: "#e0a63c",
    danger: "#e05252",
    /* validated 7-slot categorical order (dark surface #121826) */
    series: ["#4f8fe0", "#bd8b16", "#22916b", "#7d86ef", "#d466a8", "#d47c2e", "#3399ba"],
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  const mono = (px, bold) =>
    (bold ? "bold " : "") + px + 'px ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace';
  const dos = (px) => px + 'px "VT323", "Cascadia Mono", Consolas, monospace';

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* number formatting */
  const fmtInt = (n) => Math.round(n).toLocaleString("en-GB");
  const fmtKB = (bytes, dp) => (bytes / 1024).toFixed(dp == null ? 1 : dp) + " KB";
  const fmtBytes = (n) => fmtInt(n) + " B";
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w || 4, "0");
  const seg = (s, o) => hex(s, 4) + ":" + hex(o, 4);

  /* ---------- canvas figure: DPR scale, resize, off-screen pause ----------
     makeFig(canvasOrId, draw) → handle
       draw(ctx, w, h, fig) is called on every frame while animating, or
       once per invalidate() when static. fig.t is seconds since start.
     handle: { redraw(), start(), stop(), playing, canvas, ctx, onFrame } */
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
    // first paint once layout settles
    requestAnimationFrame(() => fig.redraw());
    return fig;
  }

  /* ---------- controls ---------- */

  /* bindSlider("id", oninput?, fmt?) → input el; writes formatted value
     into the sibling <output> if present. */
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

  /* bindSeg(containerId, onpick) — segmented control of <button data-v=..> */
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

  /* bindPlay(buttonId, fig, labels?) — toggles a fig's animation loop */
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

  /* horizontal segmented bar (memory maps, byte ledgers).
     segs: [{label, bytes, color, dim?}], total = sum unless given.
     Draws 2px surface gaps, 4px rounded ends, labels below when room. */
  function drawByteBar(ctx, x, y, w, h, segs, opts) {
    const o = opts || {};
    const total = o.total || segs.reduce((a, s) => a + s.bytes, 0);
    let cx = x;
    ctx.save();
    for (const s of segs) {
      const sw = (s.bytes / total) * w;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.dim ? 0.35 : 1;
      rrect(ctx, cx + 1, y, Math.max(1, sw - 2), h, 3);
      ctx.fill();
      s._x = cx; s._w = sw;
      cx += sw;
    }
    ctx.restore();
    return segs;
  }

  /* label under a bar segment, centred, skipped when too narrow */
  function segLabel(ctx, s, y, minW) {
    if (s._w < (minW || 46)) return;
    ctx.fillStyle = C.ink2;
    ctx.font = mono(10);
    ctx.textAlign = "center";
    ctx.fillText(s.label, s._x + s._w / 2, y);
  }

  /* chunky pixel-block "disk read" arrow, DOS-flavoured */
  function drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color || C.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = color || C.amber;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(a - 0.42), y2 - 8 * Math.sin(a - 0.42));
    ctx.lineTo(x2 - 8 * Math.cos(a + 0.42), y2 - 8 * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* hover helper: attaches mousemove/leave; cb(x, y | null) in CSS px */
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

  window.W640 = {
    C, TAU, clamp, lerp, ease, easeOut,
    mono, dos, reducedMotion,
    fmtInt, fmtKB, fmtBytes, hex, seg,
    makeFig, bindSlider, bindSeg, bindPlay,
    rrect, drawByteBar, segLabel, drawArrow, onHover, typeLines,
  };
})();
