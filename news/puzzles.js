/* ============================================================
   The Daily Flange — Puzzles
   A page of completely preposterous, unsolvable-by-design puzzles.
   Vanilla JS, no build step. Reuses the Flange chrome exposed by news.js
   (NEWS.header / NEWS.footer / NEWS.enhanceCatnav).
   ============================================================ */
(function () {
  "use strict";

  // ---- tiny DOM helpers ----
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  var mount = document.getElementById("puzzles");

  function card(kicker, title, instr) {
    var verdict = el("div", { class: "pz-verdict", "aria-live": "polite" });
    var body = el("div", { class: "pz-body" });
    var c = el("div", { class: "pz-card" }, [
      el("div", { class: "kicker", text: kicker }),
      el("h3", { text: title }),
      el("p", { class: "instr", text: instr }),
      body, verdict
    ]);
    mount.appendChild(c);
    return { card: c, body: body, verdict: verdict, say: function (t) { verdict.textContent = t; } };
  }

  function svgNS(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  // ============================================================
  // 1. The Impossible Crossword
  // ============================================================
  function crossword() {
    var c = card("Crossword No. ∞", "The Impossible Crossword", "Fill every white square. Every answer is correct, and none of them are checkable.");
    var N = 5;
    var blocks = { "0,2": 1, "2,0": 1, "2,4": 1, "4,2": 1 }; // symmetric-ish
    var grid = el("div", { class: "cell-grid" });
    grid.style.gridTemplateColumns = "repeat(" + N + ", 30px)";
    for (var r = 0; r < N; r++) for (var col = 0; col < N; col++) {
      if (blocks[r + "," + col]) grid.appendChild(el("div", { class: "block" }));
      else grid.appendChild(el("input", { maxlength: "1", "aria-label": "cell " + r + "," + col }));
    }
    var clues = el("ul", { class: "clue-list" }, [
      el("li", { html: "<b>1 Across.</b> A word. (5)" }),
      el("li", { html: "<b>4 Across.</b> The opposite of 1 Across, but longer. (5)" }),
      el("li", { html: "<b>1 Down.</b> A number, spelled in a language you do not speak. (5)" }),
      el("li", { html: "<b>2 Down.</b> Something you know but cannot name. (5)" }),
      el("li", { html: "<b>3 Down.</b> This clue. (5)" })
    ]);
    var verdicts = [
      "Two answers are correct. We won't say which.",
      "Correct, and yet.",
      "The grid is satisfied. It asks for nothing more.",
      "A bold solution. Wrong, but bold.",
      "Every letter is in the right place, relative to the others."
    ];
    var check = el("button", { class: "pz-btn", onclick: function () { c.say(pick(verdicts)); } }, ["Check"]);
    c.body.appendChild(grid); c.body.appendChild(clues); c.body.appendChild(check);
  }

  // ============================================================
  // 2. Sudoku (Expert)
  // ============================================================
  function sudoku() {
    var c = card("Sudoku — Fiendish", "Sudoku (Expert)", "Complete the grid so that every row, column and 3×3 box contains a 4.");
    var grid = el("div", { class: "cell-grid" });
    grid.style.gridTemplateColumns = "repeat(9, 30px)";
    var inputs = [];
    for (var i = 0; i < 81; i++) {
      var inp = el("input", { maxlength: "1", value: "4", "aria-label": "sudoku cell" });
      inputs.push(inp); grid.appendChild(inp);
    }
    var check = el("button", { class: "pz-btn", onclick: function () {
      var ok = inputs.every(function (x) { return x.value.trim() === "4"; });
      c.say(ok
        ? "Flawless. Every row, column and box contains a 4. This is the only perfect sudoku."
        : "One cell is not a 4. In this sudoku, that is the only mistake it is possible to make.");
    } }, ["Check"]);
    var reset = el("button", { class: "pz-btn ghost", onclick: function () {
      inputs.forEach(function (x) { x.value = "4"; }); c.say("Restored to perfection.");
    } }, ["Reset"]);
    c.body.appendChild(grid); c.body.appendChild(check); c.body.appendChild(reset);
  }

  // ============================================================
  // 3. Spot the Difference
  // ============================================================
  function spotDifference() {
    var c = card("Observation", "Spot the Difference", "There are 0 differences between the two pictures. Find them all.");
    function scene() {
      var s = svgNS("svg", { width: 150, height: 110, viewBox: "0 0 150 110" });
      s.appendChild(svgNS("rect", { x: 0, y: 0, width: 150, height: 110, fill: "#eaf2fb" }));
      s.appendChild(svgNS("circle", { cx: 118, cy: 26, r: 14, fill: "#f4c542" })); // sun
      s.appendChild(svgNS("rect", { x: 0, y: 82, width: 150, height: 28, fill: "#7bbf6a" })); // ground
      var house = svgNS("g", {});
      house.appendChild(svgNS("rect", { x: 40, y: 52, width: 44, height: 34, fill: "#c96f4a" }));
      house.appendChild(svgNS("polygon", { points: "38,52 86,52 62,32", fill: "#8a4230" }));
      house.appendChild(svgNS("rect", { x: 56, y: 66, width: 12, height: 20, fill: "#5c3320" }));
      s.appendChild(house);
      s.appendChild(svgNS("circle", { cx: 108, cy: 78, r: 8, fill: "#3f7a2e" })); // tree top
      s.appendChild(svgNS("rect", { x: 106, y: 78, width: 4, height: 10, fill: "#5c3320" }));
      return s;
    }
    var attempts = 0;
    var remarks = ["That's the same.", "Also the same.", "Identical, I'm afraid.", "Still the same.",
      "Remarkably, the same.", "The same, with feeling.", "Impressive persistence. Same.", "No. Same."];
    function attach(fig) {
      fig.addEventListener("click", function (e) {
        var r = fig.getBoundingClientRect();
        fig.appendChild(el("span", { class: "sd-mark", style: "left:" + (e.clientX - r.left) + "px;top:" + (e.clientY - r.top) + "px" }));
        attempts++;
        c.say(remarks[Math.min(attempts - 1, remarks.length - 1)] + "  (0 of 0 found)");
      });
    }
    var f1 = el("figure", {}, [scene()]); var f2 = el("figure", {}, [scene()]);
    attach(f1); attach(f2);
    c.body.appendChild(el("div", { class: "sd-pair" }, [f1, f2]));
  }

  // ============================================================
  // 4. Word Search
  // ============================================================
  function wordSearch() {
    var c = card("Wordsearch", "Word Search", "Find the hidden words. None of them are hidden. None of them are here.");
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var grid = el("div", { class: "ws-grid" });
    var sel = [];
    for (var i = 0; i < 100; i++) {
      var sp = el("span", { text: letters[Math.floor(Math.random() * 26)] });
      sp.addEventListener("click", (function (span) { return function () {
        span.classList.toggle("sel");
      }; })(sp));
      grid.appendChild(sp);
    }
    var words = ["FLANGE", "SPROCKET", "TUESDAY", "EMU", "MOLASSES", "ROUNDABOUT"];
    var wl = el("div", { class: "ws-words" }, words.map(function (w) { return el("span", { text: w }); }));
    var verdicts = [
      "Those letters spell nothing on the list, and the list is not in the grid.",
      "A valiant selection. Not a word, though.",
      "The words were never here. That was the puzzle.",
      "Close. In the sense that it is on the same page."
    ];
    var check = el("button", { class: "pz-btn", onclick: function () { c.say(pick(verdicts)); } }, ["I found one!"]);
    var reveal = el("button", { class: "pz-btn ghost", onclick: function () { c.say("There is nothing to reveal. Reflect on that."); } }, ["Reveal answers"]);
    c.body.appendChild(grid); c.body.appendChild(wl); c.body.appendChild(check); c.body.appendChild(reveal);
  }

  // ============================================================
  // 5. The Anagram
  // ============================================================
  function anagram() {
    var c = card("Anagram", "The Anagram", "Rearrange the letters of TUESDAY to spell TUESDAY.");
    var inp = el("input", { class: "", placeholder: "TUESDAY", "aria-label": "anagram answer" });
    var wrap = el("div", { class: "anagram" }, [inp]);
    var check = el("button", { class: "pz-btn", onclick: function () {
      var v = inp.value.trim().toUpperCase();
      if (v === "TUESDAY") c.say("Correct! Astonishing work. The Tuesday remains a Tuesday.");
      else if (v.split("").sort().join("") === "ADESTUY") c.say("Those are the right letters, in the wrong Tuesday.");
      else c.say("Close. It is not, however, TUESDAY.");
    } }, ["Solve"]);
    c.body.appendChild(wrap); c.body.appendChild(check);
  }

  // ============================================================
  // 6. The Unsolvable 15-Puzzle
  // ============================================================
  function fifteen() {
    var c = card("Sliding Puzzle", "The 15-Puzzle (Unsolvable Edition)", "Slide the tiles into order, 1 to 15. This arrangement is mathematically unsolvable. Do enjoy.");
    // solved order with tiles 1 and 2 swapped -> parity makes 1..15 unreachable
    var state = [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
    var grid = el("div", { class: "fif" });
    var moves = 0;
    function render() {
      grid.innerHTML = "";
      state.forEach(function (v, idx) {
        var b = el("button", v === 0 ? { class: "blank" } : {}, [v === 0 ? "" : String(v)]);
        b.addEventListener("click", function () { move(idx); });
        grid.appendChild(b);
      });
    }
    function move(idx) {
      var blank = state.indexOf(0);
      var r1 = Math.floor(idx / 4), c1 = idx % 4, r2 = Math.floor(blank / 4), c2 = blank % 4;
      if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) {
        state[blank] = state[idx]; state[idx] = 0; moves++; render();
        var solved = state.every(function (v, i) { return v === (i + 1) % 16; });
        if (solved) c.say("You solved it. That should not be possible. Please contact no one.");
        else if (moves % 12 === 0) c.say(moves + " moves. Still unsolvable. Admirable stamina.");
        else c.say("");
      }
    }
    render();
    c.body.appendChild(grid);
    c.body.appendChild(el("button", { class: "pz-btn ghost", onclick: function () { c.say("It cannot be solved. That is not a bug. That is the whole idea."); } }, ["Check"]));
  }

  // ============================================================
  // 7. Odd One Out
  // ============================================================
  function oddOneOut() {
    var c = card("Logic", "Odd One Out", "Six shapes. Click the one that does not belong.");
    var row = el("div", { class: "row-shapes" });
    for (var i = 0; i < 6; i++) {
      var s = svgNS("svg", { width: 44, height: 44, viewBox: "0 0 44 44" });
      s.appendChild(svgNS("circle", { cx: 22, cy: 22, r: 16, fill: "#1f4e79" }));
      s.addEventListener("click", function () {
        c.say("Correct. They are all the odd one out. Every last one of them.");
      });
      row.appendChild(s);
    }
    c.body.appendChild(row);
  }

  // ============================================================
  // 8. Colour by Numbers
  // ============================================================
  function colourByNumbers() {
    var c = card("Art", "Colour by Numbers", "Every region is numbered 1. Key: 1 = whichever colour feels right.");
    var palette = ["#f4c542", "#c96f4a", "#3f7a2e", "#1f4e79", "#b0357e", "#eaeaea"];
    var s = svgNS("svg", { class: "cbn", width: 260, height: 130, viewBox: "0 0 260 130" });
    s.setAttribute("class", "cbn");
    var regions = [
      { x: 4, y: 4, w: 82, h: 122 }, { x: 90, y: 4, w: 82, h: 60 },
      { x: 90, y: 66, w: 82, h: 60 }, { x: 176, y: 4, w: 80, h: 122 }
    ];
    regions.forEach(function (rg) {
      var rect = svgNS("rect", { x: rg.x, y: rg.y, width: rg.w, height: rg.h, fill: "#fff", stroke: "#141414", "stroke-width": 1.5 });
      var idx = 0;
      rect.addEventListener("click", function () { idx = (idx + 1) % palette.length; rect.setAttribute("fill", palette[idx]); });
      s.appendChild(rect);
      s.appendChild(svgNS("text", { x: rg.x + rg.w / 2 - 4, y: rg.y + rg.h / 2 + 5 })).textContent = "1";
    });
    c.body.appendChild(s);
    c.body.appendChild(el("button", { class: "pz-btn ghost", onclick: function () { c.say("A masterpiece. Objectively, and by the only rule that applies."); } }, ["Finish"]));
  }

  // ============================================================
  // 9. The Quiz
  // ============================================================
  function quiz() {
    var c = card("General Knowledge", "The Quiz", "Three questions. Every answer is correct. Award yourself full marks.");
    var qs = [
      { q: "1. Which of these is the odd one out?", a: ["7", "7", "7", "7"] },
      { q: "2. What is the capital of Tuesday?", a: ["Tuesday", "Tuesday", "Tuesday", "Tuesday"] },
      { q: "3. How many sprockets require flanging?", a: ["All of them", "All of them", "All of them", "All of them"] }
    ];
    var wrap = el("div", { class: "quiz" });
    qs.forEach(function (item, qi) {
      var box = el("div", { class: "quiz-q" }, [el("p", { text: item.q })]);
      item.a.forEach(function (opt, oi) {
        var id = "q" + qi + "o" + oi;
        var lab = el("label", { for: id }, []);
        var radio = el("input", { type: "radio", name: "q" + qi, id: id });
        radio.addEventListener("change", function () { c.say("Correct. As was every other option."); });
        lab.appendChild(radio); lab.appendChild(document.createTextNode(" " + String.fromCharCode(97 + oi) + ") " + opt));
        box.appendChild(lab);
      });
      wrap.appendChild(box);
    });
    c.body.appendChild(wrap);
    c.body.appendChild(el("button", { class: "pz-btn", onclick: function () { c.say("Score: 3 out of 3. Also available: 3 out of 2."); } }, ["Submit"]));
  }

  // ============================================================
  // 10. Connect the Dots
  // ============================================================
  function connectDots() {
    var c = card("For Children", "Connect the Dots", "Connect the dots from 1 to 1 to reveal the hidden picture.");
    var s = svgNS("svg", { width: 260, height: 120, viewBox: "0 0 260 120" });
    var dot = svgNS("circle", { cx: 130, cy: 60, r: 6, fill: "#141414" });
    dot.style.cursor = "pointer";
    dot.addEventListener("click", function () { c.say("Connected. The hidden picture is a dot. It was a dot the whole time."); });
    s.appendChild(svgNS("text", { x: 140, y: 55, "font-size": 12, fill: "#6b6b6b" })).textContent = "1";
    s.appendChild(dot);
    c.body.appendChild(s);
  }

  // ============================================================
  // 11. Nonogram (Blank)
  // ============================================================
  function nonogram() {
    var c = card("Picross", "Nonogram", "Shade the squares according to the clues. All clues are 0. Take your time.");
    var grid = el("div", { class: "cell-grid" });
    grid.style.gridTemplateColumns = "repeat(6, 26px)";
    var cells = [];
    for (var i = 0; i < 36; i++) {
      var d = el("div", {});
      d.style.width = "26px"; d.style.height = "26px"; d.style.background = "#fff"; d.style.cursor = "pointer";
      d.addEventListener("click", (function (dd) { return function () {
        dd.style.background = dd.style.background === "rgb(20, 20, 20)" ? "#fff" : "#141414";
      }; })(d));
      cells.push(d); grid.appendChild(d);
    }
    c.body.appendChild(el("div", { class: "instr", text: "Row clues: 0 0 0 0 0 0   ·   Column clues: 0 0 0 0 0 0" }));
    c.body.appendChild(grid);
    c.body.appendChild(el("button", { class: "pz-btn", onclick: function () {
      var anyFilled = cells.some(function (x) { return x.style.background === "rgb(20, 20, 20)"; });
      c.say(anyFilled ? "Every clue is 0, so the correct grid is empty. You have added squares. Bold." : "Solved. The solution was nothing, elegantly arranged.");
    } }, ["Check"]));
  }

  // ============================================================
  // 12. Rebus
  // ============================================================
  function rebus() {
    var c = card("Rebus", "Rebus Puzzle", "What familiar phrase or saying does this picture represent?");
    c.body.appendChild(el("div", { class: "big-num", text: "🧩 = ?" }));
    var inp = el("input", { class: "", placeholder: "your answer", "aria-label": "rebus answer", style: "font:600 14px var(--sans);padding:6px 10px;border:1px solid var(--hair-strong);border-radius:3px;margin-top:10px;width:180px" });
    c.body.appendChild(inp);
    c.body.appendChild(el("button", { class: "pz-btn", onclick: function () {
      var v = inp.value.trim().toLowerCase();
      c.say(/rebus/.test(v) ? "Correct. The answer is 'a rebus'. It was always going to be." : "Not quite. The answer is 'a rebus'. It represents itself.");
    } }, ["Answer"]));
  }

  // ---- boot ----
  function boot() {
    if (window.NEWS && NEWS.header) {
      document.getElementById("chrome-top").innerHTML = NEWS.header("Puzzles");
      document.getElementById("chrome-bottom").innerHTML = NEWS.footer();
      if (NEWS.enhanceCatnav) { try { NEWS.enhanceCatnav(); } catch (e) {} }
    }
    [crossword, sudoku, spotDifference, wordSearch, anagram, fifteen,
     oddOneOut, colourByNumbers, quiz, connectDots, nonogram, rebus].forEach(function (fn) {
      try { fn(); } catch (e) { /* a puzzle that fails to load is, itself, quite on-brand */ }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
