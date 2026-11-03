/* Chapter: The relay. One story, one sentence per model, oldest model first. */
Zoo.chapter("relay", ["relay"], function (el, data) {
  var h = Zoo.h, R = data.relay;

  Zoo.head(el, "Chapter 3", "The relay",
    "Every model wrote one sentence of the same story. Each saw the story so far and added a single sentence; " +
    "we encouraged a twist, so pivots were welcome. The oldest model started it and the newest finished it. " +
    "Hover over a sentence to see who wrote it.");

  var keys = Object.keys(R).sort();
  if (!keys.length) { el.appendChild(h("p", { class: "note", text: "The relay has not been run yet." })); return; }

  keys.forEach(function (k) {
    var turns = R[k].slice().sort(function (a, b) { return a.turn - b.turn; });
    var wrap = h("div", { class: "story" });
    if (keys.length > 1) wrap.appendChild(h("h3", { class: "sub", text: "Relay " + k }));

    // Prose: paragraphs of about six sentences, each sentence its own hover target.
    var story = h("div", { class: "relay" }), p = null, inPara = 0;
    turns.forEach(function (t) {
      if (!t.ok || !t.sentence) return;
      if (!p || inPara >= 6) { p = h("p"); story.appendChild(p); inPara = 0; }
      var m = Zoo.model(t.model);
      p.appendChild(h("span", { class: "s", tabindex: "0", "data-tip": "Turn " + t.turn + " · " + m.label }, [t.sentence]));
      p.appendChild(document.createTextNode(" "));
      inPara++;
    });
    wrap.appendChild(story);

    var ok = turns.filter(function (t) { return t.ok && t.sentence; });
    var cost = turns.reduce(function (s, t) { return s + (t.cost || 0); }, 0);
    var words = ok.reduce(function (s, t) { return s + t.sentence.split(/\s+/).length; }, 0);
    wrap.appendChild(h("p", { class: "note", text: ok.length + " sentences, " + words + " words, " + Zoo.money(cost) +
      (turns.length > ok.length ? "; " + (turns.length - ok.length) + " turn" + (turns.length - ok.length > 1 ? "s" : "") + " skipped" : "") + "." }));

    var rows = turns.map(function (t) {
      var good = t.ok && t.sentence;
      return h("tr", { class: good ? null : "skipped" }, [
        h("td", { class: "num", text: String(t.turn) }),
        h("td", null, [Zoo.name(t.model)]),
        h("td", { class: "sent", text: good ? t.sentence : "skipped (no usable sentence)" }),
        h("td", { class: "num", text: Zoo.secs(t.secs) }),
        h("td", { class: "num", text: Zoo.money(t.cost) })]);
    });
    wrap.appendChild(h("details", { class: "tableview" }, [h("summary", { text: "Table view: turn by turn" }),
      h("div", { class: "table-wrap" }, [h("table", { class: "data" }, [
        h("thead", null, [h("tr", null, ["Turn", "Model", "Sentence", "Time", "Cost"].map(function (t, i) {
          return h("th", { class: i === 0 || i > 2 ? "num" : null, text: t }); }))]),
        h("tbody", null, rows)])])]));
    el.appendChild(wrap);
  });
});
