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
        { x: 116, y: 13, opts: ["White reverse text on a navy band across the full width gives strong contrast, so the title is read first from across a corridor.", "Big title at the top.", "The navy band gives the title texture."] },
        { x: 110, y: 36, opts: ["Aircraft photo square cropped and made the largest item, so it dominates and shows at once that the poster is about flying.", "Photo goes here.", "The photo is white space, so the page looks clean."] },
        { x: 116, y: 100, opts: ["Three pennants repeated at equal spacing create rhythm, leading the eye across the page towards the text.", "Some flags as decoration.", "The pennants are the grid structure because they are triangles."] },
        { x: 86, y: 155, opts: ["Date in a yellow accent panel gives it emphasis, so parents notice when the open evening is.", "Date at the bottom.", "The yellow date is a receding colour, so it stands out."] }] },
    { name: "B · Diagonal climb", items: [
      { k: "fullcrop", x: 0, y: 26, w: 120, h: 70 }, { k: "pathtitle", x: 4, y: 4, w: 90, h: 26, t: "JOIN THE SQUADRON" },
      { k: "logo", x: 100, y: 4, w: 14, h: 14 }, { k: "img", x: 8, y: 102, w: 48, h: 18 }, { k: "img", x: 8, y: 124, w: 48, h: 18 },
      { k: "img", x: 8, y: 146, w: 48, h: 18 }, { k: "text1", x: 64, y: 102, w: 48, h: 50 }, { k: "date", x: 64, y: 154, w: 48, h: 12 }],
      pins: [
        { x: 98, y: 28, opts: ["Title flowed along a curved path that follows the aircraft's climb, adding movement and linking the words to the image.", "Curvy writing.", "The title uses a hanging indent so that it curves."] },
        { x: 70, y: 62, opts: ["Aircraft full cropped to remove its background, so it sits straight on the poster's own background and its diagonal gives the layout movement.", "Plane picture.", "Aircraft square cropped to remove its outline."] },
        { x: 62, y: 111, opts: ["Three small photos aligned on one left edge with equal gaps between them, so they read as a set and give unity.", "Small pictures down the side.", "The small photos are the dominant item."] },
        { x: 116, y: 108, opts: ["A narrow text column on the right balances the heavy image block on the left: asymmetrical balance.", "Writing on the right.", "The text column gives the layout symmetrical balance."] }] },
    { name: "C · Grid of three", items: [
      { k: "img", x: 8, y: 8, w: 32, h: 34 }, { k: "img", x: 44, y: 8, w: 32, h: 34 }, { k: "img", x: 80, y: 8, w: 32, h: 34 },
      { k: "title", x: 8, y: 50, w: 104, h: 22, t: "OPEN EVENING" }, { k: "text1", x: 8, y: 80, w: 104, h: 40 },
      { k: "banner", x: 0, y: 128, w: 120, h: 20, t: "4 NOV · 7PM" }, { k: "logo", x: 52, y: 152, w: 16, h: 16 }],
      pins: [
        { x: 116, y: 25, opts: ["Three equal photos sit on a three-column grid, aligned top and bottom, giving the page a neat, ordered start.", "Three pictures.", "The three photos create depth because they are the same size."] },
        { x: 116, y: 61, opts: ["Large red sans serif title with white space above and below, so it stands out between the photos and the text.", "Title in the middle.", "Title in red, a cool colour, to look calm."] },
        { x: 116, y: 100, opts: ["Copy text fully justified in one column so both edges line up with the photos above, reinforcing the grid.", "Text here.", "Text justified so that it becomes a drop cap."] },
        { x: 116, y: 138, opts: ["Full-width navy banner with yellow reverse text at the foot makes the date stand out and balances the photos at the top.", "Date banner.", "The banner is a pull quote."] }] },
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
        if (sk) line(`M${x + 2} ${y + 22} Q${x + 46} ${y - 6} ${x + 92} ${y + 10}`, 1.8);
        else {
          const id = "dp-tp-" + Math.random().toString(36).slice(2, 7);
          g.append(S("path", { id, d: `M${x + 2} ${y + 22} Q${x + 46} ${y - 6} ${x + 92} ${y + 10}`, fill: "none" }));
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
    const tally = E("p", { class: "sim-note", "aria-live": "polite" });
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
        const px = p.x; const c = S("circle", { cx: px, cy: p.y, r: 6, fill: a == null ? P.red : a ? "#2e7a2e" : "#8a3a1a", stroke: "#fff", "stroke-width": 1.2, class: "dp-pin-dot", "data-k": k });
        c.addEventListener("click", () => openPin(k));
        big.append(c, S("text", { x: px, y: p.y + 3, "font-size": 8, "font-weight": 700, fill: "#fff", "text-anchor": "middle", "pointer-events": "none", text: String(k + 1) }));
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
  const warmth = (i) => { const k = wrap12(i); return k === 5 ? 0.5 : k === 11 ? -0.5 : k <= 4 ? 1 : -1; }; // the deck's warm and cool halves; red-violet and yellow-green are borderline
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
      p.append(S("title", { text: n }));
      p.addEventListener("click", () => setBase(i));
      wsv.append(p);
      const a = (-90 + i * 30) * Math.PI / 180, ab = n.split("-").map((w) => w[0].toUpperCase()).join("");
      wsv.append(S("text", { x: 120 + 84 * Math.cos(a), y: 120 + 84 * Math.sin(a) + 4, "font-size": 11, "font-weight": 700, "text-anchor": "middle", fill: textOn(c), "pointer-events": "none", text: ab }));
      return p;
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
      const pts = offs.map((o) => { const a = (ringAngle + o * 30 - 90) * Math.PI / 180; return [120 + 104 * Math.cos(a), 120 + 104 * Math.sin(a)]; });
      if (pts.length === 2) over.append(S("path", { d: `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}`, stroke: "#16141a", "stroke-width": 2.5, "stroke-dasharray": "5 4" }));
      else over.append(S("path", { d: `M${pts[0][0]} ${pts[0][1]} A104 104 0 0 1 ${pts[2][0]} ${pts[2][1]}`, fill: "none", stroke: "#16141a", "stroke-width": 3 }));
      pts.forEach(([x, y], k) => over.append(S("circle", { cx: x, cy: y, r: k === (pts.length === 3 ? 1 : 0) ? 7 : 5.5, fill: "#fff", stroke: "#16141a", "stroke-width": 2.5 })));
    }
    function draw() {
      const bc = val < 0 ? shade(WHEEL[base][1], -val / 100) : tint(WHEEL[base][1], val / 100);
      const idx = schemeIdx();
      wedges.forEach((w, i) => w.setAttribute("opacity", idx.includes(i) ? "1" : (document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches)) ? "0.55" : "0.4"));
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
    document.addEventListener("hm-theme", draw);

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
      const x = Math.max(70, Math.min(186, 170 - 60 * d));
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
    a(S("path", { d: "M232 162 C 294 160, 296 220, 294 260 L 294 300 S 282 352, 214 372", fill: "none", stroke: P.red, "stroke-width": 2.5, "stroke-dasharray": "2 5", "stroke-linecap": "round" }));
    a(S("path", { d: "M220 365 L210 374 L223 377", fill: "none", stroke: P.red, "stroke-width": 2.5, "stroke-linecap": "round" }));
    // 4 inset photo with drop shadow (depth)
    const ig = a(S("g", { filter: "url(#dp-hs-sh)" }));
    ig.append(S("rect", { x: 202, y: 222, width: 82, height: 62, fill: "#ec4a24" }));
    ig.append(S("rect", { x: 206, y: 226, width: 74, height: 54, fill: "#bfe1f5" }));
    const sg = a(S("g")); sg.append(S("rect", { x: 206, y: 266, width: 74, height: 14, fill: "#1d5d8f" })); ship(sg, 213, 228, 1);
    // 5 caption next to inset (proximity)
    a(S("text", { x: 202, y: 297, "font-size": 9.5, fill: P.ink, text: "Aboard HMS Vellum" }));
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
    { n: 2, px: 20, py: 58, r: [0, 44, 300, 74], ans: "Contrast", opts: ["Texture", "Contrast", "Rhythm", "Depth"], d: "The title is white reverse text on a dark navy band: light against dark.", why: "The strongest difference in value on the page: white on navy. That difference is contrast, and it is what makes the title readable from a distance." },
    { n: 3, px: 60, py: 145, r: [16, 126, 268, 140], ans: "Dominance", opts: ["White space", "Alignment", "Dominance", "Rhythm"], d: "The aircraft photograph is by far the largest item, filling about a third of the page.", why: "One item much larger than all others becomes the focal point: that is dominance. The eye lands here first." },
    { n: 4, px: 266, py: 236, r: [202, 222, 82, 62], ans: "Depth", opts: ["Alignment", "Rhythm", "Texture", "Depth"], d: "The ship photo overlaps the corner of the main photo, has a drop shadow and a warm red-orange frame.", why: "Overlap, a drop shadow and an advancing warm frame make the inset seem to sit in front of the main photo: depth." },
    { n: 5, px: 184, py: 294, r: [198, 286, 92, 16], ans: "Unity/proximity", opts: ["Dominance", "Unity/proximity", "Depth", "Texture"], d: "The caption sits directly beneath the ship photo, close to it and away from other text.", why: "Placing related items close together so they read as one group is proximity, a way of creating unity." },
    { n: 6, px: 291, py: 205, r: [228, 156, 70, 222], ans: "Line", opts: ["Line", "Texture", "Balance", "Value"], d: "A dotted red line curves from the aircraft's nose down the right-hand side to the date panel.", why: "This is the element line, used to lead the eye: it takes the viewer from the aircraft to the date." },
    { n: 7, px: 150, py: 342, r: [16, 308, 268, 46], ans: "Grid structure", opts: ["Depth", "Texture", "Dominance", "Grid structure"], d: "The three activities sit in three equal columns. The first column lines up with the left edges of the main photo and the date panel, and the third with the left edge of the inset photo.", why: "Items placed in equal columns on a common framework are using grid structure. (The repeated number-and-heading format is also rhythm, but the columns are the grid.)" },
    { n: 8, px: 220, py: 377, r: [16, 362, 190, 30], ans: "Emphasis", opts: ["Emphasis", "Texture", "Rhythm", "Line"], d: "The date and time are in navy bold text on a yellow panel, the only large yellow block on the lower half.", why: "A bright accent panel makes the date stand out from everything near it: emphasis on the information parents need." },
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
    ["colours", "The same red, yellow and blue are repeated in the pennants, headings, date panel and badge"],
    ["caption", "The caption sits directly beneath the ship photo"],
  ];
  const EFFECTS = [
    ["stand", "so it stands out and is one of the first things the viewer notices"],
    ["order", "so the viewer reads the most important information first"],
    ["forward", "so it seems to come forward, nearer to the viewer than the background"],
    ["layers", "giving a layered, three-dimensional look to a flat page"],
    ["belong", "so the viewer sees the items as belonging together in one planned design"],
    ["group", "so the viewer reads the related items as a group"],
    ["creates", "which creates emphasis"], // text updated to name the question's principle
    ["lopsided", "so the layout looks lopsided"],
  ];
  const XQ = {
    emphasis: { q: "Explain how emphasis has been achieved in the recruitment poster.", causes: ["date", "title", "path"], effects: ["stand", "order"] },
    depth: { q: "Explain how depth has been created in the recruitment poster.", causes: ["inset", "frame"], effects: ["forward", "layers"] },
    unity: { q: "Explain how unity has been achieved in the recruitment poster.", causes: ["colours", "caption"], effects: ["belong", "group"] },
  };
  const MISFIT = {
    emphasis: { photo: "✘ 0: making one item far larger than everything else is dominance (the main focal point of the whole poster). Emphasis questions want how particular items, such as the date or title, are made to stand out." },
    unity: { pennants: "✘ 0: repeating the pennants at equal spacing is rhythm. For unity, point to what ties the whole design together: a consistent colour scheme, or related items grouped together." },
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
      const upd = () => { const ct = CAUSES.find((x) => x[0] === c.value)[1], et = e.value === "creates" ? `which creates ${qk}` : EFFECTS.find((x) => x[0] === e.value)[1]; out.innerHTML = c.value === "none" ? `<span class="dp-effect">${HG.esc(et.replace(/^so |^which |^giving /, (m) => m[0].toUpperCase() + m.slice(1)))}.</span>` : `<span class="dp-cause">${HG.esc(ct)}</span>, <span class="dp-effect">${HG.esc(et)}.</span>`; res.textContent = ""; };
      c.addEventListener("change", upd); e.addEventListener("change", upd);
      return { c, e, res, upd };
    });
    const markBtn = E("button", { class: "btn primary small", type: "button" }, "✔ Mark my answer");
    const total = E("p", { class: "readout", "aria-live": "polite" });
    box.append(E("div", { class: "btn-row" }, markBtn), total);
    function reset() { rows.forEach((r) => { const o = [...r.e.options].find((x) => x.value === "creates"); if (o) o.textContent = `which creates ${qk}`; }); qline.textContent = XQ[qk].q; rows.forEach((r) => { r.c.value = "none"; r.e.value = "creates"; r.upd(); }); total.textContent = ""; }
    markBtn.addEventListener("click", () => {
      const Q = XQ[qk]; let sum = 0; const used = new Set();
      rows.forEach((r, k) => {
        const c = r.c.value, e = r.e.value; let ok = false, why;
        if (c === "none") why = "✘ 0: an effect with no cause. The marker cannot tell which feature you mean.";
        else if (!Q.causes.includes(c)) why = (MISFIT[qk] && MISFIT[qk][c]) || `✘ 0: that feature does not create ${qk}. Re-read the question.`;
        else if (e === "creates") why = `✘ 0: "creates ${qk}" names the design principle, not an effect on the viewer. Say what happens to the viewer.`;
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
  /* convert a pointer event to the user units of an svg */
  function svgPoint(svg, e) {
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /* =====================================================================
     5. Grid builder
     ===================================================================== */
  const SIZES = { A5: [148, 210], A4: [210, 297], A3: [297, 420] };
  mount("w-grid", (box) => {
    const st = { size: "A4", orient: "portrait", cols: 3, margin: 15, gutter: 5, base: true, guides: true, snap: true, qx: null, qy: null };
    const ctl = E("div");
    HG.choice(ctl, "Page", [["A5", "A5"], ["A4", "A4"], ["A3", "A3"]], st.size, (v) => { st.size = v; st.qx = null; layout(true); });
    HG.choice(ctl, "Orientation", [["portrait", "Portrait"], ["landscape", "Landscape"]], st.orient, (v) => { st.orient = v; st.qx = null; layout(true); });
    const sl = E("div", { class: "sim-controls" }); ctl.append(sl);
    HG.slider(sl, { label: "Columns", min: 1, max: 6, step: 1, value: st.cols, oninput: (v) => { st.cols = v; layout(true); } });
    HG.slider(sl, { label: "Margins", min: 5, max: 30, step: 1, value: st.margin, unit: "mm", oninput: (v) => { st.margin = v; layout(true); } });
    HG.slider(sl, { label: "Gutter", min: 2, max: 12, step: 1, value: st.gutter, unit: "mm", oninput: (v) => { st.gutter = v; layout(true); } });
    const tg = E("div", { class: "btn-row" });
    const tog = (label, key) => { const b = E("button", { class: "seg-btn", type: "button", "aria-pressed": String(st[key]) }, label); b.addEventListener("click", () => { st[key] = !st[key]; b.setAttribute("aria-pressed", String(st[key])); layout(false); }); tg.append(b); return b; };
    tog("Baseline grid", "base"); tog("Show guides", "guides"); tog("Snap", "snap");
    ctl.append(tg);
    const svg = S("svg", { class: "dp-grid-svg", role: "img" });
    const mv = E("div", { class: "btn-row", role: "group", "aria-label": "Move the pull-quote box" });
    const moveBy = (dx, dy) => {
      const L = geo(), x = st.qx ?? L.x0, y = st.qy ?? L.y0 + L.ch * 0.62;
      if (st.snap && dx) {
        // with snap on, a sideways step jumps to the next column edge rather than snapping back
        const edges = []; for (let i = 0; i < L.n; i++) edges.push(L.colX(i));
        const nx = dx > 0 ? edges.find((e) => e > x + 0.5) : [...edges].reverse().find((e) => e < x - 0.5);
        place(nx ?? x, y); return;
      }
      place(x + dx, y + (st.snap && dy ? Math.sign(dy) * 5 : dy));
    };
    [["◀", -4, 0, "left"], ["▶", 4, 0, "right"], ["▲", 0, -4, "up"], ["▼", 0, 4, "down"]].forEach(([t, dx, dy, w]) => { const b = E("button", { class: "btn small", type: "button", "aria-label": "Move pull-quote box " + w }, t); b.addEventListener("click", () => moveBy(dx, dy)); mv.append(b); });
    const snapMsg = E("span", { class: "hint", style: "margin:0" });
    mv.append(snapMsg);
    const rd = E("div", { class: "readouts", "aria-live": "polite" });
    const note = E("p", { class: "sim-note", "aria-live": "polite" });
    box.append(ctl, E("div", { class: "dp-grid-wrap" }, svg), mv, rd, note);
    let cur = null, stop = null;
    function geo() {
      let [W, H] = SIZES[st.size]; if (st.orient === "landscape") [W, H] = [H, W];
      const m = st.margin, g = st.gutter, n = st.cols;
      const cw = (W - 2 * m - (n - 1) * g) / n;
      return { W, H, m, g, n, cw, x0: m, y0: m, ch: H - 2 * m, colX: (i) => m + i * (cw + g) };
    }
    function target(L) {
      // placeholder content: title spans all columns, image spans about two-thirds, text fills the rest
      const span = L.n === 1 ? 1 : Math.max(1, Math.round(L.n * 2 / 3)), it = {};
      const tH = Math.max(14, L.ch * 0.1);
      it.title = [L.x0, L.y0, L.W - 2 * L.m, tH];
      const iy = L.y0 + tH + L.g, iH = L.ch * 0.36;
      it.image = [L.x0, iy, span * L.cw + (span - 1) * L.g, iH];
      it.cols = [];
      for (let i = 0; i < L.n; i++) {
        const x = L.colX(i), top = i < span ? iy + iH + L.g : iy;
        it.cols.push([x, top, L.cw, L.y0 + L.ch - top]);
      }
      return it;
    }
    const lerpBox = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
    function layout(animate) {
      const L = geo(), T = target(L);
      const from = cur && cur.cols.length === T.cols.length ? cur : null;
      if (stop) stop();
      if (animate && from) stop = tween(450, (t) => { cur = { title: lerpBox(from.title, T.title, t), image: lerpBox(from.image, T.image, t), cols: T.cols.map((c, i) => lerpBox(from.cols[i], c, t)) }; paint(L); });
      else { cur = T; paint(L); }
      const words = Math.round(L.cw / 1.5 / 5.5); // about 1.5 mm per character at 10 pt, ~5.5 characters a word
      rd.innerHTML = "";
      [["Page", `${st.size} ${st.orient}, ${L.W} × ${L.H} mm`], ["Content width", `${HG.n(L.W - 2 * L.m, 1)} mm`], ["Column width", `${HG.n(L.cw, 1)} mm`], ["Words per line (10 pt)", `about ${words}`]].forEach(([a, b]) => rd.append(E("div", null, E("span", null, a), E("b", null, b))));
      note.textContent = `Column width = (page width − 2 × margin − (columns − 1) × gutter) ÷ columns = (${L.W} − ${2 * L.m} − ${(L.n - 1) * L.g}) ÷ ${L.n} = ${HG.n(L.cw, 1)} mm. ` +
        (L.cw < 30 ? "These columns are very narrow: only a few words fit on a line, so text breaks awkwardly and hyphenates a lot." : L.cw > 120 ? "These lines are very long: the eye struggles to find the start of the next line. More columns would help." : "A comfortable line length for body text.");
      svg.setAttribute("aria-label", `${st.size} ${st.orient} page, ${L.n} column${L.n > 1 ? "s" : ""} of ${HG.n(L.cw, 1)} mm, margins ${L.m} mm, gutters ${L.g} mm. The title spans all columns, the image spans ${Math.round(T.image[2] / (L.cw + L.g)) || 1}, and placeholder text fills the rest.`);
    }
    function snapTo(L, x, y) {
      // snap the quote box's left edge to a column edge and its top to a baseline (5 mm) within 4 mm
      const qw = L.cw, edges = []; for (let i = 0; i < L.n; i++) edges.push(L.colX(i));
      let sx = x, sy = y, xs = null, ys = false;
      if (st.snap) {
        const ex = edges.reduce((b, e) => (Math.abs(e - x) < Math.abs(b - x) ? e : b), edges[0]);
        const by = L.y0 + Math.round((y - L.y0) / 5) * 5;
        if (Math.abs(ex - x) <= 4) { sx = ex; xs = edges.indexOf(ex) + 1; }
        if (Math.abs(by - y) <= 4) { sy = by; ys = true; }
      }
      const msg = !st.snap ? "Snap off: free placement, so the box's edges need not line up with the grid." :
        xs && ys ? `Snapped: left edge on column ${xs}, top on a baseline.` : xs ? `Snapped: left edge on column ${xs}.` : ys ? "Top snapped to a baseline; left edge not near a column edge." : "Not near a guide, so nothing snapped.";
      sx = Math.max(0, Math.min(L.W - qw, sx)); sy = Math.max(0, Math.min(L.H - 24, sy));
      return { sx, sy, msg };
    }
    function place(x, y) { const L = geo(); const r = snapTo(L, x, y); st.qx = r.sx; st.qy = r.sy; snapMsg.textContent = r.msg; paint(L); }
    function paint(L) {
      const pad = 6;
      svg.setAttribute("viewBox", `${-pad} ${-pad} ${L.W + 2 * pad} ${L.H + 2 * pad}`);
      svg.innerHTML = "";
      const sw = L.W / 300;
      svg.append(S("rect", { x: 0, y: 0, width: L.W, height: L.H, fill: P.paper, stroke: "#8a8478", "stroke-width": sw }));
      if (st.base) for (let y = L.y0 + 5; y < L.y0 + L.ch; y += 5) svg.append(S("path", { d: `M${L.x0} ${y} H${L.W - L.m}`, stroke: "#9fd0f0", "stroke-width": sw * 0.8 }));
      if (st.guides) {
        svg.append(S("rect", { x: L.m, y: L.m, width: L.W - 2 * L.m, height: L.ch, fill: "none", stroke: "#d4147a", "stroke-width": sw * 1.6 }));
        for (let i = 0; i < L.n; i++) svg.append(S("rect", { x: L.colX(i), y: L.y0, width: L.cw, height: L.ch, fill: "#d4147a", "fill-opacity": 0.06, stroke: "#7b3fbf", "stroke-width": sw, "stroke-dasharray": `${3 * sw} ${2 * sw}` }));
      }
      const [tx, ty, tw, th] = cur.title;
      svg.append(S("rect", { x: tx, y: ty, width: tw, height: th, fill: P.navy }));
      const fs = Math.min(th * 0.55, tw / 9);
      svg.append(S("text", { x: tx + tw / 2, y: ty + th / 2 + fs * 0.36, "font-size": fs, "font-weight": 700, fill: "#fff", "text-anchor": "middle", text: "REGATTA PROGRAMME" }));
      const [ix, iy, iw, ih] = cur.image;
      svg.append(S("rect", { x: ix, y: iy, width: iw, height: ih, fill: P.blue }));
      svg.append(S("path", { d: `M${ix} ${iy + ih * 0.78} Q${ix + iw / 2} ${iy + ih * 0.7} ${ix + iw} ${iy + ih * 0.8} V${iy + ih} H${ix} Z`, fill: "#1d5d8f" }));
      ship(svg, ix + iw / 2 - 30 * ih / 80, iy + ih * 0.3, ih / 80);
      cur.cols.forEach(([x, y, w, h]) => {
        let k = 0;
        for (let yy = L.y0 + Math.ceil((y + 2 - L.y0) / 5) * 5; yy <= y + h; yy += 5) {
          const len = (k % 7 === 6) ? w * 0.55 : w * (0.9 + 0.1 * Math.sin(k * 2.3 + x));
          svg.append(S("rect", { x, y: yy - 2.6, width: len, height: 2.2, fill: "#8a8478" })); k++;
        }
      });
      // the draggable pull-quote box
      const qx = st.qx ?? L.x0, qy = st.qy ?? (L.y0 + L.ch * 0.62);
      const q = S("g", { class: "dp-grid-q" });
      q.append(S("rect", { x: qx, y: qy, width: L.cw, height: 24, fill: P.yellow, stroke: P.navy, "stroke-width": sw }));
      q.append(S("text", { x: qx + L.cw / 2, y: qy + 15, "font-size": Math.min(8, L.cw / 7), "font-weight": 700, fill: P.navy, "text-anchor": "middle", text: "“A sea of flags”" }));
      svg.append(q);
    }
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      const L = geo(), p = svgPoint(svg, e), qx = st.qx ?? L.x0, qy = st.qy ?? (L.y0 + L.ch * 0.62);
      if (p.x >= qx && p.x <= qx + L.cw && p.y >= qy && p.y <= qy + 24) { drag = { dx: p.x - qx, dy: p.y - qy }; svg.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    svg.addEventListener("pointermove", (e) => { if (!drag) return; const p = svgPoint(svg, e); place(p.x - drag.dx, p.y - drag.dy); });
    const end = () => { drag = null; }; svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    layout(false);
    snapMsg.textContent = "Drag the yellow pull-quote box, or use the arrows.";
  });

  /* =====================================================================
     6. Anatomy of a page
     ===================================================================== */
  const ANAT = [
    ["Header", [20, 6, 260, 28], "The area at the top of every page, set on the master page. Here it holds the running headline and a rule."],
    ["Running headline", [60, 10, 180, 16], "The publication's name repeated at the top of every page, so readers always know where they are."],
    ["Rule", [20, 29, 260, 4], "A printed line used to separate areas: here it divides the header from the page content."],
    ["Title", [20, 40, 260, 36], "The main name of the document: the largest text."],
    ["Heading", [20, 80, 170, 20], "The name of this article. It is smaller than the title but larger and bolder than body text."],
    ["Drop cap", [20, 104, 26, 24], "An enlarged first letter dropping over three lines, to show the reader where the text starts."],
    ["Indent", [20, 199, 16, 9], "The first line of the new paragraph starts further in, marking the paragraph break."],
    ["Column rule", [147, 104, 6, 196], "A vertical line printed in the gutter between the two columns."],
    ["Gutter", [140, 104, 20, 196], "The gap between the two columns that keeps their text apart."],
    ["Pull quote", [160, 196, 120, 52], "A short extract from the article, enlarged between rules to catch the eye."],
    ["Caption", [160, 176, 120, 14], "Text beneath the image explaining what it shows."],
    ["Hanging indent", [160, 254, 120, 46], "Numbered list: each first line starts at the left, and the following lines are indented, so the numbers stand out."],
    ["Reverse text", [20, 306, 260, 28], "White text on a dark navy panel: high contrast that draws attention to the results time."],
    ["Footer", [20, 388, 260, 30], "The area at the bottom of every page, holding the squadron name and page number."],
    ["Folio", [262, 396, 22, 20], "The page number."],
    ["Margin", [0, 0, 300, 424], "The clear border between the page edge and the content: here 20 units on each side. The header and footer sit in the top and bottom margins, as they usually do."],
  ];
  mount("w-anatomy", (box) => {
    const svg = S("svg", { viewBox: "0 0 300 424", class: "dp-anat-svg", role: "img", "aria-label": "A page from the regatta programme with a header and running headline, title, heading, two columns of text with a drop cap, an indent, a column rule, an image with caption, a pull quote, a numbered list with hanging indents, a reverse-text panel and a footer with the folio." });
    const a = (el) => { svg.append(el); return el; };
    a(S("rect", { width: 300, height: 424, fill: P.paper, stroke: "#8a8478" }));
    a(S("text", { x: 150, y: 22, "font-size": 10, fill: P.grey, "text-anchor": "middle", "letter-spacing": 1, text: "HMS VELLUM · REGATTA PROGRAMME" }));
    a(S("rect", { x: 20, y: 30, width: 260, height: 1.6, fill: P.red }));
    a(S("text", { x: 20, y: 70, "font-size": 30, "font-weight": 700, fill: P.navy, text: "REGATTA DAY" }));
    a(S("text", { x: 20, y: 95, "font-size": 15, "font-weight": 700, fill: P.red, text: "The Great Race" }));
    a(S("text", { x: 21, y: 127, "font-size": 31, "font-weight": 700, fill: P.navy, style: "font-family:Georgia,'DejaVu Serif','Liberation Serif',serif", text: "T" }));
    const lines = (x, y0, y1, w, skip) => { for (let y = y0, k = 0; y <= y1; y += 8, k++) { if (skip && skip(y)) continue; const ind = skip && skip.ind ? skip.ind(y) : 0; a(S("rect", { x: x + ind, y, width: (k % 6 === 5 ? w * 0.6 : w) - ind, height: 3, fill: "#8a8478" })); } };
    const dc = (y) => (y < 134 ? 28 : 0); const f1 = () => false; f1.ind = (y) => (y < 130 ? 28 : y === 202 ? 14 : 0); // drop cap over three lines; indent on the new paragraph
    lines(20, 106, 296, 120, f1);
    a(S("rect", { x: 149.3, y: 104, width: 1.4, height: 196, fill: P.grey }));
    a(S("rect", { x: 160, y: 106, width: 120, height: 66, fill: P.blue })); a(S("path", { d: "M160 158 Q220 150 280 160 V172 H160 Z", fill: "#1d5d8f" })); ship(svg, 196, 118, 0.8);
    a(S("text", { x: 160, y: 186, "font-size": 9.5, "font-style": "italic", fill: P.ink, text: "Cutters round the first buoy" }));
    a(S("rect", { x: 160, y: 198, width: 120, height: 1.6, fill: P.red })); a(S("rect", { x: 160, y: 244, width: 120, height: 1.6, fill: P.red }));
    a(S("text", { x: 220, y: 219, "font-size": 15, "font-style": "italic", fill: P.red, "text-anchor": "middle", text: "“A sea of flags" })); a(S("text", { x: 220, y: 237, "font-size": 15, "font-style": "italic", fill: P.red, "text-anchor": "middle", text: "from bow to stern”" }));
    [256, 278].forEach((y, i) => { a(S("text", { x: 160, y: y + 4, "font-size": 10, "font-weight": 700, fill: P.navy, text: (i + 1) + "." })); a(S("rect", { x: 172, y, width: 108, height: 3, fill: "#8a8478" })); a(S("rect", { x: 172, y: y + 8, width: 96, height: 3, fill: "#8a8478" })); });
    a(S("rect", { x: 20, y: 306, width: 260, height: 28, fill: P.navy }));
    a(S("text", { x: 150, y: 324, "font-size": 12, "font-weight": 700, fill: "#fff", "text-anchor": "middle", text: "RESULTS ON THE QUARTERDECK AT 4PM" }));
    lines(20, 344, 376, 260);
    a(S("rect", { x: 20, y: 392, width: 260, height: 1, fill: P.grey }));
    a(S("text", { x: 20, y: 410, "font-size": 10, fill: P.grey, text: "1805 (Blockhaven) Squadron" }));
    a(S("text", { x: 280, y: 410, "font-size": 12, "font-weight": 700, fill: P.navy, "text-anchor": "end", text: "7" }));
    const hi = a(S("g", { "pointer-events": "none" }));
    const terms = E("div", { class: "dp-anat-terms", role: "group", "aria-label": "Page features" });
    const out = E("p", { class: "sim-note", "aria-live": "polite" }, "Tap a term or a part of the page.");
    const btns = ANAT.map(([t], i) => { const b = E("button", { class: "seg-btn", type: "button", "aria-pressed": "false" }, t); b.addEventListener("click", () => show(i)); terms.append(b); return b; });
    let stopP = null;
    function show(i) {
      const [t, r, d] = ANAT[i];
      btns.forEach((b, j) => b.setAttribute("aria-pressed", String(i === j)));
      hi.innerHTML = "";
      if (t === "Margin") { hi.append(S("path", { d: "M0 0 H300 V424 H0 Z M20 20 V404 H280 V20 Z", fill: "#d4147a", "fill-opacity": 0.25, "fill-rule": "evenodd" })); }
      else {
        const rect = S("rect", { x: r[0] - 1, y: r[1] - 1, width: r[2] + 2, height: r[3] + 2, fill: "#d4147a", "fill-opacity": 0.14, stroke: "#d4147a", "stroke-width": 2.5 });
        hi.append(rect);
        if (stopP) stopP();
        stopP = tween(500, (k) => rect.setAttribute("stroke-width", String(lerp(7, 2.5, k))));
      }
      out.innerHTML = `<b>${t}.</b> ${HG.esc(d)}`;
    }
    svg.addEventListener("click", (e) => {
      const p = svgPoint(svg, e);
      let best = -1, area = Infinity;
      ANAT.forEach(([t, r], i) => { if (t === "Margin") return; if (p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3] && r[2] * r[3] < area) { area = r[2] * r[3]; best = i; } });
      if (best < 0 && (p.x < 20 || p.x > 280 || p.y < 20 || p.y > 404)) best = ANAT.length - 1;
      if (best >= 0) show(best); else out.textContent = "That's body text. Try a heading, a rule, the pull quote or the footer.";
    });
    box.append(E("div", { class: "dp-anat-grid" }, E("div", { class: "dp-anat-page" }, svg), E("div", null, terms, out)));
  });

  /* =====================================================================
     7. Type-setting playground (real DOM text)
     ===================================================================== */
  mount("w-typeset", (box) => {
    const st = { font: "serif", just: "left", lead: 1.5, drop: false, ind: "none", cols: 1, rule: false, rev: false };
    const ctl = E("div");
    HG.choice(ctl, "Font", [["serif", "Serif"], ["sans", "Sans serif"], ["script", "Script"]], st.font, (v) => { st.font = v; apply(); });
    HG.choice(ctl, "Justification", [["left", "Left"], ["center", "Centred"], ["right", "Right"], ["justify", "Full"]], st.just, (v) => { st.just = v; apply(); });
    HG.choice(ctl, "Paragraph", [["none", "Plain"], ["indent", "Indent"], ["hanging", "Hanging indent"]], st.ind, (v) => { st.ind = v; apply(); });
    HG.choice(ctl, "Columns", [[1, "1"], [2, "2"], [3, "3"]], st.cols, (v) => { st.cols = v; apply(); });
    const sl = E("div", { class: "sim-controls" }); ctl.append(sl);
    HG.slider(sl, { label: "Line spacing", min: 1, max: 2.2, step: 0.1, value: st.lead, fmt: (v) => v.toFixed(1) + " × font size", oninput: (v) => { st.lead = v; apply(); } });
    const tg = E("div", { class: "btn-row" });
    const tog = (label, key) => { const b = E("button", { class: "seg-btn", type: "button", "aria-pressed": "false" }, label); b.addEventListener("click", () => { st[key] = !st[key]; b.setAttribute("aria-pressed", String(st[key])); apply(); }); tg.append(b); };
    tog("Drop cap", "drop"); tog("Column rule", "rule"); tog("Reverse", "rev");
    ctl.append(tg);
    const text = [
      "The regatta begins at first light, when every ship in the squadron hoists its signal flags from bow to stern. Cutters crewed by cadets race twice round the harbour buoys, and the first boat home wins the Blockhaven pennant for a year.",
      "Spectators can watch from the quarterdeck of HMS Vellum, where the ship's band plays between races. Results are posted beside the flag locker at four o'clock, and the prize-giving follows on the gun deck.",
      "Bring warm clothes and a waterproof: the harbour is breezy even in June, and the best views are from the rail.",
    ];
    const sheet = E("div", { class: "dp-ts-sheet" });
    const article = E("div", { class: "dp-ts-text", lang: "en-GB" });
    text.forEach((t) => article.append(E("p", null, t)));
    sheet.append(E("h4", { class: "dp-ts-head" }, "Regatta day"), article);
    const rd = E("p", { class: "sim-note", "aria-live": "polite" });
    box.append(ctl, sheet, rd);
    function apply() {
      const fam = { serif: "Georgia, 'Times New Roman', 'DejaVu Serif', serif", sans: "var(--font-body)", script: "'Segoe Script', 'Brush Script MT', 'URW Chancery L', 'Z003', cursive" }[st.font];
      sheet.style.fontFamily = fam;
      article.style.textAlign = st.just; article.style.lineHeight = st.lead;
      article.style.columnCount = st.cols; article.style.columnGap = "1.4em";
      article.style.columnRule = st.rule && st.cols > 1 ? "1.5px solid currentColor" : "none";
      article.classList.toggle("drop", st.drop); article.classList.toggle("indent", st.ind === "indent"); article.classList.toggle("hanging", st.ind === "hanging");
      sheet.classList.toggle("rev", st.rev);
      const parts = [`${{ serif: "serif", sans: "sans serif", script: "script" }[st.font]} font`, { left: "left justified (ragged right)", center: "centred", right: "right justified (ragged left)", justify: "fully justified (both edges straight)" }[st.just], `line spacing ${st.lead.toFixed(1)}`];
      if (st.drop) parts.push("drop cap"); if (st.ind !== "none") parts.push(st.ind === "indent" ? "first-line indent" : "hanging indent");
      if (st.cols > 1) parts.push(`${st.cols} columns${st.rule ? " with column rules" : ""}`); if (st.rev) parts.push("reverse text");
      let tip = "";
      if (st.font === "script") tip = " Script in a long passage is slow to read: keep it for short titles.";
      else if (st.just === "justify" && st.cols >= 3) tip = " Full justification in narrow columns stretches the word spaces into uneven gaps.";
      else if (st.just === "center" || st.just === "right") tip = " Centred or right-justified body text is hard to read because each line starts in a different place.";
      else if (st.lead < 1.2) tip = " Lines this close crowd each other: the eye slips to the wrong line.";
      else if (st.lead > 1.9) tip = " Lines this far apart stop reading as one paragraph.";
      else if (st.rev) tip = " Reverse text is strong for short passages; in long text it tires the eye.";
      rd.textContent = "Settings: " + parts.join(" · ") + "." + tip;
    }
    apply();
  });

  /* =====================================================================
     8. Crop bench (square crop, full crop, text wrap)
     ===================================================================== */
  const PLANE_OUT = [[52, 48], [62, 48], [66, 64], [108, 64], [110, 56], [128, 56], [132, 64], [150, 64], [156, 66], [158, 72], [156, 78], [150, 80], [136, 86], [138, 98], [132, 98], [128, 86], [96, 86], [94, 98], [88, 98], [86, 86], [80, 86], [60, 80], [52, 80]];
  mount("w-crop", (box) => {
    const st = { mode: "orig", l: 20, r: 85, t: 25, b: 80 };
    HG.choice(box, "Image", [["orig", "Original"], ["square", "Square crop"], ["full", "Full crop"]], st.mode, (v) => { st.mode = v; apply(); });
    const sl = E("div", { class: "sim-controls" }); box.append(sl);
    const sls = [
      HG.slider(sl, { label: "Crop left", min: 0, max: 45, value: st.l, unit: "%", oninput: (v) => { st.l = v; if (st.mode === "orig") setMode("square"); apply(); } }),
      HG.slider(sl, { label: "Crop right", min: 55, max: 100, value: st.r, unit: "%", oninput: (v) => { st.r = v; if (st.mode === "orig") setMode("square"); apply(); } }),
      HG.slider(sl, { label: "Crop top", min: 0, max: 45, value: st.t, unit: "%", oninput: (v) => { st.t = v; if (st.mode === "orig") setMode("square"); apply(); } }),
      HG.slider(sl, { label: "Crop bottom", min: 55, max: 100, value: st.b, unit: "%", oninput: (v) => { st.b = v; if (st.mode === "orig") setMode("square"); apply(); } })];
    const setMode = (m) => { st.mode = m; box.querySelectorAll(".seg-btn").forEach((b, i) => b.setAttribute("aria-pressed", String(["orig", "square", "full"][i] === m))); };
    const page = E("div", { class: "dp-crop-page" });
    const fl = E("div", { class: "dp-crop-float", role: "img" });
    const sv = S("svg", { viewBox: "0 0 200 140", preserveAspectRatio: "none", "aria-hidden": "true" });
    sv.append(S("rect", { width: 200, height: 140, fill: "#9fc6e4" }), S("rect", { y: 100, width: 200, height: 40, fill: "#9a9a92" }), S("rect", { x: 4, y: 20, width: 40, height: 80, fill: "#7d6a58" }), S("rect", { x: 10, y: 30, width: 28, height: 70, fill: "#6a5848" }), S("rect", { x: 166, y: 76, width: 30, height: 26, fill: P.red }), S("rect", { x: 174, y: 68, width: 12, height: 8, fill: "#555" }));
    sv.append(S("polygon", { points: PLANE_OUT.map((p) => p.join(",")).join(" "), fill: P.yellow }));
    [[60, 72, 90, 8, "#d9a900"], [110, 57, 18, 7, "#3d6e8f"], [52, 48, 8, 4, P.red], [80, 82, 50, 4, "#b89300"], [88, 86, 6, 12, "#555"], [132, 86, 6, 12, "#555"], [156, 66, 3, 12, "#555"]].forEach(([x, y, w, h, f]) => sv.append(S("rect", { x, y, width: w, height: h, fill: f })));
    fl.append(sv);
    const copy = "Every Tuesday and Thursday evening the squadron meets on the gun deck of HMS Vellum. Cadets learn to fly in the Grob Tutor trainer, to read a map and a signal flag, and to build anything from a cutter to a castle on the ship's Minecraft server. Summer camps take cadets to air stations across the country, and the best get the chance to go solo in a glider. You do not need any experience: just curiosity, a sense of adventure and the will to work as a team. Parents are welcome at the open evening to meet the staff and ask questions about uniform, costs and safety.";
    page.append(fl, E("p", null, copy), E("p", null, "Uniform is provided once you have enrolled, and most activities are free or heavily subsidised. Cadets work towards classification badges, first aid and radio qualifications, and the Duke of Edinburgh's Award, and many go on to lead others as non-commissioned cadets. Come aboard on the fourth of November at seven o'clock and see for yourself."));
    const note = E("p", { class: "sim-note", "aria-live": "polite" });
    box.append(page, note);
    const W = 200, H = 140;
    function rectPts(x0, y0, x1, y1) {
      // the crop rectangle as the same number of points as the aircraft outline (so CSS can morph between them):
      // the four corners, with the remaining points spread along each edge in proportion to its length
      const N = PLANE_OUT.length, w = x1 - x0, h = y1 - y0, per = 2 * (w + h);
      const n = [w, h, w, h].map((L) => Math.max(1, Math.round((N - 4) * L / per)));
      while (n.reduce((a, b) => a + b, 0) > N - 4) n[n.indexOf(Math.max(...n))]--;
      while (n.reduce((a, b) => a + b, 0) < N - 4) n[n.indexOf(Math.min(...n))]++;
      const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], out = [];
      for (let e = 0; e < 4; e++) {
        const [ax, ay] = C[e], [bx, by] = C[(e + 1) % 4];
        for (let k = 0; k <= n[e]; k++) out.push([ax + (bx - ax) * k / (n[e] + 1), ay + (by - ay) * k / (n[e] + 1)]);
      }
      return out;
    }
    function apply() {
      let pts, x0, y0, x1, y1;
      if (st.mode === "orig") { [x0, y0, x1, y1] = [0, 0, W, H]; pts = rectPts(0, 0, W, H); }
      else if (st.mode === "square") { x0 = st.l / 100 * W; x1 = st.r / 100 * W; y0 = st.t / 100 * H; y1 = st.b / 100 * H; pts = rectPts(x0, y0, x1, y1); }
      else { pts = PLANE_OUT; }
      const poly = "polygon(" + pts.map(([x, y]) => `${HG.n(x / W * 100, 2)}% ${HG.n(y / H * 100, 2)}%`).join(", ") + ")";
      fl.style.clipPath = poly; fl.style.shapeOutside = poly;
      fl.style.shapeMargin = st.mode === "full" ? "8px" : "6px";
      sls.forEach((s) => (s.input.disabled = st.mode === "full"));
      const lab = { orig: "The original photo: hangar wall, fuel tanker and apron compete with the aircraft. Text wraps round the whole rectangular frame.", square: `Square crop: ${100 - (st.r - st.l)}% of the width and ${100 - (st.b - st.t)}% of the height trimmed away. The edges are still straight, so the text wraps round a rectangle, and some background remains.`, full: "Full crop: the outline of the aircraft has been followed exactly and all the background removed. The aircraft now sits straight on the page, and the text wraps tightly round its shape." }[st.mode];
      note.textContent = lab;
      fl.setAttribute("aria-label", lab);
    }
    apply();
  });

  /* =====================================================================
     9. Effects playground
     ===================================================================== */
  mount("w-effects", (box) => {
    const st = { fill: "flat", col: P.red, alpha: 0, shadow: true, dist: 6, blur: 4, rot: 0 };
    const grid = E("div", { class: "dp-fx-grid" });
    const photo = S("svg", { viewBox: "0 0 160 110", class: "dp-fx-photo", role: "img", "aria-label": "A sunset photograph over the harbour: orange sky, a red sun, a dark blue sea and a white sail. Tap a colour to sample it with the colour picker." });
    const regions = [["sunset orange", "#f28c28", S("rect", { width: 160, height: 70 })], ["sun red", "#d7301f", S("circle", { cx: 110, cy: 50, r: 16 })], ["sea blue", "#14466e", S("rect", { y: 70, width: 160, height: 40 })], ["sail white", "#f4efe0", S("path", { d: "M40 30 L40 80 L72 80 Z" })], ["hull brown", "#6e4022", S("rect", { x: 30, y: 80, width: 50, height: 8 })]];
    regions.forEach(([n, c, el]) => { el.setAttribute("fill", c); el.style.cursor = "crosshair"; el.addEventListener("click", () => pick(n, c)); photo.append(el); });
    const pickRow = E("div", { class: "btn-row", role: "group", "aria-label": "Colour picker samples" }, E("span", { class: "seg-label" }, "Pick from photo:"));
    regions.forEach(([n, c]) => { const b = E("button", { class: "btn small", type: "button" }, E("span", { class: "sw", style: `background:${c}` }), " " + n); b.addEventListener("click", () => pick(n, c)); pickRow.append(b); });
    const stage = S("svg", { viewBox: "0 0 220 160", class: "dp-fx-stage", role: "img" });
    grid.append(E("div", null, photo, pickRow), stage);
    const ctl = E("div");
    HG.choice(ctl, "Fill", [["flat", "Colour fill"], ["linear", "Linear gradient"], ["radial", "Radial gradient"], ["texture", "Textured fill"]], st.fill, (v) => { st.fill = v; draw(); });
    const sl = E("div", { class: "sim-controls" }); ctl.append(sl);
    HG.slider(sl, { label: "Transparency", min: 0, max: 90, step: 5, value: 0, unit: "%", oninput: (v) => { st.alpha = v; draw(); } });
    HG.slider(sl, { label: "Shadow distance", min: 0, max: 14, value: st.dist, unit: "px", oninput: (v) => { st.dist = v; st.shadow = v > 0; draw(); } });
    HG.slider(sl, { label: "Shadow blur", min: 0, max: 10, value: st.blur, unit: "px", oninput: (v) => { st.blur = v; draw(); } });
    HG.slider(sl, { label: "Rotate", min: -45, max: 45, value: 0, unit: "°", oninput: (v) => { st.rot = v; draw(); } });
    const note = E("p", { class: "sim-note", "aria-live": "polite" });
    box.append(grid, ctl, note);
    let picked = "the default red";
    function pick(n, c) { st.col = c; picked = n; draw(); note.textContent = `Colour picked: ${n} (${c.toUpperCase()}). Sampling colours from the photograph makes the badge match the image exactly, which ties the layout together.`; }
    function draw() {
      stage.innerHTML = "";
      const defs = S("defs"); stage.append(defs);
      const lg = S("linearGradient", { id: "dp-fx-lg", x1: 0, y1: 0, x2: 1, y2: 1 }); lg.append(S("stop", { offset: 0, "stop-color": tint(st.col, 0.55) }), S("stop", { offset: 1, "stop-color": shade(st.col, 0.35) }));
      const rg = S("radialGradient", { id: "dp-fx-rg", cx: 0.35, cy: 0.4, r: 0.75 }); rg.append(S("stop", { offset: 0, "stop-color": tint(st.col, 0.6) }), S("stop", { offset: 1, "stop-color": shade(st.col, 0.3) }));
      const pt = S("pattern", { id: "dp-fx-tx", width: 12, height: 12, patternUnits: "userSpaceOnUse" });
      pt.append(S("rect", { width: 12, height: 12, fill: st.col }), S("rect", { width: 6, height: 6, fill: shade(st.col, 0.2) }), S("rect", { x: 6, y: 6, width: 6, height: 6, fill: tint(st.col, 0.15) }), S("rect", { x: 2, y: 8, width: 2, height: 2, fill: shade(st.col, 0.35) }));
      const fe = S("filter", { id: "dp-fx-sh", x: "-30%", y: "-30%", width: "170%", height: "170%" });
      fe.append(S("feDropShadow", { dx: st.dist * 0.7, dy: st.dist, stdDeviation: st.blur / 2, "flood-color": "#000", "flood-opacity": 0.5 }));
      defs.append(lg, rg, pt, fe);
      // background: the harbour photo, so transparency shows
      stage.append(S("rect", { width: 220, height: 160, fill: "#f28c28" }), S("rect", { y: 100, width: 220, height: 60, fill: "#14466e" }), S("circle", { cx: 170, cy: 70, r: 22, fill: "#d7301f" }));
      for (let i = 0; i < 6; i++) stage.append(S("rect", { x: 0, y: 108 + i * 8, width: 220, height: 2, fill: "#2c6a9a" }));
      const fill = { flat: st.col, linear: "url(#dp-fx-lg)", radial: "url(#dp-fx-rg)", texture: "url(#dp-fx-tx)" }[st.fill];
      const g = S("g", { transform: `rotate(${st.rot} 110 80)`, filter: st.shadow && st.dist > 0 ? "url(#dp-fx-sh)" : null });
      g.append(S("path", { d: "M40 40 L180 80 L40 120 Z", fill, "fill-opacity": String(1 - st.alpha / 100), stroke: "#fff", "stroke-width": 2 }));
      g.append(S("text", { x: 82, y: 87, "font-size": 20, "font-weight": 700, fill: textOn(st.col), "text-anchor": "middle", text: "1805" }));
      stage.append(g);
      const fx = [{ flat: "flat colour fill", linear: "linear gradient fill", radial: "radial gradient fill", texture: "textured fill" }[st.fill]];
      if (st.alpha) fx.push(`${st.alpha}% transparency`); if (st.shadow && st.dist) fx.push(`drop shadow ${st.dist}px`); if (st.rot) fx.push(`rotated ${st.rot}°`);
      stage.setAttribute("aria-label", `Pennant badge in ${picked} with ${fx.join(", ")}, over the harbour photograph.`);
      let msg = { flat: "A flat colour fill is clean and bold.", linear: "A linear gradient blends from a tint to a shade, suggesting light falling across the badge.", radial: "A radial gradient spreads from a bright centre, making the badge look rounded.", texture: "A textured fill (here a block pattern) adds visual texture and links the badge to the Minecraft theme." }[st.fill];
      if (st.alpha >= 30) msg += " With this much transparency the photo shows through, so the badge feels part of the scene but loses contrast.";
      msg += st.shadow && st.dist ? " The drop shadow lifts the badge off the background, creating depth." : " Without a shadow the badge sits flat on the photo.";
      if (Math.abs(st.rot) >= 10) msg += " Rotation adds movement and energy.";
      note.textContent = msg;
    }
    draw();
    note.textContent = "Try the fills, then pick a colour from the photograph.";
  });

  /* =====================================================================
     10. Raster vs vector zoom, file size and real JPEG compression
     ===================================================================== */
  function badgeVector(ctx, cx, cy, r) {
    ctx.fillStyle = P.navy; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = P.yellow; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = P.red; ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy - r * 0.3); ctx.lineTo(cx + r * 0.48, cy); ctx.lineTo(cx - r * 0.42, cy + r * 0.3); ctx.closePath(); ctx.fill();
  }
  mount("w-raster", (box) => {
    const RES = 24; // the raster badge is stored as 24 × 24 pixels
    const off = document.createElement("canvas"); off.width = RES; off.height = RES;
    const octx = off.getContext("2d"); octx.fillStyle = "#fffdf6"; octx.fillRect(0, 0, RES, RES); badgeVector(octx, RES / 2, RES / 2, RES * 0.46);
    let zoom = 1;
    const cv = E("canvas", { class: "sim", role: "img", "aria-label": "" });
    box.append(cv);
    const sim = HG.sim(cv, { w: 600, h: 300, height: (w) => Math.round(w * 0.5), draw(ctx, t, dt, C, s) {
      const w = s.w, h = s.h, half = w / 2, size = Math.min(half - 20, h - 46);
      ctx.fillStyle = C.card; ctx.fillRect(0, 0, w, h);
      // each panel shows the badge enlarged "zoom" times, centred on a point near the red pennant's tip
      const view = (x0, paint) => { ctx.save(); ctx.beginPath(); ctx.rect(x0 + 10, 10, half - 20, size); ctx.clip(); ctx.fillStyle = "#fffdf6"; ctx.fillRect(x0 + 10, 10, half - 20, size); paint(x0 + half / 2, 10 + size / 2); ctx.restore(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(x0 + 10, 10, half - 20, size); };
      const focus = [0.7, 0.42]; // focus point as a fraction of the badge
      const D = RES * zoom; // at ×1 the raster is drawn at its stored size, one pixel per screen pixel
      const big = D > size * 0.9, fx = big ? focus[0] : 0.5, fy = big ? focus[1] : 0.5;
      view(0, (cx, cy) => { ctx.imageSmoothingEnabled = false; ctx.drawImage(off, cx - D * fx, cy - D * fy, D, D); });
      view(half, (cx, cy) => { const ox = cx - D * fx, oy = cy - D * fy; badgeVector(ctx, ox + D / 2, oy + D / 2, D * 0.46); });
      HG.label(ctx, `Raster (${RES} × ${RES} px) × ${zoom}`, w / 4, h - 22, { align: "center", bold: true });
      HG.label(ctx, `Vector × ${zoom}`, (3 * w) / 4, h - 22, { align: "center", bold: true });
    } });
    const sl = E("div", { class: "sim-controls" }); box.append(sl);
    HG.slider(sl, { label: "Zoom", min: 1, max: 24, step: 1, value: 1, unit: "×", fmt: (v) => String(v), oninput: (v) => { zoom = v; sim.redraw(); say(); } });
    const zn = E("p", { class: "sim-note", "aria-live": "polite" }); box.append(zn);
    function say() {
      const t = zoom === 1 ? "At ×1 the raster is shown at its stored size (24 × 24 pixels), so the two look alike." : zoom < 4 ? "The raster's curved edges are starting to show steps." : `Each stored pixel is now a block ${zoom}× bigger: the raster is pixelated, while the vector is redrawn from its curves and stays sharp.`;
      zn.textContent = t; cv.setAttribute("aria-label", `Squadron badge zoomed ${zoom} times: raster on the left, vector on the right. ${t}`);
    }
    say();
    // file-size calculator
    box.append(E("h4", { class: "dp-sub" }, "How big is a raster file?"));
    const calc = E("div", { class: "dp-calc" });
    const wIn = E("input", { type: "number", min: 1, max: 20000, value: 2480, "aria-label": "Width in pixels" });
    const hIn = E("input", { type: "number", min: 1, max: 20000, value: 3508, "aria-label": "Height in pixels" });
    const bd = E("select", { "aria-label": "Bit depth" }); [[1, "1 bit (black and white)"], [8, "8 bits (256 colours or greys)"], [24, "24 bits (16.7 million colours)"], [32, "32 bits (colour + transparency)"]].forEach(([v, t]) => bd.append(E("option", { value: v, selected: v === 24 ? true : null }, t)));
    calc.append(E("label", null, "Width (px) ", wIn), E("label", null, "Height (px) ", hIn), E("label", null, "Bit depth ", bd));
    const pre = E("div", { class: "btn-row" });
    [["A4 photo at 300 ppi", 2480, 3508, 24], ["Phone screen", 1080, 1920, 24], ["64 px icon", 64, 64, 32]].forEach(([t, w, h, b]) => { const x = E("button", { class: "btn small", type: "button" }, t); x.addEventListener("click", () => { wIn.value = w; hIn.value = h; bd.value = b; calcOut(); }); pre.append(x); });
    const crd = E("div", { class: "readouts", "aria-live": "polite" });
    const cnote = E("p", { class: "sim-note" });
    box.append(calc, pre, crd, cnote);
    const fmtB = (b) => (b >= 1e6 ? HG.n(b / 1e6, 1) + " MB" : b >= 1e3 ? HG.n(b / 1e3, 1) + " kB" : b + " bytes");
    function calcOut() {
      const w = Math.max(1, Math.min(20000, Math.round(+wIn.value || 1))), h = Math.max(1, Math.min(20000, Math.round(+hIn.value || 1))), b = +bd.value;
      const bytes = Math.ceil(w * h * b / 8);
      crd.innerHTML = "";
      [["Pixels", (w * h).toLocaleString("en-GB")], ["Uncompressed size", fmtB(bytes)], ["Print size at 300 ppi", `${HG.n(w / 300 * 25.4, 0)} × ${HG.n(h / 300 * 25.4, 0)} mm`]].forEach(([a, v]) => crd.append(E("div", null, E("span", null, a), E("b", null, v))));
      cnote.textContent = `${w} × ${h} pixels × ${b} bits ÷ 8 = ${bytes.toLocaleString("en-GB")} bytes (1 MB = 1,000,000 bytes). Doubling the width and height quadruples the size; a vector logo stays the same size at any scale.`;
    }
    [wIn, hIn, bd].forEach((x) => x.addEventListener("change", calcOut)); [wIn, hIn].forEach((x) => x.addEventListener("input", calcOut));
    calcOut();
    // real JPEG compression
    box.append(E("h4", { class: "dp-sub" }, "Lossy against lossless, measured"));
    const PW = 240, PH = 160;
    const src = document.createElement("canvas"); src.width = PW; src.height = PH;
    const s2 = src.getContext("2d");
    const gr = s2.createLinearGradient(0, 0, 0, PH); gr.addColorStop(0, "#2a6fb5"); gr.addColorStop(0.6, "#bfe0f4"); gr.addColorStop(1, "#f4d9a8");
    s2.fillStyle = gr; s2.fillRect(0, 0, PW, PH); s2.fillStyle = "#1d5d8f"; s2.fillRect(0, 120, PW, 40);
    badgeVector(s2, 70, 70, 40); s2.fillStyle = "#16141a"; s2.font = "bold 22px sans-serif"; s2.fillText("1805", 130, 80);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const id = s2.getImageData(0, 0, PW, PH); for (let i = 0; i < id.data.length; i += 4) { const n = (rnd() - 0.5) * 14; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } s2.putImageData(id, 0, 0);
    const jc = E("canvas", { class: "sim", role: "img", "aria-label": "" });
    const jrd = E("div", { class: "readouts", "aria-live": "polite" });
    const jsl = E("div", { class: "sim-controls" });
    box.append(jsl, jc, jrd);
    let q = 0.5, dec = null;
    const pngBytes = Math.round((src.toDataURL("image/png").length - 22) * 3 / 4);
    const jsim = HG.sim(jc, { w: 600, h: 220, height: (w) => Math.round(w * 0.36), draw(ctx, t, dt, C, s) {
      ctx.fillStyle = C.card; ctx.fillRect(0, 0, s.w, s.h);
      const pw = (s.w - 30) / 2, ph = s.h - 30;
      ctx.imageSmoothingEnabled = false;
      // left: whole image; right: the same JPEG enlarged 4× round the badge edge
      if (dec) { ctx.drawImage(dec, 10, 10, pw, ph); ctx.drawImage(dec, 90, 30, 60, 40 * 1, 20 + pw, 10, pw, ph); }
      ctx.strokeStyle = C.line; ctx.strokeRect(10, 10, pw, ph); ctx.strokeRect(20 + pw, 10, pw, ph);
      HG.label(ctx, "JPEG", 18, 24, { bold: true }); HG.label(ctx, "detail, enlarged", 28 + pw, 24, { bold: true });
    } });
    HG.slider(jsl, { label: "JPEG quality", min: 5, max: 100, step: 5, value: 50, unit: "%", oninput: (v) => { q = v / 100; encode(); } });
    function encode() {
      const url = src.toDataURL("image/jpeg", q);
      const pad = url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0;
      const bytes = Math.round((url.length - url.indexOf(",") - 1) * 3 / 4) - pad;
      const raw = PW * PH * 3;
      const im = new Image(); im.onload = () => { dec = im; jsim.redraw(); }; im.src = url;
      jrd.innerHTML = "";
      [["Uncompressed (24-bit)", fmtB(raw)], [`JPEG at ${Math.round(q * 100)}%`, `${fmtB(bytes)} (${HG.n(raw / bytes, 0)}× smaller)`], ["PNG (lossless)", `${fmtB(pngBytes)} (${HG.n(raw / pngBytes, 1)}× smaller)`]].forEach(([a, v]) => jrd.append(E("div", null, E("span", null, a), E("b", null, v))));
      jc.setAttribute("aria-label", `The test photo saved as a JPEG at ${Math.round(q * 100)}% quality: ${fmtB(bytes)}. ${q < 0.3 ? "Blocky artefacts and colour smearing are visible round the badge." : q < 0.7 ? "Slight artefacts are visible when enlarged." : "Close to the original."}`);
    }
    encode();
  });

  /* =====================================================================
     11. Separation press: CMYK plates and misregistration
     ===================================================================== */
  const INKS = [["Cyan", [0, 174, 239]], ["Magenta", [236, 0, 140]], ["Yellow", [255, 242, 0]], ["Key (black)", [35, 31, 32]]];
  mount("w-sep", (box) => {
    const PW = 120, PH = 160;
    const src = document.createElement("canvas"); src.width = PW; src.height = PH;
    const c = src.getContext("2d");
    c.fillStyle = "#fffdf6"; c.fillRect(0, 0, PW, PH);
    c.fillStyle = P.blue; c.fillRect(0, 34, PW, 76); c.fillStyle = "#1d5d8f"; c.fillRect(0, 96, PW, 14);
    c.fillStyle = P.navy; c.fillRect(0, 0, PW, 30); c.fillStyle = "#fff"; c.font = "bold 15px sans-serif"; c.textAlign = "center"; c.fillText("REGATTA", PW / 2, 21);
    const rr = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
    rr(36, 82, 50, 10, "#7a4a22"); [44, 58, 72].forEach((m) => { rr(m, 48, 2, 34, "#4b2e14"); rr(m - 6, 52, 14, 12, "#f4efe0"); rr(m - 5, 66, 12, 12, "#f4efe0"); });
    rr(10, 118, 100, 22, P.yellow); c.fillStyle = P.navy; c.font = "bold 12px sans-serif"; c.fillText("SAT 6 JUNE", PW / 2, 134);
    [[P.red, 12], [P.yellow, 40], [P.blue, 68], [P.red, 96]].forEach(([f, x]) => { c.fillStyle = f; c.beginPath(); c.moveTo(x, 146); c.lineTo(x + 14, 146); c.lineTo(x + 7, 158); c.fill(); });
    const img = c.getImageData(0, 0, PW, PH).data;
    // one canvas per plate: ink colour laid down in proportion to that plate's coverage
    const plates = INKS.map(([, ink], k) => {
      const cv = document.createElement("canvas"); cv.width = PW; cv.height = PH;
      const pc = cv.getContext("2d"), out = pc.createImageData(PW, PH);
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i] / 255, g = img[i + 1] / 255, b = img[i + 2] / 255, K = 1 - Math.max(r, g, b);
        const cov = k === 3 ? K : K >= 1 ? 0 : (1 - [r, g, b][k] - K) / (1 - K);
        for (let j = 0; j < 3; j++) out.data[i + j] = 255 - cov * (255 - ink[j]);
        out.data[i + 3] = 255;
      }
      pc.putImageData(out, 0, 0);
      return cv;
    });
    const cv = E("canvas", { class: "sim", role: "img", "aria-label": "" });
    box.append(cv);
    let printed = 0, flying = -1, fly = 0, mis = 0, stopF = null, running = false;
    const offs = [[0, 0], [1, 0.4], [-0.6, 1], [0.3, -0.8]]; // direction each plate drifts when misregistered
    const sim = HG.sim(cv, { w: 600, h: 380, height: (w) => Math.round(w * (w < 480 ? 0.95 : 0.62)), draw(ctx, t, dt, C, s) {
      const w = s.w, h = s.h;
      ctx.fillStyle = C.card; ctx.fillRect(0, 0, w, h);
      const narrow = w < 480;
      const tw = narrow ? (w - 50) / 4 : 70, th = tw * PH / PW;
      const tpos = (k) => [10 + k * (tw + 10), 26];
      const sw = narrow ? Math.min(w * 0.46, (h - th - 80) * PW / PH) : Math.min(w - 4 * (tw + 10) - 60, (h - 60) * PW / PH), sh = sw * PH / PW;
      const sx = narrow ? (w - sw) / 2 : 4 * (tw + 10) + 30, sy = narrow ? th + 60 : 34;
      HG.label(ctx, "plates", 10, 12, { size: 12, bold: true, halo: false, col: C.ink2 });
      INKS.forEach(([n], k) => {
        const [x, y] = tpos(k);
        ctx.globalAlpha = k < printed || k === flying ? 0.35 : 1;
        ctx.drawImage(plates[k], x, y, tw, th); ctx.globalAlpha = 1;
        ctx.strokeStyle = C.line; ctx.strokeRect(x, y, tw, th);
        HG.label(ctx, n.split(" ")[0], x + tw / 2, y + th + 10, { size: 11, align: "center", halo: false, col: C.ink2 });
      });
      // the printed sheet: white paper, then each printed plate multiplied on top, shifted by its misregistration
      const m = mis * sw / PW;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(sx - 18, sy - 18, sw + 36, sh + 36);
      ctx.save(); ctx.beginPath(); ctx.rect(sx - 18, sy - 18, sw + 36, sh + 36); ctx.clip();
      ctx.globalCompositeOperation = "multiply";
      const regMark = (x, y, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke(); };
      const layer = (k, dx, dy) => {
        ctx.drawImage(plates[k], sx + dx, sy + dy, sw, sh);
        const col = `rgb(${INKS[k][1].join(",")})`;
        regMark(sx + sw / 2 + dx, sy - 10 + dy, col); regMark(sx + sw / 2 + dx, sy + sh + 10 + dy, col); regMark(sx - 10 + dx, sy + sh / 2 + dy, col); regMark(sx + sw + 10 + dx, sy + sh / 2 + dy, col);
      };
      for (let k = 0; k < printed; k++) layer(k, offs[k][0] * m, offs[k][1] * m);
      ctx.restore();
      if (flying >= 0) {
        const [x0, y0] = tpos(flying), e = fly;
        const x = lerp(x0, sx + offs[flying][0] * m, e), y = lerp(y0, sy + offs[flying][1] * m, e), ww = lerp(tw, sw, e), hh = lerp(th, sh, e);
        ctx.globalAlpha = 0.85; ctx.drawImage(plates[flying], x, y, ww, hh); ctx.globalAlpha = 1;
        ctx.strokeStyle = C.lode; ctx.lineWidth = 2; ctx.strokeRect(x, y, ww, hh);
      }
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(sx - 18, sy - 18, sw + 36, sh + 36);
      HG.label(ctx, printed === 0 ? "blank sheet" : `printed: ${INKS.slice(0, printed).map((x) => x[0][0]).join(" + ")}`, sx + sw / 2, sy + sh + 32, { size: 12, align: "center", bold: true });
    } });
    const row = E("div", { class: "btn-row" });
    const run = E("button", { class: "btn primary small", type: "button" }, "▶ Run the press");
    const step = E("button", { class: "btn small", type: "button" }, "Print next plate ▶");
    const reset = E("button", { class: "btn small", type: "button" }, "↺ Clean sheet");
    row.append(run, step, reset); box.append(row);
    const sl = E("div", { class: "sim-controls" }); box.append(sl);
    HG.slider(sl, { label: "Misregistration", min: 0, max: 6, step: 0.5, value: 0, unit: "px", fmt: (v) => HG.n(v, 1), oninput: (v) => { mis = v; sim.redraw(); say(); } });
    const note = E("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    function say() {
      const t = printed === 0 ? "Four plates, each a map of how much of one ink is needed, calculated from the poster's colours and shown here in that ink's colour. The sheet is blank." :
        printed < 4 ? `Printed so far: ${INKS.slice(0, printed).map((x) => x[0]).join(", ")}. Each ink adds to (multiplies with) those below it.` :
        mis === 0 ? "All four inks printed in register: the registration marks look like single black targets and the edges are crisp." :
        `Misregistered by ${HG.n(mis, 1)} px: each ink lands in a slightly different place, so coloured fringes appear on every edge and the registration marks split into four coloured targets. The press must be adjusted.`;
      note.textContent = t; cv.setAttribute("aria-label", "Four-colour printing. " + t);
    }
    function printOne(done) {
      if (printed >= 4) { if (done) done(); return; }
      flying = printed; fly = 0;
      if (stopF) stopF();
      stopF = tween(900, (e) => { fly = e; sim.redraw(); }, () => { flying = -1; printed++; sim.redraw(); say(); if (done) done(); });
    }
    step.addEventListener("click", () => { if (running) return; printOne(); });
    run.addEventListener("click", () => {
      if (running) return;
      if (printed >= 4) { printed = 0; }
      running = true; run.disabled = true;
      const go = () => { if (printed < 4) printOne(() => setTimeout(go, HG.reduced ? 0 : 200)); else { running = false; run.disabled = false; } };
      go();
    });
    reset.addEventListener("click", () => { if (stopF) stopF(); running = false; run.disabled = false; flying = -1; printed = 0; sim.redraw(); say(); });
    say();
  });

  /* =====================================================================
     12. Proof builder: bleed, crop marks, guillotine
     ===================================================================== */
  mount("w-proof", (box) => {
    const st = { bleed: false, crop: true, reg: true, drift: 4 };
    const W = 148, H = 210, B = 3; // an A5 poster, 3 mm bleed
    const tg = E("div", { class: "btn-row" });
    const tog = (label, key) => { const b = E("button", { class: "seg-btn", type: "button", "aria-pressed": String(st[key]) }, label); b.addEventListener("click", () => { st[key] = !st[key]; b.setAttribute("aria-pressed", String(st[key])); cut = null; draw(); }); tg.append(b); };
    tog("Bleed (3 mm)", "bleed"); tog("Crop marks", "crop"); tog("Registration marks", "reg");
    box.append(tg);
    const sl = E("div", { class: "sim-controls" }); box.append(sl);
    HG.slider(sl, { label: "Guillotine drift", min: -6, max: 6, step: 0.5, value: st.drift, unit: "mm", fmt: (v) => (v > 0 ? "+" : "") + HG.n(v, 1), oninput: (v) => { st.drift = v; cut = null; draw(); } });
    const trim = E("button", { class: "btn primary small", type: "button" }, "✂ Trim the stack");
    box.append(E("div", { class: "btn-row" }, trim));
    const grid = E("div", { class: "dp-proof-grid" });
    const sheet = S("svg", { viewBox: `-24 -24 ${W + 48} ${H + 48}`, class: "dp-proof-sheet", role: "img" });
    const res = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "dp-proof-res", role: "img" });
    grid.append(E("figure", null, sheet, E("figcaption", null, "the printed sheet")), E("figure", null, res, E("figcaption", null, "after trimming")));
    const note = E("p", { class: "sim-note", "aria-live": "polite" });
    box.append(grid, note);
    let cut = null, blade = null, stopB = null;
    function art(g, ox, oy) {
      // the poster artwork; with bleed the background runs 3 mm past the trim on every side
      const e = st.bleed ? B : 0;
      g.append(S("rect", { x: ox - e, y: oy - e, width: W + 2 * e, height: H + 2 * e, fill: P.blue }));
      g.append(S("rect", { x: ox - e, y: oy - e, width: W + 2 * e, height: 40 + e, fill: P.navy }));
      g.append(S("text", { x: ox + W / 2, y: oy + 27, "font-size": 15, "font-weight": 700, fill: "#fff", "text-anchor": "middle", text: "REGATTA DAY" }));
      g.append(S("path", { d: `M${ox - e} ${oy + 150} Q${ox + W / 2} ${oy + 140} ${ox + W + e} ${oy + 152} V${oy + H + e} H${ox - e} Z`, fill: "#1d5d8f" }));
      ship(g, ox + 44, oy + 92, 1);
      g.append(S("rect", { x: ox + 14, y: oy + 172, width: 90, height: 20, fill: P.yellow }));
      g.append(S("text", { x: ox + 59, y: oy + 186, "font-size": 10, "font-weight": 700, fill: P.navy, "text-anchor": "middle", text: "SAT 6 JUNE" }));
    }
    function draw() {
      const C = HG.colors();
      sheet.innerHTML = ""; res.innerHTML = "";
      sheet.append(S("rect", { x: -24, y: -24, width: W + 48, height: H + 48, fill: "#ffffff", stroke: C.line }));
      art(sheet, 0, 0);
      if (st.crop) {
        const g = S("g", { stroke: "#16141a", "stroke-width": 0.5 });
        [[0, 0], [W, 0], [0, H], [W, H]].forEach(([x, y]) => {
          const sx = x ? 1 : -1, sy = y ? 1 : -1;
          g.append(S("path", { d: `M${x} ${y + sy * 5} V${y + sy * 16} M${x + sx * 5} ${y} H${x + sx * 16}` }));
        });
        sheet.append(g);
      }
      if (st.reg) {
        const g = S("g", { stroke: "#16141a", "stroke-width": 0.5, fill: "none" });
        [[W / 2, -14], [W / 2, H + 14], [-14, H / 2], [W + 14, H / 2]].forEach(([x, y]) => { g.append(S("circle", { cx: x, cy: y, r: 4 })); g.append(S("path", { d: `M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}` })); });
        sheet.append(g);
      }
      sheet.append(S("rect", { x: 0, y: 0, width: W, height: H, fill: "none", stroke: "#d4147a", "stroke-width": 0.6, "stroke-dasharray": "3 2" }));
      if (blade != null) sheet.append(S("path", { d: `M${-24} ${blade} H${W + 24}`, stroke: "#c8102e", "stroke-width": 1.4 }));
      if (cut) {
        const d = cut.d;
        sheet.append(S("rect", { x: d, y: d, width: W, height: H, fill: "none", stroke: "#c8102e", "stroke-width": 1 }));
        const g = S("g", { transform: `translate(${-d} ${-d})` });
        g.append(S("rect", { x: d, y: d, width: W, height: H, fill: "#ffffff" }));
        art(g, 0, 0);
        const clip = S("clipPath", { id: "dp-proof-clip" }); clip.append(S("rect", { width: W, height: H }));
        const defs = S("defs"); defs.append(clip); res.append(defs);
        const wrap = S("g", { "clip-path": "url(#dp-proof-clip)" }); wrap.append(S("rect", { width: W, height: H, fill: "#ffffff" }), g); res.append(wrap);
        res.append(S("rect", { width: W, height: H, fill: "none", stroke: C.line }));
        const sliver = st.bleed ? Math.max(0, Math.abs(d) - B) : Math.abs(d);
        if (sliver > 0) {
          // mark the unprinted sliver in magenta so it can be seen at this size
          const e = st.bleed ? B : 0, hs = { fill: "#d4147a", "fill-opacity": 0.55 };
          if (d > 0) { res.append(S("rect", { x: W + e - d, y: 0, width: d - e, height: H, ...hs }), S("rect", { x: 0, y: H + e - d, width: W, height: d - e, ...hs })); }
          else { res.append(S("rect", { x: 0, y: 0, width: -d - e, height: H, ...hs }), S("rect", { x: 0, y: 0, width: W, height: -d - e, ...hs })); }
          res.append(S("text", { x: W / 2, y: H / 2, "font-size": 11, "font-weight": 700, fill: "#fff", stroke: "#d4147a", "stroke-width": 3, "paint-order": "stroke", "text-anchor": "middle", text: `white sliver ${HG.n(sliver, 1)} mm (magenta)` }));
        }
        const side = d > 0 ? "right and bottom" : "left and top";
        const msg = sliver > 0 ? `Trimmed ${HG.n(Math.abs(d), 1)} mm off line with ${st.bleed ? "only 3 mm of" : "no"} bleed: a white sliver ${HG.n(sliver, 1)} mm wide shows along the ${side} edges. Every poster in the stack is spoiled.` :
          d === 0 ? "A perfect cut. (In real trimming you cannot rely on this.)" : `Trimmed ${HG.n(Math.abs(d), 1)} mm off line, but the colour runs ${B} mm past the trim, so the cut still lands on printed colour: no white edge.`;
        note.textContent = msg; res.setAttribute("aria-label", "Trimmed poster. " + msg);
      } else {
        res.append(S("rect", { width: W, height: H, fill: C.paper2 }), S("text", { x: W / 2, y: H / 2, "font-size": 12, fill: C.ink2, "text-anchor": "middle", text: "not trimmed yet" }));
        note.textContent = !st.crop ? "No crop marks: once the sheet is printed, the guillotine operator has nothing to line the blade up on. Add crop marks before trimming." :
          `Proof ready${st.bleed ? " with 3 mm bleed" : " without bleed: the blue stops exactly at the trim line"}. ${st.reg ? "Registration marks sit outside the page on every plate. " : ""}Press Trim to cut.`;
        res.setAttribute("aria-label", "Not trimmed yet.");
      }
      trim.disabled = !st.crop;
      sheet.setAttribute("aria-label", `Proof sheet: A5 poster ${st.bleed ? "with" : "without"} 3 mm bleed${st.crop ? ", crop marks in the corners" : ""}${st.reg ? ", registration marks on each side" : ""}. The dashed line is the trim line.`);
    }
    trim.addEventListener("click", () => {
      if (!st.crop) return;
      if (stopB) stopB();
      cut = null;
      stopB = tween(800, (t) => { blade = lerp(-24, H + 24, t); draw(); }, () => { blade = null; cut = { d: st.drift }; draw(); });
    });
    document.addEventListener("hm-theme", draw);
    draw();
  });

})();
