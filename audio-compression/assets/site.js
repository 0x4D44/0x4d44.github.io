/* ============================================================
   THROWING SOUND AWAY — shared site chrome and drawing kit.

   Every page sets <body data-chapter="NN"> and includes <div id="topbar"></div>;
   this file renders the chapter nav, fills any [data-pager], runs the section
   scrollspy, and exposes window.AC:

     AC.CH                 the chapter table
     AC.$ / AC.$$          querySelector / querySelectorAll (array)
     AC.on(sel, ev, fn)    delegated-ish listener helper
     AC.chips(el, fn)      wire a .chips button group (returns setter)
     AC.slider(el, fn)     wire an <input type=range> + its .val readout
     AC.fmt.*              number formatting used across the study
     AC.Plot               a small canvas chart: axes, grid, lines, bars, marks
     AC.autoDraw(p, fn)    redraw a Plot on resize and when it scrolls into view
     AC.raf(fn)            a start/stop animation loop that pauses off-screen

   No external origin is ever contacted: no fonts, no CDNs, no analytics.
   ============================================================ */
(function () {
  "use strict";

  var CH = [
    { n: "00", t: "Contents",        href: "index.html",         short: "Contents" },
    { n: "01", t: "Sound, sampled",  href: "1-sound.html",       short: "Sampled" },
    { n: "02", t: "The ear",         href: "2-ear.html",         short: "The ear" },
    { n: "03", t: "Masking",         href: "3-masking.html",     short: "Masking" },
    { n: "04", t: "Transforms",      href: "4-transform.html",   short: "Transforms" },
    { n: "05", t: "Quantisation",    href: "5-quantize.html",    short: "Quantising" },
    { n: "06", t: "Entropy coding",  href: "6-entropy.html",     short: "Entropy" },
    { n: "07", t: "MP3",             href: "7-mp3.html",         short: "MP3" },
    { n: "08", t: "AAC",             href: "8-aac.html",         short: "AAC" },
    { n: "09", t: "Opus",            href: "9-opus.html",        short: "Opus" },
    { n: "10", t: "Lossless",        href: "10-lossless.html",   short: "Lossless" },
    { n: "11", t: "Artefacts",       href: "11-artifacts.html",  short: "Artefacts" },
    { n: "12", t: "Choosing",        href: "12-choosing.html",   short: "Choosing" },
    { n: "13", t: "Lexicon",         href: "lexicon.html",       short: "Lexicon" },
  ];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------------------------------------------------------- chrome
  var cur = document.body.getAttribute("data-chapter");
  var mount = document.getElementById("topbar");
  if (mount) {
    var mark =
      '<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M1.5 12h3l2-7 3 15 3-19 3 21 2.5-10h5" stroke="var(--signal)" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    mount.outerHTML =
      '<header class="topbar"><div class="topbar-inner">' +
      '<a class="brand" href="index.html">' + mark +
      '<span class="brand-name">LOSS<span>·</span>Y</span></a>' +
      '<nav class="chapnav" aria-label="Chapters">' +
      CH.map(function (c) {
        return '<a href="' + c.href + '"' + (c.n === cur ? ' class="active" aria-current="page"' : "") +
          '><span class="n">' + c.n + "</span> " + c.t + "</a>";
      }).join("") +
      "</nav></div></header>";
  }

  $$("[data-pager]").forEach(function (el) {
    var i = CH.findIndex(function (c) { return c.n === cur; });
    var prev = CH[i - 1], next = CH[i + 1];
    el.innerHTML =
      (prev ? '<a href="' + prev.href + '"><div class="d">← Prev · ' + prev.n + '</div><div class="t">' + prev.t + "</div></a>"
            : '<a class="disabled"><div class="d">← Prev</div><div class="t">—</div></a>') +
      (next ? '<a class="next" href="' + next.href + '"><div class="d">Next · ' + next.n + ' →</div><div class="t">' + next.t + "</div></a>"
            : '<a class="next disabled"><div class="d">Next →</div><div class="t">—</div></a>');
  });

  // scrollspy for the section rail
  var rails = $$('.rail a[href^="#"]');
  if (rails.length && "IntersectionObserver" in window) {
    var map = {};
    rails.forEach(function (a) {
      var id = a.getAttribute("href").slice(1), s = document.getElementById(id);
      if (s) map[id] = a;
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        rails.forEach(function (a) { a.classList.remove("active"); });
        var a = map[e.target.id];
        if (a) a.classList.add("active");
      });
    }, { rootMargin: "-18% 0px -68% 0px" });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  // ---------------------------------------------------------- small helpers
  function chips(el, fn) {
    if (!el) return function () {};
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || !el.contains(b)) return;
      $$("button", el).forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      fn(b.dataset.v !== undefined ? b.dataset.v : b.textContent.trim(), b);
    });
    return function (v) {
      $$("button", el).forEach(function (x) { x.classList.toggle("on", x.dataset.v === String(v)); });
    };
  }

  // Wire a range input to a callback; if a .val element is named by
  // data-out="id", keep it updated through `format`.
  function slider(el, fn, format) {
    if (!el) return function () {};
    var out = el.dataset.out ? document.getElementById(el.dataset.out) : null;
    var push = function () {
      var v = parseFloat(el.value);
      if (out) out.textContent = format ? format(v) : String(v);
      fn(v);
    };
    el.addEventListener("input", push);
    push();
    return function (v) { el.value = v; push(); };
  }

  var fmt = {
    // 12345 -> "12.3 k"; used for bitrates and bit counts
    si: function (v, digits) {
      var a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(digits == null ? 2 : digits) + " G";
      if (a >= 1e6) return (v / 1e6).toFixed(digits == null ? 2 : digits) + " M";
      if (a >= 1e3) return (v / 1e3).toFixed(digits == null ? 1 : digits) + " k";
      return v.toFixed(digits == null ? 0 : digits) + " ";
    },
    hz: function (f) {
      if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.0+$/, "") + " kHz";
      return Math.round(f) + " Hz";
    },
    db: function (v, d) { return (v >= 0 ? "+" : "") + v.toFixed(d == null ? 1 : d) + " dB"; },
    ms: function (v, d) { return v.toFixed(d == null ? 1 : d) + " ms"; },
    pct: function (v, d) { return (v * 100).toFixed(d == null ? 0 : d) + "%"; },
    bytes: function (v) {
      if (v >= 1048576) return (v / 1048576).toFixed(2) + " MB";
      if (v >= 1024) return (v / 1024).toFixed(1) + " kB";
      return v + " B";
    },
    int: function (v) { return Math.round(v).toLocaleString("en-GB"); },
  };

  // ---------------------------------------------------------- Plot
  // A deliberately small canvas chart. It owns device-pixel scaling and the
  // data->pixel mapping; everything else the caller draws itself.
  var CSS = getComputedStyle(document.documentElement);
  function v(name, fallback) {
    var s = CSS.getPropertyValue(name).trim();
    return s || fallback;
  }
  var C = {
    text: v("--text", "#E8EEF7"), soft: v("--text-soft", "#AAB9CC"),
    faint: v("--text-faint", "#6F8095"), ghost: v("--text-ghost", "#47566A"),
    line: v("--line", "rgba(128,166,208,.17)"), grid: "rgba(128,166,208,.10)",
    plate: v("--plate", "#070B12"),
    blue: v("--blue", "#58C4DD"), teal: v("--teal", "#5CD0B3"), green: v("--green", "#83C167"),
    yellow: v("--yellow", "#F4D35E"), gold: v("--gold", "#EFA847"), orange: v("--orange", "#E8743B"),
    red: v("--red", "#FC6255"), maroon: v("--maroon", "#C55F73"),
    purple: v("--purple", "#A78BD0"), pink: v("--pink", "#E879B8"),
  };

  function Plot(canvas, o) {
    o = o || {};
    this.cv = typeof canvas === "string" ? document.getElementById(canvas) : canvas;
    this.ctx = this.cv.getContext("2d");
    this.aspect = o.aspect || 2.4;
    this.pad = Object.assign({ l: 52, r: 14, t: 14, b: 34 }, o.pad || {});
    this.xmin = o.xmin == null ? 0 : o.xmin;
    this.xmax = o.xmax == null ? 1 : o.xmax;
    this.ymin = o.ymin == null ? 0 : o.ymin;
    this.ymax = o.ymax == null ? 1 : o.ymax;
    this.xlog = !!o.xlog;
    this.ylog = !!o.ylog;
    this.xlabel = o.xlabel || "";
    this.ylabel = o.ylabel || "";
    this.mono = '11px ' + v("--font-mono", "monospace");
    this.resize();
  }
  Plot.C = C;
  Plot.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.cv.clientWidth || this.cv.parentNode.clientWidth || 640;
    var h = Math.round(w / this.aspect);
    this.cv.style.height = h + "px";
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // phones get tighter gutters so the plot area stays usable
    if (w < 420) { this.pad.l = Math.min(this.pad.l, 40); this.pad.r = Math.min(this.pad.r, 10); }
    return this;
  };
  Plot.prototype.range = function (xmin, xmax, ymin, ymax) {
    if (xmin != null) this.xmin = xmin;
    if (xmax != null) this.xmax = xmax;
    if (ymin != null) this.ymin = ymin;
    if (ymax != null) this.ymax = ymax;
    return this;
  };
  Plot.prototype.X = function (x) {
    var a = this.xlog ? Math.log10(Math.max(x, 1e-9)) : x;
    var lo = this.xlog ? Math.log10(Math.max(this.xmin, 1e-9)) : this.xmin;
    var hi = this.xlog ? Math.log10(Math.max(this.xmax, 1e-9)) : this.xmax;
    return this.pad.l + (a - lo) / (hi - lo) * (this.w - this.pad.l - this.pad.r);
  };
  Plot.prototype.Y = function (y) {
    var a = this.ylog ? Math.log10(Math.max(y, 1e-12)) : y;
    var lo = this.ylog ? Math.log10(Math.max(this.ymin, 1e-12)) : this.ymin;
    var hi = this.ylog ? Math.log10(Math.max(this.ymax, 1e-12)) : this.ymax;
    return this.h - this.pad.b - (a - lo) / (hi - lo) * (this.h - this.pad.t - this.pad.b);
  };
  // px -> data, for pointer interaction
  Plot.prototype.invX = function (px) {
    var f = (px - this.pad.l) / (this.w - this.pad.l - this.pad.r);
    if (!this.xlog) return this.xmin + f * (this.xmax - this.xmin);
    var lo = Math.log10(Math.max(this.xmin, 1e-9)), hi = Math.log10(Math.max(this.xmax, 1e-9));
    return Math.pow(10, lo + f * (hi - lo));
  };
  Plot.prototype.invY = function (py) {
    var f = (this.h - this.pad.b - py) / (this.h - this.pad.t - this.pad.b);
    return this.ymin + f * (this.ymax - this.ymin);
  };
  Plot.prototype.clear = function (bg) {
    var c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (bg !== false) { c.fillStyle = bg || C.plate; c.fillRect(0, 0, this.w, this.h); }
    return this;
  };
  Plot.prototype.clip = function (on) {
    var c = this.ctx;
    if (on === false) { c.restore(); return this; }
    c.save();
    c.beginPath();
    c.rect(this.pad.l, this.pad.t, this.w - this.pad.l - this.pad.r, this.h - this.pad.t - this.pad.b);
    c.clip();
    return this;
  };
  // axes({x:[...ticks], y:[...], xfmt, yfmt, grid:true})
  Plot.prototype.axes = function (o) {
    o = o || {};
    var c = this.ctx, i, t, px, py;
    var xs = o.x || ticks(this.xmin, this.xmax, this.w < 460 ? 4 : 7, this.xlog);
    var ys = o.y || ticks(this.ymin, this.ymax, 5, false);
    var xf = o.xfmt || function (n) { return shortNum(n); };
    var yf = o.yfmt || function (n) { return shortNum(n); };
    c.font = this.mono; c.lineWidth = 1;
    if (o.grid !== false) {
      c.strokeStyle = C.grid; c.beginPath();
      for (i = 0; i < xs.length; i++) { px = Math.round(this.X(xs[i])) + .5; c.moveTo(px, this.pad.t); c.lineTo(px, this.h - this.pad.b); }
      for (i = 0; i < ys.length; i++) { py = Math.round(this.Y(ys[i])) + .5; c.moveTo(this.pad.l, py); c.lineTo(this.w - this.pad.r, py); }
      c.stroke();
    }
    c.strokeStyle = C.line; c.beginPath();
    c.moveTo(this.pad.l + .5, this.pad.t); c.lineTo(this.pad.l + .5, this.h - this.pad.b + .5);
    c.lineTo(this.w - this.pad.r, this.h - this.pad.b + .5); c.stroke();
    c.fillStyle = C.ghost; c.textAlign = "center"; c.textBaseline = "top";
    for (i = 0; i < xs.length; i++) {
      t = xf(xs[i]); if (t === "" || t == null) continue;
      c.fillText(t, this.X(xs[i]), this.h - this.pad.b + 7);
    }
    c.textAlign = "right"; c.textBaseline = "middle";
    for (i = 0; i < ys.length; i++) {
      t = yf(ys[i]); if (t === "" || t == null) continue;
      c.fillText(t, this.pad.l - 7, this.Y(ys[i]));
    }
    if (this.xlabel) {
      c.textAlign = "right"; c.textBaseline = "bottom";
      c.fillStyle = C.faint; c.fillText(this.xlabel, this.w - this.pad.r, this.h - 2);
    }
    if (this.ylabel) {
      c.save(); c.translate(11, this.pad.t + 2); c.rotate(-Math.PI / 2);
      c.textAlign = "right"; c.textBaseline = "top"; c.fillStyle = C.faint;
      c.fillText(this.ylabel, 0, 0); c.restore();
    }
    return this;
  };
  // pts: [[x,y],...] or a flat Y array with an x(i) mapper
  Plot.prototype.line = function (pts, o) {
    o = o || {};
    var c = this.ctx, i, p, first = true;
    c.save();
    c.beginPath();
    c.rect(this.pad.l - 1, this.pad.t - 1, this.w - this.pad.l - this.pad.r + 2, this.h - this.pad.t - this.pad.b + 2);
    c.clip();
    c.strokeStyle = o.color || C.blue;
    c.lineWidth = o.width || 2;
    c.lineJoin = "round"; c.lineCap = "round";
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.dash) c.setLineDash(o.dash);
    c.beginPath();
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      if (p == null || p[1] == null || !isFinite(p[1])) { first = true; continue; }
      var X = this.X(p[0]), Y = this.Y(p[1]);
      if (first) { c.moveTo(X, Y); first = false; } else { c.lineTo(X, Y); }
    }
    c.stroke();
    if (o.fill) {
      c.lineTo(this.X(pts[pts.length - 1][0]), this.Y(o.fillTo == null ? this.ymin : o.fillTo));
      c.lineTo(this.X(pts[0][0]), this.Y(o.fillTo == null ? this.ymin : o.fillTo));
      c.closePath();
      c.globalAlpha = o.fillAlpha == null ? .14 : o.fillAlpha;
      c.fillStyle = o.fill === true ? (o.color || C.blue) : o.fill;
      c.fill();
    }
    c.restore();
    return this;
  };
  // Draw y = f(x) sampled across the visible x range.
  Plot.prototype.fn = function (f, o) {
    o = o || {};
    var n = o.steps || Math.max(80, Math.round(this.w));
    var pts = [], i, x;
    for (i = 0; i <= n; i++) {
      x = this.invX(this.pad.l + i / n * (this.w - this.pad.l - this.pad.r));
      pts.push([x, f(x)]);
    }
    return this.line(pts, o);
  };
  // bars: array of {x0,x1,y} or values with equal width
  Plot.prototype.bars = function (items, o) {
    o = o || {};
    var c = this.ctx, i, b, x0, x1, y0, y1;
    c.save(); this.clip();
    for (i = 0; i < items.length; i++) {
      b = items[i];
      x0 = this.X(b.x0); x1 = this.X(b.x1);
      y0 = this.Y(o.base == null ? this.ymin : o.base); y1 = this.Y(b.y);
      c.fillStyle = b.color || o.color || C.blue;
      c.globalAlpha = b.alpha == null ? (o.alpha == null ? .85 : o.alpha) : b.alpha;
      c.fillRect(x0 + (o.gap || .5), Math.min(y0, y1), Math.max(x1 - x0 - 2 * (o.gap || .5), .7), Math.abs(y1 - y0));
    }
    c.restore(); c.restore();
    return this;
  };
  Plot.prototype.vline = function (x, o) {
    o = o || {};
    var c = this.ctx, px = Math.round(this.X(x)) + .5;
    c.save();
    c.strokeStyle = o.color || C.gold; c.lineWidth = o.width || 1.2;
    if (o.dash !== false) c.setLineDash(o.dash || [4, 4]);
    c.beginPath(); c.moveTo(px, this.pad.t); c.lineTo(px, this.h - this.pad.b); c.stroke();
    if (o.label) {
      c.setLineDash([]);
      c.font = this.mono; c.fillStyle = o.color || C.gold;
      c.textAlign = px > this.w - 70 ? "right" : "left"; c.textBaseline = "top";
      c.fillText(o.label, px + (px > this.w - 70 ? -5 : 5), this.pad.t + (o.labelY || 3));
    }
    c.restore();
    return this;
  };
  Plot.prototype.hline = function (y, o) {
    o = o || {};
    var c = this.ctx, py = Math.round(this.Y(y)) + .5;
    c.save();
    c.strokeStyle = o.color || C.faint; c.lineWidth = o.width || 1.2;
    if (o.dash !== false) c.setLineDash(o.dash || [4, 4]);
    c.beginPath(); c.moveTo(this.pad.l, py); c.lineTo(this.w - this.pad.r, py); c.stroke();
    if (o.label) {
      c.setLineDash([]); c.font = this.mono; c.fillStyle = o.color || C.faint;
      c.textAlign = "right"; c.textBaseline = "bottom";
      c.fillText(o.label, this.w - this.pad.r - 3, py - 3);
    }
    c.restore();
    return this;
  };
  Plot.prototype.dot = function (x, y, o) {
    o = o || {};
    var c = this.ctx;
    c.save();
    c.fillStyle = o.color || C.gold;
    c.beginPath(); c.arc(this.X(x), this.Y(y), o.r || 3.4, 0, 6.2832); c.fill();
    if (o.ring) { c.strokeStyle = o.color || C.gold; c.globalAlpha = .4; c.lineWidth = 1.4;
      c.beginPath(); c.arc(this.X(x), this.Y(y), (o.r || 3.4) + 4, 0, 6.2832); c.stroke(); }
    c.restore();
    return this;
  };
  Plot.prototype.stems = function (pts, o) {
    o = o || {};
    var c = this.ctx, i, base = this.Y(o.base == null ? 0 : o.base);
    c.save(); this.clip();
    c.strokeStyle = o.color || C.teal; c.lineWidth = o.width || 1.4;
    for (i = 0; i < pts.length; i++) {
      var X = this.X(pts[i][0]), Y = this.Y(pts[i][1]);
      c.beginPath(); c.moveTo(X, base); c.lineTo(X, Y); c.stroke();
      if (o.dots !== false) { c.fillStyle = o.color || C.teal; c.beginPath(); c.arc(X, Y, o.r || 2.6, 0, 6.2832); c.fill(); }
    }
    c.restore(); c.restore();
    return this;
  };
  // text in DATA coordinates
  Plot.prototype.label = function (x, y, s, o) {
    o = o || {};
    var c = this.ctx;
    c.save();
    c.font = o.font || this.mono;
    c.fillStyle = o.color || C.soft;
    c.textAlign = o.align || "left"; c.textBaseline = o.baseline || "bottom";
    c.fillText(s, this.X(x) + (o.dx || 0), this.Y(y) + (o.dy || 0));
    c.restore();
    return this;
  };
  // text in PIXEL coordinates (corner annotations)
  Plot.prototype.note = function (px, py, s, o) {
    o = o || {};
    var c = this.ctx;
    c.save();
    c.font = o.font || this.mono;
    c.fillStyle = o.color || C.faint;
    c.textAlign = o.align || "left"; c.textBaseline = o.baseline || "top";
    c.fillText(s, px, py);
    c.restore();
    return this;
  };
  Plot.prototype.band = function (x0, x1, o) {
    o = o || {};
    var c = this.ctx;
    c.save();
    c.fillStyle = o.color || C.blue;
    c.globalAlpha = o.alpha == null ? .10 : o.alpha;
    c.fillRect(this.X(x0), this.pad.t, this.X(x1) - this.X(x0), this.h - this.pad.t - this.pad.b);
    c.restore();
    return this;
  };

  function shortNum(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a % 1e6 ? 1 : 0) + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a % 1e3 ? 1 : 0) + "k";
    if (a === 0) return "0";
    if (a < .01) return n.toExponential(0);
    if (a < 1) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return String(Math.round(n * 100) / 100);
  }
  function ticks(lo, hi, n, log) {
    var out = [], i;
    if (log) {
      var a = Math.ceil(Math.log10(Math.max(lo, 1e-9))), b = Math.floor(Math.log10(Math.max(hi, 1e-9)));
      for (i = a; i <= b; i++) {
        out.push(Math.pow(10, i));
        if (b - a <= 3) { out.push(2 * Math.pow(10, i)); out.push(5 * Math.pow(10, i)); }
      }
      return out.filter(function (x) { return x >= lo && x <= hi; }).sort(function (p, q) { return p - q; });
    }
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step;
    if (err >= 5) step *= 10; else if (err >= 2.5) step *= 5; else if (err >= 1.2) step *= 2;
    for (i = Math.ceil(lo / step); i * step <= hi + 1e-9; i++) out.push(+(i * step).toPrecision(12));
    return out;
  }

  // Redraw on resize; draw once when first scrolled into view.
  function autoDraw(plot, draw) {
    var pending = false;
    var go = function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; plot.resize(); draw(); });
    };
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(go);
      ro.observe(plot.cv.parentNode || plot.cv);
    } else {
      window.addEventListener("resize", go);
    }
    go();
    return go;
  }

  // An animation loop that only runs while its element is on screen — a dozen
  // live figures per page would otherwise keep a phone's fan on.
  function raf(el, step) {
    var running = false, id = 0, t0 = 0, want = true;
    function frame(t) {
      if (!running) return;
      if (!t0) t0 = t;
      step((t - t0) / 1000, t / 1000);
      id = requestAnimationFrame(frame);
    }
    var api = {
      start: function () { want = true; api._sync(); return api; },
      stop: function () { want = false; api._sync(); return api; },
      toggle: function () { want = !want; api._sync(); return api.running(); },
      running: function () { return running; },
      _visible: true,
      _sync: function () {
        var should = want && api._visible;
        if (should === running) return;
        running = should;
        if (running) { t0 = 0; id = requestAnimationFrame(frame); } else { cancelAnimationFrame(id); }
      },
    };
    if (el && "IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        api._visible = es[0].isIntersecting;
        api._sync();
      }, { rootMargin: "120px" }).observe(el);
    }
    return api;
  }

  window.AC = {
    CH: CH, $: $, $$: $$, chips: chips, slider: slider, fmt: fmt,
    Plot: Plot, C: C, autoDraw: autoDraw, raf: raf, ticks: ticks, shortNum: shortNum,
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
  };
})();
