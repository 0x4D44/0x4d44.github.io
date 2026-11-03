/* Chapter: Pick a number. 10x10 heatmaps, one per model, against a true-random control. */
Zoo.chapter("numbers", ["numbers"], function (el, data) {
  var h = Zoo.h, N = data.numbers;

  Zoo.head(el, "Chapter 1", "Pick a number",
    "Ask a language model for a random number and you get its <em>favourite</em> number. Each grid below is one model: the hundred cells are 1 to 100, and the darker a cell, the more often that model picked it. A fair die would scatter light speckles everywhere; the models keep landing on the same few squares.");

  var views = [
    { value: "q01-number", label: "1–100, ten tries each" },
    { value: "q31-rand-single", label: "1–100, a hundred tries (six models)" },
    { value: "q32-rand-list", label: "“Give me 100 random numbers”" },
    { value: "q29-number-10", label: "1–10" },
  ];
  var body = h("div");
  el.appendChild(Zoo.toggles(views, "q01-number", draw));
  el.appendChild(h("div", { class: "ramp" }, ["never picked",
    h("i", { style: "background:var(--seq-0)" }), h("i", { style: "background:var(--seq-2)" }),
    h("i", { style: "background:var(--seq-4)" }), h("i", { style: "background:var(--seq-7)" }),
    "picked most"]));
  el.appendChild(body);
  draw("q01-number");

  function grid(stats, lo, hi, unit) {
    var counts = stats.counts || {}, max = 0, k;
    for (k in counts) max = Math.max(max, counts[k]);
    var g = h("div", { class: "heat", role: "img",
      "aria-label": "Most picked: " + (stats.top ? stats.top[0] + " (" + stats.top[1] + " of " + stats.n + ")" : "none") });
    if (hi - lo < 10) g.style.gridTemplateColumns = "repeat(" + (hi - lo + 1) + ", 1fr)";
    for (var i = lo; i <= hi; i++) {
      var c = counts[i] || 0;
      g.appendChild(h("i", { style: "background:" + Zoo.seq(max ? c / max : 0),
        "data-tip": i + ": picked " + c + " of " + stats.n + " " + unit }));
    }
    return g;
  }

  function card(title, stats, lo, hi, unit, extra) {
    var top = stats.top ? "favourite " + stats.top[0] + " (" + Math.round(100 * stats.top[1] / stats.n) + "%)" : "";
    return h("div", { class: "card" }, [title, grid(stats, lo, hi, unit),
      h("div", { class: "meta", text: [(stats.distinct === 1 ? "the same number" : stats.distinct + " different numbers") +
        " in " + stats.n, top, extra].filter(Boolean).join(" · ") })]);
  }

  function draw(qid) {
    body.innerHTML = "";
    var q = N[qid], lo = 1, hi = qid === "q29-number-10" ? 10 : 100;
    body.appendChild(h("p", { class: "prompt", text: q.prompt }));
    var cards = h("div", { class: "grid" });
    var baseline = qid === "q32-rand-list" ? q.baseline : qid === "q29-number-10" ? null : N.baseline_single;
    if (baseline) {
      cards.appendChild(card(h("h3", null, ["True random (Python’s generator)"]), baseline, lo, hi,
        qid === "q32-rand-list" ? "numbers" : "draws",
        qid === "q32-rand-list" ? "≈" + baseline.mean_distinct + " distinct per list" : ""));
    }
    Zoo.order(Object.keys(q.models)).forEach(function (m) {
      var s = q.models[m];
      if (!s || !s.n) return;
      var extra = "";
      if (qid === "q32-rand-list") extra = s.mean_distinct + " distinct per list (true random: ≈" + q.expected_distinct + ")";
      cards.appendChild(card(Zoo.cardHead(m), s, lo, hi, qid === "q32-rand-list" ? "numbers" : "tries", extra));
    });
    body.appendChild(cards);

    if (qid === "q32-rand-list") {
      body.appendChild(h("p", { class: "note", html:
        "Draw 100 numbers from 1–100 at random and about 37 of them will be repeats, leaving roughly " + q.expected_distinct +
        " different values. Models asked for a list avoid repeats, because repeats <em>look</em> non-random. That is the same mistake people make. " +
        "A χ² near 99 is what a fair source scores; far lower means suspiciously even, far higher means lumpy." }));
    }
    var rows = Zoo.order(Object.keys(q.models)).map(function (m) {
      var s = q.models[m];
      return h("tr", null, [h("td", null, [Zoo.name(m)]), h("td", { class: "num", text: String(s.n) }),
        h("td", { class: "num", text: String(s.distinct) }),
        h("td", { class: "num", text: s.top ? s.top[0] + " ×" + s.top[1] : "–" }),
        h("td", { class: "num", text: s.entropy == null ? "–" : s.entropy.toFixed(2) }),
        h("td", { class: "num", text: s.chi2 == null ? "–" : String(s.chi2) })]);
    });
    body.appendChild(h("details", { class: "tableview" }, [h("summary", { text: "Table view" }),
      h("div", { class: "table-wrap" }, [h("table", { class: "data" }, [
        h("thead", null, [h("tr", null, ["Model", "Answers", "Distinct", "Favourite", "Entropy (bits)", "χ²"].map(function (t, i) {
          return h("th", { class: i ? "num" : null, text: t }); }))]),
        h("tbody", null, rows)])])]));
  }
});
