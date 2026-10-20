/* Standards & views — the widgets in HMS Vellum's Plan Room.
   Every drawing here is computed from one rule set: views come from the same block model by the
   same edge rule, sections from the same solid, limits from the same tolerances, so a widget
   cannot disagree with the text beside it. */
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
  let uid = 0;
  const nextId = (p) => `${p}${++uid}`;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const f2 = (v) => (Math.abs(v) < 5e-10 ? 0 : v).toFixed(2);
  const sgn2 = (v) => (v > 1e-9 ? "+" : v < -1e-9 ? "−" : "") + Math.abs(v).toFixed(2);

  /* ---------- small SVG helpers ---------- */
  const svgBox = (vb, label, cls) => S("svg", { viewBox: vb, role: "img", "aria-label": label, class: "st-svg" + (cls ? " " + cls : "") });
  const L = (g, x1, y1, x2, y2, cls) => { const e = S("line", { x1, y1, x2, y2, class: cls }); g.append(e); return e; };
  const P = (g, d, cls) => { const e = S("path", { d, class: cls }); g.append(e); return e; };
  const C = (g, cx, cy, r, cls) => { const e = S("circle", { cx, cy, r, class: cls }); g.append(e); return e; };
  const R = (g, x, y, w, h, cls) => { const e = S("rect", { x, y, width: w, height: h, class: cls }); g.append(e); return e; };
  const T = (g, x, y, t, size = 16, anchor = "middle", cls = "ink") => { const e = S("text", { x, y, "font-size": size, "text-anchor": anchor, class: cls, text: t }); g.append(e); return e; };
  function AH(g, x, y, ang, size = 10, cls = "st-ah") { // filled arrowhead, tip at (x, y), pointing along ang
    const bx = x - size * Math.cos(ang), by = y - size * Math.sin(ang), w = size * 0.32;
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    const e = S("polygon", { points: `${x},${y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`, class: cls });
    g.append(e); return e;
  }
  /* a hatch pattern (thin lines, evenly spaced) in its own <defs> */
  function hatchDefs(svg, list) {
    const defs = S("defs");
    const ids = list.map(([ang, gap]) => {
      const id = nextId("st-hatch");
      const pat = S("pattern", { id, patternUnits: "userSpaceOnUse", width: gap, height: gap, patternTransform: `rotate(${ang})` });
      pat.append(S("line", { x1: 0, y1: 0, x2: 0, y2: gap, class: "st-hatchline" }));
      defs.append(pat);
      return id;
    });
    svg.prepend(defs);
    return ids;
  }
  const controls = (box) => { const d = E("div", { class: "sim-controls" }); box.append(d); return d; };
  const note = (box) => { const d = E("p", { class: "sim-note", "aria-live": "polite" }); box.append(d); return d; };

  /* =====================================================================
     Block (voxel) models and their orthographic views
     ===================================================================== */
  function voxModel(boxes, minus, colourOf) {
    const set = new Set();
    let nx = 0, ny = 0, nz = 0;
    const each = (b, f) => { for (let x = b[0]; x <= b[1]; x++) for (let y = b[2]; y <= b[3]; y++) for (let z = b[4]; z <= b[5]; z++) f(x, y, z); };
    boxes.forEach((b) => each(b, (x, y, z) => { set.add(x + "," + y + "," + z); nx = Math.max(nx, x + 1); ny = Math.max(ny, y + 1); nz = Math.max(nz, z + 1); }));
    (minus || []).forEach((b) => each(b, (x, y, z) => set.delete(x + "," + y + "," + z)));
    return { set, nx, ny, nz, has: (x, y, z) => set.has(x + "," + y + "," + z), colourOf: colourOf || (() => "wood") };
  }
  /* a view: screen u rightwards, v upwards, k = depth (0 nearest the viewer) */
  function viewDef(M, kind) {
    const { nx, ny, nz } = M;
    switch (kind) {
      case "front": return { U: nx, V: nz, K: ny, at: (u, v, k) => M.has(u, k, v) };
      case "back": return { U: nx, V: nz, K: ny, at: (u, v, k) => M.has(nx - 1 - u, ny - 1 - k, v) };
      case "top": return { U: nx, V: ny, K: nz, at: (u, v, k) => M.has(u, v, nz - 1 - k) };
      case "left": return { U: ny, V: nz, K: nx, at: (u, v, k) => M.has(k, ny - 1 - u, v) };
      case "right": return { U: ny, V: nz, K: nx, at: (u, v, k) => M.has(nx - 1 - k, u, v) };
    }
    return null;
  }
  /* The edge rule: between two neighbouring cells of the view there is an edge at depth k wherever
     one cell is solid at that depth and the other is not. It is visible if nothing lies in front of
     depth k in either cell; otherwise it is hidden detail. */
  function viewEdges(vd) {
    const { U, V, K, at } = vd;
    const occ = (u, v, k) => u >= 0 && v >= 0 && u < U && v < V && at(u, v, k);
    const seg = (a, b) => {
      let res = 0;
      for (let k = 0; k < K; k++) {
        if (occ(a[0], a[1], k) !== occ(b[0], b[1], k)) {
          let clear = true;
          for (let j = 0; j < k && clear; j++) if (occ(a[0], a[1], j) || occ(b[0], b[1], j)) clear = false;
          if (clear) return 2;
          res = 1;
        }
      }
      return res;
    };
    const vis = [], hid = [];
    for (let u = 0; u <= U; u++) for (let v = 0; v < V; v++) { const t = seg([u - 1, v], [u, v]); if (t) (t === 2 ? vis : hid).push([u, v, u, v + 1]); }
    for (let v = 0; v <= V; v++) for (let u = 0; u < U; u++) { const t = seg([u, v - 1], [u, v]); if (t) (t === 2 ? vis : hid).push([u, v, u + 1, v]); }
    return { vis: merge(vis), hid: merge(hid), U, V };
  }
  function merge(segs) {
    const groups = new Map();
    segs.forEach((s) => { const k = s[0] === s[2] ? "v" + s[0] : "h" + s[1]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    const out = [];
    groups.forEach((list, k) => {
      const vert = k[0] === "v";
      list.sort((a, b) => (vert ? a[1] - b[1] : a[0] - b[0]));
      let cur = null;
      list.forEach((s) => {
        if (cur && (vert ? cur[3] === s[1] : cur[2] === s[0])) { cur[2] = s[2]; cur[3] = s[3]; }
        else { if (cur) out.push(cur); cur = s.slice(); }
      });
      if (cur) out.push(cur);
    });
    return out;
  }
  const edgeKey = (ed) => JSON.stringify([ed.vis.map((s) => s.join(",")).sort(), ed.hid.map((s) => s.join(",")).sort()]);
  /* exposed faces of a block model, for pictorial drawing */
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function voxFaces(M) {
    const out = [];
    M.set.forEach((key) => {
      const [x, y, z] = key.split(",").map(Number);
      DIRS.forEach((n) => {
        if (M.has(x + n[0], y + n[1], z + n[2])) return;
        const c = [x + 0.5 + n[0] / 2, y + 0.5 + n[1] / 2, z + 0.5 + n[2] / 2];
        const t1 = n[0] ? [0, 1, 0] : [1, 0, 0], t2 = n[2] ? [0, 1, 0] : [0, 0, 1];
        const a = n[0] ? [0, 0.5, 0] : [0.5, 0, 0], b = n[2] ? [0, 0.5, 0] : [0, 0, 0.5];
        void t1; void t2;
        const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [c[0] + i * a[0] + j * b[0], c[1] + i * a[1] + j * b[1], c[2] + i * a[2] + j * b[2]]);
        out.push({ pts, n, c, col: M.colourOf(x, y, z) });
      });
    });
    return out;
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function camera(a, b) {
    const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b);
    return { r: [ca, -sa, 0], u: [sa * sb, ca * sb, cb], d: [sa * cb, ca * cb, -sb] };
  }
  const proj = (p, cam) => [dot(p, cam.r), -dot(p, cam.u), dot(p, cam.d)];
  const SHADE = (n) => (n[2] > 0 ? 1 : n[2] < 0 ? 0.5 : n[1] < 0 ? 0.84 : n[0] < 0 ? 0.68 : n[0] > 0 ? 0.62 : 0.72);
  const BASE = { iron: [96, 102, 112], wood: [168, 118, 70], stone: [150, 150, 140] };
  const rgb = (col, k) => { const c = BASE[col] || BASE.wood; return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`; };

  /* the Plan Room's block-built ship's cannon: barrel (with its bore), trunnions, carriage */
  function cannon() {
    return voxModel([
      [0, 10, 1, 3, 3, 5], [11, 11, 2, 2, 4, 4],
      [7, 7, 0, 0, 4, 4], [7, 7, 4, 4, 4, 4],
      [5, 8, 0, 0, 1, 3], [9, 10, 0, 0, 1, 2], [5, 8, 4, 4, 1, 3], [9, 10, 4, 4, 1, 2],
      [5, 10, 1, 3, 1, 1], [8, 10, 1, 3, 2, 2],
      [5, 5, 0, 4, 0, 0], [10, 10, 0, 4, 0, 0],
    ], [[0, 8, 2, 2, 4, 4]], (x, y, z) => (z >= 3 && ((y >= 1 && y <= 3) || z === 4) ? "iron" : "wood"));
  }

  /* =====================================================================
     1. Line types: name the line, then spot the line drawn to the wrong standard
     ===================================================================== */
  mount("w-linetype", (box) => {
    const TYPES = [
      ["outline", "Outline"], ["projection", "Projection line"], ["hidden", "Hidden detail"], ["centre", "Centre line"],
      ["cutting", "Cutting plane"], ["fold", "Fold line"], ["dimension", "Dimension line"], ["hatching", "Hatching"],
      ["knurling", "Knurling"], ["spring", "Spring (conventional)"],
    ];
    const WHY = {
      outline: "Continuous thick: the visible edges and outline of the object.",
      projection: "Continuous thin, running between views to carry a size from one view to the next.",
      hidden: "Dashed thin: an edge you cannot see from this direction (here, the drilled hole inside the block).",
      centre: "Thin long dash, dot chain: the centre of symmetry, through the middle of a hole or a round part.",
      cutting: "Long dash dotted thin line, thick at the ends, with arrows showing which way you look at the section.",
      fold: "Thin long dash, double dot chain: where a development (net) is folded.",
      dimension: "Thin continuous line with arrowheads touching the extension lines; the size sits above it.",
      hatching: "Thin lines at 45°, evenly spaced, on the surfaces the cutting plane has cut.",
      knurling: "The conventional sign for a knurled (gripping) surface: crossing lines are diamond knurling, parallel lines straight knurling.",
      spring: "The conventional (simplified) form of a helical spring: a zig-zag of thick lines on a centre line.",
    };
    const ITEMS = [["A", "outline"], ["B", "hidden"], ["C", "centre"], ["D", "projection"], ["E", "cutting"], ["F", "fold"], ["G", "knurling"], ["H", "spring"], ["I", "dimension"], ["J", "hatching"]];
    let mode = "name";
    HG.choice(box, "Mode:", [["name", "Name the line"], ["spot", "Spot the mistake"]], mode, (v) => { mode = v; nameBox.hidden = v !== "name"; spotBox.hidden = v !== "spot"; });
    const nameBox = E("div"), spotBox = E("div", { hidden: true });
    box.append(nameBox, spotBox);

    /* ---- the drawing sheet ---- */
    const svg = svgBox("0 0 560 560", "A drawing sheet with four panels and lines labelled A to J: a block in plan and elevation, a bush with section A–A, a development, and a knurled knob beside a spring.");
    const [hb] = hatchDefs(svg, [[45, 8]]);
    const g = {};
    ITEMS.forEach(([k]) => { g[k] = S("g", { "data-k": k }); });
    const base = S("g");
    svg.append(base);
    [[4, 4, 272, 282], [284, 4, 272, 282], [4, 294, 272, 262], [284, 294, 272, 262]].forEach(([x, y, w, h]) => R(base, x, y, w, h, "st-frame"));
    T(base, 14, 28, "1 · Block", 19, "start", "muted");
    T(base, 294, 28, "2 · Bush, section A–A", 19, "start", "muted");
    T(base, 14, 318, "3 · Net", 19, "start", "muted");
    T(base, 294, 318, "4 · Knob and spring", 19, "start", "muted");
    // panel 1: plan above elevation (third angle)
    R(g.A, 60, 48, 160, 60, "st-k st-nofill"); C(g.A, 140, 78, 18, "st-k st-nofill");
    R(g.A, 60, 160, 160, 76, "st-k st-nofill");
    L(g.B, 122, 160, 122, 236, "st-h"); L(g.B, 158, 160, 158, 236, "st-h");
    L(g.C, 140, 150, 140, 246, "st-c"); L(g.C, 114, 78, 166, 78, "st-c"); L(g.C, 140, 54, 140, 102, "st-c");
    [60, 122, 158, 220].forEach((x) => L(g.D, x, 113, x, 155, "st-n"));
    L(g.I, 60, 240, 60, 268, "st-n"); L(g.I, 220, 240, 220, 268, "st-n"); L(g.I, 60, 262, 220, 262, "st-n");
    AH(g.I, 60, 262, Math.PI); AH(g.I, 220, 262, 0); T(g.I, 140, 256, "160", 16);
    // panel 2: bush plan with cutting plane, and section A-A
    C(base, 420, 92, 52, "st-k st-nofill"); C(base, 420, 92, 30, "st-k st-nofill"); C(base, 420, 92, 13, "st-k st-nofill");
    L(base, 420, 34, 420, 150, "st-c");
    L(g.E, 352, 92, 488, 92, "st-c"); L(g.E, 352, 92, 366, 92, "st-k st-thicker"); L(g.E, 474, 92, 488, 92, "st-k st-thicker");
    L(g.E, 356, 92, 356, 74, "st-n"); AH(g.E, 356, 68, -Math.PI / 2); L(g.E, 484, 92, 484, 74, "st-n"); AH(g.E, 484, 68, -Math.PI / 2);
    T(g.E, 356, 60, "A", 15); T(g.E, 484, 60, "A", 15);
    const cutPath = "M368 238 H407 V256 H368 Z M390 172 H407 V238 H390 Z M433 238 H472 V256 H433 Z M433 172 H450 V238 H433 Z";
    P(g.J, cutPath, "st-nostroke").setAttribute("fill", `url(#${hb})`);
    P(base, "M368 256 V238 H390 V172 H450 V238 H472 V256 Z", "st-k st-nofill");
    L(base, 407, 172, 407, 256, "st-k"); L(base, 433, 172, 433, 256, "st-k");
    L(base, 420, 164, 420, 264, "st-c");
    T(base, 420, 280, "SECTION A–A", 15);
    // panel 3: a development with fold lines
    P(base, "M110 340 H170 V380 H210 V440 H170 V480 H110 V440 H70 V380 H110 Z", "st-k st-nofill");
    L(g.F, 110, 380, 170, 380, "st-f"); L(g.F, 110, 440, 170, 440, "st-f"); L(g.F, 110, 380, 110, 440, "st-f"); L(g.F, 170, 380, 170, 440, "st-f");
    // panel 4: knurled knob and conventional spring
    P(base, "M334 386 H306 C298 396 312 406 304 416 C298 422 302 426 306 426 H334", "st-k st-nofill");
    P(base, "M334 355 L339 350 H379 L384 355 V457 L379 462 H339 L334 457 Z", "st-k st-nofill");
    const clipId = nextId("st-clip");
    const cp = S("clipPath", { id: clipId }); cp.append(S("rect", { x: 339, y: 355, width: 40, height: 102 })); svg.querySelector("defs").append(cp);
    const kn = S("g", { "clip-path": `url(#${clipId})` });
    for (let i = -6; i < 10; i++) { L(kn, 339 + i * 14, 355, 339 + i * 14 + 102, 457, "st-n"); L(kn, 339 + i * 14, 457, 339 + i * 14 + 102, 355, "st-n"); }
    g.G.append(kn);
    L(base, 490, 330, 490, 520, "st-c");
    let zz = "M455 345 H525"; for (let i = 1; i <= 8; i++) zz += ` L${i % 2 ? 455 : 525} ${345 + i * 20}`; zz += " H455";
    P(g.H, zz, "st-k st-nofill");
    ITEMS.forEach(([k]) => svg.append(g[k]));
    // labels with leaders
    const LAB = { A: [28, 198, 58, 198], B: [252, 212, 160, 212], C: [252, 128, 143, 149], D: [28, 134, 58, 134], E: [532, 52, 484, 90], F: [240, 350, 160, 381], G: [360, 520, 362, 440], H: [430, 535, 468, 505], I: [252, 262, 196, 262], J: [532, 205, 462, 246] };
    const labs = {};
    Object.entries(LAB).forEach(([k, [lx, ly, tx, ty]]) => {
      const lg = S("g", { class: "st-labg" });
      const a = Math.atan2(ty - ly, tx - lx), sx = lx + 13 * Math.cos(a), sy = ly + 13 * Math.sin(a);
      L(lg, sx, sy, tx, ty, "st-leader"); C(lg, tx, ty, 2.6, "st-leaddot");
      C(lg, lx, ly, 13, "st-lab"); T(lg, lx, ly + 6, k, 17, "middle", "st-labt");
      lg.addEventListener("click", () => pick(k));
      labs[k] = lg; svg.append(lg);
    });
    nameBox.append(svg);
    const pickRow = E("div", { class: "btn-row st-letters", role: "group", "aria-label": "Choose a labelled line" });
    const letterBtns = {};
    ITEMS.forEach(([k]) => { const b = E("button", { class: "btn small", type: "button" }, k); b.addEventListener("click", () => pick(k)); letterBtns[k] = b; pickRow.append(b); });
    nameBox.append(pickRow);
    const q = E("p", { class: "st-q", "aria-live": "polite" });
    const opts = E("div", { class: "st-opts", role: "group", "aria-label": "Line types" });
    const fb = E("p", { class: "sim-note", "aria-live": "polite" });
    const score = E("p", { class: "readout" });
    nameBox.append(q, opts, fb, score);
    const done = {};
    let cur = "A";
    TYPES.forEach(([t, name]) => {
      const b = E("button", { class: "seg-btn", type: "button" }, name);
      b.addEventListener("click", () => answer(t));
      opts.append(b);
    });
    function pick(k) {
      cur = k;
      ITEMS.forEach(([j]) => { g[j].classList.toggle("st-on", j === k); labs[j].classList.toggle("st-on", j === k); letterBtns[j].setAttribute("aria-pressed", j === k ? "true" : "false"); });
      q.innerHTML = `Line <b>${k}</b> is highlighted in magenta. What type of line is it?`;
      fb.textContent = done[k] ? (done[k].ok ? "Already named correctly. " : "Answered earlier. ") + WHY[ITEMS.find((x) => x[0] === k)[1]] : "";
    }
    function answer(t) {
      const right = ITEMS.find((x) => x[0] === cur)[1];
      const ok = t === right;
      if (!done[cur]) done[cur] = { ok };
      const nm = TYPES.find((x) => x[0] === right)[1];
      fb.innerHTML = (ok ? `<span class="ok">✔ Right: ${nm}.</span> ` : `<span class="bad">✘ Not quite: line ${cur} is the ${nm.toLowerCase()}.</span> `) + WHY[right];
      letterBtns[cur].classList.toggle("st-done", true);
      const n = Object.values(done).filter((d) => d.ok).length, m = Object.keys(done).length;
      score.textContent = `${n} of ${m} named right first time` + (m === ITEMS.length ? (n === m ? " — a perfect plan-room sheet." : " — click any letter to re-read its rule.") : ` · ${ITEMS.length - m} still to name`);
      if (ok) { const nx = ITEMS.find(([k]) => !done[k]); if (nx) setTimeout(() => { if (cur !== nx[0] && !done[nx[0]]) pick(nx[0]); }, 900); }
    }
    pick("A");

    /* ---- spot the mistake ---- */
    const SPOT = [
      { claim: "Outline", draw: (gg, bad) => L(gg, 20, 35, 280, 35, bad ? "st-n" : "st-k"), right: "An outline is a continuous <b>thick</b> line.", wrong: "This line is thin. An outline must be continuous <b>thick</b>; thin continuous is a projection or dimension line." },
      { claim: "Hidden detail", draw: (gg, bad) => L(gg, 20, 35, 280, 35, bad ? "st-k st-h" : "st-h"), right: "Hidden detail is a <b>thin</b> dashed line.", wrong: "These dashes are thick. Hidden detail is <b>thin</b>, so it never competes with the visible outline." },
      { claim: "Centre line", draw: (gg, bad) => L(gg, 20, 35, 280, 35, bad ? "st-h" : "st-c"), right: "Long dash, dot, chain, thin: a centre line.", wrong: "Equal short dashes are hidden detail. A centre line is a thin chain: <b>long dash, dot</b>." },
      { claim: "Cutting plane", draw: (gg, bad) => { L(gg, 30, 40, 270, 40, "st-c"); if (!bad) { L(gg, 30, 40, 48, 40, "st-k st-thicker"); L(gg, 252, 40, 270, 40, "st-k st-thicker"); } L(gg, 34, 40, 34, 22, "st-n"); AH(gg, 34, 14, -Math.PI / 2); L(gg, 266, 40, 266, 22, "st-n"); AH(gg, 266, 14, -Math.PI / 2); T(gg, 50, 22, "A", 14); T(gg, 250, 22, "A", 14); }, right: "Thin long dash, dot chain, <b>thick at the ends</b>, arrows showing the viewing direction, letters naming the section.", wrong: "The ends are not thick. A cutting plane is a thin chain line made <b>thick at the ends</b> so that it cannot be mistaken for a centre line." },
      { claim: "Fold line", draw: (gg, bad) => L(gg, 20, 35, 280, 35, bad ? "st-c" : "st-f"), right: "Long dash, <b>double dot</b>, thin: a fold line on a development.", wrong: "One dot between the dashes is a centre line. A fold line has a <b>double dot</b>." },
      { claim: "Projection line", draw: (gg, bad) => L(gg, 20, 35, 280, 35, bad ? "st-h" : "st-n"), right: "A projection line is continuous and thin.", wrong: "A dashed line means hidden detail. Projection lines are <b>continuous thin</b>." },
      { claim: "Extension line", draw: (gg, bad) => { P(gg, "M60 62 V44 H240 V62", "st-k st-nofill"); const y0 = bad ? 44 : 39; L(gg, 60, y0, 60, 6, "st-n"); L(gg, 240, y0, 240, 6, "st-n"); L(gg, 60, 12, 240, 12, "st-n"); AH(gg, 60, 12, Math.PI); AH(gg, 240, 12, 0); }, right: "There is a small <b>gap</b> between the object and each extension line, and the extension line runs a little past the dimension line.", wrong: "The extension lines touch the outline. Leave a small <b>gap</b> between the feature and the extension line (Appendix 2 labels it)." },
      { claim: "Hatching", draw: (gg, bad) => { R(gg, 40, 10, 220, 50, "st-k st-nofill"); const xs = bad ? [0, 9, 14, 30, 36, 60, 71, 95, 104, 130, 141, 168, 176, 200, 215, 236, 250] : Array.from({ length: 18 }, (_, i) => i * 15); xs.forEach((x) => { const x0 = 40 + x - 50, x1 = x0 + 50; const a = clamp((40 - x0) / 50), b = clamp((x1 - 260) / 50); if (a >= 1 || b >= 1) return; L(gg, x0 + 50 * a, 60 - 50 * a, x1 - 50 * b, 10 + 50 * b, "st-n"); }); }, right: "Thin lines, at 45°, evenly spaced.", wrong: "The spacing is uneven. Hatching is thin lines at 45°, <b>evenly spaced</b>." },
    ];
    const card = E("div", { class: "st-spot" });
    const sv = svgBox("0 0 300 72", "A sample line");
    const claimP = E("p", { class: "st-q" });
    const sfb = E("p", { class: "sim-note", "aria-live": "polite" });
    const srow = E("div", { class: "btn-row" });
    const yes = E("button", { class: "btn small primary", type: "button" }, "✔ Drawn to standard");
    const no = E("button", { class: "btn small danger", type: "button" }, "✘ Not to standard");
    const nextB = E("button", { class: "btn small", type: "button" }, "Next line ▶");
    const sscore = E("p", { class: "readout" });
    srow.append(yes, no, nextB);
    card.append(claimP, sv, srow, sfb, sscore);
    spotBox.append(card);
    let order = [], si = 0, bad = false, answered = false, sr = 0, sn = 0;
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function showSpot() {
      if (!order.length || si >= order.length) { order = shuffle(SPOT.map((_, i) => i)); si = 0; }
      const it = SPOT[order[si]];
      bad = Math.random() < 0.5; answered = false;
      sv.innerHTML = ""; const gg = S("g"); sv.append(gg); it.draw(gg, bad);
      sv.setAttribute("aria-label", `A sample drawn as a ${it.claim.toLowerCase()}. Decide whether it meets the standard.`);
      claimP.innerHTML = `The draughtsman says this is a <b>${it.claim.toLowerCase()}</b>. Is it drawn to the standard?`;
      sfb.textContent = "";
    }
    function judge(saysOk) {
      if (answered) return; answered = true;
      const it = SPOT[order[si]], ok = saysOk === !bad;
      sn++; if (ok) sr++;
      sfb.innerHTML = (ok ? "<span class='ok'>✔ Correct.</span> " : "<span class='bad'>✘ No.</span> ") + (bad ? it.wrong : it.right);
      sscore.textContent = `${sr} of ${sn} judged correctly`;
    }
    yes.addEventListener("click", () => judge(true));
    no.addEventListener("click", () => judge(false));
    nextB.addEventListener("click", () => { si++; showSpot(); });
    showSpot();
  });

  /* =====================================================================
     2. Chain, parallel and running dimensions, and how errors pile up
     ===================================================================== */
  mount("w-dimstyle", (box) => {
    const FEAT = [0, 30, 55, 80, 120];       // positions from the datum (left end), mm
    const HT = [40, 28, 48, 20];              // heights of the four steps, mm
    let style = "chain", tol = 0.2;
    const errs = [];
    HG.choice(box, "Dimensioning:", [["chain", "Chain"], ["parallel", "Parallel"], ["running", "Running"]], style, (v) => { style = v; errs.length = 0; draw(); });
    const ctl = controls(box);
    HG.slider(ctl, { label: "Tolerance on every dimension (±)", min: 0.05, max: 0.5, step: 0.05, value: tol, unit: "mm", fmt: (v) => v.toFixed(2), oninput: (v) => { tol = v; errs.length = 0; draw(); } });
    const svg = svgBox("0 0 560 330", "");
    box.append(svg);
    const row = E("div", { class: "btn-row" });
    const one = E("button", { class: "btn small primary", type: "button" }, "Make one part");
    const fifty = E("button", { class: "btn small", type: "button" }, "Make 50 parts");
    const clr = E("button", { class: "btn small", type: "button" }, "↺ Clear");
    row.append(one, fifty, clr);
    box.append(row);
    const out = note(box);
    const k = 4, x0 = 40, yb = 300, hk = 2;
    const X = (mm) => x0 + mm * k;
    function make(n) {
      for (let i = 0; i < n; i++) {
        const rnd = () => (Math.random() * 2 - 1) * tol;
        let last;
        if (style === "chain") { let pos = 0; for (let j = 1; j < FEAT.length; j++) pos += FEAT[j] - FEAT[j - 1] + rnd(); last = pos - FEAT[FEAT.length - 1]; }
        else last = rnd();
        errs.push(last);
      }
      if (errs.length > 400) errs.splice(0, errs.length - 400);
      draw();
    }
    one.addEventListener("click", () => make(1));
    fifty.addEventListener("click", () => make(50));
    clr.addEventListener("click", () => { errs.length = 0; draw(); });
    function draw() {
      svg.innerHTML = "";
      const g = S("g"); svg.append(g);
      // the stepped part
      let d = `M${X(0)} ${yb}`;
      HT.forEach((h, i) => { d += ` V${yb - h * hk} H${X(FEAT[i + 1])}`; });
      d += ` V${yb} Z`;
      P(g, d, "st-k st-nofill");
      const topAt = (i) => Math.max(i > 0 ? HT[i - 1] : 0, i < HT.length ? HT[i] : 0);
      const levels = style === "parallel" ? [168, 138, 108, 78] : [168];
      const extTop = style === "parallel" ? (i) => levels[i - 1] - 8 : () => 160;
      FEAT.forEach((f, i) => { const y0 = yb - topAt(i) * hk - 5; L(g, X(f), y0, X(f), i === 0 ? (style === "parallel" ? levels[3] - 8 : 160) : extTop(i), "st-n"); });
      if (style === "chain") {
        for (let i = 1; i < FEAT.length; i++) {
          L(g, X(FEAT[i - 1]), 168, X(FEAT[i]), 168, "st-n"); AH(g, X(FEAT[i - 1]), 168, Math.PI); AH(g, X(FEAT[i]), 168, 0);
          T(g, (X(FEAT[i - 1]) + X(FEAT[i])) / 2, 162, String(FEAT[i] - FEAT[i - 1]), 17);
        }
      } else if (style === "parallel") {
        for (let i = 1; i < FEAT.length; i++) {
          const y = levels[i - 1];
          L(g, X(0), y, X(FEAT[i]), y, "st-n"); AH(g, X(0), y, Math.PI); AH(g, X(FEAT[i]), y, 0);
          T(g, (X(0) + X(FEAT[i])) / 2, y - 6, String(FEAT[i]), 17);
        }
      } else {
        L(g, X(0), 168, X(FEAT[FEAT.length - 1]), 168, "st-n");
        for (let i = 1; i < FEAT.length; i++) { AH(g, X(FEAT[i]), 168, 0); T(g, X(FEAT[i]) - 4, 160, String(FEAT[i]), 17, "end"); }
      }
      T(g, X(0), yb + 22, "datum", 14, "middle", "muted");
      // worst case at each feature, drawn as a magnified band on the part
      const worst = FEAT.map((f, i) => (i === 0 ? 0 : style === "chain" ? i * tol : tol));
      const mag = 18;
      FEAT.forEach((f, i) => {
        if (!i) return;
        const w = worst[i] * mag;
        R(g, X(f) - w, yb - topAt(i) * hk + 4, 2 * w, topAt(i) * hk - 8, "st-band");
      });
      T(g, 520, 52, "worst-case spread", 13, "end", "muted"); T(g, 520, 68, `(×${mag} magnified)`, 13, "end", "muted");
      // a strip of the last edge's actual errors
      const sy = 30, sx0 = 60, sx1 = 330, lim = 4 * 0.5;
      L(g, sx0, sy, sx1, sy, "st-n");
      [-2, -1, 0, 1, 2].forEach((v) => { const x = sx0 + (v + lim) / (2 * lim) * (sx1 - sx0); L(g, x, sy - 4, x, sy + 4, "st-n"); T(g, x, sy + 18, (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v), 12, "middle", "muted"); });
      T(g, sx0 - 6, sy + 5, "error of last edge (mm)", 12, "end", "muted");
      errs.forEach((e) => { const x = sx0 + (e + lim) / (2 * lim) * (sx1 - sx0); C(g, x, sy, 3, "st-dot"); });
      svg.setAttribute("aria-label", `A stepped part with features at 30, 55, 80 and 120 millimetres from the datum, dimensioned in ${style} style, each dimension plus or minus ${tol.toFixed(2)} millimetres.`);
      const spread = errs.length ? `${errs.length} part${errs.length > 1 ? "s" : ""} made: the last edge ended between ${sgn2(Math.min(...errs))} and ${sgn2(Math.max(...errs))} mm of 120.` : "";
      out.innerHTML = (style === "chain"
        ? `<b>Chain:</b> each size is measured from the feature before it, so the errors add up. The last edge is four dimensions from the datum, so it could be anywhere within ±${(4 * tol).toFixed(2)} mm of 120 (4 × ${tol.toFixed(2)}). Chain dimensioning is clear for the distance from one feature to the next.`
        : style === "parallel"
          ? `<b>Parallel:</b> every size is measured from the one datum, so no error is passed on. Each edge is within ±${tol.toFixed(2)} mm. The cost is space: one dimension line per feature, smallest nearest the view.`
          : `<b>Running:</b> like parallel (every size from the datum, each edge within ±${tol.toFixed(2)} mm), but all on one line: the arrows point away from the origin and the sizes are written at each extension line. It saves space.`) + " " + spread;
    }
    draw();
  });

  /* =====================================================================
     3. Tolerance and fit: will the shaft go into the hole?
     ===================================================================== */
  mount("w-fit", (box) => {
    const NOM = 20;
    const st = { hu: 0.03, hl: 0, su: -0.02, sl: -0.05 };
    let pair = null;
    const presets = E("div", { class: "btn-row" });
    [["Running fit", { hu: 0.03, hl: 0, su: -0.02, sl: -0.05 }], ["Push (transition)", { hu: 0.03, hl: 0, su: 0.02, sl: 0 }], ["Press fit", { hu: 0.02, hl: 0, su: 0.07, sl: 0.04 }]].forEach(([n, v]) => {
      const b = E("button", { class: "btn small", type: "button" }, n);
      b.addEventListener("click", () => { Object.assign(st, v); pair = null; sl.forEach((s) => s.h.sync(st[s.k])); draw(); });
      presets.append(b);
    });
    box.append(presets);
    const ctl = controls(box);
    const sl = [
      ["hu", "Hole: upper deviation", -0.05, 0.1], ["hl", "Hole: lower deviation", -0.05, 0.1],
      ["su", "Shaft: upper deviation", -0.1, 0.1], ["sl", "Shaft: lower deviation", -0.1, 0.1],
    ].map(([k, label, min, max]) => ({ k, h: HG.slider(ctl, { label, min, max, step: 0.01, value: st[k], unit: "mm", fmt: (v) => sgn2(v) || "0.00", oninput: (v) => set(k, Math.round(v * 100) / 100) }) }));
    function set(k, v) {
      st[k] = v;
      // an upper limit can never be below the lower limit: push the partner along
      if (k === "hu" && st.hl > v) { st.hl = v; sl[1].h.sync(v); }
      if (k === "hl" && st.hu < v) { st.hu = v; sl[0].h.sync(v); }
      if (k === "su" && st.sl > v) { st.sl = v; sl[3].h.sync(v); }
      if (k === "sl" && st.su < v) { st.su = v; sl[2].h.sync(v); }
      pair = null; draw();
    }
    const svg = svgBox("0 0 560 330", "");
    box.append(svg);
    const row = E("div", { class: "btn-row" });
    const insp = E("button", { class: "btn small primary", type: "button" }, "Take one hole and one shaft from the bin");
    row.append(insp); box.append(row);
    insp.addEventListener("click", () => {
      const h = NOM + st.hl + Math.random() * (st.hu - st.hl), s = NOM + st.sl + Math.random() * (st.su - st.sl);
      pair = { h: Math.round(h * 1000) / 1000, s: Math.round(s * 1000) / 1000 };
      draw();
    });
    const tbl = E("div", { class: "table-wrap" });
    box.append(tbl);
    const out = note(box);
    function notation(u, l) {
      const sym = Math.abs(u + l) < 1e-9 && u > 0 ? `${NOM} ± ${u.toFixed(2)}` : "not possible (the deviations are not equal and opposite)";
      return { common: `<span class="st-stack"><span>${(NOM + u).toFixed(2)}</span><span>${(NOM + l).toFixed(2)}</span></span>`, asym: `${NOM} <span class="st-stack"><span>${sgn2(u) || "0"}</span><span>${sgn2(l) || "0"}</span></span>`, sym };
    }
    function draw() {
      const hMax = NOM + st.hu, hMin = NOM + st.hl, sMax = NOM + st.su, sMin = NOM + st.sl;
      const maxC = hMax - sMin, minC = hMin - sMax;
      const kind = minC >= -1e-9 ? "clearance" : maxC <= 1e-9 ? "interference" : "transition";
      svg.innerHTML = "";
      const g = S("g"); svg.append(g);
      const y0 = 150, kk = 1100, Y = (dev) => y0 - dev * kk;
      L(g, 40, y0, 520, y0, "st-k");
      T(g, 44, y0 - 8, `zero line: nominal size Ø${NOM}.00`, 14, "start", "muted");
      R(g, 140, Math.min(Y(st.hu), Y(st.hl)), 120, Math.max(3, Math.abs(Y(st.hl) - Y(st.hu))), "st-hole");
      R(g, 300, Math.min(Y(st.su), Y(st.sl)), 120, Math.max(3, Math.abs(Y(st.sl) - Y(st.su))), "st-shaft");
      T(g, 200, 318, "HOLE tolerance zone", 15, "middle", "st-sea"); T(g, 360, 318, "SHAFT tolerance zone", 15, "middle", "st-red");
      T(g, 136, Y(st.hu) + 5, hMax.toFixed(2), 14, "end"); T(g, 136, Y(st.hl) + 5, hMin.toFixed(2), 14, "end");
      T(g, 424, Y(st.su) + 5, sMax.toFixed(2), 14, "start"); T(g, 424, Y(st.sl) + 5, sMin.toFixed(2), 14, "start");
      [0.1, 0.05, -0.05, -0.1].forEach((v) => { L(g, 30, Y(v), 40, Y(v), "st-n"); T(g, 28, Y(v) + 4, sgn2(v), 11, "end", "muted"); });
      if (pair) {
        L(g, 140, Y(pair.h - NOM), 260, Y(pair.h - NOM), "st-k st-sea-s"); L(g, 300, Y(pair.s - NOM), 420, Y(pair.s - NOM), "st-k st-red-s");
      }
      svg.setAttribute("aria-label", `Tolerance zones magnified: hole from ${hMin.toFixed(2)} to ${hMax.toFixed(2)} mm, shaft from ${sMin.toFixed(2)} to ${sMax.toFixed(2)} mm. A ${kind} fit.`);
      const hn = notation(st.hu, st.hl), sn = notation(st.su, st.sl);
      tbl.innerHTML = `<table class="st-fit-table"><thead><tr><th></th><th>Hole</th><th>Shaft</th></tr></thead><tbody>
<tr><td>Maximum size (upper limit)</td><td class="num">${hMax.toFixed(2)}</td><td class="num">${sMax.toFixed(2)}</td></tr>
<tr><td>Minimum size (lower limit)</td><td class="num">${hMin.toFixed(2)}</td><td class="num">${sMin.toFixed(2)}</td></tr>
<tr><td>Tolerance (max − min)</td><td class="num">${(st.hu - st.hl).toFixed(2)}</td><td class="num">${(st.su - st.sl).toFixed(2)}</td></tr>
<tr><td>Common method</td><td>${hn.common}</td><td>${sn.common}</td></tr>
<tr><td>Asymmetrical method</td><td>${hn.asym}</td><td>${sn.asym}</td></tr>
<tr><td>Symmetrical method</td><td>${hn.sym}</td><td>${sn.sym}</td></tr></tbody></table>`;
      const word = { clearance: "<b class='ok'>Clearance fit: every shaft fits.</b> Even the biggest shaft is smaller than the smallest hole, so the shaft always slides in.", interference: "<b class='bad'>Interference fit: no shaft fits freely.</b> Even the smallest shaft is bigger than the biggest hole, so every pair must be pressed (forced) together.", transition: "<b>Transition fit: it depends on the pair.</b> The zones overlap, so some pairs slide together and some must be pushed." }[kind];
      let p = "";
      if (pair) {
        const c = pair.h - pair.s;
        p = ` <br>From the bin: hole Ø${pair.h.toFixed(3)}, shaft Ø${pair.s.toFixed(3)}. Difference ${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(3)} mm: ${c > 0 ? "the shaft slides in (clearance)." : c < 0 ? "the shaft is bigger than the hole: it must be pressed in (interference)." : "a perfect size-for-size match."}`;
      }
      out.innerHTML = `${word} Largest clearance = largest hole − smallest shaft = ${hMax.toFixed(2)} − ${sMin.toFixed(2)} = <b>${(maxC >= 0 ? "" : "−") + Math.abs(maxC).toFixed(2)}</b>. Smallest clearance = smallest hole − largest shaft = ${hMin.toFixed(2)} − ${sMax.toFixed(2)} = <b>${(minC >= 0 ? "" : "−") + Math.abs(minC).toFixed(2)}</b> (a negative clearance is an interference).${p}`;
    }
    draw();
  });

  /* =====================================================================
     4. The glass box, unfolded in third angle (canvas)
     ===================================================================== */
  mount("w-glassbox", (box) => {
    const M = cannon();
    const Xn = M.nx, Yn = M.ny, Zn = M.nz, g = 2.4;
    const V = { front: viewEdges(viewDef(M, "front")), top: viewEdges(viewDef(M, "top")), left: viewEdges(viewDef(M, "left")) };
    const CL = {
      front: [[[-0.6, 4.5], [12.6, 4.5]], [[7.5, 3.6], [7.5, 5.4]]],
      top: [[[-0.6, 2.5], [12.6, 2.5]], [[7.5, -0.6], [7.5, 5.6]]],
      left: [[[-0.6, 4.5], [5.6, 4.5]], [[2.5, 2.4], [2.5, 6.6]]],
    };
    const faces = voxFaces(M);
    const PL = {
      front: { at: (p, q) => [p, -g, q], pr: [-g, Xn + g], qr: [-g, Zn + g], name: "ELEVATION", lab: [Xn / 2, -g + 0.7] },
      top: { at: (p, q, th) => { const w = q + g; return [p, -g + w * Math.cos(th), Zn + g + w * Math.sin(th)]; }, pr: [-g, Xn + g], qr: [-g, Yn + g], name: "PLAN", lab: [Xn / 2, -g + 0.7] },
      left: { at: (p, q, th) => { const w = Yn - p + g; return [-g - w * Math.sin(th), -g + w * Math.cos(th), q]; }, pr: [-g, Yn + g], qr: [-g, Zn + g], name: "END ELEVATION", lab: [Yn / 2, -g + 0.7] },
    };
    let Tm = 0.32;
    const st = (T) => ({
      plane: clamp(T / 0.1), views: clamp((T - 0.12) / 0.22), projs: clamp((T - 0.1) / 0.06) * clamp((0.48 - T) / 0.06),
      th: ease(clamp((T - 0.46) / 0.3)) * Math.PI / 2, model: 1 - clamp((T - 0.78) / 0.16), camk: ease(clamp((T - 0.74) / 0.24)),
    });
    const camAt = (T) => { const k = st(T).camk; return camera((1 - k) * 0.62, (1 - k) * 0.5); };
    const cv = E("canvas", { class: "sim", role: "img", "aria-label": "" });
    const row = E("div", { class: "btn-row" });
    box.append(row, cv);
    const ctl = controls(box);
    const slider = HG.slider(ctl, { label: "Unfold the glass box", min: 0, max: 100, step: 1, value: Math.round(Tm * 100), unit: "%", fmt: (v) => String(v), oninput: (v) => { Tm = v / 100; sim.pause(); sim.redraw(); say(); } });
    const out = HG.quiet(note(box));
    let fitKey = "", fit = null;
    function computeFit(w, h) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      [0, 0.3, 0.55, 0.65, 0.76, 0.85, 0.95, 1].forEach((T) => {
        const cam = camAt(T), s = st(T);
        const pts = [];
        Object.values(PL).forEach((pl) => [[pl.pr[0], pl.qr[0]], [pl.pr[1], pl.qr[0]], [pl.pr[0], pl.qr[1]], [pl.pr[1], pl.qr[1]]].forEach(([p, q]) => pts.push(pl.at(p, q, s.th))));
        [0, Xn].forEach((x) => [0, Yn].forEach((y) => [0, Zn].forEach((z) => pts.push([x, y, z]))));
        pts.forEach((p) => { const q = proj(p, cam); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      });
      const m = 14, sc = Math.min((w - 2 * m) / (x1 - x0), (h - 2 * m - 26) / (y1 - y0));
      return { sc, ox: (w - (x1 - x0) * sc) / 2 - x0 * sc, oy: m + (h - 2 * m - 26 - (y1 - y0) * sc) / 2 - y0 * sc };
    }
    const sim = HG.sim(cv, {
      height: (w) => clamp(w * 0.8, 300, 560),
      onstate: () => play.sync && play.sync(),
      draw(ctx, t, dt, Cc, S2) {
        if (S2.playing) { Tm = Math.min(1, Tm + dt / 10); slider.sync(Math.round(Tm * 100)); if (Tm >= 1) setTimeout(() => { sim.pause(); say(); }, 0); say(); }
        const key = S2.w + "x" + S2.h;
        if (key !== fitKey) { fitKey = key; fit = computeFit(S2.w, S2.h); }
        const cam = camAt(Tm), s = st(Tm);
        const SP = (p) => { const q = proj(p, cam); return [fit.ox + q[0] * fit.sc, fit.oy + q[1] * fit.sc, q[2]]; };
        // the model
        if (s.model > 0.01) {
          ctx.save(); ctx.globalAlpha = s.model;
          faces.filter((f) => dot(f.n, cam.d) < -1e-6).map((f) => ({ f, d: dot(f.c, cam.d) })).sort((a, b) => b.d - a.d).forEach(({ f }) => {
            ctx.beginPath(); f.pts.forEach((p, i) => { const q = SP(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
            ctx.fillStyle = rgb(f.col, SHADE(f.n)); ctx.fill(); ctx.strokeStyle = "rgba(20,16,12,.55)"; ctx.lineWidth = 0.7; ctx.stroke();
          });
          ctx.restore();
        }
        // projectors from the model to each pane
        if (s.projs > 0.01) {
          ctx.save(); ctx.globalAlpha = s.projs; ctx.strokeStyle = Cc.lode; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          const pts = [[0, 1, 6], [0, 4, 3], [12, 3, 5], [5, 0, 0], [11, 5, 0], [0, 1, 3]];
          pts.forEach((p) => {
            [[p[0], -g, p[2]], [p[0], p[1], Zn + g], [-g, p[1], p[2]]].forEach((q) => { const a = SP(p), b = SP(q); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
          });
          ctx.restore();
        }
        // the three panes and the views drawn on them
        Object.entries(PL).forEach(([name, pl]) => {
          const cs = [[pl.pr[0], pl.qr[0]], [pl.pr[1], pl.qr[0]], [pl.pr[1], pl.qr[1]], [pl.pr[0], pl.qr[1]]].map(([p, q]) => SP(pl.at(p, q, s.th)));
          ctx.save();
          ctx.beginPath(); cs.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
          ctx.globalAlpha = 0.16 * s.plane; ctx.fillStyle = Cc.sky; ctx.fill();
          ctx.globalAlpha = 0.85 * s.plane; ctx.strokeStyle = Cc.navy; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.restore();
          if (s.views > 0.01) {
            const ed = V[name];
            ctx.save(); ctx.globalAlpha = s.views; ctx.strokeStyle = Cc.ink; ctx.lineCap = "butt";
            const seg = (a, b, w, dash) => { const p1 = SP(pl.at(a[0], a[1], s.th)), p2 = SP(pl.at(b[0], b[1], s.th)); ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); };
            const unit = fit.sc;
            ed.hid.forEach((e) => seg([e[0], e[1]], [e[2], e[3]], 1.1, [unit * 0.28, unit * 0.18]));
            CL[name].forEach(([a, b]) => seg(a, b, 0.9, [unit * 0.7, unit * 0.15, unit * 0.1, unit * 0.15]));
            ed.vis.forEach((e) => seg([e[0], e[1]], [e[2], e[3]], 2.2, []));
            ctx.restore();
            const lp = SP(pl.at(pl.lab[0], pl.lab[1], s.th));
            ctx.save(); ctx.globalAlpha = s.views; HG.label(ctx, pl.name, lp[0], lp[1], { size: 12, bold: true, align: "center", col: Cc.ink2 }); ctx.restore();
          }
        });
        // the third-angle symbol once the sheet is flat
        if (s.camk > 0.6) {
          const a = (s.camk - 0.6) / 0.4, x = S2.w - 120, y = S2.h - 26;
          ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = Cc.ink; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 26, y - 5.5); ctx.lineTo(x + 66, y - 11); ctx.lineTo(x + 66, y + 11); ctx.lineTo(x + 26, y + 5.5); ctx.closePath(); ctx.stroke();
          ctx.lineWidth = 0.8; ctx.setLineDash([8, 2, 2, 2]); ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 72, y); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 16); ctx.stroke();
          ctx.restore();
          ctx.save(); ctx.globalAlpha = a; HG.label(ctx, "third-angle symbol", x + 26, y - 22, { size: 11, align: "center", col: Cc.muted }); ctx.restore();
        }
      },
    });
    const play = HG.playButton(sim, ["▶ Play the unfolding", "❚❚ Pause"]);
    play.addEventListener("click", () => { if (sim.playing && Tm >= 1) { Tm = 0; } });
    row.append(play);
    [["① Object", 0.06], ["② Project", 0.4], ["③ Unfold", 0.7], ["④ Flat sheet", 1]].forEach(([n, v]) => {
      const b = E("button", { class: "btn small", type: "button" }, n);
      b.addEventListener("click", () => { sim.pause(); Tm = v; slider.sync(Math.round(v * 100)); sim.redraw(); say(); });
      row.append(b);
    });
    function say() {
      const t = Tm < 0.12 ? "<b>The object in the glass box.</b> In third angle the glass is between you and the object: you look through each pane at the cannon." :
        Tm < 0.46 ? "<b>Project.</b> Each view is traced on the pane in front of it: the elevation on the front pane, the plan on the top pane, the end elevation (from the left) on the left pane. The bore is hidden in the elevation and plan, so it is dashed." :
        Tm < 0.78 ? "<b>Unfold.</b> The top pane hinges up about its front edge to sit above the front pane; the left pane swings round to sit on the left. The front of the cannon stays next to the elevation in both." :
          "<b>Flat sheet: third-angle projection.</b> Plan above the elevation, end elevation viewed from the left drawn on the left. Every view lines up with its neighbour, and the symbol in the corner tells the reader which system you used.";
      out.innerHTML = t;
      cv.setAttribute("aria-label", "A block-built ship's cannon inside a glass box. " + out.textContent);
    }
    say();
  });

  /* =====================================================================
     5. Match the view: interpreting drawings of block models
     ===================================================================== */
  mount("w-views", (box) => {
    const MODELS = [
      ["mast step", voxModel([[0, 3, 0, 2, 0, 0], [0, 1, 0, 2, 1, 2]])],
      ["bollard block", voxModel([[0, 3, 0, 2, 0, 1]], [[1, 2, 0, 2, 1, 1]])],
      ["tunnel block", voxModel([[0, 3, 0, 2, 0, 2]], [[0, 3, 1, 1, 0, 0]])],
      ["stepped cleat", voxModel([[0, 3, 0, 2, 0, 0], [0, 2, 0, 1, 1, 1], [0, 0, 0, 0, 2, 2]])],
      ["hatch coaming", voxModel([[0, 3, 0, 3, 0, 1]], [[1, 2, 1, 2, 0, 1]])],
      ["corner block", voxModel([[0, 2, 0, 2, 0, 2]], [[1, 2, 0, 1, 1, 2]])],
      ["slotted bracket", voxModel([[0, 3, 0, 2, 0, 0], [0, 3, 2, 2, 1, 2]], [[1, 2, 2, 2, 2, 2]])],
      ["notched beam", voxModel([[0, 4, 0, 1, 0, 1]], [[2, 2, 0, 1, 1, 1], [0, 4, 1, 1, 0, 0]])],
    ];
    const TARGET = { top: "plan (view P)", front: "elevation (view E)", left: "end elevation from the left (view L)" };
    const fig = E("div", { class: "st-views-top" });
    const pic = svgBox("0 0 300 240", "");
    fig.append(pic);
    box.append(fig);
    const q = E("p", { class: "st-q", "aria-live": "polite" });
    const grid = E("div", { class: "st-optgrid", role: "group", "aria-label": "Candidate views" });
    const fb = E("p", { class: "sim-note", "aria-live": "polite" });
    const row = E("div", { class: "btn-row" });
    const nb = E("button", { class: "btn small primary", type: "button" }, "New drawing ▶");
    const sc = E("span", { class: "readout" });
    row.append(nb, sc);
    box.append(q, grid, fb, row);
    let right = 0, tries = 0, last = "";
    const cam = camera(0.62, 0.5);
    function drawPic(M) {
      pic.innerHTML = "";
      const fs = voxFaces(M).filter((f) => dot(f.n, cam.d) < -1e-6).sort((a, b) => dot(b.c, cam.d) - dot(a.c, cam.d));
      const pts = [];
      fs.forEach((f) => f.pts.forEach((p) => pts.push(proj(p, cam))));
      const cx = M.nx / 2, cy = M.ny / 2, cz = M.nz / 2;
      const arrows = [["E", [cx, -3.2, cz * 0.9], [cx, -0.25, cz * 0.9]], ["P", [cx, cy, M.nz + 2.8], [cx, cy, M.nz + 0.2]], ["L", [-3.2, cy, cz], [-0.25, cy, cz]]];
      arrows.forEach(([, a, b]) => { pts.push(proj(a, cam)); pts.push(proj(b, cam)); });
      const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
      const s = Math.min(260 / (x1 - x0), 200 / (y1 - y0)), ox = 150 - (x0 + x1) / 2 * s, oy = 120 - (y0 + y1) / 2 * s;
      const sp = (p) => { const q = proj(p, cam); return [ox + q[0] * s, oy + q[1] * s]; };
      fs.forEach((f) => { const d = f.pts.map((p) => sp(p).map((v) => v.toFixed(1)).join(",")).join(" "); const cls = f.n[2] > 0 ? "st-fa" : f.n[1] < 0 ? "st-fb" : "st-fc"; pic.append(S("polygon", { points: d, class: cls })); });
      arrows.forEach(([n, a, b]) => {
        const A = sp(a), B = sp(b), ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
        L(pic, A[0], A[1], B[0], B[1], "st-arrowline"); AH(pic, B[0], B[1], ang, 11, "st-ah-lode");
        T(pic, A[0] - 10 * Math.cos(ang), A[1] - 10 * Math.sin(ang) + 6, n, 17, "middle", "st-lode-t");
      });
    }
    function drawView(ed, label) {
      const sv = svgBox("0 0 150 120", label);
      const s = Math.min(120 / ed.U, 90 / ed.V), ox = 75 - ed.U * s / 2, oy = 60 + ed.V * s / 2;
      ed.hid.forEach((e) => L(sv, ox + e[0] * s, oy - e[1] * s, ox + e[2] * s, oy - e[3] * s, "st-h"));
      ed.vis.forEach((e) => L(sv, ox + e[0] * s, oy - e[1] * s, ox + e[2] * s, oy - e[3] * s, "st-k"));
      return sv;
    }
    const mirrorH = (ed) => ({ U: ed.U, V: ed.V, vis: ed.vis.map((e) => [ed.U - e[2], e[1], ed.U - e[0], e[3]]), hid: ed.hid.map((e) => [ed.U - e[2], e[1], ed.U - e[0], e[3]]) });
    const flipV = (ed) => ({ U: ed.U, V: ed.V, vis: ed.vis.map((e) => [e[0], ed.V - e[3], e[2], ed.V - e[1]]), hid: ed.hid.map((e) => [e[0], ed.V - e[3], e[2], ed.V - e[1]]) });
    const solidHidden = (ed) => (ed.hid.length ? { U: ed.U, V: ed.V, vis: ed.vis.concat(ed.hid), hid: [] } : null);
    const noHidden = (ed) => (ed.hid.length ? { U: ed.U, V: ed.V, vis: ed.vis, hid: [] } : null);
    const missing = (ed) => {
      const inner = ed.vis.filter((e) => !((e[0] === e[2] && (e[0] === 0 || e[0] === ed.U)) || (e[1] === e[3] && (e[1] === 0 || e[1] === ed.V))));
      if (!inner.length) return null;
      const drop = inner[Math.floor(Math.random() * inner.length)];
      return { U: ed.U, V: ed.V, vis: ed.vis.filter((e) => e !== drop), hid: ed.hid };
    };
    function puzzle() {
      let mi, tgt;
      do { mi = Math.floor(Math.random() * MODELS.length); tgt = ["top", "front", "left"][Math.floor(Math.random() * 3)]; } while (mi + tgt === last);
      last = mi + tgt;
      const [name, M] = MODELS[mi];
      drawPic(M);
      pic.setAttribute("aria-label", `An isometric pictorial view of a block-built ${name}, with arrows E (elevation, from the front), P (plan, from above) and L (end elevation, from the left).`);
      const correct = viewEdges(viewDef(M, tgt));
      const cands = [];
      const why = {};
      const add = (ed, reason) => { if (!ed) return; const k = edgeKey(ed); if (k === edgeKey(correct) || cands.some((c) => c.k === k)) return; cands.push({ ed, k, reason }); };
      if (tgt === "top") { add(flipV(correct), "This plan is upside down: it puts the front of the object at the top, as first-angle projection would when the plan sits below the elevation. In third angle the front edge is next to the elevation, at the bottom of the plan."); add(mirrorH(correct), "This is a mirror image: left and right are swapped."); }
      if (tgt === "front") { add(viewEdges(viewDef(M, "back")), "This is the view from behind (a rear elevation)."); add(mirrorH(correct), "This is a mirror image of the elevation."); }
      if (tgt === "left") { add(viewEdges(viewDef(M, "right")), "This is the view from the right. In third angle that view would be drawn on the right of the elevation."); add(flipV(correct), "This is upside down."); }
      add(missing(correct), "A visible edge is missing from this one: every change of surface must be drawn.");
      add(solidHidden(correct), "Here the hidden edges are drawn as solid lines. Edges you cannot see from this direction must be dashed thin.");
      add(noHidden(correct), "The hidden detail is missing: an edge hidden from this direction must still be shown, dashed.");
      add(missing(correct), "A visible edge is missing from this one.");
      add(viewEdges(viewDef(M, tgt === "top" ? "front" : "top")), "This is a different view altogether.");
      const opts = [{ ed: correct, ok: true }].concat(cands.slice(0, 3).map((c) => ({ ed: c.ed, ok: false, reason: c.reason })));
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      q.innerHTML = `Which drawing is the <b>${TARGET[tgt]}</b> of the ${name}${tgt === "top" ? ", as it sits above the elevation in third angle" : ""}?`;
      grid.innerHTML = ""; fb.textContent = "";
      let answered = false;
      opts.forEach((o, i) => {
        const b = E("button", { class: "st-optbtn", type: "button", "aria-label": `Option ${"ABCD"[i]}` });
        b.append(E("span", { class: "st-optlet" }, "ABCD"[i]), drawView(o.ed, `Candidate drawing ${"ABCD"[i]}`));
        b.addEventListener("click", () => {
          if (answered) return; answered = true; tries++; if (o.ok) right++;
          grid.querySelectorAll(".st-optbtn").forEach((x, xi) => { x.setAttribute("aria-disabled", "true"); if (opts[xi].ok) x.classList.add("right"); });
          if (!o.ok) b.classList.add("wrong");
          fb.innerHTML = o.ok ? "<span class='ok'>✔ Correct.</span> Check it edge by edge against the pictorial: every visible edge thick, every hidden edge dashed." : `<span class='bad'>✘ Not this one.</span> ${o.reason} The correct drawing is ${"ABCD"[opts.findIndex((x) => x.ok)]}.`;
          sc.textContent = `${right} of ${tries} right`;
        });
        grid.append(b);
      });
    }
    nb.addEventListener("click", puzzle);
    puzzle();
  });

  /* =====================================================================
     6. Slide the cutting plane through the bush on its deck
     ===================================================================== */
  mount("w-section", (box) => {
    const k = 2, cx = 280, pcy = 140, base = 430;
    const R1 = 50, R2 = 28, rB = 12, pB = 38, rh = 6, H1 = 14, TOP = 60, DX = 72, DY = 58, DT = 16, HR = 10, HH = 21;
    let s = 0, bolts = true;
    const row = E("div", { class: "btn-row" });
    box.append(row);
    const ctl = controls(box);
    const sl = HG.slider(ctl, { label: "Position of cutting plane A–A (from the centre)", min: -45, max: 45, step: 1, value: s, unit: "mm", fmt: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v), oninput: (v) => { s = v; draw(); } });
    [["Through the centre", 0], ["Through a bolt", 3], ["Behind the bore", 20], ["In front of the boss", -36]].forEach(([n, v]) => { const b = E("button", { class: "btn small", type: "button" }, n); b.addEventListener("click", () => sl.set(v)); row.append(b); });
    HG.choice(box, "Bolts:", [[true, "fitted"], [false, "removed"]], bolts, (v) => { bolts = v; draw(); });
    const svg = svgBox("0 0 560 500", "");
    box.append(svg);
    const out = note(box);
    const chord = (r, d) => (Math.abs(d) < r ? Math.sqrt(r * r - d * d) : 0);
    function subtract(ints, a, b) { const o = []; ints.forEach(([x0, x1]) => { if (b <= x0 || a >= x1) o.push([x0, x1]); else { if (a > x0) o.push([x0, a]); if (b < x1) o.push([b, x1]); } }); return o; }
    function draw() {
      svg.innerHTML = "";
      const [hBush, hDeck] = hatchDefs(svg, [[45, 7], [-45, 11]]);
      const g = S("g"); svg.append(g);
      const PX = (x) => cx + x * k, PY = (y) => pcy - y * k, SX = PX, SY = (z) => base - z * k;
      /* ---- plan ---- */
      R(g, PX(-DX), PY(DY), 2 * DX * k, 2 * DY * k, "st-k st-nofill");
      R(g, PX(-DX), PY(s), 2 * DX * k, (s + DY) * k, "st-removed");
      T(g, PX(-DX) + 6, PY(-DY) - 6, "removed: in front of the plane", 12, "start", "st-lode-t");
      [R1, R2, rB].forEach((r) => C(g, PX(0), PY(0), r * k, "st-k st-nofill"));
      [-pB, pB].forEach((x) => { C(g, PX(x), PY(0), (bolts ? HR : rh) * k, "st-k st-nofill"); L(g, PX(x), PY(-HR - 3), PX(x), PY(HR + 3), "st-c"); });
      L(g, PX(-R1 - 6), PY(0), PX(R1 + 6), PY(0), "st-c"); L(g, PX(0), PY(-R1 - 6), PX(0), PY(R1 + 6), "st-c");
      const ex = DX + 8;
      L(g, PX(-ex), PY(s), PX(ex), PY(s), "st-cp"); L(g, PX(-ex), PY(s), PX(-ex + 8), PY(s), "st-k st-thicker st-lode-s"); L(g, PX(ex - 8), PY(s), PX(ex), PY(s), "st-k st-thicker st-lode-s");
      [-ex + 3, ex - 3].forEach((x) => { L(g, PX(x), PY(s), PX(x), PY(s) - 16, "st-n st-lode-s"); AH(g, PX(x), PY(s) - 24, -Math.PI / 2, 9, "st-ah-lode"); T(g, PX(x) + (x < 0 ? -12 : 12), PY(s) - 18, "A", 15, "middle", "st-lode-t"); });
      /* ---- the solid, band by band ---- */
      const holes = (band) => {
        const list = [[0, rB]];
        if (band !== "body") list.push([-pB, rh], [pB, rh]);
        return list;
      };
      const rev = (R) => (s >= R ? { W: 0, cut: [] } : s <= -R ? { W: R, cut: [] } : { W: s < 0 ? R : chord(R, s), cut: [[-chord(R, s), chord(R, s)]] });
      const bands = [
        { name: "deck", z0: -DT, z1: 0, part: "deck", W: DX, cut: [[-DX, DX]] },
        Object.assign({ name: "flange", z0: 0, z1: H1, part: "bush" }, rev(R1)),
        Object.assign({ name: "body", z0: H1, z1: TOP, part: "bush" }, rev(R2)),
      ];
      const gaps = [];
      bands.forEach((b) => {
        holes(b.name).forEach(([xc, rr]) => {
          const ch = chord(rr, s);
          if (ch > 0 && b.cut.length) { b.cut = subtract(b.cut, xc - ch, xc + ch); gaps.push({ band: b, x0: xc - ch, x1: xc + ch, bolt: xc !== 0 }); }
        });
        b.cut.forEach(([x0, x1]) => { const r = R(g, SX(x0), SY(b.z1), (x1 - x0) * k, (b.z1 - b.z0) * k, "st-nostroke"); r.setAttribute("fill", `url(#${b.part === "deck" ? hDeck : hBush})`); });
      });
      // outlines: silhouettes, band boundaries, cut faces
      bands.forEach((b) => { if (b.W > 0) { L(g, SX(-b.W), SY(b.z0), SX(-b.W), SY(b.z1), "st-k"); L(g, SX(b.W), SY(b.z0), SX(b.W), SY(b.z1), "st-k"); } b.cut.forEach(([x0, x1]) => { L(g, SX(x0), SY(b.z0), SX(x0), SY(b.z1), "st-k"); L(g, SX(x1), SY(b.z0), SX(x1), SY(b.z1), "st-k"); }); });
      const hz = (z, Wa, Wb, full) => { const a = Math.min(Wa, Wb), b2 = Math.max(Wa, Wb); if (full) { if (b2 > 0) L(g, SX(-b2), SY(z), SX(b2), SY(z), "st-k"); return; } if (b2 - a > 1e-6) { L(g, SX(-b2), SY(z), SX(-a), SY(z), "st-k"); L(g, SX(a), SY(z), SX(b2), SY(z), "st-k"); } };
      hz(-DT, 0, DX); hz(0, DX, bands[1].W, true); hz(H1, bands[1].W, bands[2].W); hz(TOP, bands[2].W, 0);
      // across a hole that the plane opens up you see the far rim of the hole
      gaps.forEach((gp) => { if (gp.bolt && bolts) return; [gp.band.z0, gp.band.z1].forEach((z) => { if (gp.band.name === "flange" && z === H1 && !gp.bolt && bands[2].cut.length) return; if (gp.band.name === "body" && z === H1) return; L(g, SX(gp.x0), SY(z), SX(gp.x1), SY(z), "st-k"); }); });
      // bolts: never hatched
      let boltNote = "";
      if (bolts) {
        [-pB, pB].forEach((xc) => {
          if (Math.abs(s) < rh) {
            P(g, `M${SX(xc - rh)} ${SY(-DT)} V${SY(H1)} H${SX(xc - HR)} V${SY(HH)} H${SX(xc + HR)} V${SY(H1)} H${SX(xc + rh)} V${SY(-DT)} Z`, "st-k st-card");
            L(g, SX(xc), SY(-DT - 3), SX(xc), SY(HH + 3), "st-c");
          } else if (s < HR) {
            const w = s <= 0 ? HR : chord(HR, s);
            R(g, SX(xc - w), SY(HH), 2 * w * k, (HH - H1) * k, "st-k st-card");
          }
        });
        boltNote = Math.abs(s) < rh ? " The plane runs along both bolts, so they are drawn whole and <b>not hatched</b>: hatching a bolt lengthways would tell the reader nothing." : s < HR ? " The bolt heads stand above the flange behind the plane, so you see them in outline." : " The bolts are in front of the plane, so they were removed with the front half.";
      }
      L(g, SX(0), SY(-DT - 8), SX(0), SY(TOP + 8), "st-c");
      // projectors from the plane in the plan to the section
      const xs = new Set();
      bands.forEach((b) => b.cut.forEach(([x0, x1]) => { xs.add(x0.toFixed(2)); xs.add(x1.toFixed(2)); }));
      xs.forEach((x) => { const xv = +x; if (Math.abs(xv) > DX - 0.5) return; L(g, PX(xv), PY(s), SX(xv), SY(TOP) - 6, "st-proj"); });
      T(g, cx, 488, "SECTION A–A", 16);
      const cutParts = bands.filter((b) => b.cut.length).map((b) => ({ deck: "the deck plank", flange: "the flange", body: "the boss" }[b.name]));
      const bore = Math.abs(s) < rB ? " It passes through the bore, so the bore shows as a gap between two hatched faces, with the far rim of the bore drawn across the gap." : " It misses the bore, which is hidden inside the solid, so the bore is simply not drawn (hidden detail is left out of a section).";
      out.innerHTML = `The plane cuts ${cutParts.length ? cutParts.join(", ").replace(/, ([^,]*)$/, " and $1") : "nothing"}. Bush and deck are different parts, so their hatching runs in <b>different directions</b> (and here at a different spacing).${bore}${boltNote}${s <= -R2 ? " The boss is wholly behind the plane: it is seen, not cut, so it has no hatching." : s >= R2 ? " The boss is wholly in front of the plane, so it went with the removed half." : ""}`;
      svg.setAttribute("aria-label", "Plan of a flanged bush bolted to a deck plank, with cutting plane A–A, and the resulting section A–A below. " + out.textContent);
    }
    draw();
  });

  /* =====================================================================
     7. Explode the sheave assembly (canvas): pictorial or sectional
     ===================================================================== */
  mount("w-explode", (box) => {
    const AF = 30, RC = AF / Math.sqrt(3);
    // each part: list of solids, in part coordinates (z up, axis vertical); assembled offset z0
    const PARTS = [
      { n: 1, name: "Bush", hatch: 45, sol: [{ z0: 0, z1: 12, R: 50, b: 10 }, { z0: 12, z1: 40, R: 26, b: 10 }], at: 0, ex: () => 0 },
      { n: 3, name: "Washer", hatch: 0, sol: [{ z0: 0, z1: 3, R: 18, b: 10 }], at: 40, ex: (e) => 34 * e },
      { n: 2, name: "Sheave", hatch: -45, sol: [{ z0: 0, z1: 6, R: 40, b: 10 }, { z0: 6, z1: 24, R: 30, b: 10 }, { z0: 24, z1: 30, R: 40, b: 10 }], at: 43, ex: (e) => 68 * e },
      { n: 3, name: "Washer", hatch: 0, sol: [{ z0: 0, z1: 3, R: 18, b: 10 }], at: 73, ex: (e) => 102 * e },
      { n: 4, name: "Spindle", hatch: 0, shank: { z0: -96, z1: 0, R: 10 }, sol: [{ z0: 0, z1: 8, R: 16, b: 0 }], at: 76, ex: (e) => 102 * e + 120 * e },
      { n: 5, name: "Nut", hatch: 0, hex: true, sol: [{ z0: 0, z1: 10, R: RC, b: 10 }], at: -10, ex: (e) => -52 * e },
    ];
    let e = 0.6, mode = "iso";
    const row = E("div", { class: "btn-row" });
    box.append(row);
    HG.choice(box, "Drawing:", [["iso", "Exploded pictorial"], ["sec", "Sectional elevation"]], mode, (v) => { mode = v; sim.redraw(); say(); });
    const cv = E("canvas", { class: "sim", role: "img", "aria-label": "" });
    box.append(cv);
    const ctl = controls(box);
    const sl = HG.slider(ctl, { label: "Explode", min: 0, max: 100, step: 1, value: 60, unit: "%", fmt: (v) => String(v), oninput: (v) => { e = v / 100; sim.redraw(); say(); } });
    const out = note(box);
    let target = null;
    const pz = (p) => p.at + p.ex(e);
    const sim = HG.sim(cv, {
      height: (w) => clamp(w * 0.95, 340, 600),
      draw(ctx, t, dt, Cc, S2) {
        if (target !== null && S2.playing) { const d = target - e, step = dt * 0.7; if (Math.abs(d) <= step) { e = target; target = null; setTimeout(() => sim.pause(), 0); } else e += Math.sign(d) * step; sl.sync(Math.round(e * 100)); }
        const zmin = -62, zmax = 84 + 222, sc = Math.min((S2.h - 30) / (zmax - zmin + 60), (S2.w - 150) / 130);
        const cx = S2.w / 2 - 40, Z = (z, sb) => S2.h - 18 - (z - zmin) * sc * sb;
        if (mode === "iso") iso(ctx, Cc, S2, sc, cx, Z); else sec(ctx, Cc, S2, sc, cx, Z);
      },
    });
    function iso(ctx, Cc, S2, sc, cx, Z0) {
      const b = 0.5, sb = Math.sin(b), cb = Math.cos(b), a = 0.62;
      const Y = (z) => Z0(z, cb);
      const items = [];
      PARTS.forEach((p) => p.sol.forEach((s) => items.push({ p, z0: pz(p) + s.z0, z1: pz(p) + s.z1, R: s.R, b: s.b, hex: p.hex })));
      // the spindle's shank shows only where it is not inside another part
      const sp = PARTS[4], sh = { z0: pz(sp) + sp.shank.z0, z1: pz(sp) + sp.shank.z1 };
      let segs = [[sh.z0, sh.z1]];
      PARTS.forEach((p) => { if (p === sp) return; const lo = pz(p) + p.sol[0].z0, hi = pz(p) + p.sol[p.sol.length - 1].z1; segs = subtractI(segs, lo, hi); });
      segs.forEach(([z0, z1]) => { if (z1 - z0 > 0.2) items.push({ p: sp, z0, z1, R: 10, b: 0, shank: true }); });
      items.sort((u, v) => u.z0 - v.z0 || (u.shank ? -1 : 1));
      // centre line first, so the parts hide it
      ctx.save(); ctx.strokeStyle = Cc.ink2; ctx.lineWidth = 0.9; ctx.setLineDash([14, 3, 2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, Y(zmaxOf() + 14)); ctx.lineTo(cx, Y(pz(PARTS[5]) - 30)); ctx.stroke(); ctx.restore();
      items.forEach((it) => {
        const rx = it.R * sc, ry = it.R * sb * sc, yb = Y(it.z0), yt = Y(it.z1);
        const tone = it.p.n === 1 ? [150, 150, 158] : it.p.n === 2 ? [176, 126, 74] : it.p.n === 4 || it.p.n === 5 ? [120, 124, 132] : [196, 170, 92];
        const col = (k) => `rgb(${tone.map((v) => Math.round(v * k)).join(",")})`;
        ctx.save(); ctx.lineWidth = 1.3; ctx.strokeStyle = "#1b1712";
        if (it.hex) {
          const cam = camera(a, b);
          // screen position: the horizontal offset from the camera, the height from the axis
          const P3 = (x, y, z) => { const q = proj([x, y, 0], cam); return [cx + q[0] * sc, Y(z) + q[1] * sc]; };
          const side = [];
          for (let i = 0; i < 6; i++) {
            const t0 = i * Math.PI / 3, t1 = (i + 1) * Math.PI / 3, tm = (t0 + t1) / 2;
            const n = [Math.cos(tm), Math.sin(tm), 0];
            if (dot(n, cam.d) >= 0) continue;
            side.push({ d: dot(n, cam.d), pts: [P3(it.R * Math.cos(t0), it.R * Math.sin(t0), it.z0), P3(it.R * Math.cos(t1), it.R * Math.sin(t1), it.z0), P3(it.R * Math.cos(t1), it.R * Math.sin(t1), it.z1), P3(it.R * Math.cos(t0), it.R * Math.sin(t0), it.z1)], k: 0.62 + 0.3 * Math.abs(n[0]) });
          }
          side.sort((u, v) => v.d - u.d).forEach((f) => { ctx.beginPath(); f.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fillStyle = col(f.k); ctx.fill(); ctx.stroke(); });
          ctx.beginPath(); for (let i = 0; i < 6; i++) { const th = i * Math.PI / 3, q = P3(it.R * Math.cos(th), it.R * Math.sin(th), it.z1); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.closePath(); ctx.fillStyle = col(1); ctx.fill(); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(cx - rx, yt); ctx.lineTo(cx - rx, yb); ctx.ellipse(cx, yb, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, yt); ctx.closePath();
          ctx.fillStyle = col(0.72); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(cx, yt, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = col(1); ctx.fill(); ctx.stroke();
        }
        if (it.b) { ctx.beginPath(); ctx.ellipse(cx, yt, it.b * sc, it.b * sb * sc, 0, 0, Math.PI * 2); ctx.fillStyle = "#2a2430"; ctx.fill(); }
        ctx.restore();
      });
      // balloons with leaders (a leader ending on a surface ends in a dot)
      const bx = cx + 90 * sc + 40;
      let lastY = -1e9;
      const labs = [0, 1, 2, 3, 4, 5].map((i) => { const p = PARTS[i]; const zm = pz(p) + (p.sol[0].z0 + p.sol[p.sol.length - 1].z1) / 2; return { p, y: Y(zm), x: cx + p.sol[p.sol.length - 1].R * sc * 0.92 }; }).sort((u, v) => u.y - v.y);
      labs.forEach((l) => { l.by = Math.max(l.y, lastY + 28); lastY = l.by; });
      labs.forEach((l) => {
        ctx.save(); ctx.strokeStyle = Cc.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(bx - 12, l.by); ctx.stroke();
        ctx.fillStyle = Cc.ink; ctx.beginPath(); ctx.arc(l.x, l.y, 2.5, 0, 7); ctx.fill();
        ctx.fillStyle = Cc.card; ctx.beginPath(); ctx.arc(bx, l.by, 12, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
        HG.label(ctx, String(l.p.n), bx, l.by, { size: 13, bold: true, align: "center", halo: false });
      });
    }
    function zmaxOf() { return pz(PARTS[4]) + 8; }
    function subtractI(ints, a, b) { const o = []; ints.forEach(([x0, x1]) => { if (b <= x0 || a >= x1) o.push([x0, x1]); else { if (a > x0) o.push([x0, a]); if (b < x1) o.push([b, x1]); } }); return o; }
    function sec(ctx, Cc, S2, sc, cx, Z0) {
      const Y = (z) => Z0(z, 1);
      const X = (x) => cx + x * sc;
      ctx.save(); ctx.strokeStyle = Cc.ink2; ctx.lineWidth = 0.9; ctx.setLineDash([14, 3, 2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, Y(zmaxOf() + 12)); ctx.lineTo(cx, Y(pz(PARTS[5]) - 30)); ctx.stroke(); ctx.restore();
      const hatch = (x0, x1, z0, z1, ang, gap) => {
        ctx.save(); ctx.beginPath(); ctx.rect(X(x0), Y(z1), (x1 - x0) * sc, (z1 - z0) * sc); ctx.clip();
        ctx.strokeStyle = Cc.ink; ctx.lineWidth = 0.8; ctx.beginPath();
        const w = (x1 - x0) * sc, h = (z1 - z0) * sc, L0 = X(x0), T0 = Y(z1);
        for (let d = -h; d < w + h; d += gap) { if (ang > 0) { ctx.moveTo(L0 + d, T0 + h); ctx.lineTo(L0 + d + h, T0); } else { ctx.moveTo(L0 + d, T0); ctx.lineTo(L0 + d + h, T0 + h); } }
        ctx.stroke(); ctx.restore();
      };
      const box2 = (x0, x1, z0, z1, w = 2) => { ctx.save(); ctx.strokeStyle = Cc.ink; ctx.lineWidth = w; ctx.strokeRect(X(x0), Y(z1), (x1 - x0) * sc, (z1 - z0) * sc); ctx.restore(); };
      const line = (x0, z0, x1, z1, w = 2) => { ctx.save(); ctx.strokeStyle = Cc.ink; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(X(x0), Y(z0)); ctx.lineTo(X(x1), Y(z1)); ctx.stroke(); ctx.restore(); };
      const gap = Math.max(5, 7 * sc);
      PARTS.forEach((p) => {
        const z = pz(p);
        if (p.hatch) {
          p.sol.forEach((s) => { hatch(-s.R, -s.b, z + s.z0, z + s.z1, p.hatch, gap); hatch(s.b, s.R, z + s.z0, z + s.z1, p.hatch, gap); });
          // outline of the cut faces: outer profile, bore edges, and the far rim across the bore at each end
          const zb = z + p.sol[0].z0, zt = z + p.sol[p.sol.length - 1].z1, bb = p.sol[0].b;
          p.sol.forEach((s, i) => {
            line(-s.R, z + s.z0, -s.R, z + s.z1); line(s.R, z + s.z0, s.R, z + s.z1);
            const below = i ? p.sol[i - 1].R : 0;
            if (Math.abs(below - s.R) > 0.01) { line(-Math.max(below, s.R), z + s.z0, -Math.min(below, s.R) || -bb, z + s.z0); line(Math.min(below, s.R) || bb, z + s.z0, Math.max(below, s.R), z + s.z0); }
          });
          const lastR = p.sol[p.sol.length - 1].R; line(-lastR, zt, lastR, zt); line(-p.sol[0].R, zb, p.sol[0].R, zb);
          line(-bb, zb, -bb, zt); line(bb, zb, bb, zt);
        } else if (p.hex) {
          const s = p.sol[0]; box2(-s.R, s.R, z + s.z0, z + s.z1); line(-s.R / 2, z + s.z0, -s.R / 2, z + s.z1, 1.4); line(s.R / 2, z + s.z0, s.R / 2, z + s.z1, 1.4);
        } else if (p.shank) {
          const s = p.sol[0], sh = p.shank;
          box2(-s.R, s.R, z + s.z0, z + s.z1); box2(-sh.R, sh.R, z + sh.z0, z + sh.z1);
          // external thread at the bottom of the spindle: minor diameter thin, thread end thick
          line(-8.4, z + sh.z0, -8.4, z + sh.z0 + 30, 0.9); line(8.4, z + sh.z0, 8.4, z + sh.z0 + 30, 0.9); line(-sh.R, z + sh.z0 + 30, sh.R, z + sh.z0 + 30, 2);
        } else { const s = p.sol[0]; box2(-s.R, s.R, z + s.z0, z + s.z1); line(-s.b, z + s.z0, -s.b, z + s.z1, 1.2); line(s.b, z + s.z0, s.b, z + s.z1, 1.2); }
      });
      // the spindle sits in front of everything it passes through: redraw it over the bores
      const p = PARTS[4], z = pz(p), sh = p.shank;
      ctx.save(); ctx.fillStyle = Cc.card; ctx.fillRect(X(-sh.R), Y(z + sh.z1), 2 * sh.R * sc, (sh.z1 - sh.z0) * sc); ctx.restore();
      box2(-sh.R, sh.R, z + sh.z0, z + sh.z1); line(-8.4, z + sh.z0, -8.4, z + sh.z0 + 30, 0.9); line(8.4, z + sh.z0, 8.4, z + sh.z0 + 30, 0.9); line(-sh.R, z + sh.z0 + 30, sh.R, z + sh.z0 + 30, 2);
      const s0 = p.sol[0]; ctx.save(); ctx.fillStyle = Cc.card; ctx.fillRect(X(-s0.R), Y(z + s0.z1), 2 * s0.R * sc, (s0.z1 - s0.z0) * sc); ctx.restore(); box2(-s0.R, s0.R, z + s0.z0, z + s0.z1);
      // nut also over the shank where they overlap
      const nut = PARTS[5], zn = pz(nut), ns = nut.sol[0];
      ctx.save(); ctx.fillStyle = Cc.card; ctx.fillRect(X(-ns.R), Y(zn + ns.z1), 2 * ns.R * sc, (ns.z1 - ns.z0) * sc); ctx.restore();
      box2(-ns.R, ns.R, zn + ns.z0, zn + ns.z1); line(-ns.R / 2, zn + ns.z0, -ns.R / 2, zn + ns.z1, 1.4); line(ns.R / 2, zn + ns.z0, ns.R / 2, zn + ns.z1, 1.4);
      PARTS.forEach((q) => { const zm = pz(q) + (q.sol[0].z0 + q.sol[q.sol.length - 1].z1) / 2; HG.label(ctx, String(q.n), X(q.sol[0].R) + 26, Y(zm), { size: 13, bold: true, col: Cc.lode }); });
      HG.label(ctx, e < 0.02 ? "SECTIONED ASSEMBLY" : "EXPLODED SECTIONAL ELEVATION", cx, S2.h - 8, { size: 12, bold: true, align: "center", col: Cc.ink2 });
    }
    const add = (n, v) => { const b = E("button", { class: "btn small", type: "button" }, n); b.addEventListener("click", () => { if (HG.reduced) { e = v; sl.sync(Math.round(v * 100)); sim.redraw(); say(); return; } target = v; sim.play(); }); row.append(b); };
    add("Assemble", 0); add("Explode", 1);
    function say() {
      out.innerHTML = mode === "iso"
        ? `Exploded ${Math.round(e * 100)}%. Every part slides along the <b>one centre line</b> it shares with its neighbours, and keeps its assembly order: nut (5) below the bush (1); then washer (3), sheave (2), washer (3) and the spindle (4) above. The item numbers in the balloons match the parts list.`
        : `Sectional elevation, exploded ${Math.round(e * 100)}%. The bush and the sheave are cut and hatched in <b>opposite directions</b>, because they are different parts. The spindle, the nut and the washers lie on the cutting plane lengthways, so by convention they are <b>not hatched</b>.`;
      cv.setAttribute("aria-label", "A sheave assembly of five items: bush, sheave, two washers, spindle and nut. " + out.textContent);
    }
    say();
  });

  /* =====================================================================
     8. Scales: what size on the sheet, and will it fit?
     ===================================================================== */
  mount("w-scale", (box) => {
    const OBJ = [["Brass toggle pin for a signal flag", 24], ["Ship's block (pulley)", 180], ["Gun carriage", 1600], ["Plan Room floor", 9600], ["HMS Vellum's gun deck", 52000], ["Your own length", 500]];
    const SCALES = [[5, 1], [2, 1], [1, 1], [1, 2], [1, 5], [1, 10], [1, 20], [1, 50], [1, 100], [1, 200], [1, 500], [1, 1250]];
    let real = 1600, sc = [1, 10];
    const row = E("div", { class: "btn-row st-scale-row" });
    const objSel = E("select", { "aria-label": "Object" }); OBJ.forEach(([n, v], i) => objSel.append(E("option", { value: i }, `${n} (${v >= 1000 ? v / 1000 + " m" : v + " mm"})`)));
    objSel.value = 2;
    const scSel = E("select", { "aria-label": "Scale" }); SCALES.forEach(([a, b], i) => scSel.append(E("option", { value: i }, `${a}:${b}${a > b ? " (enlargement)" : a === b ? " (full size)" : " (reduction)"}`)));
    scSel.value = 5;
    const realIn = E("input", { type: "number", min: 1, max: 1000000, step: 1, value: real, "aria-label": "Real length in millimetres" });
    row.append(E("label", null, "Object ", objSel), E("label", null, "Real length (mm) ", realIn), E("label", null, "Scale ", scSel));
    box.append(row);
    const svg = svgBox("0 0 560 300", "");
    box.append(svg);
    const out = note(box);
    const row2 = E("div", { class: "btn-row" });
    const measIn = E("input", { type: "number", min: 0, max: 1000, step: 0.5, value: 40, "aria-label": "Length measured on the drawing in millimetres" });
    const measOut = E("span", { class: "readout", "aria-live": "polite" });
    row2.append(E("label", null, "Measured on the drawing (mm) ", measIn), measOut);
    box.append(row2);
    objSel.addEventListener("change", () => { const v = OBJ[+objSel.value][1]; real = v; realIn.value = v; draw(); });
    scSel.addEventListener("change", () => { sc = SCALES[+scSel.value]; draw(); });
    realIn.addEventListener("input", () => { const v = +realIn.value; if (v > 0) { real = v; draw(); } });
    measIn.addEventListener("input", draw);
    const fmtLen = (mm) => (mm >= 1000 ? `${+(mm / 1000).toFixed(3)} m` : `${+mm.toFixed(2)} mm`);
    function nice(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
    function draw() {
      const [a, b] = sc, drawn = real * a / b;
      svg.innerHTML = "";
      const g = S("g"); svg.append(g);
      // an A3 landscape sheet, 420 mm wide, drawn 400 px wide
      const k = 400 / 420, sx = 20, sy = 20;
      R(g, sx, sy, 420 * k, 297 * k * 0.55, "st-sheet");
      T(g, sx + 6, sy + 18, "A3 sheet, landscape: 420 mm wide", 13, "start", "muted");
      const fits = drawn <= 400;
      const len = Math.min(drawn, 520 / k) * k;
      R(g, sx + 10, sy + 50, Math.max(1.5, len), 26, fits ? "st-objbar" : "st-objbar st-over");
      T(g, sx + 14, sy + 100, `drawn length ${fmtLen(drawn)}`, 15, "start");
      if (!fits) T(g, 548, sy + 68, "off the sheet", 13, "end", "st-red");
      // scale bar: a round real length drawn about 100 mm long
      const realBar = nice(100 * b / a), drawnBar = realBar * a / b, px = drawnBar * k, y = 250;
      for (let i = 0; i < 5; i++) R(g, sx + 10 + i * px / 5, y, px / 5, 8, i % 2 ? "st-sheet" : "st-barfill");
      for (let i = 0; i <= 5; i++) { const x = sx + 10 + i * px / 5; L(g, x, y, x, y + 14, "st-n"); }
      T(g, sx + 10, y + 30, "0", 13); T(g, sx + 10 + px, y + 30, fmtLen(realBar), 13);
      T(g, sx + 10 + px / 2, y - 8, `scale bar for ${a}:${b} (real sizes)`, 13, "middle", "muted");
      const m = +measIn.value || 0;
      measOut.textContent = `→ real length = ${m} × ${b}/${a} = ${fmtLen(m * b / a)}`;
      svg.setAttribute("aria-label", `At ${a}:${b}, a real length of ${fmtLen(real)} is drawn ${fmtLen(drawn)} long, which ${fits ? "fits" : "does not fit"} across an A3 sheet.`);
      out.innerHTML = `<b>${a}:${b}</b> means ${a} mm on the drawing stands for ${b} mm on the real object. Drawn size = real size × ${a} ÷ ${b} = ${fmtLen(real)} × ${a}/${b} = <b>${fmtLen(drawn)}</b>. ${fits ? "It fits across an A3 sheet." : "Too long for A3: choose a smaller scale (a bigger second number)."} The dimensions written on the drawing still give the <b>real</b> size, ${fmtLen(real)}.`;
    }
    draw();
  });

  /* =====================================================================
     9. BSI building symbols, drawn from the course specification's Appendix 2
     ===================================================================== */
  const SYM = (function () {
    const k = "st-sk", n = "st-sn";
    const line = (x1, y1, x2, y2, c = k) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${c}"/>`;
    const rect = (x, y, w, h, c = k) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${c}"/>`;
    const circ = (x, y, r, c = k) => `<circle cx="${x}" cy="${y}" r="${r}" class="${c}"/>`;
    const path = (d, c = k) => `<path d="${d}" class="${c}"/>`;
    const dotf = (x, y, r = 1.8) => `<circle cx="${x}" cy="${y}" r="${r}" class="st-sdot"/>`;
    const arr = (x1, x2, y) => { const d = Math.sign(x2 - x1); return line(x1, y, x2, y) + path(`M${x2 - 4 * d} ${y - 3.5} L${x2} ${y} L${x2 - 4 * d} ${y + 3.5}`); };
    let conc = "";
    [[12, 23], [19, 33], [27, 26], [35, 36], [43, 24], [48, 34], [22, 38], [40, 30], [15, 31], [31, 22]].forEach(([x, y], i) => { conc += i % 3 === 0 ? path(`M${x} ${y + 2.5} L${x + 2.5} ${y - 2} L${x + 5} ${y + 2.5} Z`, "st-sn") : dotf(x, y, 1.3); });
    return [
      ["lamp", "Lamp", "electrical", circ(30, 30, 11) + line(22.2, 22.2, 37.8, 37.8) + line(37.8, 22.2, 22.2, 37.8), "A circle with a diagonal cross in it."],
      ["switch", "Switch", "electrical", circ(27, 37, 4.5) + line(29.5, 33.3, 35, 23), "A small circle with a short line leaning away from it."],
      ["socket", "Socket", "electrical", path("M38 21 A9 9 0 0 0 38 39") + line(21, 30, 29, 30), "A half circle (open to the right) with a short stem on the left."],
      ["radiator", "Radiator", "heating", line(6, 30, 54, 30, n) + rect(16, 27, 28, 6, "st-sfill"), "A thick solid bar on a thin line."],
      ["towel", "Heated towel rail", "heating", circ(15, 33, 5) + circ(45, 33, 5) + line(20, 30, 40, 30) + line(20, 36, 40, 36) + line(15, 21, 15, 28) + line(45, 21, 45, 28), "Two small circles joined by a double-line bar, each with a short stub on top."],
      ["shower", "Shower tray", "sanitary", rect(13, 13, 34, 34) + circ(43, 17, 1.8), "A square with a small circle (the waste) in one corner."],
      ["bath", "Bath", "sanitary", rect(4, 17, 52, 26) + rect(8, 21, 44, 18) + circ(48, 30, 1.8), "A rectangle inside a rectangle, with the waste near one end."],
      ["basin", "Wash basin", "sanitary", rect(17, 17, 26, 24) + rect(21, 21, 18, 15) + circ(30, 25, 1.8), "A small square inside a square, waste at the top of the inner one."],
      ["sink", "Sink", "sanitary", rect(13, 22, 34, 20) + circ(30, 26, 2.2), "A single rectangle with the waste near the top edge."],
      ["wc", "WC", "sanitary", rect(23, 12, 14, 36) + line(23, 20, 37, 20), "A tall narrow rectangle with a line across near the top (the cistern)."],
      ["sinktop", "Sinktop", "sanitary", rect(5, 18, 50, 24) + [22, 27, 33, 39].map((y) => line(9, y, 30, y)).join("") + rect(33, 22, 19, 16) + circ(48, 30, 1.8), "A rectangle with drainer lines on one side and a sink (rectangle and waste) on the other."],
      ["concrete", "Concrete", "material", line(8, 18, 52, 18, n) + line(8, 42, 52, 42, n) + conc, "Dots and small triangles (the aggregate) between two lines."],
      ["brick", "Brickwork", "material", line(18, 20, 52, 20, n) + line(8, 40, 44, 40, n) + [0, 1, 2, 3].map((i) => line(8 + 9 * i, 40, 28 + 9 * i, 20, n)).join(""), "Parallel diagonal lines (45°) between two lines."],
      ["wood", "Wood sawn, any type", "material", rect(14, 22, 32, 16, n) + line(14, 22, 46, 38, n) + line(14, 38, 46, 22, n), "A rectangle with both diagonals drawn: a cross through the section."],
      ["insulation", "Insulation board", "material", line(6, 20, 54, 20, n) + line(6, 40, 54, 40, n) + path("M8 22 C12 22 12 38 18 38 C24 38 24 22 30 22 C36 22 36 38 42 38 C48 38 48 22 52 22", n), "A wavy line looping between two lines."],
      ["block", "Block work", "material", line(6, 20, 54, 20, n) + line(6, 40, 54, 40, n) + line(8, 18, 31, 42, n) + line(8, 42, 31, 18, n) + line(29, 18, 52, 42, n) + line(29, 42, 52, 18, n), "Large crosses (two X shapes) between two lines."],
      ["door", "Door", "opening", line(20, 48, 20, 16) + path("M20 16 A32 32 0 0 1 52 48", n), "A straight line (the door leaf) with a quarter-circle arc showing its swing."],
      ["fixed", "Fixed window", "opening", rect(16, 16, 28, 28) + `<text x="30" y="35.5" text-anchor="middle" font-size="14" class="ink st-symtext">F</text>`, "A square marked F."],
      ["wside", "Window — hinged at side", "opening", rect(16, 16, 28, 28) + line(44, 16, 16, 30, n) + line(16, 30, 44, 44, n), "Two lines meet at the middle of one side: the point marks the hinged side."],
      ["wtop", "Window — hinged at top", "opening", rect(16, 16, 28, 28) + line(16, 44, 30, 16, n) + line(30, 16, 44, 44, n), "The two lines meet at the middle of the top: hinged at the top."],
      ["wbottom", "Window — hinged at bottom", "opening", rect(16, 16, 28, 28) + line(16, 16, 30, 44, n) + line(30, 44, 44, 16, n), "The two lines meet at the middle of the bottom: hinged at the bottom."],
      ["wpivot", "Window — pivoted, horizontal axis", "opening", rect(16, 16, 28, 28) + path("M30 16 L44 30 L30 44 L16 30 Z", n) + line(8, 30, 52, 30, n), "A diamond in a square, with a horizontal line (the pivot axis) running through and past both sides."],
      ["wslide", "Window — sliding horizontally", "opening", rect(15, 14, 30, 32) + line(30, 14, 30, 46) + arr(18, 28, 30) + arr(42, 32, 30), "Two panes, with arrows pointing towards the centre line between them."],
      ["drain", "Drainage", "site", rect(16, 16, 28, 28) + circ(30, 28.5, 8.5) + line(8, 28.5, 52, 28.5, "st-sn st-sdotline") + line(30, 28.5, 30, 52, "st-sn st-sdotline"), "A square containing a circle, with dotted lines running out from it."],
      ["north", "North point", "site", circ(30, 30, 13) + line(30, 43, 30, 17) + line(30, 17, 18.7, 23.5) + line(30, 17, 41.3, 23.5), "A circle with an upward arrow: the arrow points north."],
      ["tree", "Existing tree", "site", circ(30, 31, 12) + dotf(24, 25, 1.8), "A circle with a dot near its top-left."],
      ["treeout", "Existing tree — to be removed", "site", circ(30, 31, 12, "st-sk st-sdotted") + dotf(35, 26, 1.8), "A dotted circle with a dot inside."],
      ["treenew", "Proposed tree", "site", circ(30, 30, 12) + line(30, 22, 30, 38) + line(22, 30, 38, 30), "A circle with a plus sign in it."],
      ["contours", "Contours", "site", path("M24 12 C30 26 40 26 54 31", n) + path("M22 26 C26 38 34 35 54 37", n) + path("M20 44 C26 52 40 46 54 47", n) + `<text x="18" y="14" font-size="9" text-anchor="end" class="ink st-symtext">20</text><text x="18" y="29" font-size="9" text-anchor="end" class="ink st-symtext">15</text><text x="16" y="47" font-size="9" text-anchor="end" class="ink st-symtext">10</text>`, "Lines joining points of equal height, each marked with its height."],
    ];
  })();
  HG.stSymbols = SYM;
  const symSvg = (s, size) => { const e = S("svg", { viewBox: "0 0 60 60", class: "st-sym", role: "img", "aria-label": s[1] + " symbol", width: size, height: size }); e.innerHTML = s[3]; return e; };

  mount("w-symbols", (box) => {
    let mode = "name", cur = null, answered = false, right = 0, tries = 0, lastI = -1;
    HG.choice(box, "Mode:", [["name", "Name the symbol"], ["draw", "Draw it from memory"]], mode, (v) => { mode = v; next(); });
    const stage = E("div", { class: "st-symstage" });
    const q = E("p", { class: "st-q", "aria-live": "polite" });
    const opts = E("div", { class: "st-opts", role: "group", "aria-label": "Symbol names" });
    const fb = E("p", { class: "sim-note", "aria-live": "polite" });
    const row = E("div", { class: "btn-row" });
    const nb = E("button", { class: "btn small primary", type: "button" }, "Next symbol ▶");
    const sc = E("span", { class: "readout" });
    row.append(nb, sc);
    box.append(q, stage, opts, fb, row);
    function next() {
      let i; do { i = Math.floor(Math.random() * SYM.length); } while (i === lastI);
      lastI = i; cur = SYM[i]; answered = false; fb.textContent = ""; opts.innerHTML = ""; stage.innerHTML = "";
      if (mode === "name") {
        stage.append(symSvg(cur, 150));
        q.textContent = "Which BSI building symbol is this?";
        const same = SYM.filter((s) => s !== cur && s[2] === cur[2]).sort(() => Math.random() - 0.5).slice(0, 2);
        const other = SYM.filter((s) => s !== cur && !same.includes(s)).sort(() => Math.random() - 0.5).slice(0, 4 - same.length - 1);
        const list = [cur, ...same, ...other].sort(() => Math.random() - 0.5);
        list.forEach((s) => {
          const b = E("button", { class: "seg-btn", type: "button" }, s[1]);
          b.addEventListener("click", () => {
            if (answered) return; answered = true; tries++;
            const ok = s === cur; if (ok) right++;
            opts.querySelectorAll("button").forEach((x) => { x.setAttribute("aria-disabled", "true"); if (x.textContent === cur[1]) x.classList.add("st-right"); });
            if (!ok) b.classList.add("st-wrong");
            fb.innerHTML = (ok ? "<span class='ok'>✔ Yes: " : "<span class='bad'>✘ No: this is ") + cur[1] + ".</span> " + cur[4];
            sc.textContent = `${right} of ${tries} named`;
          });
          opts.append(b);
        });
      } else {
        q.innerHTML = `Sketch the symbol for <b>${cur[1]}</b> on scrap paper, then reveal it and compare.`;
        const rv = E("button", { class: "btn small", type: "button" }, "Reveal the symbol");
        rv.addEventListener("click", () => { stage.innerHTML = ""; stage.append(symSvg(cur, 150)); fb.textContent = cur[4]; rv.disabled = true; });
        opts.append(rv);
      }
    }
    nb.addEventListener("click", next);
    next();
  });
})();
