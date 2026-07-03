/* ============================================================================
 * The Death of Stars — interactive harness (SN)
 * Vanilla JS, no dependencies, no build step. Every interactive figure on the
 * page is a "widget": a function registered with SN.mount(id, init) that draws
 * into a host element carrying data-sim="id".
 *
 * The harness owns the tricky, shared plumbing so each widget can stay simple:
 *   - SN.canvas(host, onResize)   DPR-aware <canvas> that tracks its box size
 *   - SN.loop(host, tick)         a rAF loop that only runs while host is
 *                                  on-screen (IntersectionObserver) — cheap when
 *                                  scrolled away, and honours reduced-motion
 *   - SN.palette                  the shared stellar colour tokens
 *   - SN.u                        math/easing/RNG utilities
 * ==========================================================================*/
(function () {
  "use strict";

  var SN = (window.SN = window.SN || {});

  // ---- shared palette (kept in sync with the CSS custom properties) --------
  SN.palette = {
    bg:       "#05060d",
    panel:    "#0a0d1a",
    ink:      "#c8d0e6",
    bright:   "#eef2fb",
    muted:    "#727e9c",
    hair:     "rgba(150,170,215,0.14)",
    // the stellar temperature / energy ladder, cool -> hot -> exotic
    ember:    "#e0564a", // deep red giant
    orange:   "#ff8a5c", // red-supergiant / AGB
    gold:     "#ffd27f", // sun-like
    white:    "#fbfaf6", // A/F white
    blue:     "#8fc4ff", // O/B hot blue
    ice:      "#9ad8ff",
    cyan:     "#5cf2e0", // neutron / degenerate
    violet:   "#c58bff", // exotic / magnetar
    magenta:  "#ff6bd0",
    rproc:    "#ffcf5c", // r-process gold
    green:    "#7ee0a8",
  };

  // ---- reduced-motion: respect the user's OS setting ----------------------
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  SN.reducedMotion = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { SN.reducedMotion = e.matches; });

  // ---- math / easing / seeded RNG -----------------------------------------
  SN.u = {
    TAU: Math.PI * 2,
    clamp: function (x, a, b) { return x < a ? a : x > b ? b : x; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    // map x from [a,b] to [c,d]
    map: function (x, a, b, c, d) { return c + (d - c) * ((x - a) / (b - a)); },
    smooth: function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); },
    easeInOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    // deterministic mulberry32 RNG factory
    rng: function (seed) {
      var s = seed >>> 0 || 1;
      return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // blend two "#rrggbb" colours; t in [0,1]
    mix: function (c1, c2, t) {
      var a = SN.u._parse(c1), b = SN.u._parse(c2);
      var r = Math.round(SN.u.lerp(a[0], b[0], t));
      var g = Math.round(SN.u.lerp(a[1], b[1], t));
      var bl = Math.round(SN.u.lerp(a[2], b[2], t));
      return "rgb(" + r + "," + g + "," + bl + ")";
    },
    rgba: function (c, alpha) {
      var a = SN.u._parse(c);
      return "rgba(" + a[0] + "," + a[1] + "," + a[2] + "," + alpha + ")";
    },
    _parse: function (c) {
      if (c[0] === "#") {
        var h = c.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      var m = c.match(/\d+/g) || [0, 0, 0];
      return [+m[0], +m[1], +m[2]];
    },
  };

  // ---- DPR-aware canvas that follows its host box --------------------------
  // Returns { canvas, ctx, w, h, dpr } where w/h are CSS pixels. Pass onResize
  // to be told when the box size changes (also fired once on setup).
  SN.canvas = function (host, onResize) {
    var canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var api = { canvas: canvas, ctx: ctx, w: 0, h: 0, dpr: 1 };

    function resize() {
      var r = host.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === api.w && h === api.h && dpr === api.dpr) return;
      api.w = w; api.h = h; api.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (onResize) onResize(api);
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(resize);
      ro.observe(host);
    } else {
      window.addEventListener("resize", resize);
    }
    // defer one tick so layout has settled
    resize();
    setTimeout(resize, 0);
    return api;
  };

  // ---- a rAF loop that only runs while the host is visible -----------------
  // tick(dt, t) — dt is seconds since last frame (capped), t is seconds running.
  // Returns a controller { stop, running }. Reduced-motion still ticks but dt
  // is delivered so widgets can render a single settled frame if they prefer.
  SN.loop = function (host, tick) {
    var running = false, raf = 0, last = 0, t = 0, visible = false;
    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now; t += dt;
      try { tick(dt, t); } catch (e) { /* one bad frame shouldn't kill the loop */ }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running) return;
      running = true; last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0.05 });
      io.observe(host);
    } else {
      visible = true;
      start();
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (visible) start();
    });
    return { start: start, stop: stop, get running() { return running; } };
  };

  // ---- tiny DOM helper -----------------------------------------------------
  // SN.el("button.btn.primary", { onclick: fn }, "Play")  ->  <button ...>
  SN.el = function (spec, attrs, kids) {
    var parts = spec.split(".");
    var tag = parts[0] || "div";
    var node = document.createElement(tag);
    if (parts.length > 1) node.className = parts.slice(1).join(" ");
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v != null) node.setAttribute(k, v);
    });
    if (kids != null) {
      if (!Array.isArray(kids)) kids = [kids];
      kids.forEach(function (c) { node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    }
    return node;
  };

  // build a labelled control group: label + range/etc + live readout
  SN.slider = function (opts) {
    var wrap = SN.el("div.grp");
    if (opts.label) wrap.appendChild(SN.el("label", { text: opts.label }));
    var input = SN.el("input", { type: "range", min: opts.min, max: opts.max, step: opts.step || 1, value: opts.value });
    var out = SN.el("output");
    function render() { out.textContent = opts.format ? opts.format(+input.value) : input.value; }
    input.addEventListener("input", function () { render(); if (opts.oninput) opts.oninput(+input.value); });
    render();
    wrap.appendChild(input); wrap.appendChild(out);
    wrap._input = input; wrap._out = out;
    return wrap;
  };

  // ---- widget registry + boot ---------------------------------------------
  SN.widgets = {};
  SN.mount = function (id, init) { SN.widgets[id] = init; };

  SN.boot = function () {
    var hosts = document.querySelectorAll("[data-sim]");
    hosts.forEach(function (host) {
      var id = host.getAttribute("data-sim");
      var init = SN.widgets[id];
      if (!init) return;
      // a widget may drive a sibling controls bar: <div class="sim-controls" data-sim-controls="id">
      var controls = null, fig = host.closest("figure.sim");
      if (fig) controls = fig.querySelector('[data-sim-controls="' + id + '"]');
      try { init(host, controls); }
      catch (e) {
        host.innerHTML = '<div class="sim-fallback">interactive unavailable</div>';
        if (window.console) console.error("[SN] widget failed:", id, e);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", SN.boot);
  } else {
    SN.boot();
  }
})();

/* ============================================================================
 * Ambient background: the fixed starfield (#space) and the hero (#hero-canvas).
 * These are page-chrome, not data-sim widgets, so they self-init on load.
 * ==========================================================================*/
(function () {
  "use strict";
  var SN = window.SN, u = SN.u, P = SN.palette;

  // ---- fixed faint starfield behind the whole page ------------------------
  function initSpace() {
    var host = document.getElementById("space");
    if (!host) return;
    var ctx = host.getContext("2d"), dpr = 1, W = 0, H = 0, stars = [];
    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      host.width = Math.round(W * dpr); host.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(340, Math.round(W * H / 6500));
      var r = u.rng(20260703);
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: r() * W, y: r() * H, z: 0.3 + r() * 0.7,
          rad: 0.3 + r() * 1.3,
          tw: r() * u.TAU, ts: 0.4 + r() * 1.4,
          c: r() < 0.15 ? (r() < 0.5 ? P.blue : P.gold) : "#dfe8ff",
        });
      }
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.ts + s.tw));
        a *= s.z;
        ctx.globalAlpha = a * (SN.reducedMotion ? 0.7 : 1);
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x, s.y - (window.scrollY || 0) * 0.02 * s.z, s.rad, 0, u.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    build();
    window.addEventListener("resize", build);
    // drive through SN.loop so it gates on tab visibility and re-checks
    // reduced-motion live each frame (t=0 => a static, settled twinkle).
    SN.loop(host, function (dt, t) { draw(SN.reducedMotion ? 0 : t); });
  }

  // ---- hero: a slow, luminous star that lives above the fold --------------
  // #hero-canvas is itself a <canvas>, so draw on it directly (SN.canvas would
  // try to append a child canvas, which a <canvas> element cannot render).
  function initHero() {
    var canvas = document.getElementById("hero-canvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var c = { w: 0, h: 0, dpr: 1 };
    function resize() {
      var r = canvas.getBoundingClientRect();
      c.w = Math.max(1, Math.round(r.width));
      c.h = Math.max(1, Math.round(r.height));
      c.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(c.w * c.dpr);
      canvas.height = Math.round(c.h * c.dpr);
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    }
    if (window.ResizeObserver) { new ResizeObserver(resize).observe(canvas); } else { window.addEventListener("resize", resize); }
    resize();
    var seed = u.rng(4242), motes = [];
    function rebuild() {
      motes = [];
      var n = Math.round(c.w * c.h / 9000);
      for (var i = 0; i < n; i++) {
        var ang = seed() * u.TAU, rr = Math.pow(seed(), 0.5);
        motes.push({ a: ang, r: rr, sp: 0.02 + seed() * 0.06, sz: 0.4 + seed() * 1.6, ph: seed() * u.TAU });
      }
    }
    var lastW = 0, lastH = 0;
    SN.loop(canvas, function (dt, t) {
      var W = c.w, H = c.h;
      if (W < 2) return;
      if (W !== lastW || H !== lastH) { rebuild(); lastW = W; lastH = H; }
      ctx.clearRect(0, 0, W, H);
      // the star sits upper-right, partly off-frame
      var cx = W * 0.80, cy = H * 0.34, R = Math.min(W, H) * 0.30;
      var tt = SN.reducedMotion ? 0 : t;
      // corona glow
      var g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 3.0);
      g.addColorStop(0, u.rgba(P.gold, 0.55));
      g.addColorStop(0.18, u.rgba(P.orange, 0.30));
      g.addColorStop(0.5, u.rgba("#5a2a6a", 0.14));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // photosphere
      var pulse = 1 + 0.02 * Math.sin(tt * 0.6);
      var pg = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R * pulse);
      pg.addColorStop(0, "#fff7e6");
      pg.addColorStop(0.55, P.gold);
      pg.addColorStop(0.85, P.orange);
      pg.addColorStop(1, u.mix(P.orange, P.ember, 0.6));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(cx, cy, R * pulse, 0, u.TAU); ctx.fill();
      // granulation flecks
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        var ma = m.a + tt * m.sp;
        var mr = m.r * R * 0.96;
        var mx = cx + Math.cos(ma) * mr, my = cy + Math.sin(ma) * mr;
        var d = Math.hypot(mx - cx, my - cy);
        if (d > R) continue;
        ctx.globalAlpha = 0.10 + 0.10 * (0.5 + 0.5 * Math.sin(tt + m.ph));
        ctx.fillStyle = "#fff2d0";
        ctx.beginPath(); ctx.arc(mx, my, m.sz, 0, u.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  function boot() { initSpace(); initHero(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
