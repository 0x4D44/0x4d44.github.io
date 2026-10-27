/* Past-paper practice: the interactive answer panel.
   Renders the question banks (papers-*.js) into tabs, marks every answer with the auto-marker in
   papers-engine.js, and keeps a scoreboard in localStorage (this device only). Same shape as the
   Higher Graphic Communication deck, with maths-aware inputs. */
(function () {
  "use strict";
  const HM = window.HM, HMP = window.HMP;
  if (!HM || !HMP) return;
  const el = HM.el;
  const BANK = window.HMP_BANK || {};
  const KEY = "hm-papers.v1", AKEY = "hm-papers-ans.v1";
  const AREAS = HMP.AREAS;

  /* results[qid] = [marks earned per part, or null while unmarked]; answers["qid.part"] = what was typed */
  let results = {}, answers = {};
  try { results = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { results = {}; }
  try { answers = JSON.parse(localStorage.getItem(AKEY) || "{}") || {}; } catch (e) { answers = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(results)); } catch (e) { /* this visit only */ } };
  const saveAns = () => { try { localStorage.setItem(AKEY, JSON.stringify(answers)); } catch (e) { /* this visit only */ } };

  const qMarks = HMP.partsMarks;
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const bankQs = (id) => (BANK[id] && BANK[id].questions) || [];
  const typeset = (n) => HM.math(n);

  /* ---- totals ---- */
  function areaTotals(areaId) {
    let got = 0, of = 0, markedOf = 0, qDone = 0;
    const qs = bankQs(areaId);
    qs.forEach((q) => {
      of += qMarks(q);
      const r = results[q.id];
      if (!r) return;
      let all = true;
      q.parts.forEach((p, i) => { if (r[i] == null) all = false; else { got += r[i]; markedOf += p.marks; } });
      if (all) qDone++;
    });
    return { got, of, markedOf, qDone, qs: qs.length };
  }

  /* ---- a single typed input (num, expr, eq, set, vec) ---- */
  const HINTS = {
    num: "a number: 3/4, sqrt(3), -2.5, pi/6",
    expr: "an expression: x^2, 2x(x-1), sqrt(x), e^(2x)",
    eq: "an equation: y = 2x + 3",
    set: "separate the values with commas",
    vec: "components in brackets, like (3, -1, 2), or 3i - j + 2k",
    pt: "coordinates in brackets, like (2, -1)",
  };
  function textField(f, id, onReady) {
    const inp = el("input", {
      type: "text", id, class: "pp-num pp-math", autocomplete: "off", autocapitalize: "off", spellcheck: "false", inputmode: "text",
      "aria-label": f.label ? `Answer for ${f.label}` : "Your answer", placeholder: f.placeholder || "", size: f.type === "set" || f.type === "eq" || f.type === "vec" || f.type === "expr" ? 28 : 14,
    });
    inp.addEventListener("input", onReady);
    return inp;
  }

  /* ---- one part of a question ---- */
  function renderPart(q, part, pi, onChange, ns) {
    const id = `${ns}-${q.id}-${pi}`;
    const box = el("div", { class: "pp-part" });
    const label = part.label ? el("span", { class: "pp-plabel" }, part.label) : null;
    box.append(el("div", { class: "pp-pq" }, label, el("span", { html: part.q }), el("span", { class: "pp-marks" }, `(${part.marks} mark${part.marks > 1 ? "s" : ""})`)));
    const input = el("div", { class: "pp-input" });
    const fb = el("div", { class: "pp-fb", "aria-live": "polite" });
    const markBtn = el("button", { class: "btn small primary", type: "button" }, "Mark my answer");
    const againBtn = el("button", { class: "btn small", type: "button", hidden: true }, "↺ Try again");
    const errBox = el("p", { class: "pp-err", role: "alert", hidden: true });
    let getAns, lock, ready, setAns, reveal = null, clear;
    const refresh = () => { markBtn.disabled = !ready(); errBox.hidden = true; };

    if (part.type === "mcq" || part.type === "multi") {
      const multi = part.type === "multi";
      const fs = el("fieldset", { class: "pp-opts" }, el("legend", { class: "sr-only" }, `Options for ${part.label || "this part"}${multi ? ": choose " + part.a.length : ""}`));
      const ctrls = part.opts.map((o, oi) => {
        const c = el("input", { type: multi ? "checkbox" : "radio", name: id, value: oi, id: `${id}-o${oi}` });
        const lab = el("label", { class: "pp-opt", for: `${id}-o${oi}` }, c, el("span", { html: o }));
        fs.append(lab);
        return { c, lab };
      });
      input.append(fs);
      if (multi) fs.querySelector("legend").after(el("p", { class: "pp-hint" }, `Choose ${part.a.length}.`));
      getAns = () => (multi ? ctrls.filter((x) => x.c.checked).map((x) => +x.c.value) : ctrls.findIndex((x) => x.c.checked));
      ready = () => (multi ? getAns().length > 0 : getAns() >= 0);
      lock = (on) => ctrls.forEach((x) => (x.c.disabled = on));
      reveal = () => ctrls.forEach((x, i) => {
        const should = multi ? part.a.includes(i) : part.a === i;
        x.lab.classList.toggle("right", should);
        x.lab.classList.toggle("wrong", x.c.checked && !should);
      });
      clear = () => ctrls.forEach((x) => { x.c.checked = false; x.lab.classList.remove("right", "wrong"); });
      setAns = (a) => ctrls.forEach((x, i) => (x.c.checked = multi ? Array.isArray(a) && a.includes(i) : a === i));
      ctrls.forEach((x) => x.c.addEventListener("change", refresh));
    } else if (part.type === "match") {
      const order = shuffle(part.pairs.map((_, i) => i));
      const sels = part.pairs.map((pr, i) => {
        const s = el("select", { id: `${id}-m${i}`, "aria-label": `Match: ${pr[0].replace(/<[^>]*>/g, "").replace(/\$/g, "")}` }, el("option", { value: "-1" }, "Choose…"), order.map((j) => el("option", { value: j }, part.pairs[j][1])));
        input.append(el("div", { class: "pp-match" }, el("span", { class: "pp-mterm", html: pr[0] }), s));
        return s;
      });
      getAns = () => sels.map((s) => +s.value);
      ready = () => sels.every((s) => +s.value >= 0);
      lock = (on) => sels.forEach((s) => (s.disabled = on));
      reveal = () => sels.forEach((s, i) => {
        const bad = +s.value !== i;
        s.classList.toggle("wrong", bad);
        s.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad) s.parentElement.append(el("span", { class: "pp-wrongnote" }, "✘ not this one; the right pairs are listed below"));
      });
      clear = () => sels.forEach((s) => { s.value = "-1"; s.classList.remove("wrong"); s.removeAttribute("aria-invalid"); s.parentElement.querySelectorAll(".pp-wrongnote").forEach((n) => n.remove()); });
      setAns = (a) => sels.forEach((s, i) => (s.value = String(Array.isArray(a) ? a[i] : -1)));
      sels.forEach((s) => s.addEventListener("change", refresh));
    } else if (part.type === "fields") {
      const inps = part.fields.map((f, i) => {
        const inp = textField(f, `${id}-f${i}`, refresh);
        input.append(el("div", { class: "pp-field" }, el("label", { for: `${id}-f${i}`, class: "pp-flabel", html: f.label || "" }), inp, f.unit ? el("span", { class: "pp-unit" }, f.unit) : null, f.marks > 1 || part.fields.length > 1 ? el("span", { class: "pp-marks" }, ` (${f.marks})`) : null));
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && ready()) { e.preventDefault(); markBtn.click(); } });
        return inp;
      });
      input.append(el("p", { class: "pp-hint" }, "Type each answer in its own box."));
      getAns = () => inps.map((x) => x.value);
      ready = () => inps.every((x) => x.value.trim() !== "");
      lock = (on) => inps.forEach((x) => (x.readOnly = on));
      clear = () => inps.forEach((x) => { x.value = ""; x.classList.remove("wrong", "right"); });
      setAns = (a) => inps.forEach((x, i) => (x.value = Array.isArray(a) ? String(a[i] || "") : ""));
      reveal = (r) => inps.forEach((x, i) => { const p = r.per && r.per[i]; x.classList.toggle("right", !!p && p.got === p.max); x.classList.toggle("wrong", !!p && p.got < p.max); });
    } else if (part.type === "text") {
      const ta = el("textarea", { rows: part.rows || Math.min(7, 2 + part.marks), id: `${id}-t`, "aria-label": `Answer for ${part.label || "this part"}`, placeholder: part.placeholder || "Write your answer here…" });
      input.append(ta);
      getAns = () => ta.value;
      ready = () => ta.value.trim().length > 0;
      lock = (on) => (ta.readOnly = on);
      clear = () => (ta.value = "");
      setAns = (a) => (ta.value = String(a));
      ta.addEventListener("input", refresh);
    } else {
      const inp = textField(part, `${id}-n`, refresh);
      input.append(inp);
      if (part.unit) input.append(el("span", { class: "pp-unit" }, part.unit));
      input.append(el("p", { class: "pp-hint" }, "Type " + (HINTS[part.type] || HINTS.num) + "."));
      getAns = () => inp.value;
      ready = () => inp.value.trim() !== "";
      lock = (on) => (inp.readOnly = on);
      clear = () => { inp.value = ""; inp.classList.remove("wrong", "right"); };
      setAns = (a) => (inp.value = String(a));
      reveal = (r) => { inp.classList.toggle("right", r.got === part.marks); inp.classList.toggle("wrong", r.got < part.marks); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && ready()) { e.preventDefault(); markBtn.click(); } });
    }
    markBtn.disabled = true;

    const akey = q.id + "." + pi;
    const setResult = (got) => { (results[q.id] = results[q.id] || q.parts.map(() => null))[pi] = got; save(); onChange(); };

    markBtn.addEventListener("click", () => {
      if (!ready()) return;
      const ans = getAns();
      const r = HMP.scorePart(part, ans);
      if (r.error) { errBox.textContent = "I could not read that: " + r.error + ". Check the box for how to type it, then mark again."; errBox.hidden = false; return; }
      answers[akey] = ans; saveAns();
      lock(true);
      markBtn.hidden = true; againBtn.hidden = false;
      if (reveal) reveal(r);
      fb.textContent = "";
      const head = el("p", { class: "pp-score" });
      const paint = (got) => {
        head.className = "pp-score " + (got === part.marks ? "full" : got > 0 ? "part" : "none");
        head.textContent = `${fmt(got)} / ${part.marks} mark${part.marks > 1 ? "s" : ""}` + (got === part.marks ? " ✔" : "");
      };
      paint(r.got);
      head.tabIndex = -1;
      fb.append(head);
      if (r.note) fb.append(el("p", { class: "pp-hint" }, r.note));
      if (part.type === "text") {
        const ul = el("ul", { class: "pp-points" });
        const boxes = r.points.map((p, i) => {
          const cb = el("input", { type: "checkbox", id: `${id}-p${i}`, checked: p.hit ? true : null });
          ul.append(el("li", null, el("label", { for: `${id}-p${i}` }, cb, " ", el("span", { html: p.desc }), el("span", { class: "pp-pm" }, ` [${p.marks}]`))));
          return cb;
        });
        const recount = () => { const g = Math.min(part.marks, r.points.reduce((a, p, i) => a + (boxes[i].checked ? p.marks : 0), 0)); paint(g); setResult(g); };
        boxes.forEach((cb, i) => cb.addEventListener("change", () => {
          const g = r.points[i].group;
          if (g && cb.checked) boxes.forEach((o, k) => { if (k !== i && r.points[k].group === g) o.checked = false; });
          recount();
        }));
        fb.append(el("p", { class: "pp-hint" }, "The marker looks for key ideas and words, so a good answer in unusual words can be missed. Tick any point you did make; untick any it gave you by mistake."), ul);
      } else if (part.type === "match") {
        fb.append(el("ul", { class: "pp-points" }, part.pairs.map((pr) => el("li", { html: `<b>${pr[0]}</b>: ${pr[1]}` }))));
      } else if (part.type !== "mcq" && part.type !== "multi") {
        const shown = part.type === "fields"
          ? el("ul", { class: "pp-points" }, part.fields.map((f, i) => el("li", { class: r.per && r.per[i].got === f.marks ? "ok" : "no", html: `${f.label ? f.label + " " : ""}<b>$${f.show}$</b>` })))
          : el("p", null, "Answer: ", el("b", { html: part.show ? `$${part.show}$` : "" }), part.tol && part.tol > 1e-6 ? ` (within ±${part.tol})` : "");
        fb.append(shown);
        // the marker compares by value; if the answer was right in a form it could not read as equal, say so
        const eq = el("input", { type: "checkbox", id: `${id}-eq`, checked: r.got === part.marks ? true : null });
        eq.addEventListener("change", () => { const g = eq.checked ? part.marks : (r.got === part.marks ? 0 : r.got); paint(g); setResult(g); });
        fb.append(el("p", { class: "pp-hint" }, el("label", { for: `${id}-eq` }, eq, " My answer was right (for example in an equivalent form the marker could not read)")));
      }
      if (part.why) fb.append(el("div", { class: "callout model pp-model" }, el("div", { class: "callout-title" }, "Worked solution and marking scheme"), el("div", { html: part.why })));
      typeset(fb);
      setResult(r.got);
      head.focus({ preventScroll: true });
    });
    againBtn.addEventListener("click", () => {
      lock(false); clear(); fb.textContent = "";
      markBtn.hidden = false; markBtn.disabled = true; againBtn.hidden = true; errBox.hidden = true;
      if (results[q.id]) { results[q.id][pi] = null; if (results[q.id].every((x) => x == null)) delete results[q.id]; save(); }
      onChange();
      const f = input.querySelector("input,textarea,select"); if (f) f.focus();
    });
    box.append(input, errBox, el("div", { class: "btn-row" }, markBtn, againBtn), fb);

    // restore: put the stored answer back and mark it; a mark corrected by hand is re-applied by ticking to match
    const had = (results[q.id] || [])[pi];
    if (had != null && answers[akey] != null) {
      setAns(answers[akey]); markBtn.disabled = false; markBtn.click();
      const h = fb.querySelector(".pp-score"); if (h) h.blur();
      const auto = HMP.scorePart(part, answers[akey]);
      if (!auto.error && auto.got !== had) {
        const boxes = [...fb.querySelectorAll('input[type="checkbox"]')];
        if (part.type === "text") {
          let sum = 0;
          boxes.forEach((b, i) => { const m = part.points[i] && part.points[i].marks != null ? part.points[i].marks : 1; b.checked = sum + m <= had; if (b.checked) sum += m; });
          if (boxes.length) boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
        } else if (boxes.length) {
          boxes[0].checked = had >= part.marks;
          boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    return box;
  }

  /* a figure's own ids are made unique per panel, so the mock paper can show a question an area tab also holds */
  function scopeIds(svg, ns) {
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    return ids.reduce((out, id) => out.split(`id="${id}"`).join(`id="${ns}-${id}"`).split(`url(#${id})`).join(`url(#${ns}-${id})`).split(`href="#${id}"`).join(`href="#${ns}-${id}"`), svg);
  }

  /* ---- a whole question ---- */
  function renderQuestion(q, areaId, n, ns) {
    const area = AREAS.find((a) => a.id === areaId);
    const total = qMarks(q);
    const badge = el("span", { class: "pp-badge" });
    const card = el("article", { class: "pp-q", id: `${ns}-${q.id}`, "aria-labelledby": `${ns}-${q.id}-h` },
      el("header", { class: "pp-qhead" },
        el("h3", { id: `${ns}-${q.id}-h` }, `Question ${n}`, el("span", { class: "pp-qtag" }, ` · ${area.short} · ${total} marks · ${q.calc ? "calculator" : "non-calculator"}`)),
        badge),
      q.style ? el("p", { class: "pp-style" }, q.style) : null,
      el("div", { class: "pp-stem", html: q.stem }));
    if (q.figure) {
      const fig = el("figure", { class: "diagram pp-fig", role: "group", "aria-label": "Figure for question " + n, html: scopeIds(q.figure, ns) });
      card.append(fig);
      const hint = el("p", { class: "pp-hint pp-fighint", hidden: "" }, "Swipe the figure sideways to see all of it.");
      card.append(hint);
      const fit = () => {
        const wide = fig.scrollWidth > fig.clientWidth + 1;
        if (wide) fig.setAttribute("tabindex", "0"); else fig.removeAttribute("tabindex");
        hint.hidden = !wide;
      };
      requestAnimationFrame(fit);
      if (window.ResizeObserver) new ResizeObserver(fit).observe(fig); else window.addEventListener("resize", fit);
    }
    const paint = () => {
      const r = results[q.id] || [];
      const got = r.reduce((a, x) => a + (x || 0), 0);
      const done = q.parts.every((_, i) => r[i] != null);
      const some = r.some((x) => x != null);
      badge.textContent = done ? `${fmt(got)} / ${total}` : some ? `${fmt(got)} so far` : `${total} marks`;
      badge.className = "pp-badge" + (done ? (got === total ? " full" : got >= total / 2 ? " part" : " low") : "");
    };
    q.parts.forEach((p, pi) => card.append(renderPart(q, p, pi, () => { paint(); window.dispatchEvent(new Event("hmp-change")); }, ns)));
    paint();
    typeset(card);
    return card;
  }

  /* ---- area tabs ---- */
  function areaPanel(a) {
    const bank = BANK[a.id] || { questions: [] };
    const panel = el("div");
    const sum = el("p", { class: "pp-sum", "aria-live": "polite" });
    const paint = () => {
      const t = areaTotals(a.id);
      sum.textContent = `${t.qDone} of ${t.qs} questions marked` + (t.markedOf ? ` · ${fmt(t.got)} / ${t.markedOf} marks on those (${pct(t.got, t.markedOf)}%)` : "") + ` · ${t.of} marks in this set`;
    };
    window.addEventListener("hmp-change", paint);
    panel.append(el("p", { class: "pp-intro", html: bank.intro || "" }), sum);
    bank.questions.forEach((q, i) => panel.append(renderQuestion(q, a.id, i + 1, a.id)));
    paint();
    typeset(panel.firstChild);
    return panel;
  }

  /* ---- mock papers: half-length, split calculator / non-calculator like the real two papers ---- */
  const MOCK = {
    p1: { name: "Paper 1 (non-calculator)", calc: false, marks: 28, minutes: 38, target: { alg: 8, geo: 7, trig: 5, cal: 8 } },
    p2: { name: "Paper 2 (calculator)", calc: true, marks: 32, minutes: 45, target: { alg: 9, geo: 7, trig: 7, cal: 9 } },
  };
  function drawMock(cfg) {
    // draw until the paper lands on the target marks, in roughly the real proportions
    let best = null, bestGap = 1e9;
    for (let n = 0; n < 400; n++) {
      const picked = [];
      let total = 0;
      AREAS.forEach((a) => {
        let sum = 0;
        shuffle(bankQs(a.id).filter((q) => !!q.calc === cfg.calc)).forEach((q) => {
          const m = qMarks(q);
          if (sum + m <= cfg.target[a.id] + 1 && sum < cfg.target[a.id]) { picked.push({ q, a: a.id }); sum += m; }
        });
        total += sum;
      });
      const gap = Math.abs(total - cfg.marks);
      if (gap < bestGap) { best = picked; bestGap = gap; }
      if (gap === 0) break;
    }
    return best || [];
  }
  function mockPanel() {
    const panel = el("div");
    panel.append(el("p", { class: "pp-intro", html: "A half-length paper drawn at random from the four banks in roughly the proportions of the real papers. The real course has two papers: <b>Paper 1 (non-calculator, 55 marks, 75 minutes)</b> and <b>Paper 2 (calculator, 65 marks, 90 minutes)</b>. Pick one, start the clock, work on paper if you want a true rehearsal, then enter and mark your answers. Marks from a mock also count on the scoreboard." }));
    const which = el("div", { class: "pp-seg", role: "group", "aria-label": "Which paper" });
    const timers = {};
    const out = el("div");
    const total = el("p", { class: "pp-sum", "aria-live": "polite" });
    const draw = el("button", { class: "btn", type: "button" }, "🎲 Draw a new mock paper");
    let mode = "p1", cur = [];
    const modeBtns = Object.keys(MOCK).map((k) => {
      const b = el("button", { class: "btn small", type: "button", "aria-pressed": k === mode ? "true" : "false" }, `${MOCK[k].name}: ${MOCK[k].marks} marks, ${MOCK[k].minutes} min`);
      b.addEventListener("click", () => { mode = k; build(); });
      which.append(b);
      timers[k] = el("div", { class: "exam-timer", "data-minutes": String(MOCK[k].minutes), "data-label": "Mock clock: " + MOCK[k].name, hidden: k !== mode });
      return b;
    });
    const paint = () => {
      const of = cur.reduce((a, x) => a + qMarks(x.q), 0);
      let got = 0, mof = 0;
      cur.forEach((x) => x.q.parts.forEach((p, i) => { const r = (results[x.q.id] || [])[i]; if (r != null) { got += r; mof += p.marks; } }));
      total.textContent = `This paper: ${of} marks` + (mof ? ` · ${fmt(got)} / ${mof} marked so far (${pct(got, mof)}%)` : "");
    };
    function build() {
      modeBtns.forEach((b, i) => b.setAttribute("aria-pressed", Object.keys(MOCK)[i] === mode ? "true" : "false"));
      Object.keys(timers).forEach((k) => (timers[k].hidden = k !== mode));
      out.textContent = "";
      cur = drawMock(MOCK[mode]);
      cur.forEach((x, i) => out.append(renderQuestion(x.q, x.a, i + 1, "mock")));
      paint();
    }
    draw.addEventListener("click", build);
    window.addEventListener("hmp-change", paint);
    panel.append(which, ...Object.values(timers), el("div", { class: "btn-row" }, draw), total, out);
    build();
    return panel;
  }

  /* ---- scoreboard ---- */
  function scorePanel() {
    const panel = el("div");
    const body = el("div");
    const reset = el("button", { class: "btn small danger", type: "button" }, "Clear my scores");
    reset.addEventListener("click", () => {
      if (!confirm("Clear every past-paper score stored on this device?")) return;
      results = {}; answers = {}; save(); saveAns(); location.reload();
    });
    const paint = () => {
      body.textContent = "";
      let G = 0, M = 0;
      const rows = AREAS.map((a) => { const t = areaTotals(a.id); G += t.got; M += t.markedOf; return { a, t }; });
      body.append(el("div", { class: "table-wrap" }, el("table", null,
        el("thead", null, el("tr", null, ["Area", "Questions marked", "Marks earned", "Share"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", null, rows.map(({ a, t }) => el("tr", null,
          el("th", { scope: "row" }, a.name),
          el("td", null, `${t.qDone} / ${t.qs}`),
          el("td", null, t.markedOf ? `${fmt(t.got)} / ${t.markedOf}` : "—"),
          el("td", null, t.markedOf ? el("span", { class: "pp-bar", role: "img", "aria-label": pct(t.got, t.markedOf) + " per cent" }, el("i", { style: `width:${pct(t.got, t.markedOf)}%` }), el("b", null, pct(t.got, t.markedOf) + "%")) : "—")))))));
      let verdict = "Mark some questions in the area tabs and your results will gather here.";
      if (M) {
        const p = pct(G, M);
        verdict = `Overall you have earned ${fmt(G)} of the ${M} marks you have attempted: ${p}%. ` +
          (p >= 72 ? "That is roughly the share an A needs (boundaries move every year)." : p >= 50 ? "That is in the range where a C or a B is within reach." : p >= 40 ? "That is around the edge of a pass: find the weakest area below and drill it." : "That is below the pass mark: go back to the decks and work the topics again.") +
          " Treat it as a rough guide only: grade boundaries move every year, practice questions are not the real papers, and you may have chosen the easy ones.";
      }
      body.append(el("p", { class: "pp-verdict" }, verdict));
      const weakest = rows.filter((r) => r.t.markedOf >= 4).sort((x, y) => x.t.got / x.t.markedOf - y.t.got / y.t.markedOf)[0];
      if (weakest) body.append(el("p", null, "Weakest area so far: ", el("b", null, weakest.a.name), ` (${pct(weakest.t.got, weakest.t.markedOf)}%). Go back to that tab and try again after revising the matching deck.`));
    };
    window.addEventListener("hmp-change", paint);
    panel.append(el("p", { class: "pp-intro" }, "Your marks, by area. Scores are stored in this browser only; nothing is sent anywhere."), body, el("div", { class: "btn-row" }, reset));
    paint();
    return panel;
  }

  /* ---- tab strip ---- */
  function init() {
    const host = document.getElementById("pp-app");
    if (!host) return;
    const tabs = AREAS.map((a) => ({ id: a.id, label: a.short, build: () => areaPanel(a) }))
      .concat([{ id: "mock", label: "Mock paper", build: mockPanel }, { id: "score", label: "Scoreboard", build: scorePanel }]);
    const list = el("div", { role: "tablist", class: "pp-tabs", "aria-label": "Past-paper practice" });
    const panels = el("div");
    const btns = [], pans = [];
    const show = (i, focus) => {
      btns.forEach((b, k) => { b.setAttribute("aria-selected", k === i ? "true" : "false"); b.tabIndex = k === i ? 0 : -1; });
      pans.forEach((p, k) => { p.hidden = k !== i; });
      if (focus) btns[i].focus();
      if (HM.markScrollables) setTimeout(HM.markScrollables, 50);
      try { history.replaceState(null, "", "#" + tabs[i].id); } catch (e) { /* ignore */ }
    };
    tabs.forEach((t, i) => {
      const b = el("button", { role: "tab", type: "button", id: "pp-tab-" + t.id, "aria-controls": "pp-panel-" + t.id, "aria-selected": "false", tabindex: "-1" }, t.label);
      b.addEventListener("click", () => show(i));
      b.addEventListener("keydown", (e) => {
        let n = null;
        if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft") n = (i + tabs.length - 1) % tabs.length;
        if (e.key === "Home") n = 0;
        if (e.key === "End") n = tabs.length - 1;
        if (n != null) { e.preventDefault(); show(n, true); }
      });
      list.append(b); btns.push(b);
      const p = el("div", { role: "tabpanel", id: "pp-panel-" + t.id, "aria-labelledby": "pp-tab-" + t.id, class: "pp-panel", hidden: true, tabindex: "0" });
      p.append(t.build());   // built up front: the mock clock is wired by common.js on DOMContentLoaded
      panels.append(p); pans.push(p);
    });
    host.append(list, panels);
    const want = tabs.findIndex((t) => "#" + t.id === location.hash);
    show(want >= 0 ? want : 0);
    window.addEventListener("hashchange", () => { const k = tabs.findIndex((t) => "#" + t.id === location.hash); if (k >= 0) show(k); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
