/* ============================================================
   The Daily Flange — Puzzles
   A page of completely preposterous, unsolvable-by-design puzzles.
   Vanilla JS, no build step. Reuses the Flange chrome exposed by news.js
   (NEWS.header / NEWS.footer / NEWS.enhanceCatnav).

   Each puzzle type has 14 variants that rotate on a daily cycle (seeded
   on the UTC calendar day, offset per puzzle so they don't all flip in
   lockstep) — a fortnight of flavour before any of them repeat.
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

  // ---- daily rotation: same variant all day, different variant each day,
  // desynced per puzzle so they don't all change on the same date ----
  function hashStr(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function daySeed() {
    return Math.floor(Date.now() / 86400000); // UTC calendar day
  }
  function dayIndex(name, len) {
    return (daySeed() + hashStr(name)) % len;
  }
  function pickOfDay(name, arr) {
    return arr[dayIndex(name, arr.length)];
  }

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
  var CROSSWORD_LABELS = ["1 Across.", "4 Across.", "1 Down.", "2 Down.", "3 Down."];
  var CROSSWORD_VARIANTS = [
    ["A word.", "The opposite of 1 Across, but longer.", "A number, spelled in a language you do not speak.", "Something you know but cannot name.", "This clue."],
    ["A smell, written down.", "The smell of 1 Across, if smells had smells.", "A colour only dogs can see.", "The name you would have had, in another life.", "See 3 Down."],
    ["A sound, spelled phonetically and incorrectly.", "The same sound, played backwards.", "The capital of a country that has since apologised.", "A memory that isn't yours.", "Refer to 1 Across. There is no 1 Across."],
    ["A biscuit, description withheld.", "A larger, more assertive biscuit.", "Your PIN, rendered as prose.", "The exact shade of beige.", "This clue, read aloud, to no one."],
    ["A shape with the wrong number of sides.", "The shape 1 Across wishes it were.", "A date that has not yet happened.", "A word you learned and immediately forgot.", "Ignore this clue. It is a trap. It is also correct."],
    ["A train noise, transcribed with dignity.", "The noise a delayed train makes, apologising.", "The square root of Tuesday.", "A feeling with no name in English.", "This clue refers to itself, and is proud of it."],
    ["A flavour that only exists in adverts.", "The opposite flavour, marketed identically.", "A number between two other numbers, chosen at random.", "The thing on the tip of your tongue. Still there.", "A blank clue. Fill it with confidence."],
    ["The weather, but honest.", "The forecast, corrected after the fact.", "A word that sounds rude but isn't.", "Something everyone agreed to stop mentioning.", "This clue is also 1 Down. Good luck."],
    ["A noise a printer makes when it has given up.", "The printer's apology. Also a noise.", "A country, alphabetised out of existence.", "A rule you have always followed without knowing why.", "There is no 3 Down. Write something anyway."],
    ["The taste of static.", "The opposite of static, tasted.", "A year that has not been invented.", "Something true that sounds like a lie.", "This clue is a decoy for a decoy."],
    ["A word for the space between two words.", "The same space, but wider.", "A number only committees believe in.", "A colour heard rather than seen.", "3 Down, again, differently."],
    ["A sigh, formally minuted.", "The minutes of the sigh.", "The exchange rate for regret.", "A word that means both yes and no.", "This clue has been redacted for your convenience."],
    ["A shrug, in five letters.", "A longer shrug.", "The capital of a mood.", "Something owed to no one in particular.", "See above. There is no above."],
    ["A word that used to mean something else.", "What it means now, which is also nothing.", "A number that rounds to itself.", "The last thing you were sure of.", "This clue. Again. Forever."]
  ];
  function crossword() {
    var idx = dayIndex("crossword", CROSSWORD_VARIANTS.length);
    var clueText = CROSSWORD_VARIANTS[idx];
    var c = card("Crossword No. " + (idx + 1), "The Impossible Crossword", "Fill every white square. Every answer is correct, and none of them are checkable.");
    var N = 5;
    var blocks = { "0,2": 1, "2,0": 1, "2,4": 1, "4,2": 1 }; // symmetric-ish
    var grid = el("div", { class: "cell-grid" });
    grid.style.gridTemplateColumns = "repeat(" + N + ", 30px)";
    for (var r = 0; r < N; r++) for (var col = 0; col < N; col++) {
      if (blocks[r + "," + col]) grid.appendChild(el("div", { class: "block" }));
      else grid.appendChild(el("input", { maxlength: "1", "aria-label": "cell " + r + "," + col }));
    }
    var clues = el("ul", { class: "clue-list" }, CROSSWORD_LABELS.map(function (label, i) {
      return el("li", { html: "<b>" + label + "</b> " + clueText[i] + " (5)" });
    }));
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
  var SUDOKU_VARIANTS = [
    { adjective: "Fiendish", digit: "4" }, { adjective: "Diabolical", digit: "7" },
    { adjective: "Merciless", digit: "1" }, { adjective: "Genteel", digit: "9" },
    { adjective: "Bureaucratic", digit: "3" }, { adjective: "Continental", digit: "6" },
    { adjective: "Nocturnal", digit: "2" }, { adjective: "Aggressive", digit: "8" },
    { adjective: "Wistful", digit: "5" }, { adjective: "Municipal", digit: "4" },
    { adjective: "Baroque", digit: "7" }, { adjective: "Litigious", digit: "1" },
    { adjective: "Provincial", digit: "9" }, { adjective: "Tuesday-Grade", digit: "3" }
  ];
  function sudoku() {
    var v = pickOfDay("sudoku", SUDOKU_VARIANTS);
    var c = card("Sudoku — " + v.adjective, "Sudoku (" + v.adjective + ")", "Complete the grid so that every row, column and 3×3 box contains a " + v.digit + ".");
    var grid = el("div", { class: "cell-grid" });
    grid.style.gridTemplateColumns = "repeat(9, 30px)";
    var inputs = [];
    for (var i = 0; i < 81; i++) {
      var inp = el("input", { maxlength: "1", value: v.digit, "aria-label": "sudoku cell" });
      inputs.push(inp); grid.appendChild(inp);
    }
    var check = el("button", { class: "pz-btn", onclick: function () {
      var ok = inputs.every(function (x) { return x.value.trim() === v.digit; });
      c.say(ok
        ? "Flawless. Every row, column and box contains a " + v.digit + ". This is the only perfect sudoku."
        : "One cell is not a " + v.digit + ". In this sudoku, that is the only mistake it is possible to make.");
    } }, ["Check"]);
    var reset = el("button", { class: "pz-btn ghost", onclick: function () {
      inputs.forEach(function (x) { x.value = v.digit; }); c.say("Restored to perfection.");
    } }, ["Reset"]);
    c.body.appendChild(grid); c.body.appendChild(check); c.body.appendChild(reset);
  }

  // ============================================================
  // 3. Spot the Difference
  // ============================================================
  var SCENE_NAMES = [
    "The Signal Box", "The Level Crossing", "The Cottage", "The Allotment", "The Harbour",
    "The Depot", "The Halt", "The Water Tower", "The Footbridge", "The Siding",
    "The Junction", "The Platform", "The Goods Yard", "The Terminus"
  ];
  function spotDifference() {
    var idx = dayIndex("spot-difference", SCENE_NAMES.length);
    var hue = Math.round((360 * idx) / SCENE_NAMES.length);
    var c = card("Observation · " + SCENE_NAMES[idx], "Spot the Difference", "There are 0 differences between the two pictures. Find them all.");
    function scene() {
      var s = svgNS("svg", { width: 150, height: 110, viewBox: "0 0 150 110" });
      s.style.filter = "hue-rotate(" + hue + "deg)";
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
  var WORDSEARCH_VARIANTS = [
    ["FLANGE", "SPROCKET", "TUESDAY", "EMU", "MOLASSES", "ROUNDABOUT"],
    ["GASKET", "THURSDAY", "BALLAST", "SIGNAL", "TREACLE", "CUTTING"],
    ["BOGIE", "WEDNESDAY", "GRADIENT", "POINTS", "MARMALADE", "EMBANKMENT"],
    ["COUPLING", "FRIDAY", "VIADUCT", "BUFFER", "CUSTARD", "SIDING"],
    ["FOOTPLATE", "MONDAY", "TUNNEL", "SLEEPER", "PORRIDGE", "JUNCTION"],
    ["CATENARY", "SATURDAY", "SEMAPHORE", "HALT", "BISCUIT", "GANTRY"],
    ["AXLEBOX", "SUNDAY", "CROSSOVER", "TERMINUS", "MARZIPAN", "PLATFORM"],
    ["HEADSTOCK", "TUESDAY", "INTERLOCK", "GOODSYARD", "CHUTNEY", "OVERBRIDGE"],
    ["BRAKEVAN", "THURSDAY", "TABLET", "DEPOT", "PICKLE", "CULVERT"],
    ["PANTOGRAPH", "FRIDAY", "CUTTING", "RESERVOIR", "CRUMPET", "TROUGH"],
    ["DRAWBAR", "MONDAY", "CANTILEVER", "WAGON", "JAM", "EMBANKMENT"],
    ["FISHPLATE", "WEDNESDAY", "TRACTION", "LAMPROOM", "MUSTARD", "SIDETRACK"],
    ["CONROD", "SATURDAY", "GRADIENT", "CROSSING", "RELISH", "TURNTABLE"],
    ["BUFFERSTOP", "SUNDAY", "CATENARY", "WHISTLE", "GRAVY", "SIGNALBOX"]
  ];
  function wordSearch() {
    var words = pickOfDay("word-search", WORDSEARCH_VARIANTS);
    var c = card("Wordsearch", "Word Search", "Find the hidden words. None of them are hidden. None of them are here.");
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var grid = el("div", { class: "ws-grid" });
    for (var i = 0; i < 100; i++) {
      var sp = el("span", { text: letters[Math.floor(Math.random() * 26)] });
      sp.addEventListener("click", (function (span) { return function () {
        span.classList.toggle("sel");
      }; })(sp));
      grid.appendChild(sp);
    }
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
  var ANAGRAM_WORDS = [
    "TUESDAY", "WEDNESDAY", "THURSDAY", "SATURDAY", "MONDAY", "FRIDAY", "SUNDAY",
    "FLANGE", "SPROCKET", "GASKET", "BALLAST", "TREACLE", "MOLASSES", "BISCUIT"
  ];
  function anagram() {
    var word = pickOfDay("anagram", ANAGRAM_WORDS);
    var sorted = word.split("").sort().join("");
    var c = card("Anagram", "The Anagram", "Rearrange the letters of " + word + " to spell " + word + ".");
    var inp = el("input", { class: "", placeholder: word, "aria-label": "anagram answer" });
    var wrap = el("div", { class: "anagram" }, [inp]);
    var check = el("button", { class: "pz-btn", onclick: function () {
      var v = inp.value.trim().toUpperCase();
      if (v === word) c.say("Correct! Astonishing work. The " + word.charAt(0) + word.slice(1).toLowerCase() + " remains a " + word.charAt(0) + word.slice(1).toLowerCase() + ".");
      else if (v.split("").sort().join("") === sorted) c.say("Those are the right letters, in the wrong " + word.charAt(0) + word.slice(1).toLowerCase() + ".");
      else c.say("Close. It is not, however, " + word + ".");
    } }, ["Solve"]);
    c.body.appendChild(wrap); c.body.appendChild(check);
  }

  // ============================================================
  // 6. The Unsolvable 15-Puzzle
  // ============================================================
  var SWAP_PAIRS = [
    [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15]
  ];
  function fifteen() {
    var pair = pickOfDay("fifteen", SWAP_PAIRS);
    var a = pair[0], b = pair[1];
    var c = card("Sliding Puzzle", "The 15-Puzzle (Unsolvable Edition)",
      "Slide the tiles into order, 1 to 15. Tiles " + a + " and " + b + " have swapped places, which makes this arrangement mathematically unsolvable. Do enjoy.");
    // solved order with tiles a and b swapped -> parity makes 1..15 unreachable
    var state = [];
    for (var n = 1; n <= 15; n++) state.push(n);
    state.push(0);
    var ia = state.indexOf(a), ib = state.indexOf(b);
    state[ia] = b; state[ib] = a;
    var grid = el("div", { class: "fif" });
    var moves = 0;
    function render() {
      grid.innerHTML = "";
      state.forEach(function (v, idx) {
        var bt = el("button", v === 0 ? { class: "blank" } : {}, [v === 0 ? "" : String(v)]);
        bt.addEventListener("click", function () { move(idx); });
        grid.appendChild(bt);
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
  var ODD_SHAPES = ["circle", "square", "triangle", "diamond", "hexagon"];
  var ODD_COLORS = [
    "#1f4e79", "#b0357e", "#3f7a2e", "#f4c542", "#8a4230", "#5c6472", "#b80000",
    "#2c2a4a", "#e07b39", "#6b4226", "#4a2e6b", "#2e6b6b", "#7a2e3f", "#444444"
  ];
  function drawShape(shape, color) {
    var s = svgNS("svg", { width: 44, height: 44, viewBox: "0 0 44 44" });
    if (shape === "circle") s.appendChild(svgNS("circle", { cx: 22, cy: 22, r: 16, fill: color }));
    else if (shape === "square") s.appendChild(svgNS("rect", { x: 6, y: 6, width: 32, height: 32, fill: color }));
    else if (shape === "triangle") s.appendChild(svgNS("polygon", { points: "22,4 40,38 4,38", fill: color }));
    else if (shape === "diamond") s.appendChild(svgNS("polygon", { points: "22,4 40,22 22,40 4,22", fill: color }));
    else s.appendChild(svgNS("polygon", { points: "22,2 39,12 39,32 22,42 5,32 5,12", fill: color }));
    return s;
  }
  function oddOneOut() {
    var idx = dayIndex("odd-one-out", ODD_COLORS.length);
    var shape = ODD_SHAPES[idx % ODD_SHAPES.length], color = ODD_COLORS[idx];
    var c = card("Logic", "Odd One Out", "Six " + shape + "s. Click the one that does not belong.");
    var row = el("div", { class: "row-shapes" });
    for (var i = 0; i < 6; i++) {
      var s = drawShape(shape, color);
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
  var CBN_PALETTES = [
    ["#f4c542", "#c96f4a", "#3f7a2e", "#1f4e79", "#b0357e", "#eaeaea"],
    ["#e07b39", "#4a2e6b", "#2e6b6b", "#b80000", "#f4c542", "#dbe9f4"],
    ["#3f7a2e", "#8a4230", "#1f4e79", "#f4a13e", "#5c6472", "#fff2b2"],
    ["#2c2a4a", "#c96f4a", "#7bbf6a", "#b0357e", "#eaf2fb", "#333333"],
    ["#6b4226", "#3f7a2e", "#f4c542", "#1f4e79", "#e07b39", "#eaeaea"],
    ["#7a2e3f", "#2e6b6b", "#f4a13e", "#4a2e6b", "#dbe9f4", "#5c6472"],
    ["#b80000", "#3f7a2e", "#1f4e79", "#f4c542", "#8a4230", "#eaeaea"],
    ["#264d26", "#c96f4a", "#2c2a4a", "#f4a13e", "#b0357e", "#fff2b2"],
    ["#444444", "#3f7a2e", "#e07b39", "#1f4e79", "#f4c542", "#dbe9f4"],
    ["#5c6472", "#8a4230", "#2e6b6b", "#b80000", "#eaf2fb", "#f4a13e"],
    ["#4a2e6b", "#3f7a2e", "#f4c542", "#7a2e3f", "#eaeaea", "#1f4e79"],
    ["#6b4226", "#2c2a4a", "#f4a13e", "#3f7a2e", "#dbe9f4", "#b0357e"],
    ["#1f4e79", "#e07b39", "#264d26", "#7a2e3f", "#eaeaea", "#f4c542"],
    ["#333333", "#c96f4a", "#4a2e6b", "#3f7a2e", "#f4a13e", "#eaf2fb"]
  ];
  function colourByNumbers() {
    var palette = pickOfDay("colour-by-numbers", CBN_PALETTES);
    var c = card("Art", "Colour by Numbers", "Every region is numbered 1. Key: 1 = whichever colour feels right.");
    var s = svgNS("svg", { class: "cbn", width: 260, height: 130, viewBox: "0 0 260 130" });
    s.setAttribute("class", "cbn");
    var regions = [
      { x: 4, y: 4, w: 82, h: 122 }, { x: 90, y: 4, w: 82, h: 60 },
      { x: 90, y: 66, w: 82, h: 60 }, { x: 176, y: 4, w: 80, h: 122 }
    ];
    regions.forEach(function (rg) {
      var rect = svgNS("rect", { x: rg.x, y: rg.y, width: rg.w, height: rg.h, fill: "#fff", stroke: "#141414", "stroke-width": 1.5 });
      var pidx = 0;
      rect.addEventListener("click", function () { pidx = (pidx + 1) % palette.length; rect.setAttribute("fill", palette[pidx]); });
      s.appendChild(rect);
      s.appendChild(svgNS("text", { x: rg.x + rg.w / 2 - 4, y: rg.y + rg.h / 2 + 5 })).textContent = "1";
    });
    c.body.appendChild(s);
    c.body.appendChild(el("button", { class: "pz-btn ghost", onclick: function () { c.say("A masterpiece. Objectively, and by the only rule that applies."); } }, ["Finish"]));
  }

  // ============================================================
  // 9. The Quiz
  // ============================================================
  var QUIZ_SETS = [
    [{ q: "1. Which of these is the odd one out?", a: ["7", "7", "7", "7"] },
     { q: "2. What is the capital of Tuesday?", a: ["Tuesday", "Tuesday", "Tuesday", "Tuesday"] },
     { q: "3. How many sprockets require flanging?", a: ["All of them", "All of them", "All of them", "All of them"] }],
    [{ q: "1. Which of these numbers is prime?", a: ["12", "12", "12", "12"] },
     { q: "2. What colour is Wednesday?", a: ["Beige", "Beige", "Beige", "Beige"] },
     { q: "3. How many flanges does a sprocket require?", a: ["Also all of them", "Also all of them", "Also all of them", "Also all of them"] }],
    [{ q: "1. Which weighs more, a kilogram of feathers or a kilogram of feathers?", a: ["A kilogram of feathers", "A kilogram of feathers", "A kilogram of feathers", "A kilogram of feathers"] },
     { q: "2. What time is it in the past?", a: ["Later than you think", "Later than you think", "Later than you think", "Later than you think"] },
     { q: "3. Which of these is not a biscuit?", a: ["A biscuit", "A biscuit", "A biscuit", "A biscuit"] }],
    [{ q: "1. What is the sound of one hand clapping?", a: ["Approval", "Approval", "Approval", "Approval"] },
     { q: "2. Which train arrives first?", a: ["The one behind it", "The one behind it", "The one behind it", "The one behind it"] },
     { q: "3. What is the square root of Thursday?", a: ["Friday, roughly", "Friday, roughly", "Friday, roughly", "Friday, roughly"] }],
    [{ q: "1. Which of these is heavier, a lie or the truth?", a: ["The lie, eventually", "The lie, eventually", "The lie, eventually", "The lie, eventually"] },
     { q: "2. What is the correct way to fold a map?", a: ["Wrongly, with confidence", "Wrongly, with confidence", "Wrongly, with confidence", "Wrongly, with confidence"] },
     { q: "3. How many degrees in a Tuesday?", a: ["Three hundred and Tuesday", "Three hundred and Tuesday", "Three hundred and Tuesday", "Three hundred and Tuesday"] }],
    [{ q: "1. Which came first, the chicken or the timetable?", a: ["The timetable, adjusted retroactively", "The timetable, adjusted retroactively", "The timetable, adjusted retroactively", "The timetable, adjusted retroactively"] },
     { q: "2. What is the airspeed velocity of an unladen sprocket?", a: ["Sufficient", "Sufficient", "Sufficient", "Sufficient"] },
     { q: "3. Which direction is up, on a Sunday?", a: ["Slightly to the left", "Slightly to the left", "Slightly to the left", "Slightly to the left"] }],
    [{ q: "1. What is the sum of all Tuesdays?", a: ["One, recurring", "One, recurring", "One, recurring", "One, recurring"] },
     { q: "2. Which of these words means 'flange'?", a: ["All of them, informally", "All of them, informally", "All of them, informally", "All of them, informally"] },
     { q: "3. How long is a piece of string?", a: ["Exactly this long", "Exactly this long", "Exactly this long", "Exactly this long"] }],
    [{ q: "1. Which of these is a real emotion?", a: ["Flange-adjacent", "Flange-adjacent", "Flange-adjacent", "Flange-adjacent"] },
     { q: "2. What is the opposite of a gasket?", a: ["An anti-gasket", "An anti-gasket", "An anti-gasket", "An anti-gasket"] },
     { q: "3. Which platform does the 14:52 not depart from?", a: ["This one, reliably", "This one, reliably", "This one, reliably", "This one, reliably"] }],
    [{ q: "1. What is the correct plural of 'sprocket'?", a: ["Sprocket", "Sprocket", "Sprocket", "Sprocket"] },
     { q: "2. Which of these is not a Wednesday?", a: ["Wednesday", "Wednesday", "Wednesday", "Wednesday"] },
     { q: "3. How many biscuits is too many biscuits?", a: ["A theoretical maximum", "A theoretical maximum", "A theoretical maximum", "A theoretical maximum"] }],
    [{ q: "1. Which number is closest to itself?", a: ["That one", "That one", "That one", "That one"] },
     { q: "2. What is the capital of a mood?", a: ["Melancholy-on-Sea", "Melancholy-on-Sea", "Melancholy-on-Sea", "Melancholy-on-Sea"] },
     { q: "3. How many times can you fold a timetable?", a: ["Once, decisively", "Once, decisively", "Once, decisively", "Once, decisively"] }],
    [{ q: "1. Which of these smells like Tuesday?", a: ["All of the above", "All of the above", "All of the above", "All of the above"] },
     { q: "2. What is the correct response to a delayed train?", a: ["A weary nod", "A weary nod", "A weary nod", "A weary nod"] },
     { q: "3. Which season is most honest?", a: ["Late autumn", "Late autumn", "Late autumn", "Late autumn"] }],
    [{ q: "1. What is the boiling point of patience?", a: ["Platform-dependent", "Platform-dependent", "Platform-dependent", "Platform-dependent"] },
     { q: "2. Which biscuit is structurally sound?", a: ["None of them, bravely", "None of them, bravely", "None of them, bravely", "None of them, bravely"] },
     { q: "3. How many sides does a decision have?", a: ["Several, all wrong", "Several, all wrong", "Several, all wrong", "Several, all wrong"] }],
    [{ q: "1. Which of these numbers has given up?", a: ["Seven", "Seven", "Seven", "Seven"] },
     { q: "2. What is the correct name for a Thursday?", a: ["A tired Wednesday", "A tired Wednesday", "A tired Wednesday", "A tired Wednesday"] },
     { q: "3. How many flanges fit on the head of a pin?", a: ["A committee's worth", "A committee's worth", "A committee's worth", "A committee's worth"] }],
    [{ q: "1. Which of these is the correct answer?", a: ["This one", "This one", "This one", "This one"] },
     { q: "2. What is the sound a spreadsheet makes?", a: ["A quiet judgment", "A quiet judgment", "A quiet judgment", "A quiet judgment"] },
     { q: "3. How many puzzles remain unsolvable?", a: ["All fourteen", "All fourteen", "All fourteen", "All fourteen"] }]
  ];
  function quiz() {
    var qs = pickOfDay("quiz", QUIZ_SETS);
    var c = card("General Knowledge", "The Quiz", "Three questions. Every answer is correct. Award yourself full marks.");
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
  var DOT_LINES = [
    "Connected. The hidden picture is a dot. It was a dot the whole time.",
    "Connected. The hidden picture is a full stop.",
    "Connected. The hidden picture is a single pixel.",
    "Connected. The hidden picture is a Tuesday, viewed from directly above.",
    "Connected. The hidden picture is a flange, seen end-on.",
    "Connected. The hidden picture is a decision, unmade.",
    "Connected. The hidden picture is the letter O, before it learned to be round.",
    "Connected. The hidden picture is a very small full English breakfast.",
    "Connected. The hidden picture is a fingerprint, unclaimed.",
    "Connected. The hidden picture is a compromise.",
    "Connected. The hidden picture is the number zero, being modest.",
    "Connected. The hidden picture is a full stop that arrived early.",
    "Connected. The hidden picture is a sprocket, from a great distance.",
    "Connected. The hidden picture is a dot. It was always going to be a dot."
  ];
  function connectDots() {
    var line = pickOfDay("connect-dots", DOT_LINES);
    var c = card("For Children", "Connect the Dots", "Connect the dots from 1 to 1 to reveal the hidden picture.");
    var s = svgNS("svg", { width: 260, height: 120, viewBox: "0 0 260 120" });
    var dot = svgNS("circle", { cx: 130, cy: 60, r: 6, fill: "#141414" });
    dot.style.cursor = "pointer";
    dot.addEventListener("click", function () { c.say(line); });
    s.appendChild(svgNS("text", { x: 140, y: 55, "font-size": 12, fill: "#6b6b6b" })).textContent = "1";
    s.appendChild(dot);
    c.body.appendChild(s);
  }

  // ============================================================
  // 11. Nonogram (Blank)
  // ============================================================
  var NONOGRAM_VARIANTS = [
    { size: 6, name: "Nonogram" }, { size: 5, name: "Griddler" }, { size: 7, name: "Hanjie" },
    { size: 6, name: "Picross" }, { size: 8, name: "Paint-by-Squares" }, { size: 5, name: "Nonogram" },
    { size: 6, name: "Griddler" }, { size: 7, name: "Hanjie" }, { size: 8, name: "Picross" },
    { size: 5, name: "Paint-by-Squares" }, { size: 6, name: "Nonogram" }, { size: 7, name: "Griddler" },
    { size: 8, name: "Hanjie" }, { size: 5, name: "Picross" }
  ];
  function nonogram() {
    var v = pickOfDay("nonogram", NONOGRAM_VARIANTS);
    var c = card("Picross", v.name, "Shade the squares according to the clues. All clues are 0. Take your time.");
    var grid = el("div", { class: "cell-grid" });
    grid.style.gridTemplateColumns = "repeat(" + v.size + ", 26px)";
    var cells = [];
    for (var i = 0; i < v.size * v.size; i++) {
      var d = el("div", {});
      d.style.width = "26px"; d.style.height = "26px"; d.style.background = "#fff"; d.style.cursor = "pointer";
      d.addEventListener("click", (function (dd) { return function () {
        dd.style.background = dd.style.background === "rgb(20, 20, 20)" ? "#fff" : "#141414";
      }; })(d));
      cells.push(d); grid.appendChild(d);
    }
    var zeros = new Array(v.size).fill("0").join(" ");
    c.body.appendChild(el("div", { class: "instr", text: "Row clues: " + zeros + "   ·   Column clues: " + zeros }));
    c.body.appendChild(grid);
    c.body.appendChild(el("button", { class: "pz-btn", onclick: function () {
      var anyFilled = cells.some(function (x) { return x.style.background === "rgb(20, 20, 20)"; });
      c.say(anyFilled ? "Every clue is 0, so the correct grid is empty. You have added squares. Bold." : "Solved. The solution was nothing, elegantly arranged.");
    } }, ["Check"]));
  }

  // ============================================================
  // 12. Rebus
  // ============================================================
  var REBUS_VARIANTS = [
    { emoji: "🧩", answer: "a rebus", keyword: "rebus" },
    { emoji: "🔄", answer: "going round in circles", keyword: "circ" },
    { emoji: "🧵", answer: "hanging by a thread", keyword: "thread" },
    { emoji: "⏳", answer: "time's up", keyword: "time" },
    { emoji: "🚂💨", answer: "running late", keyword: "late" },
    { emoji: "🔁", answer: "repeat after me", keyword: "repeat" },
    { emoji: "🧷", answer: "held together with a safety pin", keyword: "pin" },
    { emoji: "🕳️", answer: "a hole in the plot", keyword: "hole" },
    { emoji: "🔒❓", answer: "the answer is locked", keyword: "lock" },
    { emoji: "🚧", answer: "under construction", keyword: "construction" },
    { emoji: "🪝", answer: "hanging on a hook", keyword: "hook" },
    { emoji: "🪢", answer: "tied in a knot", keyword: "knot" },
    { emoji: "🧩🧩", answer: "more of the same", keyword: "same" },
    { emoji: "🪞", answer: "mirror image", keyword: "mirror" }
  ];
  function rebus() {
    var v = pickOfDay("rebus", REBUS_VARIANTS);
    var c = card("Rebus", "Rebus Puzzle", "What familiar phrase or saying does this picture represent?");
    c.body.appendChild(el("div", { class: "big-num", text: v.emoji + " = ?" }));
    var inp = el("input", { class: "", placeholder: "your answer", "aria-label": "rebus answer", style: "font:600 14px var(--sans);padding:6px 10px;border:1px solid var(--hair-strong);border-radius:3px;margin-top:10px;width:180px" });
    c.body.appendChild(inp);
    c.body.appendChild(el("button", { class: "pz-btn", onclick: function () {
      var val = inp.value.trim().toLowerCase();
      var re = new RegExp(v.keyword, "i");
      c.say(re.test(val) ? "Correct. The answer is '" + v.answer + "'. It was always going to be." : "Not quite. The answer is '" + v.answer + "'. It represents itself.");
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
