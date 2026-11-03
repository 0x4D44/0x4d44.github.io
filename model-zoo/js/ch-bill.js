/* Chapter: The bill. Time against cost per answer, one dot per model, both axes logarithmic. */
Zoo.chapter("bill", ["bill", "models"], function (el, data) {
  var h = Zoo.h, B = data.bill, NS = "http://www.w3.org/2000/svg";

  var rows = Object.keys(B.models).map(function (id) {
    var m = B.models[id];
    return { id: id, m: Zoo.model(id), calls: m.calls, cost: m.cost, per: m.calls ? m.cost / m.calls : 0,
      secs: m.median_secs, out: m.out_tokens, think: m.reasoning_tokens };
  }).filter(function (r) { return r.calls; });
  rows.sort(function (a, b) { return b.cost - a.cost; });

  var total = 0, calls = 0;
  rows.forEach(function (r) { total += r.cost; calls += r.calls; });
  var extraTotal = Object.keys(B.extra).reduce(function (s, k) { return s + B.extra[k]; }, 0);

  Zoo.head(el, "Chapter 9", "The bill",
    "Everything above cost " + Zoo.money(total + extraTotal) + " across " + calls.toLocaleString() + " answers. " +
    "Each dot is one model: how long it took to answer (the median over all its answers) against what one answer cost on average. " +
    "Both scales are logarithmic, so each step is ten times the last. Times include our proxy and the load of running many models at once, " +
    "so read orders of magnitude, not close calls.");

  if (!rows.length) { el.appendChild(h("p", { class: "note", text: "No answers have been costed yet." })); return; }
  el.appendChild(Zoo.legend());

  var chart = h("div", { class: "scatter" });
  el.appendChild(chart);
  var lastW = 0;
  function redraw() {
    var w = Math.round(chart.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    chart.innerHTML = "";
    chart.appendChild(scatter(w));
  }
  redraw();
  var t;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(redraw, 120); });

  function s(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function logTicks(lo, hi) {
    var a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi)), out = [];
    var mults = b - a <= 2 ? [1, 2, 5] : [1];
    for (var e = a; e <= b; e++) mults.forEach(function (k) {
      var v = k * Math.pow(10, e);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    });
    return out;
  }
  function fmtSecs(v) { return (v < 1 ? String(+v.toPrecision(1)) : String(Math.round(v))) + " s"; }
  function fmtCost(v) {
    if (v >= 1) return "$" + v.toFixed(0);
    if (v >= 0.01) return (v * 100).toFixed(0) + "¢";
    return (+(v * 100).toPrecision(1)) + "¢";
  }

  function scatter(W) {
    var narrow = W < 560, H = narrow ? 360 : 440;
    var M = { l: narrow ? 44 : 56, r: 14, t: 14, b: 40 };
    var xs = rows.map(function (r) { return Math.max(r.secs, 0.05); });
    var ys = rows.map(function (r) { return Math.max(r.per, 1e-6); });
    function pad(lo, hi) { return [Math.pow(10, Math.floor(Math.log10(lo) * 2) / 2), Math.pow(10, Math.ceil(Math.log10(hi) * 2) / 2)]; }
    var X = pad(Math.min.apply(null, xs), Math.max.apply(null, xs));
    var Y = pad(Math.min.apply(null, ys), Math.max.apply(null, ys));
    var iw = W - M.l - M.r, ih = H - M.t - M.b;
    function x(v) { return M.l + iw * (Math.log10(v) - Math.log10(X[0])) / (Math.log10(X[1]) - Math.log10(X[0])); }
    function y(v) { return M.t + ih * (1 - (Math.log10(v) - Math.log10(Y[0])) / (Math.log10(Y[1]) - Math.log10(Y[0]))); }

    var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Scatter of median seconds per answer against cost per answer, one dot per model" });
    var g = s("g", { class: "axis" });
    logTicks(X[0], X[1]).forEach(function (v) {
      g.appendChild(s("line", { x1: x(v), x2: x(v), y1: M.t, y2: M.t + ih, class: "grid" }));
      g.appendChild(s("text", { x: x(v), y: M.t + ih + 16, "text-anchor": "middle" }, [fmtSecs(v)]));
    });
    logTicks(Y[0], Y[1]).forEach(function (v) {
      g.appendChild(s("line", { x1: M.l, x2: M.l + iw, y1: y(v), y2: y(v), class: "grid" }));
      g.appendChild(s("text", { x: M.l - 6, y: y(v) + 4, "text-anchor": "end" }, [fmtCost(v)]));
    });
    g.appendChild(s("text", { x: M.l + iw, y: H - 4, "text-anchor": "end", class: "title" }, ["median time per answer →"]));
    g.appendChild(s("text", { x: M.l + 4, y: M.t + 12, class: "title" }, ["↑ cost per answer"]));
    svg.appendChild(g);

    // Direct labels for the extremes only; skip any that would collide.
    var pick = {};
    function mark(list) { if (list[0]) pick[list[0].id] = 1; }
    function by(f, dir) { return rows.slice().sort(function (a, b) { return dir * (f(a) - f(b)); }); }
    mark(by(function (r) { return r.per; }, -1));
    mark(by(function (r) { return r.per; }, 1));
    mark(by(function (r) { return r.secs; }, -1));
    mark(by(function (r) { return r.secs; }, 1));
    mark(by(function (r) { return r.cost; }, -1));
    if (!narrow) {
      var b2 = by(function (r) { return r.per; }, -1); if (b2[1]) pick[b2[1].id] = 1;
      var an = rows.filter(function (r) { return r.m.provider === "anthropic"; });
      if (an.length) {
        pick[an.reduce(function (a, b) { return b.per < a.per ? b : a; }).id] = 1;
        pick[an.reduce(function (a, b) { return b.secs > a.secs ? b : a; }).id] = 1;
      }
    }

    var dots = s("g", { class: "dots" }), labels = s("g", { class: "labels" }), boxes = [];
    rows.forEach(function (r) {
      var cx = x(Math.max(r.secs, 0.05)), cy = y(Math.max(r.per, 1e-6));
      boxes.push({ x0: cx - 6, x1: cx + 6, y0: cy - 6, y1: cy + 6, self: r.id });
      dots.appendChild(s("circle", { cx: cx, cy: cy, r: 5, class: "pt " + r.m.provider, tabindex: "0",
        "data-tip": r.m.label + " · " + r.calls + " answers · " + Zoo.money(r.cost) + " total (" +
          Zoo.money(r.per) + " each) · median " + Zoo.secs(r.secs) }));
    });
    svg.appendChild(dots);
    var placed = [];
    rows.filter(function (r) { return pick[r.id]; }).forEach(function (r) {
      var cx = x(Math.max(r.secs, 0.05)), cy = y(Math.max(r.per, 1e-6));
      var txt = r.m.label, wEst = txt.length * 6.6;
      var tries = [
        { a: "start", tx: cx + 9, ty: cy + 4 }, { a: "end", tx: cx - 9, ty: cy + 4 },
        { a: "middle", tx: cx, ty: cy - 10 }, { a: "middle", tx: cx, ty: cy + 18 }];
      for (var i = 0; i < tries.length; i++) {
        var c = tries[i];
        var x0 = c.a === "start" ? c.tx : c.a === "end" ? c.tx - wEst : c.tx - wEst / 2, box = { x0: x0, x1: x0 + wEst, y0: c.ty - 11, y1: c.ty + 3 };
        if (box.x0 < M.l + 2 || box.x1 > W - 2 || box.y0 < M.t || box.y1 > M.t + ih) continue;
        var hit = placed.concat(boxes.filter(function (b) { return b.self !== r.id; })).some(function (b) {
          return box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0; });
        if (hit) continue;
        placed.push(box);
        labels.appendChild(s("text", { x: c.tx, y: c.ty, "text-anchor": c.a }, [txt]));
        break;
      }
    });
    svg.appendChild(labels);
    return svg;
  }

  // Totals by provider, plus the costs that were not answers.
  var prov = { openai: { cost: 0, calls: 0, n: 0 }, anthropic: { cost: 0, calls: 0, n: 0 } };
  rows.forEach(function (r) { var p = prov[r.m.provider] || prov.openai; p.cost += r.cost; p.calls += r.calls; p.n++; });
  var EXTRA = { images: "Image generation (haggis scenes)", probes: "Probes (checking which models answer)", embeddings: "Embeddings (story map)" };
  var tot = h("table", { class: "data totals" }, [
    h("thead", null, [h("tr", null, [h("th", { text: "Where the money went" }), h("th", { class: "num", text: "Answers" }), h("th", { class: "num", text: "Cost" })])]),
    h("tbody", null, [
      h("tr", null, [h("td", null, [h("span", { class: "who" }, [h("span", { class: "dot openai" }), "OpenAI, " + prov.openai.n + " models"])]),
        h("td", { class: "num", text: prov.openai.calls.toLocaleString() }), h("td", { class: "num", text: Zoo.money(prov.openai.cost) })]),
      h("tr", null, [h("td", null, [h("span", { class: "who" }, [h("span", { class: "dot anthropic" }), "Anthropic, " + prov.anthropic.n + " models"])]),
        h("td", { class: "num", text: prov.anthropic.calls.toLocaleString() }), h("td", { class: "num", text: Zoo.money(prov.anthropic.cost) })]),
    ].concat(Object.keys(B.extra).map(function (k) {
      return h("tr", null, [h("td", { text: EXTRA[k] || k }), h("td", { class: "num", text: "" }), h("td", { class: "num", text: Zoo.money(B.extra[k]) })]);
    })).concat([h("tr", { class: "sum" }, [h("td", { text: "Total" }), h("td", { class: "num", text: calls.toLocaleString() }),
      h("td", { class: "num", text: Zoo.money(total + extraTotal) })])]))]);
  el.appendChild(h("div", { class: "table-wrap" }, [tot]));

  var body = rows.map(function (r) {
    return h("tr", null, [h("td", null, [Zoo.name(r.id)]), h("td", { class: "num", text: r.calls.toLocaleString() }),
      h("td", { class: "num", text: Zoo.money(r.cost) }), h("td", { class: "num", text: Zoo.money(r.per) }),
      h("td", { class: "num", text: Zoo.secs(r.secs) }), h("td", { class: "num", text: r.out.toLocaleString() }),
      h("td", { class: "num", text: r.think ? r.think.toLocaleString() : "–" })]);
  });
  el.appendChild(h("details", { class: "tableview" }, [h("summary", { text: "Table view: every model, dearest first" }),
    h("div", { class: "table-wrap" }, [h("table", { class: "data" }, [
      h("thead", null, [h("tr", null, ["Model", "Answers", "Total", "Per answer", "Median time", "Output tokens", "Thinking tokens"].map(function (t, i) {
        return h("th", { class: i ? "num" : null, text: t }); }))]),
      h("tbody", null, body)])])]));
  el.appendChild(h("p", { class: "note", text: "Costs are tokens × published price, estimated per call. Thinking tokens are billed as output. " +
    "Times are wall-clock through our proxy with many requests in flight, so slow providers and busy minutes both show up here." }));
});
