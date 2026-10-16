/* Rivets, Relays & Rigging — shared engine for every deck.
   Adapted from the sibling sites "Chart, Compass & Calculus" (Higher Maths), "Shot, Spark & Starlight"
   (Higher Physics) and "Blocks, Wings & Broadsides" (Higher Computing).
   - theme toggle, table of contents, tabs, click-to-sort games
   - pre-flight checks (quizzes) rendered from window.HE_QUIZ (quiz.js)
   - cadet rank progression stored in localStorage (best effort)
   - KaTeX typesetting of $…$ and $$…$$ (vendor/katex, self-hosted)
   - helpers the widgets share: HE.sim (canvas loop), HE.slider, HE.plot (graph axes) */
(function () {
  "use strict";

  const HE = (window.HE = window.HE || {});
  const motionMQ = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  HE.reduced = !!(motionMQ && motionMQ.matches);
  if (motionMQ && motionMQ.addEventListener) motionMQ.addEventListener("change", (e) => { HE.reduced = e.matches; });

  HE.el = function (tag, attrs, ...kids) {
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
  HE.svg = function (tag, attrs, ...kids) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) {
      if (k === "text") e.textContent = v; else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid) e.append(kid);
    return e;
  };
  /* A live-region readout that animations rewrite every frame: only touch the DOM when the
     value really changes, so screen readers are not handed the same text sixty times a second. */
  HE.quiet = function (e) {
    for (const p of ["textContent", "innerHTML"]) {
      const d = Object.getOwnPropertyDescriptor(p === "textContent" ? Node.prototype : Element.prototype, p);
      let last = null;
      Object.defineProperty(e, p, { configurable: true, get() { return d.get.call(e); }, set(v) { v = String(v); if (v === last) return; last = v; d.set.call(e, v); e._hmRestate = () => d.set.call(e, v); settle(e); } });
    }
    return e;
  };
  /* While an animation rewrites a live region every frame, silence it; once the values
     have been still for 600 ms, switch it back on and re-state them once. */
  function settle(e) {
    const r = e.closest("[aria-live]");
    if (!r) return;
    const now = performance.now();
    if (r._hmLast && now - r._hmLast < 400) r.setAttribute("aria-live", "off");
    r._hmLast = now;
    r._hmEls = r._hmEls || [];
    if (!r._hmEls.includes(e)) r._hmEls.push(e);
    clearTimeout(r._hmT);
    r._hmT = setTimeout(() => {
      if (r.getAttribute("aria-live") !== "off") return;
      r.setAttribute("aria-live", "polite");
      (r._hmEls || []).forEach((x) => x._hmRestate && x._hmRestate()); // re-announce the settled values in place
      r._hmEls = [];
    }, 600);
  }
  /* plain-text terms for screen readers: HE.terms([[2, "x²"], [-1, "x"], [0, ""]]) is "2x² − x" */
  HE.terms = function (ts) {
    let out = "";
    ts.forEach(([c, v]) => {
      if (Math.abs(c) < 1e-12) return;
      const m = Math.abs(c), mag = v && Math.abs(m - 1) < 1e-12 ? "" : HE.n(m, 3).replace("−", "");
      out += out ? (c < 0 ? " − " : " + ") + mag + v : (c < 0 ? "−" : "") + mag + v;
    });
    return out || "0";
  };
  HE.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* typeset $…$ and $$…$$ inside el with the self-hosted KaTeX (a no-op if it failed to load) */
  HE.math = function (el) {
    if (!el || typeof window.renderMathInElement !== "function") return el;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
        throwOnError: false, strict: "ignore",
      });
    } catch (e) { console.error("KaTeX", e); }
    return el;
  };
  /* KaTeX straight to an HTML string (for widget readouts) */
  HE.tex = function (src, display) {
    if (!window.katex) return HE.esc(src);
    try { return window.katex.renderToString(src, { displayMode: !!display, throwOnError: false, strict: "ignore" }); } catch (e) { return HE.esc(src); }
  };
  HE.sleep = (ms) => new Promise((r) => setTimeout(r, HE.reduced ? Math.min(ms, 30) : ms));

  /* ---------- storage (never trusted to exist) ---------- */
  const KEY = "he-higher.v1";
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: progress lives for this visit only */ }
  }
  let state = load();
  state.checks = state.checks || {};
  HE.state = state;

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
      document.dispatchEvent(new CustomEvent("he-theme"));
    });
  });

  /* ---------- ranks ---------- */
  // RAF Air Cadet cadet ranks, earned by passing pre-flight checks across the site.
  HE.RANKS = [
    { name: "Cadet", need: 0, chev: 0 },
    { name: "Cadet Corporal", need: 0.2, chev: 2 },
    { name: "Cadet Sergeant", need: 0.45, chev: 3 },
    { name: "Cadet Flight Sergeant", need: 0.7, chev: 3, crown: true },
    { name: "Cadet Warrant Officer", need: 1, wo: true },
  ];
  HE.rankBadge = function (r) {
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
  // every pre-flight check on the site counts towards rank (Physics has no options)
  function allCheckIds() { return Object.keys(window.HE_QUIZ || {}); }
  HE.progress = function () {
    const ids = allCheckIds();
    const done = ids.filter((id) => state.checks[id] && state.checks[id].passed).length;
    const frac = ids.length ? done / ids.length : 0;
    let rank = HE.RANKS[0];
    for (const r of HE.RANKS) if (frac + 1e-9 >= r.need) rank = r;
    const next = HE.RANKS[HE.RANKS.indexOf(rank) + 1];
    const needNext = next ? Math.ceil(next.need * ids.length) - done : 0;
    return { done, total: ids.length, frac, rank, next, needNext };
  };
  function paintRank() {
    const p = HE.progress();
    document.querySelectorAll(".rank-chip").forEach((chip) => {
      chip.innerHTML = `${HE.rankBadge(p.rank)}<span class="rank-label"><strong>${p.rank.name}</strong><br>${p.done}/${p.total} checks</span>`;
      chip.setAttribute("aria-label", `Your rank: ${p.rank.name}. ${p.done} of ${p.total} pre-flight checks passed. View rank ladder.`);
    });
    document.querySelectorAll("[data-rank-ladder]").forEach((box) => {
      box.innerHTML = HE.RANKS.map((r) => {
        const got = p.frac + 1e-9 >= r.need;
        const need = Math.ceil(r.need * p.total);
        return `<div class="rank-card${got ? " got" : ""}">${HE.rankBadge(r)}<strong>${r.name}</strong>${need ? need + " checks" : "Day one"}${got ? " · <span class=\"ok\">held</span>" : ""}</div>`;
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
        if (!tick) { tick = HE.el("span", { class: "done", "aria-label": "check passed" }, "✔"); a.append(tick); }
      } else if (tick) tick.remove();
    });
  }
  HE.paintRank = paintRank;

  // one persistent, initially empty status region, so screen readers announce each message
  let toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = HE.el("div", { role: "status", class: "hc-toast" }); document.body.append(toastEl); }
    toastEl.textContent = "";
    clearTimeout(toastTimer);
    setTimeout(() => { toastEl.textContent = msg; }, 50);
    toastTimer = setTimeout(() => { toastEl.textContent = ""; }, 4500);
  }
  HE.toast = toast;

  /* ---------- exam timer: a countdown for the mock paper ---------- */
  function initTimer(box) {
    // deadline-based, so a throttled or backgrounded tab cannot make the clock drift
    const totalMs = +box.getAttribute("data-minutes") * 60000;
    let leftMs = totalMs, deadline = 0, tick = null;
    const face = HE.el("span", { class: "timer-face", role: "timer", "aria-live": "off" });
    const go = HE.el("button", { class: "btn small", type: "button" }, "▶ Start timer");
    const reset = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    const remaining = () => (tick ? Math.max(0, deadline - Date.now()) : leftMs);
    const show = () => {
      const left = Math.ceil(remaining() / 1000), m = Math.floor(left / 60), s = left % 60;
      face.textContent = `${m}:${String(s).padStart(2, "0")}`; box.classList.toggle("done", left === 0);
    };
    const stop = () => {
      if (tick) leftMs = remaining();
      clearInterval(tick); tick = null; box.classList.remove("running");
      go.textContent = leftMs ? "▶ Start timer" : "Time's up";
    };
    go.addEventListener("click", () => {
      if (tick) { stop(); show(); go.textContent = "▶ Resume"; return; }
      if (!leftMs) return;
      go.textContent = "❚❚ Pause";
      deadline = Date.now() + leftMs;
      box.classList.add("running");
      tick = setInterval(() => { show(); if (!remaining()) { stop(); show(); toast("Time's up: pens down."); } }, 250);
    });
    reset.addEventListener("click", () => { stop(); leftMs = totalMs; go.textContent = "▶ Start timer"; show(); });
    box.append(HE.el("span", { class: "timer-label" }, box.getAttribute("data-label") || "Exam clock"), face, go, reset);
    show();
  }

  /* ---------- pre-flight checks ---------- */
  function renderCheck(box) {
    const id = box.getAttribute("data-check");
    const bank = (window.HE_QUIZ || {})[id];
    if (!bank) return;
    const qs = bank.questions;
    const answered = new Map();
    const markTally = new Map();
    const head = HE.el("div", { class: "check-head" }, "✈ Pre-flight check: " + bank.title, HE.el("span", { class: "score" }));
    box.append(head);
    const intro = HE.el("p", { class: "hint", style: "margin:4px 0 0;font-size:.88rem;color:var(--muted)" },
      "Answer every question to log this check. For open questions, write your answer first, then reveal the marking guidance and give yourself the marks you earned. An open question counts as correct if you earn at least half its marks. Be honest: it's your logbook.");
    box.append(intro);
    const score = head.querySelector(".score");
    const update = () => {
      const right = [...answered.values()].filter(Boolean).length;
      const mk = [...markTally.values()].reduce((a, [k, n]) => [a[0] + k, a[1] + n], [0, 0]);
      score.textContent = `${answered.size}/${qs.length} answered · ${right} correct` + (mk[1] ? ` · ${mk[0]}/${mk[1]} marks on open questions` : "");
      if (answered.size === qs.length) {
        const passed = right >= Math.ceil(qs.length * 0.6);
        const before = HE.progress().rank.name;
        const prev = state.checks[id];
        state.checks[id] = { passed: passed || !!(prev && prev.passed), best: Math.max(right, prev ? prev.best || 0 : 0), of: qs.length };
        save(state);
        paintRank();
        const after = HE.progress().rank.name;
        if (after !== before) toast(`Promotion! You are now ${after}.`);
        else if (passed) toast(`Check logged: ${right}/${qs.length}. Carry on, Cadet.`);
        else toast(`${right}/${qs.length} — you need ${Math.ceil(qs.length * 0.6)} to log this check. Re-read and try again.`);
        if (!passed) retry.hidden = false;
      }
    };
    const retry = HE.el("button", { class: "btn small", type: "button", hidden: true }, "↺ Try this check again");
    retry.addEventListener("click", () => { box.innerHTML = ""; renderCheck(box); const f = box.querySelector(".q-opt, textarea"); if (f) f.focus(); });

    qs.forEach((q, qi) => {
      const wrap = HE.el("div", { class: "q" });
      const stem = HE.el("p", { class: "q-stem", html: `${qi + 1}. ${q.q}` + (q.marks ? ` <span class="q-marks">(${q.marks} mark${q.marks > 1 ? "s" : ""})</span>` : "") });
      wrap.append(stem);
      if (q.code) wrap.append(HE.el("pre", { text: q.code }));
      const fb = HE.el("div", { class: "q-feedback", "aria-live": "polite" });
      if (q.type === "open") {
        const ta = HE.el("textarea", { "aria-label": "Your answer to question " + (qi + 1), placeholder: "Write your answer here, then reveal the marking guidance…" });
        const reveal = HE.el("button", { class: "btn small", type: "button" }, "Reveal marking guidance");
        const model = HE.el("div", { class: "callout model model-answer", hidden: true, html: `<div class="callout-title">Marking guidance</div>${q.model}` });
        // self-marking: one button per possible mark, so partial credit is practised
        const n = q.marks || 1;
        const self = HE.el("div", { class: "selfmark", hidden: true }, n > 1 ? `How many of the ${n} marks did your answer earn?` : "Did your answer earn the mark?");
        const btns = [];
        for (let k = 0; k <= n; k++) {
          const b = HE.el("button", { class: "btn small" + (k === n ? " primary" : ""), type: "button" }, n > 1 ? `${k}/${n}` : k ? "Yes" : "No");
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
        wrap.append(ta, HE.el("div", { class: "btn-row" }, reveal), model, self, fb);
      } else {
        const opts = HE.el("div", { class: "q-opts", role: "group", "aria-label": "Options for question " + (qi + 1) });
        q.opts.forEach((o, oi) => {
          const b = HE.el("button", { class: "q-opt", type: "button", html: (q.opts.length === 5 ? `<span class="q-letter">${"ABCDE"[oi]}</span> ` : "") + o });
          b.addEventListener("click", () => {
            if (answered.has(qi)) return;
            const ok = oi === q.a;
            // options stay focusable (aria-disabled, not disabled) so keyboard users keep their place
            opts.querySelectorAll(".q-opt").forEach((x, xi) => {
              x.setAttribute("aria-disabled", "true");
              if (xi === q.a) { x.classList.add("right"); x.insertAdjacentHTML("afterbegin", '<span class="q-mark">✔ Correct answer: </span>'); }
            });
            if (!ok) { b.classList.add("wrong"); b.insertAdjacentHTML("afterbegin", '<span class="q-mark">✘ Your answer: </span>'); }
            const right = q.opts[q.a].replace(/<[^>]*>/g, "");
            fb.innerHTML = (ok ? "<span class='ok'>Correct.</span> " : `<span class='bad'>Not this time.</span> The answer is ${q.opts.length === 5 ? "ABCDE"[q.a] + ": " : ""}<b>${right}</b>. `) + (q.why || "");
            HE.math(fb);
            answered.set(qi, ok);
            update();
          });
          opts.append(b);
        });
        wrap.append(opts, fb);
      }
      box.append(wrap);
    });
    box.append(HE.el("div", { class: "btn-row" }, retry));
    HE.math(box);
    update();
    if (state.checks[id] && state.checks[id].passed) score.textContent = `Logged earlier (best ${state.checks[id].best}/${state.checks[id].of}) · ` + score.textContent;
  }

  /* ---------- table of contents ---------- */
  function buildToc() {
    const aside = document.querySelector(".toc");
    if (!aside) return;
    const secs = [...document.querySelectorAll("main section[id] > h2")];
    const ol = HE.el("ol");
    secs.forEach((h) => {
      const sec = h.parentElement;
      const check = sec.querySelector(".check[data-check]");
      const a = HE.el("a", { href: "#" + sec.id }, h.getAttribute("data-short") || h.textContent.replace(/\s*\[.*?\]\s*/g, "").trim());
      if (check) a.setAttribute("data-check-for", check.getAttribute("data-check"));
      ol.append(HE.el("li", null, a));
    });
    const wide = window.matchMedia("(min-width: 921px)");
    const det = HE.el("details", { open: wide.matches ? true : null },
      HE.el("summary", null, "☰ Chapters on this deck"), ol);
    // on wide screens the summary is hidden, so the list must never be left closed
    if (wide.addEventListener) wide.addEventListener("change", (e) => { if (e.matches) det.open = true; });
    aside.append(HE.el("p", { class: "toc-title" }, "On this deck"), det);
    if (!("IntersectionObserver" in window)) return;
    const links = new Map([...ol.querySelectorAll("a")].map((a) => [a.getAttribute("href").slice(1), a]));
    const visible = new Set();
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      links.forEach((a) => { a.classList.remove("active"); a.removeAttribute("aria-current"); });
      const first = secs.map((h) => h.parentElement.id).find((id) => visible.has(id));
      if (first) { links.get(first).classList.add("active"); links.get(first).setAttribute("aria-current", "location"); }
    }, { rootMargin: "-20% 0px -70% 0px" });
    secs.forEach((h) => io.observe(h.parentElement));
  }

  /* ---------- code tabs ---------- */
  let tabSeq = 0;
  function initTabs() {
    document.querySelectorAll(".code-tabs").forEach((box) => {
      const panes = [...box.querySelectorAll(":scope > pre")];
      const list = HE.el("div", { role: "tablist", "aria-label": "Code language" });
      panes.forEach((p, i) => {
        const id = "tab" + ++tabSeq;
        p.id = id + "-panel"; p.setAttribute("role", "tabpanel"); p.setAttribute("tabindex", "0");
        const t = HE.el("button", { role: "tab", type: "button", id, "aria-controls": p.id, "aria-selected": i === 0 ? "true" : "false", tabindex: i === 0 ? "0" : "-1" }, p.getAttribute("data-lang") || "Code " + (i + 1));
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
      const wrap = HE.el("div", { class: "sorter-items" });
      let right = 0, done = 0;
      const tally = HE.el("p", { class: "readout", "aria-live": "polite" });
      items.forEach((it) => {
        const card = HE.el("div", { class: "sorter-item" });
        card.append(HE.el("div", { html: it.innerHTML }));
        const btns = HE.el("div", { class: "sorter-btns", role: "group", "aria-label": "Classify" });
        const why = HE.el("div", { class: "why", "aria-live": "polite" });
        bins.forEach((b) => {
          const btn = HE.el("button", { class: "btn small", type: "button" }, b);
          btn.addEventListener("click", () => {
            const ok = b === it.getAttribute("data-ans");
            card.classList.add(ok ? "right" : "wrong");
            btns.querySelectorAll("button").forEach((x) => { x.disabled = true; if (x.textContent === it.getAttribute("data-ans")) x.classList.add("primary"); });
            btn.classList.add("chosen"); btn.setAttribute("aria-pressed", "true");
            const ans = it.getAttribute("data-ans"), lc = ans.charAt(0).toLowerCase() + ans.slice(1);
            why.innerHTML = (ok ? `<span class='ok'>✔ Right: it ${lc}.</span> ` : `<span class='bad'>✘ Not quite: it ${lc}.</span> `) + (it.getAttribute("data-why") || "");
            HE.math(why);
            done++; if (ok) right++;
            tally.textContent = `${right} of ${done} correct` + (done === items.length ? (right === items.length ? " — flawless!" : " — check the explanations for the ones you missed.") : "");
          });
          btns.append(btn);
        });
        card.append(btns, why);
        wrap.append(card);
        it.remove();
      });
      const again = HE.el("button", { class: "btn small", type: "button" }, "↺ Try these again");
      again.addEventListener("click", () => {
        right = 0; done = 0; tally.textContent = "";
        wrap.querySelectorAll(".sorter-item").forEach((c) => { c.classList.remove("right", "wrong"); c.querySelector(".why").innerHTML = ""; c.querySelectorAll("button").forEach((b) => { b.disabled = false; b.classList.remove("primary", "chosen"); b.removeAttribute("aria-pressed"); }); });
      });
      box.append(wrap, tally, HE.el("div", { class: "btn-row" }, again));
    });
  }

  /* ---------- generic code stepper ----------
     HE.stepper(box, { code: [..lines], steps: [{ line, note, state: html }], lang })
     line is 1-based (0 = nothing highlighted). */
  HE.stepper = function (box, cfg) {
    const pre = HE.el("pre", { class: "stepper-code", "aria-hidden": "true" });
    const state = HE.el("div", { class: "stepper-state" });
    const note = HE.el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = HE.el("button", { class: "btn small", type: "button" }, "◀ Back");
    const step = HE.el("button", { class: "btn small primary", type: "button" }, "Step ▶");
    const play = HE.el("button", { class: "btn small", type: "button" }, "▶ Auto-play");
    const reset = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    const count = HE.el("span", { class: "hint", style: "margin:0" });
    const grid = HE.el("div", { class: "stepper-grid" }, pre, state);
    box.append(HE.el("div", { class: "btn-row" }, back, step, play, reset, count), note, grid);
    let i = 0, timer = null;
    const lines = cfg.code;
    const sr = HE.el("pre", { class: "sr-only" }, lines.join("\n"));
    box.append(sr);
    function render() {
      const s = cfg.steps[i];
      pre.innerHTML = lines.map((l, k) => `<span class="ln">${String(k + 1).padStart(2, " ")}</span> ${k + 1 === s.line ? `<span class="hl">${HE.esc(l) || " "}</span>` : HE.esc(l)}`).join("\n");
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
  function scrollLabel(el) {
    if (el.matches(".synth-wrap")) return "synthetic division table";
    const tcap = el.querySelector("caption");
    const fig = el.closest("figure"), cap = fig && fig.querySelector("figcaption");
    if (tcap || cap) return (tcap || cap).textContent.trim().slice(0, 80);
    const box = el.closest(".widget, section");
    const head = box && box.querySelector(".widget-title, h2, h3");
    const what = el.tagName === "PRE" ? ((el.dataset.lang || el.closest("[data-lang]")?.dataset.lang || "") + " code").trim() : "content";
    return what + (head ? ": " + head.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "");
  }
  /* a display equation wider than its box: fade whichever edge has more to scroll to */
  function mathEdges(el) {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle("more-l", max > 2 && el.scrollLeft > 2);
    el.classList.toggle("more-r", max > 2 && el.scrollLeft < max - 2);
    // a scrolling equation must be reachable from the keyboard (not every browser makes scrollers focusable)
    if (max > 2) { if (!el.hasAttribute("tabindex")) { el.setAttribute("tabindex", "0"); el.setAttribute("role", "group"); el.setAttribute("aria-label", "Scrollable equation"); } }
    else if (el.getAttribute("aria-label") === "Scrollable equation") { el.removeAttribute("tabindex"); el.removeAttribute("role"); el.removeAttribute("aria-label"); }
  }
  let edgeQueued = false;
  function allMathEdges() {
    if (edgeQueued) return; edgeQueued = true;
    requestAnimationFrame(() => { edgeQueued = false; document.querySelectorAll(".katex-display").forEach(mathEdges); });
  }
  document.addEventListener("scroll", (e) => { if (e.target.classList && e.target.classList.contains("katex-display")) mathEdges(e.target); }, true);
  window.addEventListener("resize", allMathEdges);
  if ("MutationObserver" in window) document.addEventListener("DOMContentLoaded", () => {
    const m = document.querySelector("main"); if (m) new MutationObserver(allMathEdges).observe(m, { childList: true, subtree: true });
  });
  /* a multi-panel figure (svg[data-panels="0,200,400,600"], the panels' x boundaries in viewBox units) also gets a
     stacked copy, one panel per row, that CSS shows on phones in place of the sideways-scrolling original */
  let stacked = false;
  function stackPanels() {
    if (stacked) return; stacked = true;
    document.querySelectorAll("svg[data-panels]").forEach((svg, n) => {
      const xs = svg.dataset.panels.split(",").map(Number), vb = svg.viewBox.baseVal;
      const stack = document.createElement("div");
      stack.className = "panel-stack"; stack.setAttribute("role", "img"); stack.setAttribute("aria-label", svg.getAttribute("aria-label") || "");
      for (let i = 0; i + 1 < xs.length; i++) {
        const c = svg.cloneNode(true);
        // keep ids unique: suffix each and repoint the references to it
        c.querySelectorAll("[id]").forEach((el) => { const id = el.id, nu = `${id}-p${n}-${i}`; el.id = nu; c.querySelectorAll("*").forEach((u) => { for (const at of ["marker-start", "marker-end", "fill", "stroke", "clip-path", "mask", "href", "xlink:href"]) { const v = u.getAttribute(at); if (v && (v === "#" + id || v.includes(`url(#${id})`))) u.setAttribute(at, v.replace("#" + id, "#" + nu)); } }); });
        c.removeAttribute("id"); c.removeAttribute("data-panels"); c.removeAttribute("data-minw"); c.removeAttribute("role"); c.removeAttribute("aria-label"); c.classList.remove("wide");
        c.setAttribute("aria-hidden", "true"); c.setAttribute("focusable", "false");
        c.setAttribute("viewBox", `${xs[i]} ${vb.y} ${xs[i + 1] - xs[i]} ${vb.height}`);
        c.style.maxWidth = Math.round((xs[i + 1] - xs[i]) * 1.15) + "px";
        stack.append(c);
      }
      const wrap = svg.closest(".diagram-scroll") || svg;
      wrap.after(stack); wrap.closest("figure")?.classList.add("has-stack");
    });
  }
  function markScrollables() {
    stackPanels();
    allMathEdges();
    document.querySelectorAll(".table-wrap, .diagram-scroll, .synth-wrap, pre").forEach((el) => {
      if (el.closest('[aria-hidden="true"]')) return;  // never make hidden content focusable
      const over = el.scrollWidth - el.clientWidth > 2 || el.scrollHeight - el.clientHeight > 2;
      el.classList.toggle("is-scrollable", el.scrollWidth - el.clientWidth > 2);
      // a visible cue on phones that a wide diagram continues off-screen
      if (el.matches(".diagram-scroll") && !el.closest('[aria-hidden="true"]') && !(el.nextElementSibling && el.nextElementSibling.classList.contains("swipe-hint"))) {
        const h = document.createElement("p"); h.className = "swipe-hint"; h.setAttribute("aria-hidden", "true"); h.textContent = "↔ Swipe sideways to see the whole diagram";
        el.after(h);
      }
      if (over) {
        if (!el.hasAttribute("tabindex")) { el.setAttribute("tabindex", "0"); el.dataset.hcTab = "1"; }
        if (!el.hasAttribute("aria-label") || el.dataset.hcLabel) {
          const lab = "Scrollable " + scrollLabel(el);
          // a group (not a landmark region) so that several code boxes on a page don't collide as landmarks
          if (!el.getAttribute("role") || el.dataset.hcLabel) el.setAttribute("role", "group");
          el.setAttribute("aria-label", lab); el.dataset.hcLabel = "1";
        }
        if (!el.dataset.hcScroll) {
          el.dataset.hcScroll = "1";
          el.addEventListener("scroll", () => el.classList.toggle("at-end", el.scrollLeft + el.clientWidth >= el.scrollWidth - 4), { passive: true });
        }
      } else if (el.dataset.hcTab) {
        el.removeAttribute("tabindex"); delete el.dataset.hcTab;
        if (el.dataset.hcLabel) { el.removeAttribute("aria-label"); el.removeAttribute("role"); delete el.dataset.hcLabel; }
      }
    });
  }
  // widgets redraw their output (SQL results, debugger trace...), so re-check after any change inside one
  let moT = 0;
  const mo = new MutationObserver(() => { clearTimeout(moT); moT = setTimeout(markScrollables, 250); });
  const watchWidgets = () => document.querySelectorAll(".widget").forEach((w) => mo.observe(w, { childList: true, subtree: true }));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchWidgets); else watchWidgets();
  HE.markScrollables = markScrollables;
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
    buildToc();
    initTabs();
    initSorters();
    HE.math(document.querySelector("main"));
    document.querySelectorAll(".check[data-check]").forEach(renderCheck);
    document.querySelectorAll(".exam-timer[data-minutes]").forEach(initTimer);
    paintRank();
    setTimeout(markScrollables, 300);
    window.addEventListener("load", () => setTimeout(markScrollables, 300));
    // the nav bar marks the current deck
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("nav.decks a").forEach((a) => {
      if (a.getAttribute("href") === here || (here === "" && a.getAttribute("href") === "index.html")) a.setAttribute("aria-current", "page");
    });
  });

  /* ================================================================
     Physics helpers shared by every simulation
     ================================================================ */
  const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  HE.sup = (n) => String(n).replace(/[-0-9]/g, (c) => SUP[c]);
  /* x to sf significant figures; standard form outside 0.001 ≤ |x| < 100 000 */
  HE.fmt = function (x, sf = 3, forceSci = false) {
    return fmt0(x, sf, forceSci).replace(/^-/, "−");
  };
  function fmt0(x, sf, forceSci) {
    if (!isFinite(x)) return "—";
    if (x === 0) return (0).toFixed(Math.max(0, sf - 1));
    const ax = Math.abs(x);
    if (forceSci || ax < 1e-3 || ax >= 1e5) {
      let e = Math.floor(Math.log10(ax));
      let m = x / Math.pow(10, e);
      let ms = m.toFixed(sf - 1);
      if (Math.abs(parseFloat(ms)) >= 10) { e += 1; ms = (x / Math.pow(10, e)).toFixed(sf - 1); }
      return `${ms} × 10${HE.sup(e)}`;
    }
    const r = Number(x.toPrecision(sf));
    return r.toFixed(Math.max(0, sf - 1 - Math.floor(Math.log10(Math.abs(r)))));
  }
  /* read a CSS custom property (theme-aware) */
  HE.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  HE.colors = () => ({
    ink: HE.css("--ink"), ink2: HE.css("--ink-2"), muted: HE.css("--muted"), line: HE.css("--line"),
    card: HE.css("--card"), paper: HE.css("--paper"), paper2: HE.css("--paper-2"),
    red: HE.css("--redstone"), lode: HE.css("--lode"), sea: HE.css("--sea"), grass: HE.css("--grass"), gold: HE.css("--gold"),
    navy: HE.css("--navy-2"), sky: HE.css("--sky"), dirt: HE.css("--dirt"), violet: HE.css("--violet") || "#6b4fa0",
  });

  /* HE.sim(canvas, { w, h, draw(ctx, t, dt, C, sim), loop, height }) — a crisp, DPR-aware
     canvas in logical units. With height(w) the canvas is "fluid": one logical unit is one
     CSS pixel (so labels stay readable on phones), sim.w follows the box width (300–760)
     and sim.h = height(sim.w). Draw code must then lay itself out from sim.w / sim.h.
     If loop is true it animates while on screen; it never auto-plays under
     prefers-reduced-motion (the page offers a play button instead).
     Returns { redraw, play, pause, reset, playing, t, w, h }. */
  HE.sim = function (canvas, cfg) {
    const ctx = canvas.getContext("2d");
    const api = { t: 0, playing: false, visible: true };
    let raf = 0, last = 0;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let cssW = canvas.clientWidth || cfg.w || 600;
      if (cfg.height) {
        cfg.w = Math.max(300, Math.min(760, Math.round(cssW)));
        cfg.h = Math.round(cfg.height(cfg.w));
        canvas.style.aspectRatio = `${cfg.w} / ${cfg.h}`;
        cssW = canvas.clientWidth || cfg.w;
      }
      api.w = cfg.w; api.h = cfg.h;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssW * dpr * cfg.h / cfg.w);
      api.scale = canvas.width / cfg.w;
    }
    function paint(dt) {
      ctx.setTransform(api.scale, 0, 0, api.scale, 0, 0);
      ctx.clearRect(0, 0, cfg.w, cfg.h);
      ctx._hmBoxes = []; // text drawn this frame, for labels that avoid each other
      ctx._hmLate = []; // plot tick numbers, drawn after everything else
      cfg.draw(ctx, api.t, dt || 0, HE.colors(), api);
      ctx.setTransform(api.scale, 0, 0, api.scale, 0, 0);
      ctx._hmLate.forEach((f) => f()); ctx._hmLate = null;
    }
    function frame(now) {
      raf = 0;
      if (!api.playing || !api.visible) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      api.t += dt;
      paint(dt);
      raf = requestAnimationFrame(frame);
    }
    api.redraw = () => paint(0);
    api.play = () => { if (api.playing) return; api.playing = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); if (cfg.onstate) cfg.onstate(true); };
    api.pause = () => { api.playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; if (cfg.onstate) cfg.onstate(false); };
    api.reset = () => { api.t = 0; paint(0); };
    if (!cfg.height) canvas.style.aspectRatio = `${cfg.w} / ${cfg.h}`;
    size();
    let rT = 0;
    window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { size(); paint(0); }, 120); });
    document.addEventListener("he-theme", () => paint(0));
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => paint(0));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((ents) => {
        api.visible = ents[0].isIntersecting;
        if (api.visible && api.playing && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      }).observe(canvas);
    }
    paint(0);
    if (cfg.loop && !HE.reduced) api.play();
    return api;
  };
  /* a play / pause button wired to a sim */
  HE.playButton = function (sim, labels = ["▶ Play", "❚❚ Pause"]) {
    const b = HE.el("button", { class: "btn small primary", type: "button" }, labels[0]);
    const sync = () => { b.textContent = sim.playing ? labels[1] : labels[0]; b.setAttribute("aria-pressed", sim.playing ? "true" : "false"); };
    b.addEventListener("click", () => { sim.playing ? sim.pause() : sim.play(); sync(); });
    sync();
    b.sync = sync;
    return b;
  };

  /* HE.slider(parent, { label, min, max, step, value, unit, fmt, oninput }) */
  let sliderSeq = 0;
  HE.slider = function (parent, o) {
    const id = "hms" + ++sliderSeq;
    const out = HE.el("output", { for: id, class: "slider-val" });
    const input = HE.el("input", { type: "range", id, min: o.min, max: o.max, step: o.step || 1, value: o.value,
      "aria-label": String(o.label).replace(/<[^>]*>/g, "").replace(/\\([a-zA-Z]+)/g, "$1").replace(/[${}^_]/g, "").replace(/\s+/g, " ").trim() });
    const wrap = HE.el("div", { class: "slider" },
      HE.el("label", { for: id }, HE.el("span", { class: "slider-name", html: o.label }), out), input);
    const show = () => { const t = (o.fmt ? o.fmt(+input.value) : HE.n(+input.value)) + (o.unit ? (o.unit === "°" ? "" : " ") + o.unit : ""); out.textContent = t; input.setAttribute("aria-valuetext", String(t).replace(/<[^>]*>/g, "")); };
    input.addEventListener("input", () => { show(); if (o.oninput) o.oninput(+input.value); });
    show();
    parent.append(wrap);
    return { input, get value() { return +input.value; }, set(v) { input.value = v; show(); if (o.oninput) o.oninput(+input.value); }, sync(v) { input.value = v; show(); } };
  };
  /* segmented choice: HE.choice(parent, label, [[value, text], ...], value, onchange) */
  HE.choice = function (parent, label, opts, value, onchange) {
    const box = HE.el("div", { class: "seg", role: "group", "aria-label": label });
    const btns = opts.map(([v, t]) => {
      const b = HE.el("button", { type: "button", class: "seg-btn", "aria-pressed": v === value ? "true" : "false", html: t });
      b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); onchange(v); });
      return b;
    });
    box.append(HE.el("span", { class: "seg-label" }, label), ...btns);
    parent.append(box);
    return box;
  };

  /* HE.plot(ctx, box, o) draws labelled axes and returns { X, Y } maps from data to canvas.
     box = { x, y, w, h } in canvas units; o = { x0, x1, y0, y1, xl, yl, xt, yt, C, grid } */
  HE.plot = function (ctx, box, o) {
    const C = o.C;
    const X = (v) => box.x + (v - o.x0) / (o.x1 - o.x0) * box.w;
    const Y = (v) => box.y + box.h - (v - o.y0) / (o.y1 - o.y0) * box.h;
    ctx.save();
    const fs = Math.max(11, o.fs || 12);
    ctx.font = `${fs}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    if (o.grid !== false) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.6;
      if (o.xt) for (let v = Math.ceil(o.x0 / o.xt) * o.xt; v <= o.x1 + 1e-9; v += o.xt) { ctx.beginPath(); ctx.moveTo(X(v), box.y); ctx.lineTo(X(v), box.y + box.h); ctx.stroke(); }
      if (o.yt) for (let v = Math.ceil(o.y0 / o.yt) * o.yt; v <= o.y1 + 1e-9; v += o.yt) { ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + box.w, Y(v)); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink2; ctx.lineWidth = 1.5;
    const yAxisX = o.x0 <= 0 && o.x1 >= 0 ? X(0) : box.x;
    const xAxisY = o.y0 <= 0 && o.y1 >= 0 ? Y(0) : box.y + box.h;
    ctx.beginPath(); ctx.moveTo(yAxisX, box.y); ctx.lineTo(yAxisX, box.y + box.h); ctx.moveTo(box.x, xAxisY); ctx.lineTo(box.x + box.w, xAxisY); ctx.stroke();
    const keep = (x, y, w, h) => { if (ctx._hmBoxes) ctx._hmBoxes.push({ x, y, w, h }); };
    keep(yAxisX - 2, box.y, 4, box.h); keep(box.x, xAxisY - 2, box.w, 4);
    const tf = o.tf || ((v) => (+v.toFixed(6) + "").replace("-", "−"));
    // tick numbers and axis titles. Inside an HE.sim frame they are drawn last, with a halo, over the plot's
    // curves and dots; a tick number that a dot, a label or an axis title would cover is left out.
    const font0 = ctx.font, fontB = `bold ${fs}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    const items = [];
    const add = (t, x, y, align, base, title) => {
      ctx.font = title ? fontB : font0;
      const w = ctx.measureText(t).width;
      const bx = align === "center" ? x - w / 2 : align === "right" ? x - w : x, by = base === "top" ? y : base === "bottom" ? y - fs : y - fs / 2;
      const box = { x: bx, y: by, w, h: fs };
      items.push({ t, x, y, align, base, title, box }); keep(box.x, box.y, box.w, box.h);
    };
    if (o.xt) for (let v = Math.ceil(o.x0 / o.xt) * o.xt; v <= o.x1 + 1e-9; v += o.xt) { if (Math.abs(v) < 1e-9 && (o.y0 < 0 || (o.yt && o.y0 === 0 && Math.abs(yAxisX - X(0)) < 1))) continue; add(tf(v), X(v), xAxisY + 3, "center", "top"); }
    if (o.yt) for (let v = Math.ceil(o.y0 / o.yt) * o.yt; v <= o.y1 + 1e-9; v += o.yt) add((o.ytf || tf)(v), yAxisX - 4, Y(v), "right", "middle");
    ctx.font = fontB;
    if (o.xl) add(o.xl, box.x + box.w, xAxisY - 4, "right", "bottom", true);
    if (o.yl) { const w = ctx.measureText(o.yl).width, rt = yAxisX + 5 + w > box.x + box.w; add(o.yl, rt ? yAxisX - 5 : yAxisX + 5, box.y, rt ? "right" : "left", "top", true); }
    const n0 = ctx._hmBoxes ? ctx._hmBoxes.length : 0; // boxes from n0 - items.length - 2 up to n0 are this plot's own
    const over = (a, q) => a.x < q.x + q.w && q.x < a.x + a.w && a.y < q.y + q.h && q.y < a.y + a.h;
    const draw = (late) => {
      ctx.save(); ctx.font = font0;
      const others = late && ctx._hmBoxes ? ctx._hmBoxes.filter((q, i) => i < n0 - items.length - 2 || i >= n0) : [];
      const titles = items.filter((it) => it.title).map((it) => it.box);
      for (const it of items) {
        if (!it.title && (others.some((q) => over(it.box, q)) || titles.some((q) => over(it.box, q)))) continue;
        ctx.font = it.title ? fontB : font0; ctx.fillStyle = it.title ? C.ink : C.ink2; ctx.textAlign = it.align; ctx.textBaseline = it.base;
        if (late) { ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.strokeStyle = C.card; ctx.strokeText(it.t, it.x, it.y); }
        ctx.fillText(it.t, it.x, it.y);
      }
      ctx.restore();
    };
    if (ctx._hmLate) ctx._hmLate.push(() => draw(true)); else draw(false);
    ctx.restore();
    return { X, Y, relabel: () => {} };
  };
  /* arrow from (x1,y1) to (x2,y2) */
  HE.arrow = function (ctx, x1, y1, x2, y2, col, w = 2, head = 8) {
    const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 1) return;
    const hd = Math.min(head, L * 0.6);
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * hd * 0.8, y2 - Math.sin(a) * hd * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hd * Math.cos(a - 0.45), y2 - hd * Math.sin(a - 0.45));
    ctx.lineTo(x2 - hd * Math.cos(a + 0.45), y2 - hd * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  /* text with a halo so it reads over busy backgrounds */
  HE.label = function (ctx, txt, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.bold ? "bold " : ""}${Math.max(11, o.size || 13)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
    // the label's box; with o.avoid, nudge it clear of axes, tick numbers and labels already drawn this frame
    const tw = ctx.measureText(txt).width, th = Math.max(11, o.size || 13) + 2;
    const at = (px, py) => { const lx = ctx.textAlign === "center" ? px - tw / 2 : ctx.textAlign === "right" ? px - tw : px; return { x: lx - 2, y: py - th / 2, w: tw + 4, h: th }; };
    const hit = (b) => (ctx._hmBoxes || []).some((q) => b.x < q.x + q.w && q.x < b.x + b.w && b.y < q.y + q.h && q.y < b.y + b.h);
    if (o.avoid && ctx._hmBoxes) {
      const cw = ctx.canvas.width / (ctx.getTransform ? ctx.getTransform().a : 1);
      const ch = ctx.canvas.height / (ctx.getTransform ? ctx.getTransform().d : 1);
      // o.bounds keeps the label inside a plot box (a clipped plot would otherwise cut it off)
      const B = o.bounds || { x: 0, y: 0, w: cw, h: ch };
      const tries = o.tries || [[0, 0], [0, -th], [0, th], [6, 4], [6, 14], [-tw - 16, 0], [0, -2 * th], [0, 2 * th], [-tw - 16, -th], [-tw - 16, th], [-tw - 16, -2 * th], [-tw - 16, 2 * th], [-tw - 12, -th - 4], [6, -th - 4], [-tw - 12, th + 4], [6, th + 8]];
      const ok = tries.map(([dx, dy]) => [x + dx, y + dy]).find(([px, py]) => { const b = at(px, py); return b.x >= B.x && b.x + b.w <= B.x + B.w && b.y >= B.y && b.y + b.h <= B.y + B.h && !hit(b); });
      if (ok) [x, y] = ok;
      else {
        // nowhere free: take the in-bounds spot that overlaps least, clamped inside the bounds
        const area = (b) => (ctx._hmBoxes || []).reduce((s, q) => s + Math.max(0, Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x)) * Math.max(0, Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y)), 0);
        const clamp = ([px, py]) => { const b0 = at(px, py); return [px + Math.max(B.x - b0.x, Math.min(0, B.x + B.w - (b0.x + b0.w))), py + Math.max(B.y - b0.y, Math.min(0, B.y + B.h - (b0.y + b0.h)))]; };
        let best = null, bestA = Infinity;
        tries.forEach(([dx, dy]) => { const c = clamp([x + dx, y + dy]), a = area(at(c[0], c[1])); if (a < bestA - 0.5) { bestA = a; best = c; } });
        [x, y] = best;
      }
    }
    if (ctx._hmBoxes) ctx._hmBoxes.push(at(x, y));
    if (o.halo !== false) { ctx.lineWidth = 4; ctx.strokeStyle = o.haloCol || HE.css("--card"); ctx.lineJoin = "round"; ctx.strokeText(txt, x, y); }
    ctx.fillStyle = o.col || HE.css("--ink"); ctx.fillText(txt, x, y);
    ctx.restore();
  };
  /* wavelength (nm) to an approximate display colour */
  HE.nmToRGB = function (nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm <= 780) { r = 1; }
    let f = 1;
    if (nm < 380 || nm > 780) f = 0; else if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40; else if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
    const c = (v) => Math.round(255 * Math.pow(v * f, 0.8));
    return `rgb(${c(r)},${c(g)},${c(b)})`;
  };

  /* ================================================================
     Maths helpers shared by every widget
     ================================================================ */
  /* draw y = f(x) between x0 and x1, lifting the pen at gaps, asymptotes and off-plot values */
  HE.curve = function (ctx, P, f, x0, x1, col, w = 2.5, o = {}) {
    const n = o.n || 400, ylo = o.ylo ?? -1e9, yhi = o.yhi ?? 1e9;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.beginPath();
    let pen = false, prevY = null;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = f(x);
      if (!isFinite(y) || y < ylo || y > yhi || (prevY !== null && Math.abs(P.Y(y) - P.Y(prevY)) > 400)) { pen = false; prevY = isFinite(y) ? y : null; continue; }
      if (pen) ctx.lineTo(P.X(x), P.Y(y)); else { ctx.moveTo(P.X(x), P.Y(y)); pen = true; }
      prevY = y;
    }
    ctx.stroke(); ctx.restore();
  };
  HE.dot = function (ctx, x, y, col, r = 5, ring) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
    if (ctx._hmBoxes) ctx._hmBoxes.push({ x: x - r - 1, y: y - r - 1, w: 2 * r + 2, h: 2 * r + 2 });
  };
  /* a clipped plotting rectangle */
  HE.clip = function (ctx, b, fn) { ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); fn(); ctx.restore(); };
  /* pointer dragging on a fluid canvas: handles() returns [{x, y, id}] in canvas units;
     move(id, x, y) receives the new canvas-unit position. Keyboard users get the sliders. */
  HE.drag = function (canvas, sim, handles, move, radius = 22) {
    canvas.classList.add("draggable");
    let active = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * sim.w / r.width, y: (e.clientY - r.top) * sim.h / r.height }; };
    canvas.addEventListener("pointerdown", (e) => {
      const p = pos(e); let best = null, bd = radius;
      for (const h of handles()) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h.id; } }
      if (best == null) return;
      active = best; canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging"); e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => { if (active == null) return; const p = pos(e); move(active, p.x, p.y); });
    const end = () => { active = null; canvas.classList.remove("dragging"); };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  };
  /* tidy numbers for readouts: up to dp decimals, trailing zeros dropped, true minus sign */
  HE.n = function (x, dp = 2) {
    if (!isFinite(x)) return "—";
    let s = (+x.toFixed(dp)).toString();
    if (s === "-0") s = "0";
    return s.replace("-", "−");
  };
  /* signed term for building expressions: HE.sgn(-3) → "− 3", HE.sgn(4) → "+ 4" */
  HE.sgn = (x, dp = 2) => (x < 0 ? "- " : "+ ") + HE.n(Math.abs(x), dp);
  /* exact fractions for readouts: HE.frac(0.75) → "3/4" when a small denominator fits */
  HE.fracTex = function (x, maxDen = 12) {
    for (let d = 1; d <= maxDen; d++) { const n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-9) return d === 1 ? String(n) : (n < 0 ? "-" : "") + `\\tfrac{${Math.abs(n)}}{${d}}`; }
    return HE.n(x, 3).replace("−", "-");
  };
  /* format a polynomial from coefficients (highest power first) as TeX */
  HE.polyTex = function (cs, v = "x", exact = false) {
    const deg = cs.length - 1;
    let out = "";
    cs.forEach((c, i) => {
      const p = deg - i;
      if (Math.abs(c) < 1e-12) return;
      const a = Math.abs(c), sign = c < 0 ? "-" : "+";
      const coef = (a === 1 && p > 0) ? "" : exact ? HE.fracTex(a, 16) : HE.n(a, 3).replace("−", "");
      const term = coef + (p === 0 ? "" : p === 1 ? v : `${v}^{${p}}`);
      out += out ? ` ${sign} ${term}` : (c < 0 ? "-" : "") + term;
    });
    return out || "0";
  };
  HE.niceStep = function (range) {
    const raw = range / 8, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  };
})();
