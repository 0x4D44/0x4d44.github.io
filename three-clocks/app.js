// ============================================================
// Three Clocks — router, views, and the cone renderer.
//
// Vanilla, no framework, no build step. content.js carries the prose,
// model.js computes the futures, and this file knows how to draw both.
//
// Routes are hash paths so the whole thing is one static file set:
//   #/            the argument in brief
//   #/method      how to forecast something like this
//   #/ai          #/climate  #/peace     the three clocks
//   #/coupling    the interaction matrix
//   #/cone        the interactive model
//   #/scenarios   #/estimate  #/watch  #/objections  #/sources
//
// The cone page is the only stateful view. Its driver settings persist
// to localStorage, so a reader who moves the sliders, follows a link and
// comes back finds their own assumptions rather than the author's.
// ============================================================
(function () {
  "use strict";

  var TC = window.TC || {};
  var M = window.TC_MODEL;
  var main = document.getElementById("main");
  var nav = document.getElementById("nav");
  var STORE = "0x4d44.threeclocks.v1";

  // ============================================================
  // Helpers
  // ============================================================

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Minimal inline formatting for the prose in content.js: **bold**,
  // *italic*. Escapes first, so the source strings cannot inject markup.
  function md(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function n1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function n2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function pct(x) { return Math.round(x * 100) + "%"; }

  // Thousands separators without Intl, which is overkill here and
  // formats differently across the locales this page will be read in.
  function group(x) {
    var s = Math.round(x).toString(), out = "", c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s[i] + out;
      if (++c % 3 === 0 && i > 0) out = "," + out;
    }
    return out;
  }

  // Big numbers in words, because "240,000,000" and "240 million" are
  // read at very different speeds and this page asks a lot of the reader.
  function big(x) {
    if (x >= 1e9) return n1(x / 1e9) + " billion";
    if (x >= 1e6) return n1(x / 1e6) + " million";
    if (x >= 1e3) return group(x);
    return String(Math.round(x));
  }

  function store(fallback) {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(v) {
    try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* private mode */ }
  }

  function icon(id, cls) {
    return '<svg class="' + (cls || "card-ico") + '" viewBox="0 0 120 120" aria-hidden="true">' +
      '<use href="#' + id + '"/></svg>';
  }

  var DOMAIN_LABEL = { ai: "AI", climate: "Climate", peace: "Peace", all: "All three" };

  // ============================================================
  // The model run, cached
  // ------------------------------------------------------------
  // The model takes a few hundred milliseconds, which is fine once and
  // not fine on every frame of a slider drag. Every view that needs
  // numbers asks for them here; the cache is invalidated when a driver
  // changes, and the cone page debounces its re-runs.
  // ============================================================

  var cache = { key: null, result: null };

  function driversKey(d) {
    return [d.scaling, d.diffusion, d.policy, d.removal, d.armsControl, d.rivalry, d.coupling]
      .join("|");
  }

  function results(drivers, runs) {
    var d = drivers || currentDrivers();
    var key = driversKey(d) + "@" + (runs || 500);
    if (cache.key === key) return cache.result;
    cache.key = key;
    cache.result = M.run(d, { runs: runs || 500 });
    return cache.result;
  }

  function currentDrivers() {
    var saved = store(null);
    var d = {};
    for (var k in M.DEFAULTS) d[k] = M.DEFAULTS[k];
    if (saved) for (k in saved) if (k in d) d[k] = saved[k];
    return d;
  }

  function at(series, year) { return series[year - 2026]; }

  // ============================================================
  // Block renderer
  // ------------------------------------------------------------
  // content.js is a list of typed blocks. This turns them into markup
  // and knows nothing about what any of them say.
  // ============================================================

  function blocks(list) {
    return list.map(function (b) {
      if (b.lede) return '<p class="lede">' + md(b.lede) + "</p>";
      if (b.h) return "<h2>" + esc(b.h) + "</h2>";
      if (b.p) return "<p>" + md(b.p) + "</p>";
      if (b.pull) return '<blockquote class="pull">' + md(b.pull) + "</blockquote>";
      if (b.note) return '<div class="note-box">' + md(b.note) + "</div>";
      if (b.list) return "<ul class=\"blist\">" + b.list.map(function (i) {
        return "<li>" + md(i) + "</li>";
      }).join("") + "</ul>";
      if (b.stats) return statRow(b.stats);
      if (b.tiles) return tileGrid(b.tiles);
      if (b.defs) return defList(b.defs);
      if (b.table) return table(b.table);
      if (b.axis) return axisStrip();
      if (b.fig) return figure(b.fig);
      if (b.forecasts) return forecastTable();
      return "";
    }).join("");
  }

  function statRow(items) {
    return '<div class="stat-row">' + items.map(function (s) {
      return '<div class="stat"><span class="n">' + esc(s.n) + '</span>' +
        '<span class="l">' + md(s.l) + "</span></div>";
    }).join("") + "</div>";
  }

  function tileGrid(items) {
    return '<div class="tiles">' + items.map(function (t) {
      return '<div class="tile"><h3>' + md(t.h) + "</h3><p>" + md(t.p) + "</p></div>";
    }).join("") + "</div>";
  }

  function defList(items) {
    return '<dl class="deflist">' + items.map(function (d) {
      return '<div class="def"><dt>' + md(d.t) + "</dt><dd>" + md(d.d) + "</dd></div>";
    }).join("") + "</dl>";
  }

  function table(t) {
    var head = "<tr>" + t.cols.map(function (c) {
      return "<th>" + md(c) + "</th>";
    }).join("") + "</tr>";
    var body = t.rows.map(function (r) {
      return "<tr>" + r.map(function (cell, i) {
        return i === 0 ? "<th scope=\"row\">" + md(cell) + "</th>" : "<td>" + md(cell) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    // The scroll container is on a wrapper, not the table, so a wide
    // matrix scrolls in its own box rather than widening the document.
    return '<div class="twrap"><table class="matrix"><thead>' + head +
      "</thead><tbody>" + body + "</tbody></table></div>";
  }

  // ============================================================
  // The three-axis strip
  // ============================================================

  function axisStrip() {
    var A = TC.axes;
    var head = '<div class="ax-head"><span></span>' + A.cols.map(function (c) {
      return "<span>" + esc(c) + "</span>";
    }).join("") + "</div>";
    var rows = A.rows.map(function (r) {
      return '<div class="ax-row acc-' + r.k + '">' +
        '<div class="ax-name">' + icon("c-" + r.k, "ax-ico") + "<b>" + esc(r.name) + "</b></div>" +
        r.vals.map(function (v) {
          return '<div class="ax-cell">' +
            '<div class="ax-v">' + md(v.v) + "</div>" +
            '<div class="ax-bar"><i style="width:' + v.w + '%"></i></div>' +
            '<div class="ax-d">' + md(v.d) + "</div></div>";
        }).join("") + "</div>";
    }).join("");
    return '<div class="axis-strip">' + head + rows +
      '<p class="faint ax-foot">Bar length is a rough ordinal reading of each axis, not a measurement. ' +
      'The point is the pattern: no row is high or low on all three, and the rankings disagree.</p></div>';
  }

  // ============================================================
  // Computed figures embedded in the prose
  // ============================================================

  function figure(id) {
    if (id === "climate-policy-ladder") return policyLadder();
    return "";
  }

  // Warming in 2100 across the full range of the decarbonisation driver,
  // computed live. Small run count: this is a shape, not a headline.
  function policyLadder() {
    var steps = [
      { v: 0.00, l: "Decarbonisation abandoned" },
      { v: 0.25, l: "Slower than today" },
      { v: 0.50, l: "Today's implemented policy" },
      { v: 0.75, l: "Pledges substantially met" },
      { v: 1.00, l: "Emergency footing" },
    ];
    var d = currentDrivers(), rows = [];
    var maxT = 0;
    steps.forEach(function (s) {
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.policy = s.v;
      var r = M.run(dd, { runs: 240, seed: 5150 });
      var t = at(r.climate.temp.p50, 2100);
      var lo = at(r.climate.temp.p05, 2100), hi = at(r.climate.temp.p95, 2100);
      maxT = Math.max(maxT, hi);
      rows.push({ l: s.l, t: t, lo: lo, hi: hi });
    });
    var body = rows.map(function (r) {
      var w = (r.t / maxT) * 100;
      return '<div class="lad-row">' +
        '<div class="lad-l">' + esc(r.l) + "</div>" +
        '<div class="lad-track"><i style="width:' + w.toFixed(1) + '%"></i>' +
        '<span class="lad-rng">' + n1(r.lo) + "–" + n1(r.hi) + "</span></div>" +
        '<div class="lad-v">' + n1(r.t) + "°C</div></div>";
    }).join("");
    return '<figure class="fig"><div class="ladder">' + body + "</div>" +
      '<figcaption>Median warming in 2100 by decarbonisation effort, with the 5th–95th percentile ' +
      'range. Computed live from the model at 240 sampled worlds per rung. Note how little of the ' +
      'total span the policy driver controls compared with the width of each individual band: ' +
      'physical uncertainty is comparable to the entire range of political outcomes.</figcaption></figure>';
  }

  // ============================================================
  // The cone chart
  // ------------------------------------------------------------
  // SVG rather than canvas: it scales without a resize handler, prints,
  // and can carry a text alternative. A viewBox with width:100% means it
  // can never widen the document, which the repo's responsive test
  // checks for every page.
  // ============================================================

  var W = 900, H = 430, PAD = { l: 62, r: 20, t: 18, b: 46 };

  function makeScale(lo, hi, log) {
    var a = log ? Math.log10(Math.max(lo, 1e-6)) : lo;
    var b = log ? Math.log10(Math.max(hi, 1e-6)) : hi;
    return function (v) {
      var x = log ? Math.log10(Math.max(v, 1e-6)) : v;
      var t = (x - a) / (b - a || 1);
      return H - PAD.b - t * (H - PAD.t - PAD.b);
    };
  }

  function xScale(years) {
    var y0 = years[0], y1 = years[years.length - 1];
    return function (y) {
      return PAD.l + ((y - y0) / (y1 - y0)) * (W - PAD.l - PAD.r);
    };
  }

  // A closed polygon between two percentile series: down the upper, back
  // along the lower.
  function bandPath(years, hi, lo, X, Y) {
    var up = years.map(function (y, i) {
      return (i ? "L" : "M") + X(y).toFixed(1) + " " + Y(hi[i]).toFixed(1);
    }).join(" ");
    var down = [];
    for (var i = years.length - 1; i >= 0; i--) {
      down.push("L" + X(years[i]).toFixed(1) + " " + Y(lo[i]).toFixed(1));
    }
    return up + " " + down.join(" ") + " Z";
  }

  function linePath(years, s, X, Y) {
    return years.map(function (y, i) {
      return (i ? "L" : "M") + X(y).toFixed(1) + " " + Y(s[i]).toFixed(1);
    }).join(" ");
  }

  function coneSvg(spec) {
    var years = spec.years, b = spec.bands, log = !!spec.log;
    var X = xScale(years), Y = makeScale(spec.lo, spec.hi, log);
    var s = "";

    // horizontal gridlines and their labels
    spec.ticks.forEach(function (t) {
      var y = Y(t.v).toFixed(1);
      s += '<line class="grid" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="tick" x="' + (PAD.l - 9) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle">' +
        esc(t.l) + "</text>";
    });

    // decade markers
    for (var yr = 2030; yr <= 2100; yr += 10) {
      var x = X(yr).toFixed(1);
      s += '<line class="grid vgrid" x1="' + x + '" x2="' + x + '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>';
      s += '<text class="tick" x="' + x + '" y="' + (H - PAD.b + 20) + '" text-anchor="middle">' + yr + "</text>";
    }

    // reference lines: thresholds worth naming
    (spec.refs || []).forEach(function (r) {
      var y = Y(r.v).toFixed(1);
      s += '<line class="ref" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="reflab" x="' + (W - PAD.r - 6) + '" y="' + (y - 6) + '" text-anchor="end">' +
        esc(r.l) + "</text>";
    });

    // the cone itself: 90% band, then 50% band, then the median
    s += '<path class="band outer" d="' + bandPath(years, b.p95, b.p05, X, Y) + '"/>';
    s += '<path class="band inner" d="' + bandPath(years, b.p75, b.p25, X, Y) + '"/>';
    s += '<path class="median" d="' + linePath(years, b.p50, X, Y) + '"/>';

    // the scrub line and its percentile ticks
    var sx = X(spec.scrub).toFixed(1);
    var i = spec.scrub - years[0];
    s += '<line class="scrub" x1="' + sx + '" x2="' + sx + '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>';
    ["p05", "p25", "p75", "p95"].forEach(function (k) {
      s += '<circle class="knot" cx="' + sx + '" cy="' + Y(b[k][i]).toFixed(1) + '" r="3"/>';
    });
    s += '<circle class="knot mid" cx="' + sx + '" cy="' + Y(b.p50[i]).toFixed(1) + '" r="5.5"/>';

    // axes
    s += '<line class="axis" x1="' + PAD.l + '" x2="' + PAD.l + '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>';
    s += '<line class="axis" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + (H - PAD.b) + '" y2="' + (H - PAD.b) + '"/>';
    s += '<text class="axlab" x="' + PAD.l + '" y="' + (PAD.t - 4) + '">' + esc(spec.unit) + "</text>";

    return '<svg class="cone acc-' + spec.domain + '" viewBox="0 0 ' + W + " " + H +
      '" role="img" aria-label="' + esc(spec.alt) + '" preserveAspectRatio="xMidYMid meet">' +
      s + "</svg>";
  }

  // ============================================================
  // Cone page
  // ============================================================

  var coneState = { domain: "climate", scrub: 2050, drivers: null, runs: 500 };

  var DOMAIN_SPEC = {
    climate: {
      unit: "°C above 1850–1900",
      lo: 1.0, hi: 4.6, log: false,
      ticks: [{ v: 1.5, l: "1.5" }, { v: 2.0, l: "2.0" }, { v: 2.5, l: "2.5" },
              { v: 3.0, l: "3.0" }, { v: 3.5, l: "3.5" }, { v: 4.0, l: "4.0" }],
      refs: [{ v: 1.5, l: "Paris lower goal" }, { v: 2.0, l: "Paris upper goal" }],
      pick: function (r) { return r.climate.temp; },
      fmt: function (v) { return n2(v) + "°C"; },
      alt: "Cone of projected global mean temperature to 2100, showing the median and the middle 50 and 90 per cent of sampled futures.",
      blurb: "Warming above the 1850–1900 baseline. The cone narrows relative to the others because the physics is the constrained part: what remains uncertain is emissions and the climate's sensitivity to them, and both are bounded.",
    },
    ai: {
      unit: "% of work hours performed without a human",
      lo: 0, hi: 88, log: false,
      ticks: [{ v: 0, l: "0" }, { v: 20, l: "20%" }, { v: 40, l: "40%" },
              { v: 60, l: "60%" }, { v: 80, l: "80%" }],
      refs: [{ v: 25, l: "a quarter of all work" }],
      pick: function (r) { return r.ai.auto; },
      fmt: function (v) { return n1(v) + "%"; },
      alt: "Cone of projected share of employment-weighted work hours performed without direct human involvement, to 2100.",
      blurb: "Employment-weighted work hours performed without direct human involvement — deployed automation, not demonstrated capability. This is by far the widest cone on the site, and the width is the disagreement in the field rather than a defect of the model.",
    },
    peace: {
      unit: "battle deaths per 100,000 people per year",
      lo: 0.05, hi: 300, log: true,
      ticks: [{ v: 0.1, l: "0.1" }, { v: 1, l: "1" }, { v: 10, l: "10" },
              { v: 100, l: "100" }],
      // 2025 battle deaths, ~150,000, over ~8.2bn people. NOT the widely
      // quoted 244,600, which is all organised violence — a broader
      // category than this cone plots, and drawing that line here would
      // put the observed marker about 60% too high.
      refs: [{ v: 1.83, l: "2025 observed" }, { v: 100, l: "Second World War" }],
      pick: function (r) { return r.peace.per100k; },
      fmt: function (v) { return n2(v) + " /100k"; },
      alt: "Cone of projected battle deaths per hundred thousand people per year to 2100, on a logarithmic scale.",
      blurb: "Deaths in state-based armed conflict, per hundred thousand people, on a logarithmic axis — a linear one shows a single spike and nothing else. Nuclear use is deliberately excluded and reported separately below: it is a different kind of object.",
    },
  };

  function views_cone() {
    var C = TC.cone;
    var d = coneState.drivers || (coneState.drivers = currentDrivers());
    var r = results(d, coneState.runs);
    var spec = DOMAIN_SPEC[coneState.domain];
    var bandsFor = spec.pick(r);

    var tabs = ["climate", "ai", "peace"].map(function (k) {
      return '<button type="button" class="dtab acc-' + k + '" data-domain="' + k + '"' +
        ' aria-pressed="' + (k === coneState.domain) + '">' +
        icon("c-" + k, "dtab-ico") + DOMAIN_LABEL[k] + "</button>";
    }).join("");

    var svg = coneSvg({
      years: r.years, bands: bandsFor, domain: coneState.domain,
      lo: spec.lo, hi: spec.hi, log: spec.log, ticks: spec.ticks, refs: spec.refs,
      unit: spec.unit, alt: spec.alt, scrub: coneState.scrub,
    });

    return '<section class="section wrap">' +
      '<div class="eyebrow">The model</div>' +
      "<h1>" + esc(C.title) + "</h1>" +
      '<p class="lede">' + md(C.sub) + "</p>" +
      "<p>" + md(C.intro) + "</p>" +

      '<div class="cone-tabs seg">' + tabs + "</div>" +
      '<p class="cone-blurb acc-' + coneState.domain + '">' + md(spec.blurb) + "</p>" +

      '<div class="cone-wrap" id="coneWrap">' + svg + "</div>" +

      '<div class="scrub-row">' +
      '<label class="scrub-lab" for="scrubYear">Year <b>' + coneState.scrub + "</b></label>" +
      '<input id="scrubYear" type="range" min="2026" max="2100" step="1" value="' +
      coneState.scrub + '" aria-label="Year to read the distribution at">' +
      "</div>" +

      readout(r, spec, bandsFor) +
      hazards(r) +
      driverPanel(d) +
      readingNotes(C) +
      "</section>";
  }

  function readout(r, spec, b) {
    var i = coneState.scrub - 2026;
    var cells = [
      { k: "5th percentile", v: spec.fmt(b.p05[i]), cls: "edge" },
      { k: "25th", v: spec.fmt(b.p25[i]), cls: "" },
      { k: "Median", v: spec.fmt(b.p50[i]), cls: "mid" },
      { k: "75th", v: spec.fmt(b.p75[i]), cls: "" },
      { k: "95th percentile", v: spec.fmt(b.p95[i]), cls: "edge" },
    ];
    var extra = "";
    if (coneState.domain === "peace") {
      // The mean is reported alongside the median for one domain only,
      // because for one domain only are they wildly different — and that
      // difference is the section's whole argument.
      var mean = b.mean[i];
      extra = '<p class="ro-note">Mean: <b>' + n2(mean) + " /100k</b> — about " +
        n1(mean / Math.max(b.p50[i], 0.01)) + "× the median. " +
        "In a heavy-tailed process the average year and the typical year are different objects, " +
        "and it is the average that carries the loss.</p>";
    }
    if (coneState.domain === "climate") {
      extra = '<p class="ro-note">Median emissions peak: <b>' + r.climate.peakYear + "</b>. " +
        "Median year the 1.5°C line is crossed: <b>" + (r.climate.exceed["1.5"] || "already") + "</b>; " +
        "2.0°C: <b>" + (r.climate.exceed["2.0"] || "—") + "</b>.</p>";
    }
    if (coneState.domain === "ai") {
      extra = '<p class="ro-note">Median deployment lag between a task becoming feasible and being done that way at scale: <b>' +
        n1(r.ai.tau) + " years</b>. " +
        "Median further effective orders of magnitude needed to reach half the automatable task base: <b>" +
        n1(r.ai.oom50) + "</b>.</p>";
    }
    return '<div class="readout"><h2>Distribution in ' + coneState.scrub + "</h2>" +
      '<div class="ro-grid">' + cells.map(function (c) {
        return '<div class="ro ' + c.cls + '"><span class="ro-v">' + esc(c.v) + "</span>" +
          '<span class="ro-k">' + esc(c.k) + "</span></div>";
      }).join("") + "</div>" + extra + "</div>";
  }

  function hazards(r) {
    var i = coneState.scrub - 2026;
    var rows = [
      { k: "A nuclear weapon is used in conflict", v: r.peace.pNuke[i], d: "peace",
        n: "Cumulative by " + coneState.scrub + ". Driven by the arms-control and rivalry sliders, and multiplied roughly eightfold while a great-power war is being fought." },
      { k: "Direct great-power war", v: r.peace.pGp[i], d: "peace",
        n: "Two great powers in sustained direct combat. This is what the historical base rate implies when compounded, and it is the most consequential number on this page." },
      { k: "Severe AI-enabled incident", v: r.ai.pIncident[i], d: "ai",
        n: "At least 1,000 deaths or $100bn of damage, by misuse, accident, or a system doing what it was asked. Scales with deployed automation, not with the frontier." },
      { k: "A carbon-cycle tipping element crosses", v: r.climate.pTip[i], d: "climate",
        n: "Narrowly defined: an element that feeds back on the global mean temperature. It excludes coral, whose thresholds are already being crossed and whose loss has no warming signature." },
    ];
    var body = rows.map(function (h) {
      return '<div class="hz acc-' + h.d + '">' +
        '<div class="hz-top"><span class="hz-k">' + esc(h.k) + "</span>" +
        '<span class="hz-v">' + pct(h.v) + "</span></div>" +
        '<div class="hz-track"><i style="width:' + (h.v * 100).toFixed(1) + '%"></i></div>' +
        '<p class="hz-n">' + md(h.n) + "</p></div>";
    }).join("");

    // Conditional severity of nuclear use — the decomposition that a
    // single probability hides.
    var nd = r.peace.nukeDeaths;
    var sev = "";
    if (nd.length > 20) {
      var q = function (f) { return nd[Math.min(nd.length - 1, Math.floor(nd.length * f))]; };
      sev = '<div class="note-box"><b>If a weapon is used, how bad?</b> Across the sampled ' +
        "exchanges: a median of <b>" + big(q(0.5)) + "</b> deaths, a 25th percentile of <b>" +
        big(q(0.25)) + "</b>, and a 90th percentile of <b>" + big(q(0.9)) + "</b>, including modelled " +
        "famine mortality, which dominates the larger classes. Unconditionally, the chance that " +
        "nuclear use kills more than a hundred million people this century is <b>" +
        pct(r.peace.pNukeVeryBig) + "</b>. Reporting one probability for &ldquo;nuclear war&rdquo; " +
        "collapses a demonstration shot and the end of the northern hemisphere into a single " +
        "number, and the difference between them is the part policy can still act on.</div>";
    }

    return '<div class="hz-block"><h2>Cumulative hazards by ' + coneState.scrub + "</h2>" +
      '<div class="hz-grid">' + body + "</div>" + sev + "</div>";
  }

  function driverPanel(d) {
    var groups = { ai: [], climate: [], peace: [] };
    M.DRIVERS.forEach(function (dr) { groups[dr.domain].push(dr); });
    var body = ["climate", "ai", "peace"].map(function (k) {
      return '<div class="dgroup acc-' + k + '"><h4>' + icon("c-" + k, "dg-ico") +
        DOMAIN_LABEL[k] + "</h4>" +
        groups[k].map(function (dr) {
          var v = d[dr.key];
          return '<div class="driver">' +
            '<label for="dr-' + dr.key + '">' + esc(dr.label) +
            '<span class="dr-v">' + Math.round(v * 100) + "</span></label>" +
            '<input id="dr-' + dr.key + '" type="range" min="0" max="100" step="1" value="' +
            Math.round(v * 100) + '" data-driver="' + dr.key + '">' +
            '<div class="dr-ends"><span>' + esc(dr.lo) + "</span><span>" + esc(dr.hi) + "</span></div>" +
            '<p class="dr-note">' + md(dr.note) + "</p></div>";
        }).join("") + "</div>";
    }).join("");

    return '<div class="drivers"><h2>The assumptions</h2>' +
      "<p>Six knobs, each mapping to a shift in a distribution rather than to a fixed value. " +
      "They are claims about the world, not predictions of it — the model has nothing to say " +
      "about which setting is right, which is precisely why they are exposed.</p>" +
      '<div class="dgrid">' + body + "</div>" +
      '<div class="dr-actions">' +
      '<label class="switch"><input type="checkbox" id="coupling"' + (d.coupling ? " checked" : "") +
      '> <span>Cross-domain couplings</span></label>' +
      '<button type="button" class="btn ghost" id="resetDrivers">Reset to defaults</button>' +
      '<span class="faint">' + coneState.runs + " sampled futures per run</span>" +
      "</div></div>";
  }

  function readingNotes(C) {
    return '<div class="notes"><h2>How to read it</h2><div class="tiles">' +
      C.reading.map(function (n) {
        return '<div class="tile"><h3>' + md(n.h) + "</h3><p>" + md(n.p) + "</p></div>";
      }).join("") + "</div></div>";
  }

  // Wire the cone page after it is in the DOM.
  function bindCone() {
    var wrap = document.getElementById("coneWrap");
    var slider = document.getElementById("scrubYear");
    var pending = null;

    function repaint() {
      var scroll = window.scrollY;
      main.innerHTML = views_cone();
      window.scrollTo(0, scroll);
      bindCone();
    }

    // Debounced: the model is a few hundred milliseconds and a slider
    // fires far faster than that. The value updates immediately in the
    // label; the cone follows.
    function schedule() {
      if (pending) clearTimeout(pending);
      pending = setTimeout(repaint, 130);
    }

    Array.prototype.forEach.call(document.querySelectorAll(".dtab"), function (b) {
      b.addEventListener("click", function () {
        coneState.domain = b.getAttribute("data-domain");
        repaint();
      });
    });

    if (slider) {
      slider.addEventListener("input", function () {
        coneState.scrub = Number(slider.value);
        schedule();
      });
    }

    // Scrubbing by dragging over the chart, for mouse and pen only.
    //
    // Touch is deliberately excluded. Below 620px the chart scrolls
    // horizontally inside its own box, and a drag handler that claimed
    // horizontal gestures would take the scroll away from the reader on
    // exactly the devices that need it. Touch and keyboard users get the
    // range input below the chart, which is the accessible path anyway.
    if (wrap) {
      var svg = wrap.querySelector("svg");
      var scrubFrom = function (ev) {
        var box = svg.getBoundingClientRect();
        if (!box.width) return;
        var t = (ev.clientX - box.left) / box.width * W;
        var frac = (t - PAD.l) / (W - PAD.l - PAD.r);
        var yr = Math.round(2026 + Math.max(0, Math.min(1, frac)) * 74);
        if (yr !== coneState.scrub) { coneState.scrub = yr; schedule(); }
      };
      var pointerOk = function (ev) { return ev.pointerType !== "touch"; };
      wrap.addEventListener("pointerdown", function (ev) {
        if (pointerOk(ev)) scrubFrom(ev);
      });
      wrap.addEventListener("pointermove", function (ev) {
        if (pointerOk(ev) && ev.buttons) scrubFrom(ev);
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-driver]"), function (inp) {
      inp.addEventListener("input", function () {
        var k = inp.getAttribute("data-driver");
        coneState.drivers[k] = Number(inp.value) / 100;
        save(coneState.drivers);
        var lab = inp.previousElementSibling &&
          inp.previousElementSibling.querySelector(".dr-v");
        if (lab) lab.textContent = inp.value;
        schedule();
      });
    });

    var cpl = document.getElementById("coupling");
    if (cpl) cpl.addEventListener("change", function () {
      coneState.drivers.coupling = cpl.checked;
      save(coneState.drivers);
      repaint();
    });

    var reset = document.getElementById("resetDrivers");
    if (reset) reset.addEventListener("click", function () {
      coneState.drivers = null;
      try { localStorage.removeItem(STORE); } catch (e) { /* private mode */ }
      coneState.drivers = currentDrivers();
      repaint();
    });
  }

  // ============================================================
  // Other views
  // ============================================================

  function page(section, extra) {
    return '<section class="section wrap">' +
      '<div class="eyebrow">' + esc(section.eyebrow || "Three Clocks") + "</div>" +
      "<h1>" + esc(section.title) + "</h1>" +
      '<p class="lede">' + md(section.sub) + "</p>" +
      '<div class="prose">' + (extra || "") + "</div></section>";
  }

  function views_home() {
    var r = results();
    var t100 = at(r.climate.temp.p50, 2100);
    var a2050 = at(r.ai.auto.p50, 2050);
    var nuke = at(r.peace.pNuke, 2100);

    var hero =
      '<section class="hero wrap"><div class="hero-grid"><div>' +
      '<div class="eyebrow">A forecast, with its uncertainty attached</div>' +
      "<h1>" + esc(TC.home.title) + "</h1>" +
      '<p class="lede">' + md(TC.home.sub) + "</p>" +
      '<div class="cta-row">' +
      '<a class="btn" href="#/cone">Open the model</a>' +
      '<a class="btn ghost" href="#/estimate">Read the estimate</a>' +
      "</div></div>" +
      '<svg class="hero-art" viewBox="0 0 400 260" aria-hidden="true"><use href="#c-hero"/></svg>' +
      "</div>" +
      '<div class="head-stats">' +
      '<a class="hs acc-climate" href="#/climate"><span class="hs-n">' + n1(t100) + "°C</span>" +
      '<span class="hs-l">median warming in 2100</span></a>' +
      '<a class="hs acc-ai" href="#/ai"><span class="hs-n">' + Math.round(a2050) + "%</span>" +
      '<span class="hs-l">of work hours automated by 2050, median</span></a>' +
      '<a class="hs acc-peace" href="#/peace"><span class="hs-n">' + pct(nuke) + "</span>" +
      '<span class="hs-l">chance a nuclear weapon is used this century</span></a>' +
      "</div>" +
      '<p class="faint hs-foot">Computed live by the model on this page, at its default assumptions. ' +
      'Every one of them is arguable and all three move when you <a href="#/cone">change the drivers</a>.</p>' +
      "</section>";

    var body = '<section class="section wrap"><div class="prose">' +
      blocks(TC.home.blocks) + "</div>" + chapterCards() + "</section>";

    return hero + body;
  }

  function chapterCards() {
    var cards = [
      { r: "#/method", i: "c-method", h: "How to forecast this", p: "What is actually known about who gets long-range questions right, and what this model is doing.", k: "" },
      { r: "#/ai", i: "c-ai", h: "The AI clock", p: "Capability, diffusion, and the twenty-year gap between them.", k: "ai" },
      { r: "#/climate", i: "c-climate", h: "The climate clock", p: "One physical relationship, two numbers, and a branch that quietly closed.", k: "climate" },
      { r: "#/peace", i: "c-peace", h: "The peace clock", p: "Fat tails, a base rate nobody likes, and the treaty that expired in February.", k: "peace" },
      { r: "#/coupling", i: "c-coupling", h: "How they couple", p: "The interaction matrix, and four popular claims it disposes of.", k: "" },
      { r: "#/cone", i: "c-cone", h: "The cone", p: "Several hundred futures, computed live, with the assumptions exposed.", k: "" },
      { r: "#/scenarios", i: "c-scenarios", h: "Five worlds", p: "Named branches, what each requires, and roughly how much of the distribution it holds.", k: "" },
      { r: "#/estimate", i: "c-estimate", h: "The estimate", p: "Dated, numbered and resolvable. The part that can be scored.", k: "" },
      { r: "#/watch", i: "c-watch", h: "The watchlist", p: "Leading indicators, today's readings, and the thresholds that force an update.", k: "" },
      { r: "#/objections", i: "c-objections", h: "Objections", p: "The strongest arguments against all of this, steelmanned.", k: "" },
    ];
    return '<div class="cards chapters">' + cards.map(function (c) {
      return '<a class="card' + (c.k ? " acc-" + c.k : "") + '" href="' + c.r + '">' +
        icon(c.i) + "<h3>" + esc(c.h) + "</h3><p>" + esc(c.p) + "</p></a>";
    }).join("") + "</div>";
  }

  function views_scenarios() {
    var S = TC.scenarios;
    var body = "<p>" + md(S.intro) + "</p>" +
      '<div class="scn-bar" role="img" aria-label="Relative weight of the five scenarios">' +
      S.items.map(function (s) {
        return '<span class="scn-seg tone-' + s.tone + '" style="width:' + s.weight + '%" title="' +
          esc(s.name) + " " + s.weight + '%"><b>' + s.weight + "%</b></span>";
      }).join("") + "</div>" +
      S.items.map(function (s) {
        return '<article class="scn tone-' + s.tone + '">' +
          '<div class="scn-head"><div><span class="scn-tag">' + esc(s.tag) + "</span>" +
          "<h3>" + esc(s.name) + "</h3></div>" +
          '<div class="scn-w">' + s.weight + "%</div></div>" +
          '<p class="scn-sum">' + md(s.summary) + "</p>" +
          "<p>" + md(s.body) + "</p>" +
          '<div class="scn-foot">' +
          '<div><h4>What it requires</h4><p>' + md(s.needs) + "</p></div>" +
          '<div><h4>What to notice</h4><p>' + md(s.tell) + "</p></div>" +
          "</div></article>";
      }).join("");
    return page(S, body);
  }

  function forecastTable() {
    var byYear = {};
    TC.forecasts.forEach(function (f) { (byYear[f.by] = byYear[f.by] || []).push(f); });
    return Object.keys(byYear).sort().map(function (yr) {
      return '<div class="fc-group"><h3>By ' + yr + "</h3>" +
        byYear[yr].map(function (f) {
          return '<div class="fc acc-' + f.domain + '">' +
            '<div class="fc-p"><span class="fc-n">' + f.p + "%</span>" +
            '<span class="fc-d">' + esc(DOMAIN_LABEL[f.domain]) + "</span></div>" +
            '<div class="fc-body"><p class="fc-claim">' + md(f.claim) + "</p>" +
            '<p class="fc-why">' + md(f.why) + "</p>" +
            '<p class="fc-res"><b>Resolves:</b> ' + md(f.res) + "</p></div></div>";
        }).join("") + "</div>";
    }).join("");
  }

  function views_watch() {
    var Wl = TC.watch;
    var arrow = { up: "▲", down: "▼", flat: "▬" };
    var body = "<p>" + md(Wl.intro) + "</p>" +
      ["ai", "climate", "peace"].map(function (dm) {
        var items = Wl.items.filter(function (i) { return i.domain === dm; });
        return '<div class="wl-group acc-' + dm + '"><h3>' + icon("c-" + dm, "wl-ico") +
          DOMAIN_LABEL[dm] + "</h3>" +
          items.map(function (i) {
            return '<div class="wl">' +
              '<div class="wl-head"><h4>' + esc(i.name) + "</h4>" +
              '<span class="wl-now"><i class="tr tr-' + i.trend + '" aria-hidden="true">' +
              arrow[i.trend] + "</i> " + esc(i.now) + "</span></div>" +
              "<p>" + md(i.note) + "</p>" +
              '<p class="wl-trig"><b>Forces an update:</b> ' + md(i.trigger) + "</p></div>";
          }).join("") + "</div>";
      }).join("");
    return page(Wl, body);
  }

  function views_objections() {
    var O = TC.objections;
    var body = "<p>" + md(O.intro) + "</p>" +
      O.items.map(function (o, i) {
        return '<article class="obj">' +
          '<h3><span class="obj-n">' + (i + 1) + "</span>" + esc(o.h) + "</h3>" +
          '<div class="obj-arg"><h4>The objection</h4><p>' + md(o.arg) + "</p></div>" +
          '<div class="obj-resp"><h4>Response</h4><p>' + md(o.resp) + "</p></div>" +
          "</article>";
      }).join("");
    return page(O, body);
  }

  function views_sources() {
    var S = TC.sources;
    var body = S.groups.map(function (g) {
      return '<div class="srcgroup"><h3>' + esc(g.h) + "</h3>" +
        g.items.map(function (s) {
          return '<div class="src"><div class="t">' + md(s.t) + "</div>" +
            '<div class="d">' + md(s.d) + "</div></div>";
        }).join("") + "</div>";
    }).join("");
    return page(S, body);
  }

  // ============================================================
  // Router
  // ============================================================

  var ROUTES = {
    "": views_home,
    "/": views_home,
    "/method": function () { return page(TC.method, blocks(TC.method.blocks)); },
    "/ai": function () { return page(TC.ai, blocks(TC.ai.blocks)); },
    "/climate": function () { return page(TC.climate, blocks(TC.climate.blocks)); },
    "/peace": function () { return page(TC.peace, blocks(TC.peace.blocks)); },
    "/coupling": function () { return page(TC.coupling, blocks(TC.coupling.blocks)); },
    "/cone": views_cone,
    "/scenarios": views_scenarios,
    "/estimate": function () { return page(TC.estimate, blocks(TC.estimate.blocks)); },
    "/watch": views_watch,
    "/objections": views_objections,
    "/sources": views_sources,
  };

  function route() {
    var hash = location.hash.replace(/^#/, "") || "/";
    var view = ROUTES[hash] || ROUTES["/"];
    main.innerHTML = view();
    main.focus({ preventScroll: true });

    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      var on = a.getAttribute("href") === "#" + hash ||
        (hash === "/" && a.getAttribute("href") === "#/");
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    nav.classList.remove("open");
    var burger = document.querySelector(".burger");
    if (burger) burger.setAttribute("aria-expanded", "false");

    if (hash === "/cone") bindCone();
    if (!location.hash || hash === "/") window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", function () {
    window.scrollTo(0, 0);
    route();
  });

  var burger = document.querySelector(".burger");
  if (burger) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
  }

  route();
})();
