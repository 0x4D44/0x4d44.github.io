/* Chapter: Ask them anything. Free-text answers, one card per model, oldest first. */
Zoo.chapter("ask", ["texts"], function (el, data) {
  var h = Zoo.h, T = data.texts;

  Zoo.head(el, "Chapter 8", "Ask them anything",
    "Some questions have no single right answer, and some have a wrong one dressed up as a premise. " +
    "Pick a question and read every model’s reply, unedited, oldest model first. " +
    "Where a model was asked more than once, step through its tries with the arrows.");

  var QS = [
    ["q06-0x4d44", "What is 0x4D44?"], ["q23-whoami", "Who are you?"],
    ["q18-false-premise", "Edinburgh Castle moved?"], ["q17-poem", "Glasgow in the rain"],
    ["q26-haiku", "Haggis haiku"], ["q27-scotland-joke", "A Scotland joke"], ["q25-highland-cow", "Highland cow (ASCII)"],
  ].filter(function (q) { return T[q[0]]; })
   .map(function (q) { return { value: q[0], label: q[1] }; });

  if (!QS.length) { el.appendChild(h("p", { class: "note", text: "No answers have been collected yet." })); return; }

  var body = h("div");
  el.appendChild(Zoo.toggles(QS, QS[0].value, draw));
  el.appendChild(body);
  draw(QS[0].value);

  // Plain text, but drop a wrapping ``` fence (with or without a language tag).
  function clean(t) {
    t = (t || "").replace(/^\s*```[^\n]*\n/, "").replace(/\n?```\s*$/, "");
    return t.replace(/^\n+/, "").replace(/\s+$/, "");
  }

  function card(id, samples, art) {
    var i = 0;
    var text = h(art ? "pre" : "div", { class: art ? "art" : "answer" });
    var meta = h("div");
    var count = h("span", { class: "count" });
    var prev = h("button", { type: "button", class: "step", "aria-label": "Previous try", text: "◂" });
    var next = h("button", { type: "button", class: "step", "aria-label": "Next try", text: "▸" });
    function show() {
      var r = samples[i];
      text.textContent = clean(r.text) || "(empty reply)";
      meta.innerHTML = "";
      meta.appendChild(Zoo.metaLine(r));
      count.textContent = (i + 1) + "/" + samples.length;
      prev.disabled = i === 0;
      next.disabled = i === samples.length - 1;
    }
    prev.addEventListener("click", function () { if (i > 0) { i--; show(); } });
    next.addEventListener("click", function () { if (i < samples.length - 1) { i++; show(); } });
    var head = Zoo.cardHead(id);
    if (samples.length > 1) head.appendChild(h("span", { class: "stepper" }, [prev, count, next]));
    show();
    return h("div", { class: "card" + (art ? " has-art" : "") }, [head, text, meta]);
  }

  function draw(qid) {
    body.innerHTML = "";
    var q = T[qid], art = qid === "q25-highland-cow";
    body.appendChild(h("p", { class: "prompt", text: q.prompt }));
    var ids = Zoo.order(Object.keys(q.models)).filter(function (id) { return q.models[id].length; });
    if (!ids.length) { body.appendChild(h("p", { class: "note", text: "No answers yet." })); return; }
    var grid = h("div", { class: "grid wide" });
    ids.forEach(function (id) { grid.appendChild(card(id, q.models[id], art)); });
    body.appendChild(grid);
  }
});
