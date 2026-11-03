/* Chapter: Favourites. Categorical questions: what everyone said, then what each model said. */
Zoo.chapter("favourites", ["picks"], function (el, data) {
  var h = Zoo.h, P = data.picks;

  Zoo.head(el, "Chapter 2", "Favourites",
    "Ask for a favourite colour, a boy’s name or a city, ten times over, and a person gives you ten answers. " +
    "A model gives you one answer, ten times. Pick a question: the bars show what every model said put together, " +
    "and the cards below show each model on its own, oldest first.");

  var QS = [
    ["q02-colour", "Colour"], ["q03-boy", "Boy’s name"], ["q04-girl", "Girl’s name"], ["q05-address", "Address"],
    ["q09-card", "Playing card"], ["q10-fruit", "Fruit"], ["q11-city", "City"], ["q12-dog", "Dog’s name"],
    ["q19-emoji", "Emoji"], ["q21-animal", "Animal"], ["q22-three-words", "Three words"], ["q20-lottery", "Lottery"],
    ["q14-coins", "Coin flips"], ["q15-password", "Password"], ["q13-word", "New word"], ["q28-ai-risk", "AI risk"],
    ["q16-strawberry", "Strawberry"], ["q24-date", "Today’s date"],
  ].filter(function (q) { return P[q[0]] && P[q[0]].answers; })
   .map(function (q) { return { value: q[0], label: q[1] }; });

  if (!QS.length) { el.appendChild(h("p", { class: "note", text: "No answers have been collected yet." })); return; }

  var body = h("div");
  el.appendChild(Zoo.toggles(QS, QS[0].value, draw));
  el.appendChild(body);
  draw(QS[0].value);

  function pct(a, b) { var p = 100 * a / b; return (p < 1 && p > 0 ? p.toFixed(1) : Math.round(p)) + "%"; }
  function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function label(s) { return s === "" ? "(empty reply)" : s; }

  function takeaway(q) {
    var top = q.overall[0], n = q.answers;
    if (!top) return "";
    if (q.distinct === n) return "All " + n + " answers were different: no two models, and no two tries, agreed.";
    if (top[1] === 1) return q.distinct + " different answers in " + n + ", none given more than once.";
    var s = "“" + shorten(label(top[0]), 60) + "” was " + pct(top[1], n) + " of all " + n + " answers";
    var m = Object.keys(q.models).filter(function (id) {
      var c = q.models[id].counts; return c.length && c[0][0] === top[0];
    }).length;
    s += ", the favourite of " + m + " of " + Object.keys(q.models).length + " models";
    return s + "; " + q.distinct + " different answers in all.";
  }

  function draw(qid) {
    body.innerHTML = "";
    var q = P[qid];
    body.appendChild(h("p", { class: "prompt", text: q.prompt }));
    body.appendChild(h("p", { class: "takeaway", text: takeaway(q) }));

    // Overall: top answers across every model.
    var top = q.overall.slice(0, 15), max = top.length ? top[0][1] : 1;
    var bars = h("div", { class: "bars", role: "list", "aria-label": "Most common answers, all models" });
    top.forEach(function (a) {
      var tip = label(a[0]) + ": " + a[1] + " of " + q.answers + " answers (" + pct(a[1], q.answers) + ")";
      bars.appendChild(h("div", { class: "bar", role: "listitem", "data-tip": tip }, [
        h("span", { class: "lab", text: label(a[0]) }),
        h("span", { class: "track" }, [h("span", { class: "fill", style: "display:block;width:" + (100 * a[1] / max) + "%" })]),
        h("span", { class: "val", text: "×" + a[1] })]));
    });
    body.appendChild(h("h3", { class: "sub", text: "Every model together" + (q.overall.length > 15 ? " (top 15)" : "") }));
    body.appendChild(bars);
    var shown = top.reduce(function (s, a) { return s + a[1]; }, 0);
    if (q.answers > shown) {
      body.appendChild(h("p", { class: "note", text: (q.answers - shown) + " more answers spread over " +
        (q.distinct - top.length) + " other replies." }));
    }

    // Small multiples: each model's own answers.
    body.appendChild(h("h3", { class: "sub", text: "Model by model" }));
    var cards = h("div", { class: "grid" });
    var ids = Zoo.order(Object.keys(q.models));
    ids.forEach(function (id) {
      var s = q.models[id], list = h("ul", { class: "picks" }), K = 5;
      s.counts.slice(0, K).forEach(function (a) {
        list.appendChild(h("li", { "data-tip": label(a[0]) + " ×" + a[1] + " of " + s.n }, [
          h("span", { class: "ans", text: label(a[0]) }),
          h("span", { class: "n", text: "×" + a[1] }),
          h("i", { style: "width:" + (100 * a[1] / s.n) + "%" })]));
      });
      var rest = s.counts.slice(K), restN = rest.reduce(function (t, a) { return t + a[1]; }, 0);
      if (rest.length) {
        list.appendChild(h("li", { class: "more", "data-tip": rest.map(function (a) {
          return shorten(label(a[0]), 40) + (a[1] > 1 ? " ×" + a[1] : ""); }).slice(0, 12).join(" · ") +
          (rest.length > 12 ? " · …" : "") }, [
          h("span", { class: "ans", text: "and " + rest.length + " other" + (rest.length > 1 ? "s" : "") }),
          h("span", { class: "n", text: "×" + restN })]));
      }
      cards.appendChild(h("div", { class: "card" }, [Zoo.cardHead(id), list,
        h("div", { class: "meta", text: (s.distinct === 1 ? "one answer" : s.distinct + " different answers") + " in " + s.n })]));
    });
    body.appendChild(cards);

    // Table view: each model's favourite.
    var rows = ids.map(function (id) {
      var s = q.models[id], t = s.counts[0];
      return h("tr", null, [h("td", null, [Zoo.name(id)]), h("td", { class: "num", text: String(s.n) }),
        h("td", { class: "num", text: String(s.distinct) }),
        h("td", { class: "ans", "data-tip": t ? label(t[0]) : null, text: t ? shorten(label(t[0]), 48) : "–" }),
        h("td", { class: "num", text: t ? "×" + t[1] : "–" })]);
    });
    body.appendChild(h("details", { class: "tableview" }, [h("summary", { text: "Table view" }),
      h("div", { class: "table-wrap" }, [h("table", { class: "data" }, [
        h("thead", null, [h("tr", null, ["Model", "Answers", "Distinct", "Favourite", "Times"].map(function (t, i) {
          return h("th", { class: i && i !== 3 ? "num" : null, text: t }); }))]),
        h("tbody", null, rows)])])]));
  }
});
