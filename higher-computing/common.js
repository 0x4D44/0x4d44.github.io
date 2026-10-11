/* Blocks, Wings & Broadsides — shared engine for every deck.
   - theme toggle, table of contents, code tabs
   - pre-flight checks (quizzes) rendered from window.HC_QUIZ (quiz.js)
   - cadet rank progression stored in localStorage (best effort)
   - small helpers other scripts use via window.HC */
(function () {
  "use strict";

  const HC = (window.HC = window.HC || {});
  const motionMQ = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  HC.reduced = !!(motionMQ && motionMQ.matches);
  if (motionMQ && motionMQ.addEventListener) motionMQ.addEventListener("change", (e) => { HC.reduced = e.matches; });

  HC.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  };
  HC.svg = function (tag, attrs, ...kids) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) {
      if (k === "text") e.textContent = v; else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid) e.append(kid);
    return e;
  };
  HC.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  HC.sleep = (ms) => new Promise((r) => setTimeout(r, HC.reduced ? Math.min(ms, 30) : ms));

  /* ---------- storage (never trusted to exist) ---------- */
  const KEY = "hc-higher.v1";
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: progress lives for this visit only */ }
  }
  let state = load();
  state.checks = state.checks || {};
  HC.state = state;

  /* ---------- theme ---------- */
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme(state.theme);
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector(".theme-btn");
    if (!btn) return;
    const label = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
      // the visible words are the accessible name; the pressed state says which theme is on
      btn.textContent = "☾ Night watch";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.title = dark ? "Dark theme on: press for the light theme" : "Press for the dark theme";
      return dark;
    };
    label();
    btn.addEventListener("click", () => {
      const dark = label();
      state.theme = dark ? "light" : "dark";
      applyTheme(state.theme); save(state); label();
      document.dispatchEvent(new CustomEvent("hc-theme"));
    });
  });

  /* ---------- ranks ---------- */
  // RAF Air Cadet cadet ranks, earned by passing pre-flight checks across the site.
  HC.RANKS = [
    { name: "Cadet", need: 0, chev: 0 },
    { name: "Cadet Corporal", need: 0.2, chev: 2 },
    { name: "Cadet Sergeant", need: 0.45, chev: 3 },
    { name: "Cadet Flight Sergeant", need: 0.7, chev: 3, crown: true },
    { name: "Cadet Warrant Officer", need: 1, wo: true },
  ];
  HC.rankBadge = function (r) {
    // a little pixel-art sleeve badge: navy cloth, gold chevrons
    const g = [];
    g.push(`<rect x="2" y="2" width="60" height="60" rx="4" fill="#1c3b66" stroke="#0b1730" stroke-width="3"/>`);
    if (r.wo) {
      g.push(`<circle cx="32" cy="34" r="17" fill="none" stroke="#e0b23a" stroke-width="4" stroke-dasharray="4 3"/>`);
      g.push(`<path d="M22 30 L26 22 L32 28 L38 22 L42 30 L42 38 L22 38 Z" fill="#e0b23a"/>`);
    } else {
      if (r.crown) g.push(`<path d="M24 16 L27 9 L32 14 L37 9 L40 16 L40 21 L24 21 Z" fill="#e0b23a"/>`);
      for (let i = 0; i < r.chev; i++) {
        const y = 26 + i * 9 - (r.chev === 2 ? -4 : 0);
        g.push(`<path d="M12 ${y} L32 ${y + 10} L52 ${y} L52 ${y + 5} L32 ${y + 15} L12 ${y + 5} Z" fill="#e0b23a"/>`);
      }
      if (!r.chev && !r.crown) {
        // plain cadet: the "ATC" eagle reduced to a block bird
        g.push(`<path d="M14 32 L26 28 L32 22 L38 28 L50 32 L38 34 L34 42 L30 42 L26 34 Z" fill="#cfd6e6"/>`);
      }
    }
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${g.join("")}</svg>`;
  };
  // Pupils study ONE option (Database or Web), so only the option with more
  // progress counts towards rank; the other is a bonus that never holds you back.
  const isD = (id) => id.startsWith("ddd-") || id === "exam-mock-ddd";
  const isW = (id) => id.startsWith("wdd-") || id === "exam-mock-wdd";
  function allCheckIds() {
    const all = Object.keys(window.HC_QUIZ || {});
    const passed = (id) => state.checks[id] && state.checks[id].passed;
    const d = all.filter((id) => isD(id) && passed(id)).length, w = all.filter((id) => isW(id) && passed(id)).length;
    const dropW = d >= w;
    return all.filter((id) => (dropW ? !isW(id) : !isD(id)));
  }
  HC.progress = function () {
    const ids = allCheckIds();
    const done = ids.filter((id) => state.checks[id] && state.checks[id].passed).length;
    const frac = ids.length ? done / ids.length : 0;
    let rank = HC.RANKS[0];
    for (const r of HC.RANKS) if (frac + 1e-9 >= r.need) rank = r;
    const next = HC.RANKS[HC.RANKS.indexOf(rank) + 1];
    const needNext = next ? Math.ceil(next.need * ids.length) - done : 0;
    return { done, total: ids.length, frac, rank, next, needNext };
  };
  function paintRank() {
    const p = HC.progress();
    document.querySelectorAll(".rank-chip").forEach((chip) => {
      chip.innerHTML = `${HC.rankBadge(p.rank)}<span class="rank-label"><strong>${p.rank.name}</strong><br>${p.done}/${p.total} checks</span>`;
      chip.setAttribute("aria-label", `Your rank: ${p.rank.name}. ${p.done} of ${p.total} pre-flight checks passed. View rank ladder.`);
    });
    document.querySelectorAll("[data-rank-ladder]").forEach((box) => {
      box.innerHTML = HC.RANKS.map((r) => {
        const got = p.frac + 1e-9 >= r.need;
        const need = Math.ceil(r.need * p.total);
        return `<div class="rank-card${got ? " got" : ""}">${HC.rankBadge(r)}<strong>${r.name}</strong>${need ? need + " checks" : "Day one"}${got ? " · <span class=\"ok\">held</span>" : ""}</div>`;
      }).join("");
    });
    document.querySelectorAll("[data-progress-text]").forEach((t) => {
      t.textContent = p.next
        ? `You hold the rank of ${p.rank.name}: ${p.done} of ${p.total} pre-flight checks passed. ${p.needNext} more to make ${p.next.name}.`
        : `You are a ${p.rank.name}: all ${p.total} pre-flight checks passed. The squadron salutes you.`;
    });
    document.querySelectorAll(".toc a[data-check-for]").forEach((a) => {
      const id = a.getAttribute("data-check-for");
      let tick = a.querySelector(".done");
      if (state.checks[id] && state.checks[id].passed) {
        if (!tick) { tick = HC.el("span", { class: "done", "aria-label": "check passed" }, "✔"); a.append(tick); }
      } else if (tick) tick.remove();
    });
  }
  HC.paintRank = paintRank;

  // one persistent, initially empty status region, so screen readers announce each message
  let toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = HC.el("div", { role: "status", class: "hc-toast" }); document.body.append(toastEl); }
    toastEl.textContent = "";
    clearTimeout(toastTimer);
    setTimeout(() => { toastEl.textContent = msg; }, 50);
    toastTimer = setTimeout(() => { toastEl.textContent = ""; }, 4500);
  }
  HC.toast = toast;

  /* ---------- pre-flight checks ---------- */
  function renderCheck(box) {
    const id = box.getAttribute("data-check");
    const bank = (window.HC_QUIZ || {})[id];
    if (!bank) return;
    const qs = bank.questions;
    const answered = new Map();
    const markTally = new Map();
    const head = HC.el("div", { class: "check-head" }, "✈ Pre-flight check: " + bank.title, HC.el("span", { class: "score" }));
    box.append(head);
    const intro = HC.el("p", { class: "hint", style: "margin:4px 0 0;font-size:.88rem;color:var(--muted)" },
      "Answer every question to log this check. For open questions, write your answer first, then reveal the marking guidance and give yourself the marks you earned. An open question counts as correct if you earn at least half its marks. Be honest: it's your logbook.");
    box.append(intro);
    const score = head.querySelector(".score");
    const update = () => {
      const right = [...answered.values()].filter(Boolean).length;
      const mk = [...markTally.values()].reduce((a, [k, n]) => [a[0] + k, a[1] + n], [0, 0]);
      score.textContent = `${answered.size}/${qs.length} answered · ${right} correct` + (mk[1] ? ` · ${mk[0]}/${mk[1]} marks on open questions` : "");
      if (answered.size === qs.length) {
        const passed = right >= Math.ceil(qs.length * 0.6);
        const before = HC.progress().rank.name;
        const prev = state.checks[id];
        state.checks[id] = { passed: passed || !!(prev && prev.passed), best: Math.max(right, prev ? prev.best || 0 : 0), of: qs.length };
        save(state);
        paintRank();
        const after = HC.progress().rank.name;
        if (after !== before) toast(`Promotion! You are now ${after}.`);
        else if (passed) toast(`Check logged: ${right}/${qs.length}. Carry on, Cadet.`);
        else toast(`${right}/${qs.length} — you need ${Math.ceil(qs.length * 0.6)} to log this check. Re-read and try again.`);
        if (!passed) retry.hidden = false;
      }
    };
    const retry = HC.el("button", { class: "btn small", type: "button", hidden: true }, "↺ Try this check again");
    retry.addEventListener("click", () => { box.innerHTML = ""; renderCheck(box); const f = box.querySelector(".q-opt, textarea"); if (f) f.focus(); });

    qs.forEach((q, qi) => {
      const wrap = HC.el("div", { class: "q" });
      const stem = HC.el("p", { class: "q-stem", html: `${qi + 1}. ${q.q}` + (q.marks ? ` <span class="q-marks">(${q.marks} mark${q.marks > 1 ? "s" : ""})</span>` : "") });
      wrap.append(stem);
      if (q.code) wrap.append(HC.el("pre", { text: q.code }));
      const fb = HC.el("div", { class: "q-feedback", "aria-live": "polite" });
      if (q.type === "open") {
        const ta = HC.el("textarea", { "aria-label": "Your answer to question " + (qi + 1), placeholder: "Write your answer here, then reveal the marking guidance…" });
        const reveal = HC.el("button", { class: "btn small", type: "button" }, "Reveal marking guidance");
        const model = HC.el("div", { class: "callout model model-answer", hidden: true, html: `<div class="callout-title">Marking guidance</div>${q.model}` });
        // self-marking: one button per possible mark, so partial credit is practised
        const n = q.marks || 1;
        const self = HC.el("div", { class: "selfmark", hidden: true }, n > 1 ? `How many of the ${n} marks did your answer earn?` : "Did your answer earn the mark?");
        const btns = [];
        for (let k = 0; k <= n; k++) {
          const b = HC.el("button", { class: "btn small" + (k === n ? " primary" : ""), type: "button" }, n > 1 ? `${k}/${n}` : k ? "Yes" : "No");
          b.addEventListener("click", () => mark(k));
          btns.push(b); self.append(b);
        }
        reveal.addEventListener("click", () => { model.hidden = false; self.hidden = false; reveal.disabled = true; });
        const mark = (k) => {
          const ok = k >= Math.ceil(n / 2);
          answered.set(qi, ok); markTally.set(qi, [k, n]);
          btns.forEach((b) => (b.disabled = true));
          fb.innerHTML = (ok ? "<span class='ok'>" : "<span class='bad'>") + `Logged: ${k}/${n}.</span>` + (k < n ? " Compare your answer with each marking point to see which you missed." : "");
          update();
        };
        wrap.append(ta, HC.el("div", { class: "btn-row" }, reveal), model, self, fb);
      } else {
        const opts = HC.el("div", { class: "q-opts", role: "group", "aria-label": "Options for question " + (qi + 1) });
        q.opts.forEach((o, oi) => {
          const b = HC.el("button", { class: "q-opt", type: "button", html: o });
          b.addEventListener("click", () => {
            if (answered.has(qi)) return;
            const ok = oi === q.a;
            // options stay focusable (aria-disabled, not disabled) so keyboard users keep their place
            opts.querySelectorAll(".q-opt").forEach((x, xi) => {
              x.setAttribute("aria-disabled", "true");
              if (xi === q.a) { x.classList.add("right"); x.insertAdjacentHTML("afterbegin", '<span class="q-mark">✔ Correct answer: </span>'); }
            });
            if (!ok) { b.classList.add("wrong"); b.insertAdjacentHTML("afterbegin", '<span class="q-mark">✘ Your answer: </span>'); }
            const right = HC.el("span", { html: q.opts[q.a] }).textContent;
            fb.innerHTML = (ok ? "<span class='ok'>Correct.</span> " : `<span class='bad'>Not this time.</span> The answer is: <b>${HC.esc(right)}</b>. `) + (q.why || "");
            answered.set(qi, ok);
            update();
          });
          opts.append(b);
        });
        wrap.append(opts, fb);
      }
      box.append(wrap);
    });
    box.append(HC.el("div", { class: "btn-row" }, retry));
    update();
    if (state.checks[id] && state.checks[id].passed) score.textContent = `Logged earlier (best ${state.checks[id].best}/${state.checks[id].of}) · ` + score.textContent;
  }

  /* ---------- table of contents ---------- */
  function buildToc() {
    const aside = document.querySelector(".toc");
    if (!aside) return;
    const secs = [...document.querySelectorAll("main section[id] > h2")];
    const ol = HC.el("ol");
    secs.forEach((h) => {
      const sec = h.parentElement;
      const check = sec.querySelector(".check[data-check]");
      const a = HC.el("a", { href: "#" + sec.id }, h.getAttribute("data-short") || h.textContent.replace(/\s*\[.*?\]\s*/g, "").trim());
      if (check) a.setAttribute("data-check-for", check.getAttribute("data-check"));
      ol.append(HC.el("li", null, a));
    });
    const wide = window.matchMedia("(min-width: 921px)");
    const det = HC.el("details", { open: wide.matches ? true : null },
      HC.el("summary", null, "☰ Chapters on this deck"), ol);
    // on wide screens the summary is hidden, so the list must never be left closed
    if (wide.addEventListener) wide.addEventListener("change", (e) => { if (e.matches) det.open = true; });
    aside.append(HC.el("h2", null, "On this deck"), det);
    if (!("IntersectionObserver" in window)) return;
    const links = new Map([...ol.querySelectorAll("a")].map((a) => [a.getAttribute("href").slice(1), a]));
    const visible = new Set();
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      links.forEach((a) => a.classList.remove("active"));
      const first = secs.map((h) => h.parentElement.id).find((id) => visible.has(id));
      if (first) links.get(first).classList.add("active");
    }, { rootMargin: "-20% 0px -70% 0px" });
    secs.forEach((h) => io.observe(h.parentElement));
  }

  /* ---------- code tabs ---------- */
  let tabSeq = 0;
  function initTabs() {
    document.querySelectorAll(".code-tabs").forEach((box) => {
      const panes = [...box.querySelectorAll(":scope > pre")];
      const list = HC.el("div", { role: "tablist", "aria-label": "Code language" });
      panes.forEach((p, i) => {
        const id = "tab" + ++tabSeq;
        p.id = id + "-panel"; p.setAttribute("role", "tabpanel"); p.setAttribute("tabindex", "0");
        const t = HC.el("button", { role: "tab", type: "button", id, "aria-controls": p.id, "aria-selected": i === 0 ? "true" : "false", tabindex: i === 0 ? "0" : "-1" }, p.getAttribute("data-lang") || "Code " + (i + 1));
        p.setAttribute("aria-labelledby", id);
        if (i) p.hidden = true;
        t.addEventListener("click", () => {
          list.querySelectorAll("[role=tab]").forEach((x) => { x.setAttribute("aria-selected", "false"); x.tabIndex = -1; });
          panes.forEach((x) => (x.hidden = true));
          t.setAttribute("aria-selected", "true"); t.tabIndex = 0; p.hidden = false;
          markScrollables();
        });
        t.addEventListener("keydown", (e) => {
          const tabs = [...list.children];
          const k = tabs.indexOf(t);
          let n = null;
          if (e.key === "ArrowRight") n = tabs[(k + 1) % tabs.length];
          if (e.key === "ArrowLeft") n = tabs[(k + tabs.length - 1) % tabs.length];
          if (e.key === "Home") n = tabs[0];
          if (e.key === "End") n = tabs[tabs.length - 1];
          if (n) { e.preventDefault(); n.focus(); n.click(); }
        });
        list.append(t);
      });
      box.prepend(list);
    });
  }

  /* ---------- click-to-sort classifier ----------
     <div class="sorter" data-bins="A|B|C"><div data-ans="A" data-why="…">statement</div>…</div> */
  function initSorters() {
    document.querySelectorAll(".sorter").forEach((box) => {
      const bins = box.getAttribute("data-bins").split("|");
      const items = [...box.querySelectorAll(":scope > [data-ans]")];
      const wrap = HC.el("div", { class: "sorter-items" });
      let right = 0, done = 0;
      const tally = HC.el("p", { class: "readout", "aria-live": "polite" });
      items.forEach((it) => {
        const card = HC.el("div", { class: "sorter-item" });
        card.append(HC.el("div", { html: it.innerHTML }));
        const btns = HC.el("div", { class: "sorter-btns", role: "group", "aria-label": "Classify" });
        const why = HC.el("div", { class: "why", "aria-live": "polite" });
        bins.forEach((b) => {
          const btn = HC.el("button", { class: "btn small", type: "button" }, b);
          btn.addEventListener("click", () => {
            const ok = b === it.getAttribute("data-ans");
            card.classList.add(ok ? "right" : "wrong");
            btns.querySelectorAll("button").forEach((x) => { x.disabled = true; if (x.textContent === it.getAttribute("data-ans")) x.classList.add("primary"); });
            why.innerHTML = (ok ? "<span class='ok'>✔ " : "<span class='bad'>✘ ") + it.getAttribute("data-ans") + ".</span> " + (it.getAttribute("data-why") || "");
            done++; if (ok) right++;
            tally.textContent = `${right} of ${done} correct` + (done === items.length ? (right === items.length ? " — flawless!" : " — check the explanations for the ones you missed.") : "");
          });
          btns.append(btn);
        });
        card.append(btns, why);
        wrap.append(card);
        it.remove();
      });
      const again = HC.el("button", { class: "btn small", type: "button" }, "↺ Try these again");
      again.addEventListener("click", () => {
        right = 0; done = 0; tally.textContent = "";
        wrap.querySelectorAll(".sorter-item").forEach((c) => { c.classList.remove("right", "wrong"); c.querySelector(".why").innerHTML = ""; c.querySelectorAll("button").forEach((b) => { b.disabled = false; b.classList.remove("primary"); }); });
      });
      box.append(wrap, tally, HC.el("div", { class: "btn-row" }, again));
    });
  }

  /* ---------- lightweight syntax colouring ----------
     Works on textContent only, so it can never inject markup. */
  const KW = {
    Python: /\b(def|return|if|elif|else|for|while|in|and|or|not|True|False|import|from|class|range|len|open|print|int|float|str|ord|chr|None)\b/g,
    Reference: /\b(DECLARE|INITIALLY|AS|SET|TO|IF|THEN|ELSE|END|WHILE|DO|REPEAT|UNTIL|TIMES|FOR|FROM|EACH|STEP|RECEIVE|SEND|DISPLAY|KEYBOARD|PROCEDURE|FUNCTION|RETURNS|RETURN|RECORD|IS|ARRAY|OF|AND|OR|NOT|MOD|OPEN|CLOSE|CREATE|INTEGER|REAL|BOOLEAN|STRING|CHARACTER|true|false)\b/g,
    SQL: /\b(SELECT|FROM|WHERE|AND|OR|NOT|ORDER|BY|GROUP|AS|ASC|DESC|LIKE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|COUNT|SUM|AVG|MIN|MAX|ROUND)\b/gi,
    JavaScript: /\b(function|var|let|const|return|if|else|document|getElementById|style|this)\b/g,
  };
  HC.highlight = function (pre) {
    const lang = pre.getAttribute("data-lang");
    const kw = KW[lang];
    if (!kw || pre.dataset.hl) return;
    pre.dataset.hl = "1";
    const comment = lang === "Python" || lang === "Reference" ? "#" : lang === "SQL" ? "--" : "//";
    const out = pre.textContent.split("\n").map((line) => {
      let code = line, note = "";
      // find a comment start that is not inside a string
      let inS = null;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inS) { if (c === inS) inS = null; continue; }
        if (c === '"' || c === "'") { inS = c; continue; }
        if (line.startsWith(comment, i)) { code = line.slice(0, i); note = line.slice(i); break; }
      }
      const parts = code.split(/("[^"]*"|'[^']*')/);
      const escT = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = parts.map((p, i) => i % 2 ? `<span class="s">${escT(p)}</span>` :
        escT(p).replace(kw, '<span class="k">$1</span>').replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="n">$1</span>')).join("");
      return html + (note ? `<span class="c">${escT(note)}</span>` : "");
    });
    pre.innerHTML = out.join("\n");
  };

  /* ---------- generic code stepper ----------
     HC.stepper(box, { code: [..lines], steps: [{ line, note, state: html }], lang })
     line is 1-based (0 = nothing highlighted). */
  HC.stepper = function (box, cfg) {
    const pre = HC.el("pre", { class: "stepper-code", "aria-hidden": "true" });
    const state = HC.el("div", { class: "stepper-state" });
    const note = HC.el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = HC.el("button", { class: "btn small", type: "button" }, "◀ Back");
    const step = HC.el("button", { class: "btn small primary", type: "button" }, "Step ▶");
    const play = HC.el("button", { class: "btn small", type: "button" }, "▶ Auto-play");
    const reset = HC.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    const count = HC.el("span", { class: "hint", style: "margin:0" });
    const grid = HC.el("div", { class: "stepper-grid" }, pre, state);
    box.append(HC.el("div", { class: "btn-row" }, back, step, play, reset, count), note, grid);
    let i = 0, timer = null;
    const lines = cfg.code;
    const sr = HC.el("pre", { class: "sr-only" }, lines.join("\n"));
    box.append(sr);
    function render() {
      const s = cfg.steps[i];
      pre.innerHTML = lines.map((l, k) => `<span class="ln">${String(k + 1).padStart(2, " ")}</span> ${k + 1 === s.line ? `<span class="hl">${HC.esc(l) || " "}</span>` : HC.esc(l)}`).join("\n");
      state.innerHTML = s.state || "";
      note.innerHTML = s.note || "";
      count.textContent = `Step ${i + 1} of ${cfg.steps.length}`;
      back.disabled = i === 0;
      step.disabled = i === cfg.steps.length - 1;
      const hl = pre.querySelector(".hl");
      if (hl && pre.scrollHeight > pre.clientHeight) pre.scrollTop = hl.offsetTop - pre.clientHeight / 2;
    }
    function stop() { clearInterval(timer); timer = null; play.textContent = "▶ Auto-play"; }
    back.addEventListener("click", () => { stop(); if (i > 0) i--; render(); });
    step.addEventListener("click", () => { stop(); if (i < cfg.steps.length - 1) i++; render(); });
    reset.addEventListener("click", () => { stop(); i = 0; render(); });
    play.addEventListener("click", () => {
      if (timer) return stop();
      if (i >= cfg.steps.length - 1) i = 0;
      play.textContent = "❚❚ Pause";
      timer = setInterval(() => { if (i < cfg.steps.length - 1) { i++; render(); } else stop(); }, cfg.speed || 1400);
      render();
    });
    render();
  };


  /* ---------- scrollable regions: keyboard-reachable, with an edge cue ---------- */
  function markScrollables() {
    document.querySelectorAll(".table-wrap, .diagram-scroll, pre, .crypto-stage, .dbg-trace, .sql-out").forEach((el) => {
      const over = el.scrollWidth - el.clientWidth > 2;
      el.classList.toggle("is-scrollable", over);
      if (over) {
        if (!el.hasAttribute("tabindex")) { el.setAttribute("tabindex", "0"); el.dataset.hcTab = "1"; }
        if (!el.getAttribute("role") && !el.getAttribute("aria-label")) {
          const cap = el.closest("figure") && el.closest("figure").querySelector("figcaption");
          const tcap = el.querySelector("caption");
          el.setAttribute("role", "region");
          el.setAttribute("aria-label", "Scrollable: " + ((tcap || cap) ? (tcap || cap).textContent.trim().slice(0, 80) : el.tagName === "PRE" ? "code" : "content"));
        }
        if (!el.dataset.hcScroll) {
          el.dataset.hcScroll = "1";
          el.addEventListener("scroll", () => el.classList.toggle("at-end", el.scrollLeft + el.clientWidth >= el.scrollWidth - 4), { passive: true });
        }
      } else if (el.dataset.hcTab) { el.removeAttribute("tabindex"); delete el.dataset.hcTab; }
    });
  }
  HC.markScrollables = markScrollables;
  let rsT = 0;
  window.addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(markScrollables, 200); });

  /* ---------- keep keyboard focus when a widget disables or rebuilds the button just pressed ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("button");
    if (!btn) return;
    const scope = btn.closest(".widget, .check, .btn-row") || document.body;
    const label = btn.getAttribute("aria-label") || btn.textContent;
    const row = btn.closest(".btn-row");
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body) return;
      let target = null;
      if (!btn.isConnected) target = [...scope.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent) === label);
      else if (btn.disabled) target = row && [...row.querySelectorAll("button:not([disabled])")][0];
      if (target) target.focus();
    }, 0);
  }, true);
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("pre[data-lang]").forEach(HC.highlight);
    buildToc();
    initTabs();
    initSorters();
    document.querySelectorAll(".check[data-check]").forEach(renderCheck);
    paintRank();
    setTimeout(markScrollables, 300);
    window.addEventListener("load", () => setTimeout(markScrollables, 300));
    // the nav bar marks the current deck
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("nav.decks a").forEach((a) => {
      if (a.getAttribute("href") === here || (here === "" && a.getAttribute("href") === "index.html")) a.setAttribute("aria-current", "page");
    });
  });
})();
