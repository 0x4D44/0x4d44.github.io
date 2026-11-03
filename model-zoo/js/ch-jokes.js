/* Chapter: Joke machines. Each model wrote a small HTML program; readers run one at a time.
   Model HTML only ever reaches the page through Sandbox.mountProgram (a script-only iframe
   with no access to this page and no network), and only when the reader asks. */
Zoo.chapter("jokes", ["jokes"], function (el, data) {
  var h = Zoo.h, J = data.jokes, M = J.models || {};

  Zoo.head(el, "Chapter 5", "Joke machines",
    "Every model was asked to write a tiny web page that tells Scottish jokes. Press <em>Run it</em> to start one: " +
    "it runs in a sealed frame that cannot see this page, read your cookies or reach the internet. " +
    "Nothing runs until you ask, and the code is shown exactly as the model wrote it.",
    J.prompt);

  var ids = Zoo.order(Object.keys(M));
  if (!ids.length) {
    el.appendChild(h("p", { class: "note", text: "The joke machines are still being collected." }));
    return;
  }
  var grid = h("div", { class: "grid wide" });
  ids.forEach(function (id) { grid.appendChild(card(id, M[id])); });
  el.appendChild(grid);

  function card(id, r) {
    var html = Sandbox.extractHtml(r.text || "");
    var stage = h("div", { class: "stage" });
    var kids = [Zoo.cardHead(id)];
    if (!html) {
      stage.classList.add("empty");
      stage.appendChild(h("p", { text: r.incomplete ? "No program: it ran out of tokens before finishing." :
        (r.text ? "No program: the reply had no HTML we could find." : "No program: the reply was empty.") }));
      kids.push(stage);
    } else {
      var lines = html.split("\n").length;
      var btn = h("button", { type: "button", class: "run", text: "Run it" });
      stage.appendChild(btn);
      stage.appendChild(h("span", { class: "size", text: lines.toLocaleString() + " lines of HTML" }));
      btn.addEventListener("click", function () {
        if (stage.querySelector("iframe")) {  // reload: drop the old frame and start fresh
          stage.removeChild(stage.querySelector("iframe"));
        } else {
          btn.textContent = "Restart";
          stage.classList.add("on");
        }
        Sandbox.mountProgram(stage, html, { height: 340, title: Zoo.model(id).label + "'s joke machine (sandboxed)" });
      });
      kids.push(stage);
      kids.push(h("details", { class: "source" }, [h("summary", { text: "View source" }), h("pre", null, [h("code", { text: html })])]));
    }
    kids.push(Zoo.metaLine(r));
    return h("div", { class: "card" }, kids);
  }
});
