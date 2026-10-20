/* Design & DTP: the widgets. Colours, sizes, grids and file sizes are computed from the same rules the text teaches. */
(function () {
  "use strict";
  const HG = window.HG;
  const $ = (id) => document.getElementById(id);
  const E = HG.el, S = HG.svg;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  /* poster palette: these are printed colours, so they stay the same in both themes */
  const P = { navy: "#1b2a4a", red: "#c8102e", yellow: "#f5c400", blue: "#0a6ebd", sky: "#8cc4ec", paper: "#fffdf6", ink: "#16141a", grey: "#5a5550", green: "#3c8d2f", dirt: "#7a5532" };
  /* animate t from 0 to 1 over ms; under reduced motion jump straight to the end */
  function tween(ms, fn, done) {
    if (HG.reduced || ms <= 0) { fn(1); if (done) done(); return () => {}; }
    let raf = 0, t0 = 0, stop = false;
    const step = (now) => {
      if (stop) return;
      if (!t0) t0 = now;
      const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      fn(e);
      if (t < 1) raf = requestAnimationFrame(step); else if (done) done();
    };
    raf = requestAnimationFrame(step);
    return () => { stop = true; cancelAnimationFrame(raf); };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const shuffleBy = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);
  /* colour arithmetic on #rrggbb */
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const mix = (h, target, f) => rgb2hex(hex2rgb(h).map((v, i) => v + (target[i] - v) * f));
  const tint = (h, f) => mix(h, [255, 255, 255], f);
  const shade = (h, f) => mix(h, [0, 0, 0], f);
  /* the simple (profile-free) RGB to CMYK conversion */
  function cmyk(h) {
    const [r, g, b] = hex2rgb(h).map((v) => v / 255);
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return [0, 0, 0, 100];
    return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100));
  }
  /* relative luminance, for choosing readable text on a swatch */
  const lum = (h) => { const c = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const textOn = (h) => (lum(h) > 0.3 ? P.ink : "#ffffff");

  /* block-built aircraft (a low-wing trainer, side-on), drawn into group g at scale s */
  function aircraft(g, x, y, s, col) {
    const c = col || P.yellow;
    const r = (a, b, w, h, f) => g.append(S("rect", { x: x + a * s, y: y + b * s, width: w * s, height: h * s, fill: f }));
    r(0, 8, 64, 10, c); r(54, 4, 10, 6, c); r(-6, 2, 8, 16, c); r(18, 16, 30, 5, shade(c, 0.25));
    r(36, 3, 14, 6, "#9fd3f5"); r(64, 9, 3, 8, "#555"); r(-2, 0, 4, 4, P.red);
  }
  /* block-built ship of the line */
  function ship(g, x, y, s) {
    const r = (a, b, w, h, f) => g.append(S("rect", { x: x + a * s, y: y + b * s, width: w * s, height: h * s, fill: f }));
    r(0, 30, 60, 10, "#7a4a22"); r(4, 40, 52, 4, "#5a3416"); r(6, 33, 48, 2, P.yellow);
    [10, 28, 46].forEach((m) => { r(m + 2, 2, 2, 28, "#4b2e14"); r(m - 4, 6, 14, 9, "#f4efe0"); r(m - 3, 17, 12, 9, "#f4efe0"); });
    r(26, 0, 6, 3, P.red);
  }

  /* =====================================================================
     1. Thumbnail planner
     ===================================================================== */
  const THUMBS = [
    { name: "A · Classic stack", items: [
      { k: "band", x: 0, y: 0, w: 120, h: 26, t: "JOIN THE SQUADRON" }, { k: "img", x: 8, y: 32, w: 104, h: 56 },
      { k: "pennants", x: 8, y: 94, w: 104, h: 12 }, { k: "text2", x: 8, y: 112, w: 104, h: 30 },
      { k: "date", x: 8, y: 148, w: 72, h: 14 }, { k: "logo", x: 96, y: 148, w: 16, h: 16 }],
      pins: [
        { x: 60, y: 13, opts: ["White reverse text on a navy band across the full width gives strong contrast, so the title is read first from across a corridor.", "Big title at the top.", "The navy band gives the title texture."] },
        { x: 60, y: 60, opts: ["Aircraft photo square cropped and made the largest item, so it dominates and shows at once that the poster is about flying.", "Photo goes here.", "The photo is white space, so the page looks clean."] },
        { x: 60, y: 100, opts: ["Three pennants repeated at equal spacing create rhythm, leading the eye across the page towards the text.", "Some flags as decoration.", "The pennants are the grid structure because they are triangles."] },
        { x: 44, y: 155, opts: ["Date in a yellow accent panel gives it emphasis, so parents notice when the open evening is.", "Date at the bottom.", "The yellow date is a receding colour, so it stands out."] }] },
    { name: "B · Diagonal climb", items: [
      { k: "fullcrop", x: 0, y: 26, w: 120, h: 70 }, { k: "pathtitle", x: 6, y: 4, w: 108, h: 26, t: "JOIN THE SQUADRON" },
      { k: "logo", x: 100, y: 4, w: 14, h: 14 }, { k: "img", x: 8, y: 102, w: 48, h: 18 }, { k: "img", x: 8, y: 124, w: 48, h: 18 },
      { k: "img", x: 8, y: 146, w: 48, h: 18 }, { k: "text1", x: 64, y: 102, w: 48, h: 50 }, { k: "date", x: 64, y: 154, w: 48, h: 12 }],
      pins: [
        { x: 30, y: 16, opts: ["Title flowed along a curved path that follows the aircraft's climb, adding movement and linking the words to the image.", "Curvy writing.", "The title uses a hanging indent so that it curves."] },
        { x: 70, y: 62, opts: ["Aircraft full cropped to remove its background, so it sits straight on the poster and text can wrap round its outline.", "Plane picture.", "Aircraft square cropped to remove its outline."] },
        { x: 32, y: 133, opts: ["Three small photos aligned on one left edge with equal gaps between them, so they read as a set and give unity.", "Small pictures down the side.", "The small photos are the dominant item."] },
        { x: 88, y: 125, opts: ["A narrow text column on the right balances the heavy image block on the left: asymmetrical balance.", "Writing on the right.", "The text column gives the layout symmetrical balance."] }] },
    { name: "C · Grid of three", items: [
      { k: "img", x: 8, y: 8, w: 32, h: 34 }, { k: "img", x: 44, y: 8, w: 32, h: 34 }, { k: "img", x: 80, y: 8, w: 32, h: 34 },
      { k: "title", x: 8, y: 50, w: 104, h: 22, t: "OPEN EVENING" }, { k: "text1", x: 8, y: 80, w: 104, h: 40 },
      { k: "banner", x: 0, y: 128, w: 120, h: 20, t: "4 NOV · 7PM" }, { k: "logo", x: 52, y: 152, w: 16, h: 16 }],
      pins: [
        { x: 60, y: 25, opts: ["Three equal photos sit on a three-column grid, aligned top and bottom, giving the page a neat, ordered start.", "Three pictures.", "The three photos create depth because they are the same size."] },
        { x: 60, y: 61, opts: ["Large red sans serif title with white space above and below, so it stands out between the photos and the text.", "Title in the middle.", "Title in red, a cool colour, to look calm."] },
        { x: 60, y: 100, opts: ["Copy text fully justified in one column so both edges line up with the photos above, reinforcing the grid.", "Text here.", "Text justified so that it becomes a drop cap."] },
        { x: 60, y: 138, opts: ["Full-width navy banner with yellow reverse text at the foot makes the date stand out and balances the photos at the top.", "Date banner.", "The banner is a pull quote."] }] },
  ];
  function drawThumb(g, L, mode) {
    // mode "sketch": pencil conventions; "visual": colour
    const sk = mode === "sketch";
    const line = (d, w, col) => g.append(S("path", { d, fill: "none", stroke: col || "#5a5550", "stroke-width": w || 1.2, "stroke-linecap": "round" }));
    g.append(S("rect", { x: 0, y: 0, width: 120, height: 170, fill: P.paper, stroke: sk ? "#5a5550" : "#8a8478", "stroke-width": 1 }));
    L.items.forEach((it) => {
      const { x, y, w, h } = it;
      if (it.k === "band" || it.k === "banner") {
        if (sk) { g.append(S("rect", { x, y, width: w, height: h, fill: "none", stroke: "#5a5550", "stroke-width": 1.2 })); line(`M${x + 10} ${y + h / 2} q8 -5 16 0 t16 0 t16 0 t16 0 t16 0`, 1.6); }
        else { g.append(S("rect", { x, y, width: w, height: h, fill: P.navy })); g.append(S("text", { x: x + w / 2, y: y + h / 2 + 3.5, "font-size": 9, "font-weight": 700, fill: it.k === "banner" ? P.yellow : "#fff", "text-anchor": "middle", text: it.t })); }
      } else if (it.k === "img") {
        if (sk) { g.append(S("rect", { x, y, width: w, height: h, fill: "none", stroke: "#5a5550", "stroke-width": 1.2 })); line(`M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}`, 0.9); }
        else { g.append(S("rect", { x, y, width: w, height: h, fill: P.blue })); g.append(S("rect", { x, y: y + h * 0.75, width: w, height: h * 0.25, fill: "#e8f1f8" })); aircraft(g, x + w * 0.2, y + h * 0.25, w / 110); }
      } else if (it.k === "fullcrop") {
        if (sk) { line(`M${x + 8} ${y + 52} L${x + 100} ${y + 14} L${x + 108} ${y + 20} L${x + 22} ${y + 62} Z M${x + 50} ${y + 36} L${x + 66} ${y + 6} L${x + 74} ${y + 8} L${x + 64} ${y + 32} M${x + 48} ${y + 44} L${x + 70} ${y + 66}`, 1.4); }
        else { const gg = S("g", { transform: `translate(${x + 10} ${y + 58}) rotate(-24)` }); aircraft(gg, 0, 0, 1.25); g.append(gg); }
      } else if (it.k === "pathtitle") {
        if (sk) line(`M${x + 2} ${y + 22} Q${x + 50} ${y - 6} ${x + 92} ${y + 12}`, 1.8);
        else {
          const id = "dp-tp-" + Math.random().toString(36).slice(2, 7);
          g.append(S("path", { id, d: `M${x + 2} ${y + 22} Q${x + 50} ${y - 6} ${x + 96} ${y + 12}`, fill: "none" }));
          const t = S("text", { "font-size": 9.5, "font-weight": 700, fill: P.navy }); const tp = S("textPath", { href: "#" + id, text: it.t }); t.append(tp); g.append(t);
        }
      } else if (it.k === "title") {
        if (sk) line(`M${x + 6} ${y + 12} q9 -7 18 0 t18 0 t18 0 t18 0 t18 0`, 2.2);
        else g.append(S("text", { x: x + w / 2, y: y + 16, "font-size": 15, "font-weight": 700, fill: P.red, "text-anchor": "middle", text: it.t }));
      } else if (it.k === "pennants") {
        for (let i = 0; i < 3; i++) {
          const px = x + 6 + i * 36;
          if (sk) line(`M${px} ${y} L${px + 22} ${y + 6} L${px} ${y + 12} Z`, 1.2);
          else g.append(S("path", { d: `M${px} ${y} L${px + 22} ${y + 6} L${px} ${y + 12} Z`, fill: [P.red, P.yellow, P.blue][i] }));
        }
      } else if (it.k === "text2" || it.k === "text1") {
        const cols = it.k === "text2" ? 2 : 1, cw = (w - (cols - 1) * 6) / cols;
        for (let c = 0; c < cols; c++) for (let yy = y + 3; yy < y + h - 1; yy += 5) {
          const len = cw * (yy + 5 >= y + h - 1 ? 0.6 : 0.92 + 0.08 * Math.sin(yy * 3 + c));
          const x0 = x + c * (cw + 6);
          if (sk) line(`M${x0} ${yy} q${len / 4} -1.5 ${len / 2} 0 t${len / 2} 0`, 0.8);
          else g.append(S("rect", { x: x0, y: yy - 1, width: it.k === "text1" && x === 8 && w > 100 ? cw : len, height: 1.8, fill: "#6d665a" }));
        }
      } else if (it.k === "date") {
        if (sk) { g.append(S("rect", { x, y, width: w, height: h, fill: "none", stroke: "#5a5550", "stroke-width": 1.2 })); line(`M${x + 6} ${y + h / 2} h${w - 12}`, 1.2); }
        else { g.append(S("rect", { x, y, width: w, height: h, rx: 2, fill: P.yellow })); g.append(S("text", { x: x + w / 2, y: y + h / 2 + 3, "font-size": 7.5, "font-weight": 700, fill: P.navy, "text-anchor": "middle", text: "4 NOV · 7PM" })); }
      } else if (it.k === "logo") {
        const cx = x + w / 2, cy = y + h / 2, r = w / 2;
        if (sk) g.append(S("circle", { cx, cy, r, fill: "none", stroke: "#5a5550", "stroke-width": 1.2 }));
        else { g.append(S("circle", { cx, cy, r, fill: P.navy })); g.append(S("circle", { cx, cy, r: r * 0.5, fill: P.yellow })); }
      }
    });
  }
  mount("w-thumb", (box) => {
    let cur = null, answers = [], developed = false, stopT = null;
    const pick = E("div", { class: "dp-thumb-pick", role: "group", "aria-label": "Choose a thumbnail" });
    const stage = E("div", { class: "dp-thumb-stage" });
    const big = S("svg", { viewBox: "-4 -4 128 178", class: "dp-thumb-big", role: "img", "aria-label": "Choose a thumbnail to start." });
    const side = E("div", { class: "dp-thumb-side" });
    const pinRow = E("div", { class: "btn-row dp-pin-row", role: "group", "aria-label": "Annotation pins" });
    const panel = E("div", { class: "dp-ann", "aria-live": "polite" });
    const dev = E("button", { class: "btn primary small", type: "button", disabled: true }, "✎ Develop into a visual");
    const restart = E("button", { class: "btn small", type: "button" }, "↺ Start again");
    const tally = E("p", { class: "readout", "aria-live": "polite" });
    const list = E("ol", { class: "dp-ann-list" });
    side.append(pinRow, panel, E("div", { class: "btn-row" }, dev, restart), tally, list);
    stage.append(E("div", { class: "dp-thumb-frame" }, big), side);
    box.append(pick, stage);
    const ns = "http://www.w3.org/2000/svg";
    THUMBS.forEach((L, i) => {
      const b = E("button", { type: "button", class: "dp-thumb-btn", "aria-pressed": "false" });
      const sv = S("svg", { viewBox: "-2 -2 124 174", "aria-hidden": "true" });
      const g = S("g", { filter: "url(#dp-rough)" }); drawThumb(g, L, "sketch"); sv.append(g);
      b.append(sv, E("span", null, L.name));
      b.addEventListener("click", () => choose(i));
      pick.append(b);
    });
    function render(t) {
      // t = 0 sketch only … 1 fully developed visual
      big.innerHTML = "";
      const L = THUMBS[cur];
      const filt = S("filter", { id: "dp-rough-big", x: "-5%", y: "-5%", width: "110%", height: "110%" });
      filt.append(S("feTurbulence", { type: "fractalNoise", baseFrequency: "0.06", numOctaves: "2", seed: "3" }), S("feDisplacementMap", { in: "SourceGraphic", scale: String(lerp(3, 0, t)) }));
      const defs = S("defs"); defs.append(filt); big.append(defs);
      const gs = S("g", { filter: "url(#dp-rough-big)", opacity: String(1 - t) }); drawThumb(gs, L, "sketch"); big.append(gs);
      if (t > 0) { const gv = S("g", { opacity: String(t) }); drawThumb(gv, L, "visual"); big.append(gv); }
      L.pins.forEach((p, k) => {
        const a = answers[k];
        const c = S("circle", { cx: p.x, cy: p.y, r: 6, fill: a == null ? P.red : a ? "#2e7a2e" : "#8a3a1a", stroke: "#fff", "stroke-width": 1.2, class: "dp-pin-dot", "data-k": k });
        c.addEventListener("click", () => openPin(k));
        big.append(c, S("text", { x: p.x, y: p.y + 3, "font-size": 8, "font-weight": 700, fill: "#fff", "text-anchor": "middle", "pointer-events": "none", text: String(k + 1) }));
      });
      big.setAttribute("aria-label", `${L.name}: ${t >= 1 ? "developed into a coloured visual" : "pencil thumbnail"} with four numbered annotation pins.`);
    }
    function choose(i) {
      if (stopT) stopT();
      cur = i; answers = []; developed = false; list.innerHTML = ""; panel.innerHTML = "";
      pick.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", j === i ? "true" : "false"));
      pinRow.innerHTML = "";
      THUMBS[i].pins.forEach((p, k) => { const b = E("button", { class: "btn small", type: "button" }, `Pin ${k + 1}`); b.addEventListener("click", () => openPin(k)); pinRow.append(b); });
      dev.disabled = true; dev.textContent = "✎ Develop into a visual";
      tally.textContent = "Tap a pin to annotate it.";
      render(0);
    }
    function openPin(k) {
      if (cur == null) return;
      const p = THUMBS[cur].pins[k];
      const order = shuffleBy([0, 1, 2], (k + cur) % 3);
      panel.innerHTML = "";
      panel.append(E("p", { class: "dp-ann-q" }, `Pin ${k + 1}: which annotation would a marker credit?`));
      const opts = E("div", { class: "q-opts" });
      order.forEach((oi) => {
        const b = E("button", { class: "q-opt", type: "button" }, p.opts[oi]);
        if (answers[k] != null) b.setAttribute("aria-disabled", "true");
        b.addEventListener("click", () => {
          if (answers[k] != null) return;
          answers[k] = oi === 0;
          opts.querySelectorAll(".q-opt").forEach((x, xi) => { x.setAttribute("aria-disabled", "true"); if (order[xi] === 0) x.classList.add("right"); });
          if (oi !== 0) b.classList.add("wrong");
          const why = oi === 0 ? "Strong: it names the term, says where, and gives the effect on the viewer." : oi === 1 ? "Too vague: no course term and no reason. A marker cannot tell what you know." : "Wrong term: the annotation names a principle or technique that is not what is happening here.";
          panel.append(E("p", { class: oi === 0 ? "ok" : "bad" }, (oi === 0 ? "✔ " : "✘ ") + why));
          list.innerHTML = ""; THUMBS[cur].pins.forEach((pp, kk) => { if (answers[kk] != null) list.append(E("li", { value: kk + 1 }, pp.opts[0])); });
          const n = answers.filter((a) => a != null).length, r = answers.filter(Boolean).length;
          tally.textContent = `${n} of 4 pins annotated · ${r} strong first time` + (n === 4 ? " · ready to develop" : "");
          pinRow.children[k].classList.add(answers[k] ? "primary" : "danger");
          dev.disabled = n < 4 || developed;
          render(developed ? 1 : 0);
        });
        opts.append(b);
      });
      panel.append(opts);
      if (answers[k] != null) panel.append(E("p", { class: "hint" }, "Already annotated. The strong annotation is shown in the list below."));
    }
    dev.addEventListener("click", () => {
      if (developed || cur == null) return;
      developed = true; dev.disabled = true; dev.textContent = "Developed ✔";
      stopT = tween(1600, (t) => render(t), () => { tally.textContent = "Developed: the layout stayed the same; the visual adds colour, real text and images. The annotations carry over."; });
    });
    restart.addEventListener("click", () => choose(cur == null ? 0 : cur));
    choose(0);
  });

  /* =====================================================================
     2. Colour wheel: harmony, contrast, accent; value; advancing/receding
     ===================================================================== */
  const WHEEL = [
    ["yellow", "#f7e600"], ["yellow-orange", "#f9b800"], ["orange", "#f58220"], ["red-orange", "#ec4a24"], ["red", "#d7191c"], ["red-violet", "#a3195b"],
    ["violet", "#6a2c8e"], ["blue-violet", "#3f3d99"], ["blue", "#1f5fae"], ["blue-green", "#0f8f8a"], ["green", "#2e9e3e"], ["yellow-green", "#a3c93a"]];
  const wrap12 = (i) => ((i % 12) + 12) % 12;
  const isWarm = (i) => wrap12(i) <= 5;
  const warmth = (i) => Math.cos((wrap12(i) - 3) * Math.PI / 6); // +1 at red-orange, -1 at blue-green
  const wedge = (cx, cy, R, r, i) => {
    const a0 = (-105 + i * 30) * Math.PI / 180, a1 = (-75 + i * 30) * Math.PI / 180;
    const p = (a, rr) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
    return `M${p(a0, R)} A${R} ${R} 0 0 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 0 0 ${p(a0, r)} Z`;
  };
  mount("w-wheel", (box) => {
    let base = 8, scheme = "contrast", val = 0;
    const grid = E("div", { class: "dp-wheel-grid" });
    const wsv = S("svg", { viewBox: "0 0 240 240", class: "dp-wheel", role: "img" });
    const wedges = WHEEL.map(([n, c], i) => {
      const p = S("path", { d: wedge(120, 120, 112, 56, i), fill: c, stroke: "#fff", "stroke-width": 1.5, class: "dp-wedge" });
      p.addEventListener("click", () => setBase(i));
      wsv.append(p); return p;
    });
    const over = S("g", { "pointer-events": "none" }); wsv.append(over);
    const centre = S("circle", { cx: 120, cy: 120, r: 46, fill: WHEEL[base][1], stroke: "#fff", "stroke-width": 3 }); wsv.append(centre);
    const ctext = S("text", { x: 120, y: 124, "font-size": 12, "font-weight": 700, "text-anchor": "middle" }); wsv.append(ctext);
    const left = E("div", null, wsv);
    const nav = E("div", { class: "btn-row" });
    const prev = E("button", { class: "btn small", type: "button", "aria-label": "Previous base colour" }, "◀");
    const next = E("button", { class: "btn small", type: "button", "aria-label": "Next base colour" }, "▶");
    const baseName = E("span", { class: "readout", "aria-live": "polite" });
    prev.addEventListener("click", () => setBase(base - 1)); next.addEventListener("click", () => setBase(base + 1));
    nav.append(prev, next, baseName); left.append(nav);
    const right = E("div");
    HG.choice(right, "Scheme", [["harmony", "Harmony (analogous)"], ["contrast", "Contrast (complementary)"], ["accent", "Accent"]], scheme, (v) => { scheme = v; draw(); });
    const sl = E("div", { class: "sim-controls" }); right.append(sl);
    HG.slider(sl, { label: "Value: shade ← → tint", min: -75, max: 75, step: 5, value: 0, fmt: (v) => (v === 0 ? "pure hue" : v < 0 ? `shade, +${-v}% black` : `tint, +${v}% white`), oninput: (v) => { val = v; draw(); } });
    const sw = E("div", { class: "dp-swatches" });
    const poster = S("svg", { viewBox: "0 0 160 120", class: "dp-mini-poster", role: "img" });
    const note = E("p", { class: "sim-note", "aria-live": "polite" });
    const rd = E("div", { class: "readouts", "aria-live": "polite" });
    right.append(sw, poster, rd, note);
    grid.append(left, right); box.append(grid);
    function setBase(i) { const from = base; base = wrap12(i); animateRing(from, base); draw(); }
    let ringAngle = base * 30, stopRing = null;
    function animateRing(from, to) {
      if (stopRing) stopRing();
      let d = to - from; if (d > 6) d -= 12; if (d < -6) d += 12;
      const a0 = ringAngle, a1 = ringAngle + d * 30;
      stopRing = tween(420, (t) => { ringAngle = lerp(a0, a1, t); drawRing(); });
    }
    function schemeIdx() {
      if (scheme === "harmony") return [base - 1, base, base + 1].map(wrap12);
      if (scheme === "contrast") return [base, base + 6].map(wrap12);
      return [base, base + 6].map(wrap12);
    }
    function drawRing() {
      over.innerHTML = "";
      const offs = scheme === "harmony" ? [-1, 0, 1] : [0, 6];
      const pts = offs.map((o) => { const a = (ringAngle + o * 30 - 90) * Math.PI / 180; return [120 + 84 * Math.cos(a), 120 + 84 * Math.sin(a)]; });
      if (pts.length === 2) over.append(S("path", { d: `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}`, stroke: "#16141a", "stroke-width": 2.5, "stroke-dasharray": "5 4" }));
      else over.append(S("path", { d: `M${pts[0][0]} ${pts[0][1]} A84 84 0 0 1 ${pts[2][0]} ${pts[2][1]}`, fill: "none", stroke: "#16141a", "stroke-width": 3 }));
      pts.forEach(([x, y], k) => over.append(S("circle", { cx: x, cy: y, r: k === (pts.length === 3 ? 1 : 0) ? 9 : 7, fill: "#fff", stroke: "#16141a", "stroke-width": 2.5 })));
    }
    function draw() {
      const bc = val < 0 ? shade(WHEEL[base][1], -val / 100) : tint(WHEEL[base][1], val / 100);
      const idx = schemeIdx();
      wedges.forEach((w, i) => w.setAttribute("opacity", idx.includes(i) ? "1" : "0.35"));
      centre.setAttribute("fill", bc); ctext.setAttribute("fill", textOn(bc)); ctext.textContent = WHEEL[base][0];
      drawRing();
      baseName.textContent = `Base: ${WHEEL[base][0]} (${isWarm(base) ? "warm" : "cool"})`;
      wsv.setAttribute("aria-label", `Colour wheel. Base colour ${WHEEL[base][0]}. ${scheme} scheme uses ${idx.map((i) => WHEEL[i][0]).join(", ")}.`);
      // swatches with roles
      const comp = WHEEL[wrap12(base + 6)][1];
      let roles;
      if (scheme === "harmony") roles = [[WHEEL[wrap12(base - 1)][0], WHEEL[wrap12(base - 1)][1]], [WHEEL[base][0] + " (base)", bc], [WHEEL[wrap12(base + 1)][0], WHEEL[wrap12(base + 1)][1]]];
      else if (scheme === "contrast") roles = [[WHEEL[base][0] + " (base)", bc], [WHEEL[wrap12(base + 6)][0] + " (complement)", comp]];
      else roles = [["tint of " + WHEEL[base][0], tint(bc, 0.75)], [WHEEL[base][0] + " (base)", bc], ["shade of " + WHEEL[base][0], shade(bc, 0.45)], [WHEEL[wrap12(base + 6)][0] + " (accent)", comp]];
      sw.innerHTML = "";
      roles.forEach(([n, c]) => sw.append(E("div", { class: "dp-sw", style: `background:${c};color:${textOn(c)}` }, E("b", null, n), E("span", null, c.toUpperCase()))));
      // sample poster
      poster.innerHTML = "";
      let bg, band, pen, dateF, titleF;
      if (scheme === "harmony") { bg = tint(WHEEL[wrap12(base + 1)][1], 0.8); band = shade(bc, 0.15); pen = idx.map((i) => (i === base ? bc : WHEEL[i][1])); dateF = WHEEL[wrap12(base - 1)][1]; }
      else if (scheme === "contrast") { bg = tint(bc, 0.82); band = bc; pen = [bc, comp, bc, comp, bc]; dateF = comp; }
      else { bg = tint(bc, 0.8); band = shade(bc, 0.45); pen = [tint(bc, 0.4), bc, shade(bc, 0.3), bc, tint(bc, 0.4)]; dateF = comp; }
      titleF = textOn(band);
      poster.append(S("rect", { width: 160, height: 120, fill: bg }));
      poster.append(S("path", { d: "M0 6 Q80 14 160 6", stroke: "#555", fill: "none", "stroke-width": 0.8 }));
      for (let i = 0; i < 5; i++) { const x = 8 + i * 31; poster.append(S("path", { d: `M${x} ${8 + Math.sin(i) * 1.5} L${x + 20} ${9} L${x + 10} ${30}Z`, fill: pen[i % pen.length] })); }
      poster.append(S("rect", { x: 0, y: 36, width: 160, height: 34, fill: band }));
      poster.append(S("text", { x: 80, y: 58, "font-size": 15, "font-weight": 700, fill: titleF, "text-anchor": "middle", text: "REGATTA DAY" }));
      poster.append(S("rect", { x: 30, y: 82, width: 100, height: 24, rx: 3, fill: dateF }));
      poster.append(S("text", { x: 80, y: 98, "font-size": 11, "font-weight": 700, fill: textOn(dateF), "text-anchor": "middle", text: "SAT 6 JUNE" }));
      poster.setAttribute("aria-label", `Sample regatta poster coloured with the ${scheme} scheme: background ${bg}, title band ${band}, date panel ${dateF}.`);
      const [c, m, y, k] = cmyk(bc);
      rd.innerHTML = "";
      [["Base colour", bc.toUpperCase()], ["RGB", hex2rgb(bc).join(", ")], ["CMYK (simple conversion)", `C${c} M${m} Y${y} K${k}`], ["Value", val === 0 ? "the pure hue" : val < 0 ? "lower (darker): a shade" : "higher (lighter): a tint"]].forEach(([a, b]) => rd.append(E("div", null, E("span", null, a), E("b", null, b))));
      const msg = {
        harmony: `Harmony: ${idx.map((i) => WHEEL[i][0]).join(", ")} sit next to each other on the wheel and share a common colour, so the poster looks calm and unified. Nothing fights for attention, which is restful but can be quiet.`,
        contrast: `Contrast: ${WHEEL[base][0]} and ${WHEEL[wrap12(base + 6)][0]} are opposite on the wheel (complementary). Side by side each makes the other look stronger, so the pennants and date panel are vibrant and eye-catching.`,
        accent: `Accent: the poster uses tints and shades of ${WHEEL[base][0]}, with a single small area of its complement, ${WHEEL[wrap12(base + 6)][0]}, on the date panel. Because it is the only different colour, the eye goes straight to the date.`,
      }[scheme];
      note.textContent = msg + " The CMYK figures use the simple formula K = 1 − max(R, G, B); real print software converts through a colour profile, so its numbers differ a little.";
    }
    draw();

    /* --- advancing and receding --- */
    box.append(E("h4", { class: "dp-sub" }, "Advancing and receding"));
    box.append(E("p", { class: "hint" }, "Choose a colour for the shape and for the background. The side view on the right pictures the illusion: a warm shape on a cool ground seems to float towards you; a cool shape on a warm ground seems to sink back. (It pictures the effect; it is not a measurement.)"));
    let fg = 3, bgc = 8, depthNow = 0, stopD = null;
    const dgrid = E("div", { class: "dp-depth-grid" });
    const front = S("svg", { viewBox: "0 0 200 140", class: "dp-depth-front", role: "img" });
    const sideV = S("svg", { viewBox: "0 0 220 140", class: "dp-depth-side", role: "img" });
    dgrid.append(front, sideV);
    const dctl = E("div", { class: "dp-depth-ctl" });
    const mkSel = (label, v, on) => {
      const s = E("select", { "aria-label": label }); WHEEL.forEach(([n], i) => s.append(E("option", { value: i, selected: i === v ? true : null }, n)));
      s.addEventListener("change", () => on(+s.value));
      return [E("label", null, label + " ", s), s];
    };
    const [l1, s1] = mkSel("Shape colour", fg, (v) => { fg = v; dDraw(); });
    const [l2, s2] = mkSel("Background colour", bgc, (v) => { bgc = v; dDraw(); });
    const pre = E("div", { class: "btn-row" });
    [["Warm on cool", 3, 8], ["Cool on warm", 8, 3], ["Same family", 2, 4]].forEach(([t, a, b]) => { const bt = E("button", { class: "btn small", type: "button" }, t); bt.addEventListener("click", () => { fg = a; bgc = b; s1.value = a; s2.value = b; dDraw(); }); pre.append(bt); });
    dctl.append(l1, l2);
    const dnote = E("p", { class: "sim-note", "aria-live": "polite" });
    box.append(dctl, pre, dgrid, dnote);
    function dPaint(d) {
      front.innerHTML = ""; sideV.innerHTML = "";
      const B = WHEEL[bgc][1], F = WHEEL[fg][1];
      front.append(S("rect", { width: 200, height: 140, fill: B }));
      front.append(S("path", { d: "M40 30 L170 70 L40 110 Z", fill: F }));
      front.append(S("text", { x: 80, y: 76, "font-size": 16, "font-weight": 700, fill: textOn(F), "text-anchor": "middle", text: "FLY" }));
      // side view: eye on the left, picture plane (background) on the right, shape plane in between
      const C = HG.colors();
      sideV.append(S("text", { x: 4, y: 16, "font-size": 12, fill: C.ink2, text: "side view of the illusion" }));
      sideV.append(S("path", { d: "M14 70 q10 -9 20 0 q-10 9 -20 0z", fill: "none", stroke: C.ink, "stroke-width": 1.6 }));
      sideV.append(S("circle", { cx: 24, cy: 70, r: 3, fill: C.ink }));
      sideV.append(S("text", { x: 24, y: 96, "font-size": 11, fill: C.ink2, "text-anchor": "middle", text: "you" }));
      sideV.append(S("rect", { x: 196, y: 24, width: 8, height: 96, fill: B, stroke: C.ink, "stroke-width": 1 }));
      sideV.append(S("text", { x: 200, y: 134, "font-size": 11, fill: C.ink2, "text-anchor": "middle", text: "page" }));
      const x = 150 - 70 * d;
      sideV.append(S("path", { d: `M24 70 L${x} 44 M24 70 L${x} 96`, stroke: C.muted, "stroke-dasharray": "3 3", "stroke-width": 1 }));
      sideV.append(S("rect", { x: x - 4, y: 44, width: 8, height: 52, fill: F, stroke: C.ink, "stroke-width": 1 }));
      sideV.append(S("text", { x, y: 38, "font-size": 11, fill: C.ink, "text-anchor": "middle", text: "shape" }));
    }
    function dDraw() {
      const target = Math.max(-1, Math.min(1, (warmth(fg) - warmth(bgc)) / 2));
      if (stopD) stopD();
      const from = depthNow;
      stopD = tween(600, (t) => { depthNow = lerp(from, target, t); dPaint(depthNow); });
      const fw = isWarm(fg) ? "warm" : "cool", bw = isWarm(bgc) ? "warm" : "cool";
      const verdict = target > 0.25 ? `The ${fw} ${WHEEL[fg][0]} shape advances: it seems to come forward from the ${bw} ${WHEEL[bgc][0]} background, creating depth.`
        : target < -0.25 ? `The ${fw} ${WHEEL[fg][0]} shape recedes: against the ${bw} ${WHEEL[bgc][0]} background it seems to sink back into the page.`
        : `${WHEEL[fg][0]} and ${WHEEL[bgc][0]} are close in temperature, so there is little sense of depth between them. The layout looks flat.`;
      dnote.textContent = verdict;
      front.setAttribute("aria-label", `A ${WHEEL[fg][0]} pennant shape on a ${WHEEL[bgc][0]} background.`);
      sideV.setAttribute("aria-label", "Side view: " + verdict);
    }
    dDraw();
    document.addEventListener("hm-theme", () => dPaint(depthNow));
  });

  /* =====================================================================
     3. Hotspot analyser (and the shared recruitment poster)
     ===================================================================== */
  function recruitPoster(svg) {
    const a = (el) => { svg.append(el); return el; };
    const defs = a(S("defs"));
    const sky = S("linearGradient", { id: "dp-hs-sky", x1: 0, y1: 0, x2: 0, y2: 1 });
    sky.append(S("stop", { offset: 0, "stop-color": "#1f6fb8" }), S("stop", { offset: 1, "stop-color": "#9fd0f0" })); defs.append(sky);
    const fl = S("filter", { id: "dp-hs-sh", x: "-20%", y: "-20%", width: "150%", height: "150%" }); fl.append(S("feDropShadow", { dx: 4, dy: 5, stdDeviation: 3.5, "flood-color": "#000", "flood-opacity": 0.45 })); defs.append(fl);
    const pat = S("pattern", { id: "dp-hs-grass", width: 24, height: 24, patternUnits: "userSpaceOnUse" });
    [[0, 0, 24, 24, P.dirt], [0, 0, 24, 7, P.green], [4, 7, 4, 4, P.green], [14, 7, 6, 3, P.green], [3, 14, 3, 3, "#5e3f22"], [15, 17, 4, 3, "#9a7048"], [9, 12, 3, 3, "#9a7048"]].forEach(([x, y, w, h, f]) => pat.append(S("rect", { x, y, width: w, height: h, fill: f })));
    defs.append(pat);
    a(S("rect", { width: 300, height: 424, fill: P.paper }));
    // 1 pennant line (rhythm)
    a(S("path", { d: "M0 8 Q150 22 300 8", fill: "none", stroke: "#555", "stroke-width": 1.2 }));
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 32, y = 8 + 14 * (1 - Math.pow((x + 10 - 150) / 150, 2)) * 1;
      a(S("path", { d: `M${x} ${y} L${x + 22} ${y} L${x + 11} ${y + 26} Z`, fill: [P.red, P.yellow, P.blue][i % 3] }));
    }
    // 2 title band (contrast)
    a(S("rect", { x: 0, y: 44, width: 300, height: 74, fill: P.navy }));
    a(S("text", { x: 150, y: 70, "font-size": 16, "font-weight": 700, fill: "#fff", "text-anchor": "middle", "letter-spacing": 3, text: "JOIN" }));
    a(S("text", { x: 150, y: 104, "font-size": 30, "font-weight": 700, fill: "#fff", "text-anchor": "middle", text: "1805 SQUADRON" }));
    // 3 main photo (dominance)
    a(S("rect", { x: 16, y: 126, width: 268, height: 140, fill: "url(#dp-hs-sky)" }));
    a(S("path", { d: "M16 240 Q150 228 284 242 V266 H16 Z", fill: "#e9f3fa" }));
    a(S("path", { d: "M16 250 Q150 242 284 254 V266 H16 Z", fill: "#1d5d8f" }));
    const ac = a(S("g", { transform: "translate(70 168) rotate(-8)" })); aircraft(ac, 0, 0, 2.3);
    // 6 flight path (line)
    a(S("path", { d: "M232 162 C 292 160, 292 230, 291 300 S 280 352, 214 372", fill: "none", stroke: P.red, "stroke-width": 2.5, "stroke-dasharray": "2 5", "stroke-linecap": "round" }));
    a(S("path", { d: "M220 365 L210 374 L223 377", fill: "none", stroke: P.red, "stroke-width": 2.5, "stroke-linecap": "round" }));
    // 4 inset photo with drop shadow (depth)
    const ig = a(S("g", { filter: "url(#dp-hs-sh)" }));
    ig.append(S("rect", { x: 186, y: 222, width: 92, height: 62, fill: "#ec4a24" }));
    ig.append(S("rect", { x: 190, y: 226, width: 84, height: 54, fill: "#bfe1f5" }));
    const sg = a(S("g")); sg.append(S("rect", { x: 190, y: 266, width: 84, height: 14, fill: "#1d5d8f" })); ship(sg, 202, 228, 1);
    // 5 caption next to inset (proximity)
    a(S("text", { x: 232, y: 297, "font-size": 10.5, fill: P.ink, "text-anchor": "middle", text: "Cadets aboard HMS Vellum" }));
    // 7 three steps on a three-column grid
    [["1", "FLY", 16], ["2", "BUILD", 109], ["3", "LEAD", 202]].forEach(([n, h, x]) => {
      a(S("circle", { cx: x + 12, cy: 322, r: 11, fill: P.navy }));
      a(S("text", { x: x + 12, y: 326.5, "font-size": 12, "font-weight": 700, fill: "#fff", "text-anchor": "middle", text: n }));
      a(S("text", { x: x + 28, y: 327, "font-size": 13, "font-weight": 700, fill: P.red, text: h }));
      [0, 1].forEach((r) => a(S("rect", { x, y: 338 + r * 7, width: r ? 62 : 82, height: 3, fill: "#6d665a" })));
    });
    // 8 date panel (emphasis)
    a(S("rect", { x: 16, y: 362, width: 190, height: 30, rx: 3, fill: P.yellow }));
    a(S("text", { x: 111, y: 382, "font-size": 12.5, "font-weight": 700, fill: P.navy, "text-anchor": "middle", text: "OPEN EVENING · 4 NOV · 7PM" }));
    // logo
    a(S("circle", { cx: 256, cy: 378, r: 17, fill: P.navy })); a(S("circle", { cx: 256, cy: 378, r: 9, fill: P.yellow })); a(S("circle", { cx: 256, cy: 378, r: 4, fill: P.red }));
    // 9 grass-block strip (texture)
    a(S("rect", { x: 0, y: 400, width: 300, height: 24, fill: "url(#dp-hs-grass)" }));
  }
  const HOTS = [
    { n: 1, px: 150, py: 34, r: [0, 0, 300, 40], ans: "Rhythm", opts: ["Rhythm", "Dominance", "Texture", "Alignment"], d: "Nine pennants are repeated at equal spacing in a red, yellow, blue sequence along the top edge.", why: "Repetition at regular intervals is rhythm: it sets up a pattern that leads the eye across the top of the poster." },
    { n: 2, px: 30, py: 82, r: [0, 44, 300, 74], ans: "Contrast", opts: ["Texture", "Contrast", "Rhythm", "Depth"], d: "The title is white reverse text on a dark navy band: light against dark.", why: "The strongest difference in value on the page: white on navy. That difference is contrast, and it is what makes the title readable from a distance." },
    { n: 3, px: 60, py: 145, r: [16, 126, 268, 140], ans: "Dominance", opts: ["White space", "Alignment", "Dominance", "Rhythm"], d: "The aircraft photograph is by far the largest item, filling about a third of the page.", why: "One item much larger than all others becomes the focal point: that is dominance. The eye lands here first." },
    { n: 4, px: 266, py: 236, r: [186, 222, 92, 62], ans: "Depth", opts: ["Alignment", "Rhythm", "Texture", "Depth"], d: "The ship photo overlaps the corner of the main photo, has a drop shadow and a warm red-orange frame.", why: "Overlap, a drop shadow and an advancing warm frame make the inset seem to sit in front of the main photo: depth." },
    { n: 5, px: 186, py: 300, r: [180, 286, 106, 16], ans: "Unity/proximity", opts: ["Dominance", "Unity/proximity", "Depth", "Texture"], d: "The caption sits directly beneath the ship photo, close to it and away from other text.", why: "Placing related items close together so they read as one group is proximity, a way of creating unity." },
    { n: 6, px: 280, py: 266, r: [228, 156, 70, 222], ans: "Line", opts: ["Line", "Texture", "Balance", "Value"], d: "A dotted red line curves from the aircraft's nose down the right-hand side to the date panel.", why: "This is the element line, used to lead the eye: it takes the viewer from the aircraft to the date." },
    { n: 7, px: 150, py: 342, r: [16, 308, 268, 46], ans: "Grid structure", opts: ["Depth", "Texture", "Dominance", "Grid structure"], d: "The three activities sit in three equal columns; their left edges line up with the photo, the inset and the date panel above and below.", why: "Items placed in equal columns on a common framework are using grid structure. (The repeated number-and-heading format is also rhythm, but the columns are the grid.)" },
    { n: 8, px: 30, py: 377, r: [16, 362, 190, 30], ans: "Emphasis", opts: ["Emphasis", "Texture", "Rhythm", "Line"], d: "The date and time are in navy bold text on a yellow panel, the only yellow block on the lower half.", why: "A bright accent panel makes the date stand out from everything near it: emphasis on the information parents need." },
    { n: 9, px: 150, py: 412, r: [0, 400, 300, 24], ans: "Texture", opts: ["Dominance", "Texture", "Emphasis", "Alignment"], d: "A strip of Minecraft grass blocks runs along the bottom edge, filled with a pixelated grass and dirt pattern.", why: "A pattern that suggests a surface (grass and soil blocks) is visual texture, applied with a textured fill." },
    { n: 10, px: 9, py: 300, r: [12, 126, 8, 266], ans: "Alignment", opts: ["Depth", "Alignment", "Texture", "Dominance"], d: "The left edges of the main photo, the first activity and the date panel all sit on one line, 16 units in from the page edge.", why: "Lining items up along a common edge is alignment. It makes the layout look ordered and planned." },
  ];
  mount("w-hotspot", (box) => {
    const wrap = E("div", { class: "dp-hs-wrap" });
    const svg = S("svg", { viewBox: "0 0 300 424", class: "dp-hs-poster", role: "img", "aria-label": "Recruitment poster for 1805 Squadron: a string of pennants along the top; the title Join 1805 Squadron in white on a navy band; a large photograph of a yellow block-built aircraft over the sea; an inset photograph of HMS Vellum with a drop shadow and its caption; a dotted red line running down the right side to the date; three numbered activities, Fly, Build and Lead; a yellow date panel reading Open evening, 4 November, 7pm; a round badge; and a strip of grass blocks along the bottom." });
    recruitPoster(svg);
    const hi = S("rect", { class: "dp-hs-hi", fill: "none", stroke: "#d4147a", "stroke-width": 3, "stroke-dasharray": "8 5", visibility: "hidden" });
    svg.append(hi);
    wrap.append(svg);
    const panel = E("div", { class: "dp-hs-panel", "aria-live": "polite" }, E("p", { class: "hint" }, "Choose a numbered hotspot on the poster."));
    const score = E("p", { class: "readout", "aria-live": "polite" });
    const again = E("button", { class: "btn small", type: "button" }, "↺ Reset hotspots");
    const done = new Map();
    const pins = HOTS.map((h, i) => {
      const b = E("button", { type: "button", class: "dp-hs-pin", style: `left:${(h.px / 300) * 100}%;top:${(h.py / 424) * 100}%`, "aria-label": `Hotspot ${h.n}` }, String(h.n));
      b.addEventListener("click", () => open(i));
      wrap.append(b); return b;
    });
    const grid = E("div", { class: "dp-hs-grid" }, wrap, E("div", null, panel, score, E("div", { class: "btn-row" }, again)));
    box.append(grid);
    let dash = 0, stopDash = null;
    function open(i) {
      const h = HOTS[i];
      pins.forEach((p, j) => p.classList.toggle("on", j === i));
      hi.setAttribute("x", h.r[0] + 1.5); hi.setAttribute("y", h.r[1] + 1.5); hi.setAttribute("width", h.r[2] - 3); hi.setAttribute("height", h.r[3] - 3); hi.setAttribute("visibility", "visible");
      if (stopDash) stopDash();
      if (!HG.reduced) { const d0 = dash; stopDash = tween(900, (t) => { dash = d0 - t * 26; hi.setAttribute("stroke-dashoffset", dash); }); }
      panel.innerHTML = "";
      panel.append(E("p", { class: "dp-ann-q" }, `Hotspot ${h.n}: which design element or principle is most clearly at work here?`));
      const opts = E("div", { class: "q-opts" });
      h.opts.forEach((o) => {
        const b = E("button", { type: "button", class: "q-opt" }, o);
        if (done.has(i)) { b.setAttribute("aria-disabled", "true"); if (o === h.ans) b.classList.add("right"); if (o === done.get(i) && o !== h.ans) b.classList.add("wrong"); }
        b.addEventListener("click", () => {
          if (done.has(i)) return;
          done.set(i, o);
          opts.querySelectorAll(".q-opt").forEach((x) => { x.setAttribute("aria-disabled", "true"); if (x.textContent === h.ans) x.classList.add("right"); });
          if (o !== h.ans) b.classList.add("wrong");
          pins[i].classList.add(o === h.ans ? "got" : "miss");
          feedback(i);
          tallyUp();
        });
        opts.append(b);
      });
      panel.append(opts);
      if (done.has(i)) feedback(i);
    }
    function feedback(i) {
      const h = HOTS[i], ok = done.get(i) === h.ans;
      panel.append(E("p", { class: ok ? "ok" : "bad" }, ok ? `✔ ${h.ans}.` : `✘ Not ${done.get(i)}: this is ${h.ans}.`));
      panel.append(E("p", null, h.why));
      panel.append(E("p", { class: "dp-model" }, E("b", null, "Describe: "), h.d));
    }
    function tallyUp() {
      const right = [...done.entries()].filter(([i, o]) => HOTS[i].ans === o).length;
      score.textContent = `${done.size} of ${HOTS.length} hotspots tried · ${right} named correctly` + (done.size === HOTS.length ? (right === HOTS.length ? " · flawless spotting" : " · re-read the ones you missed") : "");
    }
    again.addEventListener("click", () => { done.clear(); pins.forEach((p) => p.classList.remove("got", "miss", "on")); hi.setAttribute("visibility", "hidden"); panel.innerHTML = ""; panel.append(E("p", { class: "hint" }, "Choose a numbered hotspot on the poster.")); score.textContent = ""; });
    tallyUp();
  });

  /* =====================================================================
     4. Explain builder (cause + effect)
     ===================================================================== */
  const CAUSES = [
    ["none", "(no cause: write the effect only)"],
    ["date", "The date is in navy bold text on a yellow accent panel"],
    ["title", "The title is large white reverse text on a navy band"],
    ["photo", "The aircraft photo is far larger than any other item"],
    ["path", "A dotted red line runs from the aircraft to the date panel"],
    ["inset", "The ship photo overlaps the main photo and has a drop shadow"],
    ["frame", "The ship photo has a warm red-orange frame against the cool blue sky"],
    ["pennants", "The pennants are repeated at equal spacing along the top"],
    ["colours", "Only navy, red and yellow are used throughout the poster"],
    ["caption", "The caption sits directly beneath the ship photo"],
  ];
  const EFFECTS = [
    ["stand", "so it stands out and is one of the first things the viewer notices"],
    ["order", "so the viewer reads the most important information first"],
    ["forward", "so it seems to come forward, nearer to the viewer than the background"],
    ["layers", "giving a layered, three-dimensional look to a flat page"],
    ["belong", "so the viewer sees the items as belonging together in one planned design"],
    ["group", "so the viewer reads the related items as a group"],
    ["creates", "which creates emphasis"],
    ["lopsided", "so the layout looks lopsided"],
  ];
  const XQ = {
    emphasis: { q: "Explain how emphasis has been achieved in the recruitment poster.", causes: ["date", "title", "photo", "path"], effects: ["stand", "order"] },
    depth: { q: "Explain how depth has been created in the recruitment poster.", causes: ["inset", "frame"], effects: ["forward", "layers"] },
    unity: { q: "Explain how unity has been achieved in the recruitment poster.", causes: ["pennants", "colours", "caption"], effects: ["belong", "group"] },
  };
  mount("w-explain", (box) => {
    let qk = "emphasis";
    const qline = E("p", { class: "dp-xq" });
    HG.choice(box, "Question", [["emphasis", "Emphasis [2]"], ["depth", "Depth [2]"], ["unity", "Unity [2]"]], qk, (v) => { qk = v; reset(); });
    box.append(qline);
    const rows = [0, 1].map((k) => {
      const c = E("select", { "aria-label": `Mark ${k + 1}: cause` }); CAUSES.forEach(([v, t]) => c.append(E("option", { value: v }, t)));
      const e = E("select", { "aria-label": `Mark ${k + 1}: effect` }); EFFECTS.forEach(([v, t]) => e.append(E("option", { value: v }, t)));
      const out = E("p", { class: "dp-xsent" });
      const res = E("p", { class: "dp-xres", "aria-live": "polite" });
      const wrap = E("div", { class: "dp-xrow" }, E("p", { class: "dp-xlab" }, `Mark •${k + 1}`), E("label", null, E("span", { class: "dp-cause" }, "Cause"), c), E("label", null, E("span", { class: "dp-effect" }, "Effect"), e), out, res);
      box.append(wrap);
      const upd = () => { const ct = CAUSES.find((x) => x[0] === c.value)[1], et = EFFECTS.find((x) => x[0] === e.value)[1]; out.innerHTML = c.value === "none" ? `<span class="dp-effect">${HG.esc(et.replace(/^so |^which |^giving /, (m) => m[0].toUpperCase() + m.slice(1)))}.</span>` : `<span class="dp-cause">${HG.esc(ct)}</span>, <span class="dp-effect">${HG.esc(et)}.</span>`; res.textContent = ""; };
      c.addEventListener("change", upd); e.addEventListener("change", upd);
      return { c, e, res, upd };
    });
    const markBtn = E("button", { class: "btn primary small", type: "button" }, "✔ Mark my answer");
    const total = E("p", { class: "readout", "aria-live": "polite" });
    box.append(E("div", { class: "btn-row" }, markBtn), total);
    function reset() { qline.textContent = XQ[qk].q; rows.forEach((r) => { r.c.value = "none"; r.e.value = "creates"; r.upd(); }); total.textContent = ""; }
    markBtn.addEventListener("click", () => {
      const Q = XQ[qk]; let sum = 0; const used = new Set();
      rows.forEach((r, k) => {
        const c = r.c.value, e = r.e.value; let ok = false, why;
        if (c === "none") why = "✘ 0: an effect with no cause. The marker cannot tell which feature you mean.";
        else if (!Q.causes.includes(c)) why = `✘ 0: that feature does not create ${qk}. Re-read the question.`;
        else if (e === "creates") why = `✘ 0: "${qk === "emphasis" ? "creates emphasis" : "creates emphasis"}" names a principle, not an effect on the viewer.`;
        else if (!Q.effects.includes(e)) why = `✘ 0: the effect does not fit ${qk}. Say what ${qk} does to the viewer.`;
        else if (used.has(c)) why = "✘ 0: the same cause as the first mark. A second mark needs a different feature.";
        else { ok = true; why = "✔ 1 mark: a relevant cause linked to its effect."; }
        if (ok) { sum++; used.add(c); }
        r.res.textContent = why; r.res.className = "dp-xres " + (ok ? "ok" : "bad");
      });
      total.textContent = `${sum} / 2 marks` + (sum === 2 ? ": two different causes, each with its effect." : "");
    });
    reset();
  });
})();
