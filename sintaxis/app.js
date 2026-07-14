/* sintaxis app — router + views. Vanilla JS, no build step. */
(function () {
"use strict";

var $app = document.getElementById("app");
var CUR = window.CURRICULUM, CONJ = window.CONJ, CHECK = window.CHECK,
    ERRORS = window.ERRORS, STATE = window.STATE, DRILL = window.DRILL;

/* lookup maps */
var MODS = {}, LESSONS = {}, LESSON_ORDER = [];
CUR.forEach(function (m) {
  MODS[m.id] = m;
  m.lessons.forEach(function (l) { l.mod = m.id; LESSONS[l.id] = l; LESSON_ORDER.push(l.id); });
});
var TOTAL_LESSONS = LESSON_ORDER.length;

/* ───────── helpers ───────── */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function h(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild || d; }
function inline(s) {
  return s
    .replace(/\[\[(.+?)\]\]/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~([^~]+)~/g, '<span class="hl">$1</span>')
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}
/* markdown-lite → html */
function md(src) {
  var lines = src.split("\n"), out = [], i, mode = null;
  function close() {
    if (mode === "ul") out.push("</ul>");
    if (mode === "table") out.push("</table></div>");
    if (mode === "ex") out.push("</table>");
    mode = null;
  }
  for (i = 0; i < lines.length; i++) {
    var L = lines[i];
    if (/^\s*$/.test(L)) { close(); continue; }
    var E = esc(L);
    if (/^## /.test(L)) { close(); out.push("<h2>" + inline(E.slice(3)) + "</h2>"); }
    else if (/^### /.test(L)) { close(); out.push("<h3>" + inline(E.slice(4)) + "</h3>"); }
    else if (/^@ /.test(L)) {
      if (mode !== "ex") { close(); out.push('<table class="ex-table">'); mode = "ex"; }
      var parts = E.slice(2).split(" | ");
      out.push("<tr><td>" + inline(parts[0]) + "</td><td>" + inline(parts.slice(1).join(" | ") || "") + "</td></tr>");
    }
    else if (/^!! /.test(L)) { close(); out.push('<div class="callout warn"><div>' + inline(E.slice(3)) + "</div></div>"); }
    else if (/^! /.test(L)) { close(); out.push('<div class="callout"><div>' + inline(E.slice(2)) + "</div></div>"); }
    else if (/^- /.test(L)) {
      if (mode !== "ul") { close(); out.push("<ul>"); mode = "ul"; }
      out.push("<li>" + inline(E.slice(2)) + "</li>");
    }
    else if (/^\| /.test(L)) {
      if (mode !== "table") { close(); out.push('<div class="tablewrap"><table>'); mode = "table"; }
      var cells = E.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "").split(" | ");
      out.push("<tr>" + cells.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>");
    }
    else { close(); out.push("<p>" + inline(E) + "</p>"); }
  }
  close();
  return out.join("\n");
}
function todayKey(offset) {
  var d = new Date(); d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
/* accent digraphs: a` → á, n~ → ñ, u" → ü */
var DIG = { "a`": "á", "e`": "é", "i`": "í", "o`": "ó", "u`": "ú", "A`": "Á", "E`": "É", "n~": "ñ", "N~": "Ñ", 'u"': "ü" };
function wireDigraphs(input) {
  input.addEventListener("input", function () {
    var v = input.value, tail = v.slice(-2);
    if (DIG[tail]) {
      var pos = input.selectionStart;
      input.value = v.slice(0, -2) + DIG[tail];
      input.setSelectionRange(pos - 1, pos - 1);
    }
  });
}
function modProgress(m) {
  var done = m.lessons.filter(function (l) { return STATE.raw.done[l.id]; }).length;
  return { done: done, total: m.lessons.length };
}
function nextLessonId() {
  for (var i = 0; i < LESSON_ORDER.length; i++)
    if (!STATE.raw.done[LESSON_ORDER[i]]) return LESSON_ORDER[i];
  return null;
}
function lessonsDone() {
  return LESSON_ORDER.filter(function (id) { return STATE.raw.done[id]; }).length;
}
function updateChrome() {
  var due = STATE.dueCount();
  var badge = document.getElementById("due-badge");
  badge.hidden = due === 0;
  badge.textContent = due;
  document.getElementById("sb-mid").textContent =
    lessonsDone() + "/" + TOTAL_LESSONS + " lessons · " + Object.keys(STATE.raw.srs).length + " items in memory" +
    (due ? " · " + due + " due" : " · queue clean");
  var route = (location.hash.slice(2) || "").split("/")[0] || "dash";
  var map = { "": "dash", mod: "graph", lesson: "graph", graph: "graph", review: "review", conj: "conj", man: "man", errors: "errors" };
  var active = map[route] || route;
  document.querySelectorAll("#nav a").forEach(function (a) {
    a.classList.toggle("active", a.dataset.nav === active || (active === "dash" && a.dataset.nav === "dash"));
  });
}

/* ───────── diagnostics rendering ───────── */
function caretLine(text, at, len, cls) {
  var pad = new Array(at + 1).join(" ");
  return pad + '<span class="caret ' + (cls || "") + '">' + new Array(Math.max(len, 1) + 1).join("^") + "</span>";
}
function renderDiag(res, ex, label) {
  var d = document.createElement("div");
  if (res.status === "pass") {
    d.className = "diag pass";
    d.innerHTML = '<span class="dhead">ok</span> — ' + esc(label) + " passed" +
      (ex.note ? '\n<span class="note">  = note: ' + inline(esc(ex.note)) + "</span>" : "");
    return d;
  }
  var isWarn = res.status === "warn";
  d.className = "diag " + (isWarn ? "warn" : "fail");
  var code = res.code || "E0001";
  var head = (isWarn ? "warning" : "error") + '[<span class="dcode" data-code="' + code + '">' + code + "</span>]: " +
    esc(res.msg || (ERRORS[code] && ERRORS[code].t) || "check failed");
  var got = res.got || "";
  var lines = ['<span class="dhead">' + head + "</span>", '<span class="lineno">  --> ' + esc(label) + "</span>", '<span class="lineno">   |</span>'];
  if (got) {
    var at = 0, len = got.length;
    var dp = res.expected ? CHECK.diffPoint(got, res.expected) : null;
    if (dp) { at = dp.col; len = Math.max((dp.got || "").length, 1); }
    lines.push('<span class="lineno"> 1 |</span>  ' + esc(got));
    lines.push('<span class="lineno">   |</span>  ' + caretLine(got, at, len));
  }
  if (res.note) lines.push('<span class="note">  = note: ' + inline(esc(res.note)) + "</span>");
  else if (ERRORS[code] && !isWarn) lines.push('<span class="note">  = note: ' + inline(esc(ERRORS[code].x.split(". ").slice(0, 2).join(". ") + ".")) + "</span>");
  if (ex.note && !res.note) lines.push('<span class="note">  = note: ' + inline(esc(ex.note)) + "</span>");
  if (res.expected) lines.push('<span class="fixline">  = expected: ' + esc(res.expected) + "</span>");
  lines.push('<span class="note">  = help: click the error code, or see #/errors/' + code + "</span>");
  d.innerHTML = lines.join("\n");
  d.querySelectorAll(".dcode").forEach(function (c) {
    c.addEventListener("click", function () { location.hash = "#/errors/" + c.dataset.code; });
  });
  return d;
}

/* ───────── exercise runner ───────── */
function buildItems(lesson) {
  var items = [];
  lesson.ex.forEach(function (ex, i) {
    if (ex.t === "drill") DRILL.expand(ex).forEach(function (d) { items.push(d); });
    else { ex = Object.assign({}, ex); ex.srsKey = lesson.id + "/" + i; items.push(ex); }
  });
  return items;
}
function kindLabel(ex) {
  return { tr: "translate → español", cz: ex.drill ? "conjugation drill" : "fill the blank", mc: "concept check", fix: "code review — find & fix the bug" }[ex.t] || ex.t;
}
/* runner: mode "lesson" (schedule new items) or "review" (SM-2 update) */
function runSuite(container, items, opts) {
  var idx = 0, results = [];
  var head = document.createElement("div");
  var qbox = document.createElement("div");
  var ansArea = document.createElement("div");
  var diagArea = document.createElement("div");
  container.appendChild(head); container.appendChild(qbox);
  container.appendChild(ansArea); container.appendChild(diagArea);

  function finish() {
    var pass = results.filter(function (r) { return r.q === 5; }).length;
    var warn = results.filter(function (r) { return r.q === 4; }).length;
    var fail = results.length - pass - warn;
    var score = Math.round(100 * (pass + warn) / Math.max(results.length, 1));
    head.innerHTML = ""; qbox.innerHTML = ""; qbox.className = ""; ansArea.innerHTML = ""; diagArea.innerHTML = "";
    var cls = fail === 0 ? "pass" : "fail";
    var sum = h('<div>' +
      '<div class="build-banner ' + cls + '"><span>' + (fail === 0 ? "SUITE PASSED" : "SUITE FINISHED — " + fail + " failing") + "</span>" +
      '<span class="sub">' + pass + " passed · " + warn + " warnings · " + fail + " failed · score " + score + "%</span></div>" +
      '<table class="run-summary"><tr><td>status</td><td>test</td><td>expected</td></tr>' +
      results.map(function (r, i) {
        var s = r.q === 5 ? '<span class="g">ok</span>' : r.q === 4 ? '<span class="y">warn</span>' : '<span class="r">FAIL</span>';
        return "<tr><td>" + s + "</td><td>" + esc(r.label) + "</td><td>" + esc(r.expected || "") + "</td></tr>";
      }).join("") + "</table>" +
      '<div class="btn-row"></div></div>');
    container.appendChild(sum);
    var row = sum.querySelector(".btn-row");
    (opts.buttons || []).forEach(function (b) {
      var btn = document.createElement("a");
      btn.className = "btn" + (b.primary ? " primary" : "");
      btn.textContent = b.label; btn.href = b.href || "#";
      if (b.onclick) btn.addEventListener("click", function (e) { e.preventDefault(); b.onclick(); });
      row.appendChild(btn);
    });
    if (opts.onDone) opts.onDone({ score: score, pass: pass, warn: warn, fail: fail, results: results });
  }

  function record(ex, quality, expected) {
    results.push({ q: quality, label: ex.qshort || ex.q.slice(0, 60), expected: expected });
    STATE.raw.meta.checks++;
    if (quality < 3) STATE.bumpLog("e", 1);
    if (opts.mode === "review" && ex.srsKey) { STATE.review(ex.srsKey, quality, ex.drill ? null : ex); STATE.bumpLog("r", 1); }
    if (opts.mode === "lesson" && ex.srsKey && ex.t !== "mc") STATE.schedule(ex.srsKey, ex.drill ? null : ex);
    STATE.save();
  }

  function next() { idx++; if (idx >= items.length) finish(); else show(); }

  function afterGrade(ex, res, label) {
    diagArea.innerHTML = "";
    diagArea.appendChild(renderDiag(res, ex, label));
    var q = res.status === "pass" ? 5 : res.status === "warn" ? 4 : 1;
    record(ex, q, res.status === "pass" ? "" : res.expected);
    var cont = h('<div class="btn-row"><button class="btn primary">continue ⏎</button></div>');
    diagArea.appendChild(cont);
    var btn = cont.querySelector("button");
    var advanced = false;
    function go() { if (advanced) return; advanced = true; document.onkeydown = null; next(); }
    btn.addEventListener("click", go);
    /* arm the Enter-to-continue handler on a delay so the same keystroke
       that submitted the answer can't blow straight past the diagnostic */
    setTimeout(function () {
      document.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } };
    }, 120);
  }

  function show() {
    document.onkeydown = null;
    var ex = items[idx];
    var label = "test " + (idx + 1) + "/" + items.length;
    head.className = "run-head";
    head.innerHTML = "<span>" + esc(opts.title || "") + "</span><span>" + label + "</span>";
    diagArea.innerHTML = "";
    qbox.className = "run-q";
    qbox.innerHTML = '<div class="qkind">' + esc(kindLabel(ex)) + "</div>" +
      '<div class="qtext">' + esc(ex.q) + "</div>" +
      (ex.qmeta ? '<div class="qhint">' + esc(ex.qmeta) + "</div>" : "") +
      (ex.hint ? '<div class="qhint">hint: ' + esc(ex.hint) + "</div>" : "");
    ansArea.innerHTML = "";

    if (ex.t === "mc") {
      var wrap = h('<div class="mc-opts"></div>');
      ex.opts = ex.o;
      ex.o.forEach(function (opt, i) {
        var b = document.createElement("button");
        b.innerHTML = '<span class="key">' + (i + 1) + "</span>" + esc(opt);
        b.addEventListener("click", function () { pick(i, b); });
        wrap.appendChild(b);
      });
      ansArea.appendChild(wrap);
      var picked = false;
      function pick(i, b) {
        if (picked) return; picked = true;
        document.onkeydown = null;
        var ok = i === ex.i;
        b.classList.add(ok ? "sel-ok" : "sel-bad");
        if (!ok) wrap.children[ex.i].classList.add("sel-ok");
        var res = ok ? { status: "pass" } : { status: "fail", code: "E0001", msg: "wrong option selected", note: ex.why, expected: ex.o[ex.i] };
        if (ok && ex.why) ex.note = ex.why;
        afterGrade(ex, res, label);
      }
      document.onkeydown = function (e) {
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= ex.o.length) { pick(n - 1, wrap.children[n - 1]); }
      };
      return;
    }

    if (ex.t === "fix") {
      var words = ex.q.split(/\s+/);
      var fw = h('<div class="fixwords"></div>');
      var sel = null, selText = "";
      words.forEach(function (w) {
        var span = document.createElement("span");
        span.className = "w"; span.textContent = w;
        span.addEventListener("click", function () {
          fw.querySelectorAll(".w").forEach(function (x) { x.classList.remove("sel"); });
          span.classList.add("sel"); sel = span; selText = w;
          inputRow.hidden = false; input.focus();
        });
        fw.appendChild(span); fw.appendChild(document.createTextNode(" "));
      });
      ansArea.appendChild(h('<div class="qhint" style="margin-bottom:.4rem">click the buggy token, then type the fix (type <code>-</code> to delete it)</div>'));
      ansArea.appendChild(fw);
      var inputRow = h('<div class="answer-line" hidden><span class="ps1">fix&gt;</span><input id="answer" autocomplete="off" spellcheck="false"><button class="btn">apply ⏎</button></div>');
      ansArea.appendChild(inputRow);
      var input = inputRow.querySelector("input");
      wireDigraphs(input);
      addCharbar(ansArea, input);
      function applyFix() {
        if (!sel) return;
        var clickNorm = CHECK.deacc(CHECK.norm(selText));
        var badWords = String(ex.bad).split(/\s+/).map(function (w) { return CHECK.deacc(CHECK.norm(w)); });
        var wordOk = badWords.indexOf(clickNorm) >= 0;
        if (!wordOk) {
          afterGrade(ex, { status: "fail", code: ex.code || "E0001", msg: "that token is fine — the bug is elsewhere", note: ex.why, expected: ex.bad + " → " + ex.a, got: selText }, label);
          return;
        }
        var val = input.value;
        var isDel = ex.a === "–" || ex.a === "-";
        var ok, res;
        if (isDel) ok = /^[-–]?$/.test(val.trim());
        if (isDel) res = ok ? { status: "pass" } : { status: "fail", code: ex.code || "E0001", msg: "the fix is deletion", note: ex.why, expected: "(delete " + ex.bad + ")", got: val };
        else res = CHECK.grade(val, { a: ex.a, alt: ex.alt });
        if (!isDel && res.status === "fail") { res.code = res.code === "E0001" ? (ex.code || "E0001") : res.code; res.note = res.note || ex.why; }
        if (res.status === "pass" && ex.why) ex.note = ex.why;
        afterGrade(ex, res, label);
      }
      inputRow.querySelector("button").addEventListener("click", applyFix);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") applyFix(); });
      return;
    }

    /* tr / cz / drill: typed answer */
    var rowHTML = '<div class="answer-line"><span class="ps1">es&gt;</span><input id="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' +
      (ex.t === "tr" ? "type the Spanish…" : "type the missing form…") + '"><button class="btn">check ⏎</button></div>';
    var row2 = h(rowHTML);
    ansArea.appendChild(row2);
    var input2 = row2.querySelector("input");
    wireDigraphs(input2);
    addCharbar(ansArea, input2);
    var submitted = false;
    function submit() {
      if (submitted) return; submitted = true;
      var res = CHECK.grade(input2.value, ex);
      input2.classList.add("locked"); input2.disabled = true;
      afterGrade(ex, res, label);
    }
    row2.querySelector("button").addEventListener("click", submit);
    input2.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    input2.focus();
  }
  show();
}
function addCharbar(parent, input) {
  var chars = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];
  var bar = h('<div class="charbar">' + chars.map(function (c) { return "<button tabindex='-1'>" + c + "</button>"; }).join("") +
    '<span class="muted" style="align-self:center;font-size:11px">&nbsp;or type a` → á · n~ → ñ</span></div>');
  bar.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      var p = input.selectionStart;
      input.value = input.value.slice(0, p) + b.textContent + input.value.slice(input.selectionEnd);
      input.focus(); input.setSelectionRange(p + 1, p + 1);
    });
  });
  parent.appendChild(bar);
}

/* ───────── views ───────── */
function viewDash() {
  var due = STATE.dueCount();
  var next = nextLessonId();
  var nl = next ? LESSONS[next] : null;
  var doneN = lessonsDone();
  var streak = STATE.streak();
  var banner = due > 0
    ? '<div class="build-banner fail"><span>● BUILD FAILING</span><span class="sub">' + due + " scheduled test" + (due === 1 ? "" : "s") + ' need attention — <a href="#/review">run the nightly build</a></span></div>'
    : '<div class="build-banner pass"><span>● BUILD PASSING</span><span class="sub">review queue clean — nothing due</span></div>';

  var stats =
    '<div class="statgrid">' +
    '<div class="stat"><div class="num">' + streak + '<span class="dim" style="font-size:13px"> day' + (streak === 1 ? "" : "s") + '</span></div><div class="lbl">uptime</div></div>' +
    '<div class="stat"><div class="num">' + doneN + '<span class="dim" style="font-size:13px">/' + TOTAL_LESSONS + '</span></div><div class="lbl">lessons compiled</div></div>' +
    '<div class="stat"><div class="num">' + Object.keys(STATE.raw.srs).length + '</div><div class="lbl">tests in memory</div></div>' +
    '<div class="stat"><div class="num">' + (STATE.raw.meta.checks || 0) + '</div><div class="lbl">expressions checked</div></div>' +
    "</div>";

  var nextHtml = nl
    ? '<div class="panel"><h2 style="margin-top:0">next target</h2><p><a class="btn primary" href="#/lesson/' + nl.id + '">compile ' + esc(MODS[nl.mod].name) + " :: " + esc(nl.title) + "</a></p></div>"
    : '<div class="panel"><h2 style="margin-top:0">curriculum complete</h2><p>All 60 lessons compiled. Keep the review queue green and go read something in Spanish.</p></div>';

  var mods = '<div class="panel"><h2 style="margin-top:0">packages</h2>' + CUR.map(function (m) {
    var p = modProgress(m);
    return '<div style="margin:.5rem 0"><a href="#/mod/' + m.id + '">' + esc(m.name) + '</a> <span class="muted">— ' + esc(m.title) + " · " + p.done + "/" + p.total + '</span><div class="progress"><i style="width:' + (100 * p.done / p.total) + '%"></i></div></div>';
  }).join("") + '<p><a href="#/graph">view dependency graph →</a></p></div>';

  $app.innerHTML = "";
  var boot = h('<div class="boot"></div>');
  $app.appendChild(boot);
  bootAnim(boot);
  $app.appendChild(h(banner));
  $app.appendChild(h(stats));
  $app.appendChild(h(nextHtml));
  $app.appendChild(renderHeatmap());
  $app.appendChild(h(mods));
}
function bootAnim(el) {
  var lines = [
    "$ sintaxis --version && sintaxis status",
    "sintaxis 1.0.0 (es-ES toolchain, curriculum 12 packages / " + TOTAL_LESSONS + " units)",
    "<span class='ok'>✓</span> conjugation engine loaded — " + CONJ.list().length + " verbs registered",
    "<span class='ok'>✓</span> grader online — " + Object.keys(ERRORS).length + " diagnostics in catalog",
    "<span class='ok'>✓</span> spaced-repetition scheduler attached (SM-2)"
  ];
  if (sessionStorage.getItem("sintaxis.booted")) { el.innerHTML = lines.join("\n"); return; }
  sessionStorage.setItem("sintaxis.booted", "1");
  var i = 0;
  el.classList.add("type-caret");
  (function step() {
    el.innerHTML = lines.slice(0, i + 1).join("\n");
    i++;
    if (i < lines.length) setTimeout(step, 160);
    else el.classList.remove("type-caret");
  })();
}
function renderHeatmap() {
  var panel = h('<div class="panel"><h2 style="margin-top:0">activity <span class="dim">— lessons + reviews per day, last 26 weeks</span></h2></div>');
  var wrap = document.createElement("div");
  wrap.className = "heat";
  var today = new Date();
  var start = new Date(today); start.setDate(start.getDate() - (26 * 7 - 1) - today.getDay());
  var total = 0, activeDays = 0;
  for (var w = 0; w < 27; w++) {
    var col = document.createElement("div");
    col.className = "heat-col";
    for (var d = 0; d < 7; d++) {
      var cd = new Date(start); cd.setDate(start.getDate() + w * 7 + d);
      if (cd > today) break;
      var k = cd.getFullYear() + "-" + String(cd.getMonth() + 1).padStart(2, "0") + "-" + String(cd.getDate()).padStart(2, "0");
      var row = STATE.raw.log[k];
      var n = row ? (row.l || 0) + (row.r || 0) : 0;
      total += n; if (n) activeDays++;
      var lvl = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 11 ? 3 : 4;
      var cell = document.createElement("div");
      cell.className = "heat-cell";
      cell.dataset.l = lvl;
      cell.title = k + " — " + n + " item" + (n === 1 ? "" : "s");
      col.appendChild(cell);
    }
    wrap.appendChild(col);
  }
  panel.appendChild(wrap);
  panel.appendChild(h('<div class="heat-legend">less <div class="heat-cell" data-l="0"></div><div class="heat-cell" data-l="1"></div><div class="heat-cell" data-l="2"></div><div class="heat-cell" data-l="3"></div><div class="heat-cell" data-l="4"></div> more' +
    '<span style="margin-left:1rem">' + total + " items across " + activeDays + " active days</span></div>"));
  return panel;
}

/* dependency graph */
var GPOS = { core: [0, 1.5], pres: [1, 1.5], obj: [2, 0.5], pret: [2, 2.5], gust: [3, 0], impv: [3, 1], impf: [3, 2.3], fut: [3, 3.4], subj: [4, 0.8], plumb: [4, 2.6], subj2: [5, 0.8], prod: [6, 1.8] };
function viewGraph() {
  var W = 168, H = 62, GX = 190, GY = 96, PAD = 20;
  var maxX = 0, maxY = 0;
  Object.keys(GPOS).forEach(function (k) { maxX = Math.max(maxX, GPOS[k][0]); maxY = Math.max(maxY, GPOS[k][1]); });
  var vw = (maxX + 1) * GX + PAD * 2, vh = (maxY + 1) * GY + H / 2 + PAD;
  function cx(id) { return PAD + GPOS[id][0] * GX; }
  function cy(id) { return PAD + GPOS[id][1] * GY; }
  var edges = "", nodes = "";
  CUR.forEach(function (m) {
    m.deps.forEach(function (d) {
      var x1 = cx(d) + W, y1 = cy(d) + H / 2, x2 = cx(m.id), y2 = cy(m.id) + H / 2;
      var mx = (x1 + x2) / 2;
      var doneCls = modProgress(MODS[d]).done === MODS[d].lessons.length ? " done" : "";
      edges += '<path class="gedge' + doneCls + '" d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + "," + mx + " " + y2 + "," + x2 + " " + y2 + '"/>';
    });
  });
  CUR.forEach(function (m) {
    var p = modProgress(m);
    var cls = p.done === p.total ? "done" : (p.done > 0 ? "" : m.deps.every(function (d) { return modProgress(MODS[d]).done === MODS[d].lessons.length; }) || m.deps.length === 0 ? "" : "locked");
    nodes += '<g class="gnode ' + cls + '" data-mod="' + m.id + '" transform="translate(' + cx(m.id) + "," + cy(m.id) + ')">' +
      '<rect width="' + W + '" height="' + H + '" rx="6"/>' +
      '<text x="10" y="22">' + esc(m.name) + "</text>" +
      '<text x="10" y="42" class="gsub">' + esc(m.title) + " · " + p.done + "/" + p.total + "</text></g>";
  });
  $app.innerHTML = '<h1>package dependency graph <span class="dim">— click a node</span></h1>' +
    '<div class="panel" style="overflow-x:auto"><svg id="graph-svg" viewBox="0 0 ' + vw + " " + vh + '" width="' + vw + '">' + edges + nodes + "</svg></div>" +
    '<p class="muted">A faded node has unmet dependencies — you can still open it, but its lessons assume the packages upstream. Green = fully compiled.</p>';
  $app.querySelectorAll(".gnode").forEach(function (g) {
    g.addEventListener("click", function () { location.hash = "#/mod/" + g.dataset.mod; });
  });
}

function viewModule(id) {
  var m = MODS[id];
  if (!m) { location.hash = "#/graph"; return; }
  var p = modProgress(m);
  var rows = m.lessons.map(function (l, i) {
    var d = STATE.raw.done[l.id];
    var st = d ? '<span class="g">✓</span>' : '<span class="muted">○</span>';
    return '<div class="lesson-row"><span class="lstat">' + st + '</span><a href="#/lesson/' + l.id + '">' + (i + 1) + ". " + esc(l.title) + "</a>" +
      (d ? '<span class="score">' + d.score + "%</span>" : "") + "</div>";
  }).join("");
  $app.innerHTML = '<div class="crumbs"><a href="#/graph">deps</a> / ' + esc(m.name) + "</div>" +
    '<div class="modhead"><h1>' + esc(m.name) + ' <span class="dim">— ' + esc(m.title) + "</span></h1></div>" +
    '<p class="dim">' + esc(m.tagline) + "</p>" +
    (m.deps.length ? '<p class="muted">depends on: ' + m.deps.map(function (d) { return '<a href="#/mod/' + d + '">' + esc(MODS[d].name) + "</a>"; }).join(", ") + "</p>" : "") +
    '<div class="progress"><i style="width:' + (100 * p.done / p.total) + '%"></i></div>' + rows;
}

function viewLesson(id, run) {
  var l = LESSONS[id];
  if (!l) { location.hash = "#/graph"; return; }
  var m = MODS[l.mod];
  $app.innerHTML = '<div class="crumbs"><a href="#/graph">deps</a> / <a href="#/mod/' + m.id + '">' + esc(m.name) + "</a> / " + esc(l.id) + "</div>" +
    "<h1>" + esc(l.title) + "</h1>";
  if (!run) {
    var doc = h('<div class="doc"></div>');
    doc.innerHTML = md(l.doc);
    $app.appendChild(doc);
    var n = buildItems(l).length;
    var bar = h('<div class="btn-row"><a class="btn primary" href="#/lesson/' + id + '/run">run test suite — ' + n + " tests ⏎</a>" +
      (STATE.raw.done[id] ? '<span class="pill">compiled · best ' + STATE.raw.done[id].score + "%</span>" : "") + "</div>");
    $app.appendChild(bar);
    document.onkeydown = function (e) { if (e.key === "Enter") { document.onkeydown = null; location.hash = "#/lesson/" + id + "/run"; } };
  } else {
    var runner = h('<div class="runner"></div>');
    $app.appendChild(runner);
    var items = buildItems(l);
    var nid = null;
    runSuite(runner, items, {
      mode: "lesson",
      title: m.name + " :: " + l.id,
      onDone: function (r) {
        STATE.markLesson(id, r.score);
        updateChrome();
      },
      buttons: (function () {
        var idx = LESSON_ORDER.indexOf(id);
        nid = LESSON_ORDER[idx + 1];
        var btns = [{ label: "re-run suite", href: "#/lesson/" + id + "/rerun" }];
        if (nid) btns.push({ label: "next: " + LESSONS[nid].title, href: "#/lesson/" + nid, primary: true });
        else btns.push({ label: "dashboard", href: "#/", primary: true });
        btns.push({ label: "back to docs", href: "#/lesson/" + id });
        return btns;
      })()
    });
  }
}

function viewReview() {
  var keys = STATE.dueItems();
  if (!keys.length) {
    $app.innerHTML = '<h1>nightly build</h1><div class="build-banner pass"><span>● BUILD PASSING</span><span class="sub">no scheduled tests due — come back tomorrow, or <a href="#/graph">compile a new lesson</a></span></div>' +
      '<p class="muted">Every non-trivial exercise you complete is scheduled for spaced review (SM-2). Items you miss come back sooner; items you nail drift out to weeks. Keeping this queue green *is* the practice.</p>';
    return;
  }
  var items = [];
  keys.slice(0, 30).forEach(function (k) {
    if (k.slice(0, 2) === "d/") {
      var parts = k.split("/");
      var it = DRILL.item(parts[1], parts[2], Math.floor(Math.random() * 6));
      it.srsKey = k;
      items.push(it);
    } else {
      var rec = STATE.raw.srs[k];
      if (rec && rec.ex) { var ex = Object.assign({}, rec.ex); ex.srsKey = k; items.push(ex); }
      else { STATE.review(k, 5); } // orphan: retire it
    }
  });
  $app.innerHTML = "<h1>nightly build <span class='dim'>— " + items.length + " scheduled tests</span></h1>";
  var runner = h('<div class="runner"></div>');
  $app.appendChild(runner);
  runSuite(runner, items, {
    mode: "review",
    title: "review queue",
    onDone: function () { updateChrome(); },
    buttons: [{ label: "dashboard", href: "#/", primary: true }, { label: "check queue again", href: "#/review/again" }]
  });
}

/* conjugator REPL */
var SHOW_TENSES = ["pres", "pret", "impf", "fut", "cond", "subj", "subjImpf", "perf"];
var REG_ENDS = {
  pres: { ar: ["o","as","a","amos","áis","an"], er: ["o","es","e","emos","éis","en"], ir: ["o","es","e","imos","ís","en"] },
  pret: { ar: ["é","aste","ó","amos","asteis","aron"], er: ["í","iste","ió","imos","isteis","ieron"], ir: ["í","iste","ió","imos","isteis","ieron"] },
  impf: { ar: ["aba","abas","aba","ábamos","abais","aban"], er: ["ía","ías","ía","íamos","íais","ían"], ir: ["ía","ías","ía","íamos","íais","ían"] },
  fut: null, cond: null,
  subj: { ar: ["e","es","e","emos","éis","en"], er: ["a","as","a","amos","áis","an"], ir: ["a","as","a","amos","áis","an"] }
};
function regularForm(verb, tense, i) {
  var inf = CONJ.stripReflex(verb);
  var cls = inf.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC").slice(-2);
  var stem = inf.slice(0, -2);
  if (tense === "fut") return inf + ["é","ás","á","emos","éis","án"][i];
  if (tense === "cond") return inf + ["ía","ías","ía","íamos","íais","ían"][i];
  if (tense === "subjImpf") { var s = (cls === "ar" ? stem + "a" : stem + "ie"); return [s+"ra",s+"ras",s+"ra",CONJ.accentLast(s)+"ramos",s+"rais",s+"ran"][i]; }
  var t = REG_ENDS[tense];
  if (!t) return null;
  return stem + t[cls][i];
}
function viewConj(query) {
  $app.innerHTML = '<h1>conjugator <span class="dim">— the verb engine, interactive</span></h1>' +
    '<div class="repl-line"><span class="ps1">conj&gt;</span><input id="repl-in" placeholder="type a verb — e.g. tener, dormir, buscar…" autocomplete="off" spellcheck="false"></div>' +
    '<div id="conj-out"></div>';
  var input = document.getElementById("repl-in");
  wireDigraphs(input);
  var out = document.getElementById("conj-out");
  function render(v) {
    v = (v || "").trim().toLowerCase();
    if (!v) { renderIndex(); return; }
    var inf = CONJ.stripReflex(v);
    if (!/([aei]r|ír)$/.test(inf)) { out.innerHTML = '<p class="r">parse error: “' + esc(v) + '” is not an infinitive (-ar/-er/-ir)</p>'; return; }
    var e = CONJ.entry(v);
    var html = "<h2>" + esc(v) + (e.g ? ' <span class="dim">— ' + esc(e.g) + "</span>" : "") + "</h2>";
    html += '<p class="conj-note">' + CONJ.notes(v).map(esc).join(" · ") + "</p>";
    html += '<p class="muted">gerund: <b class="c">' + esc(CONJ.gerund(v)) + '</b> · participle: <b class="c">' + esc(CONJ.participle(v)) + "</b></p>";
    html += '<div class="conj-grid">';
    SHOW_TENSES.forEach(function (t) {
      var forms;
      try { forms = CONJ.conj(v, t); } catch (err) { return; }
      html += '<div class="conj-card"><h3>' + esc(CONJ.TENSES[t].name) + ' <span class="dim" style="font-size:11px">' + esc(CONJ.TENSES[t].en) + "</span></h3><table>";
      forms.forEach(function (f, i) {
        var reg = t === "perf" ? f : regularForm(v, t, i);
        var irr = reg !== null && reg !== f;
        html += "<tr><td>" + esc(CONJ.PERSONS[i]) + '</td><td class="' + (irr ? "irr" : "stem") + '">' + esc(f) + (irr ? ' <span class="muted" title="regular would be ' + esc(reg) + '">*</span>' : "") + "</td></tr>";
      });
      html += "</table></div>";
    });
    var impA = CONJ.imperative(v), impN = CONJ.imperative(v, true);
    html += '<div class="conj-card"><h3>imperativo</h3><table>' +
      ["tú", "usted", "nosotros", "vosotros", "ustedes"].map(function (p, i) {
        return "<tr><td>" + p + '</td><td class="stem">' + esc(impA[i]) + ' <span class="muted">/</span> <span class="irr">' + esc(impN[i]) + "</span></td></tr>";
      }).join("") + "</table></div>";
    html += "</div><p class='muted' style='margin-top:.6rem'>forms marked <span class='irr'>red</span>* deviate from the regular derivation — hover the * to see what regular would have been</p>";
    out.innerHTML = html;
  }
  function renderIndex() {
    var groups = { "fully irregular / strong": [], "stem-changing": [], "orthographic / other": [], "regular": [] };
    CONJ.list().forEach(function (v) {
      var e = CONJ.entry(v);
      var g = (e.pres || e.pret || e.pretStem || e.futStem) ? "fully irregular / strong" :
              e.sc ? "stem-changing" :
              (e.yo || e.part || e.ger || e.acc || /(car|gar|zar|uir|cer|cir|eer|aer)$/.test(v)) ? "orthographic / other" : "regular";
      groups[g].push(v);
    });
    out.innerHTML = "<p class='muted'>" + CONJ.list().length + " verbs registered. Click one, or type any infinitive above (unregistered verbs conjugate as regulars).</p>" +
      Object.keys(groups).map(function (g) {
        return "<h3>" + g + " <span class='dim'>(" + groups[g].length + ")</span></h3><div class='vlist'>" +
          groups[g].map(function (v) {
            var e = CONJ.entry(v);
            return '<a href="#/conj/' + v + '">' + v + (e.sc ? ' <span class="tag">(' + e.sc + ")</span>" : "") + "</a>";
          }).join("") + "</div>";
      }).join("");
  }
  input.addEventListener("input", function () { render(input.value); if (input.value.trim()) history.replaceState(null, "", "#/conj/" + encodeURIComponent(input.value.trim())); });
  if (query) { input.value = decodeURIComponent(query); render(input.value); }
  else renderIndex();
  input.focus();
}

/* ───────── man pages ───────── */
var MAN = {
  "ser-estar": { d: "the two verbs “to be”", s: `
## NAME
ser, estar — classification vs state

| use | verb | example |
| identity, profession, origin | ser | soy ingeniero, es de Cádiz |
| material, possession | ser | es de madera, es de Ana |
| time, dates | ser | son las dos, es martes |
| event location | ser | la reunión es en la sala 3 |
| location of things/people | estar | el server está en Dublín |
| conditions, moods | estar | está roto, estoy cansado |
| progressive | estar | está compilando |
| result state (participle) | estar | la puerta está abierta |

Meaning-shift adjectives: listo (clever/ready) · aburrido (boring/bored) · rico (rich/tasty) · malo (bad/ill) · verde (green/unripe) · seguro (safe/certain). ser classifies, estar reports state. Existence is neither: use hay.` },
  "generos": { d: "gender rules and exceptions", s: `
## NAME
géneros — the noun type system

- -o masculine, -a feminine (usually); -ción/-sión/-dad/-tad/-tud/-umbre feminine
- Greek -ma masculine: el problema, sistema, programa, idioma, tema, clima
- masc despite -a: el día, el mapa, el planeta · fem despite -o: la mano, la foto, la moto
- el before stressed a-: el agua fría, las aguas frías (stays feminine)
- a + el → al · de + el → del
- Always learn nouns WITH the article.` },
  "pret-impf": { d: "preterite vs imperfect decision procedure", s: `
## NAME
pretérito/imperfecto — aspect selection

Tag each verb: **event** (bounded, advances the story) → preterite; **state** (background, habit, description) → imperfect.

| leans preterite | leans imperfect |
| ayer, anoche, de repente, una vez, en 2019, hasta que | siempre, todos los días, mientras, de niño, normalmente |

- Bounded spans are events: vivió allí 20 años.
- English “would” = used to → imperfect (íbamos), not conditional.
- Meaning shifts: supe found out · conocí met · pude managed · no quise refused · tuve got.
- Interrupt pattern: imperfect state + preterite event: Dormía cuando llamaste.` },
  "subjuntivo": { d: "the subjunctive trigger table", s: `
## NAME
subjuntivo — unasserted clauses

Formation: yo-form − o + opposite endings (tengo → tenga); rebels: sea, esté, vaya, dé, sepa, haya. Past: 3pl preterite − ron + ra (dijeron → dijera). Sequence: present-class main → present subj; past/conditional main → imperfect subj.

| trigger family | examples | mood |
| volition | quiero/espero/pido que, ojalá | subj |
| emotion/judgment | me alegro de que, es raro que | subj |
| doubt/denial | dudo que, no creo que | subj |
| assertion | sé que, es verdad que, creo que | ind |
| unknown antecedent | busco algo que funcione | subj |
| pending time | cuando llegue, en cuanto sepa | subj |
| purpose/proviso | para que, antes de que, sin que | subj |
| si-counterfactual | si tuviera → compraría | subj+cond |

Same subject → infinitive (quiero dormir). si never takes present subjunctive or conditional.` },
  "se": { d: "the five jobs of se", s: `
## NAME
se — one byte, five opcodes

| # | job | example |
| 1 | reflexive | se ducha — washes himself |
| 2 | reciprocal | se conocen — know each other |
| 3 | l-l rewrite (le/les→se) | se lo di — I gave it to him |
| 4 | accidental | se me cayó el vaso — I dropped it |
| 5 | passive/impersonal | se venden pisos · ¿cómo se dice…? |

Decoder: a following lo/la/los/las → #3. A me/te/le between se and verb → #4. Plural subject people → #1/#2 by sense. Otherwise likely #5.` },
  "pronombres": { d: "clitic pronouns: case, order, placement", s: `
## NAME
pronombres átonos — object references

| person | direct | indirect |
| yo/tú | me / te | me / te |
| 3sg | lo, la | le |
| nos/vos | nos / os | nos / os |
| 3pl | los, las | les |

- Order: indirect before direct (te lo). le/les → se before l-pronouns.
- Placement: before conjugated verbs (incl. haber); attached to infinitive, gerund, affirmative command (dímelo); detached on negatives (no me lo digas).
- Personal a marks specific human direct objects: veo a María.
- Indirect objects duplicate: le di el libro a Marta.` },
  "por-para": { d: "por vs para in one table", s: `
## NAME
por/para — cause behind vs goal ahead

| para (goal →) | por (cause/medium ⇐) |
| purpose: para aprender | reason: por la lluvia |
| destination: para Madrid | through/along: por el centro |
| recipient: para ti | exchange/price: por 20 € |
| deadline: para el viernes | duration: (por) dos semanas |
| standard: para ser junior | per/rate: por segundo |
| employer: trabajo para X | means: por correo |
| opinion: para mí | agent: escrito por |

Idioms: por favor, por fin, por eso, por si acaso, por supuesto · para siempre, para nada, para variar.` },
  "imperativo": { d: "command forms summary", s: `
## NAME
imperativo — command matrix

| person | affirmative | negative |
| tú | él-form (habla); irregulars: di haz ve pon sal sé ten ven | no + subj (no hables) |
| usted / ustedes | subj (hable / hablen) | no + subj |
| nosotros | subj (hablemos); vamos | no + subj |
| vosotros | inf −r +d (hablad) | no + subj (no habléis) |

Clitics attach to affirmatives with accent fixes (dímelo, cómpralo); precede negatives (no me lo digas). vosotros+os drops d (sentaos); nosotros+nos drops s (vámonos). Third-party: que lo haga Marta.` },
  "acentos": { d: "stress rules and why the marks matter", s: `
## NAME
acentos — the stress spec

- Words ending in a vowel, n or s stress the second-to-last syllable; all others stress the last. The written accent marks exceptions: teléfono, fácil, habló.
- Question/exclamation words carry accents: qué, quién, dónde, cuándo, cómo, por qué — also in reported questions (me preguntó dónde estaba).
- Monosyllable pairs: sé/se · sí/si · él/el · tú/tu · mí/mi · té/te · dé/de · más/mas · aún/aun.
- Load-bearing pairs: hablo/habló · este/esté · hacia/hacía.
- In this app: type a\` → á, e\` → é … n~ → ñ, u" → ü. The grader accepts missing accents as warnings, not passes-with-honour.` },
  "falsos-amigos": { d: "false friends that will burn you", s: `
## NAME
falsos amigos — deceptive cognates

| Spanish | actually means | you wanted |
| actualmente | currently | en realidad (actually) |
| asistir | to attend | ayudar (assist) |
| carpeta | folder | alfombra (carpet) |
| constipado | having a cold | estreñido |
| embarazada | pregnant | avergonzada (embarrassed) |
| éxito | success | salida (exit) |
| librería | bookshop | biblioteca (library) |
| realizar | to carry out | darse cuenta (realise) |
| sensible | sensitive | sensato (sensible) |
| soportar | to bear/tolerate | apoyar (support) |
| introducir | to insert | presentar (introduce someone) |
| casualidad | coincidence | informalidad (casualness) |` },
  "tiempos": { d: "which tense when — the full map", s: `
## NAME
tiempos — tense selection map

| you want | tense | example |
| now / habits / near plans | presente | trabajo, mañana llego |
| in progress right now | estar + gerundio | está compilando |
| completed past event | pretérito | ayer terminé |
| past state / habit | imperfecto | trabajaba, era tarde |
| past-before-past | pluscuamperfecto | ya había salido |
| today-period past (Spain) | perfecto | esta mañana he ido |
| planned future | ir a + inf | voy a escribir |
| prediction / promise | futuro | lloverá, no volverá a pasar |
| probability about now | futuro | estará en una reunión |
| hypothesis / politeness | condicional | sería mejor, ¿podrías? |
| probability about the past | condicional | serían las once |
| unasserted clause | subjuntivo | quiero que vengas |
| past unasserted / si-branch | subj. imperfecto | si tuviera, quería que vinieras |` }
};
function viewMan(topic) {
  if (topic && MAN[topic]) {
    $app.innerHTML = '<div class="crumbs"><a href="#/man">man</a> / ' + esc(topic) + "</div>" +
      '<h1>man ' + esc(topic) + "</h1>" + '<div class="doc">' + md(MAN[topic].s) + "</div>";
    return;
  }
  $app.innerHTML = "<h1>man <span class='dim'>— grammar reference pages</span></h1><div class='man-list panel'>" +
    Object.keys(MAN).map(function (k) {
      return '<a href="#/man/' + k + '"><b>' + k + "</b> <span class='mdesc'>— " + esc(MAN[k].d) + "</span></a>";
    }).join("") + "</div>" +
    "<p class='muted'>These are quick-reference sheets; the full explanations live in the lessons. The conjugator covers any verb's full paradigm.</p>";
}

function viewErrors(code) {
  if (code && ERRORS[code]) {
    var e = ERRORS[code];
    $app.innerHTML = '<div class="crumbs"><a href="#/errors">errors</a> / ' + esc(code) + "</div>" +
      '<h1><span class="' + (e.w ? "y" : "r") + '">' + esc(code) + "</span> — " + esc(e.t) + "</h1>" +
      '<div class="doc"><p>' + esc(e.x) + "</p></div>" +
      '<p class="muted">This explanation appears whenever the grader raises ' + esc(code) + ". Think of it as --explain.</p>";
    return;
  }
  $app.innerHTML = "<h1>error index <span class='dim'>— every diagnostic the grader can raise</span></h1><div class='panel'>" +
    Object.keys(ERRORS).map(function (k) {
      var e = ERRORS[k];
      return '<div class="err-row"><span class="ecode' + (e.w ? " w" : "") + '">' + k + '</span><a href="#/errors/' + k + '">' + esc(e.t) + "</a></div>";
    }).join("") + "</div>";
}

/* ───────── router ───────── */
function route() {
  document.onkeydown = null;
  window.scrollTo(0, 0);
  var hash = location.hash.replace(/^#\/?/, "");
  var seg = hash.split("/");
  try {
    if (!hash) viewDash();
    else if (seg[0] === "graph") viewGraph();
    else if (seg[0] === "mod") viewModule(seg[1]);
    else if (seg[0] === "lesson") viewLesson(seg[1], seg[2] === "run" || seg[2] === "rerun");
    else if (seg[0] === "review") viewReview();
    else if (seg[0] === "conj") viewConj(seg.slice(1).join("/"));
    else if (seg[0] === "man") viewMan(seg[1]);
    else if (seg[0] === "errors") viewErrors(seg[1]);
    else viewDash();
  } catch (err) {
    $app.innerHTML = '<div class="diag fail"><span class="dhead">internal error</span>\n' + esc(err.stack || err.message) + "</div>";
  }
  updateChrome();
}
window.addEventListener("hashchange", route);
route();
})();
