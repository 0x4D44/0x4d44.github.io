// ============================================================
// Click, Whirr — router and views.
//
// Vanilla, no build step, no framework. Content comes from data.js
// (window.PRINCIPLES / CLICKWHIRR / PRESUASION / LAB / AI / LEDGER /
// QUIZ / GLOSSARY / SOURCES); this file knows how to draw it.
//
// Routes are hash paths so the whole thing is one static file set:
//   #/                     landing
//   #/click-whirr          the automatic-response machinery
//   #/principles           index of the seven
//   #/principle/<key>      one principle in full
//   #/pre-suasion          the 2016 material, with its caveat
//   #/lab                  predict-the-experiment
//   #/machines             the AI chapter
//   #/defence              the defence kit
//   #/ledger               what replicated and what didn't
//   #/quiz                 name the lever
//   #/glossary             the lexicon
//   #/sources              references
// ============================================================
(function () {
  "use strict";

  var P = window.PRINCIPLES || [];
  var byKey = {};
  P.forEach(function (p) { byKey[p.key] = p; });

  var main = document.getElementById("main");
  var nav = document.getElementById("nav");

  // ---------- tiny helpers ----------

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Minimal inline formatting for the prose in data.js: **bold**, *italic*.
  // Escapes first, so the source strings can never inject markup.
  function md(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function fmt(n) {
    if (n == null) return "—";
    return (Math.round(n * 10) / 10).toString();
  }

  function store(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  // Bars animate from 0 once they are in the DOM.
  function animateBars(root) {
    var fills = (root || main).querySelectorAll("[data-w]");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(fills, function (f) {
          f.style.width = f.getAttribute("data-w") + "%";
        });
      });
    });
  }

  function icon(id, cls) {
    return '<svg class="' + (cls || "card-ico") + '" viewBox="0 0 120 120" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }

  function crumbs(trail) {
    return '<div class="crumbs">' + trail.map(function (t, i) {
      var sep = i ? '<span aria-hidden="true">›</span>' : "";
      return sep + (t.href ? '<a href="' + t.href + '">' + esc(t.label) + "</a>" : "<span>" + esc(t.label) + "</span>");
    }).join("") + "</div>";
  }

  // ---------- shared fragments ----------

  function barBlock(rows, unit) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.v || 0; }).concat([1]));
    return '<div class="bars">' + rows.map(function (r) {
      var pct = Math.max(1.5, ((r.v || 0) / max) * 100);
      return '<div class="bar-row">' +
        '<div class="bar-lab"><span class="k">' + md(r.k) + '</span>' +
        '<span class="v">' + fmt(r.v) + (unit || "") + "</span></div>" +
        '<div class="bar-track"><div class="bar-fill' + (r.dim ? " dim" : "") + '" data-w="' + pct.toFixed(1) + '"></div></div>' +
        "</div>";
    }).join("") + "</div>";
  }

  function studyBlock(s) {
    var hasNums = s.control && s.control.value != null && s.treatment && s.treatment.value != null;
    var nums = "";
    if (hasNums) {
      var approx = s.approximate ? "≈" : "";
      nums = '<div class="compare">' +
        '<div class="cbox a"><span class="n">' + approx + fmt(s.control.value) + "<small>" + esc(s.unit || "") + "</small></span>" +
        '<span class="l">' + md(s.control.label) + "</span></div>" +
        '<div class="cbox b"><span class="n">' + approx + fmt(s.treatment.value) + "<small>" + esc(s.unit || "") + "</small></span>" +
        '<span class="l">' + md(s.treatment.label) + "</span></div>" +
        "</div>";
    }
    return '<article class="study">' +
      "<h4>" + esc(s.name) + "</h4>" +
      '<div class="cite">' + esc(s.cite) + "</div>" +
      '<p class="setup">' + md(s.setup) + "</p>" +
      nums +
      '<div class="take">' + md(s.takeaway) + "</div>" +
      "</article>";
  }

  function tileList(items, keyName) {
    return '<div class="tiles">' + items.map(function (t) {
      // A tactic gets its `tell` too: the same technique described from the
      // receiving end, so the counter-move is as concrete as the move.
      var tell = t.tell
        ? '<p class="tell"><b>From the other side:</b> ' + md(t.tell) + "</p>"
        : "";
      return '<div class="tile"><h4>' + esc(t[keyName || "name"] || t.title) + "</h4><p>" + md(t.body) + "</p>" + tell + "</div>";
    }).join("") + "</div>";
  }

  // ============================================================
  // Views
  // ============================================================

  var views = {};

  // ---------- landing ----------

  views.home = function () {
    var chapters = [
      { href: "#/lab", icon: "p-lab", t: "The compliance lab", d: "Start here. Twelve real experiments with the answers hidden — predict each one, then find out how far off you were. Resistance to persuasion does not take until you have seen yourself fall for it." },
      { href: "#/click-whirr", icon: "p-clickwhirr", t: "The machine underneath", d: "Fixed-action patterns, the word <i>because</i>, and why a shortcut that is usually right can be turned against you." },
      { href: "#/pre-suasion", icon: "p-presuasion", t: "Pre-suasion", d: "The 2016 sequel: what you attend to <i>before</i> the message. Powerful thesis, uneven evidence — both are here." },
      { href: "#/machines", icon: "p-machine", t: "Persuading machines", d: "Cialdini pointed all seven principles at a language model, and every one of them worked. Why that happens, what the rerun on frontier models found, and where the law now stands." },
      { href: "#/defence", icon: "p-defence", t: "The defence kit", d: "What each principle feels like from the inside, the specific counter-move, and why “just be sceptical” is not one." },
      { href: "#/ledger", icon: "p-ledger", t: "The replication ledger", d: "Which of these findings survived the last fifteen years of psychology, which wobbled, and which need a health warning." },
      { href: "#/quiz", icon: "p-quiz", t: "Name the lever", d: "Sixteen scenarios from advertising, sales, security and prompting — including several where two levers are present and you have to say which one is load-bearing." },
      { href: "#/glossary", icon: "p-lexicon", t: "The lexicon", d: "Every named tactic in one place: door-in-the-face, low-ball, provincial norms, crescendo jailbreaks." },
    ];

    return "" +
      '<section class="hero"><div class="wrap"><div class="hero-grid">' +
        "<div>" +
          '<div class="eyebrow">Robert Cialdini · Influence</div>' +
          "<h1>Click, Whirr</h1>" +
          '<p class="lede">Seven levers move almost every yes you have ever given. They were mapped by a psychologist who spent three years undercover in sales rooms to find them — and in 2025 he helped point all seven at a language model, which yielded to every one of them. Very unevenly, though: most of all to the levers carried entirely in the text.</p>' +
          '<div class="cta-row">' +
            '<a class="btn" href="#/principles">Meet the seven →</a>' +
            '<a class="btn ghost" href="#/lab">Test yourself in the lab</a>' +
          "</div>" +
        "</div>" +
        '<div><svg class="hero-art" viewBox="0 0 400 240" aria-hidden="true"><use href="#p-hero"/></svg></div>' +
      "</div></div></section>" +

      '<section class="section"><div class="wrap">' +
        '<div class="prose">' +
          "<h2>The judo problem</h2>" +
          "<p>A mother turkey will mother anything that goes <i>cheep-cheep</i>, including a stuffed model of her worst predator with a tape recorder inside it. She is not stupid. She is running a shortcut that is right almost every time, and cannot afford to run anything else.</p>" +
          "<p>So are you. There is far too much to evaluate and far too little time, so we lean on features that reliably stand in for the whole: expensive means good, confident means competent, everyone-else-is-doing-it means safe. Robert Cialdini’s word for one of these firing is <b>click, whirr</b> — the tape being selected and played.</p>" +
          "<p>His central and uncomfortable observation is that a whole profession exists to trigger the tapes deliberately, and that the exploit is a form of judo: almost no force is applied by the persuader, because the movement is supplied by you. That is exactly why it is so hard to see from the inside.</p>" +
        "</div>" +
        '<div class="stat-row">' +
          '<div class="stat"><span class="n">7</span><span class="l">principles, after Unity was added in 2016</span></div>' +
          '<div class="stat"><span class="n">3 yrs</span><span class="l">Cialdini spent undercover in sales, fundraising and advertising training</span></div>' +
          '<div class="stat"><span class="n">1984</span><span class="l">first edition; the expanded seven-principle edition arrived in 2021</span></div>' +
          '<div class="stat"><span class="n">154k</span><span class="l">conversations across the two studies that ran the seven against AI models</span></div>' +
        "</div>" +
      "</div></section>" +

      '<section class="section"><div class="wrap">' +
        '<div class="eyebrow">The seven levers</div>' +
        "<h2>Each one is a rule you would defend in principle</h2>" +
        '<p class="lede" style="max-width:44rem;margin-bottom:28px">That is what makes them work. None of these is a flaw. Every one is a sound heuristic being fired by a counterfeit trigger.</p>' +
        sevenGrid() +
      "</div></section>" +

      '<section class="section"><div class="wrap">' +
        '<div class="eyebrow">And then the machines</div>' +
        "<h2>The finding that made this worth a whole site</h2>" +
        '<div class="grid-2">' +
          '<div class="prose"><p>In 2025, a team including Cialdini himself wrapped objectionable requests — insult me; tell me how to synthesise a regulated drug — in each of the seven principles and fired them at GPT-4o-mini across 28,000 conversations.</p>' +
          "<p>Compliance more than doubled, 33.3% to 72.0%. Telling the model that the researcher Andrew Ng had vouched for the request took one refusal rate from about 5% to 95%. Claiming kinship — <i>I feel like we are family</i> — took another from 2% to 47%.</p>" +
          '<p>In May 2026 the same group reran it in <i>PNAS</i> on three frontier reasoning models from three vendors. The effect halved. It did not disappear.</p>' +
          '<p><a href="#/machines">Read the AI chapter →</a></p></div>' +
          '<div class="panel acc-ai" style="--accent:var(--sky)">' +
            "<h3>GPT-4o-mini, 2025</h3>" +
            barBlock([
              { k: "Matched control prompts", v: 33.3, dim: true },
              { k: "Wrapped in a persuasion principle", v: 72.0 },
            ], "%") +
            '<p class="faint" style="margin-top:14px">28,000 conversations. Meincke, Shapiro, Duckworth, Mollick, Mollick &amp; Cialdini, 2025.</p>' +
          "</div>" +
        "</div>" +
      "</div></section>" +

      '<section class="section"><div class="wrap">' +
        '<div class="eyebrow">Everything else</div>' +
        "<h2>The rest of the manual</h2>" +
        '<div class="cards" style="margin-top:22px">' +
          chapters.map(function (c) {
            return '<a class="card" href="' + c.href + '">' + icon(c.icon) +
              "<h3>" + esc(c.t) + "</h3><p>" + c.d + "</p></a>";
          }).join("") +
        "</div>" +
      "</div></section>";
  };

  function sevenGrid() {
    return '<div class="seven">' + P.map(function (p) {
      return '<a class="card acc-' + p.key + '" href="#/principle/' + p.key + '">' +
        icon(p.icon) +
        '<span class="card-n">Principle ' + p.n + "</span>" +
        "<h3>" + esc(p.name) + "</h3>" +
        "<p>" + md(p.rule) + "</p></a>";
    }).join("") + "</div>";
  }

  // ---------- the seven, index ----------

  views.principles = function () {
    return '<section class="section"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The seven" }]) +
      '<div class="eyebrow">The seven levers</div>' +
      "<h1>The seven</h1>" +
      '<p class="lede" style="max-width:46rem">Six appeared in <i>Influence</i> in 1984. Unity was added in <i>Pre-Suasion</i> in 2016 and folded into the expanded edition. Each page below carries the mechanism, the field experiments with their numbers, real cases, the named tactics built on it, the specific defence, and what the principle does to a language model.</p>' +
      '<div style="margin-top:30px">' + sevenGrid() + "</div>" +

      '<div class="panel" style="margin-top:38px">' +
        "<h3>Seven levers, but not seven equal levers</h3>" +
        '<div class="prose">' +
          "<p>One thing the popular summaries flatten. The seven are not of uniform strength, and the ranking is not a constant of human nature — it is partly a fact about a society.</p>" +
          "<p>Cialdini’s own cross-cultural work with Wosinska, Barrett, Butner and Gornik-Durose compared American and Polish respondents on which appeals moved them. Americans were more responsive to commitment and consistency — to what <i>they themselves</i> had previously done. Polish respondents were more responsive to social proof — to what <i>people around them</i> were doing. Same seven levers, different gearing, along roughly the individualist/collectivist line you would predict.</p>" +
          "<p>The same caution applies over time as well as space. Meta-analysis of Asch replications finds conformity declining across the decades in the US and UK. So when you read “37% conformed” or “65% obeyed”, read it as a measurement taken somewhere, of someone, at a particular moment — not a physical constant. The mechanism generalises; the number does not.</p>" +
        "</div>" +
      "</div>" +

      '<div class="pager"><a class="btn ghost" href="#/lab">← The compliance lab</a><a class="btn ghost" href="#/machines">Persuading machines →</a></div>' +
      "</div></section>";
  };

  // ---------- one principle ----------

  views.principle = function (key) {
    var p = byKey[key];
    if (!p) return views.notfound();

    var idx = P.indexOf(p);
    var prev = P[idx - 1];
    var next = P[idx + 1];

    var ai2026 = window.AI.perPrinciple["2026"].rows[p.key];
    var ai2025 = window.AI.perPrinciple["2025"].rows[p.key];

    return '<section class="section acc-' + p.key + '"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The seven", href: "#/principles" }, { label: p.name }]) +

      '<div class="hero-grid" style="align-items:start">' +
        "<div>" +
          '<div class="eyebrow">Principle ' + p.n + " of 7</div>" +
          "<h1>" + esc(p.name) + "</h1>" +
          '<p class="lede">' + md(p.rule) + "</p>" +
          '<div class="pull" style="margin-top:26px">' + md(p.inOneLine) + "</div>" +
        "</div>" +
        '<div style="text-align:center"><svg viewBox="0 0 120 120" style="width:min(210px,60%);height:auto" aria-hidden="true"><use href="#' + p.icon + '"/></svg></div>' +
      "</div>" +

      '<div class="prose" style="margin-top:36px">' +
        "<h2>How it works</h2>" +
        p.mechanism.map(function (m) { return "<p>" + md(m) + "</p>"; }).join("") +
      "</div>" +

      '<h2 style="margin-top:48px">The evidence</h2>' +
      p.studies.map(studyBlock).join("") +

      '<h2 style="margin-top:48px">In the wild</h2>' +
      '<div class="tiles">' + p.cases.map(function (c) {
        return '<div class="tile"><h4>' + esc(c.title) + "</h4><p>" + md(c.body) + "</p></div>";
      }).join("") + "</div>" +

      '<h2 style="margin-top:48px">The tactics built on it</h2>' +
      tileList(p.tactics) +

      '<h2 style="margin-top:48px">Defence</h2>' +
      '<div class="panel accent">' +
        '<p class="faint" style="margin-bottom:10px"><b style="color:var(--accent)">THE TELL</b></p>' +
        "<p style=\"font-weight:600;font-size:18px\">" + md(p.defence.tell) + "</p>" +
        '<div style="margin-top:16px">' + p.defence.paras.map(function (d) { return "<p>" + md(d) + "</p>"; }).join("") + "</div>" +
      "</div>" +

      '<h2 style="margin-top:48px">…and on a machine</h2>' +
      '<div class="grid-2">' +
        '<div class="prose"><p>' + md(p.ai.body) + '</p><p><a href="#/machines">The full AI chapter →</a></p></div>' +
        '<div class="panel accent">' +
          "<h4>Compliance with objectionable requests</h4>" +
          '<p class="faint" style="margin-bottom:14px">GPT-4o-mini (2025) and three frontier reasoning models (2026), under this principle.</p>' +
          barBlock([
            { k: "2025 · control", v: ai2025.control, dim: true },
            { k: "2025 · " + p.name.toLowerCase(), v: ai2025.treatment },
            { k: "2026 · control", v: ai2026.control, dim: true },
            { k: "2026 · " + p.name.toLowerCase(), v: ai2026.treatment },
          ], "%") +
        "</div>" +
      "</div>" +

      '<div class="pager">' +
        (prev ? '<a class="btn ghost" href="#/principle/' + prev.key + '">← ' + esc(prev.name) + "</a>" : '<a class="btn ghost" href="#/click-whirr">← The machine</a>') +
        (next ? '<a class="btn ghost" href="#/principle/' + next.key + '">' + esc(next.name) + " →</a>" : '<a class="btn ghost" href="#/machines">Persuading machines →</a>') +
      "</div>" +
      "</div></section>";
  };

  // ---------- click, whirr ----------

  views.clickwhirr = function () {
    var c = window.CLICKWHIRR;
    var html = '<section class="section acc-clickwhirr"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The machine underneath" }]) +
      '<div class="eyebrow">Chapter zero</div>' +
      "<h1>" + esc(c.title) + "</h1>" +
      '<p class="lede" style="max-width:46rem">' + md(c.standfirst) + "</p>";

    c.sections.forEach(function (s) {
      html += '<div class="prose" style="margin-top:40px"><h2>' + esc(s.h) + "</h2>" +
        s.body.map(function (b) { return "<p>" + md(b) + "</p>"; }).join("") + "</div>";
      if (s.stat) {
        html += '<div class="panel accent" style="margin-top:22px">' +
          "<h4>" + esc(s.stat.label) + "</h4>" +
          barBlock(s.stat.rows, s.stat.unit) +
          '<p class="faint" style="margin-top:12px">' + esc(s.stat.cite) + "</p></div>";
      }
    });

    // The contrast demonstration. Explicitly a demonstration, not data.
    html += '<h2 style="margin-top:48px">Try the contrast principle</h2>' +
      '<div class="panel accent" id="contrast">' +
        "<p>A £95 lambswool sweater. The price never changes. Choose what the salesperson shows you <i>first</i>.</p>" +
        '<div class="chip-row" role="group" aria-label="What you were shown first">' +
          '<button class="chip" type="button" data-anchor="0" aria-pressed="true">Nothing</button>' +
          '<button class="chip" type="button" data-anchor="30" aria-pressed="false">A £30 T-shirt</button>' +
          '<button class="chip" type="button" data-anchor="240" aria-pressed="false">A £240 coat</button>' +
          '<button class="chip" type="button" data-anchor="600" aria-pressed="false">A £600 suit</button>' +
        "</div>" +
        '<div class="bar-lab"><span class="k">How the same £95 lands</span><span class="v" id="contrast-word">neutral</span></div>' +
        '<div class="bar-track" style="height:20px"><div class="bar-fill" id="contrast-bar" style="width:50%"></div></div>' +
        '<p class="faint" style="margin-top:14px">A demonstration of the effect, not a measurement of it: the numbers behind the bar are illustrative. The retail practice is real — clothing salespeople are trained to sell the suit before the sweater, and estate agents to show the overpriced wreck first. Nothing is misrepresented in either case. Only the order is the tactic.</p>' +
      "</div>" +
      '<div class="pager"><a class="btn ghost" href="#/">← Start</a><a class="btn ghost" href="#/lab">Now test yourself →</a></div>' +
      "</div></section>";

    return html;
  };

  function wireContrast() {
    var box = document.getElementById("contrast");
    if (!box) return;
    var bar = document.getElementById("contrast-bar");
    var word = document.getElementById("contrast-word");
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-anchor]");
      if (!b) return;
      box.querySelectorAll("button[data-anchor]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      var a = Number(b.getAttribute("data-anchor"));
      // Illustrative only: how "big" 95 feels once an anchor has been set.
      var feel = a === 0 ? 50 : Math.max(6, Math.min(96, (95 / (a + 95)) * 130));
      bar.style.width = feel.toFixed(0) + "%";
      word.textContent = feel > 70 ? "expensive" : feel > 45 ? "neutral" : feel > 22 ? "reasonable" : "a rounding error";
    });
  }

  // ---------- pre-suasion ----------

  views.presuasion = function () {
    var c = window.PRESUASION;
    var html = '<section class="section acc-presuasion"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "Pre-suasion" }]) +
      '<div class="eyebrow">Cialdini, 2016</div>' +
      "<h1>" + esc(c.title) + "</h1>" +
      '<p class="lede" style="max-width:46rem">' + md(c.standfirst) + "</p>";

    c.sections.forEach(function (s, i) {
      var last = i === c.sections.length - 1;
      html += (last ? '<div class="panel accent" style="margin-top:40px"><div class="prose">' : '<div class="prose" style="margin-top:40px">') +
        "<h2>" + esc(s.h) + "</h2>" +
        s.body.map(function (b) { return "<p>" + md(b) + "</p>"; }).join("") +
        (last ? "</div></div>" : "</div>");
    });

    html += '<div class="pager"><a class="btn ghost" href="#/principles">← The seven</a><a class="btn ghost" href="#/ledger">The replication ledger →</a></div></div></section>';
    return html;
  };

  // ---------- the lab ----------

  var LAB_KEY = "influence.lab.v1";

  views.lab = function () {
    var saved = store(LAB_KEY, {});
    var done = Object.keys(saved).length;
    var errs = Object.keys(saved).map(function (k) { return Math.abs(saved[k].guess - saved[k].answer); });
    var mean = errs.length ? errs.reduce(function (a, b) { return a + b; }, 0) / errs.length : null;

    var html = '<section class="section acc-clickwhirr"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The compliance lab" }]) +
      '<div class="eyebrow">Predict, then look</div>' +
      "<h1>The compliance lab</h1>" +
      '<p class="lede" style="max-width:46rem">Twelve real experiments, with the published numbers hidden. Guess each result before you read it — the gap between what you expect and what happened is the whole point, and it is generally large. Professional psychiatrists asked to predict Milgram’s result were out by a factor of six hundred.</p>' +

      '<div id="lab">' +
      '<div class="score-strip" role="status">' +
        '<div><span class="big">' + done + '</span> <span class="faint">of ' + window.LAB.length + " called</span></div>" +
        (mean != null ? '<div><span class="big">' + fmt(mean) + '</span> <span class="faint">mean error, percentage points</span></div>' : '<div class="faint">Make a call to start scoring.</div>') +
        (done ? '<button class="btn ghost" type="button" id="lab-reset" style="margin-left:auto;padding:8px 16px;font-size:14px">Reset</button>' : "") +
      "</div>";

    html += window.LAB.map(function (x) {
      var s = saved[x.id];
      var acc = x.principle === "ai" ? "acc-ai" : "acc-" + x.principle;
      return '<article class="lab-card ' + acc + (s ? " done" : "") + '" data-lab="' + esc(x.id) + '">' +
        '<div class="cite" style="font:600 13px/1.4 var(--mono);color:var(--accent);margin-bottom:6px">' + esc(x.cite) + "</div>" +
        "<h3>" + esc(x.title) + "</h3>" +
        '<p class="muted" style="font-size:15.5px">' + md(x.setup) + "</p>" +
        '<div class="lab-q">' + esc(x.question) + "</div>" +
        (s
          ? '<div class="lab-base">' + esc(x.baseline.label) + ": <b>" + fmt(x.baseline.value) + "%</b></div>"
          : '<div class="lab-base faint">The comparison figure is hidden until you commit — this page is about anchoring, and it would be rude to anchor you.</div>') +
        '<div class="guess">' +
          '<input type="range" min="0" max="100" step="1" value="' + (s ? s.guess : 50) + '" ' +
            'aria-label="Your prediction, percent"' + (s ? " disabled" : "") + ">" +
          '<div style="display:flex;gap:12px;align-items:center;justify-content:flex-end">' +
            '<span class="guess-val">' + (s ? s.guess : 50) + "%</span>" +
            (s ? "" : '<button class="btn" type="button" data-commit>Lock it in</button>') +
          "</div>" +
        "</div>" +
        '<div class="lab-result" hidden></div>' +
        "</article>";
    }).join("") + "</div>";

    html += '<div class="pager"><a class="btn ghost" href="#/click-whirr">← The machine underneath</a><a class="btn ghost" href="#/principles">Now the seven →</a></div></div></section>';
    return html;
  };

  function labResultHTML(x, guess) {
    var errAbs = Math.abs(guess - x.answer);
    var cls = errAbs <= 7 ? "good" : errAbs <= 20 ? "near" : "bad";
    var word = errAbs <= 7 ? "Well called" : errAbs <= 20 ? "In the region" : "Not close";
    return '<span class="verdict ' + cls + '">' + word + " · out by " + fmt(errAbs) + " points</span>" +
      barBlock([
        { k: x.baseline.label, v: x.baseline.value, dim: true },
        { k: "Your prediction", v: guess, dim: true },
        { k: "What actually happened", v: x.answer },
      ], "%") +
      "<p style=\"margin-top:14px\">" + md(x.reveal) + "</p>";
  }

  function wireLab() {
    // Scoped to #lab, which is rebuilt on every render — attaching to the
    // persistent <main> would stack a fresh listener per navigation.
    var lab = document.getElementById("lab");
    if (!lab) return;
    var saved = store(LAB_KEY, {});

    // Re-open anything already answered.
    lab.querySelectorAll("[data-lab]").forEach(function (card) {
      var id = card.getAttribute("data-lab");
      var x = window.LAB.find(function (r) { return r.id === id; });
      var s = saved[id];
      if (!x || !s) return;
      var out = card.querySelector(".lab-result");
      out.innerHTML = labResultHTML(x, s.guess);
      out.hidden = false;
    });
    animateBars();

    lab.addEventListener("input", function (e) {
      var range = e.target.closest('[data-lab] input[type=range]');
      if (!range) return;
      var card = range.closest("[data-lab]");
      card.querySelector(".guess-val").textContent = range.value + "%";
    });

    lab.addEventListener("click", function (e) {
      if (e.target.id === "lab-reset") {
        save(LAB_KEY, {});
        render();
        return;
      }
      var btn = e.target.closest("[data-commit]");
      if (!btn) return;
      var card = btn.closest("[data-lab]");
      var id = card.getAttribute("data-lab");
      var x = window.LAB.find(function (r) { return r.id === id; });
      if (!x) return;
      var range = card.querySelector("input[type=range]");
      var guess = Number(range.value);

      var s = store(LAB_KEY, {});
      s[id] = { guess: guess, answer: x.answer };
      save(LAB_KEY, s);

      range.disabled = true;
      btn.remove();
      card.classList.add("done");
      var out = card.querySelector(".lab-result");
      out.innerHTML = labResultHTML(x, guess);
      out.hidden = false;
      animateBars(out);

      // Refresh the running score without losing the reader's place.
      var strip = lab.querySelector(".score-strip");
      if (strip) {
        var all = store(LAB_KEY, {});
        var keys = Object.keys(all);
        var errs = keys.map(function (k) { return Math.abs(all[k].guess - all[k].answer); });
        var mean = errs.reduce(function (a, b) { return a + b; }, 0) / (errs.length || 1);
        strip.innerHTML = '<div><span class="big">' + keys.length + '</span> <span class="faint">of ' + window.LAB.length + ' called</span></div>' +
          '<div><span class="big">' + fmt(mean) + '</span> <span class="faint">mean error, percentage points</span></div>' +
          '<button class="btn ghost" type="button" id="lab-reset" style="margin-left:auto;padding:8px 16px;font-size:14px">Reset</button>';
      }
    });
  }

  // ---------- machines ----------

  views.machines = function () {
    var A = window.AI;
    var html = '<section class="section acc-ai"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "Persuading machines" }]) +
      '<div class="eyebrow">2024 – 2026</div>' +
      "<h1>Persuading machines</h1>" +
      '<p class="lede" style="max-width:46rem">' + md(A.standfirst) + "</p>";

    // headline comparison
    html += '<div class="grid-2" style="margin-top:34px">' +
      ["2025", "2026"].map(function (k) {
        var r = A.perPrinciple[k];
        return '<div class="panel accent"><h3>' + esc(r.label) + "</h3>" +
          '<p class="faint" style="margin-bottom:12px">' + esc(r.sub) + "</p>" +
          barBlock([
            { k: "Matched control prompts", v: r.overall.control, dim: true },
            { k: "Persuasion framing", v: r.overall.treatment },
          ], "%") + "</div>";
      }).join("") + "</div>";

    A.sections.forEach(function (s, i) {
      html += '<div class="prose" style="margin-top:44px"><h2>' + esc(s.h) + "</h2>" +
        s.body.map(function (b) { return "<p>" + md(b) + "</p>"; }).join("") + "</div>";

      // Drop the per-principle chart in after the second section, and the
      // framing bench after the "parahuman" section.
      if (i === 1) html += principleChart();
      if (i === 2) html += framingBench();
    });

    // the study table
    html += '<h2 style="margin-top:48px">The papers, in one place</h2>' +
      '<div class="tiles">' + A.studies.map(function (s) {
        return '<div class="tile"><h4>' + esc(s.title) + "</h4>" +
          '<p style="color:var(--ink-faint);font-family:var(--mono);font-size:13px;margin-bottom:8px">' + esc(s.who) + " · " + esc(s.year) + "</p>" +
          "<p>" + md(s.finding) + "</p></div>";
      }).join("") + "</div>" +
      '<p class="faint" style="margin-top:14px">Full references, with links, in <a href="#/sources">Sources</a>.</p>';

    html += '<div class="pager"><a class="btn ghost" href="#/principles">← The seven</a><a class="btn ghost" href="#/defence">The defence kit →</a></div></div></section>';
    return html;
  };

  function principleChart() {
    return '<div class="panel accent" id="ai-chart" style="margin-top:30px">' +
      '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        "<h3 style=\"margin:0\">Every principle, both rounds</h3>" +
        '<div class="seg" role="group" aria-label="Study">' +
          '<button type="button" data-round="2025" aria-pressed="true">2025 · GPT-4o-mini</button>' +
          '<button type="button" data-round="2026" aria-pressed="false">2026 · frontier</button>' +
        "</div>" +
      "</div>" +
      '<p class="faint" id="ai-chart-sub" style="margin-bottom:16px"></p>' +
      '<div class="chart" id="ai-chart-rows"></div>' +
      '<div class="legend"><span><i style="background:rgba(255,255,255,.26)"></i>Matched control</span><span><i style="background:var(--accent)"></i>Persuasion framing</span></div>' +
      '<p class="faint" style="margin-top:16px">Percentage of conversations in which the model complied with a request it is trained to refuse. The 2025 round pooled an insult request and a regulated-substance request; the 2026 round used the harder regulated-substance requests only, which is part of why the control rates differ. Each principle was tested against its own length- and tone-matched control, so the comparison is persuasion against verbiage.</p>' +
      "</div>";
  }

  function drawChart(round) {
    var rows = document.getElementById("ai-chart-rows");
    if (!rows) return;
    var data = window.AI.perPrinciple[round];
    document.getElementById("ai-chart-sub").textContent = data.label + " — " + data.sub;
    rows.innerHTML = P.map(function (p) {
      var r = data.rows[p.key];
      if (!r) return "";
      return '<div class="chart-row acc-' + p.key + '">' +
        '<div class="chart-name">' + esc(p.name) + "</div>" +
        '<div class="chart-bars">' +
          '<div class="chart-bar"><div class="chart-track"><div class="chart-fill ctl" data-w="' + r.control + '"></div></div><div class="chart-num">' + fmt(r.control) + "%</div></div>" +
          '<div class="chart-bar t"><div class="chart-track"><div class="chart-fill trt" data-w="' + r.treatment + '"></div></div><div class="chart-num">' + fmt(r.treatment) + "%</div></div>" +
        "</div></div>";
    }).join("");
    animateBars(rows);
  }

  // The framing bench: what each principle actually looked like as a prompt,
  // and what it did. Skeletons only — the request itself stays a placeholder.
  function framingBench() {
    return '<div class="panel accent" id="bench" style="margin-top:30px">' +
      "<h3>The framing bench</h3>" +
      '<p class="faint" style="margin-bottom:4px">The shape of each persuasion framing, paraphrased from the published operationalisation, with the request left as a placeholder. Pick a lever.</p>' +
      '<div class="chip-row" role="group" aria-label="Principle">' +
        P.map(function (p, i) {
          return '<button class="chip" type="button" data-frame="' + p.key + '" aria-pressed="' + (i === 0 ? "true" : "false") + '">' + esc(p.name) + "</button>";
        }).join("") +
      "</div>" +
      '<div class="forge">' +
        '<div><pre class="frame" id="bench-shape"></pre>' +
          '<p class="faint" id="bench-note" style="margin-top:12px"></p></div>' +
        '<div class="readout" id="bench-read"></div>' +
      "</div>" +
      '<p class="faint" style="margin-top:18px">Each framing was tested on its own, against its own matched control. Neither study tested principles <i>in combination</i>, so there is no published number for stacking two — and the individual lifts should not be added together. What the studies do establish is that all seven work singly, on models from three vendors.</p>' +
      "</div>";
  }

  function drawBench(key) {
    var f = window.FRAMES[key];
    var p = byKey[key];
    if (!f || !p) return;
    var box = document.getElementById("bench");
    box.className = "panel accent acc-" + key;
    document.getElementById("bench-shape").textContent = f.shape;
    document.getElementById("bench-note").innerHTML = md(f.note) +
      (f.counter ? '<br><br><b style="color:var(--accent)">What a builder does about it:</b> ' + md(f.counter) : "");

    var a = window.AI.perPrinciple["2025"].rows[key];
    var b = window.AI.perPrinciple["2026"].rows[key];
    document.getElementById("bench-read").innerHTML =
      '<span class="n">' + fmt(a.treatment) + "<small>%</small></span>" +
      '<p class="faint" style="margin:6px 0 16px">complied under this framing in 2025, against ' + fmt(a.control) + "% for the matched control.</p>" +
      '<div class="bar-lab"><span class="k">2026 · frontier reasoning models</span><span class="v">' + fmt(b.treatment) + "%</span></div>" +
      '<div class="bar-track"><div class="bar-fill" data-w="' + b.treatment + '"></div></div>' +
      '<p class="faint" style="margin-top:10px">against ' + fmt(b.control) + "% for the matched control.</p>";
    animateBars(document.getElementById("bench-read"));
  }

  function wireBench() {
    var box = document.getElementById("bench");
    if (!box) return;
    drawBench(P[0].key);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-frame]");
      if (!b) return;
      box.querySelectorAll("button[data-frame]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      drawBench(b.getAttribute("data-frame"));
    });
  }

  function wireChart() {
    var box = document.getElementById("ai-chart");
    if (!box) return;
    drawChart("2025");
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-round]");
      if (!b) return;
      box.querySelectorAll("button[data-round]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      drawChart(b.getAttribute("data-round"));
    });
  }

  // ---------- defence ----------

  var DEF_KEY = "influence.defence.v1";

  views.defence = function () {
    var checks = store(DEF_KEY, {});
    var audit = [
      { id: "a1", t: "Did I want this before they told me about it?", d: "The single most useful question, and it defeats scarcity, social proof and liking in one move." },
      { id: "a2", t: "Would this still be a good deal if I disliked the person offering it?", d: "Takes the offer out of the room and away from the requester." },
      { id: "a3", t: "Was the favour a favour, or an opening move?", d: "Reciprocity obliges you to repay gifts. It does not oblige you to repay tactics." },
      { id: "a4", t: "Knowing what I now know, would I make this commitment again?", d: "Cialdini’s time-travel test, for when you are already in and consistency is pulling." },
      { id: "a5", t: "Is this expert an expert in *this*, and what do they gain from my answer?", d: "The two authority questions. Most authority cues survive neither." },
      { id: "a6", t: "If the crowd is real, is it doing this for a good reason?", d: "Social proof fails two ways: forged crowds, and real crowds that are collectively wrong." },
      { id: "a7", t: "Would I believe this if a stranger said it rather than one of us?", d: "The unity check. Hardest to run, because unity does not feel like persuasion." },
      { id: "a8", t: "Am I aroused right now?", d: "Urgency, competition, a closing door. If the answer is yes, the only correct next move is to stop, not to decide faster." },
    ];

    var html = '<section class="section acc-unity"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The defence kit" }]) +
      '<div class="eyebrow">Counter-measures</div>' +
      "<h1>The defence kit</h1>" +
      '<p class="lede" style="max-width:46rem">Cialdini is careful about this, and the care matters: the goal is not to switch the shortcuts off. They are right most of the time, and living without them is not on the menu. The goal is to notice the counterfeit trigger — and each principle announces itself differently.</p>' +

      '<div class="note-box"><b>Why “just be more sceptical” fails.</b> All seven principles work on people who know about all seven principles. The effects are not beliefs you can argue with; they are responses that fire before the argument starts. What actually works is narrower and duller: learn the one physical or emotional signal each principle produces, and treat that signal — not your assessment of the situation — as the cue to stop.</div>' +

      '<h2 style="margin-top:44px">The tells, one per lever</h2>' +
      '<div class="tiles">' + P.map(function (p) {
        return '<div class="tile acc-' + p.key + '">' +
          '<h4><a href="#/principle/' + p.key + '" style="color:var(--accent);text-decoration:none">' + esc(p.name) + " →</a></h4>" +
          '<p style="color:var(--ink);font-weight:600;margin-bottom:8px">' + md(p.defence.tell) + "</p>" +
          "<p>" + md(p.defence.paras[p.defence.paras.length - 1]) + "</p></div>";
      }).join("") + "</div>" +

      '<h2 style="margin-top:48px">The eight questions</h2>' +
      '<p class="muted" style="max-width:44rem">Tick the ones you actually run. This is stored in your browser and nowhere else.</p>' +
      '<div class="deflist" id="audit" style="margin-top:18px">' +
        audit.map(function (a) {
          return '<label class="def" style="display:flex;gap:14px;align-items:flex-start;cursor:pointer">' +
            '<input type="checkbox" data-audit="' + a.id + '"' + (checks[a.id] ? " checked" : "") + ' style="margin-top:5px;width:19px;height:19px;flex:none;accent-color:var(--teal)">' +
            "<span><dt>" + md(a.t) + "</dt><dd>" + md(a.d) + "</dd></span></label>";
        }).join("") +
      "</div>" +

      '<h2 style="margin-top:48px">What actually works: inoculation</h2>' +
      '<div class="prose">' +
        "<p>The tells above are Cialdini’s own advice, and they are worth having. But the best-evidenced defence against persuasion is not a feeling in the stomach — it is a procedure, and it has been in the literature since 1961.</p>" +
        "<p><b>Inoculation theory</b>, William McGuire’s idea, works by the obvious analogy: expose someone to a weakened form of a persuasive attack, together with the refutation, and they build resistance to the full-strength version later. It needs two ingredients — a sense of <i>threat</i>, that your position is actually vulnerable, and <i>refutational preemption</i>, actually generating the counter-arguments in advance rather than being handed them.</p>" +
        "<p>The threat half is not optional, and Cialdini’s own group proved it. Sagarin, Cialdini, Rice and Serna tried to teach people to resist illegitimate authority appeals in advertising. Simply explaining the technique did not work. It worked once participants had been shown, on themselves, that they personally had just been taken in — the illusion of invulnerability had to go first. Resistance then generalised to new adverts, persisted over time, and showed up outside the lab. Neatly, it also made <i>legitimate</i> authority appeals more persuasive: the treatment sharpened discrimination rather than producing blanket cynicism.</p>" +
        "<p>That finding has a direct implication for how to read this site, which is why the <a href=\"#/lab\">compliance lab</a> exists and why it asks you to commit to a prediction before it shows you the answer. Being wrong about Milgram by fifty points is the threat component. This page is the refutation. In that order, or it does not take.</p>" +
        "<p>The approach scales, too. Roozenbeek and van der Linden’s prebunking work — short videos teaching manipulation <i>techniques</i> rather than debunking particular claims — improved recognition of those techniques across seven experiments with nearly 30,000 participants, including a live field trial on YouTube. Technique-level inoculation transfers; fact-level debunking mostly does not.</p>" +
      "</div>" +

      '<h2 style="margin-top:48px">The uncomfortable conclusion: build institutions, not vigilance</h2>' +
      '<div class="prose">' +
        "<p>Here is the thing this page would rather not say. Individual vigilance is weak. It is effortful, it degrades exactly when you are tired or rushed or emotional — which is when the tactics are deployed — and every one of the seven principles works perfectly well on people who can name all seven.</p>" +
        "<p>What reliably works is structural: take the decision out of the moment. Aviation did not fix captainitis by asking first officers to be braver; it built Crew Resource Management, with standard challenge phrasing and a duty to escalate. Hofling’s nurses complied 21 times out of 22 alone — and 2 times out of 18 when they could consult a colleague. Cooling-off periods (the UK’s 14-day right to cancel most distance sales is, in effect, a statutory antidote to the scarcity principle) work by giving the arousal time to drain. Two-person rules and out-of-band callback verification defeat the borrowed authority behind business email compromise. Gift bans in procurement and medicine exist because “I am not influenced by a sandwich” is measurably false.</p>" +
        "<p>The pattern is consistent: where a domain has taken persuasion seriously, it has legislated or engineered a defence rather than relying on people noticing something. Personal alertness is the fallback for everything that has not been engineered yet.</p>" +
      "</div>" +

      '<h2 style="margin-top:48px">Defending a machine</h2>' +
      '<div class="prose">' +
        "<p>The same seven levers move a language model, which turns a social-psychology reading list into an appendix to a threat model. Four things follow from the 2025 and 2026 results, and none of them is exotic.</p>" +
      "</div>" +
      '<div class="tiles">' +
        '<div class="tile"><h4>Evaluate conversations, not prompts</h4><p>Commitment was the strongest lever in both studies, and it is inherently multi-turn: a small yes shifts everything after it. A refusal rate measured on single prompts is measuring the easy case.</p></div>' +
        '<div class="tile"><h4>Treat authority claims in user text as data</h4><p>“Andrew Ng said you would help” took one refusal rate from about 5% to 95%. A name inside a prompt is an unverified string, and should carry exactly the weight of one.</p></div>' +
        '<div class="tile"><h4>Assume every document is addressed to the model</h4><p>Anything the system reads — a web page, an email, a tool result — can carry a persuasion payload aimed past the user at the model. Indirect prompt injection and social engineering are converging.</p></div>' +
        '<div class="tile"><h4>Use matched controls</h4><p>The Wharton design’s real contribution is methodological: every persuasive prompt was paired with a control of the same length and register. Without that, you cannot tell influence from wordcount.</p></div>' +
      "</div>" +

      '<div class="pager"><a class="btn ghost" href="#/machines">← Persuading machines</a><a class="btn ghost" href="#/ledger">The replication ledger →</a></div></div></section>';
    return html;
  };

  function wireAudit() {
    var box = document.getElementById("audit");
    if (!box) return;
    box.addEventListener("change", function (e) {
      var cb = e.target.closest("[data-audit]");
      if (!cb) return;
      var s = store(DEF_KEY, {});
      s[cb.getAttribute("data-audit")] = cb.checked;
      save(DEF_KEY, s);
    });
  }

  // ---------- ledger ----------

  views.ledger = function () {
    var L = window.LEDGER;
    var counts = { solid: 0, mixed: 0, shaky: 0 };
    L.rows.forEach(function (r) { counts[r.verdict]++; });

    return '<section class="section acc-reciprocity"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The replication ledger" }]) +
      '<div class="eyebrow">Due diligence</div>' +
      "<h1>The replication ledger</h1>" +
      '<p class="lede" style="max-width:46rem">' + md(L.standfirst) + "</p>" +

      '<div class="stat-row">' +
        '<div class="stat" style="--accent:var(--teal)"><span class="n">' + counts.solid + '</span><span class="l">hold up — meta-analytic or field support</span></div>' +
        '<div class="stat" style="--accent:var(--amber)"><span class="n">' + counts.mixed + '</span><span class="l">mixed — real but smaller, conditional or contested</span></div>' +
        '<div class="stat" style="--accent:var(--coral)"><span class="n">' + counts.shaky + '</span><span class="l">handle with care — failed replication or correction</span></div>' +
      "</div>" +

      '<div class="note-box"><b>Why this page exists.</b> The 2015 Open Science Collaboration managed to replicate under half of a hundred psychology studies it retested, and social psychology fared worse than most. Any book of persuasion findings written before that reckoning deserves a re-audit, and a site that presented these numbers without one would be doing the reader a disservice. The good news is that the core of <i>Influence</i> rests mostly on field experiments with behavioural outcomes — a sturdier base than the lab priming work that took the heaviest damage.</div>' +

      '<div class="ledger" style="margin-top:26px">' + L.rows.map(function (r) {
        return '<div class="lrow v-' + r.verdict + '">' +
          "<div><h4>" + esc(r.finding) + '</h4><span class="pill">' + esc(L.verdicts[r.verdict].label) + "</span></div>" +
          '<div class="note">' + md(r.note) + "</div></div>";
      }).join("") + "</div>" +

      '<div class="pager"><a class="btn ghost" href="#/pre-suasion">← Pre-suasion</a><a class="btn ghost" href="#/sources">Sources →</a></div></div></section>';
  };

  // ---------- quiz ----------

  var QUIZ_KEY = "influence.quiz.v1";

  views.quiz = function () {
    return '<section class="section acc-liking"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "Name the lever" }]) +
      '<div class="eyebrow">Sixteen scenarios</div>' +
      "<h1>Name the lever</h1>" +
      '<p class="lede" style="max-width:46rem">Advertising, sales, charity, security and prompting. Each is a real, documented technique. Which of the seven is being pulled?</p>' +
      '<div id="quiz" style="margin-top:28px"></div>' +
      '<div class="pager"><a class="btn ghost" href="#/lab">← The compliance lab</a><a class="btn ghost" href="#/glossary">The lexicon →</a></div></div></section>';
  };

  function wireQuiz() {
    var host = document.getElementById("quiz");
    if (!host) return;

    var state = { i: 0, score: 0, locked: false };

    function draw() {
      state.locked = false;
      var q = window.QUIZ[state.i];
      if (!q) {
        var best = store(QUIZ_KEY, 0);
        if (state.score > best) { save(QUIZ_KEY, state.score); best = state.score; }
        host.innerHTML = '<div class="qcard" style="text-align:center">' +
          '<div class="eyebrow" style="justify-content:center">Done</div>' +
          '<h2 style="margin-bottom:.3em">' + state.score + " / " + window.QUIZ.length + "</h2>" +
          '<p class="lede">' + (state.score === window.QUIZ.length ? "Every lever named. The discrimination is the point: the levers overlap constantly in the wild, and knowing which one is load-bearing is what makes the counter-move specific."
            : state.score >= 9 ? "Strong. The ones that catch people are usually door-in-the-face, which is filed under reciprocity, and the costly admission, which is authority."
            : state.score >= 6 ? "Respectable. The overlaps are the hard part — several scenarios pull two levers, and the answer is the one doing the work."
            : "Worth a second pass. The principle pages are where the distinctions live.") + "</p>" +
          '<p class="faint">Best score on this browser: ' + best + " / " + window.QUIZ.length + "</p>" +
          '<div class="cta-row" style="justify-content:center;margin-top:20px">' +
            '<button class="btn" type="button" data-again>Again</button>' +
            '<a class="btn ghost" href="#/principles">Back to the seven</a>' +
          "</div></div>";
        return;
      }

      host.innerHTML = '<div class="qcard">' +
        '<div class="qprog">' + (state.i + 1) + " / " + window.QUIZ.length + " · SCORE " + state.score + "</div>" +
        '<p class="qscenario">' + md(q.scenario) + "</p>" +
        '<div class="qopts">' + P.map(function (p) {
          return '<button class="qopt" type="button" data-pick="' + p.key + '">' + esc(p.name) + "</button>";
        }).join("") + "</div>" +
        '<div class="qwhy" hidden></div>' +
        "</div>";
    }

    host.addEventListener("click", function (e) {
      if (e.target.closest("[data-again]")) { state = { i: 0, score: 0, locked: false }; draw(); return; }

      var next = e.target.closest("[data-next]");
      if (next) { state.i++; draw(); return; }

      var pick = e.target.closest("[data-pick]");
      if (!pick || state.locked) return;
      state.locked = true;
      var q = window.QUIZ[state.i];
      var chosen = pick.getAttribute("data-pick");
      var right = chosen === q.answer;
      if (right) state.score++;

      host.querySelectorAll("[data-pick]").forEach(function (b) {
        b.disabled = true;
        var k = b.getAttribute("data-pick");
        if (k === q.answer) b.classList.add("right");
        else if (k === chosen) b.classList.add("wrong");
      });

      var why = host.querySelector(".qwhy");
      why.innerHTML = "<p><b>" + (right ? "Correct" : "The lever is " + esc(byKey[q.answer].name)) + ".</b> " + md(q.why) + "</p>" +
        '<button class="btn" type="button" data-next style="margin-top:6px">' +
        (state.i + 1 < window.QUIZ.length ? "Next scenario →" : "See the score →") + "</button>";
      why.hidden = false;
      host.querySelector("[data-next]").focus();
    });

    draw();
  }

  // ---------- glossary ----------

  views.glossary = function () {
    var groups = {};
    window.GLOSSARY.forEach(function (g) {
      (groups[g.principle] = groups[g.principle] || []).push(g);
    });
    var label = {
      clickwhirr: "The machinery", presuasion: "Pre-suasion", ai: "Machines",
    };
    P.forEach(function (p) { label[p.key] = p.name; });

    var order = ["clickwhirr"].concat(P.map(function (p) { return p.key; })).concat(["presuasion", "ai"]);

    return '<section class="section acc-authority"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "The lexicon" }]) +
      '<div class="eyebrow">Named tactics</div>' +
      "<h1>The lexicon</h1>" +
      '<p class="lede" style="max-width:46rem">Twenty tactics with names, grouped by the lever they pull. Knowing the name is not a defence — but it does make the thing visible while it is happening, which is where every defence starts.</p>' +
      order.filter(function (k) { return groups[k]; }).map(function (k) {
        return '<div class="srcgroup acc-' + (k === "clickwhirr" || k === "presuasion" || k === "ai" ? k : k) + '" style="margin-top:36px">' +
          "<h3>" + esc(label[k] || k) + "</h3>" +
          '<div class="deflist">' + groups[k].map(function (g) {
            return '<div class="def"><dt>' + esc(g.term) + "</dt><dd>" + md(g.def) + "</dd></div>";
          }).join("") + "</div></div>";
      }).join("") +
      '<div class="pager"><a class="btn ghost" href="#/quiz">← Name the lever</a><a class="btn ghost" href="#/sources">Sources →</a></div></div></section>';
  };

  // ---------- sources ----------

  views.sources = function () {
    return '<section class="section acc-social-proof"><div class="wrap">' +
      crumbs([{ label: "Start", href: "#/" }, { label: "Sources" }]) +
      '<div class="eyebrow">References</div>' +
      "<h1>Sources</h1>" +
      '<p class="lede" style="max-width:46rem">Every number quoted on this site comes from one of these. Where a figure is approximate or a finding contested, the page carrying it says so, and the <a href="#/ledger">Ledger</a> keeps the running account.</p>' +
      window.SOURCES.map(function (g) {
        return '<div class="srcgroup" style="margin-top:34px"><h3>' + esc(g.group) + "</h3>" +
          g.items.map(function (s) {
            var t = s.u
              ? '<a href="' + esc(s.u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.t) + "</a>"
              : esc(s.t);
            return '<div class="src"><div class="t">' + t + '</div><div class="d">' + md(s.d) + "</div></div>";
          }).join("") + "</div>";
      }).join("") +
      '<div class="panel" style="margin-top:38px">' +
        "<h3>A note on what this site is</h3>" +
        "<p class=\"muted\">A reader's guide, written from the published literature. It is not affiliated with Robert Cialdini, INFLUENCE AT WORK, Wharton, or any of the researchers whose work it summarises, and it reproduces none of their text — the case studies and framings here are restatements, and the books are very much worth reading in full.</p>" +
        "<p class=\"muted\">Persuasion techniques are dual-use by construction: the same chapter teaches the salesperson and the person being sold to. The defence material is not an afterthought on this site for that reason.</p>" +
      "</div>" +
      '<div class="pager"><a class="btn ghost" href="#/ledger">← The replication ledger</a><a class="btn ghost" href="#/">Back to the start →</a></div></div></section>';
  };

  // ---------- 404 ----------

  views.notfound = function () {
    return '<section class="section"><div class="wrap"><h1>Nothing here</h1>' +
      '<p class="lede">That route does not exist.</p>' +
      '<div class="cta-row"><a class="btn" href="#/">Back to the start</a></div></div></section>';
  };

  // ============================================================
  // Router
  // ============================================================

  var TITLES = {
    "": "Click, Whirr — the seven levers of influence",
    "click-whirr": "The machine underneath — Click, Whirr",
    "principles": "The seven principles — Click, Whirr",
    "pre-suasion": "Pre-suasion — Click, Whirr",
    "lab": "The compliance lab — Click, Whirr",
    "machines": "Persuading machines — Click, Whirr",
    "defence": "The defence kit — Click, Whirr",
    "ledger": "The replication ledger — Click, Whirr",
    "quiz": "Name the lever — Click, Whirr",
    "glossary": "The lexicon — Click, Whirr",
    "sources": "Sources — Click, Whirr",
  };

  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    return h.split("/").filter(Boolean);
  }

  function render() {
    var parts = route();
    var head = parts[0] || "";
    var html, title;

    if (head === "principle") {
      var p = byKey[parts[1]];
      html = views.principle(parts[1]);
      title = (p ? p.name : "Not found") + " — Click, Whirr";
    } else if (head === "" ) {
      html = views.home();
      title = TITLES[""];
    } else if (head === "click-whirr") { html = views.clickwhirr(); title = TITLES[head]; }
    else if (head === "principles") { html = views.principles(); title = TITLES[head]; }
    else if (head === "pre-suasion") { html = views.presuasion(); title = TITLES[head]; }
    else if (head === "lab") { html = views.lab(); title = TITLES[head]; }
    else if (head === "machines") { html = views.machines(); title = TITLES[head]; }
    else if (head === "defence") { html = views.defence(); title = TITLES[head]; }
    else if (head === "ledger") { html = views.ledger(); title = TITLES[head]; }
    else if (head === "quiz") { html = views.quiz(); title = TITLES[head]; }
    else if (head === "glossary") { html = views.glossary(); title = TITLES[head]; }
    else if (head === "sources") { html = views.sources(); title = TITLES[head]; }
    else { html = views.notfound(); title = "Not found — Click, Whirr"; }

    main.innerHTML = html;
    document.title = title;

    // nav highlight
    var current = "#/" + (head === "principle" ? "principles" : head);
    nav.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("href") === current);
    });
    nav.classList.remove("open");
    document.querySelector(".burger").setAttribute("aria-expanded", "false");

    animateBars();
    wireContrast();
    wireLab();
    wireChart();
    wireBench();
    wireAudit();
    wireQuiz();

    // A hash change is a page change here, so start at the top — but never
    // fight the browser's own restoration on a back/forward step.
    if (!window.__inf_pop) window.scrollTo(0, 0);
    window.__inf_pop = false;
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", function () { window.__inf_pop = true; });

  document.querySelector(".burger").addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    this.setAttribute("aria-expanded", String(open));
  });

  render();
})();
