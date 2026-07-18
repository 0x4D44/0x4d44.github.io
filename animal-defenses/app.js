/* ============================================================
   The Defensive — app.js
   Vanilla JS. Hash router + views built from window.BEASTS / window.CATS,
   nine interactive canvas demos, a field chart and a quiz. No build step.
   ============================================================ */
(function () {
  "use strict";

  var BEASTS = window.BEASTS || [];
  var CATS = window.CATS || [];
  var CAT_BY_ID = window.CAT_BY_ID || {};
  var BEAST_BY_ID = window.BEAST_BY_ID || {};
  var app = document.getElementById("app");

  // ---- tiny helpers -----------------------------------------------------
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function catColor(id) { return (CAT_BY_ID[id] || {}).color || "#35e0c6"; }
  function reduceMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  // teardown registry: every view/demo pushes cleanup fns, flushed on nav
  var cleanups = [];
  function onCleanup(fn) { cleanups.push(fn); }
  function flush() { cleanups.forEach(function (f) { try { f(); } catch (e) {} }); cleanups = []; }

  function meter(kind, label, value) {
    return '<div class="meter ' + kind + '"><div class="ml"><span>' + label + '</span><b>' + value + '/10</b></div>' +
      '<div class="track"><div class="fill" style="width:' + (value * 10) + '%"></div></div></div>';
  }

  // ---- SVG art icon (references sprite symbol; falls back to glyph) ------
  function artSVG(b, cls) {
    var color = catColor(b.cat);
    return '<svg class="' + (cls || "") + '" viewBox="0 0 120 120" style="color:' + color + '" role="img" aria-label="' + esc(b.name) + '">' +
      '<use href="#' + b.art + '"></use></svg>';
  }

  // ======================================================================
  //  VIEWS
  // ======================================================================
  function renderHome() {
    var dangerMax = BEASTS.reduce(function (m, b) { return Math.max(m, b.danger); }, 0);
    var view = h('<div class="view"></div>');

    // hero
    view.appendChild(h(
      '<section class="hero wrap">' +
        '<span class="hero-badge">◆ ' + BEASTS.length + ' documented defences</span>' +
        '<h1>The&nbsp;Defensive</h1>' +
        '<p class="sub">Nature&rsquo;s strangest ways to survive being eaten.</p>' +
        '<p class="lead">A beetle that fires boiling chemicals from its backside. A lizard that shoots blood from its eyes. A frog that grows claws by snapping its own bones. This is an interactive bestiary of the most extraordinary defence mechanisms on Earth &mdash; and you can set most of them off yourself.</p>' +
        '<div class="cta-row">' +
          '<a class="btn primary" href="#/bestiary">Enter the bestiary →</a>' +
          '<a class="btn" href="#/lab">Play with the weapons</a>' +
        '</div>' +
        '<div class="stat-strip">' +
          '<div class="stat"><div class="n">' + BEASTS.length + '</div><div class="l">Creatures</div></div>' +
          '<div class="stat"><div class="n">' + CATS.length + '</div><div class="l">Defence families</div></div>' +
          '<div class="stat"><div class="n">9</div><div class="l">Playable demos</div></div>' +
          '<div class="stat"><div class="n">100&deg;C</div><div class="l">Hottest spray</div></div>' +
        '</div>' +
      '</section>'
    ));

    // fact of the moment
    var fom = h('<section class="wrap"><div class="fom"><button class="again">↻ another</button>' +
      '<div class="k">Fact of the moment</div><div class="q"></div><div class="who"></div></div></section>');
    view.appendChild(fom);
    var pool = [];
    BEASTS.forEach(function (b) { b.facts.forEach(function (f) { pool.push({ f: f, b: b }); }); });
    function spinFact() {
      var pick = pool[Math.floor(Math.random() * pool.length)];
      fom.querySelector(".q").innerHTML = esc(pick.f);
      fom.querySelector(".who").innerHTML = '— the <b>' + esc(pick.b.name) + '</b> · <a href="#/creature/' + pick.b.id + '">read the dossier</a>';
    }
    fom.querySelector(".again").addEventListener("click", spinFact);
    spinFact();

    // category grid
    var catSec = h('<section class="wrap"><div class="section-head"><p class="eyebrow">Seven ways to survive</p><h2 class="big">The defence families</h2></div><div class="cat-grid"></div></section>');
    var grid = catSec.querySelector(".cat-grid");
    CATS.forEach(function (c) {
      var count = BEASTS.filter(function (b) { return b.cat === c.id; }).length;
      var card = h('<a class="cat-card" href="#/bestiary/' + c.id + '" style="--c:' + c.color + '">' +
        '<span class="bar"></span>' +
        '<svg class="ic" viewBox="0 0 120 120"><use href="#ic-' + c.id + '"></use></svg>' +
        '<h3>' + esc(c.label) + '</h3>' +
        '<p class="gl">' + esc(c.gloss) + '</p>' +
        '<div class="count">' + count + ' creature' + (count === 1 ? "" : "s") + ' →</div>' +
        '</a>');
      grid.appendChild(card);
    });
    view.appendChild(catSec);

    // featured / most extreme
    var feat = h('<section class="wrap"><div class="section-head"><p class="eyebrow">Start here</p><h2 class="big">Six you won&rsquo;t believe</h2></div><div class="gallery"></div></section>');
    var fg = feat.querySelector(".gallery");
    ["horned-lizard", "hairy-frog", "hagfish", "bombardier-beetle", "pistol-shrimp", "exploding-ant"].forEach(function (id) {
      var b = BEAST_BY_ID[id]; if (b) fg.appendChild(beastCard(b));
    });
    view.appendChild(feat);

    return view;
  }

  function beastCard(b) {
    var color = catColor(b.cat);
    var cat = CAT_BY_ID[b.cat] || {};
    var card = h('<a class="beast" href="#/creature/' + b.id + '" style="--c:' + color + '">' +
      (b.demo ? '<span class="badge-demo">▶ play</span>' : '') +
      '<div class="art">' + artSVG(b) + '</div>' +
      '<div class="body">' +
        '<div class="catlabel">' + esc(cat.label || "") + '</div>' +
        '<h3>' + esc(b.name) + '</h3>' +
        '<div class="sci">' + esc(b.sci) + '</div>' +
        '<div class="tag">' + esc(b.tag) + '</div>' +
        '<div class="meters">' + meter("weird", "Weird", b.weird) + meter("danger", "Danger", b.danger) + '</div>' +
      '</div></a>');
    return card;
  }

  function renderBestiary(catFilter) {
    var view = h('<div class="view wrap"></div>');
    view.appendChild(h('<div class="section-head"><p class="eyebrow">The bestiary</p><h2 class="big">' +
      (catFilter ? esc((CAT_BY_ID[catFilter] || {}).label || "") : "Every defence, catalogued") + '</h2>' +
      '<p class="lead">' + (catFilter ? esc((CAT_BY_ID[catFilter] || {}).gloss || "") : "Filter by the kind of defence. Tap any creature for the full dossier &mdash; and, where you see the <b>play</b> badge, an interactive you can set off.") + '</p></div>'));

    // filters
    var filters = h('<div class="filters"></div>');
    var allChip = h('<button class="chip' + (!catFilter ? " on" : "") + '" data-cat=""><span class="dot" style="background:linear-gradient(90deg,#35e0c6,#9085e9)"></span>All <span class="n">' + BEASTS.length + '</span></button>');
    filters.appendChild(allChip);
    CATS.forEach(function (c) {
      var n = BEASTS.filter(function (b) { return b.cat === c.id; }).length;
      var chip = h('<button class="chip' + (catFilter === c.id ? " on" : "") + '" data-cat="' + c.id + '" style="--c:' + c.color + '">' +
        '<span class="dot"></span>' + esc(c.label) + ' <span class="n">' + n + '</span></button>');
      filters.appendChild(chip);
    });
    filters.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip"); if (!chip) return;
      var cid = chip.getAttribute("data-cat");
      location.hash = cid ? "#/bestiary/" + cid : "#/bestiary";
    });
    view.appendChild(filters);

    var gallery = h('<div class="gallery"></div>');
    var list = BEASTS.filter(function (b) { return !catFilter || b.cat === catFilter; });
    if (!list.length) gallery.appendChild(h('<div class="empty">Nothing here yet.</div>'));
    list.forEach(function (b) { gallery.appendChild(beastCard(b)); });
    view.appendChild(gallery);
    return view;
  }

  function renderDossier(id) {
    var b = BEAST_BY_ID[id];
    if (!b) return renderBestiary(null);
    var color = catColor(b.cat);
    var cat = CAT_BY_ID[b.cat] || {};
    var view = h('<div class="view wrap dossier" style="--c:' + color + '"></div>');
    view.appendChild(h('<button class="back-link" onclick="history.length>1?history.back():(location.hash=\'#/bestiary\')">← back to the bestiary</button>'));

    view.appendChild(h(
      '<div class="dossier-head">' +
        '<div class="dossier-portrait" style="--c:' + color + '">' + artSVG(b) + '</div>' +
        '<div>' +
          '<div class="catlabel">' + esc(cat.label || "") + '</div>' +
          '<h1>' + esc(b.name) + '</h1>' +
          '<div class="sci">' + esc(b.sci) + '</div>' +
          '<div class="facts-inline"><span>📍 <b>' + esc(b.region) + '</b></span><span>📏 <b>' + esc(b.size) + '</b></span></div>' +
        '</div>' +
      '</div>'
    ));

    view.appendChild(h('<div class="dossier-tag">' + esc(b.tag) + '</div>'));
    view.appendChild(h('<div class="dossier-meters">' + meter("weird", "Weirdness", b.weird) + meter("danger", "Danger", b.danger) + '</div>'));

    // interactive demo (if any)
    if (b.demo && DEMOS[b.demo]) {
      var slot = h('<div class="dossier-demo-slot"></div>');
      view.appendChild(slot);
      // mount after insertion into DOM
      setTimeout(function () { mountDemo(slot, b.demo, color); }, 0);
    }

    view.appendChild(h('<div class="panel"><h3>How it works</h3><p>' + esc(b.how) + '</p></div>'));

    var factsHtml = '<div class="panel"><h3>Wonders &amp; horrors</h3><ul class="facts-list">';
    b.facts.forEach(function (f) { factsHtml += '<li>' + esc(f) + '</li>'; });
    factsHtml += '</ul></div>';
    view.appendChild(h(factsHtml));

    // prev / next within full list
    var idx = BEASTS.indexOf(b);
    var prev = BEASTS[(idx - 1 + BEASTS.length) % BEASTS.length];
    var next = BEASTS[(idx + 1) % BEASTS.length];
    view.appendChild(h('<div class="dossier-nav">' +
      '<button onclick="location.hash=\'#/creature/' + prev.id + '\'"><div class="dir">← previous</div><div class="nm">' + esc(prev.name) + '</div></button>' +
      '<button class="next" onclick="location.hash=\'#/creature/' + next.id + '\'"><div class="dir">next →</div><div class="nm">' + esc(next.name) + '</div></button>' +
      '</div>'));
    return view;
  }

  function renderLab() {
    var view = h('<div class="view wrap"></div>');
    view.appendChild(h('<div class="section-head"><p class="eyebrow">The Lab</p><h2 class="big">Set off the weapons</h2>' +
      '<p class="lead">Nine of these defences, rebuilt as things you can trigger. Fire the beetle, drown a shark in slime, charge the eel, watch the octopus vanish. Nothing here is pre-rendered &mdash; it&rsquo;s all live.</p></div>'));
    var grid = h('<div class="lab-grid"></div>');
    view.appendChild(grid);
    Object.keys(DEMOS).forEach(function (key) {
      var d = DEMOS[key];
      var beast = BEASTS.filter(function (b) { return b.demo === key; })[0];
      var color = beast ? catColor(beast.cat) : "#35e0c6";
      var slot = h('<div></div>');
      grid.appendChild(slot);
      setTimeout(function () { mountDemo(slot, key, color); }, 0);
    });
    return view;
  }

  function renderAbout() {
    var view = h('<div class="view wrap"></div>');
    view.appendChild(h(
      '<div class="prose" style="margin:30px auto 0">' +
        '<div class="section-head"><p class="eyebrow">About</p><h2 class="big">Why animals do the unthinkable</h2></div>' +
        '<p>Every creature here is playing the same game: make eating me more trouble than it&rsquo;s worth. What&rsquo;s astonishing is how far evolution will go to win it. Some animals build chemical factories in their own abdomens. Some turn their skeleton into a weapon and drive it out through their skin. Some borrow the stings, poisons and even the living bodies of other species. A few would rather explode than lose the colony.</p>' +
        '<p>The defences fall into families &mdash; chemical warfare, body horror, slime, illusion, armour, borrowed arms, and raw venom and voltage &mdash; and this bestiary sorts them that way. The <b>weirdness</b> and <b>danger</b> scores are my own editorial judgement, there to place each animal on the <a href="#/chart">field chart</a> and drive the quiz, not gospel.</p>' +
        '<h2>How it&rsquo;s built</h2>' +
        '<p>Plain HTML, CSS and vanilla JavaScript &mdash; no framework, no build step. Every creature is one object in <code>data.js</code>; the gallery, dossiers, chart and quiz are all generated from it. The nine interactives are hand-written on <code>&lt;canvas&gt;</code>. Add a creature by appending one object.</p>' +
        '<h2>On the facts</h2>' +
        '<p>These are real, documented behaviours, not tall tales &mdash; the blood-squirting lizard, the bone-clawed frog, the self-detonating ant and the rest are all genuine. Figures (temperatures, voltages, toxicity) are drawn from the scientific literature and rounded for readability. If you want to go deeper, every animal here is worth a search by its scientific name.</p>' +
        '<p style="margin-top:26px"><a class="btn primary" href="#/bestiary">Enter the bestiary →</a></p>' +
      '</div>'
    ));
    return view;
  }

  // ======================================================================
  //  FIELD CHART  (weirdness vs danger scatter)
  // ======================================================================
  function renderChart() {
    var view = h('<div class="view wrap"></div>');
    view.appendChild(h('<div class="section-head"><p class="eyebrow">Field chart</p><h2 class="big">Weirdness vs. danger</h2>' +
      '<p class="lead">Every creature plotted by how strange its defence is against how dangerous it is to you. The top-right corner is where the nightmares live. Hover a dot to read it; tap to open the dossier.</p></div>'));

    var W = 760, H = 520, m = { t: 24, r: 24, b: 60, l: 66 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var x = function (v) { return m.l + ((v - 0.5) / 10) * iw; };
    var y = function (v) { return m.t + ih - ((v - 0.5) / 10) * ih; };

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:100%;height:auto;overflow:visible" role="img" aria-label="Scatter plot of weirdness versus danger">';
    // gridlines
    for (var g = 2; g <= 10; g += 2) {
      svg += '<line x1="' + x(g) + '" y1="' + m.t + '" x2="' + x(g) + '" y2="' + (m.t + ih) + '" stroke="var(--grid)"/>';
      svg += '<line x1="' + m.l + '" y1="' + y(g) + '" x2="' + (m.l + iw) + '" y2="' + y(g) + '" stroke="var(--grid)"/>';
      svg += '<text x="' + x(g) + '" y="' + (m.t + ih + 20) + '" fill="var(--muted-ink)" font-size="12" text-anchor="middle" font-family="ui-monospace,monospace">' + g + '</text>';
      svg += '<text x="' + (m.l - 12) + '" y="' + (y(g) + 4) + '" fill="var(--muted-ink)" font-size="12" text-anchor="end" font-family="ui-monospace,monospace">' + g + '</text>';
    }
    // axes
    svg += '<line x1="' + m.l + '" y1="' + (m.t + ih) + '" x2="' + (m.l + iw) + '" y2="' + (m.t + ih) + '" stroke="var(--axis)"/>';
    svg += '<line x1="' + m.l + '" y1="' + m.t + '" x2="' + m.l + '" y2="' + (m.t + ih) + '" stroke="var(--axis)"/>';
    svg += '<text x="' + (m.l + iw / 2) + '" y="' + (H - 16) + '" fill="var(--text-secondary)" font-size="13.5" text-anchor="middle" font-weight="600">Weirdness of the defence →</text>';
    svg += '<text transform="translate(18 ' + (m.t + ih / 2) + ') rotate(-90)" fill="var(--text-secondary)" font-size="13.5" text-anchor="middle" font-weight="600">Danger to you →</text>';

    // jitter overlapping points deterministically
    var seen = {};
    var pts = BEASTS.map(function (b) {
      var key = b.weird + "," + b.danger;
      var n = seen[key] = (seen[key] || 0) + 1;
      var ang = n * 2.4, rad = n > 1 ? 6 : 0;
      return { b: b, px: x(b.weird) + Math.cos(ang) * rad, py: y(b.danger) + Math.sin(ang) * rad, color: catColor(b.cat) };
    });
    pts.forEach(function (p) {
      svg += '<circle class="pt" data-id="' + p.b.id + '" cx="' + p.px.toFixed(1) + '" cy="' + p.py.toFixed(1) + '" r="7" fill="' + p.color + '" fill-opacity="0.85" stroke="#0b1220" stroke-width="2" style="cursor:pointer"/>';
    });
    svg += '</svg>';

    var wrap = h('<div class="chart-wrap viz-root"></div>');
    wrap.appendChild(h(svg));
    // legend
    var legend = h('<div class="chart-legend"></div>');
    CATS.forEach(function (c) {
      legend.appendChild(h('<span class="li"><span class="sw" style="background:' + c.color + '"></span>' + esc(c.label) + '</span>'));
    });
    wrap.appendChild(legend);
    wrap.appendChild(h('<p class="chart-note">Scores are editorial. Overlapping creatures are nudged apart slightly so every dot stays clickable.</p>'));
    view.appendChild(wrap);

    // tooltip + interactions
    var tip = h('<div class="chart-tip"></div>');
    document.body.appendChild(tip);
    onCleanup(function () { tip.remove(); });
    var svgEl = wrap.querySelector("svg");
    svgEl.addEventListener("mouseover", function (e) {
      var c = e.target.closest(".pt"); if (!c) return;
      var b = BEAST_BY_ID[c.getAttribute("data-id")];
      c.setAttribute("r", "10");
      tip.innerHTML = '<b>' + esc(b.name) + '</b><br>' + esc(b.tag) + '<br><span style="color:var(--muted)">weird ' + b.weird + ' · danger ' + b.danger + '</span>';
      tip.style.opacity = "1";
    });
    svgEl.addEventListener("mousemove", function (e) {
      tip.style.left = (e.clientX + 14) + "px";
      tip.style.top = (e.clientY + 14) + "px";
    });
    svgEl.addEventListener("mouseout", function (e) {
      var c = e.target.closest(".pt"); if (c) c.setAttribute("r", "7");
      tip.style.opacity = "0";
    });
    svgEl.addEventListener("click", function (e) {
      var c = e.target.closest(".pt"); if (!c) return;
      location.hash = "#/creature/" + c.getAttribute("data-id");
    });
    return view;
  }

  // ======================================================================
  //  QUIZ
  // ======================================================================
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function renderQuiz() {
    var view = h('<div class="view wrap quiz"></div>');
    view.appendChild(h('<div class="section-head" style="text-align:center"><p class="eyebrow">Quiz</p><h2 class="big">Name that defence</h2></div>'));
    var card = h('<div class="quiz-card"></div>');
    view.appendChild(card);

    var N = 8;
    var questions = shuffle(BEASTS).slice(0, N);
    var qi = 0, score = 0;

    function showQuestion() {
      var b = questions[qi];
      var others = shuffle(BEASTS.filter(function (x) { return x.id !== b.id; })).slice(0, 3);
      var opts = shuffle([b].concat(others));
      var html = '<div class="progress">Question ' + (qi + 1) + ' / ' + N + ' · <span class="score">score ' + score + '</span></div>' +
        '<div class="qprompt">&ldquo;' + esc(b.tag) + '&rdquo;<br><span style="color:var(--muted);font-size:0.7em;font-weight:400">Whose defence is this?</span></div>' +
        '<div class="options"></div><div class="explain"></div>';
      card.innerHTML = html;
      var optWrap = card.querySelector(".options");
      opts.forEach(function (o) {
        var btn = h('<button class="opt">' + esc(o.name) + '</button>');
        btn.addEventListener("click", function () { answer(o, b, opts); });
        optWrap.appendChild(btn);
      });
    }

    function answer(chosen, correct, opts) {
      var btns = card.querySelectorAll(".opt");
      btns.forEach(function (btn, i) {
        btn.disabled = true;
        if (opts[i].id === correct.id) btn.classList.add("correct");
        else if (opts[i].id === chosen.id) btn.classList.add("wrong");
      });
      if (chosen.id === correct.id) score++;
      var ex = card.querySelector(".explain");
      ex.innerHTML = (chosen.id === correct.id ? "✔ Correct. " : "✗ It&rsquo;s the <b>" + esc(correct.name) + "</b>. ") + esc(correct.facts[0]);
      var next = h('<button class="btn primary" style="margin-top:20px">' + (qi < N - 1 ? "Next question →" : "See result →") + '</button>');
      next.addEventListener("click", function () { qi++; if (qi < N) showQuestion(); else showResult(); });
      card.appendChild(next);
    }

    function showResult() {
      var pct = Math.round((score / N) * 100);
      var verdict = pct === 100 ? "Apex predator. You know your poisons." :
        pct >= 75 ? "Formidable. Little escapes you." :
        pct >= 50 ? "You&rsquo;d survive the tide pool." :
        pct >= 25 ? "Best admire from a distance." : "You are, biologically speaking, prey.";
      card.className = "quiz-card quiz-result";
      card.innerHTML = '<div class="progress">Complete</div>' +
        '<div class="big-score">' + score + '/' + N + '</div>' +
        '<div class="verdict">' + verdict + '</div>' +
        '<div class="cta-row" style="margin-top:10px"><button class="btn primary" id="q-again">Play again</button>' +
        '<a class="btn" href="#/bestiary">Back to the bestiary</a></div>';
      card.querySelector("#q-again").addEventListener("click", function () {
        card.className = "quiz-card"; questions = shuffle(BEASTS).slice(0, N); qi = 0; score = 0; showQuestion();
      });
    }

    showQuestion();
    return view;
  }

  // ======================================================================
  //  INTERACTIVE DEMOS
  // ======================================================================
  // Each demo: { title, help, mount(canvas, ctx, ui, color) -> cleanupFn }
  // mountDemo builds the shared shell (canvas + controls) and calls mount.

  function makeShell(container, key, color) {
    var d = DEMOS[key];
    var shell = h('<div class="demo" style="--c:' + color + '">' +
      '<div class="demo-k">Interactive</div>' +
      '<h4>' + esc(d.title) + '</h4>' +
      '<p class="demo-help">' + d.help + '</p>' +
      '<canvas></canvas>' +
      '<div class="demo-controls"></div>' +
      '<div class="readouts"></div>' +
      '</div>');
    container.innerHTML = "";
    container.appendChild(shell);
    return shell;
  }

  function fitCanvas(canvas, aspect) {
    aspect = aspect || 0.5;
    function resize() {
      var w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = Math.round(w * aspect) + "px";
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * aspect * dpr);
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas._cssW = w; canvas._cssH = w * aspect;
    }
    resize();
    window.addEventListener("resize", resize);
    return function () { window.removeEventListener("resize", resize); };
  }

  function readoutHTML(items) {
    return items.map(function (it) {
      return '<div class="readout"><div class="rv" data-k="' + it.k + '">' + it.v + '</div><div class="rl">' + it.l + '</div></div>';
    }).join("");
  }

  // small optional WebAudio blip (guarded)
  var AC = null;
  function blip(freq, dur, type) {
    try {
      if (reduceMotion()) return;
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "sawtooth"; o.frequency.value = freq;
      g.gain.value = 0.0001; o.connect(g); g.connect(AC.destination);
      var t = AC.currentTime;
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  var DEMOS = {
    // ---- Bombardier beetle: fire pulsed boiling spray ----
    bombardier: {
      title: "Fire the bombardier beetle",
      help: "Hit <b>Fire!</b> to detonate the reaction chamber. Watch the pulse count and the temperature spike to 100&nbsp;°C.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var particles = [], firing = 0, temp = 22, pulses = 0, raf;
        ui.controls.appendChild(uiBtn("🔥 Fire!", function () { firing = 40; }));
        ui.readouts.innerHTML = readoutHTML([{ k: "temp", v: "22°C", l: "Spray temp" }, { k: "pulse", v: "0", l: "Pulses fired" }]);
        function loop() {
          var w = W(), hh = H();
          ctx.clearRect(0, 0, w, hh);
          // beetle
          var bx = w * 0.26, by = hh * 0.56;
          ctx.save();
          ctx.fillStyle = "rgba(53,224,198,0.12)"; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.ellipse(bx, by, 34, 22, 0, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(bx - 34, by, 12, 0, 7); ctx.fill(); ctx.stroke();
          ctx.restore();
          if (firing > 0) {
            firing--;
            if (firing % 3 === 0) {
              pulses++;
              for (var i = 0; i < 5; i++) {
                particles.push({ x: bx + 30, y: by, vx: 5 + Math.random() * 5, vy: (Math.random() - 0.5) * 2.5, life: 1, r: 3 + Math.random() * 3 });
              }
              temp = Math.min(100, temp + 9);
              blip(140 + Math.random() * 60, 0.05, "square");
            }
          } else {
            temp = Math.max(22, temp - 0.7);
          }
          particles.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.02; });
          particles = particles.filter(function (p) { return p.life > 0 && p.x < w + 20; });
          particles.forEach(function (p) {
            var t = clamp((temp - 22) / 78, 0, 1);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = "hsl(" + (40 - t * 40) + ",100%," + (55 + p.life * 15) + "%)";
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, 7); ctx.fill();
          });
          ctx.globalAlpha = 1;
          ui.set("temp", Math.round(temp) + "°C");
          ui.set("pulse", String(pulses));
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); stop(); };
      }
    },

    // ---- Horned lizard: click the eye to squirt blood ----
    bloodsquirt: {
      title: "Squirt blood from the eye",
      help: "Click the lizard&rsquo;s <b>eye</b> to burst the ocular vessels. Distance varies &mdash; up to about 150&nbsp;cm.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var drops = [], best = 0, shots = 0, raf, flash = 0;
        ui.readouts.innerHTML = readoutHTML([{ k: "dist", v: "0 cm", l: "Last squirt" }, { k: "best", v: "0 cm", l: "Furthest" }]);
        var eye = { x: 0, y: 0, r: 14 };
        function fire(power) {
          shots++;
          var dist = Math.round(60 + power * 90);
          var n = 26;
          for (var i = 0; i < n; i++) {
            var a = -0.5 - Math.random() * 0.5;
            var sp = 6 + Math.random() * 5 * power;
            drops.push({ x: eye.x, y: eye.y, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp, life: 1 });
          }
          flash = 8;
          ui.set("dist", dist + " cm");
          best = Math.max(best, dist); ui.set("best", best + " cm");
          blip(90, 0.12, "sawtooth");
        }
        canvas.addEventListener("pointerdown", onPoint);
        function onPoint(e) {
          var r = canvas.getBoundingClientRect();
          var mx = e.clientX - r.left, my = e.clientY - r.top;
          if (Math.hypot(mx - eye.x, my - eye.y) < eye.r + 14) fire(0.5 + Math.random() * 0.5);
        }
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          var lx = w * 0.7, ly = hh * 0.62;
          eye.x = lx - 44; eye.y = ly - 10;
          // lizard body
          ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.fillStyle = "rgba(230,103,103,0.10)";
          ctx.beginPath(); ctx.ellipse(lx, ly, 46, 30, 0, 0, 7); ctx.fill(); ctx.stroke();
          // head
          ctx.beginPath(); ctx.moveTo(lx - 40, ly - 20); ctx.lineTo(lx - 66, ly - 6); ctx.lineTo(lx - 40, ly + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
          // horns
          ctx.beginPath(); ctx.moveTo(lx - 58, ly - 8); ctx.lineTo(lx - 70, ly - 16); ctx.moveTo(lx - 52, ly - 14); ctx.lineTo(lx - 60, ly - 24); ctx.stroke();
          ctx.restore();
          // eye
          ctx.beginPath(); ctx.arc(eye.x, eye.y, eye.r, 0, 7);
          ctx.fillStyle = flash > 0 ? "#ff5560" : "#1a2233"; ctx.fill();
          ctx.strokeStyle = "#e0454e"; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = "#e0454e"; ctx.font = "11px ui-monospace,monospace"; ctx.textAlign = "center";
          if (shots === 0) ctx.fillText("click the eye ↑", eye.x, eye.y + 34);
          if (flash > 0) flash--;
          drops.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.life -= 0.012; });
          drops = drops.filter(function (p) { return p.life > 0 && p.y < hh + 10; });
          drops.forEach(function (p) {
            ctx.globalAlpha = clamp(p.life, 0, 1);
            ctx.fillStyle = "#c8323b"; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill();
          });
          ctx.globalAlpha = 1;
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onPoint); stop(); };
      }
    },

    // ---- Exploding ant: click to detonate ----
    explode: {
      title: "Detonate the exploding ant",
      help: "Click the <b>ant</b> to rupture its body and spray toxic yellow glue. One click, one ant.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var goo = [], boom = 0, count = 0, raf, ant = { x: 0, y: 0, alive: true };
        ui.readouts.innerHTML = readoutHTML([{ k: "count", v: "0", l: "Ants sacrificed" }]);
        canvas.addEventListener("pointerdown", onPoint);
        function onPoint(e) {
          var r = canvas.getBoundingClientRect();
          var mx = e.clientX - r.left, my = e.clientY - r.top;
          if (ant.alive && Math.hypot(mx - ant.x, my - ant.y) < 34) detonate();
        }
        function detonate() {
          ant.alive = false; boom = 12; count++; ui.set("count", String(count));
          for (var i = 0; i < 90; i++) {
            var a = Math.random() * 7, sp = 1 + Math.random() * 7;
            goo.push({ x: ant.x, y: ant.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, r: 2 + Math.random() * 4 });
          }
          blip(200, 0.18, "square");
          setTimeout(function () { ant.alive = true; }, 900);
        }
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          ant.x = w * 0.5; ant.y = hh * 0.5;
          if (ant.alive) {
            ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.fillStyle = "rgba(240,178,58,0.12)";
            [[-16, 9], [0, 7], [18, 11]].forEach(function (s, i) { ctx.beginPath(); ctx.ellipse(ant.x + s[0], ant.y, s[1], s[1] * 0.85, 0, 0, 7); i === 2 ? ctx.fill() : null; ctx.stroke(); });
            ctx.beginPath(); ctx.moveTo(ant.x + 6, ant.y - 6); ctx.lineTo(ant.x + 14, ant.y - 16); ctx.moveTo(ant.x + 10, ant.y - 6); ctx.lineTo(ant.x + 20, ant.y - 14); ctx.stroke();
            ctx.restore();
            ctx.fillStyle = color; ctx.font = "11px ui-monospace,monospace"; ctx.textAlign = "center";
            ctx.fillText("click me", ant.x, ant.y + 34);
          }
          if (boom > 0) { boom--; ctx.fillStyle = "rgba(240,178,58," + (boom / 20) + ")"; ctx.beginPath(); ctx.arc(ant.x, ant.y, 60 - boom * 3, 0, 7); ctx.fill(); }
          goo.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.vx *= 0.99; if (p.y > hh - 6) { p.y = hh - 6; p.vy *= -0.2; p.vx *= 0.6; } p.life -= 0.006; });
          goo = goo.filter(function (p) { return p.life > 0; });
          goo.forEach(function (p) {
            ctx.globalAlpha = clamp(p.life, 0, 1) * 0.9;
            ctx.fillStyle = "#f0c23a"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
          });
          ctx.globalAlpha = 1;
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onPoint); stop(); };
      }
    },

    // ---- Hagfish slime: pump slime to fill the tank ----
    slime: {
      title: "Drown the tank in slime",
      help: "Tap <b>Slime!</b> each time a predator bites. A pinch of thread meets seawater and explodes into litres of gel.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var litres = 0, target = 0, blobs = [], raf, t = 0;
        ui.controls.appendChild(uiBtn("🌊 Slime!", function () { target = Math.min(20, target + 2.5); for (var i = 0; i < 8; i++) blobs.push({ x: Math.random(), y: 0.5 + Math.random() * 0.4, r: 10 + Math.random() * 30, s: 0 }); blip(70, 0.15, "sine"); }));
        ui.controls.appendChild(uiBtn("↺ Reset", function () { target = 0; litres = 0; blobs = []; }));
        ui.readouts.innerHTML = readoutHTML([{ k: "l", v: "0.0 L", l: "Slime produced" }, { k: "st", v: "clear", l: "Predator gills" }]);
        function loop() {
          t++; var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          // water
          ctx.fillStyle = "rgba(20,60,80,0.35)"; ctx.fillRect(0, 0, w, hh);
          litres += (target - litres) * 0.06;
          var fillFrac = litres / 20;
          // slime body rising
          var top = hh * (1 - fillFrac);
          ctx.save();
          var grd = ctx.createLinearGradient(0, top, 0, hh);
          grd.addColorStop(0, "rgba(53,224,198,0.5)"); grd.addColorStop(1, "rgba(23,168,146,0.85)");
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.moveTo(0, top);
          for (var xx = 0; xx <= w; xx += 12) { ctx.lineTo(xx, top + Math.sin(xx * 0.05 + t * 0.06) * 5 * (fillFrac > 0 ? 1 : 0)); }
          ctx.lineTo(w, hh); ctx.lineTo(0, hh); ctx.closePath(); ctx.fill();
          ctx.restore();
          // hagfish knot
          ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = "round";
          ctx.beginPath();
          var cx = w * 0.5, cy = hh * 0.45;
          for (var a = 0; a < 7; a += 0.1) { var rr = 26 + Math.sin(a * 3 + t * 0.05) * 8; var px = cx + Math.cos(a * 1.5) * rr, py = cy + Math.sin(a) * 16; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
          ctx.stroke();
          // thread wisps
          blobs.forEach(function (b) { b.s += (1 - b.s) * 0.04; });
          blobs.forEach(function (b) {
            ctx.globalAlpha = 0.16; ctx.fillStyle = "#8ff5e4";
            ctx.beginPath(); ctx.arc(b.x * w, b.y * hh, b.r * b.s, 0, 7); ctx.fill();
          });
          ctx.globalAlpha = 1;
          ui.set("l", litres.toFixed(1) + " L");
          ui.set("st", litres > 12 ? "CLOGGED" : litres > 5 ? "choking" : litres > 1 ? "fouled" : "clear");
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); stop(); };
      }
    },

    // ---- Octopus camouflage ----
    camo: {
      title: "Vanish like an octopus",
      help: "Pick a background. The octopus repaints its skin to match &mdash; and the <b>detection</b> meter falls as it disappears.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var backs = {
          coral: ["#c65b7c", "#e08a52", "#7d5bb0"],
          sand: ["#c9b487", "#b09b6a", "#d8c9a3"],
          rock: ["#4a5568", "#39424f", "#5b6678"],
          kelp: ["#2e6b3f", "#3f8a4e", "#245231"]
        };
        var cur = "coral", target = "coral", blend = 1, detection = 8, raf, inked = 0;
        Object.keys(backs).forEach(function (name) {
          ui.controls.appendChild(uiBtn(name[0].toUpperCase() + name.slice(1), function () { if (target !== name) { cur = target; target = name; blend = 0; detection = 100; } }));
        });
        ui.controls.appendChild(uiBtn("💨 Ink & flee", function () { inked = 30; blip(120, 0.2, "sine"); }));
        ui.readouts.innerHTML = readoutHTML([{ k: "det", v: "8%", l: "Detection risk" }]);
        function tiles(name, alpha) {
          var w = W(), hh = H(), cols = backs[name], n = 8;
          for (var i = 0; i < 120; i++) {
            var gx = (i * 53) % w, gy = ((i * 97) % Math.round(hh));
            ctx.globalAlpha = alpha * 0.9;
            ctx.fillStyle = cols[i % cols.length];
            ctx.beginPath(); ctx.arc(gx, gy, 16 + (i % 3) * 6, 0, 7); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          ctx.fillStyle = "#0a1420"; ctx.fillRect(0, 0, w, hh);
          blend = Math.min(1, blend + 0.03);
          tiles(cur, 1 - blend); tiles(target, blend);
          // octopus, skin tinted toward target palette as blend completes
          var ox = w * 0.5, oy = hh * 0.52;
          var skin = backs[target][0];
          ctx.save();
          var skinAlpha = 0.35 + (1 - detection / 100) * 0.55;
          ctx.globalAlpha = inked > 0 ? 0.15 : (0.55 + blend * 0.25);
          ctx.fillStyle = skin; ctx.strokeStyle = "rgba(255,255,255," + (0.25 * (1 - blend)) + ")"; ctx.lineWidth = 2;
          // head
          ctx.beginPath(); ctx.ellipse(ox, oy - 10, 30, 34, 0, 0, 7); ctx.fill(); ctx.stroke();
          // arms
          for (var k = 0; k < 6; k++) {
            var ang = (k / 5 - 0.5) * 2.2;
            ctx.beginPath(); ctx.moveTo(ox + Math.cos(ang) * 14, oy + 18);
            ctx.quadraticCurveTo(ox + Math.cos(ang) * 44, oy + 46, ox + Math.cos(ang) * 60 + Math.sin(Date.now() / 400 + k) * 6, oy + 60);
            ctx.lineWidth = 8; ctx.strokeStyle = skin; ctx.globalAlpha = ctx.globalAlpha; ctx.stroke();
          }
          // eyes
          ctx.globalAlpha = Math.max(0.15, 0.5 - blend * 0.3); ctx.fillStyle = "#05131a";
          ctx.beginPath(); ctx.arc(ox - 11, oy - 16, 3.5, 0, 7); ctx.arc(ox + 11, oy - 16, 3.5, 0, 7); ctx.fill();
          ctx.restore();
          if (inked > 0) { inked--; ctx.globalAlpha = inked / 40; ctx.fillStyle = "#05070c"; ctx.beginPath(); ctx.arc(ox, oy, 70 - inked, 0, 7); ctx.fill(); ctx.globalAlpha = 1; detection = 4; }
          detection += (8 - detection) * 0.05;
          ui.set("det", Math.round(detection) + "%");
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); stop(); };
      }
    },

    // ---- Pufferfish inflate ----
    puffer: {
      title: "Inflate the pufferfish",
      help: "Drag the slider (or hold <b>Gulp</b>) to pump in water. It balloons, the spines lock out, and it becomes unswallowable.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var inflate = 0, hold = 0, raf;
        var rng = h('<div class="rng-wrap"><span>Inflation</span><input type="range" min="0" max="100" value="0"></div>');
        ui.controls.appendChild(rng);
        var slider = rng.querySelector("input");
        slider.addEventListener("input", function () { inflate = +slider.value / 100; });
        var gulp = uiBtn("💨 Gulp (hold)", function () {});
        gulp.addEventListener("pointerdown", function () { hold = 1; });
        window.addEventListener("pointerup", up); function up() { hold = 0; }
        ui.controls.appendChild(gulp);
        ui.readouts.innerHTML = readoutHTML([{ k: "size", v: "×1.0", l: "Diameter" }, { k: "sp", v: "flat", l: "Spines" }]);
        onCleanup(function () { window.removeEventListener("pointerup", up); });
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          if (hold) inflate = Math.min(1, inflate + 0.03);
          else if (!hold && slider.value == inflate * 100) inflate = Math.max(0, inflate - 0.008);
          slider.value = Math.round(inflate * 100);
          var cx = w * 0.5, cy = hh * 0.55, base = Math.min(w, hh) * 0.16;
          var r = base * (1 + inflate * 1.4);
          // body
          ctx.save(); ctx.fillStyle = "rgba(201,133,0,0.16)"; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke();
          // spines
          var spikes = 26, sl = 6 + inflate * 20;
          ctx.strokeStyle = color; ctx.lineWidth = 2;
          for (var i = 0; i < spikes; i++) {
            var a = (i / spikes) * 7; var sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx + Math.cos(a) * (r + sl), cy + Math.sin(a) * (r + sl)); ctx.stroke();
          }
          // eye + mouth
          ctx.fillStyle = "#06121a"; ctx.beginPath(); ctx.arc(cx - r * 0.4, cy - r * 0.25, 4 + inflate * 3, 0, 7); ctx.fill();
          ctx.strokeStyle = "#06121a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - r * 0.62, cy + r * 0.15, 6, -0.2, 1.2); ctx.stroke();
          ctx.restore();
          ui.set("size", "×" + (1 + inflate * 1.4).toFixed(1));
          ui.set("sp", inflate > 0.6 ? "LOCKED" : inflate > 0.2 ? "rising" : "flat");
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); stop(); };
      }
    },

    // ---- Electric eel: charge and discharge ----
    voltage: {
      title: "Charge the electric eel",
      help: "Hold <b>Charge</b> to stack the electrocytes, then release to discharge. Full stack &asymp; 860&nbsp;volts.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var charge = 0, hold = 0, zap = 0, raf, arcs = [];
        var btn = uiBtn("⚡ Charge (hold)", function () {});
        btn.addEventListener("pointerdown", function (e) { e.preventDefault(); hold = 1; });
        window.addEventListener("pointerup", up); function up() { if (hold && charge > 0.15) { zap = 16; makeArcs(); blip(60 + charge * 200, 0.25, "sawtooth"); } hold = 0; }
        ui.controls.appendChild(btn);
        ui.readouts.innerHTML = readoutHTML([{ k: "v", v: "0 V", l: "Output" }, { k: "st", v: "idle", l: "State" }]);
        onCleanup(function () { window.removeEventListener("pointerup", up); });
        function makeArcs() { arcs = []; for (var i = 0; i < 5; i++) arcs.push(Math.random()); }
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          if (hold) charge = Math.min(1, charge + 0.02);
          else charge = Math.max(0, charge - 0.06);
          var volts = Math.round(charge * 860);
          // eel
          var midY = hh * 0.5;
          ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.lineCap = "round";
          ctx.beginPath();
          for (var xx = w * 0.12; xx <= w * 0.88; xx += 8) {
            var yy = midY + Math.sin(xx * 0.03 + Date.now() / 300) * (10 + charge * 6);
            xx === w * 0.12 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
          }
          ctx.stroke();
          // glow along body when charged
          if (charge > 0.05) {
            ctx.globalAlpha = charge * 0.6; ctx.strokeStyle = "#bfffff"; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
          }
          ctx.restore();
          // discharge arcs to a "target" on the right
          if (zap > 0) {
            zap--;
            ctx.strokeStyle = "#dffcff"; ctx.lineWidth = 2;
            arcs.forEach(function (seed) {
              ctx.beginPath();
              var sx = w * 0.86, sy = midY, tx = w * 0.94, ty = hh * 0.3 + seed * hh * 0.4;
              ctx.moveTo(sx, sy);
              for (var s = 0; s < 1; s += 0.2) {
                ctx.lineTo(sx + (tx - sx) * s + (Math.random() - 0.5) * 22, sy + (ty - sy) * s + (Math.random() - 0.5) * 22);
              }
              ctx.lineTo(tx, ty); ctx.stroke();
            });
            // stunned target
            ctx.fillStyle = "rgba(224,69,78,0.6)"; ctx.beginPath(); ctx.arc(w * 0.94, hh * 0.5, 10, 0, 7); ctx.fill();
          }
          // charge bar
          ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(w * 0.12, hh - 16, w * 0.76, 8);
          ctx.fillStyle = charge > 0.8 ? "#e0454e" : color; ctx.fillRect(w * 0.12, hh - 16, w * 0.76 * charge, 8);
          ui.set("v", (zap > 0 ? 860 : volts) + " V");
          ui.set("st", zap > 0 ? "DISCHARGE" : hold ? "charging" : "idle");
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); stop(); };
      }
    },

    // ---- Pistol shrimp snap ----
    snap: {
      title: "Snap the pistol shrimp",
      help: "Hit <b>Snap!</b> to fire the claw. A vacuum bubble forms and implodes &mdash; briefly ~4,700&nbsp;°C, ~210&nbsp;dB.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var phase = 0, raf, snaps = 0, bubble = 0, flash = 0;
        ui.controls.appendChild(uiBtn("🔫 Snap!", function () { if (phase === 0) { phase = 1; snaps++; ui.set("snaps", String(snaps)); } }));
        ui.readouts.innerHTML = readoutHTML([{ k: "db", v: "0 dB", l: "Peak sound" }, { k: "temp", v: "—", l: "Bubble temp" }, { k: "snaps", v: "0", l: "Shots" }]);
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          var cx = w * 0.34, cy = hh * 0.55;
          // shrimp body
          ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.fillStyle = "rgba(217,89,38,0.12)";
          ctx.beginPath(); ctx.ellipse(cx, cy, 30, 16, -0.2, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + 20, cy + 6); ctx.lineTo(cx + 40, cy + 18); ctx.lineTo(cx + 30, cy + 22); ctx.stroke();
          // claw — opens then snaps
          var open = 0;
          if (phase === 1) { open = 1; } // cocked
          var clawX = cx - 30, clawY = cy - 6;
          ctx.lineWidth = 4; ctx.strokeStyle = color;
          var jaw = phase === 1 ? -0.9 : (phase === 2 ? 0.05 : -0.3);
          ctx.beginPath(); ctx.moveTo(clawX, clawY); ctx.lineTo(clawX - 22, clawY - 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(clawX - 22, clawY - 4);
          ctx.lineTo(clawX - 40, clawY - 4 + Math.sin(jaw) * 18); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(clawX - 22, clawY - 4); ctx.lineTo(clawX - 40, clawY - 4 - Math.sin(jaw) * 18); ctx.stroke();
          ctx.restore();
          // phase machine
          if (phase === 1) { // hold cocked briefly
            if (!loop._t) loop._t = 0; loop._t++;
            if (loop._t > 22) { phase = 2; loop._t = 0; bubble = 1; flash = 0; blip(300, 0.03, "square"); }
            ui.set("db", "cocked"); ui.set("temp", "—");
          } else if (phase === 2) { // jet + bubble grows
            bubble += 0.5;
            var bx = clawX - 46, by = clawY;
            ctx.strokeStyle = "rgba(180,240,255,0.8)"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(clawX - 40, clawY); ctx.lineTo(bx, by); ctx.stroke();
            ctx.strokeStyle = "rgba(200,245,255,0.9)"; ctx.beginPath(); ctx.arc(bx, by, bubble, 0, 7); ctx.stroke();
            ui.set("db", "~150 dB");
            if (bubble > 22) { phase = 3; flash = 12; blip(90, 0.22, "square"); }
          } else if (phase === 3) { // implosion flash
            flash--;
            var fx = clawX - 46, fy = clawY;
            ctx.globalAlpha = clamp(flash / 12, 0, 1);
            var rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 40);
            rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.4, "#ffe6a0"); rg.addColorStop(1, "rgba(255,120,40,0)");
            ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(fx, fy, 40, 0, 7); ctx.fill();
            ctx.globalAlpha = 1;
            ui.set("db", "~210 dB"); ui.set("temp", "~4,700 °C");
            if (flash <= 0) { phase = 0; bubble = 0; }
          } else {
            ui.set("db", snaps ? "~210 dB" : "0 dB");
          }
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); stop(); };
      }
    },

    // ---- Gecko tail autotomy ----
    tail: {
      title: "Drop the gecko&rsquo;s tail",
      help: "Grab the <b>tail</b> (click it). It snaps off at a fracture plane and keeps wriggling while the gecko escapes.",
      mount: function (canvas, ctx, ui, color) {
        var stop = fitCanvas(canvas, 0.5);
        var W = function () { return canvas._cssW; }, H = function () { return canvas._cssH; };
        var dropped = false, tailWiggle = 0, geckoX = 0, tailSeg = [], raf, regrow = 0;
        ui.readouts.innerHTML = readoutHTML([{ k: "st", v: "intact", l: "Tail" }]);
        var tailZone = { x: 0, y: 0 };
        canvas.addEventListener("pointerdown", onPoint);
        function onPoint(e) {
          var r = canvas.getBoundingClientRect(); var mx = e.clientX - r.left, my = e.clientY - r.top;
          if (!dropped && Math.hypot(mx - tailZone.x, my - tailZone.y) < 40) drop();
        }
        function drop() {
          dropped = true; tailWiggle = 200; regrow = 0; ui.set("st", "DROPPED");
          tailSeg = []; for (var i = 0; i < 8; i++) tailSeg.push({ x: tailZone.x + i * 10, y: tailZone.y, a: 0 });
          blip(160, 0.1, "triangle");
          setTimeout(function () { ui.set("st", "regrowing"); }, 2600);
        }
        function loop() {
          var w = W(), hh = H(); ctx.clearRect(0, 0, w, hh);
          var by = hh * 0.55;
          if (dropped) { geckoX = Math.min(w + 60, geckoX + 3.4); if (geckoX > w + 40) { /* gone */ } }
          else geckoX = w * 0.42;
          var headX = geckoX;
          // gecko body
          ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.fillStyle = "rgba(201,133,0,0.12)";
          ctx.beginPath(); ctx.ellipse(headX, by, 34, 18, 0, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(headX + 28, by - 12); ctx.lineTo(headX + 52, by); ctx.lineTo(headX + 28, by + 10); ctx.stroke();
          // legs
          [[-14, -1, -1], [10, -1, -1], [-14, 1, 1], [10, 1, 1]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(headX + l[0], by + l[1] * 12); ctx.lineTo(headX + l[0] - 8, by + l[1] * 22); ctx.stroke(); });
          // attached tail (base)
          var stub = headX - 34;
          tailZone.x = stub - (dropped ? 0 : 26); tailZone.y = by;
          if (!dropped) {
            ctx.beginPath(); ctx.moveTo(stub, by);
            for (var s = 0; s < 6; s++) ctx.lineTo(stub - s * 9, by + Math.sin(Date.now() / 300 + s) * 3);
            ctx.lineWidth = 6 - 0; ctx.stroke();
            ctx.fillStyle = color; ctx.font = "11px ui-monospace,monospace"; ctx.textAlign = "center";
            ctx.fillText("grab the tail", tailZone.x, by + 30);
          } else if (regrow < 1) {
            ctx.beginPath(); ctx.moveTo(stub, by); ctx.lineTo(stub - 8 * regrow * 9, by); ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.stroke();
            regrow = Math.min(1, regrow + 0.002);
          }
          ctx.restore();
          // wriggling severed tail
          if (dropped && tailWiggle > 0) {
            tailWiggle--;
            ctx.save(); ctx.strokeStyle = "#c98500"; ctx.lineWidth = 6; ctx.lineCap = "round";
            ctx.beginPath();
            for (var i = 0; i < tailSeg.length; i++) {
              var seg = tailSeg[i];
              seg.x += Math.sin(Date.now() / 90 + i) * 0.8 * (tailWiggle / 200) - 0.2;
              seg.y = by + Math.sin(Date.now() / 70 + i * 0.9) * 14 * (tailWiggle / 200);
              i === 0 ? ctx.moveTo(seg.x, seg.y) : ctx.lineTo(seg.x, seg.y);
            }
            ctx.stroke(); ctx.restore();
          }
          raf = requestAnimationFrame(loop);
        }
        loop();
        return function () { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onPoint); stop(); };
      }
    }
  };

  function uiBtn(label, fn) {
    var b = h('<button class="btn">' + label + '</button>');
    b.addEventListener("click", fn);
    return b;
  }

  function mountDemo(container, key, color) {
    var shell = makeShell(container, key, color);
    var canvas = shell.querySelector("canvas");
    var ctx = canvas.getContext("2d");
    var ui = {
      controls: shell.querySelector(".demo-controls"),
      readouts: shell.querySelector(".readouts"),
      set: function (k, v) { var el = shell.querySelector('.rv[data-k="' + k + '"]'); if (el) el.textContent = v; }
    };
    var cleanup = DEMOS[key].mount(canvas, ctx, ui, color);
    if (cleanup) onCleanup(cleanup);
  }

  // ======================================================================
  //  ROUTER
  // ======================================================================
  function parseHash() {
    var hash = (location.hash || "#/").replace(/^#\/?/, "");
    var parts = hash.split("/").filter(Boolean);
    return { head: parts[0] || "", a: parts[1] || "" };
  }

  function setActiveNav(head) {
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === head);
    });
  }

  function route() {
    flush();
    var r = parseHash();
    var view;
    switch (r.head) {
      case "": view = renderHome(); break;
      case "bestiary": view = renderBestiary(r.a || null); break;
      case "creature": view = renderDossier(r.a); break;
      case "lab": view = renderLab(); break;
      case "chart": view = renderChart(); break;
      case "quiz": view = renderQuiz(); break;
      case "about": view = renderAbout(); break;
      default: view = renderHome();
    }
    app.innerHTML = "";
    app.appendChild(view);
    setActiveNav(r.head);
    // close mobile menu
    var nl = document.querySelector(".nav-links"); if (nl) nl.classList.remove("open");
    // scroll to top on nav (not on same-view anchor)
    window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  }

  window.addEventListener("hashchange", route);

  // mobile burger
  var burger = document.querySelector(".nav-burger");
  if (burger) burger.addEventListener("click", function () {
    var nl = document.querySelector(".nav-links");
    var open = nl.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // go
  route();
})();
