/* Past-paper practice: the interactive answer panel.
   Renders the question banks (papers-*.js) into tabs, marks every answer with the auto-marker
   in papers-engine.js, and keeps a scoreboard in localStorage (this device only). */
(function () {
  "use strict";
  const HE = window.HE, HEP = window.HEP;
  if (!HE || !HEP) return;
  const el = HE.el;
  const BANK = window.HEP_BANK || {};
  const KEY = "he-papers.v1";
  const AREAS = HEP.AREAS;

  /* results[qid] = [marks earned per part, or null while unmarked] */
  let results = {};
  try { results = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { results = {}; }
  const AKEY = "he-papers-ans.v1";
  let answers = {};
  try { answers = JSON.parse(localStorage.getItem(AKEY) || "{}") || {}; } catch (e) { answers = {}; }
  const saveAns = () => { try { localStorage.setItem(AKEY, JSON.stringify(answers)); } catch (e) { /* this visit only */ } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(results)); } catch (e) { /* private mode: this visit only */ } };

  const qMarks = HEP.partsMarks;
  const allQs = () => AREAS.flatMap((a) => ((BANK[a.id] && BANK[a.id].questions) || []).map((q) => Object.assign({ area: a.id }, q)));
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---- totals ---- */
  function areaTotals(areaId) {
    const qs = (BANK[areaId] && BANK[areaId].questions) || [];
    let got = 0, of = 0, markedOf = 0, qDone = 0;
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

  /* ---- one part of a question ---- */
  function renderPart(q, part, pi, onChange, ns) {
    const id = `${ns}-${q.id}-${pi}`;
    const box = el("div", { class: "pp-part" });
    const label = part.label ? el("span", { class: "pp-plabel" }, part.label) : null;
    const pq = el("div", { class: "pp-pq", id: `${id}-q` },  label, el("span", { html: part.q }), el("span", { class: "pp-marks" }, `(${part.marks} mark${part.marks > 1 ? "s" : ""})`));
    box.append(pq);
    const input = el("div", { class: "pp-input" });
    const fb = el("div", { class: "pp-fb", "aria-live": "polite" });
    const markBtn = el("button", { class: "btn small primary", type: "button" }, "Mark my answer");
    const againBtn = el("button", { class: "btn small", type: "button", hidden: true }, "↺ Try again");
    let getAns, lock, ready, setAns;

    if (part.type === "mcq" || part.type === "multi") {
      const multi = part.type === "multi";
      const fs = el("fieldset", { class: "pp-opts", "aria-describedby": `${id}-q` }, el("legend", { class: "sr-only" }, `Options for ${part.label || "this part"}${multi ? ": choose " + part.a.length : ""}`));
      const ctrls = part.opts.map((o, oi) => {
        const c = el("input", { type: multi ? "checkbox" : "radio", name: id, value: oi, id: `${id}-o${oi}` });
        const lab = el("label", { class: "pp-opt", for: `${id}-o${oi}` }, c, el("span", { html: o }));
        fs.append(lab);
        return { c, lab };
      });
      input.append(fs);
      if (multi) fs.querySelector("legend").after(el("p", { class: "pp-hint" }, `Choose ${part.a.length}.`));
      getAns = () => (multi ? ctrls.filter((x) => x.c.checked).map((x) => +x.c.value) : (ctrls.findIndex((x) => x.c.checked)));
      ready = () => (multi ? getAns().length > 0 : getAns() >= 0);
      lock = (on) => ctrls.forEach((x) => (x.c.disabled = on));
      box._reveal = () => ctrls.forEach((x, i) => {
        const should = multi ? part.a.includes(i) : part.a === i;
        x.lab.classList.toggle("right", should);
        x.lab.classList.toggle("wrong", x.c.checked && !should);
      });
      box._clear = () => ctrls.forEach((x) => { x.c.checked = false; x.lab.classList.remove("right", "wrong"); });
      setAns = (a) => ctrls.forEach((x, i) => (x.c.checked = multi ? Array.isArray(a) && a.includes(i) : a === i));
      ctrls.forEach((x) => x.c.addEventListener("change", () => (markBtn.disabled = !ready())));
    } else if (part.type === "num") {
      const inp = el("input", { type: "text", inputmode: "decimal", autocomplete: "off", class: "pp-num", "aria-label": `Answer for ${part.label || "this part"}`, id: `${id}-n` });
      input.append(inp, part.unit ? el("span", { class: "pp-unit" }, part.unit) : null);
      getAns = () => inp.value;
      ready = () => inp.value.trim() !== "";
      lock = (on) => (inp.disabled = on);
      box._clear = () => (inp.value = "");
      setAns = (a) => (inp.value = String(a));
      inp.addEventListener("input", () => (markBtn.disabled = !ready()));
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && ready()) { e.preventDefault(); markBtn.click(); } });
    } else if (part.type === "match") {
      const order = shuffle(part.pairs.map((_, i) => i));
      const sels = part.pairs.map((pr, i) => {
        const s = el("select", { id: `${id}-m${i}`, "aria-label": `Match: ${pr[0].replace(/<[^>]*>/g, "")}` }, el("option", { value: "-1" }, "Choose…"), order.map((j) => el("option", { value: j, html: part.pairs[j][1] })));
        input.append(el("div", { class: "pp-match" }, el("span", { class: "pp-mterm", html: pr[0] }), s));
        return s;
      });
      getAns = () => sels.map((s) => +s.value);
      ready = () => sels.every((s) => +s.value >= 0);
      lock = (on) => sels.forEach((s) => (s.disabled = on));
      box._reveal = () => sels.forEach((s, i) => {
        const bad = +s.value !== i;
        s.classList.toggle("wrong", bad);
        s.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad) s.parentElement.append(el("span", { class: "pp-wrongnote" }, "✘ not this one; the right pairs are listed below"));
      });
      box._clear = () => sels.forEach((s) => { s.value = "-1"; s.classList.remove("wrong"); s.removeAttribute("aria-invalid"); s.parentElement.querySelectorAll(".pp-wrongnote").forEach((n) => n.remove()); });
      setAns = (a) => sels.forEach((s, i) => (s.value = String(Array.isArray(a) ? a[i] : -1)));
      sels.forEach((s) => s.addEventListener("change", () => (markBtn.disabled = !ready())));
    } else {
      const rows = part.rows || Math.min(9, 2 + part.marks);
      const ta = el("textarea", { rows, id: `${id}-t`, "aria-label": `Answer for ${part.label || "this part"}`, placeholder: part.placeholder || "Write your answer here…" });
      input.append(ta);
      getAns = () => ta.value;
      ready = () => ta.value.trim().length > 0;
      lock = (on) => (ta.readOnly = on);
      box._clear = () => (ta.value = "");
      setAns = (a) => (ta.value = String(a));
      ta.addEventListener("input", () => (markBtn.disabled = !ready()));
    }
    markBtn.disabled = true;

    // answers are kept beside the marks, so a marked part comes back marked after a reload
    const akey = q.id + "." + pi;
    const setResult = (got) => { (results[q.id] = results[q.id] || q.parts.map(() => null))[pi] = got; save(); onChange(); };

    markBtn.addEventListener("click", () => {
      if (!ready()) return;
      const ans = getAns();
      answers[akey] = ans; saveAns();
      const r = HEP.scorePart(part, ans);
      lock(true);
      markBtn.hidden = true; againBtn.hidden = false;
      if (box._reveal) box._reveal();
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
        const note = el("p", { class: "pp-hint" }, "The marker looks for the key ideas and key words, so a good answer in unusual words can be missed. Tick any point you did make; untick any it gave you by mistake.");
        const ul = el("ul", { class: "pp-points" });
        const boxes = r.points.map((p, i) => {
          const cb = el("input", { type: "checkbox", id: `${id}-p${i}`, checked: p.hit ? true : null });
          ul.append(el("li", null, el("label", { for: `${id}-p${i}` }, cb, " ", el("span", { html: p.desc }), el("span", { class: "pp-pm" }, ` [${p.marks}]`))));
          return cb;
        });
        const recount = () => {
          const g = Math.min(part.marks, r.points.reduce((a, p, i) => a + (boxes[i].checked ? p.marks : 0), 0));
          paint(g); setResult(g);
        };
        // alternatives in one group: ticking one clears the others
        boxes.forEach((cb, i) => cb.addEventListener("change", () => {
          const g = r.points[i].group;
          if (g && cb.checked) boxes.forEach((o, k) => { if (k !== i && r.points[k].group === g) o.checked = false; });
          recount();
        }));
        fb.append(note, ul);
      } else if (part.type === "num") {
        fb.append(el("p", null, `Answer: `, el("b", null, `${part.a}${part.unit ? " " + part.unit : ""}`), part.tol ? ` (within ±${part.tol})` : ""));
        // the marker reads the last number you typed; if your answer was right in other words or units, say so
        const eq = el("input", { type: "checkbox", id: `${id}-eq`, checked: r.got === part.marks ? true : null });
        eq.addEventListener("change", () => { const g = eq.checked ? part.marks : 0; paint(g); setResult(g); });
        fb.append(el("p", { class: "pp-hint" }, el("label", { for: `${id}-eq` }, eq, " My answer was right (for example in other units or different wording)")));
      } else if (part.type === "match") {
        fb.append(el("ul", { class: "pp-points" }, part.pairs.map((pr) => el("li", { html: `<b>${pr[0]}</b>: ${pr[1]}` }))));
      }
      const why = part.why || part.model;
      if (why) fb.append(el("div", { class: "callout model pp-model" }, el("div", { class: "callout-title" }, part.type === "text" ? "Model answer and marking guidance" : "Why"), el("div", { html: why })));
      if (HE.math) HE.math(fb);
      setResult(r.got);
      head.focus({ preventScroll: true });
    });
    againBtn.addEventListener("click", () => {
      lock(false); box._clear(); fb.textContent = "";
      markBtn.hidden = false; markBtn.disabled = true; againBtn.hidden = true;
      if (results[q.id]) { results[q.id][pi] = null; if (results[q.id].every((x) => x == null)) delete results[q.id]; save(); }
      onChange();
      const f = input.querySelector("input,textarea,select"); if (f) f.focus();
    });
    box.append(input, el("div", { class: "btn-row" }, markBtn, againBtn), fb);
    // restore: put the stored answer back and mark it; a mark the candidate corrected by hand is re-applied by ticking points to match
    const had = (results[q.id] || [])[pi];
    if (had != null && answers[akey] != null) {
      setAns(answers[akey]); markBtn.disabled = false; markBtn.click();
      const h = fb.querySelector(".pp-score"); if (h) h.blur();
      if (HEP.scorePart(part, answers[akey]).got !== had) {
        const boxes = [...fb.querySelectorAll('input[type="checkbox"]')];
        if (part.type === "text") {
          let sum = 0;
          const marks = boxes.map((b, i) => (part.points[i] && part.points[i].marks != null ? part.points[i].marks : 1));
          boxes.forEach((b, i) => { b.checked = sum + marks[i] <= had; if (b.checked) sum += marks[i]; });
          if (boxes.length) boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
        } else if (boxes.length) {
          boxes[0].checked = had >= part.marks;
          boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    return box;
  }

  /* A figure's own ids (hatch patterns, markers) are made unique per panel, so the mock paper can show
     a question that an area tab also holds without two elements sharing an id. */
  function scopeIds(svg, ns) {
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    return ids.reduce((out, id) => out
      .split(`id="${id}"`).join(`id="${ns}-${id}"`)
      .split(`url(#${id})`).join(`url(#${ns}-${id})`)
      .split(`href="#${id}"`).join(`href="#${ns}-${id}"`), svg);
  }

  /* ---- a whole question ---- */
  function renderQuestion(q, areaId, n, ns) {
    const area = AREAS.find((a) => a.id === areaId);
    const total = qMarks(q);
    const badge = el("span", { class: "pp-badge" });
    const card = el("article", { class: "pp-q", id: `${ns}-${q.id}`, "aria-labelledby": `${ns}-${q.id}-h` },
      el("header", { class: "pp-qhead" },
        el("h3", { id: `${ns}-${q.id}-h` }, `Question ${n}`, el("span", { class: "pp-qtag" }, ` · ${area.short} · ${total} marks`)),
        badge),
      q.style ? el("p", { class: "pp-style" }, q.style) : null,
      el("div", { class: "pp-stem", html: q.stem }));
    if (q.figure) {
      const fig = el("figure", { class: "diagram diagram-scroll pp-fig", role: "group", "aria-label": "Figure for question " + n, html: scopeIds(q.figure, ns + "-" + q.id) });
      card.append(fig);
      // only a figure that really scrolls sideways needs to be a keyboard tab stop
      const fit = () => {
        const wide = fig.scrollWidth > fig.clientWidth + 1;
        if (wide) fig.setAttribute("tabindex", "0"); else fig.removeAttribute("tabindex");
      };
      requestAnimationFrame(fit);
      // a figure in a hidden tab has no width yet; the observer fires when its tab opens or the window changes
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
    q.parts.forEach((p, pi) => card.append(renderPart(q, p, pi, () => { paint(); window.dispatchEvent(new Event("hep-change")); }, ns)));
    paint();
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
    window.addEventListener("hep-change", paint);
    panel.append(el("p", { class: "pp-intro", html: bank.intro || "" }), sum);
    bank.questions.forEach((q, i) => panel.append(renderQuestion(q, a.id, i + 1, a.id)));
    paint();
    return panel;
  }

  /* ---- mock paper ---- */
  const MOCK_TARGET = { systems: 7, analogue: 14, digital: 10, mechanisms: 9, structures: 15 };
  function drawMock() {
    // draw until the paper lands on 54-56 marks, in roughly the real proportions
    let best = null, bestGap = 1e9;
    for (let n = 0; n < 300; n++) {
      const picked = [];
      let total = 0;
      AREAS.forEach((a) => {
        let sum = 0;
        // questions not yet marked come first, so a new paper is mostly fresh
        const untouched = (q) => !(results[q.id] || []).some((x) => x != null);
        shuffle(((BANK[a.id] && BANK[a.id].questions) || []).slice()).sort((x, y) => untouched(y) - untouched(x)).forEach((q) => {
          const m = qMarks(q);
          if (sum + m <= MOCK_TARGET[a.id] + 1 && sum < MOCK_TARGET[a.id]) { picked.push({ q, a: a.id }); sum += m; }
        });
        total += sum;
      });
      const gap = Math.abs(total - 55);
      if (gap < bestGap) { best = picked; bestGap = gap; }
      if (gap === 0) break;
    }
    return best || [];
  }
  function mockPanel() {
    const panel = el("div");
    panel.append(el("p", { class: "pp-intro", html: "A half-length mixed paper, drawn at random from the five banks in roughly the proportions of the real paper: about 7 marks of systems and energy, 14 of analogue electronics, 10 of digital, 9 of drives and pneumatics and 15 of structures and materials, each inside half of the specification range for its area. At the real pace of 1.36 minutes a mark, 55 marks is <b>75 minutes</b>. Start the clock, answer on paper if you want a true rehearsal, then enter and mark your answers, with the Data Booklet open beside you. Marks from the mock also count on the scoreboard." }));
    panel.append(el("div", { class: "exam-timer", "data-minutes": "75", "data-label": "Mock clock" }));
    const out = el("div");
    const total = el("p", { class: "pp-sum", "aria-live": "polite" });
    const draw = el("button", { class: "btn", type: "button" }, "🎲 Draw a new mock paper");
    let cur = [];
    const paint = () => {
      const of = cur.reduce((a, x) => a + qMarks(x.q), 0);
      let got = 0, mof = 0;
      cur.forEach((x) => (x.q.parts.forEach((p, i) => { const r = (results[x.q.id] || [])[i]; if (r != null) { got += r; mof += p.marks; } })));
      total.textContent = `This paper: ${of} marks` + (mof ? ` · ${fmt(got)} / ${mof} marked so far (${pct(got, mof)}%)` : "");
    };
    const build = () => {
      out.textContent = "";
      cur = drawMock();
      cur.forEach((x, i) => out.append(renderQuestion(x.q, x.a, i + 1, "mock")));
      if (HE.math) HE.math(out);
      paint();
    };
    draw.addEventListener("click", build);
    window.addEventListener("hep-change", paint);
    panel.append(el("div", { class: "btn-row" }, draw), total, out);
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
      const rows = AREAS.map((a) => {
        const t = areaTotals(a.id);
        G += t.got; M += t.markedOf;
        return { a, t };
      });
      const tbl = el("div", { class: "table-wrap" }, el("table", null,
        el("thead", null, el("tr", null, ["Area", "Questions marked", "Marks earned", "Share"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", null, rows.map(({ a, t }) => el("tr", null,
          el("th", { scope: "row" }, a.name),
          el("td", null, `${t.qDone} / ${t.qs}`),
          el("td", null, t.markedOf ? `${fmt(t.got)} / ${t.markedOf}` : "—"),
          el("td", null, t.markedOf ? el("span", { class: "pp-bar", role: "img", "aria-label": pct(t.got, t.markedOf) + " per cent" }, el("i", { style: `width:${pct(t.got, t.markedOf)}%` }), el("b", null, pct(t.got, t.markedOf) + "%")) : "—"))))));
      body.append(tbl);
      const p = pct(G, M);
      let verdict = "Mark some questions in the area tabs and your results will gather here.";
      if (M) {
        const band = HEP.GRADES.find((g) => G / M >= g[1]);
        verdict = `Overall you have earned ${fmt(G)} of the ${M} marks you have attempted: ${p}%. ` +
          (band ? `In 2026 a grade ${band[0]} needed ${Math.round(band[1] * 100)}% of the 160-mark course (question paper and assignment together), so this is at or above that percentage. Your real grade comes from one total of 160 marks, with the 50-mark assignment included, so this is not a predicted grade.` : "That is below the 2026 grade-D percentage (47.5%).") +
          " Treat it as a rough guide only: practice questions are not the real paper, you may have chosen the easy ones, and your grade also depends on the 50-mark assignment and the real Data Booklet.";
      }
      body.append(el("p", { class: "pp-verdict" }, verdict));
      const weakest = rows.filter((r) => r.t.markedOf >= 4).sort((x, y) => x.t.got / x.t.markedOf - y.t.got / y.t.markedOf)[0];
      if (weakest) body.append(el("p", null, "Weakest area so far: ", el("b", null, weakest.a.name), ` (${pct(weakest.t.got, weakest.t.markedOf)}%). Go back to that tab and try again after revising the matching deck.`));
    };
    window.addEventListener("hep-change", paint);
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
    const sig = () => JSON.stringify([results, answers]);
    const built = [];
    const show = (i, focus) => {
      // marks given on the mock tab must show on the area tab: rebuild an area panel whose data has moved on
      if (i < AREAS.length && built[i] !== sig() && pans[i]) { pans[i].textContent = ""; pans[i].append(tabs[i].build()); if (HE.math) HE.math(pans[i]); built[i] = sig(); }
      btns.forEach((b, k) => { b.setAttribute("aria-selected", k === i ? "true" : "false"); b.tabIndex = k === i ? 0 : -1; });
      pans.forEach((p, k) => {
        p.hidden = k !== i;
      });
      if (focus) btns[i].focus();
      if (HE.markScrollables) setTimeout(HE.markScrollables, 50);
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
      p.append(t.build()); if (HE.math) HE.math(p);   // built up front: the mock paper's clock is wired by common.js on DOMContentLoaded
      panels.append(p); pans.push(p); built.push(sig());
    });
    host.append(list, panels);
    const want = tabs.findIndex((t) => "#" + t.id === location.hash);
    show(want >= 0 ? want : 0);
    window.addEventListener("hashchange", () => { const k = tabs.findIndex((t) => "#" + t.id === location.hash); if (k >= 0) show(k); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
