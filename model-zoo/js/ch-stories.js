/* Chapter: Stories. Ten free stories per model against ten-story human groups:
   a 2-D map of every story, two sameness measures, and per-model habits. */
Zoo.chapter("stories", ["stories"], function (el, data) {
  var h = Zoo.h, S = data.stories, G = S.groups || {}, NS = "http://www.w3.org/2000/svg";

  Zoo.head(el, "Chapter 7", "Stories",
    "We asked each model for ten 300-word stories and gave it no topic. How alike are its ten, compared with ten stories by ten different Reddit writers " +
    "(r/WritingPrompts), or ten 300-word passages of Chekhov? " +
    "<em>A caveat:</em> one model writing ten times is not like ten different people writing once each, so the Reddit groups flatter the humans. " +
    "The fairer control is the classic authors: one writer, ten passages.");

  var all = Object.keys(G);
  var models = Zoo.order(all.filter(function (k) { return G[k].kind === "model"; }));
  var wp = all.filter(function (k) { return G[k].kind === "writingprompts"; });
  var gb = all.filter(function (k) { return G[k].kind === "gutenberg"; });
  if (!models.length && !wp.length) {
    el.appendChild(h("p", { class: "note", text: "The stories are still being collected." }));
    return;
  }

  function prov(k) { return G[k].provider || Zoo.model(k).provider; }
  function label(k) {
    var g = G[k];
    if (g.kind === "model") return Zoo.model(k).label;
    if (g.kind === "writingprompts") return "Reddit writers, group " + k.replace(/^wp-0?/, "");
    return k;
  }
  function pct(x) { return x == null ? "–" : Math.round(x * 100) + "%"; }

  // ---- 1. The map ----------------------------------------------------------------
  el.appendChild(h("h3", { class: "part", text: "The map" }));
  var pts = S.points || [];
  var embeddedModels = models.filter(function (k) { return G[k].n_embedded > 0; }).length;
  el.appendChild(h("p", { class: "note", text: "Each dot is one story, placed by meaning: we turned every story into a list of numbers that encodes what it is about and how it reads, then flattened those onto two axes. " +
    "Stories near each other read alike. A tight knot of dots is a writer with one story in them." +
    (models.length && !embeddedModels ? " The model stories have not been placed yet, so only the human texts show for now." : "") }));
  el.appendChild(h("div", { class: "legend" }, [
    h("span", null, [h("span", { class: "dot openai" }), "GPT stories"]),
    h("span", null, [h("span", { class: "dot anthropic" }), "Claude stories"]),
    h("span", null, [h("span", { class: "dot wp" }), "Reddit writers (WritingPrompts)"]),
    h("span", null, [h("span", { class: "dot gb" }), "Classic authors (Project Gutenberg)"]),
  ]));
  if (pts.length) {
    var W = 720, HH = 440, P = 14;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var sx = function (v) { return P + (W - 2 * P) * (v - x0) / ((x1 - x0) || 1); };
    var sy = function (v) { return HH - P - (HH - 2 * P) * (v - y0) / ((y1 - y0) || 1); };
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + HH);
    svg.setAttribute("class", "map");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Map of " + pts.length + " stories; nearby stories read alike");
    var frame = document.createElementNS(NS, "rect");
    frame.setAttribute("x", 0.5); frame.setAttribute("y", 0.5); frame.setAttribute("width", W - 1); frame.setAttribute("height", HH - 1);
    frame.setAttribute("class", "frame");
    svg.appendChild(frame);
    var rank = { writingprompts: 0, gutenberg: 1, model: 2 };
    pts.slice().sort(function (a, b) { return rank[(G[a.group] || {}).kind] - rank[(G[b.group] || {}).kind]; }).forEach(function (p) {
      var g = G[p.group] || { kind: "model" };
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", sx(p.x).toFixed(1)); c.setAttribute("cy", sy(p.y).toFixed(1));
      c.setAttribute("r", g.kind === "model" ? 4.5 : 3.5);
      c.setAttribute("class", g.kind === "model" ? "pt " + prov(p.group) : g.kind === "gutenberg" ? "pt gb" : "pt wp");
      var n = /-s(\d+)$/.exec(p.id);
      c.setAttribute("data-tip", g.kind === "model" ? label(p.group) + (n ? ", story " + (+n[1] + 1) : "") :
        g.kind === "gutenberg" ? p.group + ", a 300-word passage" : label(p.group) + " (one of ten different writers)");
      svg.appendChild(c);
    });
    el.appendChild(h("div", { class: "mapwrap" }, [svg]));
    var ex = (S.method && S.method.pca_explained) || [];
    if (ex.length) el.appendChild(h("p", { class: "note", text: "The two axes have no names; together they hold " +
      pct((ex[0] || 0) + (ex[1] || 0)) + " of the differences between stories, so the map is a rough sketch. Distances in the full space are measured in the numbers below." }));
  }

  // ---- 2. Sameness: self-overlap and distinct-2 -------------------------------------
  el.appendChild(h("h3", { class: "part", text: "How much do the ten repeat each other?" }));
  el.appendChild(h("p", { class: "note", text: "Two measures, one chart each. Each coloured dot is one model's ten stories. The light band is the range across the 25 groups of Reddit writers, the darker band the range across the four classic authors." }));

  function range(keys, f) {
    var v = keys.map(function (k) { return G[k][f]; }).filter(function (x) { return x != null; });
    return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : null;
  }

  function strip(f, title, help, fmt) {
    var keys = models.concat(wp, gb);
    var vals = keys.map(function (k) { return G[k][f]; }).filter(function (x) { return x != null; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), padv = (hi - lo) * 0.08 || 0.01;
    if (f === "self_overlap") lo = 0; else lo -= padv;
    hi += padv;
    var at = function (v) { return (100 * (v - lo) / (hi - lo)).toFixed(2) + "%"; };
    var bands = [["wp", range(wp, f)], ["gb", range(gb, f)]];
    function track(kids) {
      var t = h("div", { class: "track" });
      bands.forEach(function (b) {
        if (b[1]) t.appendChild(h("i", { class: "band " + b[0], style: "left:" + at(b[1][0]) + ";width:calc(" + at(b[1][1]) + " - " + at(b[1][0]) + " + 2px)" }));
      });
      kids.forEach(function (k) { t.appendChild(k); });
      return t;
    }
    var rows = h("div", { class: "strip" });
    models.forEach(function (k) {
      var v = G[k][f];
      rows.appendChild(h("div", { class: "row" }, [h("div", { class: "lab" }, [Zoo.name(k)]),
        track(v == null ? [] : [h("i", { class: "pt " + prov(k), tabindex: "0", style: "left:" + at(v), "data-tip": label(k) + ": " + fmt(v) })])]));
    });
    [["wp", wp, "Reddit writers (each group)"], ["gb", gb, "Classic authors"]].forEach(function (r) {
      if (!r[1].length) return;
      rows.appendChild(h("div", { class: "row human" }, [h("div", { class: "lab" }, [h("span", { class: "who" }, [h("span", { class: "dot " + r[0] }), r[2]])]),
        track(r[1].map(function (k) { return h("i", { class: "pt " + r[0], tabindex: "0", style: "left:" + at(G[k][f]), "data-tip": label(k) + ": " + fmt(G[k][f]) }); }))]));
    });
    rows.appendChild(h("div", { class: "row axis" }, [h("div", { class: "lab" }), h("div", { class: "ticks" }, [
      h("span", { style: "left:0", text: fmt(lo) }), h("span", { style: "left:100%", text: fmt(hi) })])]));
    return h("div", { class: "card chart" }, [h("h4", { text: title }), h("p", { class: "help", text: help }), rows]);
  }
  el.appendChild(h("div", { class: "pair" }, [
    strip("self_overlap", "Shared three-word phrases between stories", "Higher means the ten stories echo each other.", function (v) { return (v * 100).toFixed(2) + "%"; }),
    strip("distinct_2", "Fresh word pairs (distinct-2)", "Lower means the ten reuse the same phrases.", function (v) { return v.toFixed(3); }),
  ]));

  var cols = [["Words", "words"], ["Self-overlap", "self_overlap"], ["Distinct-2", "distinct_2"], ["MATTR", "mattr"], ["MTLD", "mtld"], ["Spread", "spread"], ["AI words /1k", "ai_vocab_rate"]];
  function cell(v, key) {
    if (v == null) return "–";
    if (typeof v === "object") v = v.mean;
    if (key === "self_overlap") return (v * 100).toFixed(2) + "%";
    if (key === "words" || key === "mtld") return String(Math.round(v));
    return v.toFixed(3);
  }
  el.appendChild(h("details", { class: "tableview" }, [h("summary", { text: "Table view" }),
    h("div", { class: "table-wrap" }, [h("table", { class: "data" }, [
      h("thead", null, [h("tr", null, [h("th", { text: "Group" })].concat(cols.map(function (c) { return h("th", { class: "num", text: c[0] }); })))]),
      h("tbody", null, models.concat(gb, wp).map(function (k) {
        var g = G[k];
        return h("tr", null, [h("td", null, [g.kind === "model" ? Zoo.name(k) : h("span", { class: "who" }, [h("span", { class: "dot " + (g.kind === "gutenberg" ? "gb" : "wp") }), label(k)])])]
          .concat(cols.map(function (c) { return h("td", { class: "num", text: cell(g[c[1]], c[1]) }); })));
      }))])])]));

  // ---- 3. Per-model habits ----------------------------------------------------------
  if (models.length) {
    el.appendChild(h("h3", { class: "part", text: "Habits, model by model" }));
    var wpNames = wp.map(function (k) { return G[k].names_distinct; }).filter(function (x) { return x != null; });
    var grid = h("div", { class: "grid wide habits" });
    models.forEach(function (k) { grid.appendChild(habit(k)); });
    el.appendChild(grid);
    if (wpNames.length) el.appendChild(h("p", { class: "note", text: "For scale: a group of ten Reddit writers uses " + Math.min.apply(null, wpNames) + "–" + Math.max.apply(null, wpNames) + " different names across its ten stories." }));
  }

  function habit(k) {
    var g = G[k], kids = [Zoo.cardHead(k)];
    var seen = {}, rep = [];
    (g.openers || []).forEach(function (o) { if (o.count > 1 && !seen[o.text]) { seen[o.text] = 1; rep.push(o); } });
    rep.sort(function (a, b) { return b.count - a.count; });
    kids.push(h("div", { class: "fact" }, [h("b", { text: "Openings" }),
      rep.length ? h("span", null, rep.map(function (o) { return h("span", { class: "q" }, [o.count + " of " + g.n + " begin “" + o.text + "…”"]); }))
        : h("span", { text: "All " + g.n + " open differently." })]));
    var names = g.names_top || [];
    if (names.length) kids.push(h("div", { class: "fact" }, [h("b", { text: "Names" }),
      h("span", null, names.slice(0, 6).map(function (n) { return h("span", { class: "chip", text: n.name + " ×" + n.count }); }))]));
    if (g.title_repeat != null) kids.push(h("div", { class: "fact" }, [h("b", { text: "Titles" }),
      h("span", { text: g.title_repeat === 0 ? "Ten different titles." : pct(g.title_repeat) + " of its titles are used more than once." })]));
    if (g.closest_pair) kids.push(h("div", { class: "fact" }, [h("b", { text: "Closest pair" }),
      h("span", { text: "“" + (g.closest_pair.title_a || "untitled") + "” and “" + (g.closest_pair.title_b || "untitled") + "” (" + pct(g.closest_pair.similarity) + " alike)" })]));
    kids.push(h("div", { class: "meta", text: "self-overlap " + cell(g.self_overlap, "self_overlap") + " · distinct-2 " + cell(g.distinct_2) +
      (g.spread != null ? " · spread " + g.spread.toFixed(3) : "") }));
    return h("div", { class: "card" }, kids);
  }

  // ---- 4. Method ---------------------------------------------------------------------
  var m = S.method || {};
  var terms = [["self_overlap", "Self-overlap"], ["distinct_2", "Distinct-2"], ["distinct_1", "Distinct-1"], ["distinct_3", "Distinct-3"],
    ["mattr", "MATTR"], ["mtld", "MTLD"], ["yule_k", "Yule’s K"], ["openers", "Openings"], ["names", "Names"], ["title_repeat", "Titles"],
    ["map", "The map"], ["spread", "Spread"], ["closest_pair", "Closest pair"], ["ai_vocab_rate", "AI words"], ["words", "Words"]];
  var dl = h("dl", { class: "gloss" });
  terms.forEach(function (t) {
    if (!m[t[0]]) return;
    var text = m[t[0]];
    if (t[0] === "ai_vocab_rate" && m.ai_vocab_list) text += " The list: " + m.ai_vocab_list.join(", ") + ".";
    dl.appendChild(h("dt", { text: t[1] }));
    dl.appendChild(h("dd", { text: text }));
  });
  el.appendChild(h("details", { class: "method" }, [h("summary", { text: "How we measured" }), dl]));
});
