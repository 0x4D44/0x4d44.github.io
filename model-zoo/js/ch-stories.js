/* Chapter: Stories. Ten free stories per model against ten-story human groups:
   a 2-D map of every story, two sameness measures, and per-model habits. */
Zoo.chapter("stories", ["stories", "detect"], function (el, data) {
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
  var ax = all.filter(function (k) { return G[k].kind === "author"; });
  var AUTHOR = "0x4D44 (this site’s author)";
  function cls(k) { var g = G[k]; return g.kind === "gutenberg" ? "gb" : g.kind === "author" ? "ax" : "wp"; }
  if (!models.length && !wp.length) {
    el.appendChild(h("p", { class: "note", text: "The stories are still being collected." }));
    return;
  }

  function prov(k) { return G[k].provider || Zoo.model(k).provider; }
  function label(k) {
    var g = G[k];
    if (g.kind === "model") return Zoo.model(k).label;
    if (g.kind === "writingprompts") return "Reddit writers, group " + k.replace(/^wp-0?/, "");
    if (g.kind === "author") return AUTHOR;
    return k;
  }
  function pct(x) { return x == null ? "–" : Math.round(x * 100) + "%"; }

  // ---- 0. How the comparison works ----------------------------------------------
  var nModelStories = models.reduce(function (s, k) { return s + (G[k].n || 0); }, 0);
  var nWp = wp.reduce(function (s, k) { return s + (G[k].n || 0); }, 0);
  // para(title, text) or para(title, [[lead, text], ...]) for several short paragraphs.
  function para(title, text) {
    var ps = typeof text === "string" ? [h("p", { text: text })] : text.map(function (t) {
      return h("p", null, [h("b", { text: t[0] + " " }), t[1]]);
    });
    return h("div", { class: "how-item" }, [h("h4", { text: title })].concat(ps));
  }
  el.appendChild(h("h3", { class: "part", text: "How the comparison works" }));
  el.appendChild(h("div", { class: "how" }, [
    para((ax.length ? "Four" : "Three") + " sources, all about 300 words", [
      ["The models.", models.length + " models, " + nModelStories + " stories. Every model got the same one-line prompt, " +
        "“Write a short story of about 300 words”, ten times. Each request was a separate call with no memory of the others, " +
        "at the model’s default settings. We cut off the title before measuring, so only the prose counts."],
      ["The Reddit writers.", nWp + " stories from r/WritingPrompts, posted in 2018, four years before ChatGPT. " +
        "We kept stories of 200 to 450 words, drew " + nWp + " at random with a fixed seed, and dealt them into groups of ten. " +
        "Within a group, nearly every story has a different author and answers a different prompt."],
      ["The classic authors.", "O. Henry, Anton Chekhov (in Constance Garnett’s translation), Saki and Katherine Mansfield, " +
        "all public domain from Project Gutenberg. From each author’s collection we took ten 300-word passages at random, " +
        "skipping the front matter and the end of the book."]].concat(ax.length ? [
      ["This site’s author.", "Ten 300-word passages from his Substack essays, each from a different essay picked at random with a fixed seed, " +
        "prose only: no headings, lists, captions, code or reader comments. They are essays about software and AI, not fiction, " +
        "so they are a second one-writer control rather than a story baseline. Like the Reddit stories, the text stays off this page."]] : [])),
    para("Always ten against ten",
      "Every “how alike are they?” number is worked out inside a group of ten texts of similar length. " +
      "Those groups are one model’s ten stories, one group of ten Reddit stories, or one author’s ten passages. " +
      "This matters because sameness measures move with how much text you feed them: " +
      "a single 300-word story, or a whole novel, would not be comparable. " +
      "The human results are shown as ranges, so a model sitting inside the band is writing within normal human variation."),
    para("Two lenses: the words, and the meaning",
      "The word measures read only the surface. Text is lower-cased and reduced to words, so punctuation and layout count for nothing. " +
      "Vocabulary richness is scored story by story (MATTR, MTLD, Yule’s K), then averaged over the ten. " +
      "Repetition across stories is scored on the ten pooled together. Distinct-2 asks what share of all word pairs are new. " +
      "Self-overlap asks how many three-word phrases each pair of stories shares. " +
      "The meaning measure sends every text through the same embedding model (OpenAI’s text-embedding-3-small). " +
      "That turns a text into 1,536 numbers, so two stories about a lonely lighthouse keeper land close together even if they share no phrases. " +
      "“Spread” is how far a group’s ten texts sit from their own centre. The map squashes those 1,536 numbers down to two, for the eye."),
    para("What makes it unfair, and which way",
      "The Reddit groups are a generous yardstick for the humans. Ten different people answering ten different prompts will " +
      "naturally vary more than one model answering one prompt ten times, so treat them as the ceiling of variety. " +
      "The classic authors are the fairer test, one writer ten times. But their passages are slices from the middle of longer works, " +
      "edited for print, and one is a translation. That is why openings, titles and names are compared only between models. " +
      "Ten texts per group is a small sample: read differences of a point or two as noise, and big gaps as the finding. " +
      "The “AI words” list is our own choice of words that feel like machine prose, so it is a pointer, not a proof. " +
      "Each model was run once, on one afternoon. And no human text appears on this page: the Reddit stories belong to their authors, " +
      "so we publish only the numbers measured from them."),
  ]));
  el.appendChild(h("p", { class: "note", text: "The exact formula for each measure is under “How we measured” at the end of this chapter." }));

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
  ].concat(ax.length ? [h("span", null, [h("span", { class: "dot ax" }), AUTHOR])] : [])));
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
    var rank = { writingprompts: 0, gutenberg: 1, model: 2, author: 3 };
    pts.slice().sort(function (a, b) { return rank[(G[a.group] || {}).kind] - rank[(G[b.group] || {}).kind]; }).forEach(function (p) {
      var g = G[p.group] || { kind: "model" };
      var cx = sx(p.x).toFixed(1), cy = sy(p.y).toFixed(1), c;
      if (g.kind === "author") {  // a diamond as well as green: green and orange can merge for red-green colour blindness
        c = document.createElementNS(NS, "rect");
        c.setAttribute("x", cx - 4); c.setAttribute("y", cy - 4); c.setAttribute("width", 8); c.setAttribute("height", 8);
        c.setAttribute("transform", "rotate(45 " + cx + " " + cy + ")");
      } else {
        c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", cx); c.setAttribute("cy", cy);
        c.setAttribute("r", g.kind === "model" ? 4.5 : 3.5);
      }
      c.setAttribute("class", g.kind === "model" ? "pt " + prov(p.group) : "pt " + cls(p.group));
      var n = /-s(\d+)$/.exec(p.id);
      c.setAttribute("data-tip", g.kind === "model" ? label(p.group) + (n ? ", story " + (+n[1] + 1) : "") :
        g.kind === "gutenberg" ? p.group + ", a 300-word passage" : g.kind === "author" ? AUTHOR + ", a 300-word passage from one essay" :
        label(p.group) + " (one of ten different writers)");
      svg.appendChild(c);
    });
    el.appendChild(h("div", { class: "mapwrap" }, [svg]));
    var ex = (S.method && S.method.pca_explained) || [];
    if (ex.length) el.appendChild(h("p", { class: "note", text: "The two axes have no names; together they hold " +
      pct((ex[0] || 0) + (ex[1] || 0)) + " of the differences between stories, so the map is a rough sketch. Distances in the full space are measured in the numbers below." }));
    var spr = function (keys) { var r = range(keys, "spread"); return r ? r[0].toFixed(2) + "–" + r[1].toFixed(2) : "–"; };
    if (ax.length && G[ax[0]].spread != null) el.appendChild(h("p", { class: "note", text: "Spread, how far a group’s ten texts sit from their own centre: " +
      "this site’s author " + G[ax[0]].spread.toFixed(2) + ", the Reddit groups " + spr(wp) + ", the classic authors " + spr(gb) + ", the models " + spr(models) + "." }));
  }

  // ---- 2. Sameness: self-overlap and distinct-2 -------------------------------------
  el.appendChild(h("h3", { class: "part", text: "How much do the ten repeat each other?" }));
  el.appendChild(h("p", { class: "note", text: "Two measures, one chart each. Each coloured dot is one model's ten stories. The light band is the range across the 25 groups of Reddit writers, the darker band the range across the four classic authors." +
    (ax.length ? " The green diamond is this site’s author." : "") }));

  function range(keys, f) {
    var v = keys.map(function (k) { return G[k][f]; }).filter(function (x) { return x != null; });
    return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : null;
  }

  function strip(f, title, help, fmt) {
    var keys = models.concat(wp, gb, ax);
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
    [["wp", wp, "Reddit writers (each group)"], ["gb", gb, "Classic authors"], ["ax", ax, AUTHOR]].forEach(function (r) {
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
      h("tbody", null, models.concat(ax, gb, wp).map(function (k) {
        var g = G[k];
        return h("tr", null, [h("td", null, [g.kind === "model" ? Zoo.name(k) : h("span", { class: "who" }, [h("span", { class: "dot " + cls(k) }), label(k)])])]
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
    if (names.length) kids.push(h("div", { class: "fact" }, [h("b", { text: "Names & places" }),
      h("span", null, names.slice(0, 6).map(function (n) { return h("span", { class: "chip", text: n.name + " ×" + n.count }); }))]));
    if (g.title_repeat != null) kids.push(h("div", { class: "fact" }, [h("b", { text: "Titles" }),
      h("span", { text: g.title_repeat === 0 ? "Ten different titles." : pct(g.title_repeat) + " of its titles are used more than once." })]));
    if (g.closest_pair) kids.push(h("div", { class: "fact" }, [h("b", { text: "Closest pair" }),
      h("span", { text: "“" + (g.closest_pair.title_a || "untitled") + "” and “" + (g.closest_pair.title_b || "untitled") + "” (" + pct(g.closest_pair.similarity) + " alike)" })]));
    kids.push(h("div", { class: "meta", text: "self-overlap " + cell(g.self_overlap, "self_overlap") + " · distinct-2 " + cell(g.distinct_2) +
      (g.spread != null ? " · spread " + g.spread.toFixed(3) : "") }));
    return h("div", { class: "card" }, kids);
  }

  // ---- 4. Could a simple detector tell? --------------------------------------------
  var D = data.detect;
  if (D && D.base && D.base.kinds) detector(D);

  function detector(D) {
    var K = D.base.kinds;
    function frac(r, f) { return r && r[f] != null ? Math.round(r[f] * (f === "fpr" ? r.n_human : r.n_model)) : null; }
    function rate(r, f) { return r && r[f] != null ? (r[f] * 100).toFixed(r[f] > 0 && r[f] < 0.1 ? 1 : 0) + "%" : "–"; }
    el.appendChild(h("h3", { class: "part", text: "Could a simple detector tell?" }));
    el.appendChild(h("p", { class: "note", text: "On the map the two kinds of writing sit apart, so we tried the plainest detector there is: " +
      "a logistic regression, one straight cut through the same 1,536 numbers that place each story on the map. " +
      "Every text was scored by a detector that had never seen its writer. We held out one writer at a time (a model with its thinking variant, " +
      "a group of ten Reddit writers, a classic author, this site’s author), trained on everything else, and scored only what was held out. " +
      "A score of 50% or more means “written by AI”." }));
    var krows = [["reddit", "Reddit writers", "wp", "fpr", "humans called AI"], ["gutenberg", "Classic authors", "gb", "fpr", "humans called AI"],
      ["author", AUTHOR, "ax", "fpr", "humans called AI"], ["gpt", "GPT stories", "openai", "fnr", "models called human"],
      ["claude", "Claude stories", "anthropic", "fnr", "models called human"]];
    el.appendChild(h("div", { class: "table-wrap" }, [h("table", { class: "data detect" }, [
      h("thead", null, [h("tr", null, [h("th", { text: "Writer" }), h("th", { class: "num", text: "Texts" }), h("th", { text: "Mistake" }),
        h("th", { class: "num", text: "Wrong" }), h("th", { class: "num", text: "Rate" })])]),
      h("tbody", null, krows.filter(function (r) { return K[r[0]] && (K[r[0]].n_human || K[r[0]].n_model); }).map(function (r) {
        var g = K[r[0]], n = r[3] === "fpr" ? g.n_human : g.n_model;
        return h("tr", null, [h("td", null, [h("span", { class: "who" }, [h("span", { class: "dot " + r[2] }), r[1]])]),
          h("td", { class: "num", text: String(n) }), h("td", { text: r[4] }),
          h("td", { class: "num", text: String(frac(g, r[3])) }), h("td", { class: "num", text: rate(g, r[3]) })]);
      }))])]));
    var ms = (D.base.models || []).slice().sort(function (a, b) { return (b.fnr || 0) - (a.fnr || 0) || a.mean_p_model - b.mean_p_model; });
    if (ms.length) el.appendChild(h("p", { class: "note" }, ["Hardest to catch, by the detector’s average score for their ten stories: "].concat(
      ms.slice(0, 5).map(function (m, i) {
        return h("span", null, [i ? ", " : "", Zoo.name(m.model), " " + Math.round(m.mean_p_model * 100) + "%" + (m.fnr ? " (" + frac(m, "fnr") + " of " + m.n_model + " missed)" : "")]);
      }), [ms[0].fnr ? "." : ". No model had a story missed, so these are only the least certain calls."])));

    var M = D.matched;
    if (!M) return;
    el.appendChild(h("h4", { class: "sub", text: "Is it the writer, or the subject?" }));
    var nWpP = (M.humans_new && M.humans_new.reddit.n_human) || 0, nM = (D.models_matched || []).length;
    el.appendChild(h("p", { class: "note", text: "That test is easy in a way that has nothing to do with authorship. Every model answered the same one-line request, " +
      "while each Reddit writer answered a different prompt and the classic authors and this site’s author wrote about other things entirely. " +
      "So we built a topic-matched set. " + nM + " models, old and new from both families, each wrote a story of about 300 words for the actual prompts of " +
      nWpP + " of the Reddit stories, and three 300-word essay passages for each title of this site’s author’s ten sampled essays (they saw only the titles). " +
      "No prompt or title was on both sides of a split: each one went into one of " + D.k_topic + " folds, and a detector being tested on a fold never trained on any text from it." }));
    function aucF(x) { return x == null ? "–" : x > 0.9995 && x < 1 ? x.toFixed(4) : x.toFixed(3); }
    function cellR(r, f) { return r && r[f] != null ? rate(r, f) + " (" + frac(r, f) + "/" + (f === "fpr" ? r.n_human : r.n_model) + ")" : "–"; }
    var hdr = ["", "Free stories: models missed", "Matched, same detector: models missed", "Matched, retrained: models missed", "Matched, retrained: humans called AI", "Retrained AUC"];
    el.appendChild(h("div", { class: "table-wrap" }, [h("table", { class: "data detect" }, [
      h("thead", null, [h("tr", null, hdr.map(function (t, i) { return h("th", { class: i ? "num wrap" : "", text: t }); }))]),
      h("tbody", null, M.rows.map(function (r) {
        var who = (r.family === "gpt" ? "GPT" : "Claude") + (r.genre === "stories" ? " stories on the Reddit prompts" : " essays on the author’s titles");
        return h("tr", null, [h("td", null, [h("span", { class: "who" }, [h("span", { class: "dot " + (r.family === "gpt" ? "openai" : "anthropic") }), who])]),
          h("td", { class: "num", text: cellR(r.unmatched, "fnr") }), h("td", { class: "num", text: cellR(r.matched_old, "fnr") }),
          h("td", { class: "num", text: cellR(r.matched_new, "fnr") }), h("td", { class: "num", text: cellR(r.matched_new, "fpr") }),
          h("td", { class: "num", text: aucF(r.matched_new.auc) })]);
      }))])]));
    el.appendChild(h("p", { class: "note", text: "“Same detector” is the one from the table above, trained only on the free stories and the human texts. " +
      "“Retrained” also learns from the matched texts of the other models and the other folds. " +
      "AUC is the chance that a random model text scores above a random human one: 1.000 is a perfect ranking, 0.5 a coin toss. " +
      "Human rates in each row are for the Reddit stories whose prompts were used, or for this site’s ten passages." }));

    var mh = (M.models || []).map(function (m) {
      var n = 0, newMiss = 0, oldMiss = 0;
      ["stories", "essays"].forEach(function (g) { n += m[g].new.n_model; newMiss += frac(m[g].new, "fnr"); oldMiss += frac(m[g].old, "fnr"); });
      return { model: m.model, n: n, newMiss: newMiss, oldMiss: oldMiss };
    }).sort(function (a, b) { return b.newMiss - a.newMiss || b.oldMiss - a.oldMiss; });
    if (mh.length) el.appendChild(h("p", { class: "note" }, ["Hardest to catch on the matched texts: "].concat(mh.slice(0, 3).map(function (m, i) {
      return h("span", null, [i ? "; " : "", Zoo.name(m.model), " " + m.newMiss + " of " + m.n + " missed after retraining, " + m.oldMiss + " by the first detector"]);
    }), ["."])));

    var Ds = D.distances || {};
    var dl = [];
    if (Ds.stories) dl.push("a Reddit story sits " + Ds.stories.unmatched.toFixed(2) + " from the models’ free stories but " + Ds.stories.matched.toFixed(2) +
      " from model stories written to its own prompt; two Reddit stories sit " + Ds.stories.human_human.toFixed(2) + " apart");
    if (Ds.essays) dl.push("a passage by this site’s author sits " + Ds.essays.unmatched.toFixed(2) + " from the free stories and " + Ds.essays.matched.toFixed(2) +
      " from model essays on its own title; two of the author’s passages sit " + Ds.essays.human_human.toFixed(2) + " apart");
    if (dl.length) el.appendChild(h("p", { class: "note", text: "In the full 1,536 numbers (cosine distance: 0 is the same direction, larger is further), " + dl.join("; ") + "." }));

    var mp = D.map || [];
    if (mp.length && pts.length) {
      el.appendChild(h("div", { class: "legend" }, [
        h("span", null, [h("span", { class: "dot openai" }), "GPT, matched"]),
        h("span", null, [h("span", { class: "dot anthropic" }), "Claude, matched"]),
        h("span", null, [h("span", { class: "dot sq" }), "squares: essays"]),
        h("span", null, [h("span", { class: "dot bgpt" }), "grey: the free stories"]),
        h("span", null, [h("span", { class: "dot wp faint" }), "faint: the human texts"])]));
      var all2 = pts.concat(mp);
      var X0 = Math.min.apply(null, all2.map(function (p) { return p.x; })), X1 = Math.max.apply(null, all2.map(function (p) { return p.x; }));
      var Y0 = Math.min.apply(null, all2.map(function (p) { return p.y; })), Y1 = Math.max.apply(null, all2.map(function (p) { return p.y; }));
      var MW = 720, MH = 440, MP = 14;
      var tx = function (v) { return (MP + (MW - 2 * MP) * (v - X0) / ((X1 - X0) || 1)).toFixed(1); };
      var ty = function (v) { return (MH - MP - (MH - 2 * MP) * (v - Y0) / ((Y1 - Y0) || 1)).toFixed(1); };
      var s2 = document.createElementNS(NS, "svg");
      s2.setAttribute("viewBox", "0 0 " + MW + " " + MH);
      s2.setAttribute("class", "map");
      s2.setAttribute("role", "img");
      s2.setAttribute("aria-label", "The story map again, with " + mp.length + " topic-matched model texts added");
      pts.forEach(function (p) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", tx(p.x)); c.setAttribute("cy", ty(p.y)); c.setAttribute("r", 3);
        var g = G[p.group] || { kind: "model" };
        c.setAttribute("class", g.kind === "model" ? "pt bg" : "pt faint " + cls(p.group));
        s2.appendChild(c);
      });
      mp.forEach(function (p) {
        var c, cx = tx(p.x), cy = ty(p.y);
        if (p.set === "essay") {
          c = document.createElementNS(NS, "rect");
          c.setAttribute("x", (cx - 3.5).toFixed(1)); c.setAttribute("y", (cy - 3.5).toFixed(1)); c.setAttribute("width", 7); c.setAttribute("height", 7);
        } else {
          c = document.createElementNS(NS, "circle");
          c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", 4);
        }
        c.setAttribute("class", "pt " + (p.kind === "gpt" ? "openai" : "anthropic"));
        c.setAttribute("data-tip", Zoo.model(p.model).label + (p.set === "essay" ? ", an essay passage on one of the author’s titles" : ", a story for a Reddit prompt"));
        s2.appendChild(c);
      });
      el.appendChild(h("div", { class: "mapwrap" }, [s2]));
      el.appendChild(h("p", { class: "note", text: "The same two axes as the map above, with its free model stories in grey and its human texts faint. " +
        "The axes were fitted without the matched texts, so this shows where they land, not a new layout." }));
    }
    el.appendChild(h("div", { class: "how one" }, [para("What this does and does not show", HONEST(D))]));
  }

  // The closing paragraph's numbers come from the data, so it stays true if the data is rebuilt.
  function HONEST(D) {
    var R = D.matched.rows, Ds = D.distances || {};
    function span(f) {
      var v = R.map(f).filter(function (x) { return x != null; });
      return [Math.min.apply(null, v), Math.max.apply(null, v)];
    }
    var miss = span(function (r) { return r.matched_old.fnr; }), au = span(function (r) { return r.matched_new.auc; });
    var auOld = span(function (r) { return r.matched_old.auc; });
    var f3 = function (x) { return x > 0.9995 && x < 1 ? x.toFixed(4) : x.toFixed(3); };
    var axNew = D.matched.humans_new.author, axWrong = Math.round((axNew.fpr || 0) * axNew.n_human);
    var p100 = function (x) { return Math.round(x * 100) + "%"; };
    var shows = "On these texts, a plain linear cut through the embeddings finds a signal that survives topic matching, but the clean split on the map is partly topic and format. ";
    if (Ds.stories) shows += "Given the same prompt, model stories move much closer to the human ones: a Reddit story sits nearer the model stories written to its own prompt (" +
      Ds.stories.matched.toFixed(2) + ") than to another Reddit story (" + Ds.stories.human_human.toFixed(2) + "). ";
    shows += "The detector trained on the free stories looked perfect, yet missed " + p100(miss[0]) + " to " + p100(miss[1]) +
      " of the matched model texts. It still ranked most model texts above the humans (AUC " + f3(auOld[0]) + " to " + f3(auOld[1]) +
      "), so what broke was where its 50% line sat: the line had been placed partly by subject. Retrained with matched texts, it again ranked model above human almost every time (AUC " +
      f3(au[0]) + " to " + f3(au[1]) + ") and put its line back in the gap.";
    return [
      ["What it shows.", shows],
      ["What it does not show.", "This is not a usable detector. The humans are few: 50 Reddit stories and ten passages by one author on the matched side, against " +
        D.map.length + " model texts. The models wrote at their default settings, with no attempt to sound human, and every text is about 300 words. " +
        (axWrong ? "After retraining, " + axWrong + " of this site’s author’s ten passages was called AI. One in ten, from ten, is not a rate to rely on either way. " : "") +
        "A different group of human writers, a model told to write like a person, edited or mixed text, or a different embedding model could each move these numbers."],
      ["How real detectors differ.", "Dedicated detectors, Pangram for example, train much larger classifiers on human and AI texts matched for topic, with hard-negative mining: " +
        "they seek out the human texts their model gets wrong and train on those. The second half of this test is a small version of the first idea, and it shows why it matters. " +
        "We make no claim about any product’s accuracy."]];
  }

  // ---- 5. Method ---------------------------------------------------------------------
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
