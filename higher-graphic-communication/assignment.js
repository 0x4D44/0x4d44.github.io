/* The assignment: widgets for the Admiralty Commission deck.
   Every number a widget shows is computed from the same rules the page teaches
   (the 2025 marking instructions as paraphrased on the page). The self-markers are
   practice tools: they help you judge your own work, they do not predict a real mark. */
(function () {
  "use strict";
  const HG = window.HG;
  if (!HG) return;
  const $ = (id) => document.getElementById(id);
  const el = HG.el, S = HG.svg;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const store = (key) => ({
    get(d) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? d : v; } catch (e) { return d; } },
    set(v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode: this visit only */ } },
  });
  const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
  const short = (h) => { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m / 60}h`; };
  /* an SVG drawn in real pixels: viewBox follows the box width, so labels stay readable on phones */
  function fluid(host, heightOf, draw) {
    const svg = S("svg", { class: "as-fluid", role: "img", focusable: "false" });
    host.append(svg);
    let W = 0;
    const redraw = () => {
      const w = Math.max(280, Math.round(host.clientWidth || 600));
      W = w; const h = Math.round(heightOf(w));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("width", w); svg.setAttribute("height", h);
      draw(svg, w, h);
    };
    redraw();
    if ("ResizeObserver" in window) new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) redraw(); }).observe(host);
    document.addEventListener("hm-theme", redraw);
    return { svg, redraw, get w() { return W; } };
  }
  const svgPoint = (svg, e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  function tween(from, to, ms, step, done) {
    if (HG.reduced) { step(to); if (done) done(); return; }
    const t0 = performance.now();
    const f = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      step(from.map((v, i) => v + (to[i] - v) * e));
      if (k < 1) requestAnimationFrame(f); else if (done) done();
    };
    requestAnimationFrame(f);
  }

  /* ================================================================
     1 · The eight-bell watch: an 8-hour time planner
     ================================================================ */
  mount("w-timeplan", (box) => {
    const PRESETS = {
      y2025: { label: "2025 task", tasks: [["Task 1", "production", 20, 3], ["Task 2", "render, layouts, poster", 26, 4], ["Task 3", "sketching", 4, 1]] },
      y2018: { label: "2018 specimen", tasks: [["Task 1", "production", 20, 3], ["Task 2", "render, layouts, table talker", 21, 3], ["Task 3", "sketch, scene render", 9, 2]] },
      mock: { label: "Vellum mock", tasks: [["Task A", "production", 18, 3], ["Task B", "render, layouts, poster", 24, 3.75], ["Task C", "two sketches", 8, 1.25]] },
    };
    const TOTAL = 8, STEP = 0.25, MIN = 0.25;
    let preset = "y2025", d = [3, 7]; // boundaries in hours
    const q = (h) => Math.round(h / STEP) * STEP;
    const share = () => { const t = PRESETS[preset].tasks, m = t.reduce((a, x) => a + x[2], 0); return t.map((x) => x[2] / m * TOTAL); };
    const hours = () => [d[0], d[1] - d[0], TOTAL - d[1]];
    const ctrls = el("div", { class: "btn-row" });
    box.append(ctrls);
    HG.choice(ctrls, "Task:", Object.entries(PRESETS).map(([k, v]) => [k, v.label]), preset, (k) => { preset = k; const s = share(); go([q(s[0]), q(s[0] + s[1])]); });
    const bShare = el("button", { class: "btn small", type: "button" }, "Share time by marks");
    const bBrief = el("button", { class: "btn small", type: "button" }, "Use the brief's times");
    const bEven = el("button", { class: "btn small", type: "button" }, "Even thirds");
    box.append(el("div", { class: "btn-row" }, bShare, bBrief, bEven));
    const wrap = el("div", { class: "as-plan-svg" });
    box.append(wrap);
    const tableBox = el("div", { class: "table-wrap" });
    const warn = el("div", { class: "as-warn", "aria-live": "polite" });
    box.append(tableBox, warn);
    let handles = [];
    const view = fluid(wrap, () => 214, draw);
    function go(to) { tween(d.slice(), to, 450, (v) => { d = v; draw(view.svg, view.w); }, () => { d = to.map(q); draw(view.svg, view.w); report(); }); }
    bShare.addEventListener("click", () => { const s = share(); go([q(s[0]), q(s[0] + s[1])]); });
    bBrief.addEventListener("click", () => { const t = PRESETS[preset].tasks; go([t[0][3], t[0][3] + t[1][3]]); });
    bEven.addEventListener("click", () => go([q(8 / 3), q(16 / 3)]));
    function draw(svg, W) {
      const C = HG.colors(), cols = [C.sea, C.red, C.gold];
      const x0 = 12, x1 = W - 12, X = (h) => x0 + (x1 - x0) * h / TOTAL;
      svg.textContent = "";
      const t = PRESETS[preset].tasks, hs = hours(), sh = share();
      const font = (s, w) => ({ "font-size": s, "font-weight": w || 400, fill: C.ink });
      const row = (y, h, list, label, thick) => {
        svg.append(S("text", { x: x0, y: y - 6, ...font(13, 700), text: label }));
        let a = 0;
        list.forEach((v, i) => {
          const xa = X(a), xb = X(a + v);
          svg.append(S("rect", { x: xa, y, width: Math.max(0, xb - xa), height: h, fill: cols[i], "fill-opacity": thick ? 0.3 : 0.18, stroke: cols[i], "stroke-width": thick ? 2 : 1.5 }));
          const txt = thick ? `${t[i][0].replace("Task ", "T")} · ${short(v)}` : short(v);
          if (xb - xa > txt.length * 7 + 6) svg.append(S("text", { x: (xa + xb) / 2, y: y + h / 2 + 5, "text-anchor": "middle", ...font(13, thick ? 700 : 400), text: txt }));
          a += v;
        });
      };
      row(30, 46, hs, "Your plan (drag the dividers)", true);
      for (let h = 0; h <= TOTAL; h++) {
        if (W < 420 && h % 2) continue;
        svg.append(S("line", { x1: X(h), y1: 78, x2: X(h), y2: 84, stroke: C.muted }));
        svg.append(S("text", { x: X(h), y: 98, "text-anchor": "middle", "font-size": 12, fill: C.ink2, text: h + " h" }));
      }
      row(130, 24, sh, "In proportion to marks");
      row(182, 24, t.map((x) => x[3]), "Suggested in the brief");
      handles = d.map((v, i) => {
        const g = S("g", { class: "as-handle", tabindex: "0", role: "slider", "aria-label": `Divider between ${t[i][0]} and ${t[i + 1][0]}`, "aria-valuemin": 0, "aria-valuemax": TOTAL, "aria-valuenow": v.toFixed(2), "aria-valuetext": `${t[i][0]} ${i ? "ends" : "ends"} at ${hm(v)} into the 8 hours` });
        g.append(S("rect", { x: X(v) - 8, y: 24, width: 16, height: 58, rx: 3, fill: C.card, stroke: C.ink, "stroke-width": 2 }));
        g.append(S("line", { x1: X(v) - 2, y1: 40, x2: X(v) - 2, y2: 66, stroke: C.ink, "stroke-width": 1.5 }));
        g.append(S("line", { x1: X(v) + 2, y1: 40, x2: X(v) + 2, y2: 66, stroke: C.ink, "stroke-width": 1.5 }));
        g.addEventListener("keydown", (e) => {
          const st = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP, PageUp: 1, PageDown: -1 }[e.key];
          let nv = null;
          if (st != null) nv = d[i] + st; else if (e.key === "Home") nv = 0; else if (e.key === "End") nv = TOTAL;
          if (nv == null) return;
          e.preventDefault(); set(i, nv); const h2 = view.svg.querySelectorAll(".as-handle")[i]; if (h2) h2.focus();
        });
        svg.append(g);
        return g;
      });
      svg.setAttribute("aria-label", `Time plan bar. ${t.map((x, i) => `${x[0]} ${hm(hs[i])}`).join(", ")}. In proportion to marks: ${sh.map(hm).join(", ")}. Brief: ${t.map((x) => hm(x[3])).join(", ")}.`);
    }
    function set(i, v) {
      v = q(v);
      if (i === 0) v = Math.max(MIN, Math.min(d[1] - MIN, v)); else v = Math.max(d[0] + MIN, Math.min(TOTAL - MIN, v));
      if (v === d[i]) return;
      d[i] = v; draw(view.svg, view.w); report();
    }
    let drag = null;
    view.svg.addEventListener("pointerdown", (e) => {
      const p = svgPoint(view.svg, e), W = view.w, X = (h) => 12 + (W - 24) * h / TOTAL;
      if (p.y > 100) return;
      let best = -1, bd = 26;
      d.forEach((v, i) => { const dd = Math.abs(X(v) - p.x); if (dd < bd) { bd = dd; best = i; } });
      if (best < 0) return;
      drag = best; view.svg.setPointerCapture(e.pointerId); e.preventDefault();
    });
    view.svg.addEventListener("pointermove", (e) => { if (drag == null) return; const p = svgPoint(view.svg, e), W = view.w; set(drag, (p.x - 12) / (W - 24) * TOTAL); });
    const end = () => { drag = null; };
    view.svg.addEventListener("pointerup", end); view.svg.addEventListener("pointercancel", end);
    function report() {
      const t = PRESETS[preset].tasks, hs = hours(), sh = share(), totM = t.reduce((a, x) => a + x[2], 0);
      const rows = t.map((x, i) => {
        const ratio = hs[i] / sh[i];
        const v = ratio < 0.8 ? "<span class='bad'>short of its marks</span>" : ratio > 1.5 ? "<span class='lode'>generous</span>" : "<span class='ok'>in proportion</span>";
        return `<tr><td><strong>${x[0]}</strong> <span class="as-muted">${x[1]}</span></td><td class="num">${x[2]} (${Math.round(x[2] / totM * 100)}%)</td><td class="num">${short(hs[i])} (${Math.round(hs[i] / TOTAL * 100)}%)</td><td class="num">${short(sh[i])}</td><td class="num">${short(x[3])}</td><td class="num">${HG.n(x[2] / hs[i], 1)}</td><td>${v}</td></tr>`;
      }).join("");
      tableBox.innerHTML = `<table class="as-plan-table"><thead><tr><th>Task</th><th class="num">Marks</th><th class="num">Your time</th><th class="num">By marks</th><th class="num">Brief</th><th class="num">Marks per h</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table>`;
      const msgs = [];
      t.forEach((x, i) => {
        if (x[2] / totM >= 0.2 && hs[i] < 0.8 * sh[i]) msgs.push(`<p class="bad">⚠ ${x[0]} carries ${x[2]} marks (${Math.round(x[2] / totM * 100)}%) but gets only ${hm(hs[i])}. Its share of the marks would earn it about ${hm(sh[i])}: you are under-allocating a big-mark task by ${hm(sh[i] - hs[i])}.</p>`);
        else if (hs[i] > 1.5 * sh[i] && hs[i] - sh[i] > 0.5) msgs.push(`<p>ℹ ${x[0]} gets ${hm(hs[i])}, well over its mark share of ${hm(sh[i])}. That can be sensible for slow work like sketching, but those minutes come out of the bigger tasks.</p>`);
      });
      if (!msgs.length) msgs.push(`<p class="ok">✔ Every task gets at least four-fifths of its mark share. Average for this plan: ${HG.n(totM / TOTAL, 2)} marks per hour.</p>`);
      msgs.push(`<p class="as-muted">The brief's own suggested times are the official guide; the mark-share line is just arithmetic (marks ÷ ${totM} × 8 hours).</p>`);
      warn.innerHTML = msgs.join("");
    }
    report();
  });

  /* ================================================================
     2 · The Admiralty sheet inspector: 1(d)-style standards marks
     ================================================================ */
  mount("w-sheet", (box) => {
    const GROUPS = [
      { id: "dim", title: "Dimension types (1 mark: every type)", rule: "all", items: [["chain", "Linear: chain"], ["parallel", "Linear: parallel"], ["radial", "Radial (R)"], ["diameter", "Diameter (Ø)"], ["angular", "Angular (°)"]] },
      { id: "tpl", title: "Template items (1 mark: any three)", rule: 3, items: [["symbol", "Third-angle symbol"], ["name", "Candidate name"], ["title", "Title of drawing"], ["project", "Project title"], ["scale", "Scale"], ["date", "Date"], ["mm", "All sizes in mm"], ["tol", "Tolerances"]] },
      { id: "lab", title: "View labels (1 mark: each view type once)", rule: "all", items: [["lel", "Elevation"], ["lend", "End elevation"], ["lplan", "Plan"], ["lsec", "Section A–A"], ["ldet", "Detail B"]] },
      { id: "ext", title: "Also on the sheet (marked elsewhere)", rule: null, items: [["hidden", "Hidden detail"], ["centre", "Centre lines"], ["cut", "Cutting plane, arrows, letters"], ["hatch", "Hatching at 45°"]] },
    ];
    const on = new Set(["chain", "diameter", "name", "title", "lel", "lplan", "hidden"]);
    const grid = el("div", { class: "as-sheet-grid" });
    const form = el("div", { class: "as-checks" });
    const right = el("div", { class: "as-right" });
    grid.append(form, right);
    box.append(grid);
    const cbs = {};
    GROUPS.forEach((g) => {
      const fs = el("fieldset", { class: "as-fs" }, el("legend", null, g.title));
      g.items.forEach(([k, t]) => {
        const id = "as-sh-" + k;
        const cb = el("input", { type: "checkbox", id });
        cb.checked = on.has(k);
        cb.addEventListener("change", () => { cb.checked ? on.add(k) : on.delete(k); paint(); });
        cbs[k] = cb;
        fs.append(el("label", { for: id, class: "as-cb" }, cb, " " + t));
      });
      form.append(fs);
    });
    const allB = el("button", { class: "btn small", type: "button" }, "Tick everything");
    const noneB = el("button", { class: "btn small", type: "button" }, "Clear");
    form.append(el("div", { class: "btn-row" }, allB, noneB));
    allB.addEventListener("click", () => { GROUPS.forEach((g) => g.items.forEach(([k]) => on.add(k))); sync(); });
    noneB.addEventListener("click", () => { on.clear(); sync(); });
    const sync = () => { Object.entries(cbs).forEach(([k, cb]) => (cb.checked = on.has(k))); paint(); };
    const score = el("div", { class: "as-score", "aria-live": "polite" });
    right.append(score);
    const sc = el("div", { class: "diagram-scroll as-sheet-scroll" });
    right.append(sc);
    // the A3 preview: fixed geometry (A3 proportions), every optional part tagged with data-k
    const svg = S("svg", { viewBox: "0 0 600 424", class: "as-sheet", role: "img", style: "min-width:520px" });
    sc.append(svg);
    const k = (key, ...kids) => S("g", { "data-k": key, class: "as-opt" }, ...kids);
    const L = (x1, y1, x2, y2, w = 1, extra = {}) => S("line", { x1, y1, x2, y2, stroke: "currentColor", "stroke-width": w, ...extra });
    const T = (x, y, s, o = {}) => S("text", { x, y, "font-size": o.fs || 13, "text-anchor": o.a || "middle", fill: "currentColor", "font-weight": o.w || 400, text: s, ...(o.rot ? { transform: `rotate(-90 ${x} ${y})` } : {}) });
    const P = (d, w = 2, extra = {}) => S("path", { d, fill: "none", stroke: "currentColor", "stroke-width": w, "stroke-linejoin": "round", ...extra });
    const arrowDefs = S("defs", null,
      S("marker", { id: "as-sh-arr", viewBox: "0 0 10 10", refX: 9.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, S("path", { d: "M0,1.5 L10,5 L0,8.5 z", fill: "currentColor" })),
      S("pattern", { id: "as-sh-hatch", patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(45)" }, S("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "currentColor", "stroke-width": 1 })));
    const dimL = (x1, y1, x2, y2) => L(x1, y1, x2, y2, 0.9, { "marker-start": "url(#as-sh-arr)", "marker-end": "url(#as-sh-arr)" });
    const DASH = { "stroke-dasharray": "6 4" }, CHAIN = { "stroke-dasharray": "14 3 2 3" };
    svg.append(arrowDefs,
      S("rect", { x: 6, y: 6, width: 588, height: 412, fill: "none", stroke: "currentColor", "stroke-width": 1 }),
      S("rect", { x: 14, y: 14, width: 572, height: 396, fill: "none", stroke: "currentColor", "stroke-width": 2 }),
      // plan (with a filleted back-left corner, a step, a chamfer edge and a hole)
      P("M75,70 L260,70 L260,170 L60,170 L60,85 A15,15 0 0 1 75,70 Z"), L(150, 70, 150, 170, 2), L(135, 70, 135, 170, 2), S("circle", { cx: 205, cy: 120, r: 12, fill: "none", stroke: "currentColor", "stroke-width": 2 }),
      // elevation: L-profile with a 45° chamfer on the upright
      P("M60,300 L260,300 L260,260 L150,260 L150,215 L135,200 L60,200 Z"),
      // end elevation (view from the right)
      P("M300,200 L400,200 L400,300 L300,300 Z"), L(300, 260, 400, 260, 2), L(300, 215, 400, 215, 2),
      // section A–A through the hole: base cut (hatched when ticked), upright beyond
      P("M440,200 L540,200 L540,260 L440,260 Z"), L(440, 215, 540, 215, 2),
      k("hatch", S("path", { d: "M440,260 L478,260 L478,300 L440,300 Z M502,260 L540,260 L540,300 L502,300 Z", fill: "url(#as-sh-hatch)", stroke: "none" })),
      P("M440,260 L478,260 L478,300 L440,300 Z"), P("M502,260 L540,260 L540,300 L502,300 Z"),
      // detail B: circle on plan + enlarged view
      S("circle", { cx: 205, cy: 120, r: 26, fill: "none", stroke: "currentColor", "stroke-width": 1, "stroke-dasharray": "4 3" }), T(236, 100, "B"),
      S("circle", { cx: 500, cy: 110, r: 56, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }), S("circle", { cx: 500, cy: 110, r: 24, fill: "none", stroke: "currentColor", "stroke-width": 2 }),
      // title block
      S("rect", { x: 330, y: 330, width: 256, height: 80, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }),
      L(330, 350, 586, 350), L(330, 370, 586, 370), L(330, 390, 586, 390), L(470, 330, 470, 410),
    );
    svg.append(
      k("hidden", L(193, 260, 193, 300, 1.4, DASH), L(217, 260, 217, 300, 1.4, DASH), L(338, 260, 338, 300, 1.4, DASH), L(362, 260, 362, 300, 1.4, DASH)),
      k("centre", L(205, 252, 205, 308, 0.8, CHAIN), L(185, 120, 225, 120, 0.8, CHAIN), L(205, 100, 205, 140, 0.8, CHAIN), L(350, 252, 350, 308, 0.8, CHAIN), L(490, 252, 490, 308, 0.8, CHAIN), L(464, 110, 536, 110, 0.8, CHAIN), L(500, 74, 500, 146, 0.8, CHAIN)),
      k("cut", L(205, 185, 205, 318, 0.9, CHAIN), L(205, 180, 205, 192, 3), L(205, 312, 205, 324, 3), P("M205,186 L188,186 M193,182 L188,186 L193,190", 1.6), P("M205,318 L188,318 M193,314 L188,318 L193,322", 1.6), T(182, 183, "A", { a: "end" }), T(182, 323, "A", { a: "end" })),
      k("chain", L(60, 305, 60, 340, .8), L(150, 305, 150, 340, .8), L(205, 305, 205, 340, .8), L(260, 305, 260, 340, .8), dimL(60, 334, 150, 334), dimL(150, 334, 205, 334), dimL(205, 334, 260, 334), T(105, 329, "90"), T(177, 329, "55"), T(232, 329, "55")),
      k("parallel", L(55, 260, 22, 260, .8), L(55, 200, 18, 200, .8), L(55, 300, 18, 300, .8), dimL(40, 300, 40, 260), dimL(26, 300, 26, 200), T(36, 280, "40", { rot: 1 }), T(22, 250, "100", { rot: 1 })),
      k("radial", P("M40,52 L64,74", 0.9, { "marker-end": "url(#as-sh-arr)" }), L(22, 52, 40, 52, .9), T(30, 47, "R15")),
      k("diameter", P("M248,46 L213,112", 0.9, { "marker-end": "url(#as-sh-arr)" }), L(248, 46, 266, 46, .9), T(270, 50, "Ø24", { a: "start" })),
      k("angular", L(150, 215, 150, 186, .8), S("path", { d: "M150,189 A26,26 0 0 0 131.6,196.6", fill: "none", stroke: "currentColor", "stroke-width": 0.9, "marker-start": "url(#as-sh-arr)", "marker-end": "url(#as-sh-arr)" }), T(118, 185, "45°")),
      k("lel", T(160, 362, "ELEVATION", { w: 700 })), k("lplan", T(160, 58, "PLAN", { w: 700 })), k("lend", T(350, 322, "END ELEVATION", { w: 700 })), k("lsec", T(490, 322, "SECTION A–A", { w: 700 })), k("ldet", T(500, 184, "DETAIL B (2:1)", { w: 700 })),
      k("name", T(336, 345, "NAME  A. Cadet", { a: "start", fs: 12 })), k("title", T(336, 365, "TITLE  Carriage body", { a: "start", fs: 12 })), k("project", T(336, 385, "PROJECT  HMS Vellum guns", { a: "start", fs: 12 })),
      k("scale", T(336, 405, "SCALE 1:5", { a: "start", fs: 12 })), k("date", T(410, 405, "DATE 03/27", { a: "start", fs: 12 })), k("mm", T(476, 345, "ALL SIZES IN mm", { a: "start", fs: 12 })), k("tol", T(476, 365, "TOL ±0.5 UNLESS", { a: "start", fs: 12 })),
      k("symbol", S("g", { transform: "translate(498,374) scale(.42)" }, P("M0,0 L30,8 L30,30 L0,38 Z", 3), S("circle", { cx: 66, cy: 19, r: 18, fill: "none", stroke: "currentColor", "stroke-width": 3 }), S("circle", { cx: 66, cy: 19, r: 10, fill: "none", stroke: "currentColor", "stroke-width": 3 }))),
    );
    function paint() {
      svg.querySelectorAll("[data-k]").forEach((g) => g.classList.toggle("on", on.has(g.getAttribute("data-k"))));
      const res = GROUPS.filter((g) => g.rule != null).map((g) => {
        const have = g.items.filter(([k2]) => on.has(k2)), miss = g.items.filter(([k2]) => !on.has(k2));
        const ok = g.rule === "all" ? miss.length === 0 : have.length >= g.rule;
        let why;
        if (g.rule === "all") why = ok ? "every one is there" : "missing: " + miss.map((x) => x[1]).join(", ");
        else why = ok ? `${have.length} of 8 present (three needed)` : `only ${have.length} of 8: add ${g.rule - have.length} more`;
        return { g, ok, why };
      });
      const n = res.filter((r) => r.ok).length;
      score.innerHTML = `<p class="readout">Standards and conventions: ${n} / 3</p><ul class="as-reslist">${res.map((r) => `<li>${r.ok ? "<span class='ok'>✔</span>" : "<span class='bad'>✘</span>"} ${r.g.title.replace(/ \(.*/, "")}: ${r.why}</li>`).join("")}</ul>` +
        (n === 3 ? `<p class="as-muted">All three, as the 2025 marking describes them. Next year's list may differ, so keep the whole template.</p>` : "");
      svg.setAttribute("aria-label", `A3 sheet preview showing: ${[...on].map((x) => GROUPS.flatMap((g) => g.items).find((i) => i[0] === x)[1]).join(", ") || "views only"}. Score ${n} of 3.`);
    }
    paint();
  });

  /* ================================================================
     3 · The poster review board: a 2(c)-style self-marker out of 11
     ================================================================ */
  mount("w-poster", (box) => {
    const st = { structure: false, link: true, logo: true, cmyk: true, images: false, copy: true, fonts: 1, ep: 1, dtp: 1, impact: 1 };
    const grid = el("div", { class: "as-poster-grid" });
    const form = el("div", { class: "as-checks" });
    const right = el("div", { class: "as-right as-poster-right" });
    grid.append(form, right);
    box.append(grid);
    const cb = (key, label) => {
      const id = "as-po-" + key, i = el("input", { type: "checkbox", id });
      i.checked = st[key];
      i.addEventListener("change", () => { st[key] = i.checked; paint(); });
      return el("label", { for: id, class: "as-cb" }, i, " " + label);
    };
    let fs = el("fieldset", { class: "as-fs" }, el("legend", null, "Set-up and planning (1 + 1)"));
    fs.append(cb("structure", "Sizes within ±10, section divide kept, no text in the border"), cb("link", "The final layout clearly develops one of my 2(b) thumbnails"));
    form.append(fs);
    fs = el("fieldset", { class: "as-fs" }, el("legend", null, "Inclusion (1 mark: all four)"));
    fs.append(cb("logo", "Company logo"), cb("cmyk", "Three CMYK colours from the brief"), cb("images", "Three images"), cb("copy", "Copy text in the stipulated sections"));
    form.append(fs);
    const segs = el("div");
    form.append(segs);
    HG.choice(segs, "Fonts:", [[0, "One font"], [1, "Two, not really contrasting"], [2, "Two contrasting, used well"]], st.fonts, (v) => { st.fonts = v; paint(); });
    HG.choice(segs, "My 2(b) elements/principles used effectively:", [[0, "0"], [1, "1"], [2, "2"]], st.ep, (v) => { st.ep = v; paint(); });
    HG.choice(segs, "My 2(b) DTP techniques used effectively:", [[0, "0"], [1, "1"], [2, "2"]], st.dtp, (v) => { st.dtp = v; paint(); });
    HG.choice(segs, "Skill and visual impact:", [[0, "None"], [1, "Basic"], [2, "Good, some"], [3, "High, significant"]], st.impact, (v) => { st.impact = v; paint(); });
    const ask = el("p", { class: "as-muted as-ask" });
    form.append(ask);
    const svg = S("svg", { viewBox: "0 0 240 340", class: "as-poster", role: "img" });
    right.append(svg);
    const out = el("div", { class: "as-score", "aria-live": "polite" });
    right.append(out);
    const C0 = () => HG.colors();
    function poster() {
      const C = C0(), s = st, ok3 = s.cmyk, imp = s.impact;
      svg.textContent = "";
      const navy = ok3 ? "#1e3f78" : "#7d7d7d", red = ok3 ? "#d5262b" : "#9a9a9a", yel = ok3 ? "#f2c400" : "#b8b8b8";
      const g = (o, ...kids) => S("g", o, ...kids);
      svg.append(S("rect", { x: 0, y: 0, width: 240, height: 340, fill: "#fbf8f0", stroke: C.ink, "stroke-width": 2 }));
      const mess = imp === 0 ? 1 : 0, wob = (i) => (s.ep >= 2 ? 0 : (s.ep === 1 ? 4 : 9) * Math.sin(i * 2.3));
      const m = s.structure ? 16 : 6; // margin: the no-text border
      if (s.structure) svg.append(S("rect", { x: 12, y: 12, width: 216, height: 316, fill: "none", stroke: "#999", "stroke-width": 0.8, "stroke-dasharray": "3 3" }));
      const divY = 120;
      if (s.structure) svg.append(S("line", { x1: 0, y1: divY, x2: 240, y2: divY, stroke: navy, "stroke-width": 3 }));
      // section 2 band: reverse text on dark (a DTP technique)
      if (s.dtp >= 1) svg.append(S("rect", { x: 0, y: divY + 1.5, width: 240, height: 340 - divY - 1.5, fill: navy, opacity: 0.92 }));
      // the dominant flag (emphasis) or a small one
      const big = s.ep >= 1;
      const fw = big ? 84 : 48, fx = m + wob(1), fy = m + 6 + wob(2);
      svg.append(g({ class: "as-pf" }, S("rect", { x: fx, y: fy, width: fw, height: fw * 0.75, fill: red }), S("rect", { x: fx, y: fy, width: fw / 2, height: fw * 0.375, fill: yel })));
      // headline: contrasting display face vs body
      const hx = big ? fx + fw + 8 : m + 60, hy = m + 24 + wob(3);
      const disp = s.fonts === 2 ? { "font-family": "var(--font-pixel)", "font-weight": 700, "font-size": 22 } : s.fonts === 1 ? { "font-family": "Georgia, serif", "font-weight": 400, "font-size": 18 } : { "font-family": "var(--font-body)", "font-size": 13 };
      const words = ["JOIN", "THE PLAN", "ROOM"];
      words.forEach((w, i) => svg.append(S("text", { x: hx - (s.structure ? 0 : 10 * (i === 1)), y: hy + i * (s.fonts === 2 ? 22 : 18), fill: navy, ...disp, text: w })));
      // copy text (grey lines) in section 1, wrapped around the flag if text wrap is a chosen technique
      if (s.copy) {
        for (let i = 0; i < 4; i++) {
          const y = fy + fw * 0.75 + 12 + i * 7;
          const x0 = (s.dtp >= 2 && i < 1) ? fx + fw + 6 : m;
          if (y < divY - 6) svg.append(S("line", { x1: x0, y1: y, x2: 240 - m - (i === 3 ? 40 : 0), y2: y, stroke: "#8a8a8a", "stroke-width": 2.4 }));
        }
        for (let i = 0; i < 3; i++) svg.append(S("line", { x1: m, y1: 300 + i * 8, x2: 240 - m - 50 - i * 20, y2: 300 + i * 8, stroke: s.dtp >= 1 ? "#ffffff" : "#8a8a8a", "stroke-width": 2.4 }));
      }
      // three images, with rhythm if aligned; a transparency veil if two techniques
      const n = s.images ? 3 : 2, iw = (240 - 2 * m - 16) / 3;
      for (let i = 0; i < n; i++) {
        const x = m + i * (iw + 8) + wob(i + 4), y = divY + 22 + (mess ? i * 9 : 0) + wob(i + 7) * 0.6;
        svg.append(S("rect", { x, y, width: iw, height: iw * 0.8, fill: ["#3c7aa8", "#6b8f3e", "#8a5b2f"][i], stroke: "#fff", "stroke-width": 1.5 }));
        svg.append(S("path", { d: `M${x + 4},${y + iw * 0.7} L${x + iw * 0.4},${y + iw * 0.35} L${x + iw * 0.6},${y + iw * 0.55} L${x + iw - 4},${y + iw * 0.25} L${x + iw - 4},${y + iw * 0.76} L${x + 4},${y + iw * 0.76} Z`, fill: "#ffffff", opacity: 0.35 }));
      }
      if (s.dtp >= 2) svg.append(S("rect", { x: 0, y: divY + 18 + iw * 0.5, width: 240, height: 22, fill: yel, opacity: 0.45 }));
      if (s.logo) svg.append(g({}, S("circle", { cx: 240 - m - 18, cy: 340 - m - 18, r: 16, fill: "#fff", stroke: yel, "stroke-width": 3 }), S("path", { d: `M${240 - m - 26},${340 - m - 12} L${240 - m - 18},${340 - m - 28} L${240 - m - 10},${340 - m - 12} Z`, fill: red })));
      if (mess) for (let i = 0; i < 6; i++) svg.append(S("circle", { cx: 30 + i * 37, cy: 100 + (i % 2) * 120, r: 6 + i, fill: [red, yel, navy][i % 3], opacity: 0.5 }));
      if (imp === 3 && s.structure) svg.append(S("line", { x1: m, y1: divY - 6, x2: m + 60, y2: divY - 6, stroke: red, "stroke-width": 3 }));
      if (!s.link) svg.append(S("text", { x: 120, y: 336, "font-size": 11, "text-anchor": "middle", fill: "#555", text: "(new idea: not from 2(b))" }));
    }
    function paint() {
      const s = st;
      const items = [
        ["Structure and proportion", s.structure ? 1 : 0, 1, "Set the document size first, mark the divide, and keep every word inside the border."],
        ["Link to planning", s.link ? 1 : 0, 1, "Build the final from one of your thumbnails, so the marker can see the plan grow."],
        ["Logo, colours, images, copy", s.logo && s.cmyk && s.images && s.copy ? 1 : 0, 1, "This mark needs all four: " + [["logo", s.logo], ["three CMYK colours", s.cmyk], ["three images", s.images], ["copy text", s.copy]].filter((x) => !x[1]).map((x) => x[0]).join(", ") + " missing."],
        ["Contrasting fonts", s.fonts === 2 ? 1 : 0, 1, "Pair a strong display face for the headline with a plain face for copy, and use each consistently."],
        ["Elements and principles from 2(b)", s.ep, 2, "Make each named element or principle obvious: a real focal point for emphasis, a real grid for alignment."],
        ["DTP techniques from 2(b)", s.dtp, 2, "Each named technique should do a visible job (reverse to lift a headline, text wrap round a shape)."],
        ["Skill and visual impact", s.impact, 3, "Fewer things, aligned to a grid, one dominant item, white space left on purpose, and a clean finish."],
      ];
      const tot = items.reduce((a, x) => a + x[1], 0);
      const gaps = items.filter((x) => x[1] < x[2]).map((x) => ({ name: x[0], gap: x[2] - x[1], tip: x[3] }));
      out.innerHTML = `<p class="readout">Your 2(c) self-mark: ${tot} / 11</p><div class="as-bar" aria-hidden="true"><i style="width:${tot / 11 * 100}%"></i></div>` +
        `<table class="as-mini"><tbody>${items.map((x) => `<tr><td>${x[0]}</td><td class="num">${x[1]} / ${x[2]}</td></tr>`).join("")}</tbody></table>` +
        (gaps.length ? `<p><strong>Next fix:</strong> ${gaps[0].name} (up to ${gaps[0].gap} mark${gaps[0].gap > 1 ? "s" : ""}). ${gaps[0].tip}</p>` : `<p class="ok">Full marks on every criterion, as you judged it. Now ask someone else to judge it the same way.</p>`);
      ask.textContent = ["Impact 0: can anyone tell what the poster is for from across the room?", "Impact 1: is there a single item the eye goes to first?", "Impact 2: are the edges of every item lined up on a grid, and is there deliberate white space?", "Impact 3: would it pass as professional work next to a real recruitment poster?"][s.impact];
      poster();
      svg.setAttribute("aria-label", `Preview poster built from your answers. Self-mark ${tot} out of 11.`);
    }
    document.addEventListener("hm-theme", paint);
    paint();
  });

  /* ================================================================
     4 · The lighting rig: lighting and render-quality ladders
     ================================================================ */
  mount("w-light", (box) => {
    const st = { az: 125, el: 42, fill: 0.25, inten: 1, shadows: true, floating: false, samp: 3, res: 1 };
    const SAMPLES = [1, 4, 16, 64, 256], BLOCK = { 6: "Screen-sized, stretched to A3", 3: "Medium", 1: "Print size (A3 at 300 ppi)" };
    const cv = el("canvas", { class: "sim", role: "img", "aria-label": "Rendered deck scene" });
    box.append(cv);
    const ctr = el("div", { class: "sim-controls" });
    box.append(ctr);
    const rd = el("div", { class: "as-score", "aria-live": "polite" });
    const redraw = () => { sim.redraw(); };
    HG.slider(ctr, { label: "Light direction (round)", min: 0, max: 355, step: 5, value: st.az, unit: "°", oninput: (v) => { st.az = v; redraw(); } });
    HG.slider(ctr, { label: "Light height", min: 5, max: 85, step: 1, value: st.el, unit: "°", oninput: (v) => { st.el = v; redraw(); } });
    HG.slider(ctr, { label: "Fill (ambient) light", min: 0, max: 0.8, step: 0.05, value: st.fill, fmt: (v) => Math.round(v * 100) + "%", oninput: (v) => { st.fill = v; redraw(); } });
    HG.slider(ctr, { label: "Exposure", min: 0.4, max: 1.8, step: 0.05, value: st.inten, fmt: (v) => "×" + HG.n(v, 2), oninput: (v) => { st.inten = v; redraw(); } });
    HG.slider(ctr, { label: "Render samples", min: 0, max: 4, step: 1, value: st.samp, fmt: (v) => String(SAMPLES[v]), oninput: (v) => { st.samp = v; redraw(); } });
    const segs = el("div");
    box.append(segs);
    HG.choice(segs, "Shadows:", [[true, "On"], [false, "Off"]], st.shadows, (v) => { st.shadows = v; redraw(); });
    HG.choice(segs, "Models:", [[false, "Resting on the deck"], [true, "Floating"]], st.floating, (v) => { st.floating = v; redraw(); });
    HG.choice(segs, "Output size:", [[6, BLOCK[6]], [3, BLOCK[3]], [1, BLOCK[1]]], st.res, (v) => { st.res = v; redraw(); });
    const row = el("div", { class: "btn-row" });
    box.append(row, rd);
    const off = document.createElement("canvas"), octx = off.getContext("2d");
    const BOXES = [{ c: [-1.3, -0.7], s: [1.3, 1.3, 1.3], col: [176, 128, 74], name: "crate" }, { c: [1.0, 0.9], s: [2.0, 1.0, 0.8], col: [70, 104, 160], name: "carriage block" }];
    const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const hull = (ps) => { ps = ps.slice().sort((a, c) => a[0] - c[0] || a[1] - c[1]); const cr = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]); const lo = [], up = []; for (const p of ps) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (const p of ps.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
    function lightVec() { const a = st.az * Math.PI / 180, e = st.el * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]; }
    function bright(n, Lv) { return (st.fill + (1 - st.fill) * Math.max(0, dot(n, Lv))) * st.inten; }
    function assess() {
      const Lv = lightVec(), b = BOXES[1];
      const f = [[0, 0, 1], [1, 0, 0], [0, 1, 0]].map((n) => bright(n, Lv));
      const spread = Math.max(...f) - Math.min(...f), maxB = Math.max(...f);
      const probs = [];
      let lit;
      if (!st.shadows) lit = [0, "Limited: no cast shadows, so nothing looks grounded."];
      else if (spread < 0.12) lit = [0, "Limited: the three visible faces are almost the same tone, so the form disappears (light behind the camera, or too much fill)."];
      else {
        if (maxB > 1.15) probs.push("over-exposed (faces burn out to white)");
        if (maxB < 0.5) probs.push("under-exposed (too dark)");
        if (st.fill < 0.1) probs.push("no fill light, so shadows are pure black");
        if (st.el > 75) probs.push("light from almost straight overhead flattens the sides");
        if (st.el < 12) probs.push("light so low the shadows stretch across the scene");
        if (spread < 0.25) probs.push("faces differ only a little in tone");
        lit = probs.length ? [1, "Good: shadows and tone are there, but " + probs.join("; ") + "."] : [2, "Skilled: faces in clearly different tones, attached shadows, sensible exposure."];
      }
      const s = SAMPLES[st.samp];
      let rq;
      if (st.res >= 6 || s <= 4) rq = [0, `Poor: ${st.res >= 6 ? "a screen-sized image stretched to A3 shows its pixels" : "so few samples leave heavy grain"}.`];
      else if (st.res >= 3 || s <= 16) rq = [1, `Good: ${st.res >= 3 ? "some pixelation at print size" : "some grain left; let it render longer"}.`];
      else rq = [2, "High: print-size output and enough samples, so no pixels or grain."];
      const site = st.floating ? [0, "Not sited: the models float, and their shadows have come away from them."] : [1, "Sited: every model rests on the deck and its shadow touches its base."];
      return { lit, rq, site, f, spread };
    }
    const sim = HG.sim(cv, {
      w: 640, h: 480, height: (w) => Math.round(w * 0.72),
      draw(ctx, t, dt, C, api) {
        if (api.playing) { st.az = (st.az + dt * 40) % 360; }
        const W = api.w, H = api.h, bs = st.res;
        const sc = bs === 1 ? Math.min(2, api.scale) : 1 / bs;
        off.width = Math.max(1, Math.round(W * sc)); off.height = Math.max(1, Math.round(H * sc));
        const o = octx;
        o.setTransform(sc, 0, 0, sc, 0, 0);
        o.fillStyle = "#cfd8e3"; o.fillRect(0, 0, W, H);
        const u = Math.min(W / 11, H / 9.2), cx = W / 2, cy = H / 2 + 1.3 * u;
        const Pj = (x, y, z) => [cx + (x - y) * 0.866 * u, cy + (x + y) * 0.5 * u - z * u];
        const Lv = lightVec();
        const shade = (rgb, k) => `rgb(${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c * k)))).join(",")})`;
        const poly = (pts, fill) => { o.beginPath(); pts.forEach((p, i) => (i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1]))); o.closePath(); o.fillStyle = fill; o.fill(); };
        // bulkhead (back walls) and deck planks
        const wallK = bright([1, 0, 0], Lv), wallK2 = bright([0, 1, 0], Lv);
        poly([Pj(-3, -3, 0), Pj(-3, 3, 0), Pj(-3, 3, 2.6), Pj(-3, -3, 2.6)], shade([150, 120, 92], Math.max(wallK, 0.15)));
        poly([Pj(-3, -3, 0), Pj(3, -3, 0), Pj(3, -3, 2.6), Pj(-3, -3, 2.6)], shade([140, 112, 86], Math.max(wallK2, 0.15)));
        const deckK = bright([0, 0, 1], Lv);
        poly([Pj(-3, -3, 0), Pj(3, -3, 0), Pj(3, 3, 0), Pj(-3, 3, 0)], shade([196, 160, 112], deckK));
        o.strokeStyle = "rgba(60,40,20,.35)"; o.lineWidth = 1;
        for (let i = -3; i <= 3; i += 0.6) { const a = Pj(i, -3, 0), b = Pj(i, 3, 0); o.beginPath(); o.moveTo(a[0], a[1]); o.lineTo(b[0], b[1]); o.stroke(); }
        // gun port in the bulkhead: daylight
        poly([Pj(-3, 0.4, 1.0), Pj(-3, 1.6, 1.0), Pj(-3, 1.6, 1.9), Pj(-3, 0.4, 1.9)], "#f4f1e0");
        const lift = st.floating ? 0.45 : 0;
        // shadows on the deck (computed: project every corner along the light onto z = 0)
        if (st.shadows && Lv[2] > 0.05) {
          o.fillStyle = `rgba(20,16,10,${0.55 * (1 - st.fill)})`;
          BOXES.forEach((b) => {
            const [x, y] = b.c, [sx, sy, sz] = b.s, pts = [];
            for (const X of [x - sx / 2, x + sx / 2]) for (const Y of [y - sy / 2, y + sy / 2]) for (const Z of [lift, lift + sz]) pts.push([X - Lv[0] / Lv[2] * Z, Y - Lv[1] / Lv[2] * Z]);
            const h2 = hull(pts).map(([X, Y]) => Pj(Math.max(-3, Math.min(3, X)), Math.max(-3, Math.min(3, Y)), 0));
            o.beginPath(); h2.forEach((p, i) => (i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1]))); o.closePath(); o.fill();
          });
        }
        // boxes, far first
        const V = norm([1, 1, 1]);
        BOXES.slice().sort((a, b) => (a.c[0] + a.c[1]) - (b.c[0] + b.c[1])).forEach((b) => {
          const [x, y] = b.c, [sx, sy, sz] = b.s, x0 = x - sx / 2, x1 = x + sx / 2, y0 = y - sy / 2, y1 = y + sy / 2, z0 = lift, z1 = lift + sz;
          const faces = [
            [[0, 0, 1], [Pj(x0, y0, z1), Pj(x1, y0, z1), Pj(x1, y1, z1), Pj(x0, y1, z1)]],
            [[1, 0, 0], [Pj(x1, y0, z1), Pj(x1, y1, z1), Pj(x1, y1, z0), Pj(x1, y0, z0)]],
            [[0, 1, 0], [Pj(x0, y1, z1), Pj(x1, y1, z1), Pj(x1, y1, z0), Pj(x0, y1, z0)]],
          ];
          faces.forEach(([n, pts]) => {
            poly(pts, shade(b.col, bright(n, Lv) * 1.15));
            const Hh = norm([Lv[0] + V[0], Lv[1] + V[1], Lv[2] + V[2]]), spec = Math.pow(Math.max(0, dot(n, Hh)), 24) * st.inten;
            if (spec > 0.02 && dot(n, Lv) > 0) poly(pts, `rgba(255,255,255,${Math.min(0.55, spec * 0.6)})`);
            o.strokeStyle = "rgba(0,0,0,.45)"; o.lineWidth = 1; o.beginPath(); pts.forEach((p, i) => (i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1]))); o.closePath(); o.stroke();
          });
          if (b.name === "crate") { const a = Pj(x1, y0 + 0.1, z0 + 0.15), c = Pj(x1, y1 - 0.1, z1 - 0.15); o.strokeStyle = "rgba(60,35,10,.6)"; o.beginPath(); o.moveTo(a[0], a[1]); o.lineTo(c[0], c[1]); o.stroke(); }
        });
        // grain: noise falls as samples rise
        const amp = 0.6 / Math.pow(SAMPLES[st.samp], 0.75) * 255;
        if (amp > 9) {
          const img = o.getImageData(0, 0, off.width, off.height), d = img.data;
          let seed = 1234567;
          for (let i = 0; i < d.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const nz = ((seed / 0x7fffffff) - 0.5) * amp; d[i] += nz; d[i + 1] += nz; d[i + 2] += nz; }
          o.putImageData(img, 0, 0);
        }
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = bs === 1;
        ctx.drawImage(off, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
        // light marker (not part of the render)
        const lp = [cx + (Lv[0] - Lv[1]) * 0.866 * u * 3.6, cy + (Lv[0] + Lv[1]) * 0.5 * u * 3.6 - Lv[2] * u * 3.2];
        HG.dot(ctx, Math.max(14, Math.min(W - 14, lp[0])), Math.max(14, Math.min(H - 14, lp[1])), "#ffd23f", 8, "#5a4300");
        HG.label(ctx, "light", Math.max(14, Math.min(W - 14, lp[0])) + 12, Math.max(14, Math.min(H - 14, lp[1])), { size: 12, haloCol: "#ffffff", col: "#222" });
        report();
      },
    });
    const play = HG.playButton(sim, ["▶ Orbit the light", "❚❚ Stop orbit"]);
    row.append(play);
    function report() {
      const a = assess();
      const li = (lab, r, max) => `<li><strong>${lab}: ${r[0]} / ${max}</strong> · ${r[1]}</li>`;
      rd.innerHTML = `<ul class="as-reslist">${li("Lighting, highlights, shadows", a.lit, 2)}${li("Render quality", a.rq, 2)}${li("Siting", a.site, 1)}</ul>`;
      cv.setAttribute("aria-label", `Rendered deck scene with a crate and a gun-carriage block. Light from ${st.az} degrees round and ${st.el} degrees up; shadows ${st.shadows ? "on" : "off"}; models ${st.floating ? "floating" : "resting on the deck"}; ${SAMPLES[st.samp]} samples; ${BLOCK[st.res].toLowerCase()}. Lighting ${a.lit[0]} of 2, render quality ${a.rq[0]} of 2.`);
    }
    report();
  });

  /* ================================================================
     5 · Line up the projectors: third-angle sketch alignment
     ================================================================ */
  mount("w-align", (box) => {
    // the L-block of figure 5.1, in units: W 6, D 4, H 4, base 1.5 thick, upright 2.5 wide, hole Ø1.2 at x 4.5, y 2
    const OW = 6, OD = 4, OH = 4, OT = 1.5, OU = 2.5, HX = 4.5, HR = 0.6;
    let u = 20, L = {}; // layout
    const st = { plan: { dx: 1.3, dy: -0.4, s: 1.12 }, end: { dx: 0.2, dy: 0.7, s: 0.9 }, hidden: true }; // offsets in units from the correct place
    const segs = el("div");
    box.append(segs);
    HG.choice(segs, "Hidden detail:", [[true, "Shown"], [false, "Left out"]], st.hidden, (v) => { st.hidden = v; draw(); });
    const ctr = el("div", { class: "sim-controls" });
    box.append(ctr);
    const sP = HG.slider(ctr, { label: "Plan sketched at", min: 80, max: 120, step: 1, value: Math.round(st.plan.s * 100), unit: "%", oninput: (v) => { st.plan.s = v / 100; draw(); } });
    const sE = HG.slider(ctr, { label: "End elevation sketched at", min: 80, max: 120, step: 1, value: Math.round(st.end.s * 100), unit: "%", oninput: (v) => { st.end.s = v / 100; draw(); } });
    const bRe = el("button", { class: "btn small", type: "button" }, "↺ Re-sketch");
    const bShow = el("button", { class: "btn small primary", type: "button" }, "Show me");
    box.append(el("div", { class: "btn-row" }, bRe, bShow));
    const host = el("div", { class: "as-align-svg" });
    box.append(host);
    const out = el("div", { class: "as-score", "aria-live": "polite" });
    box.append(out);
    let view = null;
    view = fluid(host, (w) => { u = Math.max(14, Math.min(26, (w - 8) / 20.2)); return u * 18.4; }, () => { if (view) draw(); });
    function layout() {
      const ex = 7 * u, ey = 1.7 * u + OD * u + 1.6 * u; // elevation top
      L = { ex, top: ey, eg: ey + OH * u, plan: { x: ex, y: ey - 1.4 * u - OD * u }, end: { x: ex + OW * u + 1.4 * u, y: ey } };
    }
    const pos = (k) => ({ x: L[k].x + st[k].dx * u, y: L[k].y + st[k].dy * u, s: st[k].s });
    function draw() {
      const svg = view.svg, C = HG.colors();
      layout();
      svg.textContent = "";
      const ln = (x1, y1, x2, y2, o = {}) => S("line", { x1, y1, x2, y2, stroke: o.c || C.ink, "stroke-width": o.w || 2, ...(o.dash ? { "stroke-dasharray": o.dash } : {}), "stroke-linecap": "round" });
      const p = pos("plan"), e = pos("end"), tol = 0.22 * u;
      // projectors from the elevation
      const vx = [0, OU, HX - HR, HX + HR, OW].map((x) => L.ex + x * u);
      const planX = [0, OU, HX - HR, HX + HR, OW].map((x) => p.x + x * u * p.s);
      const hy = [0, OT, OH].map((z) => L.eg - z * u);
      const endY = [0, OT, OH].map((z) => e.y + OH * u * e.s - z * u * e.s);
      const W = view.w, Hh = u * 18.4;
      vx.forEach((x, i) => svg.append(ln(x, 4, x, Hh - 4, { c: Math.abs(planX[i] - x) <= tol ? C.grass : C.muted, w: 1, dash: "3 4" })));
      hy.forEach((y, i) => svg.append(ln(4, y, W - 4, y, { c: Math.abs(endY[i] - y) <= tol ? C.grass : C.muted, w: 1, dash: "3 4" })));
      // elevation (fixed)
      const el0 = S("g", null);
      el0.append(S("path", { d: `M${L.ex},${L.eg} h${OW * u} v${-OT * u} h${-(OW - OU) * u} v${-(OH - OT) * u} h${-OU * u} Z`, fill: C.card, stroke: C.ink, "stroke-width": 2.4, "stroke-linejoin": "round" }));
      if (st.hidden) [HX - HR, HX + HR].forEach((x) => el0.append(ln(L.ex + x * u, L.eg - OT * u, L.ex + x * u, L.eg, { w: 1.5, dash: "5 4" })));
      el0.append(S("text", { x: L.ex + OW * u / 2, y: L.eg + 18, "text-anchor": "middle", "font-size": 13, fill: C.ink, "font-weight": 700, text: "ELEVATION (fixed)" }));
      svg.append(el0);
      // plan (draggable)
      const gp = S("g", { class: "as-drag", tabindex: "0", role: "button", "aria-label": "Plan view. Drag, or use the arrow keys, to move it." , "data-k": "plan" });
      const ps = u * p.s;
      gp.append(S("rect", { x: p.x, y: p.y, width: OW * ps, height: OD * ps, fill: C.card, "fill-opacity": 0.85, stroke: C.sea, "stroke-width": 2.4 }));
      gp.append(ln(p.x + OU * ps, p.y, p.x + OU * ps, p.y + OD * ps, { c: C.sea, w: 2.4 }));
      gp.append(S("circle", { cx: p.x + HX * ps, cy: p.y + OD * ps / 2, r: HR * ps, fill: "none", stroke: C.sea, "stroke-width": 2.4 }));
      gp.append(S("text", { x: p.x + OW * ps / 2, y: p.y - 6, "text-anchor": "middle", "font-size": 13, fill: C.sea, "font-weight": 700, text: "PLAN" }));
      svg.append(gp);
      // end elevation from the right (draggable): front face on its left
      const ge = S("g", { class: "as-drag", tabindex: "0", role: "button", "aria-label": "End elevation, the view from the right. Drag, or use the arrow keys, to move it.", "data-k": "end" });
      const es = u * e.s;
      ge.append(S("rect", { x: e.x, y: e.y, width: OD * es, height: OH * es, fill: C.card, "fill-opacity": 0.85, stroke: C.red, "stroke-width": 2.4 }));
      ge.append(ln(e.x, e.y + (OH - OT) * es, e.x + OD * es, e.y + (OH - OT) * es, { c: C.red, w: 2.4 }));
      if (st.hidden) [OD / 2 - HR, OD / 2 + HR].forEach((x) => ge.append(ln(e.x + x * es, e.y + (OH - OT) * es, e.x + x * es, e.y + OH * es, { c: C.red, w: 1.5, dash: "5 4" })));
      ge.append(S("text", { x: e.x + OD * es / 2, y: e.y + OH * es + 18, "text-anchor": "middle", "font-size": 13, fill: C.red, "font-weight": 700, text: "END ELEV." }));
      svg.append(ge);
      [gp, ge].forEach((g) => {
        g.addEventListener("keydown", (ev) => {
          const k = g.getAttribute("data-k"), stp = ev.shiftKey ? 0.5 : 0.1;
          const m = { ArrowLeft: [-stp, 0], ArrowRight: [stp, 0], ArrowUp: [0, -stp], ArrowDown: [0, stp] }[ev.key];
          if (!m) return;
          ev.preventDefault(); st[k].dx += m[0]; st[k].dy += m[1]; clamp(k); draw();
          const again = view.svg.querySelector(`[data-k="${k}"]`); if (again) again.focus();
        });
      });
      // checks
      const planAbove = p.y + OD * ps < L.top - 0.2 * u, planBelow = p.y > L.eg + 0.2 * u;
      const planAl = Math.abs(p.x - L.ex) <= tol && Math.abs(p.s - 1) <= 0.06;
      const endRight = e.x > L.ex + OW * u + 0.2 * u, endLeft = e.x + OD * es < L.ex - 0.2 * u;
      const endAl = Math.abs(e.y + OH * es - L.eg) <= tol && Math.abs(e.s - 1) <= 0.06;
      const propP = Math.abs(p.s - 1) <= 0.06, propE = Math.abs(e.s - 1) <= 0.06;
      const ck = (ok, txt) => `<li>${ok ? "<span class='ok'>✔</span>" : "<span class='bad'>✘</span>"} ${txt}</li>`;
      const lines = [
        ck(planAbove, planAbove ? "Plan above the elevation: third angle." : planBelow ? "Plan below the elevation: that is the first-angle position." : "Move the plan clear of the elevation, above it."),
        ck(planAl, planAl ? "Plan projected and aligned: every vertical projector meets its edge." : `Plan out of line: ${Math.abs(p.x - L.ex) > tol ? `${Math.abs(p.x - L.ex) < 0.6 * u ? "a little" : "well"} ${p.x > L.ex ? "too far right" : "too far left"}` : "position fine"}${propP ? "" : `, and sketched at ${Math.round(p.s * 100)}% size`}.`),
        ck(endRight, endRight ? "End elevation on the right: correct for the view from the right." : endLeft ? "The view from the right belongs on the right in third angle." : "Move the end elevation clear of the elevation."),
        ck(endAl, endAl ? "End elevation aligned: the horizontal projectors meet its edges." : "End elevation out of line with the elevation's heights."),
        ck(propP && propE, propP && propE ? "Fair proportions: depth in the plan equals width in the end elevation." : "Proportion: a view is sketched too big or too small (projectors cannot all meet)."),
        ck(st.hidden, st.hidden ? "Hidden detail of the hole shown dashed." : "Hidden detail left out: the hole inside the base is invisible."),
      ];
      const mk = 1 + (propP ? 1 : 0) + (planAbove && planAl ? 1 : 0) + (st.hidden ? 1 : 0);
      out.innerHTML = `<p class="readout">2025 Task 3-style marks (elevation and plan): ${mk} / 4</p><ul class="as-reslist">${lines.join("")}</ul><p class="as-muted">The elevation's own mark is given here, because it is drawn for you.</p>`;
      svg.setAttribute("aria-label", `Third-angle layout. ${[planAbove ? "Plan above" : "Plan not above", planAl ? "aligned" : "not aligned", endRight ? "end elevation on the right" : "end elevation not on the right", endAl ? "aligned" : "not aligned"].join(", ")}. Score ${mk} of 4.`);
    }
    function clamp(k) { st[k].dx = Math.max(-7, Math.min(k === "plan" ? 6 : 0.6, st[k].dx)); st[k].dy = k === "plan" ? Math.max(-1, Math.min(7.2, st[k].dy)) : Math.max(-6.6, Math.min(6, st[k].dy)); }
    let drag = null, grab = null;
    view.svg.addEventListener("pointerdown", (ev) => {
      const g = ev.target.closest && ev.target.closest(".as-drag");
      if (!g) return;
      const k = g.getAttribute("data-k"), pt = svgPoint(view.svg, ev);
      drag = k; grab = [pt.x / u - st[k].dx, pt.y / u - st[k].dy];
      view.svg.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    view.svg.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const pt = svgPoint(view.svg, ev);
      st[drag].dx = pt.x / u - grab[0]; st[drag].dy = pt.y / u - grab[1];
      // snap when close, as a sketcher "feels" the projector
      if (Math.abs(st[drag].dx) < 0.12 && drag === "plan") st[drag].dx = 0;
      if (Math.abs(st[drag].dy) < 0.12 && drag === "end") st[drag].dy = 0;
      clamp(drag); draw();
    });
    const end = () => { drag = null; };
    view.svg.addEventListener("pointerup", end); view.svg.addEventListener("pointercancel", end);
    bRe.addEventListener("click", () => {
      const r = (a, b) => a + Math.random() * (b - a);
      st.plan = { dx: r(-1.5, 1.5), dy: Math.random() < 0.3 ? 6.4 : r(-0.6, 0.2), s: Math.round(r(0.85, 1.15) * 100) / 100 };
      st.end = { dx: Math.random() < 0.3 ? -12 : r(-0.2, 0.8), dy: r(-1, 1), s: Math.round(r(0.85, 1.15) * 100) / 100 };
      st.end.dx = Math.max(-7, st.end.dx);
      sP.sync(Math.round(st.plan.s * 100)); sE.sync(Math.round(st.end.s * 100)); draw();
    });
    bShow.addEventListener("click", () => {
      const a = [st.plan.dx, st.plan.dy, st.plan.s, st.end.dx, st.end.dy, st.end.s];
      tween(a, [0, 0, 1, 0, 0, 1], 900, (v) => { [st.plan.dx, st.plan.dy, st.plan.s, st.end.dx, st.end.dy, st.end.s] = v; draw(); }, () => { sP.sync(100); sE.sync(100); st.hidden = true; segs.querySelectorAll(".seg-btn").forEach((b, i) => b.setAttribute("aria-pressed", i === 0 ? "true" : "false")); draw(); });
    });
    draw();
  });

  /* ================================================================
     6 · The commission review: self-assessment grid for the mock brief
     ================================================================ */
  mount("w-mockgrid", (box) => {
    const A = "Production", P = "Promotional", R = "Preliminary";
    const ROWS = [
      ["A", A, "a1", "A(a) Body modelled accurately", 1, 0], ["A", A, "a2", "A(a) Three related views, data-sheet orientation", 1, 0], ["A", A, "a3", "A(a) Hidden detail", 1, 1], ["A", A, "a4", "A(a) Dimensions for manufacture", 1, 0],
      ["A", A, "b1", "A(b) Truck: revolve and radial array accurate", 1, 0], ["A", A, "b2", "A(b) Plan with hidden detail", 1, 1], ["A", A, "b3", "A(b) Sectional elevation, hatched correctly", 1, 0], ["A", A, "b4", "A(b) Detail view of the bore, 3+ dimensions", 1, 1],
      ["A", A, "c1", "A(c) Assembly accurate, no gaps or overlaps", 1, 0], ["A", A, "c2", "A(c) Sectional end elevation, axle not hatched", 1, 0], ["A", A, "c3", "A(c) Stepped section correct", 1, 0], ["A", A, "c4", "A(c) Enlarged view of truck on axle", 1, 1],
      ["A", A, "d1", "A(d) Exploded isometric line drawing", 1, 0], ["A", A, "d2", "A(d) Alignment, spacing and order", 1, 0],
      ["A", A, "e1", "A(e) Every dimension type used", 1, 1], ["A", A, "e2", "A(e) Template items", 1, 1], ["A", A, "e3", "A(e) Every view type labelled", 1, 1], ["A", A, "e4", "A(e) Line types correct", 1, 1],
      ["B", P, "ba1", "B(a) Models sited on the deck, scaled", 1, 1], ["B", P, "ba2", "B(a) Materials as specified", 1, 1], ["B", P, "ba3", "B(a) Crest decal on the bulkhead", 1, 1], ["B", P, "ba4", "B(a) Lighting, highlights, shadows", 2, 0], ["B", P, "ba5", "B(a) Render quality", 2, 0],
      ["B", R, "bb1", "B(b) Two different ideas, with the divide", 1, 0], ["B", R, "bb2", "B(b) Two elements/principles identified", 1, 1], ["B", R, "bb3", "B(b) Two DTP techniques identified", 1, 1], ["B", R, "bb4", "B(b) All required items on both", 1, 1], ["B", R, "bb5", "B(b) Clarity of layouts", 2, 0],
      ["B", P, "bc1", "B(c) Structure, proportion, divide", 1, 1], ["B", P, "bc2", "B(c) Link to the 2(b)-style planning", 1, 1], ["B", P, "bc3", "B(c) Crest, colours, images, copy", 1, 1], ["B", P, "bc4", "B(c) Two contrasting fonts", 1, 0], ["B", P, "bc5", "B(c) Elements/principles from B(b)", 2, 0], ["B", P, "bc6", "B(c) DTP techniques from B(b)", 2, 0], ["B", P, "bc7", "B(c) Skill and visual impact", 3, 0],
      ["C", R, "ca1", "C(a) Quoin: fair proportion", 1, 0], ["C", R, "ca2", "C(a) Isometric axes correct", 1, 0], ["C", R, "ca3", "C(a) Line quality", 1, 0], ["C", R, "ca4", "C(a) Handle drawn as an isometric ellipse", 1, 0],
      ["C", R, "cb1", "C(b) Elevation, fair proportion", 1, 0], ["C", R, "cb2", "C(b) Plan, fair proportion", 1, 0], ["C", R, "cb3", "C(b) Third angle, projected and aligned", 1, 1], ["C", R, "cb4", "C(b) Hidden detail of the hole", 1, 1],
    ];
    const keep = store("hg-asg-mock.v1");
    const got = Object.assign({}, keep.get({}));
    const sum = el("div", { class: "as-score", "aria-live": "polite" });
    const tw = el("div", { class: "table-wrap" });
    const table = el("table", { class: "as-mock" });
    tw.append(table);
    const reset = el("button", { class: "btn small", type: "button" }, "↺ Clear my marks");
    box.append(sum, tw, el("div", { class: "btn-row" }, reset));
    const head = el("thead", null, el("tr", null, el("th", null, "Criterion"), el("th", { class: "as-area" }, "Area"), el("th", null, "Your mark")));
    const body = el("tbody");
    table.append(head, body);
    let lastTask = "";
    ROWS.forEach(([task, area, id, label, max]) => {
      if (task !== lastTask) { body.append(el("tr", { class: "as-mock-task" }, el("th", { colspan: "3", scope: "colgroup" }, { A: "Task A · production · 18", B: "Task B · promotional and preliminary · 24", C: "Task C · preliminary sketches · 8" }[task]))); lastTask = task; }
      const cell = el("td");
      const g = el("div", { class: "seg", role: "group", "aria-label": `${label}, out of ${max}` });
      for (let v = 0; v <= max; v++) {
        const b = el("button", { type: "button", class: "seg-btn", "aria-pressed": (got[id] || 0) === v ? "true" : "false" }, `${v}`);
        b.addEventListener("click", () => { got[id] = v; keep.set(got); g.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-pressed", i === v ? "true" : "false")); paint(); });
        g.append(b);
      }
      cell.append(g);
      body.append(el("tr", null, el("td", null, label, el("span", { class: "as-muted" }, ` /${max}`)), el("td", { class: "as-area" }, area), cell));
    });
    reset.addEventListener("click", () => { Object.keys(got).forEach((k) => delete got[k]); keep.set(got); body.querySelectorAll(".seg").forEach((g) => g.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", i === 0 ? "true" : "false"))); paint(); });
    function paint() {
      const by = (f) => ROWS.filter(f).reduce((a, r) => [a[0] + (got[r[2]] || 0), a[1] + r[4]], [0, 0]);
      const tot = by(() => true), tasks = ["A", "B", "C"].map((t) => [t, by((r) => r[0] === t)]), areas = [R, A, P].map((a) => [a, by((r) => r[1] === a)]);
      const quick = ROWS.filter((r) => (got[r[2]] || 0) < r[4]).sort((a, b) => b[5] - a[5] || (b[4] - (got[b[2]] || 0)) - (a[4] - (got[a[2]] || 0))).slice(0, 4);
      const bar = (n, m) => `<span class="as-bar as-bar-inline" aria-hidden="true"><i style="width:${m ? n / m * 100 : 0}%"></i></span>`;
      sum.innerHTML = `<p class="readout">Total: ${tot[0]} / 50 (${Math.round(tot[0] / 50 * 100)}%)</p>` +
        `<div class="as-tally">${tasks.map(([t, v]) => `<div><b>Task ${t}: ${v[0]} / ${v[1]}</b>${bar(v[0], v[1])}</div>`).join("")}${areas.map(([a, v]) => `<div><b>${a}: ${v[0]} / ${v[1]}</b>${bar(v[0], v[1])}</div>`).join("")}</div>` +
        (quick.length ? `<p><strong>Win back first:</strong> ${quick.map((r) => r[3].replace(/^\S+ /, "") + (r[5] ? " (quick: a habit, not a skill)" : "")).join("; ")}.</p>` : `<p class="ok">Every mark awarded. Ask a classmate to mark it too: honest self-marking is harder than it looks.</p>`);
    }
    paint();
  });

  /* ================================================================
     7 · The last-week muster: a checklist that remembers
     ================================================================ */
  mount("w-lastweek", (box) => {
    const ITEMS = [
      ["Kit", "My A3 CAD template is ready: border, title block fields, third-angle symbol, ALL SIZES IN mm, a tolerance note."],
      ["Kit", "I know how to print A3 from both CAD and DTP software, and how long a full-quality render takes on a school computer."],
      ["Kit", "Sketching kit packed: pencils, eraser, a straight edge. No circle templates, no compasses."],
      ["Production", "I can generate projected views, a full section, a stepped section and a detail view from a model without help."],
      ["Production", "Hatching: 45°, adjacent parts different, no hatching on webs, shafts, bolts, nuts or washers."],
      ["Production", "I can apply chain, parallel, radial, diameter and angular dimensions and label every view."],
      ["Production", "I can constrain an assembly with no gaps or overlaps and produce an exploded isometric line drawing."],
      ["Promotional", "I can place STEP files, apply materials and a decal, and set a camera to match a given viewpoint."],
      ["Promotional", "I can light a scene with attached shadows and render at print resolution with no grain."],
      ["Promotional", "I can name every design element, principle and DTP term in the specification and say what each does."],
      ["Promotional", "I can set up a DTP document to given sizes with a grid, and enter CMYK values exactly."],
      ["Sketching", "I have sketched a three-view orthographic, an isometric and a two-point perspective freehand, each in under 20 minutes."],
      ["Exam", "I write reasons as cause and effect: 'I used X so that Y'."],
    ];
    const keep = store("hg-asg-week.v1");
    const done = new Set(keep.get([]));
    const top = el("div", { class: "as-muster" });
    const bar = el("div", { class: "as-bar", "aria-hidden": "true" }, el("i"));
    const txt = el("p", { class: "readout", "aria-live": "polite" });
    top.append(txt, bar);
    box.append(top);
    let group = "";
    let list = null;
    ITEMS.forEach(([g, t], i) => {
      if (g !== group) { group = g; box.append(el("p", { class: "as-group" }, g)); list = el("div", { class: "as-checks" }); box.append(list); }
      const id = "as-lw-" + i, cb = el("input", { type: "checkbox", id });
      cb.checked = done.has(i);
      cb.addEventListener("change", () => { cb.checked ? done.add(i) : done.delete(i); keep.set([...done]); paint(); });
      list.append(el("label", { for: id, class: "as-cb" }, cb, " " + t));
    });
    function paint() {
      const n = done.size, N = ITEMS.length;
      bar.firstChild.style.width = (n / N * 100) + "%";
      txt.textContent = n === N ? `All ${N} mustered. Ready for the commission.` : `${n} of ${N} ready`;
    }
    paint();
  });
})();
